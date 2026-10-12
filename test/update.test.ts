import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from '../src/commands/builtin.js';
import { checkForUpdate, compareVersions, fetchLatestVersion, installHint, installKind } from '../src/core/update.js';
import { INSTALL_CMD, REPO, REPO_CONFIGURED, VERSION } from '../src/core/version.js';

const reply = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })) as unknown as typeof fetch;

// the fakes ignore the URL; setting one also gets past the "repo not configured yet" guard
beforeEach(() => {
  process.env.TERMCHAT_UPDATE_URL = 'https://example.invalid/package.json';
});
afterEach(() => {
  delete process.env.TERMCHAT_NO_UPDATE_CHECK;
  delete process.env.TERMCHAT_UPDATE_URL;
});

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
  });

  it('reads the version from GitHub and rejects anything odd', async () => {
    expect(await fetchLatestVersion(reply({ version: '2.3.4' }))).toBe('2.3.4');
    expect(await fetchLatestVersion(reply({ version: '2.3.4' }, false))).toBeNull(); // 404
    expect(await fetchLatestVersion(reply('{nope'))).toBeNull();
    expect(await fetchLatestVersion(reply({ version: '9.9.9\u001b[2J' }))).toBeNull();
    expect(await fetchLatestVersion((async () => Promise.reject(new Error('offline'))) as typeof fetch)).toBeNull();
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))) as typeof fetch;
    expect(await fetchLatestVersion(hang, 50)).toBeNull();
  });

  it('never contacts the placeholder repo', async () => {
    delete process.env.TERMCHAT_UPDATE_URL;
    let called = false;
    const spy = (async () => {
      called = true;
      return { ok: true, json: async () => ({ version: '9.9.9' }) };
    }) as unknown as typeof fetch;
    const result = await fetchLatestVersion(spy);
    if (!REPO_CONFIGURED) {
      expect(result).toBeNull();
      expect(called).toBe(false);
    } else expect(result).toBe('9.9.9');
  });

  it('only reports newer versions, and can be switched off', async () => {
    expect(await checkForUpdate(reply({ version: '999.0.0' }))).toBe('999.0.0');
    expect(await checkForUpdate(reply({ version: VERSION }))).toBeNull();
    process.env.TERMCHAT_NO_UPDATE_CHECK = '1';
    expect(await checkForUpdate(reply({ version: '999.0.0' }))).toBeNull();
  });

  it('knows whether it runs from an npm install or a source folder', () => {
    expect(installKind('/usr/local/lib/node_modules/termchat/dist/cli.js')).toBe('npm');
    expect(installKind('/Users/me/code/termchat/dist/cli.js')).toBe('source');
  });

  it('takes the repo from package.json', () => {
    expect(REPO).toMatch(/^[\w.-]+\/termchat$/);
    expect(INSTALL_CMD).toBe(`npm i -g https://github.com/${REPO}/tarball/main`);
    expect(registry.find('update')?.name).toBe('update');
  });

  it('explains common install failures', () => {
    expect(installHint('npm ERR! code EACCES')).toContain('sudo');
    expect(installHint('something else')).toBeNull();
  });
});
