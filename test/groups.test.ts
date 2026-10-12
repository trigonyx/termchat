import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveGroup, MAX_MEMBERS, parseEvent, signEvent, verifyEvent, type GroupEvent } from '../src/core/groupEvents.js';
import { loadOrCreateIdentity, type Identity } from '../src/core/identity.js';
import { resolvePaths } from '../src/core/paths.js';

function identity(): Identity {
  return loadOrCreateIdentity(resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), 'termchat-g-'))));
}

/** Small helper that writes a group log like the app would. */
class Log {
  events: GroupEvent[] = [];
  gid = '';
  seq = 0;
  add(by: Identity, kind: GroupEvent['kind'], data: Record<string, string> = {}): GroupEvent {
    const e = signEvent(by, { gid: this.gid, seq: ++this.seq, kind, data });
    if (kind === 'create') this.gid = e.gid;
    this.events.push(e);
    return e;
  }
  invite(by: Identity, who: Identity, name: string) {
    return this.add(by, 'invite', { member: who.id, pub: who.publicRaw.toString('base64url'), name });
  }
  state() {
    return deriveGroup(this.gid, this.events)!;
  }
}

const alice = identity();
const bob = identity();
const carl = identity();

function basicGroup(): Log {
  const log = new Log();
  log.add(alice, 'create', { name: 'Weekend', creatorName: 'Alice' });
  log.invite(alice, bob, 'Bob');
  log.add(bob, 'join');
  return log;
}

describe('group events', () => {
  it('signs and verifies; tampering is detected', () => {
    const log = basicGroup();
    const e = log.add(bob, 'msg', { text: 'hi' });
    expect(verifyEvent(e)).toBe(true);
    expect(verifyEvent({ ...e, data: { text: 'evil' } })).toBe(false);
    expect(verifyEvent({ ...e, author: alice.id })).toBe(false);
    expect(verifyEvent({ ...e, seq: e.seq + 1 })).toBe(false);
    expect(parseEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(parseEvent({ ...e, kind: 'hack' })).toBeNull();
  });

  it('derives members, name and messages', () => {
    const log = basicGroup();
    log.add(bob, 'msg', { text: 'hello' });
    log.add(bob, 'rename', { name: 'Trip' });
    const s = log.state();
    expect(s.name).toBe('Trip');
    expect(s.creator).toBe(alice.id);
    expect([...s.members.values()].map((m) => [m.name, m.status])).toEqual([
      ['Alice', 'member'],
      ['Bob', 'member'],
    ]);
    expect(s.timeline.filter((t) => t.type === 'msg').map((t) => (t.type === 'msg' ? t.text : ''))).toEqual(['hello']);
  });

  it('only the creator can kick', () => {
    const log = basicGroup();
    log.invite(bob, carl, 'Carl');
    log.add(carl, 'join');
    log.add(bob, 'kick', { member: carl.id });
    expect(log.state().members.has(carl.id)).toBe(true);
    log.add(alice, 'kick', { member: carl.id });
    expect(log.state().members.has(carl.id)).toBe(false);
  });

  it('ignores messages from non-members and joins without invite', () => {
    const log = basicGroup();
    log.add(carl, 'join');
    log.add(carl, 'msg', { text: 'let me in' });
    const s = log.state();
    expect(s.members.has(carl.id)).toBe(false);
    expect(s.timeline.some((t) => t.type === 'msg')).toBe(false);
  });

  it('invited members cannot write before joining', () => {
    const log = basicGroup();
    log.invite(alice, carl, 'Carl');
    log.add(carl, 'msg', { text: 'early' });
    expect(log.state().timeline.some((t) => t.type === 'msg')).toBe(false);
  });

  it('same events in any arrival order give the same state', () => {
    const log = basicGroup();
    log.invite(bob, carl, 'Carl');
    log.add(carl, 'join');
    log.add(carl, 'msg', { text: 'a' });
    log.add(alice, 'rename', { name: 'X' });
    log.add(bob, 'leave');
    const a = deriveGroup(log.gid, log.events)!;
    const b = deriveGroup(log.gid, [...log.events].reverse())!;
    expect([...b.members.keys()]).toEqual([...a.members.keys()]);
    expect(b.name).toBe(a.name);
    expect(b.timeline.map((t) => t.ev.id)).toEqual(a.timeline.map((t) => t.ev.id));
  });

  it('caps groups at the member limit', () => {
    const log = new Log();
    log.add(alice, 'create', { name: 'Big', creatorName: 'Alice' });
    for (let i = 0; i < MAX_MEMBERS + 3; i++) log.invite(alice, identity(), `P${i}`);
    expect(log.state().members.size).toBe(MAX_MEMBERS);
  });

  it('a forged invite (pub does not match id) is ignored', () => {
    const log = basicGroup();
    log.add(alice, 'invite', { member: carl.id, pub: bob.publicRaw.toString('base64url'), name: 'Carl' });
    expect(log.state().members.has(carl.id)).toBe(false);
  });
});
