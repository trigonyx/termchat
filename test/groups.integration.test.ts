import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore, type ChatItem } from '../src/core/store.js';

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

async function stop(s: AppStore): Promise<void> {
  await s.stop();
  stores.splice(stores.indexOf(s), 1);
}

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('Timed out in test');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Makes a and b accepted contacts of each other. */
async function befriend(a: AppStore, b: AppStore): Promise<void> {
  await a.addByAddress('127.0.0.1', b.network.port);
  await until(() => b.contact(a.identity.id)?.state === 'incoming');
  b.accept(a.identity.id);
  await until(() => a.contact(b.identity.id)?.state === 'accepted' && !!b.contact(a.identity.id)?.publicKey);
}

const texts = (items: ChatItem[]) => items.filter((i) => i.kind === 'msg').map((i) => (i.kind === 'msg' ? i.text : ''));

afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

describe('group chats', { timeout: 30_000 }, () => {
  it('invite → accept → messages reach everyone, also via others', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const c = await boot(profile('Carl'));
    await befriend(a, b);
    await befriend(a, c);
    // Bob and Carl are NOT contacts and don't know each other's address

    const chat = a.createGroup('Weekend', [b.identity.id, c.identity.id]);
    await until(() => b.chatList().requests.some((r) => r.id === chat));
    await until(() => c.chatList().requests.some((r) => r.id === chat));
    expect(b.group(chat)?.myStatus).toBe('invited');

    b.groupAccept(chat);
    c.groupAccept(chat);
    await until(() => a.group(chat)?.members.filter((m) => m.status === 'member').length === 3);
    await until(() => b.group(chat)?.members.filter((m) => m.status === 'member').length === 3);

    expect(b.sendGroupMessage(chat, 'hi **all**').ok).toBe(true);
    await until(() => texts(c.items(chat)).includes('hi **all**')); // relayed by Alice
    expect(texts(a.items(chat))).toEqual(['hi **all**']);
    await until(() => b.items(chat).some((i) => i.kind === 'msg' && i.status === 'delivered'));
  });

  it('delivers to someone who was offline via another member', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const pc = profile('Carl');
    let c = await boot(pc);
    const cPort = c.network.port;
    await befriend(a, b);
    await befriend(a, c);
    const chat = a.createGroup('Trip', [b.identity.id, c.identity.id]);
    await until(() => !!b.group(chat) && !!c.group(chat));
    b.groupAccept(chat);
    c.groupAccept(chat);
    await until(() => a.group(chat)?.members.filter((m) => m.status === 'member').length === 3);
    await until(() => b.group(chat)?.members.filter((m) => m.status === 'member').length === 3);

    await stop(c);
    await until(() => !a.isOnline(c.identity.id));
    b.sendGroupMessage(chat, 'while you were away');
    await until(() => texts(a.items(chat)).includes('while you were away'));
    const status = b.items(chat).find((i) => i.kind === 'msg');
    expect(status?.kind === 'msg' && status.status).toEqual({ n: 1, total: 2 });
    await stop(b); // the author is gone now

    c = await boot(pc, cPort);
    await until(() => texts(c.items(chat)).includes('while you were away'), 8000);
  });

  it('new members do not see older messages', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const d = await boot(profile('Dana'));
    await befriend(a, b);
    await befriend(a, d);
    const chat = a.createGroup('Old', [b.identity.id]);
    await until(() => !!b.group(chat));
    b.groupAccept(chat);
    await until(() => a.group(chat)?.members.filter((m) => m.status === 'member').length === 2);
    a.sendGroupMessage(chat, 'secret from before');
    await until(() => texts(b.items(chat)).includes('secret from before'));

    a.groupInvite(chat, [d.identity.id]);
    await until(() => d.group(chat)?.myStatus === 'invited');
    d.groupAccept(chat);
    await until(() => !!a.group(chat)?.members.some((m) => m.id === d.identity.id && m.status === 'member'));
    a.sendGroupMessage(chat, 'welcome Dana');
    await until(() => texts(d.items(chat)).includes('welcome Dana'));
    expect(texts(d.items(chat))).not.toContain('secret from before');
  });

  it('strangers cannot push a group invite onto you', async () => {
    const b = await boot(profile('Bob'));
    const e = await boot(profile('Eve'));
    const bobId = await e.addByAddress('127.0.0.1', b.network.port);
    await until(() => b.contact(e.identity.id)?.state === 'incoming' && !!e.contact(bobId)?.publicKey);
    // Eve bypasses the UI check and writes an invite for Bob directly
    e.groups.create('Spam', [{ id: bobId, pub: e.contact(bobId)!.publicKey, name: 'Bob' }], 'Eve');
    await new Promise((r) => setTimeout(r, 400));
    expect(b.groups.list()).toHaveLength(0);
  });

  it('rename by a member, kick by the creator and leave reach everyone', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const c = await boot(profile('Carl'));
    await befriend(a, b);
    await befriend(a, c);
    const chat = a.createGroup('Before', [b.identity.id, c.identity.id]);
    await until(() => !!b.group(chat) && !!c.group(chat));
    b.groupAccept(chat);
    c.groupAccept(chat);
    await until(() => c.group(chat)?.members.filter((m) => m.status === 'member').length === 3);

    b.groupRename(chat, 'After');
    await until(() => a.group(chat)?.display === 'After' && c.group(chat)?.display === 'After');

    expect(() => b.groupKick(chat, c.identity.id)).toThrow(/creator/);
    a.groupKick(chat, c.identity.id);
    await until(() => c.group(chat)?.myStatus === 'removed');
    await until(() => !b.group(chat)?.members.some((m) => m.id === c.identity.id));

    b.groupLeave(chat);
    await until(() => !a.group(chat)?.members.some((m) => m.id === b.identity.id));
    expect(b.group(chat)?.myStatus).toBe('left');
    expect(a.items(chat).filter((i) => i.kind === 'note').map((i) => (i.kind === 'note' ? i.text : ''))).toEqual(
      expect.arrayContaining([expect.stringContaining('renamed the group'), expect.stringContaining('removed'), expect.stringContaining('left')]),
    );
  });

  it('sorts the list into unread, 1:1 chats and groups, and counts inactive members separately', async () => {
    const a = await boot(profile('Alice'));
    const b = await boot(profile('Bob'));
    const c = await boot(profile('Carl'));
    await befriend(a, b);
    await befriend(a, c);
    const chat = a.createGroup('Weekend', [b.identity.id, c.identity.id]);
    await until(() => b.chatList().requests.some((r) => r.id === chat) && c.chatList().requests.some((r) => r.id === chat));
    b.groupAccept(chat);
    c.groupAccept(chat);
    await until(() => a.group(chat)?.members.filter((m) => m.status === 'member').length === 3);

    const ids = (list: { id: string }[]) => list.map((e) => e.id).sort();
    let list = a.chatList();
    expect(list.unread).toHaveLength(0);
    expect(ids(list.chats)).toEqual(ids([{ id: b.identity.id }, { id: c.identity.id }]));
    expect(ids(list.groups)).toEqual([chat]);

    // a message from Bob moves his chat up into "unread" – and only there
    b.sendMessage(a.identity.id, 'hey');
    await until(() => a.chatList().unread.length === 1);
    list = a.chatList();
    expect(ids(list.unread)).toEqual([b.identity.id]);
    expect(ids(list.chats)).toEqual([c.identity.id]);
    a.setActiveChat(b.identity.id);
    await until(() => a.chatList().unread.length === 0);
    expect(ids(a.chatList().chats)).toHaveLength(2);

    // Carl puts termchat in the background: still online, but inactive
    await until(() => a.group(chat)?.onlineCount === 2);
    expect(a.group(chat)?.inactiveCount).toBe(0);
    c.setFocused(false);
    await until(() => a.group(chat)?.inactiveCount === 1);
    expect(a.group(chat)?.onlineCount).toBe(1);
  });
});
