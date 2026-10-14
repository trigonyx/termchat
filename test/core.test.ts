import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../src/core/history.js';
import { resolvePaths } from '../src/core/paths.js';
import { parseWire } from '../src/core/protocol.js';

// framing, encryption, the handshake and the base messages are tested in termcore
describe('protocol', () => {
  it('strictly validates termchat’s messages; the base ones come from termcore', () => {
    expect(parseWire(Buffer.from('kein json'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"hack"}'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"presence","away":true}'))).toEqual({ t: 'presence', away: true });
    expect(parseWire(Buffer.from('{"t":"presence","away":"yes"}'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"msg","id":"../x","text":"a"}'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"msg","id":"abc","ts":1,"text":"hi"}'))).toEqual({ t: 'msg', id: 'abc', ts: 1, text: 'hi' });
    expect(parseWire(Buffer.from('{"t":"read","ids":["abc","../x"]}'))).toEqual({ t: 'read', ids: ['abc'] });
    // keyrace's and termdrop's messages mean nothing here
    expect(parseWire(Buffer.from('{"t":"offer","xid":"abcdefghijklmn","files":[],"total":0}'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"presence","away":false,"racing":true}'))).toEqual({ t: 'presence', away: false });
  });
});

describe('history', () => {
  const store = () => {
    const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), 'termchat-hist-')), {});
    fs.mkdirSync(paths.historyDir, { recursive: true });
    return { paths, h: new HistoryStore(paths) };
  };

  it('keeps read status across a reload and never downgrades it', () => {
    const { paths, h } = store();
    h.add('p', { id: 'm1', from: 'me', text: 'a', ts: 1, status: 'pending' });
    h.add('p', { id: 'm2', from: 'peer', text: 'b', ts: 2, status: 'delivered' });
    expect(h.markRead('p', ['m1'], 'me')).toEqual(['m1']);
    expect(h.markDelivered('p', ['m1'])).toBe(false);
    expect(h.unseen('p')).toEqual(['m2']);
    expect(h.markRead('p', ['m2', 'm1'], 'peer')).toEqual(['m2']);

    const again = new HistoryStore(paths);
    expect(again.get('p').map((m) => m.status)).toEqual(['read', 'read']);
    expect(again.unseen('p')).toEqual([]);
    expect(again.recentlyRead('p', 10)).toEqual(['m2']);
  });

  it('moves a chat to a contact’s new id, merging with one that may exist', () => {
    const { paths, h } = store();
    h.add('OLD', { id: 'a', from: 'peer', text: 'old chat', ts: 1, status: 'read' });
    h.add('OLD', { id: 'b', from: 'me', text: 'reply', ts: 2, status: 'delivered' });
    h.rekey('OLD', 'NEW');
    expect(h.get('NEW').map((m) => m.text)).toEqual(['old chat', 'reply']);
    expect(h.get('OLD')).toEqual([]);
    expect(fs.existsSync(path.join(paths.historyDir, 'OLD.jsonl'))).toBe(false);
    // a second old id joins the same chat; duplicates are dropped
    h.add('OTHER', { id: 'b', from: 'me', text: 'reply', ts: 2, status: 'delivered' });
    h.add('OTHER', { id: 'c', from: 'peer', text: 'from the other app', ts: 3, status: 'delivered' });
    h.rekey('OTHER', 'NEW');
    expect(new HistoryStore(paths).get('NEW').map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // nothing to move: no-op
    h.rekey('NOBODY', 'NEW');
    expect(h.hasChat('NEW')).toBe(true);
    expect(h.hasChat('NOBODY')).toBe(false);
  });
});
