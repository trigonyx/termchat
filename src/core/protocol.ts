import { EVENT_ID_RE } from './groupEvents.js';
import { cleanName, MAX_TEXT, sanitizeText } from './sanitize.js';

/** How one side sees the relationship. `outgoing` = "I want to chat with you". */
export type RelState = 'accepted' | 'outgoing' | 'none';

export type Wire =
  | { t: 'state'; name: string; state: RelState; port: number }
  | { t: 'decline' }
  | { t: 'msg'; id: string; ts: number; text: string }
  | { t: 'ack'; ids: string[] }
  /** read receipt: the recipient had the chat open and their terminal in front */
  | { t: 'read'; ids: string[] }
  /** "These are the group events I have – send me what I'm missing." */
  | { t: 'gsync'; gid: string; have: string[]; since: number }
  /** Group events (validated and verified later in groups.ts) */
  | { t: 'gev'; gid: string; evs: unknown[] }
  /** receipt; `by` = relayed on behalf of another member who received the events */
  | { t: 'gack'; gid: string; ids: string[]; by?: string }
  /** Terminal in the background (`away`) or back in front */
  | { t: 'presence'; away: boolean }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'bye' };

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const REL_STATES: RelState[] = ['accepted', 'outgoing', 'none'];
/** Keeps a gsync frame well below MAX_FRAME (each id ≈ 35 bytes of JSON). */
export const MAX_SYNC_IDS = 1200;

/** Strictly validates incoming frames. Anything unexpected yields `null` and is dropped. */
export function parseWire(buf: Buffer): Wire | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;

  switch (o.t) {
    case 'state': {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state as RelState)) return null;
      return {
        t: 'state',
        name: cleanName(o.name),
        state: o.state as RelState,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
      };
    }
    case 'msg': {
      if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return null;
      if (typeof o.text !== 'string' || o.text.length > MAX_TEXT) return null;
      const text = sanitizeText(o.text);
      if (!text.trim()) return null;
      const ts = typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now();
      return { t: 'msg', id: o.id, ts, text };
    }
    case 'ack':
    case 'read': {
      if (!Array.isArray(o.ids) || o.ids.length > 500) return null;
      const ids = o.ids.filter((id): id is string => typeof id === 'string' && ID_RE.test(id));
      return { t: o.t, ids };
    }
    case 'gsync': {
      if (typeof o.gid !== 'string' || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.have) || o.have.length > MAX_SYNC_IDS) return null;
      const since = Number.isInteger(o.since) && (o.since as number) >= 0 ? (o.since as number) : 0;
      return { t: 'gsync', gid: o.gid, have: o.have.filter((id): id is string => typeof id === 'string' && EVENT_ID_RE.test(id)), since };
    }
    case 'gev': {
      if (typeof o.gid !== 'string' || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.evs) || o.evs.length > 500) return null;
      return { t: 'gev', gid: o.gid, evs: o.evs };
    }
    case 'gack': {
      if (typeof o.gid !== 'string' || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.ids) || o.ids.length > 500) return null;
      const ids = o.ids.filter((id): id is string => typeof id === 'string' && EVENT_ID_RE.test(id));
      const by = typeof o.by === 'string' && /^[A-Z2-7]{20}$/.test(o.by) ? o.by : undefined;
      return { t: 'gack', gid: o.gid, ids, ...(by ? { by } : {}) };
    }
    case 'presence':
      return typeof o.away === 'boolean' ? { t: 'presence', away: o.away } : null;
    case 'decline':
    case 'ping':
    case 'pong':
    case 'bye':
      return { t: o.t };
    default:
      return null;
  }
}

export function encodeWire(msg: Wire): Buffer {
  return Buffer.from(JSON.stringify(msg), 'utf8');
}

export type ContactState = 'accepted' | 'outgoing' | 'incoming' | 'declined' | 'blocked';

/**
 * Reconciles our view with the peer's once connected or whenever a state changes.
 * Result: our new state (or `null` = no contact).
 */
export function reconcile(mine: ContactState | null, theirs: RelState): ContactState | null {
  const peerWants = theirs === 'accepted' || theirs === 'outgoing';
  switch (mine) {
    case 'blocked':
      return 'blocked';
    case 'accepted':
    case 'outgoing':
      // Both want it → contact established. If the peer removed us, it becomes a request again.
      return peerWants ? 'accepted' : 'outgoing';
    case 'incoming':
      return peerWants ? 'incoming' : null;
    case 'declined':
      return peerWants ? 'incoming' : 'declined';
    case null:
      return peerWants ? 'incoming' : null;
  }
}

/** What we tell the peer about our view. */
export function relStateFor(state: ContactState | null): RelState {
  return state === 'accepted' || state === 'outgoing' ? state : 'none';
}
