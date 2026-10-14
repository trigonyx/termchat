import fs from 'node:fs';
import path from 'node:path';
import type { Paths } from './paths.js';
import { appendJsonl, readJsonl } from 'termcore/app/storage';

/**
 * My messages: pending → delivered (on their device) → read (they had the chat open and in front).
 * Peer messages: delivered = not seen yet, read = seen here (and a read receipt was sent).
 */
export type MessageStatus = 'pending' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  from: 'me' | 'peer';
  text: string;
  ts: number;
  status: MessageStatus;
}

/** Lines in the append-only log: a new message, a delivery receipt or read receipts. */
type LogEntry = { k: 'm'; m: ChatMessage } | { k: 'd'; id: string } | { k: 'r'; ids: string[] };

/**
 * Chat history as JSONL per contact. Only ever appended, never rewritten –
 * so history survives a crash intact.
 */
export class HistoryStore {
  private cache = new Map<string, ChatMessage[]>();

  constructor(private readonly paths: Paths) {}

  private file(peerId: string): string {
    return path.join(this.paths.historyDir, `${peerId}.jsonl`);
  }

  get(peerId: string): ChatMessage[] {
    const cached = this.cache.get(peerId);
    if (cached) return cached;
    const byId = new Map<string, ChatMessage>();
    for (const e of readJsonl<LogEntry>(this.file(peerId))) {
      if (e.k === 'm' && e.m?.id && !byId.has(e.m.id)) byId.set(e.m.id, e.m);
      else if (e.k === 'd') {
        const m = byId.get(e.id);
        if (m?.status === 'pending') byId.set(e.id, { ...m, status: 'delivered' });
      } else if (e.k === 'r' && Array.isArray(e.ids)) {
        for (const id of e.ids) {
          const m = byId.get(id);
          if (m) byId.set(id, { ...m, status: 'read' });
        }
      }
    }
    const list = [...byId.values()];
    this.cache.set(peerId, list);
    return list;
  }

  has(peerId: string, msgId: string): boolean {
    return this.get(peerId).some((m) => m.id === msgId);
  }

  add(peerId: string, msg: ChatMessage): void {
    // load first – otherwise a cold cache would read the new line from disk and add it twice
    const list = this.get(peerId);
    appendJsonl(this.file(peerId), { k: 'm', m: msg } satisfies LogEntry);
    // new array so React notices the change
    this.cache.set(peerId, [...list, msg]);
  }

  markDelivered(peerId: string, ids: string[]): boolean {
    const wanted = new Set(ids);
    let changed = false;
    const next = this.get(peerId).map((m) => {
      if (m.from === 'me' && m.status === 'pending' && wanted.has(m.id)) {
        appendJsonl(this.file(peerId), { k: 'd', id: m.id } satisfies LogEntry);
        changed = true;
        return { ...m, status: 'delivered' as const };
      }
      return m;
    });
    if (changed) this.cache.set(peerId, next);
    return changed;
  }

  /** Marks messages as read – `from: 'me'` for receipts from the peer, `'peer'` for messages seen here. Returns the ids that changed. */
  markRead(peerId: string, ids: string[], from: 'me' | 'peer'): string[] {
    const wanted = new Set(ids);
    const changed: string[] = [];
    const next = this.get(peerId).map((m) => {
      if (m.from === from && m.status !== 'read' && wanted.has(m.id)) {
        changed.push(m.id);
        return { ...m, status: 'read' as const };
      }
      return m;
    });
    if (changed.length) {
      appendJsonl(this.file(peerId), { k: 'r', ids: changed } satisfies LogEntry);
      this.cache.set(peerId, next);
    }
    return changed;
  }

  /** Peer messages not seen yet. */
  unseen(peerId: string): string[] {
    return this.get(peerId)
      .filter((m) => m.from === 'peer' && m.status !== 'read')
      .map((m) => m.id);
  }

  /** The last `n` peer messages seen here (their receipts are re-sent on reconnect). */
  recentlyRead(peerId: string, n: number): string[] {
    return this.get(peerId)
      .filter((m) => m.from === 'peer' && m.status === 'read')
      .slice(-n)
      .map((m) => m.id);
  }

  pending(peerId: string): ChatMessage[] {
    return this.get(peerId).filter((m) => m.from === 'me' && m.status === 'pending');
  }

  last(peerId: string): ChatMessage | undefined {
    const list = this.get(peerId);
    return list[list.length - 1];
  }

  /**
   * A contact has a new id (the move to ~/.termhub): their chat moves along. If there's
   * already a chat under the new id, both are kept – `get` skips messages it already has.
   */
  rekey(oldId: string, newId: string): void {
    const from = this.file(oldId);
    if (!fs.existsSync(from)) return;
    const to = this.file(newId);
    if (fs.existsSync(to)) {
      fs.appendFileSync(to, fs.readFileSync(from));
      fs.rmSync(from);
    } else {
      fs.renameSync(from, to);
    }
    this.cache.delete(oldId);
    this.cache.delete(newId);
  }

  /** Is there a chat with this id? */
  hasChat(peerId: string): boolean {
    return fs.existsSync(this.file(peerId));
  }

  delete(peerId: string): void {
    fs.rmSync(this.file(peerId), { force: true });
    this.cache.set(peerId, []);
  }
}
