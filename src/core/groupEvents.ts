import crypto from 'node:crypto';
import { fingerprint, publicKeyFromRaw, type Identity } from 'termcore/net/identity';
import { cleanName, MAX_TEXT, sanitizeText } from 'termcore/app/sanitize';

export const MAX_MEMBERS = 32;
export const EVENT_ID_RE = /^[A-Za-z0-9_-]{32}$/;
const PEER_ID_RE = /^[A-Z2-7]{20}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const MAX_SEQ = 2 ** 40;

export type GroupEventKind = 'create' | 'invite' | 'join' | 'decline' | 'leave' | 'kick' | 'rename' | 'msg';
const KINDS: GroupEventKind[] = ['create', 'invite', 'join', 'decline', 'leave', 'kick', 'rename', 'msg'];

/**
 * One signed entry in a group's log. Groups are nothing but the set of their events:
 * members, name and messages are derived from it, so everyone with the same set sees
 * the same group – no matter in which order or via whom the events arrived.
 */
export interface GroupEvent {
  v: 1;
  /** id of the group's `create` event (empty in the create event's own payload) */
  gid: string;
  /** hash of the signed payload – content-addressed, so it can't be forged or collide */
  id: string;
  author: string;
  authorPub: string;
  /** Lamport counter: max seq seen in the group + 1 → causal order despite clock skew */
  seq: number;
  /** display only */
  ts: number;
  kind: GroupEventKind;
  data: Record<string, string>;
  sig: string;
}

type Unsigned = Omit<GroupEvent, 'id' | 'sig' | 'gid'> & { gid: string };

/** Deterministic serialization of everything that is signed. */
function payload(e: Unsigned): Buffer {
  const data = Object.keys(e.data)
    .sort()
    .map((k) => [k, e.data[k]]);
  const gid = e.kind === 'create' ? '' : e.gid;
  return Buffer.from(JSON.stringify(['termchat/group/1', gid, e.author, e.authorPub, e.seq, e.ts, e.kind, data]));
}

function eventId(p: Buffer): string {
  return crypto.createHash('sha256').update(p).digest('base64url').slice(0, 32);
}

export function signEvent(
  me: Identity,
  fields: { gid: string; seq: number; kind: GroupEventKind; data: Record<string, string>; ts?: number },
): GroupEvent {
  const unsigned: Unsigned = {
    v: 1,
    gid: fields.gid,
    author: me.id,
    authorPub: me.publicRaw.toString('base64url'),
    seq: fields.seq,
    ts: fields.ts ?? Date.now(),
    kind: fields.kind,
    data: fields.data,
  };
  const p = payload(unsigned);
  const id = eventId(p);
  const sig = crypto.sign(null, p, me.privateKey).toString('base64url');
  return { ...unsigned, gid: fields.kind === 'create' ? id : fields.gid, id, sig };
}

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Checks shape and limits of an untrusted event. Does not check the signature. */
export function parseEvent(raw: unknown): GroupEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !KINDS.includes(o.kind as GroupEventKind)) return null;
  if (!str(o.gid, 32) || !EVENT_ID_RE.test(o.gid) || !str(o.id, 32) || !EVENT_ID_RE.test(o.id)) return null;
  if (!str(o.author, 20) || !PEER_ID_RE.test(o.author)) return null;
  if (!str(o.authorPub, 43) || !B64URL_RE.test(o.authorPub)) return null;
  if (!str(o.sig, 86) || !B64URL_RE.test(o.sig)) return null;
  if (!Number.isInteger(o.seq) || (o.seq as number) < 1 || (o.seq as number) > MAX_SEQ) return null;
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return null;
  if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) return null;

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.data as Record<string, unknown>)) {
    if (!str(v, MAX_TEXT)) return null;
    data[k] = v;
  }
  const kind = o.kind as GroupEventKind;
  const has = (...keys: string[]) => keys.every((k) => typeof data[k] === 'string');
  const ok =
    (kind === 'create' && has('name', 'creatorName')) ||
    (kind === 'invite' && has('member', 'pub', 'name')) ||
    (kind === 'kick' && has('member')) ||
    (kind === 'rename' && has('name')) ||
    (kind === 'msg' && has('text')) ||
    kind === 'join' ||
    kind === 'decline' ||
    kind === 'leave';
  if (!ok || Object.keys(data).length > 4) return null;

  return {
    v: 1,
    gid: o.gid,
    id: o.id,
    author: o.author,
    authorPub: o.authorPub,
    seq: o.seq as number,
    ts: o.ts,
    kind,
    data,
    sig: o.sig,
  };
}

/** Is this event really written by its author, and is its id honest? */
export function verifyEvent(e: GroupEvent): boolean {
  const pub = Buffer.from(e.authorPub, 'base64url');
  if (pub.length !== 32 || fingerprint(pub) !== e.author) return false;
  const p = payload(e);
  if (eventId(p) !== e.id) return false;
  if (e.kind === 'create' ? e.gid !== e.id : e.gid === e.id) return false;
  try {
    return crypto.verify(null, p, publicKeyFromRaw(pub), Buffer.from(e.sig, 'base64url'));
  } catch {
    return false;
  }
}

// ───────────── Derived state ─────────────

export type MemberStatus = 'member' | 'invited';

export interface GroupMember {
  id: string;
  pub: string;
  name: string;
  status: MemberStatus;
  /** seq of the invite that brought them in – they only see messages after it */
  inviteSeq: number;
  invitedBy?: string;
}

export type TimelineItem =
  | { type: 'msg'; ev: GroupEvent; text: string }
  | { type: 'system'; ev: GroupEvent; action: 'create' | 'invite' | 'join' | 'decline' | 'leave' | 'kick' | 'rename'; target?: string; value?: string };

export interface GroupState {
  gid: string;
  name: string;
  creator: string;
  createdAt: number;
  members: Map<string, GroupMember>;
  /** last known name per peer id (also for people who left) */
  names: Map<string, string>;
  timeline: TimelineItem[];
  maxSeq: number;
  /** ids of all events that were applied (= allowed at their position) */
  applied: Set<string>;
}

const order = (a: GroupEvent, b: GroupEvent) => a.seq - b.seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Replays all (already verified) events in (seq, id) order. Events that aren't
 * allowed at their position are skipped – but stay in the set, so every member
 * keeps the same events and reaches the same result.
 */
export function deriveGroup(gid: string, events: Iterable<GroupEvent>): GroupState | null {
  const sorted = [...events].filter((e) => e.gid === gid).sort(order);
  const create = sorted.find((e) => e.kind === 'create' && e.id === gid);
  if (!create) return null;

  const state: GroupState = {
    gid,
    name: cleanName(create.data.name),
    creator: create.author,
    createdAt: create.ts,
    members: new Map(),
    names: new Map(),
    timeline: [],
    maxSeq: 0,
    applied: new Set(),
  };
  for (const e of sorted) state.maxSeq = Math.max(state.maxSeq, e.seq);

  const status = (id: string) => state.members.get(id)?.status;
  const system = (e: GroupEvent, action: Extract<TimelineItem, { type: 'system' }>['action'], target?: string, value?: string) =>
    state.timeline.push({ type: 'system', ev: e, action, target, value });

  for (const e of sorted) {
    if (e === create) {
      const name = cleanName(e.data.creatorName);
      state.members.set(e.author, { id: e.author, pub: e.authorPub, name, status: 'member', inviteSeq: 0 });
      state.names.set(e.author, name);
      state.applied.add(e.id);
      system(e, 'create', undefined, state.name);
      continue;
    }
    if (e.kind === 'create' || e.seq <= create.seq) continue;

    const author = status(e.author);
    switch (e.kind) {
      case 'invite': {
        const target = e.data.member!;
        const pub = Buffer.from(e.data.pub!, 'base64url');
        if (author !== 'member' || status(target) || target === e.author) continue;
        if (pub.length !== 32 || fingerprint(pub) !== target) continue;
        if (state.members.size >= MAX_MEMBERS) continue;
        const name = cleanName(e.data.name);
        state.members.set(target, { id: target, pub: e.data.pub!, name, status: 'invited', inviteSeq: e.seq, invitedBy: e.author });
        state.names.set(target, name);
        system(e, 'invite', target);
        break;
      }
      case 'join':
        if (author !== 'invited') continue;
        state.members.get(e.author)!.status = 'member';
        system(e, 'join');
        break;
      case 'decline':
        if (author !== 'invited') continue;
        state.members.delete(e.author);
        system(e, 'decline');
        break;
      case 'leave':
        if (author !== 'member') continue;
        state.members.delete(e.author);
        system(e, 'leave');
        break;
      case 'kick': {
        const target = e.data.member!;
        if (e.author !== state.creator || author !== 'member' || !status(target) || target === e.author) continue;
        state.members.delete(target);
        system(e, 'kick', target);
        break;
      }
      case 'rename':
        if (author !== 'member') continue;
        state.name = cleanName(e.data.name);
        system(e, 'rename', undefined, state.name);
        break;
      case 'msg': {
        if (author !== 'member') continue;
        const text = sanitizeText(e.data.text!).trim();
        if (!text) continue;
        state.timeline.push({ type: 'msg', ev: e, text });
        break;
      }
    }
    state.applied.add(e.id);
  }
  return state;
}
