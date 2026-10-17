import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from 'termcore/app/suite';
import { FriendNet, type FriendEvent } from 'termcore/friends/net';
import { Hub } from 'termcore/store/hub';
import { basePaths } from 'termcore/app/paths';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore, groupChatId } from '../src/core/store.js';

/** Real data of termchat 1.4.0 (see termcore/test/fixtures/legacy). */
const FIXTURES = path.resolve(import.meta.dirname, '../../termcore/test/fixtures/legacy');
const ALICE = 'NKISSPLQRD3ILGYERG7P';
const BOB = 'DFUXKKL7GTQ4QMMLE3NA';
const GROUP = groupChatId('yUwqXiW_ojcQpz_Kp8RIXsui0RWrm01L');

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((s) => s()));
});

async function until(cond: () => boolean, ms = 8000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

function home(who: 'alice' | 'bob'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `termchat-notices-${who}-`));
  fs.cpSync(path.join(FIXTURES, who, 'termchat'), path.join(dir, 'termchat'), { recursive: true });
  Hub.prepare(resolvePaths(dir, {}).hub);
  return dir;
}

async function chat(dir: string): Promise<AppStore> {
  const s = new AppStore({ paths: resolvePaths(dir, {}), port: 0, discovery: false, dialIntervalMs: 100 });
  await s.start();
  stops.push(() => s.stop());
  return s;
}

/** Another app of the suite (only termcore's part of it), e.g. Bob's termdrop. */
async function other(dir: string, app: 'termdrop' | 'termhub') {
  const paths = basePaths(app, dir, {});
  const hub = new Hub(paths.hub);
  const events: FriendEvent[] = [];
  const net = new FriendNet<never, object>({
    app: defineApp(app, { version: '2.2.0', repository: { url: `https://github.com/trigonyx/${app}` } }),
    paths,
    hub,
    port: 0,
    discovery: false,
    dialIntervalMs: 100,
    notify: () => {},
    wire: { parse: () => null },
    hooks: { changed: () => {}, message: () => {}, event: (e) => events.push(e) },
  });
  await net.start();
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await net.stop();
  };
  stops.push(stop);
  return { net, hub, events, stop };
}

describe('messages for friends without termchat open', { timeout: 40_000 }, () => {
  it('their other app shows it, termchat picks it up when it opens, and nothing arrives twice', async () => {
    const aliceDir = home('alice');
    const bobDir = home('bob');
    const alice = await chat(aliceDir);
    // Bob only has termdrop open; Alice's termchat knows where it listens (discovery does that for real)
    const bobDrop = await other(bobDir, 'termdrop');
    alice.contacts.setPorts(BOB, { termdrop: bobDrop.net.network.port });
    alice.contacts.upsert(BOB, { lastIp: '127.0.0.1' });
    bobDrop.hub.friends.update((f) => {
      const a = f.friends.find((x) => x.id === ALICE)!;
      a.lastIp = '127.0.0.1';
      a.ports = { termchat: alice.network.port };
    });
    const unreadBefore = 1;

    expect(alice.sendMessage(BOB, 'are you there?').ok).toBe(true);
    await until(() => bobDrop.hub.inbox.get().notices.length === 1, 10_000, 'notice in Bob’s inbox');
    expect(bobDrop.hub.inbox.get().notices[0]).toMatchObject({ app: 'termchat', kind: 'msg', title: 'Alice', body: 'are you there?', from: ALICE });
    await until(() => bobDrop.events.some((e) => e.kind === 'notice'), 6000, 'shown in termdrop');

    // Bob opens termchat: the message is there, unread, and termhub's badge counts it
    const bob = await chat(bobDir);
    await until(() => bob.messages(ALICE).some((m) => m.text === 'are you there?'), 6000, 'taken');
    expect(bob.contact(ALICE)?.unread).toBe(unreadBefore + 1);
    await until(() => bobDrop.hub.inbox.get().notices.length === 0, 6000, 'gone from the inbox');
    await until(() => (bobDrop.hub.inbox.get().waiting.termchat?.n ?? 0) >= 2, 6000, 'waiting count');

    // the two termchats connect: Alice's copy is delivered, Bob doesn't get it twice
    await until(() => alice.messages(BOB).find((m) => m.text === 'are you there?')?.status === 'delivered', 10_000, 'delivered');
    expect(bob.messages(ALICE).filter((m) => m.text === 'are you there?')).toHaveLength(1);
    expect(bob.contact(ALICE)?.unread).toBe(unreadBefore + 1);
    expect(alice.hub.outbox.get().notices).toEqual([]);

    // reading it clears the badge
    bob.setActiveChat(ALICE);
    await until(() => !bobDrop.hub.inbox.get().waiting.termchat || bobDrop.hub.inbox.get().waiting.termchat!.n < 2, 6000, 'badge cleared');
  });

  it('group messages go to members through their termhub', async () => {
    const aliceDir = home('alice');
    const bobDir = home('bob');
    const alice = await chat(aliceDir);
    const aliceHub = await other(aliceDir, 'termhub');
    const bobHub = await other(bobDir, 'termhub');
    // the two termhubs are connected
    aliceHub.net.contacts.setPorts(BOB, { termhub: bobHub.net.network.port });
    aliceHub.net.contacts.upsert(BOB, { lastIp: '127.0.0.1' });
    await until(() => aliceHub.net.isOnline(BOB), 8000, 'termhubs connected');

    expect(alice.sendGroupMessage(GROUP, 'team meeting at 5').ok).toBe(true);
    await until(() => bobHub.hub.inbox.get().notices.some((n) => n.kind === 'gmsg'), 8000, 'group notice');
    expect(bobHub.hub.inbox.get().notices.find((n) => n.kind === 'gmsg')).toMatchObject({ title: '#Team', body: 'Alice: team meeting at 5' });

    const bob = await chat(bobDir);
    await until(() => bob.items(GROUP).some((i) => i.kind === 'msg' && i.text === 'team meeting at 5'), 6000, 'group message taken');
    expect(bob.group(GROUP)?.unread).toBeGreaterThan(0);
  });
});
