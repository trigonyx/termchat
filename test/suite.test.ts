import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Hub } from 'termcore/store/hub';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore, groupChatId } from '../src/core/store.js';

/** Real data of termchat 1.4.0 and keyrace 1.1.0 (see termcore/test/fixtures/legacy). */
const FIXTURES = path.resolve(import.meta.dirname, '../../termcore/test/fixtures/legacy');
const OLD = {
  alice: { termchat: 'NKISSPLQRD3ILGYERG7P', keyrace: '23LZSIQIJQCQOALWWWKL' },
  bob: { termchat: 'DFUXKKL7GTQ4QMMLE3NA', keyrace: 'VMFNJZELIEDA4YVKTXSK' },
  dana: { termchat: '72RSA3RQYEPXIBJTOZ6F' },
};
const GROUP = groupChatId('yUwqXiW_ojcQpz_Kp8RIXsui0RWrm01L');

const stores: AppStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

async function until(cond: () => boolean, ms = 6000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function start(who: 'alice' | 'bob', opts: { notify?: (t: string, b: string) => void } = {}): Promise<AppStore> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `termchat-suite-${who}-`));
  for (const app of ['termchat', 'keyrace']) fs.cpSync(path.join(FIXTURES, who, app), path.join(dir, app), { recursive: true });
  const paths = resolvePaths(dir, {});
  expect(Hub.prepare(paths.hub).migrated).toBe(true);
  const s = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100, ...opts });
  await s.start();
  stores.push(s);
  return s;
}

describe('termchat 2.0 with the data of 1.4', { timeout: 30_000 }, () => {
  it('same ids, chats and groups as before; keyrace friends join the list', async () => {
    const alice = await start('alice');
    const bob = await start('bob');
    // termchat's id is the shared one: nothing changes for termchat friends
    expect(alice.identity.id).toBe(OLD.alice.termchat);
    expect(alice.messages(OLD.bob.termchat).map((m) => m.text)).toEqual(['hi Bob, see you at the race', 'yes! **sprint** later']);
    expect(alice.contact(OLD.bob.termchat)).toMatchObject({ alias: 'Bobby', state: 'accepted', unread: 1 });
    expect(alice.chatList().requests.map((e) => e.id)).toContain(OLD.dana.termchat);
    expect(alice.group(GROUP)?.display).toBe('Team');
    // keyrace's Bob shows up as a contact too, until he connects with his link
    expect(alice.contact(OLD.bob.keyrace)?.state).toBe('accepted');

    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => !alice.contacts.get(OLD.bob.keyrace) && alice.isOnline(OLD.bob.termchat), 6000, 'linked');
    expect(alice.contact(OLD.bob.termchat)).toMatchObject({ alias: 'Bobby', unread: 1 });
    // chats and groups go on as before
    alice.sendMessage(OLD.bob.termchat, 'still here after the update');
    await until(() => bob.messages(OLD.alice.termchat).some((m) => m.text === 'still here after the update'), 6000, 'message');
    expect(alice.sendGroupMessage(GROUP, 'group still works').ok).toBe(true);
    await until(() => bob.items(GROUP).some((i) => i.kind === 'msg' && i.text === 'group still works'), 6000, 'group message');
  });

  it('do not disturb: messages arrive (unread), but quietly', async () => {
    const notes: string[] = [];
    const alice = await start('alice', { notify: (_t, b) => notes.push(b) });
    const bob = await start('bob');
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => alice.isOnline(OLD.bob.termchat) && bob.isOnline(OLD.alice.termchat), 6000, 'online');
    alice.hub.setProfile({ status: 'dnd', statusMsg: 'focus' });
    await until(() => bob.contact(OLD.alice.termchat)?.status === 'dnd', 4000, 'status');
    alice.setFocused(false);
    const toastBefore = alice.toast?.text;
    bob.sendMessage(OLD.alice.termchat, 'psst');
    await until(() => alice.messages(OLD.bob.termchat).some((m) => m.text === 'psst'), 6000, 'message');
    expect(alice.contact(OLD.bob.termchat)?.unread).toBe(2);
    expect(alice.toast?.text).toBe(toastBefore);
    expect(notes).toEqual([]);
    // available again: messages pop up as usual
    alice.hub.setProfile({ status: 'available' });
    await until(() => !alice.dnd, 3000, 'available');
    bob.sendMessage(OLD.alice.termchat, 'now?');
    await until(() => notes.length === 1, 6000, 'notification');
    expect(alice.toast?.text).toContain('now?');
  });
});
