import fs from 'node:fs';
import path from 'node:path';
import { deriveGroup, parseEvent, signEvent, verifyEvent, type GroupEvent, type GroupState } from './groupEvents.js';
import type { Identity } from './identity.js';
import type { Paths } from './paths.js';
import { MAX_SYNC_IDS, type Wire } from './protocol.js';
import { cleanName, MAX_TEXT, sanitizeText } from './sanitize.js';
import { appendJsonl, readJson, readJsonl, writeJsonAtomic } from './storage.js';

/** Max. JSON size of one `gev` batch – stays well below MAX_FRAME. */
const BATCH_BYTES = 40_000;

export type MyGroupStatus = 'member' | 'invited' | 'left' | 'removed' | 'declined';

export interface GroupHooks {
  send(peerId: string, msg: Wire): boolean;
  connectedPeers(): string[];
  isAcceptedContact(peerId: string): boolean;
  changed(): void;
  /** a new message from someone else arrived in a group I'm a member of */
  onMessage(gid: string, ev: GroupEvent, state: GroupState): void;
  /** someone invited me to a group */
  onInvited(gid: string, state: GroupState, by: string): void;
}

interface GroupLog {
  gid: string;
  events: Map<string, GroupEvent>;
  state: GroupState;
  /** which of MY events each peer is known to have (for delivery ticks) */
  has: Map<string, Set<string>>;
}

interface GroupMeta {
  unread: number;
  lastActivity: number;
}

type LogLine = { k: 'ev'; ev: GroupEvent } | { k: 'has'; by: string; ids: string[] };

/**
 * Stores group logs, keeps them in sync with other members and forwards events.
 * Each member holds the full set of events; whenever two members are connected they
 * exchange what the other is missing – so messages also reach people via others.
 */
export class GroupManager {
  private groups = new Map<string, GroupLog>();
  private meta: Record<string, GroupMeta>;
  /** groups we already sent our gsync for, per peer connection */
  private synced = new Map<string, Set<string>>();

  constructor(
    private readonly paths: Paths,
    private readonly me: Identity,
    private readonly hooks: GroupHooks,
  ) {
    this.meta = readJson<Record<string, GroupMeta>>(paths.groupsMeta, {});
    this.load();
  }

  // ───────────── Storage ─────────────

  private file(gid: string): string {
    return path.join(this.paths.groupsDir, `${gid}.jsonl`);
  }

  private load(): void {
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.paths.groupsDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      return;
    }
    for (const f of files) {
      const gid = f.slice(0, -'.jsonl'.length);
      const events = new Map<string, GroupEvent>();
      const has = new Map<string, Set<string>>();
      for (const line of readJsonl<LogLine>(path.join(this.paths.groupsDir, f))) {
        if (line.k === 'ev') {
          const ev = parseEvent(line.ev);
          if (ev && ev.gid === gid) events.set(ev.id, ev);
        } else if (line.k === 'has' && typeof line.by === 'string' && Array.isArray(line.ids)) {
          const set = has.get(line.by) ?? new Set();
          for (const id of line.ids) set.add(id);
          has.set(line.by, set);
        }
      }
      const state = deriveGroup(gid, events.values());
      if (state) this.groups.set(gid, { gid, events, state, has });
    }
  }

  private saveMeta(): void {
    writeJsonAtomic(this.paths.groupsMeta, this.meta);
  }

  private touch(gid: string, unreadDelta = 0): void {
    const m = this.meta[gid] ?? { unread: 0, lastActivity: 0 };
    this.meta[gid] = { unread: unreadDelta ? m.unread + unreadDelta : m.unread, lastActivity: Date.now() };
    this.saveMeta();
  }

  // ───────────── Queries ─────────────

  list(): GroupState[] {
    return [...this.groups.values()].map((g) => g.state);
  }

  get(gid: string): GroupState | undefined {
    return this.groups.get(gid)?.state;
  }

  metaOf(gid: string): GroupMeta {
    return this.meta[gid] ?? { unread: 0, lastActivity: this.groups.get(gid)?.state.createdAt ?? 0 };
  }

  markRead(gid: string): boolean {
    const m = this.meta[gid];
    if (!m || m.unread === 0) return false;
    this.meta[gid] = { ...m, unread: 0 };
    this.saveMeta();
    return true;
  }

  myStatus(gid: string): MyGroupStatus | null {
    const log = this.groups.get(gid);
    if (!log) return null;
    const mine = log.state.members.get(this.me.id);
    if (mine) return mine.status;
    // why am I not in it anymore? → the last applied event concerning me
    for (let i = log.state.timeline.length - 1; i >= 0; i--) {
      const t = log.state.timeline[i]!;
      if (t.type !== 'system') continue;
      if (t.action === 'kick' && t.target === this.me.id) return 'removed';
      if (t.ev.author === this.me.id && t.action === 'leave') return 'left';
      if (t.ev.author === this.me.id && t.action === 'decline') return 'declined';
    }
    return 'removed';
  }

  /** Delivery of one of my messages: how many of the members that should get it have it. */
  delivery(gid: string, eventId: string): { n: number; total: number } {
    const log = this.groups.get(gid);
    const ev = log?.events.get(eventId);
    if (!log || !ev) return { n: 0, total: 0 };
    let n = 0;
    let total = 0;
    for (const m of log.state.members.values()) {
      if (m.id === this.me.id || m.status !== 'member' || m.inviteSeq >= ev.seq) continue;
      total++;
      if (log.has.get(m.id)?.has(eventId)) n++;
    }
    return { n, total };
  }

  /** Peers I should stay connected to: members/invitees of groups I'm (still) part of. */
  peers(): Set<string> {
    const out = new Set<string>();
    for (const log of this.groups.values()) {
      if (!this.involved(log)) continue;
      for (const id of log.state.members.keys()) if (id !== this.me.id) out.add(id);
    }
    return out;
  }

  sharesGroup(peerId: string): boolean {
    return this.peers().has(peerId);
  }

  // ───────────── Actions ─────────────

  create(name: string, invitees: { id: string; pub: string; name: string }[], myName: string): string {
    const ev = signEvent(this.me, { gid: '', seq: 1, kind: 'create', data: { name: cleanName(name), creatorName: myName } });
    const log: GroupLog = { gid: ev.gid, events: new Map(), state: deriveGroup(ev.gid, [ev])!, has: new Map() };
    this.groups.set(ev.gid, log);
    this.addEvents(log, [ev], null);
    for (const p of invitees) this.invite(ev.gid, p);
    this.touch(ev.gid);
    return ev.gid;
  }

  invite(gid: string, p: { id: string; pub: string; name: string }): void {
    const log = this.require(gid, 'member');
    if (log.state.members.has(p.id)) throw new Error(`${p.name} is already in the group`);
    this.emit(log, 'invite', { member: p.id, pub: p.pub, name: cleanName(p.name) });
  }

  accept(gid: string): void {
    this.emit(this.require(gid, 'invited'), 'join', {});
  }

  decline(gid: string): void {
    this.emit(this.require(gid, 'invited'), 'decline', {});
  }

  leave(gid: string): void {
    this.emit(this.require(gid, 'member'), 'leave', {});
  }

  kick(gid: string, memberId: string): void {
    const log = this.require(gid, 'member');
    if (log.state.creator !== this.me.id) throw new Error('Only the creator can remove members');
    if (!log.state.members.has(memberId)) throw new Error('Not a member');
    this.emit(log, 'kick', { member: memberId });
  }

  rename(gid: string, name: string): void {
    this.emit(this.require(gid, 'member'), 'rename', { name: cleanName(name) });
  }

  send(gid: string, raw: string): GroupEvent {
    const text = sanitizeText(raw).trim();
    if (!text) throw new Error('Empty message');
    if (text.length > MAX_TEXT) throw new Error(`Message too long (max. ${MAX_TEXT} characters)`);
    return this.emit(this.require(gid, 'member'), 'msg', { text });
  }

  /** Removes a group I'm no longer part of from this device. */
  deleteLocal(gid: string): void {
    const status = this.myStatus(gid);
    if (status === 'member' || status === 'invited') throw new Error('Leave the group first: /leave');
    this.groups.delete(gid);
    delete this.meta[gid];
    this.saveMeta();
    fs.rmSync(this.file(gid), { force: true });
    this.hooks.changed();
  }

  private require(gid: string, status: 'member' | 'invited'): GroupLog {
    const log = this.groups.get(gid);
    if (!log) throw new Error('Unknown group');
    const mine = this.myStatus(gid);
    if (mine !== status) {
      throw new Error(status === 'member' ? "You're not a member of this group" : 'There is no pending invite');
    }
    return log;
  }

  private emit(log: GroupLog, kind: GroupEvent['kind'], data: Record<string, string>): GroupEvent {
    const ev = signEvent(this.me, { gid: log.gid, seq: log.state.maxSeq + 1, kind, data });
    this.addEvents(log, [ev], null);
    this.touch(log.gid);
    return ev;
  }

  // ───────────── Sync & forwarding ─────────────

  /** Am I (still) part of it – or do I have own events others haven't seen yet (leave/decline)? */
  private involved(log: GroupLog): boolean {
    const mine = log.state.members.get(this.me.id);
    if (mine) return true;
    for (const ev of log.events.values()) {
      if (ev.author !== this.me.id) continue;
      if (![...log.has.values()].some((set) => set.has(ev.id))) return true;
    }
    return false;
  }

  private relevant(log: GroupLog, peerId: string): boolean {
    return log.state.members.has(peerId) && this.involved(log);
  }

  /** New members only get messages written after they were invited. */
  private visibleTo(log: GroupLog, peerId: string, ev: GroupEvent): boolean {
    if (ev.kind !== 'msg') return true;
    return ev.seq > (log.state.members.get(peerId)?.inviteSeq ?? Number.MAX_SAFE_INTEGER);
  }

  onSessionUp(peerId: string): void {
    this.synced.set(peerId, new Set());
    for (const log of this.groups.values()) if (this.relevant(log, peerId)) this.sendSync(peerId, log);
  }

  onSessionDown(peerId: string): void {
    this.synced.delete(peerId);
  }

  private sendSync(peerId: string, log: GroupLog): void {
    const sorted = [...log.events.values()].sort((a, b) => b.seq - a.seq);
    const taken = sorted.slice(0, MAX_SYNC_IDS);
    const since = sorted.length > taken.length ? (taken[taken.length - 1]?.seq ?? 0) : 0;
    this.hooks.send(peerId, { t: 'gsync', gid: log.gid, have: taken.map((e) => e.id), since });
    this.synced.get(peerId)?.add(log.gid);
  }

  private sendEvents(peerId: string, gid: string, evs: GroupEvent[]): void {
    let batch: GroupEvent[] = [];
    let size = 0;
    const flush = () => {
      if (batch.length) this.hooks.send(peerId, { t: 'gev', gid, evs: batch });
      batch = [];
      size = 0;
    };
    for (const ev of [...evs].sort((a, b) => a.seq - b.seq)) {
      const s = JSON.stringify(ev).length;
      if (size + s > BATCH_BYTES || batch.length >= 400) flush();
      batch.push(ev);
      size += s;
    }
    flush();
  }

  onWire(peerId: string, m: Wire): void {
    if (m.t === 'gsync') this.onSync(peerId, m);
    else if (m.t === 'gev') this.onEvents(peerId, m.gid, m.evs);
    else if (m.t === 'gack') this.onAck(peerId, m);
  }

  /**
   * Receipts. If someone got events from me that another member wrote, I pass the
   * receipt on to that author – otherwise they'd never learn about relayed deliveries.
   */
  private onAck(peerId: string, m: Extract<Wire, { t: 'gack' }>): void {
    const log = this.groups.get(m.gid);
    if (!log || !log.state.members.has(peerId)) return;
    const by = m.by ?? peerId;
    if (m.by && !log.state.members.has(m.by)) return;
    if (this.recordHas(log, by, m.ids)) this.hooks.changed();
    if (m.by) return; // never relay a relayed receipt

    const connected = new Set(this.hooks.connectedPeers());
    const byAuthor = new Map<string, string[]>();
    for (const id of m.ids) {
      const author = log.events.get(id)?.author;
      if (!author || author === this.me.id || author === peerId || !connected.has(author)) continue;
      byAuthor.set(author, [...(byAuthor.get(author) ?? []), id]);
    }
    for (const [author, ids] of byAuthor) this.hooks.send(author, { t: 'gack', gid: log.gid, ids, by: peerId });
  }

  private onSync(peerId: string, m: Extract<Wire, { t: 'gsync' }>): void {
    const log = this.groups.get(m.gid);
    if (!log) {
      // a contact knows a group I don't – probably an invite for me: ask for everything
      if (this.hooks.isAcceptedContact(peerId)) {
        this.hooks.send(peerId, { t: 'gsync', gid: m.gid, have: [], since: 0 });
      }
      return;
    }
    if (!this.relevant(log, peerId)) return;
    const have = new Set(m.have);
    if (this.recordHas(log, peerId, m.have)) this.hooks.changed();
    const missing = [...log.events.values()].filter(
      (e) => e.seq >= m.since && !have.has(e.id) && this.visibleTo(log, peerId, e),
    );
    this.sendEvents(peerId, log.gid, missing);
    if (!this.synced.get(peerId)?.has(log.gid)) this.sendSync(peerId, log);
  }

  private onEvents(peerId: string, gid: string, raw: unknown[]): void {
    const evs: GroupEvent[] = [];
    for (const r of raw) {
      const ev = parseEvent(r);
      if (ev && ev.gid === gid && verifyEvent(ev)) evs.push(ev);
    }
    if (!evs.length) return;

    let log = this.groups.get(gid);
    if (!log) {
      // unknown group: only accept it from a contact, and only if it invites me
      if (!this.hooks.isAcceptedContact(peerId)) return;
      const state = deriveGroup(gid, evs);
      if (!state) {
        // incomplete (e.g. only the invite arrived) → ask for the whole log
        this.hooks.send(peerId, { t: 'gsync', gid, have: [], since: 0 });
        return;
      }
      if (state.members.get(this.me.id)?.status !== 'invited') return;
      log = { gid, events: new Map(), state, has: new Map() };
      this.groups.set(gid, log);
      this.addEvents(log, evs, peerId);
      this.touch(gid);
      const invite = [...state.timeline].reverse().find((t) => t.type === 'system' && t.action === 'invite' && t.target === this.me.id);
      this.hooks.onInvited(gid, log.state, invite?.ev.author ?? peerId);
      return;
    }

    // the sender must be part of the group – before or after these events
    const wasMember = log.state.members.has(peerId);
    const after = deriveGroup(gid, [...log.events.values(), ...evs]);
    if (!wasMember && !after?.members.has(peerId)) return;

    const added = this.addEvents(log, evs, peerId);
    if (added.length) this.hooks.send(peerId, { t: 'gack', gid, ids: added.map((e) => e.id) });
  }

  private recordHas(log: GroupLog, peerId: string, ids: string[]): boolean {
    const mine = ids.filter((id) => log.events.get(id)?.author === this.me.id);
    const set = log.has.get(peerId) ?? new Set<string>();
    const fresh = mine.filter((id) => !set.has(id));
    if (!fresh.length) return false;
    for (const id of fresh) set.add(id);
    log.has.set(peerId, set);
    appendJsonl(this.file(log.gid), { k: 'has', by: peerId, ids: fresh } satisfies LogLine);
    return true;
  }

  /**
   * Adds events (dedup by id), re-derives the group and forwards new events to everyone
   * connected who should have them – including people who were just removed, so they learn it.
   */
  private addEvents(log: GroupLog, evs: GroupEvent[], from: string | null): GroupEvent[] {
    const added = evs.filter((e) => !log.events.has(e.id));
    if (!added.length) return [];
    const before = new Set(log.state.members.keys());
    const prevApplied = log.state.applied;
    const wasInvited = log.state.members.get(this.me.id)?.status === 'invited';
    for (const e of added) {
      log.events.set(e.id, e);
      appendJsonl(this.file(log.gid), { k: 'ev', ev: e } satisfies LogLine);
    }
    log.state = deriveGroup(log.gid, log.events.values()) ?? log.state;
    if (from) this.recordHas(log, from, added.map((e) => e.id));

    // notify about new messages from others
    if (from && log.state.members.get(this.me.id)?.status === 'member') {
      for (const t of log.state.timeline) {
        if (t.type === 'msg' && !prevApplied.has(t.ev.id) && t.ev.author !== this.me.id) {
          this.touch(log.gid, 1);
          this.hooks.onMessage(log.gid, t.ev, log.state);
        }
      }
    }

    // re-invited to a group I had left before
    const me = log.state.members.get(this.me.id);
    if (from && me?.status === 'invited' && !wasInvited && prevApplied.size) {
      this.touch(log.gid);
      this.hooks.onInvited(log.gid, log.state, me.invitedBy ?? from);
    }

    const targets = new Set([...before, ...log.state.members.keys()]);
    targets.delete(this.me.id);
    const connected = new Set(this.hooks.connectedPeers());
    for (const peerId of targets) {
      if (peerId === from || !connected.has(peerId)) continue;
      // someone who just joined the member list needs the whole (visible) log, not just the new event
      const pool = before.has(peerId) ? added : [...log.events.values()];
      this.sendEvents(peerId, log.gid, pool.filter((e) => this.visibleTo(log, peerId, e)));
    }
    this.hooks.changed();
    return added;
  }
}
