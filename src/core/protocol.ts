import { MAX_TEXT, sanitizeText } from 'termcore/app/sanitize';
import { encodeWire, parseWire as parseBaseWire, type BaseWire, type WireExtension } from 'termcore/friends/wire';
import { PEER_ID_RE } from 'termcore/net/identity';
import { EVENT_ID_RE } from './groupEvents.js';

export { encodeWire };
export { reconcile, relStateFor, type ContactState, type RelState } from 'termcore/friends/state';

/**
 * termchat's own messages (the base ones – state, presence, links … – come from termcore):
 * direct messages with delivery and read receipts, and the group sync.
 */
export type ChatWire =
  | { t: 'msg'; id: string; ts: number; text: string }
  | { t: 'ack'; ids: string[] }
  /** read receipt: the recipient had the chat open and their terminal in front */
  | { t: 'read'; ids: string[] }
  /** "These are the group events I have – send me what I'm missing." */
  | { t: 'gsync'; gid: string; have: string[]; since: number }
  /** Group events (validated and verified later in groups.ts) */
  | { t: 'gev'; gid: string; evs: unknown[] }
  /** receipt; `by` = relayed on behalf of another member who received the events */
  | { t: 'gack'; gid: string; ids: string[]; by?: string };

export type Wire = BaseWire | ChatWire;

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
/** Keeps a gsync frame well below MAX_FRAME (each id ≈ 35 bytes of JSON). */
export const MAX_SYNC_IDS = 1200;

/** Strictly validates termchat's messages. Anything unexpected yields `null` and is dropped. */
export function parseChatWire(o: Record<string, unknown>): ChatWire | null {
  switch (o.t) {
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
      const by = typeof o.by === 'string' && PEER_ID_RE.test(o.by) ? o.by : undefined;
      return { t: 'gack', gid: o.gid, ids, ...(by ? { by } : {}) };
    }
    default:
      return null;
  }
}

export const WIRE: WireExtension<ChatWire> = { parse: parseChatWire };

/** Everything that can arrive on a friend session. */
export function parseWire(buf: Buffer): Wire | null {
  return parseBaseWire(buf, WIRE);
}
