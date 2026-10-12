import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { INSTALL_CMD, INSTALL_SPEC, REPO, REPO_CONFIGURED, VERSION } from './version.js';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Numeric x.y.z comparison: <0 if a is older, 0 if equal, >0 if a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** package.json of the default branch; TERMCHAT_UPDATE_URL overrides it (testing). */
export const latestUrl = () => process.env.TERMCHAT_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/main/package.json`;

/** Version published on GitHub, or null if it can't be determined (offline, timeout, garbage …). */
export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<string | null> {
  if (!REPO_CONFIGURED && !process.env.TERMCHAT_UPDATE_URL) return null;
  try {
    const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const version = ((await res.json()) as { version?: unknown })?.version;
    return typeof version === 'string' && VERSION_RE.test(version) ? version : null;
  } catch {
    return null;
  }
}

/** The newer version if there is one. Disabled with TERMCHAT_NO_UPDATE_CHECK=1. */
export async function checkForUpdate(fetchImpl?: typeof fetch): Promise<string | null> {
  if (process.env.TERMCHAT_NO_UPDATE_CHECK === '1') return null;
  const latest = await fetchLatestVersion(fetchImpl);
  return latest && compareVersions(latest, VERSION) > 0 ? latest : null;
}

/** `npm` = installed with `npm i -g …`; `source` = a checkout (`npm run dev`, `npm link`). */
export function installKind(script = process.argv[1] ?? ''): 'npm' | 'source' {
  let real = script;
  try {
    real = fs.realpathSync(script);
  } catch {
    // keep the path as given
  }
  return real.split(path.sep).join('/').includes('/node_modules/termchat/') ? 'npm' : 'source';
}

export const SOURCE_HINT = `This termchat runs from a source folder, so it doesn't update itself.\nUpdate it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD}\`.`;

/**
 * What to install for a known version: the tarball of its release tag. Unlike main's,
 * it can't be stale right after a release, and npm sees a new URL for every version.
 */
export const releaseSpec = (version: string) => `https://github.com/${REPO}/tarball/v${version}`;

function npmInstall(spec: string, inherit: boolean): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const win = process.platform === 'win32';
    let output = '';
    try {
      const p = spawn(win ? 'npm.cmd' : 'npm', ['install', '-g', '--prefer-online', spec], {
        stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        shell: win,
      });
      p.stdout?.on('data', (d) => (output += d));
      p.stderr?.on('data', (d) => (output += d));
      p.on('error', (err) => resolve({ ok: false, output: `${output}\n${err.message}` }));
      p.on('close', (code) => resolve({ ok: code === 0, output }));
    } catch (err) {
      resolve({ ok: false, output: (err as Error).message });
    }
  });
}

/**
 * Installs `version` (or main, if it's unknown) with npm, always fetching the tarball
 * instead of using npm's cached copy. `inherit` shows npm's output in the terminal,
 * otherwise it's captured.
 */
export async function runInstall({ inherit, version }: { inherit: boolean; version?: string | null }): Promise<{ ok: boolean; output: string }> {
  if (!REPO_CONFIGURED) return { ok: false, output: 'The GitHub repo is not set in package.json yet.' };
  if (version) {
    const res = await npmInstall(releaseSpec(version), inherit);
    // no tag for this version (pushed without tags?) – fall back to main
    if (res.ok || installHint(res.output)) return res;
  }
  return npmInstall(INSTALL_SPEC, inherit);
}

/** The version a restart would run, asked from the installed termchat itself (null if unknown). */
export function installedVersion(script = process.argv[1] ?? ''): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, '--version'], { timeout: 15_000 }, (err, stdout) => {
      const version = /termchat (\d+\.\d+\.\d+)/.exec(String(stdout))?.[1];
      resolve(err || !version ? null : version);
    });
  });
}

/** Shown when npm succeeded but the old version is still installed. */
export const staleInstallHint = (installed: string) =>
  `npm finished, but termchat ${installed} is still installed. Reinstall it with \`npm uninstall -g termchat\` and then \`${INSTALL_CMD}\`.`;

/** A hint for the most common install failure. */
export function installHint(output: string): string | null {
  if (/EACCES|permission denied/i.test(output)) {
    return `npm isn't allowed to write to its global folder. Run \`sudo ${INSTALL_CMD}\` in a terminal, or install Node via nvm/fnm/Homebrew so no sudo is needed.`;
  }
  return null;
}

let restart = false;
/** Ask cli.tsx to start termchat again after the app has exited (after /update). */
export const requestRestart = () => void (restart = true);
export const restartRequested = () => restart;
