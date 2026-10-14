import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeLan } from 'termcore/net/fakelan';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';

// Discovery itself is tested in termcore; here: termchat's contacts on a (simulated) Wi-Fi.
describe('AppStore with discovery', () => {
  const stores: AppStore[] = [];
  afterEach(async () => {
    await Promise.all(stores.splice(0).map((s) => s.stop()));
  });

  function profile(name: string): Paths {
    const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `termchat-${name}-`)));
    AppStore.createProfile(paths, name);
    return paths;
  }

  async function boot(paths: Paths, lan: FakeLan, ip: string): Promise<AppStore> {
    const { transport, interfaces } = lan.join(ip, undefined, 5051);
    const s = new AppStore({ paths, port: 0, dialIntervalMs: 100, discoveryOptions: { transport, interfaces } });
    await s.start();
    stores.push(s);
    return s;
  }

  async function until(cond: () => boolean, ms = 10_000): Promise<void> {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error('Timed out in test');
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('delivers a request even if the requested side blocks incoming connections', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    // Bob's address can't be reached over TCP (TEST-NET), like a firewall dropping connections
    const b = await boot(profile('Bob'), lan, '192.0.2.1');
    const bobId = b.identity.id;
    const aliceId = a.identity.id;
    await until(() => a.chatList().nearby.some((p) => p.id === bobId) && b.chatList().nearby.some((p) => p.id === aliceId));

    const sent = Date.now();
    a.requestNearby(bobId);
    // Bob connects back to Alice, so her request shows up right away
    await until(() => b.chatList().requests.some((r) => r.id === aliceId), 3000);
    expect(Date.now() - sent).toBeLessThan(3000);
    expect(b.chatList().nearby.some((p) => p.id === aliceId)).toBe(false);

    b.accept(aliceId);
    await until(() => a.contact(bobId)?.state === 'accepted' && b.contact(aliceId)?.state === 'accepted');
    expect(a.isOnline(bobId) && b.isOnline(aliceId)).toBe(true);
  });

  it('connects two people who request each other at the same time', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    const b = await boot(profile('Bob'), lan, '127.0.0.1');
    await until(() => a.chatList().nearby.length === 1 && b.chatList().nearby.length === 1);

    a.requestNearby(b.identity.id);
    b.requestNearby(a.identity.id);
    await until(() => a.contact(b.identity.id)?.state === 'accepted' && b.contact(a.identity.id)?.state === 'accepted');
    expect(a.chatList().requests).toHaveLength(0);
    expect(b.chatList().requests).toHaveLength(0);
  });

  it('accepts when you request someone who already requested you', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    const b = await boot(profile('Bob'), lan, '127.0.0.1');
    await until(() => a.chatList().nearby.length === 1 && b.chatList().nearby.length === 1);

    a.requestNearby(b.identity.id);
    await until(() => b.contact(a.identity.id)?.state === 'incoming');
    // e.g. Bob pressed enter on Alice under Nearby just as her request arrived
    b.requestNearby(a.identity.id);
    expect(b.contact(a.identity.id)?.state).toBe('accepted');
    await until(() => a.contact(b.identity.id)?.state === 'accepted');
  });

  it('shows others under Nearby and reconnects a contact whose address changed', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    const pa = profile('Alice');
    const pb = profile('Bob');
    const a = await boot(pa, lan, '127.0.0.2');
    let b = await boot(pb, lan, '127.0.0.1');
    const bobId = b.identity.id;
    const aliceId = a.identity.id;

    await until(() => a.chatList().nearby.some((p) => p.id === bobId));
    a.requestNearby(bobId);
    await until(() => b.chatList().requests.some((r) => r.id === aliceId));
    b.accept(aliceId);
    await until(() => a.contact(bobId)?.state === 'accepted' && a.isOnline(bobId));

    // Bob comes back with a new address that nobody knows
    await b.stop();
    stores.splice(stores.indexOf(b), 1);
    b.contacts.upsert(aliceId, { lastIp: '10.9.9.8', lastPort: 1 });
    a.contacts.upsert(bobId, { lastIp: '10.9.9.9', lastPort: 1 });
    await until(() => !a.isOnline(bobId));
    b = await boot(pb, lan, '127.0.0.1');

    await until(() => a.isOnline(bobId) && b.isOnline(aliceId), 15_000);
    expect(a.contact(bobId)).toMatchObject({ state: 'accepted', lastIp: '127.0.0.1', lastPort: b.network.port });
  });
});
