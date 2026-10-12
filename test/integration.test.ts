import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';

const stores: AppStore[] = [];

function profile(name: string): Paths {
  const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `termchat-${name}-`)));
  AppStore.createProfile(paths, name);
  return paths;
}

async function boot(paths: Paths, port = 0): Promise<AppStore> {
  const s = new AppStore({ paths, port, discovery: false, dialIntervalMs: 100 });
  await s.start();
  stores.push(s);
  return s;
}

async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('Timed out in test');
    await new Promise((r) => setTimeout(r, 20));
  }
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

describe('two instances', () => {
  it('request → accept → message → delivery receipt', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));

    const bobId = await a.addByAddress('127.0.0.1', b.network.port);
    const aliceId = a.identity.id;
    expect(bobId).toBe(b.identity.id);

    await until(() => b.chatList().requests.some((r) => r.id === aliceId));
    expect(a.contact(bobId)?.state).toBe('outgoing');

    // a message written before acceptance waits in the outbox
    a.sendMessage(bobId, 'Hello **Bob**');
    expect(b.messages(aliceId)).toHaveLength(0);

    b.accept(aliceId);
    await until(() => a.contact(bobId)?.state === 'accepted');
    await until(() => b.messages(aliceId).length === 1);
    expect(b.messages(aliceId)[0]?.text).toBe('Hello **Bob**');
    await until(() => a.messages(bobId)[0]?.status === 'delivered');
  });

  it('sends desktop notifications only while unfocused and enabled', async () => {
    const seen: [string, string][] = [];
    const a = await boot(profile('Alice'));
    const pb = profile('Bob');
    const b = new AppStore({ paths: pb, port: 0, discovery: false, dialIntervalMs: 100, notify: (t, m) => seen.push([t, m]) });
    await b.start();
    stores.push(b);

    const bobId = await a.addByAddress('127.0.0.1', b.network.port);
    await until(() => b.chatList().requests.length === 1);
    b.accept(a.identity.id);
    await until(() => a.contact(bobId)?.state === 'accepted');

    a.sendMessage(bobId, 'focused');
    await until(() => b.messages(a.identity.id).length === 1);
    expect(seen).toEqual([]);

    b.setFocused(false);
    a.sendMessage(bobId, 'in\nbackground');
    await until(() => seen.length === 1);
    expect(seen[0]).toEqual(['Alice', 'in background']);

    b.setNotifications(false);
    a.sendMessage(bobId, 'muted');
    await until(() => b.messages(a.identity.id).length === 3);
    expect(seen).toHaveLength(1);
  });

  it('read receipts: only while the chat is open and the terminal in front', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const bobId = await a.addByAddress('127.0.0.1', b.network.port);
    const aliceId = a.identity.id;
    await until(() => b.chatList().requests.length === 1);
    b.accept(aliceId);
    await until(() => a.contact(bobId)?.state === 'accepted' && b.contact(aliceId)?.state === 'accepted');

    // Bob is not in the chat → delivered, not read
    a.sendMessage(bobId, 'one');
    await until(() => a.messages(bobId)[0]?.status === 'delivered');

    // chat open, but terminal in the background → still unread
    b.setFocused(false);
    b.setActiveChat(aliceId);
    a.sendMessage(bobId, 'two');
    await until(() => a.messages(bobId)[1]?.status === 'delivered');
    await new Promise((r) => setTimeout(r, 200));
    expect(a.messages(bobId).map((m) => m.status)).toEqual(['delivered', 'delivered']);

    // Bob looks at it → both read
    b.setFocused(true);
    await until(() => a.messages(bobId).every((m) => m.status === 'read'));

    // new messages while he's looking are read right away
    a.sendMessage(bobId, 'three');
    await until(() => a.messages(bobId)[2]?.status === 'read');
    // Bob's own messages are not affected by his reading
    expect(b.messages(aliceId).every((m) => m.from === 'peer' && m.status === 'read')).toBe(true);
  });

  it('shows a peer as inactive while their terminal is in the background', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const bobId = await a.addByAddress('127.0.0.1', b.network.port);
    await until(() => b.chatList().requests.length === 1);
    b.accept(a.identity.id);
    await until(() => a.contact(bobId)?.state === 'accepted' && a.isOnline(bobId));
    expect(a.contact(bobId)?.inactive).toBe(false);

    b.setFocused(false);
    await until(() => a.contact(bobId)?.inactive === true);
    b.setFocused(true);
    await until(() => a.contact(bobId)?.inactive === false);
  });

  it('delivers offline messages after reconnecting', async () => {
    const pa = profile('Alice');
    const pb = profile('Bob');
    const a = await boot(pa);
    let b = await boot(pb);
    const port = b.network.port;

    const bobId = await a.addByAddress('127.0.0.1', port);
    await until(() => b.chatList().requests.length === 1);
    b.accept(a.identity.id);
    await until(() => a.contact(bobId)?.state === 'accepted');

    await b.stop();
    stores.splice(stores.indexOf(b), 1);
    await until(() => !a.isOnline(bobId));

    a.sendMessage(bobId, 'are you there?');
    expect(a.messages(bobId)[0]?.status).toBe('pending');

    b = await boot(pb, port);
    await until(() => b.messages(a.identity.id).some((m) => m.text === 'are you there?'), 8000);
    await until(() => a.messages(bobId)[0]?.status === 'delivered');
    // history is persistent and contains no duplicates
    expect(b.messages(a.identity.id).filter((m) => m.text === 'are you there?')).toHaveLength(1);
  });

  it('accepts no messages without acceptance', async () => {
    const b = await boot(profile('Bob'));
    const c = await boot(profile('Stranger'));
    const bobId = await c.addByAddress('127.0.0.1', b.network.port);
    await until(() => b.chatList().requests.length === 1);
    c.sendMessage(bobId, 'spam');
    await new Promise((r) => setTimeout(r, 300));
    expect(b.messages(c.identity.id)).toHaveLength(0);
    expect(c.messages(bobId)[0]?.status).toBe('pending');

    b.decline(c.identity.id);
    await until(() => c.contact(bobId)?.state === 'declined');
    expect(b.chatList().requests).toHaveLength(0);
  });

  it('blocked peers are disconnected immediately', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const bobId = await a.addByAddress('127.0.0.1', b.network.port);
    await until(() => b.chatList().requests.length === 1);
    b.block(a.identity.id);
    await until(() => !a.isOnline(bobId));
    await new Promise((r) => setTimeout(r, 400));
    expect(b.isOnline(a.identity.id)).toBe(false);
  });
});
