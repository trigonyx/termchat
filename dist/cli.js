#!/usr/bin/env node

// src/cli.tsx
import fs13 from "fs";
import { render } from "ink";
import { spawn as spawn3 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import path3 from "path";

// ../termcore/src/app/paths.ts
import crypto from "crypto";
import os2 from "os";
import path2 from "path";

// ../termcore/src/app/suite.ts
import os from "os";
import path from "path";
var SUITE = {
  termchat: { name: "termchat", tcpPort: 5050, udpPort: 5051, envPrefix: "TERMCHAT" },
  keyrace: { name: "keyrace", tcpPort: 5052, udpPort: 5053, envPrefix: "KEYRACE" },
  termdrop: { name: "termdrop", tcpPort: 5054, udpPort: 5055, envPrefix: "TERMDROP" },
  termhub: { name: "termhub", tcpPort: 5056, udpPort: 5057, envPrefix: "TERMHUB" }
};
var LEGACY_APPS = ["termchat", "keyrace", "termdrop"];
var isSuiteApp = (v) => typeof v === "string" && Object.hasOwn(SUITE, v);
function defineApp(name, pkg, protocol = `${name}/1`) {
  const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? `OWNER/${name}`;
  return { ...SUITE[name], protocol, version: pkg.version, repo };
}
function resolveHomes(app, home, env = process.env) {
  const hubOverride = home ?? env.TERMHUB_HOME;
  const hub = path.resolve(hubOverride ?? path.join(os.homedir(), ".termhub"));
  const appOverride = home ? void 0 : env[`${SUITE[app].envPrefix}_HOME`];
  const appDir2 = path.resolve(appOverride ?? (hubOverride ? path.join(hub, app) : path.join(os.homedir(), `.${app}`)));
  return { hub, app: app === "termhub" ? hub : appDir2 };
}
function legacyDirs(home, env = process.env) {
  return Object.fromEntries(LEGACY_APPS.map((a) => [a, resolveHomes(a, home, env).app]));
}

// ../termcore/src/app/paths.ts
function hubPaths(dir, legacy) {
  return {
    dir,
    identity: path2.join(dir, "identity.json"),
    profile: path2.join(dir, "profile.json"),
    friends: path2.join(dir, "friends.json"),
    peers: path2.join(dir, "peers.json"),
    settings: path2.join(dir, "settings.json"),
    links: path2.join(dir, "links.json"),
    migration: path2.join(dir, "migration.json"),
    runDir: path2.join(dir, "run"),
    legacyDir: path2.join(dir, "legacy"),
    locksDir: path2.join(dir, ".locks"),
    legacy
  };
}
var MAX_SOCKET_PATH = 100;
function socketPath(root, app, platform = process.platform) {
  const tag = crypto.createHash("sha256").update(root).digest("hex").slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\${app}-${tag}`;
  const inHome = path2.join(root, `${app}.sock`);
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path2.join(os2.tmpdir(), `${app}-${tag}.sock`);
}
function basePaths(app, home, env = process.env) {
  const homes = resolveHomes(app, home, env);
  return {
    home: homes.app,
    hub: hubPaths(homes.hub, legacyDirs(home, env)),
    config: path2.join(homes.app, "config.json"),
    log: path2.join(homes.app, `${app}.log`),
    lock: path2.join(homes.app, `${app}.lock`),
    socket: socketPath(homes.app, app)
  };
}

// src/core/paths.ts
function resolvePaths(home, env = process.env) {
  const base = basePaths("termchat", home, env);
  return {
    ...base,
    historyDir: path3.join(base.home, "history"),
    groupsDir: path3.join(base.home, "groups"),
    groupsMeta: path3.join(base.home, "groups.json")
  };
}

// ../termcore/src/app/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os3 from "os";
import path4 from "path";

// ../termcore/src/app/version.ts
var repoConfigured = (app) => !app.repo.startsWith("OWNER/");
var installSpec = (app) => `https://github.com/${app.repo}/tarball/main`;
var installCmd = (app) => `npm i -g ${installSpec(app)}`;

// ../termcore/src/app/update.ts
var VERSION_RE = /^\d+\.\d+\.\d+$/;
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path4.resolve(p);
  }
};
var isRoot = () => process.getuid?.() === 0;
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;
function createUpdater(app) {
  const { name, envPrefix: P } = app;
  const env = (key) => process.env[`${P}_${key}`];
  const VERSION2 = app.version;
  const INSTALL_SPEC2 = installSpec(app);
  const INSTALL_CMD2 = installCmd(app);
  const REPO_CONFIGURED2 = repoConfigured(app);
  const latestUrl2 = () => env("UPDATE_URL") || `https://raw.githubusercontent.com/${app.repo}/main/package.json`;
  async function fetchLatestVersion2(fetchImpl = fetch, timeoutMs = 5e3) {
    if (!REPO_CONFIGURED2 && !env("UPDATE_URL")) return null;
    try {
      const res = await fetchImpl(latestUrl2(), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      const version = (await res.json())?.version;
      return typeof version === "string" && VERSION_RE.test(version) ? version : null;
    } catch {
      return null;
    }
  }
  async function checkForUpdate2(fetchImpl) {
    if (env("NO_UPDATE_CHECK") === "1") return null;
    const latest = await fetchLatestVersion2(fetchImpl);
    return latest && compareVersions(latest, VERSION2) > 0 ? latest : null;
  }
  function installKind2(script = process.argv[1] ?? "") {
    let real = script;
    try {
      real = fs.realpathSync(script);
    } catch {
    }
    return real.split(path4.sep).join("/").includes(`/node_modules/${name}/`) ? "npm" : "source";
  }
  const SOURCE_HINT2 = `This ${name} runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD2}\`.`;
  const releaseSpec2 = (version) => `https://github.com/${app.repo}/tarball/v${version}`;
  const appDir2 = () => env("APP_DIR") || path4.join(os3.homedir(), `.${name}`, "app");
  const specFor = (version) => env("INSTALL_SPEC") || (version ? releaseSpec2(version) : INSTALL_SPEC2);
  function localInstall2(dir = appDir2()) {
    const root = path4.join(dir, "node_modules", name);
    try {
      const pkg = JSON.parse(fs.readFileSync(path4.join(root, "package.json"), "utf8"));
      const cli = path4.join(root, "dist", "cli.js");
      if (pkg?.name !== name || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
      return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
    } catch {
      return null;
    }
  }
  function newerLocalInstall2(self, ownVersion = VERSION2) {
    const local = localInstall2();
    if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
    return realpath(local.cli) === realpath(self) ? null : local;
  }
  function installedInto(script) {
    let dir = path4.dirname(realpath(script));
    while (path4.dirname(dir) !== dir) {
      if (path4.basename(dir) === name && path4.basename(path4.dirname(dir)) === "node_modules") return path4.dirname(dir);
      dir = path4.dirname(dir);
    }
    return null;
  }
  function installTarget2(script = process.argv[1] ?? "", root = isRoot()) {
    const modules = installedInto(script);
    if (!modules) return "global";
    if (realpath(modules).startsWith(realpath(appDir2()) + path4.sep)) return "local";
    if (root) return "global";
    try {
      fs.accessSync(modules, fs.constants.W_OK);
      return "global";
    } catch {
      return "local";
    }
  }
  function npmInstall(spec, inherit, target) {
    const dir = appDir2();
    const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
      // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
      ["install", "--prefix", dir, "--cache", path4.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
    );
    return new Promise((resolve) => {
      const win = process.platform === "win32";
      let output = "";
      try {
        if (target === "local") fs.mkdirSync(dir, { recursive: true });
        const p = spawn(win ? "npm.cmd" : "npm", args, {
          stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
          shell: win
        });
        p.stdout?.on("data", (d) => output += d);
        p.stderr?.on("data", (d) => output += d);
        p.on("error", (err) => resolve({ ok: false, output: `${output}
${err.message}` }));
        p.on("close", (code) => resolve({ ok: code === 0, output }));
      } catch (err) {
        resolve({ ok: false, output: err.message });
      }
    });
  }
  async function runInstall2({ inherit, version }) {
    if (!REPO_CONFIGURED2 && !env("INSTALL_SPEC")) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
    const attempt = async (target2) => {
      if (version && !env("INSTALL_SPEC")) {
        const res2 = await npmInstall(specFor(version), inherit, target2);
        if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
      }
      return npmInstall(specFor(), inherit, target2);
    };
    const target = installTarget2();
    const res = await attempt(target);
    if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) return attempt("local");
    return res;
  }
  function installedVersion2(script = process.argv[1] ?? "") {
    return new Promise((resolve) => {
      execFile(process.execPath, [script, "--version"], { timeout: 15e3 }, (err, stdout) => {
        const version = new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
        resolve(err || !version ? null : version);
      });
    });
  }
  const staleInstallHint2 = (installed) => `npm finished, but ${name} ${installed} is still the version that starts. Try \`${name} update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
  function installHint2(output) {
    if (PERMISSION_RE.test(output)) {
      return `npm isn't allowed to write to ${appDir2()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.${name}\`, then run /update again.`;
    }
    return null;
  }
  return {
    VERSION: VERSION2,
    INSTALL_SPEC: INSTALL_SPEC2,
    INSTALL_CMD: INSTALL_CMD2,
    REPO_CONFIGURED: REPO_CONFIGURED2,
    SOURCE_HINT: SOURCE_HINT2,
    latestUrl: latestUrl2,
    fetchLatestVersion: fetchLatestVersion2,
    checkForUpdate: checkForUpdate2,
    installKind: installKind2,
    releaseSpec: releaseSpec2,
    appDir: appDir2,
    localInstall: localInstall2,
    newerLocalInstall: newerLocalInstall2,
    installTarget: installTarget2,
    runInstall: runInstall2,
    installedVersion: installedVersion2,
    staleInstallHint: staleInstallHint2,
    installHint: installHint2
  };
}

// package.json
var package_default = {
  name: "termchat",
  version: "2.0.0",
  description: "End-to-end encrypted peer-to-peer chat for your local network, right in the terminal.",
  repository: {
    type: "git",
    url: "git+https://github.com/trigonyx/termchat.git"
  },
  homepage: "https://github.com/trigonyx/termchat#readme",
  bugs: {
    url: "https://github.com/trigonyx/termchat/issues"
  },
  type: "module",
  bin: {
    termchat: "dist/cli.js"
  },
  files: [
    "dist"
  ],
  engines: {
    node: ">=22"
  },
  scripts: {
    dev: "tsx src/cli.tsx",
    build: "tsup",
    start: "node dist/cli.js",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    release: "node scripts/release.mjs"
  },
  dependencies: {
    chalk: "5.6.2",
    "cli-highlight": "2.1.11",
    ink: "6.8.0",
    marked: "16.4.1",
    react: "19.2.0",
    "string-width": "8.1.0",
    "wrap-ansi": "9.0.2"
  },
  devDependencies: {
    "@types/node": "24.9.1",
    "@types/react": "19.2.2",
    "ink-testing-library": "4.0.0",
    termcore: "file:../termcore",
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/app.ts
var APP = defineApp("termchat", package_default);

// src/core/update.ts
var {
  latestUrl,
  fetchLatestVersion,
  checkForUpdate,
  installKind,
  SOURCE_HINT,
  releaseSpec,
  appDir,
  localInstall,
  newerLocalInstall,
  installTarget,
  runInstall,
  installedVersion,
  staleInstallHint,
  installHint
} = createUpdater(APP);

// src/core/version.ts
var VERSION = APP.version;
var REPO = APP.repo;
var REPO_CONFIGURED = repoConfigured(APP);
var INSTALL_SPEC = installSpec(APP);
var INSTALL_CMD = installCmd(APP);

// ../termcore/src/app/instance.ts
import fs3 from "fs";
import net from "net";
import path6 from "path";

// ../termcore/src/app/storage.ts
import fs2 from "fs";
import path5 from "path";
function readJson(file, fallback) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    try {
      fs2.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
    }
    return fallback;
  }
}
var tmpSeq = 0;
function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}
function writeFileAtomic(file, content) {
  ensureDir(path5.dirname(file));
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    fs2.writeFileSync(tmp, content, { mode: 384 });
    fs2.renameSync(tmp, file);
  } catch (err) {
    fs2.rmSync(tmp, { force: true });
    throw err;
  }
}
function appendJsonl(file, entry) {
  ensureDir(path5.dirname(file));
  fs2.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 384 });
}
function readJsonl(file) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function ensureDir(dir) {
  fs2.mkdirSync(dir, { recursive: true, mode: 448 });
}

// ../termcore/src/app/instance.ts
var STARTUP_GRACE = 1e4;
var MAX_REQUEST = 1024 * 1024;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function probeSocket(socket, timeoutMs = 1e3) {
  return new Promise((resolve) => {
    const c2 = net.connect(socket);
    const done = (ok) => {
      clearTimeout(timer);
      c2.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c2.once("connect", () => done(true));
    c2.once("error", () => done(false));
  });
}
function readLock(file) {
  try {
    const o = JSON.parse(fs3.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.startedAt === "number" && typeof o.socket === "string" ? o : null;
  } catch {
    return null;
  }
}
async function acquireLock(lockFile, socket, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path6.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = { pid: process.pid, startedAt: now(), socket };
    try {
      fs3.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx", mode: 384 });
      return {
        release: () => {
          if (readLock(lockFile)?.pid === process.pid) fs3.rmSync(lockFile, { force: true });
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock(lockFile);
    const stale = !holder || holder.pid === process.pid || !isAlive(holder.pid) || !await probe(holder.socket) && now() - holder.startedAt > STARTUP_GRACE;
    if (!stale) return { holder };
    fs3.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}
async function startInstanceServer(socket, onRequest) {
  if (process.platform !== "win32") {
    ensureDir(path6.dirname(socket));
    fs3.rmSync(socket, { force: true });
  }
  const server = net.createServer((conn) => {
    conn.on("error", () => {
    });
    if (!onRequest) {
      conn.end();
      return;
    }
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5e3, () => conn.destroy());
    conn.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      let reply = "";
      try {
        reply = onRequest(buf.slice(0, nl));
      } catch {
      }
      conn.end(reply + "\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") fs3.chmodSync(socket, 384);
  server.on("error", () => {
  });
  server.unref();
  return server;
}

// src/ui/App.tsx
import { Box as Box12, Text as Text13, useApp, useInput as useInput6 } from "ink";
import { useCallback, useEffect as useEffect7, useMemo as useMemo2, useRef as useRef6, useState as useState9 } from "react";

// src/commands/builtin.ts
import net3 from "net";

// src/core/clipboard.ts
import { spawn as spawn2 } from "child_process";
var TOOLS = {
  darwin: [["pbcopy", []]],
  win32: [["clip", []]],
  linux: [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]]
  ]
};
function run(cmd, args, text) {
  return new Promise((resolve) => {
    try {
      const p = spawn2(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
      p.stdin.on("error", () => {
      });
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}
async function copyToClipboard(text) {
  for (const [cmd, args] of TOOLS[process.platform] ?? []) {
    if (await run(cmd, args, text)) return;
  }
  throw new Error("No clipboard tool found (pbcopy, wl-copy, xclip or xsel)");
}

// src/core/export.ts
import fs4 from "fs";
import path7 from "path";
function stamp(ts) {
  const d = new Date(ts);
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function exportChat(store, chatId, file) {
  const chat = store.chat(chatId);
  if (!chat) throw new Error("Unknown chat");
  const title = chat.kind === "group" ? `#${chat.display}` : `Chat with ${chat.display}`;
  const safeName = chat.display.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const target = path7.resolve(file || `termchat-${safeName}-${stamp(Date.now()).slice(0, 10)}.md`);
  const lines = [`# ${title}`, "", `_Exported on ${stamp(Date.now())}_`, ""];
  for (const item of store.items(chatId)) {
    if (item.kind === "note") {
      lines.push(`_${item.text}_ \xB7 ${stamp(item.ts)}`, "");
      continue;
    }
    const who = item.mine ? store.me.name : item.senderName;
    lines.push(`**${who}** \xB7 ${stamp(item.ts)}`, "", item.text, "", "---", "");
  }
  fs4.writeFileSync(target, lines.join("\n"), "utf8");
  return target;
}

// ../termcore/src/net/identity.ts
import crypto2 from "crypto";
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[value << 5 - bits & 31];
  return out;
}
function fingerprint(publicRaw) {
  return base32(crypto2.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto2.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto2.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function isIdentityFile(o) {
  const f = o;
  return !!f && f.v === 1 && typeof f.publicKey === "string" && typeof f.privateKey === "string" && !!f.publicKey && !!f.privateKey;
}
function identityFromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto2.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function generateIdentityFile() {
  const { privateKey } = crypto2.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  return { v: 1, publicKey: jwk.x, privateKey: jwk.d };
}
function readIdentity(file) {
  const existing = readJson(file, null);
  if (!isIdentityFile(existing)) return null;
  try {
    return identityFromFile(existing);
  } catch {
    return null;
  }
}
function loadOrCreateIdentity(file) {
  const existing = readIdentity(file);
  if (existing) return existing;
  const created = generateIdentityFile();
  writeJsonAtomic(file, created);
  return identityFromFile(created);
}

// ../termcore/src/ui/theme.ts
import chalk from "chalk";

// ../termcore/src/app/sanitize.ts
var ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[PX^_][^\u001b]*(?:\u001b\\)?|[@-Z\\-_])?/g;
var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
var BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
var MAX_TEXT = 16e3;
var MAX_NAME = 32;
function sanitizeText(input) {
  return input.replace(/\r\n?/g, "\n").replace(ANSI, "").replace(CONTROL, "").replace(BIDI, "").replace(/\t/g, "    ");
}
function cleanName(input) {
  if (typeof input !== "string") return "Unknown";
  const name = sanitizeText(input).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || "Unknown";
}

// ../termcore/src/friends/profile.ts
var STATUSES = ["available", "busy", "dnd"];
var MAX_STATUS_MSG = 60;
var PROFILE_COLORS = [
  { name: "coral", hex: "#f7768e" },
  { name: "orange", hex: "#ff9e64" },
  { name: "amber", hex: "#e0af68" },
  { name: "lime", hex: "#b9e66b" },
  { name: "green", hex: "#9ece6a" },
  { name: "teal", hex: "#73daca" },
  { name: "cyan", hex: "#7dcfff" },
  { name: "blue", hex: "#7aa2f7" },
  { name: "indigo", hex: "#8f8cf2" },
  { name: "purple", hex: "#bb9af7" },
  { name: "pink", hex: "#ff8fc7" },
  { name: "sand", hex: "#d8c4a0" }
];
function normalizeColor(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  const named = PROFILE_COLORS.find((c2) => c2.name === v);
  if (named) return named.hex;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (!m) return null;
  return "#" + (m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1]);
}
var isStatus = (v) => typeof v === "string" && STATUSES.includes(v);
function cleanStatusMsg(input) {
  if (typeof input !== "string") return void 0;
  const msg = [...sanitizeText(input).replace(/\s+/g, " ").trim()].slice(0, MAX_STATUS_MSG).join("");
  return msg || void 0;
}

// ../termcore/src/ui/theme.ts
var DEFAULT_ACCENT = "#D97757";
var theme = {
  accent: DEFAULT_ACCENT,
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8",
  /** text on an accent background */
  onAccent: "#1E1E1E",
  /** text still to type (keyrace) */
  text: "#D4D4D4",
  /** text typed correctly (keyrace) */
  typed: "#FFFFFF"
};
function setAccent(hex) {
  const next = normalizeColor(hex) ?? DEFAULT_ACCENT;
  if (next.toLowerCase() === theme.accent.toLowerCase()) return false;
  theme.accent = next;
  return true;
}
var c = {
  get accent() {
    return chalk.hex(theme.accent);
  },
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic
};
var icons = {
  pointer: "\u276F",
  online: "\u25CF",
  offline: "\u25CB",
  away: "\u25D0",
  busy: "\u25D1",
  dnd: "\u2298",
  send: "\u25B6",
  racing: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  done: "\u2713",
  delivered: "\u2713",
  read: "\u2713\u2713",
  error: "\u2717",
  info: "\xB7",
  star: "\u2605",
  up: "\u2191",
  down: "\u2193",
  file: "\u25AA",
  group: "#",
  left: "\u23CF",
  flag: "\u{1F3C1}"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function idHex(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}
var profileColor = null;
function setPersonColors(lookup) {
  profileColor = lookup;
}
function senderHex(id) {
  return profileColor?.(id) ?? idHex(id);
}
function senderColor(id) {
  return chalk.hex(senderHex(id));
}
function personHex(id, color) {
  return color ?? senderHex(id);
}

// ../termcore/src/ui/presence.ts
function presenceDot(p) {
  if (!p.online) return { icon: icons.offline, color: theme.faint };
  if (p.status === "dnd") return { icon: icons.dnd, color: theme.error };
  if (p.status === "busy") return { icon: icons.busy, color: theme.warning };
  if (p.away) return { icon: icons.away, color: theme.dim };
  return { icon: icons.online, color: theme.success };
}
function statusText(status, msg) {
  const label = status === "busy" ? "busy" : status === "dnd" ? "do not disturb" : "";
  return [label, msg].filter(Boolean).join(" \xB7 ");
}

// src/ui/effects.ts
import chalk3 from "chalk";
import stringWidth from "string-width";

// ../termcore/src/ui/effects.ts
import chalk2 from "chalk";
import { useEffect, useState } from "react";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var ANIM_MS = 8e3;
function effectTime(mode, now, since) {
  if (mode === "off") return ANIM_MS;
  const t = Math.max(0, now - since);
  return mode === "brief" ? Math.min(t, ANIM_MS) : t;
}
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
var SHINE_EVERY = 6e3;
function shineColor(base, col, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
function shineLine(line, row, width, hex, t) {
  if (t < 0 || t >= SHINE_SWEEP) return chalk2.hex(hex)(line);
  const base = hexToRgb(hex);
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (ch === " ") out += ch;
    else {
      const [r, g, b] = shineColor(base, col, row, width, t);
      out += chalk2.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    }
    col++;
  }
  return out;
}
var BRIEF_GLINTS = 2;
function useShine(active, mode = "brief", delay = 250) {
  const [t, setT] = useState(-1);
  useEffect(() => {
    if (!active || mode === "off") {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    let played = 0;
    const play = () => {
      const t0 = Date.now();
      played++;
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        if (mode === "nonstop" || played < BRIEF_GLINTS) next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, mode, delay]);
  return t;
}

// ../termcore/src/friends/links.ts
import crypto3 from "crypto";
var B64_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
var B64_SIG_RE = /^[A-Za-z0-9_-]{86}$/;
var MAX_LINKS = 8;
function payload(old, next, ts) {
  return Buffer.from(`termhub/link/1
${old}
${next}
${ts}`);
}
function createLink(oldId, newId, ts = Date.now()) {
  const old = oldId.publicRaw.toString("base64url");
  const next = newId.publicRaw.toString("base64url");
  const p = payload(old, next, ts);
  return {
    v: 1,
    old,
    new: next,
    ts,
    so: crypto3.sign(null, p, oldId.privateKey).toString("base64url"),
    sn: crypto3.sign(null, p, newId.privateKey).toString("base64url")
  };
}
function parseLink(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  if (typeof o.old !== "string" || !B64_KEY_RE.test(o.old) || typeof o.new !== "string" || !B64_KEY_RE.test(o.new)) return null;
  if (o.old === o.new) return null;
  if (typeof o.so !== "string" || !B64_SIG_RE.test(o.so) || typeof o.sn !== "string" || !B64_SIG_RE.test(o.sn)) return null;
  if (typeof o.ts !== "number" || !Number.isSafeInteger(o.ts) || o.ts < 0) return null;
  return { v: 1, old: o.old, new: o.new, ts: o.ts, so: o.so, sn: o.sn };
}
function verifyLink(link) {
  try {
    const p = payload(link.old, link.new, link.ts);
    const oldKey = Buffer.from(link.old, "base64url");
    const newKey = Buffer.from(link.new, "base64url");
    if (oldKey.length !== 32 || newKey.length !== 32) return false;
    return crypto3.verify(null, p, publicKeyFromRaw(oldKey), Buffer.from(link.so, "base64url")) && crypto3.verify(null, p, publicKeyFromRaw(newKey), Buffer.from(link.sn, "base64url"));
  } catch {
    return false;
  }
}
var linkOldId = (l) => fingerprint(Buffer.from(l.old, "base64url"));
var linkNewId = (l) => fingerprint(Buffer.from(l.new, "base64url"));
function resolveId(id, byOld) {
  const seen = /* @__PURE__ */ new Set();
  let cur = id;
  while (byOld.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = byOld.get(cur);
  }
  return cur;
}

// ../termcore/src/friends/state.ts
var REL_STATES = ["accepted", "outgoing", "none"];
var CONTACT_STATES = ["accepted", "outgoing", "incoming", "declined", "blocked"];
var STATE_RANK = { blocked: 5, accepted: 4, outgoing: 3, incoming: 2, declined: 1 };
function strongerState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}
function reconcile(mine, theirs) {
  const peerWants = theirs === "accepted" || theirs === "outgoing";
  switch (mine) {
    case "blocked":
      return "blocked";
    case "accepted":
    case "outgoing":
      return peerWants ? "accepted" : "outgoing";
    case "incoming":
      return peerWants ? "incoming" : null;
    case "declined":
      return peerWants ? "incoming" : "declined";
    case null:
      return peerWants ? "incoming" : null;
  }
}
function relStateFor(state) {
  return state === "accepted" || state === "outgoing" ? state : "none";
}

// ../termcore/src/store/files.ts
var ANIMATIONS = ["nonstop", "brief", "off"];
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
function parsePorts(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseApps(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, fields] of Object.entries(v)) {
    if (isSuiteApp(k) && fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length) {
      out[k] = fields;
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function compact(o) {
  for (const k of Object.keys(o)) if (o[k] === void 0) delete o[k];
  return o;
}
function parseFriend(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  if (!CONTACT_STATES.includes(o.state)) return null;
  const now = Date.now();
  return compact({
    id: o.id,
    publicKey: typeof o.publicKey === "string" ? o.publicKey : "",
    name: cleanName(o.name),
    alias: typeof o.alias === "string" && o.alias.trim() ? cleanName(o.alias) : void 0,
    state: o.state,
    color: normalizeColor(o.color) ?? void 0,
    lastIp: typeof o.lastIp === "string" && IPV4_RE.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen),
    lastActivity: num(o.lastActivity) ?? now,
    createdAt: num(o.createdAt) ?? now,
    apps: parseApps(o.apps)
  });
}
function parseKnownPeer(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  return compact({
    id: o.id,
    name: cleanName(o.name),
    lastIp: typeof o.lastIp === "string" && IPV4_RE.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen)
  });
}
function uniqueById(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of list) {
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
function parseFriendsFile(raw) {
  const list = raw?.friends;
  return { v: 1, friends: Array.isArray(list) ? uniqueById(list.map(parseFriend)) : [] };
}
function parsePeersFile(raw) {
  const list = raw?.peers;
  return { v: 1, peers: Array.isArray(list) ? uniqueById(list.map(parseKnownPeer)) : [] };
}
function parseProfile(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim()) return null;
  return compact({
    v: 1,
    name: cleanName(o.name),
    color: normalizeColor(o.color) ?? void 0,
    status: isStatus(o.status) ? o.status : "available",
    statusMsg: cleanStatusMsg(o.statusMsg)
  });
}
var DEFAULT_SETTINGS = { v: 1, animations: "brief", notifications: true };
function parseSettings(raw) {
  const o = raw ?? {};
  return compact({
    v: 1,
    accent: normalizeColor(o.accent) ?? void 0,
    animations: ANIMATIONS.includes(o.animations) ? o.animations : DEFAULT_SETTINGS.animations,
    notifications: typeof o.notifications === "boolean" ? o.notifications : DEFAULT_SETTINGS.notifications
  });
}
function parseLinksFile(raw) {
  const o = raw ?? {};
  const links = (v) => Array.isArray(v) ? v.map(parseLink).filter((l) => l !== null) : [];
  return { v: 1, mine: links(o.mine), known: links(o.known) };
}

// src/ui/effects.ts
var RB_OPEN = "\u2062";
var RB_CLOSE = "\u2063";
var SH_OPEN = "\u2064";
var SH_CLOSE = "\u2061";
var MARKERS_IN_INPUT = /[⁡-⁤]/g;
var TOKEN = /⁢|⁣|⁤[︀-️]{6}|⁡/g;
var SEGMENT = /(\u001b\[[0-9;]*m)|(⁢)|(⁣)|⁤([︀-️]{6})|(⁡)|([^\u001b⁡-⁤]+|[\s\S])/gu;
var NAMED = {
  red: "ff5555",
  orange: "ff9e64",
  yellow: "ffe066",
  gold: "ffd24a",
  green: "6fdc6f",
  lime: "b5ff5c",
  teal: "2ec4b6",
  cyan: "5ce1ff",
  aqua: "5ce1ff",
  blue: "5c8dff",
  purple: "b07cff",
  violet: "b07cff",
  magenta: "ff5cf0",
  pink: "ff8fc7",
  white: "f2f2f2",
  gray: "9a9a9a",
  grey: "9a9a9a"
};
function parseColor(input) {
  const v = (input ?? "").trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (m) return m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1];
  return theme.accent.slice(1).toLowerCase();
}
var encodeColor = (hex) => [...hex].map((d) => String.fromCharCode(65024 + parseInt(d, 16))).join("");
var decodeColor = (vs) => [...vs].map((ch) => (ch.charCodeAt(0) - 65024).toString(16)).join("");
function sanitizeInput(text) {
  return text.replace(MARKERS_IN_INPUT, "");
}
function tagMarker(raw) {
  const tag = raw.trim();
  if (/^<rgb\s*>$/i.test(tag)) return RB_OPEN;
  if (/^<\/rgb\s*>$/i.test(tag)) return RB_CLOSE;
  if (/^<\/shine\s*>$/i.test(tag)) return SH_CLOSE;
  const m = /^<shine(?:\s+color\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s<>"']+)))?\s*>$/i.exec(tag);
  if (m) return SH_OPEN + encodeColor(parseColor(m[1] ?? m[2] ?? m[3]));
  return null;
}
var hasTags = (text) => /<\/?(?:rgb|shine)[\s>]/i.test(text);
var hasEffects = (line) => /[⁡-⁤]/.test(line);
function stripTags(text) {
  return text.replace(/<\/?(?:rgb|shine)(?:\s[^<>]*)?>/gi, "");
}
function stripMarkers(line) {
  return line.replace(TOKEN, "");
}
function closeSpansPerLine(lines) {
  const stack = [];
  return lines.map((line) => {
    const prefix = stack.join("");
    for (const [tok] of line.matchAll(TOKEN)) {
      if (tok === RB_OPEN || tok[0] === SH_OPEN) stack.push(tok);
      else {
        const open = tok === RB_CLOSE ? RB_OPEN : SH_OPEN;
        const at = stack.map((s) => s[0]).lastIndexOf(open);
        if (at >= 0) stack.splice(at, 1);
      }
    }
    const suffix = [...stack].reverse().map((s) => s === RB_OPEN ? RB_CLOSE : SH_CLOSE).join("");
    return prefix || suffix ? prefix + line + suffix : line;
  });
}
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
var RAINBOW_PERIOD = 30;
var RAINBOW_SPEED = 9;
var SHINE_CYCLE = 3600;
var SHINE_SWEEP2 = 800;
var SHINE_HALF2 = 3;
function rainbowColor(col, now) {
  const phase = ((col + RAINBOW_SPEED * now / 1e3) % RAINBOW_PERIOD + RAINBOW_PERIOD) % RAINBOW_PERIOD;
  const dist = Math.min(phase, RAINBOW_PERIOD - phase);
  const white = Math.max(0, 1 - dist / 2.5) * 0.75;
  return mix(hslToRgb(phase / RAINBOW_PERIOD * 360, 0.85, 0.64), WHITE, white);
}
function shineColor2(base, col, width, now) {
  const u = now % SHINE_CYCLE / SHINE_SWEEP2;
  if (u >= 1) return base;
  const center = (width + 2 * SHINE_HALF2) * (1 - u) - SHINE_HALF2;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF2);
  return mix(base, WHITE, strength * 0.8);
}
var graphemes = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function applyEffects(line, now) {
  if (!hasEffects(line)) return line;
  const parts = [...line.matchAll(SEGMENT)];
  const spans = [];
  const open = [];
  for (const m of parts) {
    if (m[2] || m[4] !== void 0) {
      const hex = m[4] !== void 0 ? decodeColor(m[4]) : "";
      const span = m[2] ? { kind: "rainbow", base: [0, 0, 0], width: 0 } : { kind: "shine", base: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), width: 0 };
      spans.push(span);
      open.push(span);
    } else if (m[3] || m[5]) {
      const at = open.map((s) => s.kind).lastIndexOf(m[3] ? "rainbow" : "shine");
      if (at >= 0) open.splice(at, 1);
    } else if (m[6] && !m[1] && open.length) {
      open[open.length - 1].width += stringWidth(m[6]);
    }
  }
  let out = "";
  let next = 0;
  let col = 0;
  const stack = [];
  for (const m of parts) {
    if (m[1]) out += m[1];
    else if (m[2] || m[4] !== void 0) stack.push({ span: spans[next++], col: 0 });
    else if (m[3] || m[5]) {
      const at = stack.map((s) => s.span.kind).lastIndexOf(m[3] ? "rainbow" : "shine");
      if (at >= 0) stack.splice(at, 1);
    } else if (m[6]) {
      const top = stack[stack.length - 1];
      if (!top) {
        out += m[6];
        col += stringWidth(m[6]);
        continue;
      }
      for (const { segment } of graphemes.segment(m[6])) {
        const w = stringWidth(segment);
        if (w > 0 && segment.trim()) {
          const [r, g, b] = top.span.kind === "rainbow" ? rainbowColor(col, now) : shineColor2(top.span.base, top.col, top.span.width, now);
          out += chalk3.rgb(Math.round(r), Math.round(g), Math.round(b))(segment);
        } else out += segment;
        top.col += w;
        col += w;
      }
    }
  }
  return out;
}
function autoCloseTag(value, cursor) {
  const m = /<(rgb|shine)(?:\s[^<>]*)?>$/i.exec(value.slice(0, cursor));
  if (!m) return null;
  const closing = `</${m[1].toLowerCase()}>`;
  return value.slice(cursor).toLowerCase().startsWith(closing) ? null : closing;
}
var TAGS = [
  { name: "rgb", open: "<rgb>", close: "</rgb>", description: "Rainbow colors running across the text" },
  {
    name: "shine",
    open: '<shine color="gold">',
    close: "</shine>",
    description: "Colored text with a shimmer \xB7 color = red, gold, cyan, pink \u2026 or #rrggbb"
  }
];
var TAG_PREFIX = /(?:^|[^\w<])<([a-z]*)$/i;
function tagSuggestions(value, cursor) {
  const m = TAG_PREFIX.exec(value.slice(0, cursor));
  if (!m) return [];
  const partial = m[1].toLowerCase();
  return TAGS.filter((t) => t.name.startsWith(partial));
}
function tagStart(value, cursor) {
  const m = TAG_PREFIX.exec(value.slice(0, cursor));
  return m ? cursor - m[1].length - 1 : -1;
}
function insertTag(state, tag) {
  const at = tagStart(state.value, state.cursor);
  if (at < 0) return state;
  const value = state.value.slice(0, at) + tag.open + tag.close + state.value.slice(state.cursor);
  return { value, cursor: at + tag.open.length };
}

// src/ui/markdown.ts
import chalk4 from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";
import { Lexer } from "marked";
import stringWidth2 from "string-width";
import wrapAnsi from "wrap-ansi";
var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
var unescape = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
var OPTIONS = { gfm: true, breaks: true };
var CODE_SPACE = "\uE000";
var CODE_SPACES = /\uE000/g;
function strike(text) {
  return text.split(/(\u001b\[[0-9;]*m|[\u2061-\u2064][\ufe00-\ufe0f]*)/).map(
    (part, i) => i % 2 ? part : [...graphemes2.segment(part)].map(({ segment }) => segment.trim() ? segment + "\u0336" : segment).join("")
  ).join("");
}
var graphemes2 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function codeContent(raw) {
  const n = /^`+/.exec(raw)?.[0].length ?? 0;
  let code = raw.slice(n, raw.length - n);
  if (/^ .*[^ ].* $/s.test(code)) code = code.slice(1, -1);
  return code;
}
function fenceMultilineCode(text) {
  let out = "";
  let i = 0;
  let inFence = null;
  while (i < text.length) {
    const lineStart2 = i === 0 || text[i - 1] === "\n";
    if (lineStart2) {
      const fence2 = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(i));
      if (fence2 && (!inFence || fence2[1].startsWith(inFence))) {
        inFence = inFence ? null : fence2[1];
        const end = text.indexOf("\n", i);
        const stop = end === -1 ? text.length : end + 1;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (inFence || text[i] !== "`" || text[i - 1] === "\\") {
      out += text[i++];
      continue;
    }
    const run2 = /^`+/.exec(text.slice(i))[0];
    const close = run2.length < 3 ? findRun(text, i + run2.length, run2.length) : -1;
    const code = close === -1 ? "" : text.slice(i + run2.length, close);
    if (!code.includes("\n")) {
      out += close === -1 ? run2 : text.slice(i, close + run2.length);
      i = close === -1 ? i + run2.length : close + run2.length;
      continue;
    }
    const body = code.replace(/^[ \t]*\n/, "").replace(/\n[ \t]*$/, "");
    const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    out += `${out && !out.endsWith("\n") ? "\n" : ""}${fence}
${body}
${fence}
`;
    i = close + run2.length;
    if (text[i] === "\n") i++;
  }
  return out;
}
function findRun(text, from, n) {
  const re = /`+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) if (m[0].length === n) return m.index;
  return -1;
}
function wrap(text, width, trim = true) {
  return wrapAnsi(text, Math.max(1, width), { hard: true, trim }).split("\n");
}
function inline(tokens) {
  if (!tokens) return "";
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out += "tokens" in t && t.tokens ? inline(t.tokens) : unescape(t.text);
        break;
      case "strong":
        out += chalk4.bold(inline(t.tokens));
        break;
      case "em":
        out += chalk4.italic(inline(t.tokens));
        break;
      case "del":
        out += strike(inline(t.tokens));
        break;
      case "codespan":
        out += c.code(codeContent(t.raw).replace(/ /g, CODE_SPACE));
        break;
      case "link": {
        const l = t;
        const label = inline(l.tokens);
        out += l.text === l.href || label === l.href ? c.accent.underline(l.href) : `${c.accent.underline(label)} ${c.dim(`(${l.href})`)}`;
        break;
      }
      case "image":
        out += c.dim(`[Image: ${t.text || "untitled"}] ${t.href}`);
        break;
      case "br":
        out += "\n";
        break;
      case "escape":
        out += t.text;
        break;
      case "html":
        out += tagMarker(t.raw) ?? ("text" in t && typeof t.text === "string" ? t.text : t.raw);
        break;
      default:
        out += "text" in t && typeof t.text === "string" ? t.text : t.raw;
    }
  }
  return out;
}
function heading(t) {
  const text = inline(t.tokens);
  if (t.depth === 1) return chalk4.bold.underline.hex(theme.accent)(text);
  if (t.depth === 2) return chalk4.bold.hex(theme.accent)(text);
  if (t.depth === 3) return chalk4.bold(text);
  return chalk4.bold.hex(theme.dim)(text);
}
function codeBlock(t, width) {
  const lang = t.lang?.split(/\s/)[0];
  let body;
  try {
    body = lang && supportsLanguage(lang) ? highlight(t.text, { language: lang, ignoreIllegals: true }) : c.code(t.text);
  } catch {
    body = c.code(t.text);
  }
  const lines = body.split("\n").flatMap((l) => wrap(l, width - 1, false));
  const code = lines.map((l) => ` ${l}`);
  return lang ? [c.faint(lang), ...code] : code;
}
function table(t, width) {
  const head = t.header.map((h) => chalk4.bold(inline(h.tokens)));
  const rows = t.rows.map((r) => r.map((cell) => inline(cell.tokens)));
  const cols = head.length;
  const widths = Array.from(
    { length: cols },
    (_, i) => Math.max(stringWidth2(head[i] ?? ""), ...rows.map((r) => stringWidth2(r[i] ?? "")))
  );
  const total = widths.reduce((a, b) => a + b, 0) + (cols - 1) * 3;
  if (total > width) {
    return rows.flatMap((r) => r.map((cell, i) => `${head[i]}: ${cell}`).flatMap((l) => wrap(l, width)));
  }
  const pad2 = (s, w) => s + " ".repeat(Math.max(0, w - stringWidth2(s)));
  const line = (cells) => cells.map((cell, i) => pad2(cell, widths[i])).join(c.faint(" \u2502 "));
  return [line(head), c.faint(widths.map((w) => "\u2500".repeat(w)).join("\u2500\u253C\u2500")), ...rows.map(line)];
}
function blocks(tokens, width) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case "space":
        if (out.length) out.push("");
        break;
      case "heading":
        out.push(...wrap(heading(t), width));
        break;
      case "paragraph":
        out.push(...wrap(inline(t.tokens), width));
        break;
      case "text": {
        const tt = t;
        out.push(...wrap(tt.tokens ? inline(tt.tokens) : unescape(tt.text), width));
        break;
      }
      case "code":
        out.push(...codeBlock(t, width));
        break;
      case "blockquote": {
        const inner = blocks(t.tokens, width - 2);
        out.push(...inner.map((l) => c.faint("\u258E ") + c.dim(l)));
        break;
      }
      case "list": {
        const list = t;
        const start2 = typeof list.start === "number" ? list.start : 1;
        list.items.forEach((item, i) => {
          let bullet = list.ordered ? `${start2 + i}.` : "\u2022";
          if (item.task) bullet = item.checked ? c.success("\u2611") : "\u2610";
          const bw = stringWidth2(bullet) + 1;
          const body = blocks(item.tokens.filter((x) => x.type !== "checkbox"), width - bw);
          body.forEach((l, j) => out.push((j === 0 ? c.dim(bullet) + " " : " ".repeat(bw)) + l));
        });
        break;
      }
      case "hr":
        out.push(c.faint("\u2500".repeat(Math.min(width, 40))));
        break;
      case "table":
        out.push(...table(t, width));
        break;
      case "html": {
        const raw = t.raw.replace(/\n+$/, "");
        out.push(...wrap(hasTags(raw) ? inline(new Lexer(OPTIONS).inlineTokens(raw)) : unescape(raw), width));
        break;
      }
      default:
        out.push(...wrap(unescape(t.raw.replace(/\n+$/, "")), width));
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}
function renderMarkdown(text, width) {
  let tokens;
  try {
    tokens = new Lexer(OPTIONS).lex(fenceMultilineCode(sanitizeInput(text).replace(CODE_SPACES, "")));
  } catch {
    return wrap(stripTags(text), width);
  }
  const lines = closeSpansPerLine(blocks(tokens, Math.max(10, width)).map((l) => l.replace(CODE_SPACES, " ")));
  return lines.length ? lines : [""];
}
function plainPreview(text) {
  return stripTags(text).replace(/```[\s\S]*?```/g, "[Code]").replace(/[*_~`>#]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
}
function codeBlocks(text) {
  let tokens;
  try {
    tokens = new Lexer(OPTIONS).lex(fenceMultilineCode(sanitizeInput(text)));
  } catch {
    return [];
  }
  const out = [];
  const walk = (list) => {
    for (const t of list) {
      if (t.type === "code") out.push(t.text);
      if ("tokens" in t && Array.isArray(t.tokens)) walk(t.tokens);
      if (t.type === "list") walk(t.items);
    }
  };
  walk(tokens);
  return out;
}

// ../termcore/src/ui/commands/parse.ts
function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const name = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();
  return { name, args: tokenize(rest), rest };
}
function tokenize(text) {
  const args = [];
  let current = "";
  let quote = null;
  let inToken = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) args.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) args.push(current);
  return args;
}

// ../termcore/src/ui/commands/registry.ts
var CommandRegistry = class {
  constructor(commands, rules) {
    this.commands = commands;
    this.rules = rules;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  fits(c2, where) {
    return c2.scope === "global" || !this.rules || where === void 0 || this.rules.inScope(c2.scope, where);
  }
  /** Commands available here (all of them without a place). */
  available(where) {
    return this.commands.filter((c2) => this.fits(c2, where));
  }
  /** Commands available here, filtered by prefix. */
  suggest(prefix, where) {
    const p = prefix.toLowerCase();
    return this.available(where).filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
  }
  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input, ctx) {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;
    if (!parsed.name) {
      ui.print("Type a command, e.g. /help", "error");
      return true;
    }
    const where = this.rules?.where(ctx);
    const cmd = this.available(where).find((c2) => c2.name === parsed.name || c2.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
      return true;
    }
    if (!this.fits(cmd, where)) {
      ui.print(this.rules.outOfScope(cmd.name, cmd.scope, where), "error");
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ""}`.trim(), "error");
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err) {
      ui.print(`/${cmd.name} failed: ${err.message}`, "error");
    }
    return true;
  }
};

// src/core/store.ts
import crypto8 from "crypto";

// ../termcore/src/app/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text, kind = "info", extra) {
    this.current = { ...extra, text, kind };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
    }, this.ms);
    this.timer.unref();
    this.changed();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
};

// ../termcore/src/friends/merge.ts
var max = (a, b) => a === void 0 ? b : b === void 0 ? a : Math.max(a, b);
var min = (a, b) => Math.min(a, b);
var fresher = (a, b) => (b.lastSeen ?? 0) > (a.lastSeen ?? 0) ? b : a;
function mergeFriends(a, b, id = a.id) {
  const recent = fresher(a, b);
  const apps = { ...b.apps };
  for (const [app, fields] of Object.entries(a.apps ?? {})) {
    apps[app] = { ...apps[app], ...fields };
  }
  const ports = { ...b.ports, ...a.ports };
  const out = {
    id,
    publicKey: a.publicKey || b.publicKey,
    name: recent.name,
    state: strongerState(a.state, b.state),
    lastActivity: max(a.lastActivity, b.lastActivity) ?? Date.now(),
    createdAt: min(a.createdAt, b.createdAt)
  };
  const alias = a.alias ?? b.alias;
  if (alias) out.alias = alias;
  const color = a.color ?? b.color;
  if (color) out.color = color;
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen2 = max(a.lastSeen, b.lastSeen);
  if (lastSeen2 !== void 0) out.lastSeen = lastSeen2;
  if (Object.keys(apps).length) out.apps = apps;
  return out;
}
function mergePeers(a, b, id = a.id) {
  const recent = fresher(a, b);
  const out = { id, name: recent.name };
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  const ports = { ...b.ports, ...a.ports };
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen2 = max(a.lastSeen, b.lastSeen);
  if (lastSeen2 !== void 0) out.lastSeen = lastSeen2;
  return out;
}

// ../termcore/src/friends/book.ts
var SHARED = /* @__PURE__ */ new Set(["publicKey", "name", "alias", "state", "color", "lastIp", "lastSeen", "lastActivity", "createdAt"]);
function displayName(c2) {
  return c2.alias || c2.name;
}
function viewOf(f, app) {
  const { ports, apps, ...rest } = f;
  const port = ports?.[app];
  return { ...apps?.[app], ...rest, ...port ? { lastPort: port } : {} };
}
function applyPatch(f, patch, app) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (SHARED.has(k)) {
      if (v === void 0) delete f[k];
      else f[k] = v;
    } else if (k === "lastPort") {
      const ports = { ...f.ports };
      if (typeof v === "number" && v > 0) ports[app] = v;
      else delete ports[app];
      if (Object.keys(ports).length) f.ports = ports;
      else delete f.ports;
    } else {
      const fields = { ...f.apps?.[app] };
      if (v === void 0) delete fields[k];
      else fields[k] = v;
      const apps = { ...f.apps };
      if (Object.keys(fields).length) apps[app] = fields;
      else delete apps[app];
      if (Object.keys(apps).length) f.apps = apps;
      else delete f.apps;
    }
  }
}
var ContactBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
    this.rebuild(file.get());
    file.on("change", (v) => this.rebuild(v));
  }
  views = /* @__PURE__ */ new Map();
  version = 0;
  rebuild(v) {
    this.views = new Map(v.friends.map((f) => [f.id, viewOf(f, this.app)]));
    this.version++;
  }
  get(id) {
    return this.views.get(id);
  }
  all() {
    return [...this.views.values()];
  }
  /** The entry as stored (all apps' fields). */
  raw(id) {
    return this.file.get().friends.find((f) => f.id === id);
  }
  upsert(id, patch) {
    return this.mutate(id, () => patch);
  }
  /**
   * Decides a change from the newest stored entry (read under the lock): `fn` returns a patch,
   * `null` to remove the entry, or `undefined` for no change. Returns the entry afterwards.
   */
  mutate(id, fn) {
    let result;
    this.file.update((d) => {
      const i = d.friends.findIndex((f) => f.id === id);
      const prev = i >= 0 ? d.friends[i] : void 0;
      const patch = fn(prev ? viewOf(prev, this.app) : void 0);
      if (patch === null) {
        if (i >= 0) d.friends.splice(i, 1);
        result = void 0;
        return;
      }
      if (patch === void 0) {
        result = prev;
        return;
      }
      const p = patch;
      if (!prev && (p.publicKey === void 0 || !p.name || !p.state)) {
        result = void 0;
        return;
      }
      const now = Date.now();
      const next = prev ? structuredClone(prev) : { id, publicKey: "", name: "", state: p.state, lastActivity: now, createdAt: now };
      applyPatch(next, patch, this.app);
      if (i >= 0) d.friends[i] = next;
      else d.friends.push(next);
      result = next;
    });
    return result ? viewOf(result, this.app) : void 0;
  }
  /**
   * Ports of their other apps (from their discovery announcement): another app of ours can
   * then dial them right away. Only known entries, only when something changed.
   */
  setPorts(id, ports) {
    const cur = this.raw(id);
    if (!cur || Object.entries(ports).every(([app, port]) => cur.ports?.[app] === port)) return;
    this.file.update((d) => {
      const f = d.friends.find((x) => x.id === id);
      if (f) f.ports = { ...f.ports, ...ports };
    });
  }
  remove(id) {
    if (this.views.has(id) || this.raw(id)) this.mutate(id, () => null);
  }
  /** Someone has a new id (a verified link): their entry moves there, merged with one that may exist. */
  relink(oldId, newId, newPublicKey) {
    let moved = false;
    this.file.update((d) => {
      const old = d.friends.find((f) => f.id === oldId);
      if (!old) return;
      const existing = d.friends.find((f) => f.id === newId);
      const merged = existing ? mergeFriends(existing, old, newId) : { ...old, id: newId };
      merged.publicKey = newPublicKey;
      d.friends = [...d.friends.filter((f) => f.id !== oldId && f.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};
var PeerBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
  }
  view(p) {
    const { ports, ...rest } = p;
    const port = ports?.[this.app];
    return { ...rest, ...port ? { lastPort: port } : {} };
  }
  get(id) {
    const p = this.file.get().peers.find((x) => x.id === id);
    return p ? this.view(p) : void 0;
  }
  update(id, patch) {
    const prev = this.file.get().peers.find((x) => x.id === id);
    const port = patch.lastPort;
    const unchanged = prev && (patch.name === void 0 || patch.name === prev.name) && (patch.lastIp === void 0 || patch.lastIp === prev.lastIp) && (patch.lastSeen === void 0 || patch.lastSeen === prev.lastSeen) && (port === void 0 || port === prev.ports?.[this.app]);
    if (unchanged) return;
    this.file.update((d) => {
      let p = d.peers.find((x) => x.id === id);
      if (!p) {
        p = { id, name: patch.name ?? "Unknown" };
        d.peers.push(p);
      }
      if (patch.name !== void 0) p.name = patch.name;
      if (patch.lastIp !== void 0) p.lastIp = patch.lastIp;
      if (patch.lastSeen !== void 0) p.lastSeen = patch.lastSeen;
      if (port) p.ports = { ...p.ports, [this.app]: port };
    });
  }
  relink(oldId, newId) {
    let moved = false;
    this.file.update((d) => {
      const old = d.peers.find((p) => p.id === oldId);
      if (!old) return;
      const existing = d.peers.find((p) => p.id === newId);
      const merged = existing ? mergePeers(existing, old, newId) : { ...old, id: newId };
      d.peers = [...d.peers.filter((p) => p.id !== oldId && p.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};

// ../termcore/src/friends/net.ts
import fs10 from "fs";

// ../termcore/src/app/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body, app = "termhub") {
  const cmd = process.platform === "darwin" ? ["osascript", ["-e", MAC_SCRIPT, title, body]] : process.platform === "linux" ? ["notify-send", [`--app-name=${app}`, "--", title, body]] : null;
  if (!cmd) return;
  try {
    execFile2(cmd[0], [...cmd[1]], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// ../termcore/src/app/run.ts
import fs5 from "fs";
import path8 from "path";
function registerRun(runDir, info) {
  const file = path8.join(runDir, `${info.app}.json`);
  const entry = { ...info, pid: process.pid, startedAt: Date.now() };
  try {
    writeJsonAtomic(file, entry);
  } catch {
    return () => {
    };
  }
  return () => {
    try {
      if (readJson(file, null)?.pid === process.pid) fs5.rmSync(file, { force: true });
    } catch {
    }
  };
}
function runningApps(runDir, isAlive = pidAlive) {
  let files = [];
  try {
    files = fs5.readdirSync(runDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const r = readJson(path8.join(runDir, f), null);
      if (r && isSuiteApp(r.app) && Number.isInteger(r.pid) && Number.isInteger(r.port) && isAlive(r.pid)) out.push(r);
    } catch {
    }
  }
  return out;
}
function runningPorts(runDir) {
  return Object.fromEntries(runningApps(runDir).map((r) => [r.app, r.port]));
}

// ../termcore/src/net/dialer.ts
var MAX_BACKOFF = 3e4;
var MAX_BACKOFF_NEARBY = 5e3;
var CALLBACK_TTL = 15e3;
var MAX_CALLBACKS_PER_MINUTE = 10;
var Dialer = class {
  constructor(d) {
    this.d = d;
  }
  states = /* @__PURE__ */ new Map();
  /** Peers that asked us to connect to them (id → when). */
  callbacks = /* @__PURE__ */ new Map();
  callbackTimes = [];
  /** Friends we already told that they can't be reached. */
  warned = /* @__PURE__ */ new Set();
  /** We dialed this id and someone else answered – that session waits for their link. */
  relinking = /* @__PURE__ */ new Map();
  timer = null;
  start(intervalMs = 1500) {
    this.timer = setInterval(() => this.loop(), intervalMs);
    this.timer.unref();
    this.loop();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  /** A session came up: forget backoff and callbacks for that peer. */
  connected(id) {
    this.states.delete(id);
    this.callbacks.delete(id);
    this.warned.delete(id);
    this.relinking.delete(id);
  }
  /** A connection turned out to be useless (e.g. someone else answered): back off as after a failed dial. */
  failed(id) {
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    ds.backoff = Math.min(ds.backoff * 2, MAX_BACKOFF);
    ds.next = Date.now() + ds.backoff;
    this.states.set(id, ds);
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  wanted(id) {
    const state = this.d.stateOf(id);
    return state === "accepted" || state === "outgoing" || state !== "blocked" && (this.d.alsoWants?.(id) ?? false);
  }
  wantsConnection(id) {
    return !this.d.network.isOnline(id) && this.wanted(id);
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.stateOf(id) === "blocked") return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 6e4);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }
  loop() {
    for (const id of this.d.candidates()) this.tryDial(id);
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.find(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const last = this.d.lastAddress(id);
    return last ? { ...last, discovered: false } : null;
  }
  tryDial(id) {
    const { network } = this.d;
    if (network.isOnline(id) || this.relinking.get(id)?.isOpen) return;
    const state = this.d.stateOf(id);
    const now = Date.now();
    const calledBack = state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!this.wanted(id) && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then((s) => {
      this.states.delete(id);
      if (s.peerId !== id) this.relinking.set(id, s);
    }).catch((err) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const s = this.d.stateOf(id);
      const waiting = s === "outgoing" || s === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(id, { ip: t.ip, port: t.port, error: err.message });
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// ../termcore/src/net/discovery.ts
import dgram from "dgram";
import os4 from "os";
import { EventEmitter } from "events";
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var IPV4_RE2 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var MAX_WAS = 4;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os4.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((b, i) => (b | ~mask[i] & 255) & 255).join(".");
      out.push({ address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out;
}
var toInt = (ip) => ip.split(".").reduce((n, b) => n * 256 + Number(b), 0);
var toIp = (n) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join(".");
function prefixLength(netmask) {
  let n = toInt(netmask);
  let bits = 0;
  while (n & 2147483648) {
    bits++;
    n = n << 1 >>> 0;
  }
  return bits;
}
function isPrivate(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 172 && b >= 16 && b < 32 || a === 192 && b === 168 || a === 100 && b >= 64 && b < 128;
}
function* scanOrder(ifaces) {
  const ranges = ifaces.flatMap((i) => {
    const prefix = prefixLength(i.netmask);
    if (prefix > 30 || i.address.startsWith("169.254.")) return [];
    const mask = prefix < MIN_SCAN_PREFIX ? 4294901760 : toInt(i.netmask);
    const ip = toInt(i.address);
    const net4 = (ip & mask) >>> 0;
    const broadcast = (net4 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net4, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net4, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net4; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net4) yield toIp(ip - d);
    }
  });
  const seen = /* @__PURE__ */ new Set();
  while (gens.length) {
    for (let i = 0; i < gens.length; i++) {
      const r = gens[i].next();
      if (r.done) gens.splice(i--, 1);
      else if (!seen.has(r.value)) {
        seen.add(r.value);
        yield r.value;
      }
    }
  }
}
function udpTransport(port) {
  return ({ onMessage, onError, onReady }) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let bound = false;
    socket.on("error", (err) => {
      if (!bound) onError(err);
    });
    socket.on("message", (buf, rinfo) => onMessage(buf, rinfo.address));
    socket.bind(port, () => {
      bound = true;
      try {
        socket.setBroadcast(true);
      } catch {
      }
      onReady();
    });
    return {
      send(buf, address, to = port) {
        try {
          socket.send(buf, to, address, () => {
          });
        } catch {
        }
      },
      close() {
        try {
          socket.close();
        } catch {
        }
      }
    };
  };
}
function parseApps2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseWas(v, own) {
  if (!Array.isArray(v)) return void 0;
  const out = v.slice(0, MAX_WAS).filter((x) => typeof x === "string" && PEER_ID_RE.test(x) && x !== own);
  return out.length ? out : void 0;
}
var sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var Discovery = class extends EventEmitter {
  constructor(myId, getName, getPort, opts) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
    this.listApps = new Set(opts.listApps ?? [opts.app]);
    this.udpPort = opts.udpPort ?? SUITE[opts.app].udpPort;
  }
  transport = null;
  timer = null;
  scanTimer = null;
  scanQueue = null;
  lastScanEnd = 0;
  lastHints = 0;
  netSignature = "";
  /** address → when we last asked it directly */
  probed = /* @__PURE__ */ new Map();
  peers = /* @__PURE__ */ new Map();
  listApps;
  udpPort;
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.udpPort);
    this.transport = open({
      onMessage: (buf, address) => this.onMessage(buf, address),
      onError: (err) => {
        this.emit("log", `Discovery unavailable: ${err.message}`);
        this.stop();
      },
      onReady: () => {
        this.netSignature = this.signature();
        this.announce(true);
        this.probeHints();
        this.startScan();
        this.timer = setInterval(() => this.tick(), ANNOUNCE_INTERVAL);
        this.timer.unref();
      }
    });
  }
  /** The peer that is (or used to be, see `was`) `id`. */
  find(id) {
    const direct = this.peers.get(id);
    if (direct) return direct;
    for (const p of this.peers.values()) if (p.was?.includes(id)) return p;
    return void 0;
  }
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      const m = p.app === this.opts.app ? msg : { ...msg, q: 1 };
      this.sendTo(this.opts.wants?.(p.id) ? { ...m, c: 1 } : m, p.ip, p.app);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.find(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip, p.app);
  }
  tick() {
    const now = Date.now();
    const signature = this.signature();
    if (signature !== this.netSignature) {
      this.netSignature = signature;
      this.emit("log", "Network changed \u2013 searching again");
      this.probed.clear();
      this.announce(true);
      this.probeHints();
      this.startScan();
    } else {
      this.announce(false);
      if (now - this.lastHints >= HINT_INTERVAL) this.probeHints();
      if (!this.scanQueue && this.peers.size === 0 && now - this.lastScanEnd >= RESCAN_ALONE) this.startScan();
    }
    for (const [ip, at] of this.probed) if (now - at >= REPROBE_AFTER) this.probed.delete(ip);
    this.expire();
  }
  message(query) {
    const msg = { app: this.opts.app, v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    const apps = this.opts.apps?.();
    if (apps && Object.keys(apps).length) msg.apps = apps;
    const was = this.opts.was?.().slice(0, MAX_WAS);
    if (was?.length) msg.was = was;
    return msg;
  }
  /**
   * Sends to `address` on the port of `app` (default: ours). Queries to other apps' ports ask
   * for the answer on ours (`rp`).
   */
  sendTo(msg, address, app = this.opts.app, port) {
    const to = port ?? (app === this.opts.app ? this.udpPort : SUITE[app].udpPort);
    const out = to === this.udpPort ? msg : { ...msg, rp: this.udpPort };
    this.transport?.send(Buffer.from(JSON.stringify(out)), address, to);
  }
  /** Sends a query to `address` on our port and on every port in `alsoAsk`. */
  query(address) {
    const msg = this.message(true);
    this.sendTo(msg, address);
    for (const other of this.opts.alsoAsk ?? []) this.sendTo(msg, address, other.app, other.udpPort);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether the app runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE2.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.query(ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
    if (this.opts.alsoAsk?.length) {
      const msg = this.message(true);
      for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) {
        for (const other of this.opts.alsoAsk) this.sendTo(msg, target, other.app, other.udpPort);
      }
    }
  }
  startScan() {
    this.scanQueue = scanOrder(this.interfaces());
    if (!this.scanTimer) {
      this.scanTimer = setInterval(() => this.scanStep(), SCAN_TICK);
      this.scanTimer.unref();
    }
    this.emit("change");
  }
  scanStep() {
    const known = new Set([...this.peers.values()].map((p) => p.ip));
    for (let sent = 0; sent < SCAN_BATCH; ) {
      const next = this.scanQueue?.next();
      if (!next || next.done) {
        this.scanQueue = null;
        this.lastScanEnd = Date.now();
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.emit("change");
        return;
      }
      if (known.has(next.value)) continue;
      this.query(next.value);
      sent++;
    }
  }
  onMessage(buf, address) {
    if (buf.length > MAX_PACKET) return;
    let msg;
    try {
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }
    if (!msg || !isSuiteApp(msg.app) || msg.v !== 1 || typeof msg.id !== "string" || !PEER_ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const rp = Number.isInteger(msg.rp) && msg.rp >= 1024 && msg.rp <= 65535 ? msg.rp : void 0;
    if (!this.listApps.has(msg.app)) {
      if (msg.q && rp) this.sendTo(this.message(false), address, this.opts.app, rp);
      return;
    }
    const prev = this.peers.get(msg.id);
    const apps = parseApps2(msg.apps);
    const was = parseWas(msg.was, msg.id);
    const peer = {
      id: msg.id,
      name: cleanName(msg.name),
      ip: address,
      port,
      lastSeen: Date.now(),
      app: msg.app,
      ...apps ? { apps } : {},
      ...was ? { was } : {}
    };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name || prev.app !== peer.app || !sameJson(prev.apps, peer.apps) || !sameJson(prev.was, peer.was)) {
      this.emit("change");
    }
    if (msg.q) this.sendTo(this.message(false), address, msg.app, rp);
    if (msg.c === 1) this.emit("callback", msg.id);
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === "string" && IPV4_RE2.test(ip) && nearby(ip)) this.probe(ip);
      }
    }
  }
  expire() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change");
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.scanQueue = null;
    this.transport?.close();
    this.transport = null;
  }
};

// ../termcore/src/net/network.ts
import net2 from "net";
import { EventEmitter as EventEmitter4 } from "events";

// ../termcore/src/net/framing.ts
import { EventEmitter as EventEmitter2 } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload3) {
  if (payload3.length > MAX_FRAME) throw new FrameTooLargeError(payload3.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload3.length, 0);
  return Buffer.concat([header, payload3]);
}
var FrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len > MAX_FRAME) throw new FrameTooLargeError(len);
      if (this.buffer.length < 4 + len) break;
      frames.push(Buffer.from(this.buffer.subarray(4, 4 + len)));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
};
var FrameSocket = class extends EventEmitter2 {
  constructor(socket) {
    super();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      let frames;
      try {
        frames = this.decoder.push(chunk);
      } catch (err) {
        this.destroy(err);
        return;
      }
      for (const f of frames) this.deliver(f);
    });
    socket.on("error", (err) => this.finish(err));
    socket.on("close", () => this.finish(void 0));
  }
  decoder = new FrameDecoder();
  queue = [];
  waiter = null;
  streaming = false;
  closed = false;
  closeError;
  get isClosed() {
    return this.closed;
  }
  get remoteAddress() {
    return (this.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  }
  deliver(frame) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(frame);
    } else if (this.streaming) {
      this.emit("frame", frame);
    } else {
      this.queue.push(frame);
    }
  }
  read(timeoutMs) {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closeError ?? new Error("Connection closed"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Handshake timed out"));
      }, timeoutMs);
      this.waiter = {
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      };
    });
  }
  /** From now on, frames are delivered as events (including already buffered ones). */
  startStreaming() {
    this.streaming = true;
    const pending = this.queue;
    this.queue = [];
    for (const f of pending) this.emit("frame", f);
  }
  send(payload3) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload3));
    return true;
  }
  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload3) {
    if (this.closed) return false;
    if (payload3.length > MAX_FRAME) throw new FrameTooLargeError(payload3.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload3.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload3);
    this.socket.uncork();
    return ok;
  }
  /** Resolves once the socket's send buffer has room again (or the connection is gone). */
  drained() {
    if (this.closed || !this.socket.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.socket.off("drain", done);
        this.off("close", done);
        resolve();
      };
      this.socket.on("drain", done);
      this.on("close", done);
    });
  }
  /** Stops reading from the socket (the receiver's disk can't keep up). */
  pause() {
    this.socket.pause();
  }
  resume() {
    if (!this.closed) this.socket.resume();
  }
  /** Graceful close: buffered data is still sent. */
  end() {
    if (!this.closed) this.socket.end();
  }
  destroy(err) {
    this.socket.destroy();
    this.finish(err);
  }
  finish(err) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err ?? new Error("Connection closed"));
    }
    this.emit("close", err);
  }
};

// ../termcore/src/net/handshake.ts
import crypto5 from "crypto";

// ../termcore/src/net/channel.ts
import crypto4 from "crypto";
var TAG_LEN = 16;
var CipherState = class {
  constructor(key) {
    this.key = key;
    if (key.length !== 32) throw new Error("Key must be 32 bytes");
  }
  counter = 0n;
  nextNonce() {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.counter, 4);
    this.counter++;
    return nonce;
  }
  encrypt(plain) {
    const cipher = crypto4.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN) throw new Error("Frame too short");
    const decipher = crypto4.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
};

// ../termcore/src/net/handshake.ts
var HANDSHAKE_TIMEOUT = 5e3;
var XID_RE = /^[A-Za-z0-9_-]{12,32}$/;
var HandshakeError = class extends Error {
};
function parseHello(frame, protocol) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== protocol || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError(`Not a ${protocol.split("/")[0]} peer or incompatible version`);
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(protocol, role, transcript) {
  return Buffer.concat([Buffer.from(`${protocol} auth ${role}`), transcript]);
}
async function performHandshake(fs14, opts) {
  const { protocol, me, myName, initiator, xid } = opts;
  const timeoutMs = opts.timeoutMs ?? HANDSHAKE_TIMEOUT;
  const { privateKey: ephPriv, publicKey: ephPub } = crypto5.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto5.randomBytes(16);
  fs14.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: protocol, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs14.read(timeoutMs), protocol);
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto5.createHash("sha256").update(protocol).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto5.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto5.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto5.hkdfSync("sha256", shared, transcript, `${protocol} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto5.sign(null, authPayload(protocol, myRole, transcript), me.privateKey);
  fs14.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({
          pub: me.publicRaw.toString("base64url"),
          name: myName,
          sig: sig.toString("base64url"),
          ...initiator && xid ? { x: xid } : {}
        })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs14.read(timeoutMs)).toString("utf8"));
  } catch (err) {
    if (err instanceof Error && /timed out|closed/.test(err.message)) throw err;
    throw new HandshakeError("Authentication failed");
  }
  if (typeof auth.pub !== "string" || typeof auth.sig !== "string") {
    throw new HandshakeError("Authentication failed");
  }
  const peerPublicRaw = Buffer.from(auth.pub, "base64url");
  if (peerPublicRaw.length !== 32) throw new HandshakeError("Invalid identity key");
  let valid = false;
  try {
    valid = crypto5.verify(
      null,
      authPayload(protocol, peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  let peerXid;
  if (auth.x !== void 0) {
    if (initiator || typeof auth.x !== "string" || !XID_RE.test(auth.x)) throw new HandshakeError("Invalid transfer id");
    peerXid = auth.x;
  }
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv, ...peerXid ? { xid: peerXid } : {} };
}

// ../termcore/src/net/peer.ts
import { EventEmitter as EventEmitter3 } from "events";
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter3 {
  constructor(fs14, hs, initiator, parse, tag, expected) {
    super();
    this.fs = fs14;
    this.hs = hs;
    this.initiator = initiator;
    this.parse = parse;
    this.tag = tag;
    this.expected = expected;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs14.on("frame", (frame) => this.onFrame(frame));
    fs14.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
    this.timer = setInterval(() => this.tick(), PING_INTERVAL / 3);
    this.timer.unref();
  }
  peerId;
  peerPublicRaw;
  peerName;
  openedAt = Date.now();
  lastActivity = Date.now();
  rateCount = 0;
  rateStart = Date.now();
  timer;
  closed = false;
  /** Call only once all listeners are attached – otherwise early frames are lost. */
  start() {
    this.fs.startStreaming();
  }
  get remoteAddress() {
    return this.fs.remoteAddress;
  }
  /** The other side's port – for a connection we opened, the port they listen on. */
  get remotePort() {
    return this.fs.socket.remotePort ?? 0;
  }
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(Buffer.from(JSON.stringify(msg), "utf8")));
  }
  close(reason = "Connection closed", graceful = true) {
    if (this.closed) return;
    if (graceful) {
      this.send({ t: "bye" });
      this.fs.end();
      setTimeout(() => this.fs.destroy(), 1e3).unref();
    } else {
      this.fs.destroy();
    }
    this.finish(reason);
  }
  onFrame(frame) {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.rateStart > RATE_WINDOW) {
      this.rateStart = now;
      this.rateCount = 0;
    }
    if (++this.rateCount > RATE_MAX) {
      this.close("Peer is sending too much data", false);
      return;
    }
    let plain;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.close("Received tampered data", false);
      return;
    }
    this.lastActivity = now;
    const msg = this.parse(plain);
    if (!msg) return;
    if (msg.t === "ping") {
      this.send({ t: "pong" });
      return;
    }
    if (msg.t === "pong") return;
    if (msg.t === "bye") {
      this.close("Peer closed the connection", false);
      return;
    }
    this.emit("message", msg);
  }
  tick() {
    const idle = Date.now() - this.lastActivity;
    if (idle > IDLE_TIMEOUT) this.close("Timed out", false);
    else if (idle > PING_INTERVAL) this.send({ t: "ping" });
  }
  finish(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit("close", reason);
  }
};

// ../termcore/src/net/network.ts
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter4 {
  constructor(opts) {
    super();
    this.opts = opts;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  get me() {
    return this.opts.me;
  }
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net2.createServer((socket) => this.onIncoming(socket));
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve(server);
      });
    });
    try {
      this.server = await tryListen(preferredPort);
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      this.emit("log", `Port ${preferredPort} in use, using a free port`);
      this.server = await tryListen(0);
    }
    this.server.on("error", (err) => this.emit("log", `Server error: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  handshake(fs14, initiator, xid) {
    return performHandshake(fs14, { protocol: this.opts.protocol, me: this.opts.me, myName: this.opts.getName(), initiator, xid });
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately (unless acceptMismatch says otherwise).
   */
  async dial(host, port, expectedId, tag) {
    const fs14 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs14, true);
      let expected;
      if (expectedId && hs.peerId !== expectedId) {
        if (!this.opts.acceptMismatch?.(expectedId, hs.peerId)) throw new HandshakeError("Someone else is now reachable at this address");
        expected = expectedId;
      }
      return this.register(new Session(fs14, hs, true, this.opts.parse, tag, expected));
    } catch (err) {
      fs14.destroy();
      throw err;
    }
  }
  /** Opens a connection for one purpose (`xid`) to exactly this peer. */
  async dialPurpose(host, port, expectedId, xid) {
    const fs14 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs14, true, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError("Someone else is now reachable at this address");
      return { fs: fs14, hs, xid };
    } catch (err) {
      fs14.destroy();
      throw err;
    }
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net2.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error("Connection timed out"));
      }, DIAL_TIMEOUT);
      s.once("connect", () => {
        clearTimeout(timer);
        s.removeAllListeners("error");
        resolve(s);
      });
      s.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs14 = new FrameSocket(socket);
    try {
      const hs = await this.handshake(fs14, false);
      if (hs.xid) {
        if (!this.emit("purpose", { fs: fs14, hs, xid: hs.xid })) fs14.destroy();
      } else {
        this.register(new Session(fs14, hs, false, this.opts.parse));
      }
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs14.remoteAddress}: ${err.message}`);
      fs14.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const me = this.opts.me.id;
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = me < session.peerId ? me : session.peerId;
      const initiatorOf = (s) => s.initiator ? me : s.peerId;
      const keepExisting = initiatorOf(existing) === winner && initiatorOf(session) !== winner;
      if (keepExisting) {
        session.close("Duplicate connection", false);
        return existing;
      }
      this.sessions.set(session.peerId, session);
      existing.close("Duplicate connection", false);
    } else {
      this.sessions.set(session.peerId, session);
    }
    session.on("close", (reason) => {
      if (this.sessions.get(session.peerId) === session) {
        this.sessions.delete(session.peerId);
        this.emit("offline", session.peerId, reason);
      }
    });
    this.emit("session", session);
    session.start();
    return session;
  }
  disconnect(id) {
    this.sessions.get(id)?.close();
  }
  async stop() {
    for (const s of this.sessions.values()) s.close("App closed");
    await new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref();
    });
    this.server = null;
  }
};

// ../termcore/src/store/hub.ts
import fs9 from "fs";
import path12 from "path";

// ../termcore/src/store/migrate.ts
import crypto6 from "crypto";
import fs7 from "fs";
import path10 from "path";

// ../termcore/src/store/lock.ts
import fs6 from "fs";
import path9 from "path";
var sleepCell = new Int32Array(new SharedArrayBuffer(4));
var sleepSync = (ms) => void Atomics.wait(sleepCell, 0, 0, ms);
function readLock2(file) {
  try {
    const o = JSON.parse(fs6.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.ts === "number" && typeof o.token === "string" ? o : null;
  } catch {
    return null;
  }
}
function withLock(lockFile, fn, timings = {}) {
  const timeoutMs = timings.timeoutMs ?? 1e4;
  const staleMs = timings.staleMs ?? 15e3;
  ensureDir(path9.dirname(lockFile));
  const mine = { pid: process.pid, ts: Date.now(), token: Math.random().toString(36).slice(2) };
  const start2 = Date.now();
  let delay = 1;
  for (; ; ) {
    mine.ts = Date.now();
    try {
      fs6.writeFileSync(lockFile, JSON.stringify(mine), { flag: "wx", mode: 384 });
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock2(lockFile);
    const stale = holder ? holder.pid !== process.pid && !pidAlive(holder.pid) || Date.now() - holder.ts > staleMs : Date.now() - start2 > 200;
    if (stale) {
      const again = readLock2(lockFile);
      if (!holder || again && again.token === holder.token) {
        try {
          fs6.unlinkSync(lockFile);
        } catch {
        }
      }
      continue;
    }
    if (Date.now() - start2 > timeoutMs) throw new Error(`Timed out waiting for ${path9.basename(lockFile)}`);
    sleepSync(delay);
    delay = Math.min(delay * 2, 25);
  }
  try {
    return fn();
  } finally {
    if (readLock2(lockFile)?.token === mine.token) {
      try {
        fs6.unlinkSync(lockFile);
      } catch {
      }
    }
  }
}

// ../termcore/src/store/migrate.ts
var LEGACY_FILES = ["identity.json", "config.json", "contacts.json", "peers.json"];
var BASE_CONTACT_FIELDS = /* @__PURE__ */ new Set(["id", "publicKey", "name", "alias", "state", "lastIp", "lastPort", "lastSeen", "lastActivity", "createdAt"]);
var lockOf = (paths, file) => path10.join(paths.locksDir, `${path10.basename(file)}.lock`);
var hash = (s) => s === null ? void 0 : crypto6.createHash("sha256").update(s).digest("hex").slice(0, 32);
function readText(file) {
  try {
    return fs7.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
function parseArray(raw) {
  if (raw === null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function readLegacy(app, dir) {
  const idRaw = readJson(path10.join(dir, "identity.json"), null);
  const identityFile = isIdentityFile(idRaw) ? idRaw : null;
  let identity = null;
  try {
    identity = identityFile ? identityFromFile(identityFile) : null;
  } catch {
    identity = null;
  }
  let config = null;
  try {
    const c2 = readJson(path10.join(dir, "config.json"), null);
    config = c2 && typeof c2 === "object" ? c2 : null;
  } catch {
    config = null;
  }
  return {
    app,
    dir,
    identityFile: identity ? identityFile : null,
    identity,
    config,
    contactsRaw: readText(path10.join(dir, "contacts.json")),
    peersRaw: readText(path10.join(dir, "peers.json"))
  };
}
function friendFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const fields = {};
  for (const [k, v] of Object.entries(c2)) {
    if (!BASE_CONTACT_FIELDS.has(k) && v !== void 0 && v !== null && v !== false && v !== 0 && v !== "") fields[k] = v;
  }
  const port = Number(c2.lastPort);
  return parseFriend({
    ...c2,
    ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0,
    apps: Object.keys(fields).length ? { [app]: fields } : void 0
  });
}
function peerFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const port = Number(c2.lastPort);
  return parseKnownPeer({ ...c2, ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0 });
}
function mergeInto(map, entries, merge, skip, mapId) {
  for (const e of entries) {
    if (!e) continue;
    const id = mapId(e.id);
    if (skip.has(id)) continue;
    const entry = id === e.id ? e : { ...e, id };
    const prev = map.get(id);
    map.set(id, prev ? merge(prev, entry) : entry);
  }
}
function backup(paths, l, suffix = "") {
  const dest = path10.join(paths.legacyDir, l.app);
  for (const f of LEGACY_FILES) {
    const src = path10.join(l.dir, f);
    if (!fs7.existsSync(src)) continue;
    ensureDir(dest);
    const target = path10.join(dest, suffix ? f.replace(/\.json$/, `.${suffix}.json`) : f);
    if (!suffix && fs7.existsSync(target)) continue;
    fs7.copyFileSync(src, target);
    fs7.chmodSync(target, 384);
  }
}
function migrate(paths) {
  return withLock(path10.join(paths.locksDir, "migration.lock"), () => fs7.existsSync(paths.identity) ? catchUp(paths) : fullMigration(paths), {
    timeoutMs: 6e4,
    staleMs: 12e4
  });
}
function fullMigration(paths) {
  const legacy = LEGACY_APPS.map((app) => readLegacy(app, paths.legacy[app]));
  const masterSrc = legacy.find((l) => l.identity);
  const nothing = { migrated: false, caughtUp: [], master: null, links: 0, friends: 0 };
  if (!masterSrc) return nothing;
  const masterFile = masterSrc.identityFile ?? generateIdentityFile();
  const master = identityFromFile(masterFile);
  const now = Date.now();
  const links = [];
  const myIds = /* @__PURE__ */ new Set([master.id]);
  for (const l of legacy) {
    if (!l.identity) continue;
    myIds.add(l.identity.id);
    if (l.identity.id !== master.id && !links.some((x) => linkOldId(x) === l.identity.id)) links.push(createLink(l.identity, master, now));
  }
  const friends = /* @__PURE__ */ new Map();
  const peers = /* @__PURE__ */ new Map();
  for (const l of legacy) {
    mergeInto(friends, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(l.app, c2)), mergeFriends, myIds, (id) => id);
    mergeInto(peers, parseArray(l.peersRaw).map((p) => peerFromLegacy(l.app, p)), mergePeers, myIds, (id) => id);
  }
  const pick = (get) => {
    for (const l of legacy) {
      const v = get(l);
      if (v !== void 0) return v;
    }
    return void 0;
  };
  const nameRaw = pick((l) => typeof l.config?.name === "string" && l.config.name.trim() ? l.config.name : void 0);
  const name = nameRaw ? cleanName(nameRaw) : void 0;
  const effects = legacy[0]?.config?.effects;
  const settings = {
    v: 1,
    animations: ANIMATIONS.includes(effects) ? effects : "brief",
    notifications: pick((l) => typeof l.config?.notifications === "boolean" ? l.config.notifications : void 0) ?? true
  };
  for (const l of legacy) backup(paths, l);
  ensureDir(paths.dir);
  writeJsonAtomic(paths.friends, parseFriendsFile({ friends: [...friends.values()] }));
  writeJsonAtomic(paths.peers, parsePeersFile({ peers: [...peers.values()] }));
  if (!fs7.existsSync(paths.settings)) writeJsonAtomic(paths.settings, settings);
  writeJsonAtomic(paths.links, { v: 1, mine: links, known: [] });
  if (name) writeJsonAtomic(paths.profile, { v: 1, name, status: "available" });
  const record = {
    v: 1,
    at: now,
    master: { app: masterSrc.app, id: master.id },
    sources: Object.fromEntries(legacy.map((l) => [l.app, sourceOf(l)]))
  };
  writeJsonAtomic(paths.migration, record);
  writeJsonAtomic(paths.identity, masterFile);
  return { migrated: true, caughtUp: [], master: record.master, links: links.length, friends: friends.size, ...name ? { name } : {} };
}
var sourceOf = (l) => ({
  ...l.identity ? { id: l.identity.id } : {},
  ...l.contactsRaw !== null ? { contacts: hash(l.contactsRaw) } : {},
  ...l.peersRaw !== null ? { peers: hash(l.peersRaw) } : {}
});
function catchUp(paths) {
  const master = readIdentity(paths.identity);
  const record = readJson(paths.migration, null);
  const report = { migrated: false, caughtUp: [], master: record?.master ?? null, links: 0, friends: 0 };
  if (!master) return report;
  const sources = { ...record?.sources };
  const linksFile = parseLinksFile(readJson(paths.links, null));
  const byOld = new Map([...linksFile.mine, ...linksFile.known].map((l) => [linkOldId(l), linkNewId(l)]));
  const myIds = /* @__PURE__ */ new Set([master.id, ...linksFile.mine.map(linkOldId)]);
  let changedRecord = !record;
  let friendsTouched = false;
  for (const app of LEGACY_APPS) {
    const l = readLegacy(app, paths.legacy[app]);
    const seen = sources[app] ?? {};
    const now = sourceOf(l);
    if (l.identity && l.identity.id !== master.id && !byOld.has(l.identity.id)) {
      const link = createLink(l.identity, master);
      linksFile.mine.push(link);
      byOld.set(l.identity.id, master.id);
      myIds.add(l.identity.id);
      report.links++;
    }
    if (l.identity) myIds.add(l.identity.id);
    const contactsChanged = now.contacts !== void 0 && now.contacts !== seen.contacts;
    const peersChanged = now.peers !== void 0 && now.peers !== seen.peers;
    if (contactsChanged || peersChanged) {
      backup(paths, l, String(Date.now()));
      const mapId = (id) => resolveId(id, byOld);
      if (contactsChanged) {
        withLock(lockOf(paths, paths.friends), () => {
          const file = parseFriendsFile(readJson(paths.friends, null));
          const map = new Map(file.friends.map((f) => [f.id, f]));
          mergeInto(map, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(app, c2)), mergeFriends, myIds, mapId);
          writeJsonAtomic(paths.friends, { v: 1, friends: [...map.values()] });
        });
        friendsTouched = true;
      }
      if (peersChanged) {
        withLock(lockOf(paths, paths.peers), () => {
          const file = parsePeersFile(readJson(paths.peers, null));
          const map = new Map(file.peers.map((p) => [p.id, p]));
          mergeInto(map, parseArray(l.peersRaw).map((p) => peerFromLegacy(app, p)), mergePeers, myIds, mapId);
          writeJsonAtomic(paths.peers, { v: 1, peers: [...map.values()] });
        });
      }
      report.caughtUp.push(app);
    }
    if (JSON.stringify(now) !== JSON.stringify(seen)) {
      sources[app] = now;
      changedRecord = true;
    }
  }
  if (report.links) {
    withLock(lockOf(paths, paths.links), () => {
      const current = parseLinksFile(readJson(paths.links, null));
      const mine = [...current.mine, ...linksFile.mine.filter((l) => !current.mine.some((m) => m.old === l.old))];
      writeJsonAtomic(paths.links, { ...current, mine });
    });
  }
  if (changedRecord || report.links) {
    writeJsonAtomic(paths.migration, {
      v: 1,
      at: record?.at ?? Date.now(),
      master: record?.master ?? { app: "new", id: master.id },
      sources
    });
  }
  report.friends = friendsTouched ? parseFriendsFile(readJson(paths.friends, null)).friends.length : 0;
  return report;
}

// ../termcore/src/store/shared.ts
import { EventEmitter as EventEmitter5 } from "events";
import fs8 from "fs";
import path11 from "path";
var DEBOUNCE_MS = 30;
var POLL_MS = 1500;
var stampOf = (file) => {
  try {
    const s = fs8.statSync(file);
    return { mtimeMs: s.mtimeMs, size: s.size, ino: s.ino };
  } catch {
    return null;
  }
};
var sameStamp = (a, b) => a === b || !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino;
var SharedFile = class extends EventEmitter5 {
  constructor(file, opts) {
    super();
    this.file = file;
    this.opts = opts;
    this.lockFile = path11.join(opts.locksDir, `${path11.basename(file)}.lock`);
    this.stamp = stampOf(file);
    this.value = opts.parse(readJson(file, null));
    this.text = JSON.stringify(this.value);
  }
  value;
  text;
  stamp;
  watcher = null;
  poll = null;
  debounce = null;
  lockFile;
  get() {
    return this.value;
  }
  /** Reads the file again if it changed on disk. Returns whether the value changed. */
  refresh() {
    const stamp2 = stampOf(this.file);
    if (sameStamp(stamp2, this.stamp)) return false;
    this.stamp = stamp2;
    return this.adopt(this.opts.parse(readJson(this.file, null)), true);
  }
  adopt(value, external) {
    const text = JSON.stringify(value);
    if (text === this.text) return false;
    this.value = value;
    this.text = text;
    this.emit("change", value, external);
    return true;
  }
  /**
   * Locked read-modify-write. `fn` gets a private copy of the newest value; it may change it in
   * place (return nothing) or return a replacement. Nothing is written if nothing changed.
   * Returns the new value.
   */
  update(fn) {
    return withLock(this.lockFile, () => {
      const current = this.opts.parse(readJson(this.file, null));
      const draft = structuredClone(current);
      const next = this.opts.parse(fn(draft) ?? draft);
      const text = JSON.stringify(next);
      if (text !== JSON.stringify(current)) {
        writeFileAtomic(this.file, JSON.stringify(next, null, 2));
      }
      this.stamp = stampOf(this.file);
      if (JSON.stringify(current) !== this.text) this.adopt(current, true);
      this.adopt(next, false);
      return next;
    });
  }
  /** Writes a value as is (under the lock) – for files only one process creates (migration). */
  replace(value) {
    this.update(() => value);
  }
  watch() {
    if (this.watcher || this.poll) return;
    const schedule = () => {
      if (this.debounce) return;
      this.debounce = setTimeout(() => {
        this.debounce = null;
        this.refresh();
      }, DEBOUNCE_MS);
      this.debounce.unref();
    };
    try {
      fs8.mkdirSync(path11.dirname(this.file), { recursive: true, mode: 448 });
      const name = path11.basename(this.file);
      this.watcher = fs8.watch(path11.dirname(this.file), { persistent: false }, (_ev, f) => {
        if (!f || f === name) schedule();
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      this.watcher = null;
    }
    this.poll = setInterval(() => this.refresh(), POLL_MS);
    this.poll.unref();
  }
  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    this.poll = null;
    this.debounce = null;
  }
};

// ../termcore/src/store/hub.ts
var Hub = class {
  /** Opens an existing hub (after `prepare` and onboarding). Throws if there's no profile yet. */
  constructor(paths) {
    this.paths = paths;
    const identity = readIdentity(paths.identity);
    if (!identity) throw new Error("No profile found");
    this.identity = identity;
    const locksDir = paths.locksDir;
    this.profile = new SharedFile(paths.profile, { locksDir, parse: parseProfile });
    if (!this.profile.get()) throw new Error("No profile found");
    this.friends = new SharedFile(paths.friends, { locksDir, parse: parseFriendsFile });
    this.peers = new SharedFile(paths.peers, { locksDir, parse: parsePeersFile });
    this.settings = new SharedFile(paths.settings, { locksDir, parse: parseSettings });
    this.links = new SharedFile(paths.links, { locksDir, parse: parseLinksFile });
  }
  identity;
  profile;
  friends;
  peers;
  settings;
  links;
  /**
   * Run once at startup, before anything reads the hub: migrates the apps' old data on the
   * first start of a new version (see migrate.ts).
   */
  static prepare(paths) {
    return migrate(paths);
  }
  /** Is there a complete profile (identity + name)? Otherwise the app shows its onboarding. */
  static hasProfile(paths) {
    return readIdentity(paths.identity) !== null && parseProfile(readJson(paths.profile, null)) !== null;
  }
  /** The name, if there's a profile. */
  static profileName(paths) {
    return parseProfile(readJson(paths.profile, null))?.name ?? null;
  }
  /** Creates identity (if there's none yet) and profile on first launch. */
  static createProfile(paths, name) {
    const identity = loadOrCreateIdentity(paths.identity);
    const prev = parseProfile(readJson(paths.profile, null));
    writeJsonAtomic(paths.profile, { ...prev ?? { v: 1, status: "available" }, name: cleanName(name) });
    return identity;
  }
  /** Follows file changes by the other apps. */
  watch() {
    for (const f of this.files()) f.watch();
  }
  close() {
    for (const f of this.files()) {
      f.unwatch();
      f.removeAllListeners();
    }
  }
  files() {
    return [this.profile, this.friends, this.peers, this.settings, this.links];
  }
  get me() {
    return this.profile.get();
  }
  setProfile(patch) {
    return this.profile.update((p) => {
      const next = { ...p ?? { v: 1, name: "Unknown", status: "available" } };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  setSettings(patch) {
    return this.settings.update((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  /** My own links (sent to everyone I connect to). */
  myLinks() {
    return this.links.get().mine;
  }
  /** My old ids. */
  myOldIds() {
    return this.myLinks().map(linkOldId);
  }
  /** Remembers a verified link of someone else. */
  addKnownLink(link) {
    this.links.update((l) => {
      if (l.known.some((k) => k.old === link.old && k.new === link.new)) return;
      l.known = [...l.known.filter((k) => k.old !== link.old), link];
    });
  }
  /** old id → new id, for my links and everyone else's. */
  linkMap() {
    const { mine, known } = this.links.get();
    return new Map([...mine, ...known].map((l) => [linkOldId(l), linkNewId(l)]));
  }
};
function rekeyedFile(appHome) {
  return path12.join(appHome, "rekeyed.json");
}
function applyLinks(hub, appHome, rekey) {
  const file = rekeyedFile(appHome);
  const done = new Set(readJson(file, []).filter((x) => typeof x === "string"));
  const applied = [];
  for (const [oldId, newId] of hub.linkMap()) {
    if (done.has(`${oldId}>${newId}`)) continue;
    rekey(oldId, newId);
    done.add(`${oldId}>${newId}`);
    applied.push(oldId);
  }
  if (applied.length) {
    fs9.mkdirSync(appHome, { recursive: true, mode: 448 });
    writeJsonAtomic(file, [...done]);
  }
  return applied;
}
function migrationNotice(friends) {
  return `Your profile and ${friends === 1 ? "1 friend" : `${friends} friends`} moved to ~/.termhub \u2013 shared by termchat, keyrace and termdrop`;
}

// ../termcore/src/friends/wire.ts
var NO_EXTENSION = { parse: () => null };
function parseJsonObject(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function parseWire(buf, ext = NO_EXTENSION) {
  const o = parseJsonObject(buf);
  if (!o || typeof o.t !== "string") return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      const color = normalizeColor(o.color);
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
        ...color ? { color } : {}
      };
    }
    case "presence": {
      if (typeof o.away !== "boolean") return null;
      const msg = cleanStatusMsg(o.msg);
      return {
        ...ext.presence?.(o) ?? {},
        t: "presence",
        away: o.away,
        ...isStatus(o.status) ? { status: o.status } : {},
        ...msg ? { msg } : {}
      };
    }
    case "links": {
      if (!Array.isArray(o.links) || o.links.length > MAX_LINKS) return null;
      const links = o.links.map(parseLink).filter((l) => l !== null);
      return { t: "links", links };
    }
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return ext.parse(o);
  }
}

// ../termcore/src/friends/net.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var RELINK_TIMEOUT = 5e3;
var FIRST_MESSAGE_WAIT = 1e3;
var FriendNet = class {
  constructor(opts) {
    this.opts = opts;
    const { hub, app } = opts;
    this.hub = hub;
    this.app = app;
    this.identity = hub.identity;
    this.contacts = new ContactBook(hub.friends, app.name);
    this.peerBook = new PeerBook(hub.peers, app.name);
    this.lastStates = statesOf(hub.friends.get());
    this.network = new Network({
      protocol: app.protocol,
      me: this.identity,
      getName: () => this.name,
      parse: (plain) => parseWire(plain, opts.wire),
      acceptMismatch: (expected, actual) => (!!this.contacts.get(expected) || !!this.peerBook.get(expected)) && this.contacts.get(actual)?.state !== "blocked"
    });
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      discovery: () => this.discoveryRef,
      stateOf: (id) => this.contacts.get(id)?.state,
      lastAddress: (id) => {
        const c2 = this.contacts.get(id);
        if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort };
        const p = this.peerBook.get(id);
        return p?.lastIp && p.lastPort ? { ip: p.lastIp, port: p.lastPort } : null;
      },
      candidates: () => {
        const ids = this.contacts.all().filter((c2) => c2.state === "accepted" || c2.state === "outgoing").map((c2) => c2.id);
        return [...ids, ...opts.hooks.extraDialIds?.() ?? []];
      },
      alsoWants: (id) => opts.hooks.alsoWants?.(id) ?? false,
      log: (l) => this.log(l),
      unreachable: (id, info) => this.event({ kind: "unreachable", id, who: this.peerName(id), ...info })
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("purpose", (c2) => opts.hooks.purpose ? opts.hooks.purpose(c2) : c2.fs.destroy());
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
    hub.friends.on("change", (v, external) => {
      const prev = this.lastStates;
      this.lastStates = statesOf(v);
      if (external && this.started) this.syncFromOthers(prev, this.lastStates);
      this.changed();
    });
    hub.peers.on("change", () => this.changed());
    hub.profile.on("change", () => this.onProfileChanged());
    hub.settings.on("change", (s) => {
      opts.hooks.settings?.(s);
      this.changed();
    });
    hub.links.on("change", () => this.runRekey());
  }
  identity;
  contacts;
  peerBook;
  network;
  dialer;
  hub;
  app;
  discoveryRef = null;
  focused = true;
  presenceMap = /* @__PURE__ */ new Map();
  lastStates;
  unregisterRun = null;
  started = false;
  /** Sessions with peers we don't know yet: our state waits for their first message. */
  awaitingFirst = /* @__PURE__ */ new WeakSet();
  // ───────────── Lifecycle ─────────────
  async start() {
    const { opts } = this;
    await this.network.start(opts.port ?? this.app.tcpPort);
    this.started = true;
    const udpPort = opts.discoveryPort ?? this.app.udpPort;
    this.unregisterRun = registerRun(this.hub.paths.runDir, { app: this.app.name, port: this.network.port, udp: udpPort, version: this.app.version });
    this.hub.watch();
    this.runRekey();
    if (opts.discovery !== false) {
      const d = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...opts.discoveryOptions,
        app: this.app.name,
        udpPort,
        apps: () => runningPorts(this.hub.paths.runDir),
        was: () => this.hub.myOldIds(),
        hints: () => this.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discoveryRef = d;
      d.on("change", () => this.onDiscovered());
      d.on("log", (l) => this.log(l));
      d.on("callback", (id) => this.dialer.onCallback(id));
      d.start();
    }
    this.dialer.start(opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.started = false;
    this.dialer.stop();
    this.discoveryRef?.stop();
    await this.network.stop();
    this.hub.close();
    this.unregisterRun?.();
    this.unregisterRun = null;
  }
  get discovery() {
    return this.discoveryRef;
  }
  // ───────────── Me ─────────────
  get profile() {
    return this.hub.me;
  }
  get name() {
    return this.profile.name;
  }
  get me() {
    const p = this.profile;
    return {
      id: this.identity.id,
      name: p.name,
      color: p.color,
      status: p.status,
      statusMsg: p.statusMsg,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discoveryRef !== null,
      scanning: this.discoveryRef?.scanning ?? false
    };
  }
  get settings() {
    return this.hub.settings.get();
  }
  /** Do not disturb: no desktop notifications, invites and offers wait quietly. */
  get dnd() {
    return this.profile.status === "dnd";
  }
  get animations() {
    return this.settings.animations;
  }
  notificationsEnabled() {
    return this.settings.notifications;
  }
  setNotifications(on) {
    this.hub.setSettings({ notifications: on });
  }
  setAnimations(mode) {
    this.hub.setSettings({ animations: mode });
  }
  setName(name) {
    const clean = cleanName(name);
    this.hub.setProfile({ name: clean });
    return clean;
  }
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }
  get isFocused() {
    return this.focused;
  }
  /** Desktop banner – only while the terminal is in the background, notifications are on and we're not in dnd. */
  notify(title, body) {
    if (this.focused || !this.notificationsEnabled() || this.dnd) return;
    if (this.opts.notify) this.opts.notify(title, body);
    else notify(title, body, this.app.name);
  }
  // ───────────── Queries ─────────────
  isOnline(id) {
    return this.network.isOnline(id);
  }
  presenceOf(id) {
    return this.isOnline(id) ? this.presenceMap.get(id) : void 0;
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
  }
  /** People on the network running this app who aren't friends (an old id they announce counts). */
  nearby() {
    return [...this.discoveryRef?.peers.values() ?? []].filter((p) => !this.contacts.get(p.id) && !(p.was ?? []).some((w) => this.contacts.get(w))).sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  send(id, msg) {
    return this.network.get(id)?.send(msg) ?? false;
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discoveryRef?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      let result = "pending";
      if (existing.state === "incoming") {
        this.accept(id);
        result = "accepted";
      } else if (existing.state === "declined" || existing.state === "blocked") {
        this.setState(id, "outgoing");
        result = "again";
      }
      this.connect(id);
      return result;
    }
    if (!p) throw new Error("They are no longer nearby");
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, lastPort: p.port });
    this.connect(id);
    this.changed();
    return "sent";
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = this.app.tcpPort) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  /** Accepts a request. False if there's none from them. */
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return false;
    this.setState(id, "accepted");
    this.connect(id);
    return true;
  }
  /** Declines a request (or ends a friendship without a word): they're told, the entry is removed. */
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Declined");
    }
    this.contacts.remove(id);
    this.changed();
    return c2;
  }
  block(id, patch = {}) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    this.contacts.upsert(id, { ...patch, state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.changed();
    return c2;
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return void 0;
    this.setState(id, "outgoing");
    this.connect(id);
    return c2;
  }
  /** Removes a friend; they see it as "removed you". */
  remove(id) {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.dialer.connect(id);
  }
  tryDial(id) {
    this.dialer.tryDial(id);
  }
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    if (!s) return;
    const c2 = this.contacts.get(id);
    const color = this.profile.color;
    s.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port, ...color ? { color } : {} });
  }
  // ───────────── Presence ─────────────
  ownPresence() {
    const p = this.profile;
    return {
      ...this.opts.hooks.presenceExtra?.() ?? {},
      t: "presence",
      away: !this.focused,
      ...p.status !== "available" ? { status: p.status } : {},
      ...p.statusMsg ? { msg: p.statusMsg } : {}
    };
  }
  sendPresence(id) {
    this.network.get(id)?.send(this.ownPresence());
  }
  broadcastPresence() {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }
  // ───────────── Internals ─────────────
  changed() {
    this.opts.hooks.changed();
  }
  log(line) {
    this.opts.hooks.log?.(line);
  }
  event(e) {
    this.opts.hooks.event?.(e);
  }
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    for (const ip of this.opts.hooks.extraHints?.() ?? []) ips.add(ip);
    return [...ips];
  }
  onDiscovered() {
    const d = this.discoveryRef;
    if (!d) return;
    const seen = [];
    for (const p of d.peers.values()) {
      for (const id of [p.id, ...p.was ?? []]) {
        const c2 = this.contacts.get(id);
        if (c2 && (c2.lastIp !== p.ip || c2.lastPort !== p.port)) this.contacts.upsert(id, { lastIp: p.ip, lastPort: p.port });
        if (c2 && p.apps) this.contacts.setPorts(id, p.apps);
        const known = this.peerBook.get(id);
        if (known && (known.lastIp !== p.ip || known.lastPort !== p.port)) this.peerBook.update(id, { lastIp: p.ip, lastPort: p.port });
        seen.push(id);
      }
    }
    this.dialer.discovered(seen);
    this.changed();
  }
  onProfileChanged() {
    if (!this.started) return this.changed();
    for (const id of this.network.sessions.keys()) {
      this.sendState(id);
      this.sendPresence(id);
    }
    this.discoveryRef?.announce(false);
    this.changed();
  }
  /** Another app changed the friend list: tell our peers what changed for them. */
  syncFromOthers(prev, next) {
    for (const id of /* @__PURE__ */ new Set([...prev.keys(), ...next.keys()])) {
      const before = prev.get(id);
      const after = next.get(id);
      if (before === after) continue;
      const s = this.network.get(id);
      if (after === void 0) {
        if (s) {
          s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
          if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
        }
        continue;
      }
      if (after === "blocked") {
        s?.close("Blocked");
        continue;
      }
      if (relStateFor(before ?? null) !== relStateFor(after)) this.sendState(id);
      if (after === "accepted" || after === "outgoing") this.dialer.connect(id);
    }
  }
  runRekey() {
    const rekey = this.opts.hooks.rekey;
    if (!rekey) return;
    try {
      if (applyLinks(this.hub, this.opts.paths.home, rekey).length) this.changed();
    } catch (err) {
      this.log(`Couldn't update data for new ids: ${err.message}`);
    }
  }
  onSession(s) {
    const id = s.peerId;
    let c2 = this.contacts.get(id);
    if (c2?.state === "blocked") {
      s.close("Blocked", false);
      return;
    }
    this.dialer.connected(id);
    if (s.tag === "request") {
      if (!c2) {
        c2 = this.contacts.upsert(id, { publicKey: "", name: s.peerName, state: "outgoing" });
        this.event({ kind: "requestSent", id, who: s.peerName });
      } else if (c2.state === "incoming") {
        this.accept(id);
      } else if (c2.state === "declined") {
        this.contacts.upsert(id, { state: "outgoing" });
      }
    }
    if (c2) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now()
      });
    }
    s.on("message", (m) => this.onWire(s, m));
    if (s.expected) {
      const expected = s.expected;
      setTimeout(() => {
        if (s.isOpen && this.contacts.get(expected) && !this.contacts.get(id)) s.close("Someone else is now reachable at this address");
      }, this.opts.relinkTimeoutMs ?? RELINK_TIMEOUT).unref();
      s.on("close", () => {
        if (this.contacts.get(expected)) this.dialer.failed(expected);
      });
    } else if (!c2 && !this.opts.hooks.keepUnknown?.(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    const links = this.hub.myLinks();
    if (links.length) s.send({ t: "links", links });
    if (c2) this.sendState(id);
    else {
      this.awaitingFirst.add(s);
      setTimeout(() => this.flushInitialState(s), FIRST_MESSAGE_WAIT).unref();
    }
    const own = this.ownPresence();
    if (Object.keys(own).length > 2 || own.away) this.sendPresence(id);
    this.opts.hooks.session?.(s);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.presenceMap.delete(id);
    this.opts.hooks.offline?.(id);
    if (this.contacts.get(id)) this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  flushInitialState(s) {
    if (!this.awaitingFirst.has(s)) return;
    this.awaitingFirst.delete(s);
    if (s.isOpen && this.network.get(s.peerId) === s) this.sendState(s.peerId);
  }
  onWire(s, m) {
    try {
      this.handleWire(s, m);
    } finally {
      this.flushInitialState(s);
    }
  }
  handleWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    const base = m;
    switch (base.t) {
      case "links":
        return this.onLinks(s, base.links);
      case "state":
        return this.onState(s, base);
      case "decline": {
        let declined = false;
        const c2 = this.contacts.mutate(id, (cur) => {
          if (cur?.state !== "outgoing") return void 0;
          declined = true;
          return { state: "declined" };
        });
        if (declined && c2) {
          this.event({ kind: "declinedUs", id, who: displayName(c2) });
          this.changed();
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) return;
        const { t: _t, away, status, msg, ...extra } = base;
        const next = { away, status: status ?? "available", ...msg ? { msg } : {}, extra };
        if (JSON.stringify(next) === JSON.stringify(this.presenceMap.get(id))) return;
        this.presenceMap.set(id, next);
        this.opts.hooks.presence?.(id, next);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.opts.hooks.message(s, m);
    }
  }
  /** Their links: an old id we know is them now. Only links to the session's own key count. */
  onLinks(s, links) {
    let changed = false;
    for (const link of links) {
      if (linkNewId(link) !== s.peerId || !verifyLink(link)) continue;
      const oldId = linkOldId(link);
      if (oldId === s.peerId || oldId === this.identity.id) continue;
      const friend = this.contacts.get(oldId);
      const known = this.peerBook.get(oldId);
      if (!friend && !known && s.expected !== oldId && !this.opts.hooks.knowsId?.(oldId)) continue;
      this.hub.addKnownLink(link);
      if (friend) this.contacts.relink(oldId, s.peerId, link.new);
      if (known) this.peerBook.relink(oldId, s.peerId);
      this.dialer.connected(oldId);
      this.event({ kind: "linked", oldId, id: s.peerId, who: this.peerName(s.peerId) });
      this.log(`${oldId} is now ${s.peerId}`);
      changed = true;
    }
    if (changed) {
      this.runRekey();
      if (!this.awaitingFirst.has(s)) this.sendState(s.peerId);
      this.changed();
    }
  }
  onState(s, m) {
    const id = s.peerId;
    this.opts.hooks.stateMessage?.(s, m);
    let prev = null;
    let before;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      before = cur;
      prev = cur?.state ?? null;
      const next2 = reconcile(prev, m.state);
      if (next2 === null) return cur ? null : void 0;
      return {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: m.name,
        state: next2,
        color: m.color,
        lastIp: s.remoteAddress,
        lastPort: m.port || cur?.lastPort,
        lastSeen: now,
        ...prev !== next2 ? { lastActivity: now } : {},
        ...this.opts.hooks.statePatch?.(prev, next2) ?? {}
      };
    });
    const next = updated?.state ?? null;
    if (next === null) {
      if (before) this.event({ kind: "withdrawn", id, who: displayName(before) });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Not a friend");
      this.changed();
      return;
    }
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.event({ kind: "accepted", id, who, byThem: prev === "outgoing" });
    } else if (next === "incoming" && prev !== "incoming") {
      this.event({ kind: "incoming", id, who });
    } else if (prev === "accepted" && next === "outgoing") {
      this.event({ kind: "removedUs", id, who });
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.opts.hooks.stateChanged?.(id, prev, next);
    this.changed();
  }
};
function statesOf(v) {
  return new Map(v.friends.map((f) => [f.id, f.state]));
}
function appendLog(file, line) {
  try {
    fs10.appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}

// src/core/config.ts
function readConfig(paths) {
  const c2 = readJson(paths.config, null) ?? {};
  return Number.isInteger(c2.port) ? { port: c2.port } : {};
}

// src/core/groups.ts
import fs11 from "fs";
import path13 from "path";

// src/core/groupEvents.ts
import crypto7 from "crypto";
var MAX_MEMBERS = 32;
var EVENT_ID_RE = /^[A-Za-z0-9_-]{32}$/;
var PEER_ID_RE2 = /^[A-Z2-7]{20}$/;
var B64URL_RE = /^[A-Za-z0-9_-]+$/;
var MAX_SEQ = 2 ** 40;
var KINDS = ["create", "invite", "join", "decline", "leave", "kick", "rename", "msg"];
function payload2(e) {
  const data = Object.keys(e.data).sort().map((k) => [k, e.data[k]]);
  const gid = e.kind === "create" ? "" : e.gid;
  return Buffer.from(JSON.stringify(["termchat/group/1", gid, e.author, e.authorPub, e.seq, e.ts, e.kind, data]));
}
function eventId(p) {
  return crypto7.createHash("sha256").update(p).digest("base64url").slice(0, 32);
}
function signEvent(me, fields) {
  const unsigned = {
    v: 1,
    gid: fields.gid,
    author: me.id,
    authorPub: me.publicRaw.toString("base64url"),
    seq: fields.seq,
    ts: fields.ts ?? Date.now(),
    kind: fields.kind,
    data: fields.data
  };
  const p = payload2(unsigned);
  const id = eventId(p);
  const sig = crypto7.sign(null, p, me.privateKey).toString("base64url");
  return { ...unsigned, gid: fields.kind === "create" ? id : fields.gid, id, sig };
}
var str = (v, max2) => typeof v === "string" && v.length <= max2;
function parseEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  if (o.v !== 1 || !KINDS.includes(o.kind)) return null;
  if (!str(o.gid, 32) || !EVENT_ID_RE.test(o.gid) || !str(o.id, 32) || !EVENT_ID_RE.test(o.id)) return null;
  if (!str(o.author, 20) || !PEER_ID_RE2.test(o.author)) return null;
  if (!str(o.authorPub, 43) || !B64URL_RE.test(o.authorPub)) return null;
  if (!str(o.sig, 86) || !B64URL_RE.test(o.sig)) return null;
  if (!Number.isInteger(o.seq) || o.seq < 1 || o.seq > MAX_SEQ) return null;
  if (typeof o.ts !== "number" || !Number.isFinite(o.ts)) return null;
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return null;
  const data = {};
  for (const [k, v] of Object.entries(o.data)) {
    if (!str(v, MAX_TEXT)) return null;
    data[k] = v;
  }
  const kind = o.kind;
  const has = (...keys) => keys.every((k) => typeof data[k] === "string");
  const ok = kind === "create" && has("name", "creatorName") || kind === "invite" && has("member", "pub", "name") || kind === "kick" && has("member") || kind === "rename" && has("name") || kind === "msg" && has("text") || kind === "join" || kind === "decline" || kind === "leave";
  if (!ok || Object.keys(data).length > 4) return null;
  return {
    v: 1,
    gid: o.gid,
    id: o.id,
    author: o.author,
    authorPub: o.authorPub,
    seq: o.seq,
    ts: o.ts,
    kind,
    data,
    sig: o.sig
  };
}
function verifyEvent(e) {
  const pub = Buffer.from(e.authorPub, "base64url");
  if (pub.length !== 32 || fingerprint(pub) !== e.author) return false;
  const p = payload2(e);
  if (eventId(p) !== e.id) return false;
  if (e.kind === "create" ? e.gid !== e.id : e.gid === e.id) return false;
  try {
    return crypto7.verify(null, p, publicKeyFromRaw(pub), Buffer.from(e.sig, "base64url"));
  } catch {
    return false;
  }
}
var order = (a, b) => a.seq - b.seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function deriveGroup(gid, events) {
  const sorted = [...events].filter((e) => e.gid === gid).sort(order);
  const create = sorted.find((e) => e.kind === "create" && e.id === gid);
  if (!create) return null;
  const state = {
    gid,
    name: cleanName(create.data.name),
    creator: create.author,
    createdAt: create.ts,
    members: /* @__PURE__ */ new Map(),
    names: /* @__PURE__ */ new Map(),
    timeline: [],
    maxSeq: 0,
    applied: /* @__PURE__ */ new Set()
  };
  for (const e of sorted) state.maxSeq = Math.max(state.maxSeq, e.seq);
  const status = (id) => state.members.get(id)?.status;
  const system = (e, action, target, value) => state.timeline.push({ type: "system", ev: e, action, target, value });
  for (const e of sorted) {
    if (e === create) {
      const name = cleanName(e.data.creatorName);
      state.members.set(e.author, { id: e.author, pub: e.authorPub, name, status: "member", inviteSeq: 0 });
      state.names.set(e.author, name);
      state.applied.add(e.id);
      system(e, "create", void 0, state.name);
      continue;
    }
    if (e.kind === "create" || e.seq <= create.seq) continue;
    const author = status(e.author);
    switch (e.kind) {
      case "invite": {
        const target = e.data.member;
        const pub = Buffer.from(e.data.pub, "base64url");
        if (author !== "member" || status(target) || target === e.author) continue;
        if (pub.length !== 32 || fingerprint(pub) !== target) continue;
        if (state.members.size >= MAX_MEMBERS) continue;
        const name = cleanName(e.data.name);
        state.members.set(target, { id: target, pub: e.data.pub, name, status: "invited", inviteSeq: e.seq, invitedBy: e.author });
        state.names.set(target, name);
        system(e, "invite", target);
        break;
      }
      case "join":
        if (author !== "invited") continue;
        state.members.get(e.author).status = "member";
        system(e, "join");
        break;
      case "decline":
        if (author !== "invited") continue;
        state.members.delete(e.author);
        system(e, "decline");
        break;
      case "leave":
        if (author !== "member") continue;
        state.members.delete(e.author);
        system(e, "leave");
        break;
      case "kick": {
        const target = e.data.member;
        if (e.author !== state.creator || author !== "member" || !status(target) || target === e.author) continue;
        state.members.delete(target);
        system(e, "kick", target);
        break;
      }
      case "rename":
        if (author !== "member") continue;
        state.name = cleanName(e.data.name);
        system(e, "rename", void 0, state.name);
        break;
      case "msg": {
        if (author !== "member") continue;
        const text = sanitizeText(e.data.text).trim();
        if (!text) continue;
        state.timeline.push({ type: "msg", ev: e, text });
        break;
      }
    }
    state.applied.add(e.id);
  }
  return state;
}

// src/core/protocol.ts
var ID_RE = /^[A-Za-z0-9-]{1,64}$/;
var MAX_SYNC_IDS = 1200;
function parseChatWire(o) {
  switch (o.t) {
    case "msg": {
      if (typeof o.id !== "string" || !ID_RE.test(o.id)) return null;
      if (typeof o.text !== "string" || o.text.length > MAX_TEXT) return null;
      const text = sanitizeText(o.text);
      if (!text.trim()) return null;
      const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : Date.now();
      return { t: "msg", id: o.id, ts, text };
    }
    case "ack":
    case "read": {
      if (!Array.isArray(o.ids) || o.ids.length > 500) return null;
      const ids = o.ids.filter((id) => typeof id === "string" && ID_RE.test(id));
      return { t: o.t, ids };
    }
    case "gsync": {
      if (typeof o.gid !== "string" || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.have) || o.have.length > MAX_SYNC_IDS) return null;
      const since = Number.isInteger(o.since) && o.since >= 0 ? o.since : 0;
      return { t: "gsync", gid: o.gid, have: o.have.filter((id) => typeof id === "string" && EVENT_ID_RE.test(id)), since };
    }
    case "gev": {
      if (typeof o.gid !== "string" || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.evs) || o.evs.length > 500) return null;
      return { t: "gev", gid: o.gid, evs: o.evs };
    }
    case "gack": {
      if (typeof o.gid !== "string" || !EVENT_ID_RE.test(o.gid)) return null;
      if (!Array.isArray(o.ids) || o.ids.length > 500) return null;
      const ids = o.ids.filter((id) => typeof id === "string" && EVENT_ID_RE.test(id));
      const by = typeof o.by === "string" && PEER_ID_RE.test(o.by) ? o.by : void 0;
      return { t: "gack", gid: o.gid, ids, ...by ? { by } : {} };
    }
    default:
      return null;
  }
}
var WIRE = { parse: parseChatWire };

// src/core/groups.ts
var BATCH_BYTES = 4e4;
var GroupManager = class {
  constructor(paths, me, hooks) {
    this.paths = paths;
    this.me = me;
    this.hooks = hooks;
    this.meta = readJson(paths.groupsMeta, {});
    this.load();
  }
  groups = /* @__PURE__ */ new Map();
  meta;
  /** groups we already sent our gsync for, per peer connection */
  synced = /* @__PURE__ */ new Map();
  // ───────────── Storage ─────────────
  file(gid) {
    return path13.join(this.paths.groupsDir, `${gid}.jsonl`);
  }
  load() {
    let files = [];
    try {
      files = fs11.readdirSync(this.paths.groupsDir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return;
    }
    for (const f of files) {
      const gid = f.slice(0, -".jsonl".length);
      const events = /* @__PURE__ */ new Map();
      const has = /* @__PURE__ */ new Map();
      for (const line of readJsonl(path13.join(this.paths.groupsDir, f))) {
        if (line.k === "ev") {
          const ev = parseEvent(line.ev);
          if (ev && ev.gid === gid) events.set(ev.id, ev);
        } else if (line.k === "has" && typeof line.by === "string" && Array.isArray(line.ids)) {
          const set = has.get(line.by) ?? /* @__PURE__ */ new Set();
          for (const id of line.ids) set.add(id);
          has.set(line.by, set);
        }
      }
      const state = deriveGroup(gid, events.values());
      if (state) this.groups.set(gid, { gid, events, state, has });
    }
  }
  saveMeta() {
    writeJsonAtomic(this.paths.groupsMeta, this.meta);
  }
  touch(gid, unreadDelta = 0) {
    const m = this.meta[gid] ?? { unread: 0, lastActivity: 0 };
    this.meta[gid] = { unread: unreadDelta ? m.unread + unreadDelta : m.unread, lastActivity: Date.now() };
    this.saveMeta();
  }
  // ───────────── Queries ─────────────
  list() {
    return [...this.groups.values()].map((g) => g.state);
  }
  get(gid) {
    return this.groups.get(gid)?.state;
  }
  metaOf(gid) {
    return this.meta[gid] ?? { unread: 0, lastActivity: this.groups.get(gid)?.state.createdAt ?? 0 };
  }
  markRead(gid) {
    const m = this.meta[gid];
    if (!m || m.unread === 0) return false;
    this.meta[gid] = { ...m, unread: 0 };
    this.saveMeta();
    return true;
  }
  myStatus(gid) {
    const log = this.groups.get(gid);
    if (!log) return null;
    const mine = log.state.members.get(this.me.id);
    if (mine) return mine.status;
    for (let i = log.state.timeline.length - 1; i >= 0; i--) {
      const t = log.state.timeline[i];
      if (t.type !== "system") continue;
      if (t.action === "kick" && t.target === this.me.id) return "removed";
      if (t.ev.author === this.me.id && t.action === "leave") return "left";
      if (t.ev.author === this.me.id && t.action === "decline") return "declined";
    }
    return "removed";
  }
  /** Delivery of one of my messages: how many of the members that should get it have it. */
  delivery(gid, eventId2) {
    const log = this.groups.get(gid);
    const ev = log?.events.get(eventId2);
    if (!log || !ev) return { n: 0, total: 0 };
    let n = 0;
    let total = 0;
    for (const m of log.state.members.values()) {
      if (m.id === this.me.id || m.status !== "member" || m.inviteSeq >= ev.seq) continue;
      total++;
      if (log.has.get(m.id)?.has(eventId2)) n++;
    }
    return { n, total };
  }
  /** Peers I should stay connected to: members/invitees of groups I'm (still) part of. */
  peers() {
    const out = /* @__PURE__ */ new Set();
    for (const log of this.groups.values()) {
      if (!this.involved(log)) continue;
      for (const id of log.state.members.keys()) if (id !== this.me.id) out.add(id);
    }
    return out;
  }
  sharesGroup(peerId) {
    return this.peers().has(peerId);
  }
  // ───────────── Actions ─────────────
  create(name, invitees, myName) {
    const ev = signEvent(this.me, { gid: "", seq: 1, kind: "create", data: { name: cleanName(name), creatorName: myName } });
    const log = { gid: ev.gid, events: /* @__PURE__ */ new Map(), state: deriveGroup(ev.gid, [ev]), has: /* @__PURE__ */ new Map() };
    this.groups.set(ev.gid, log);
    this.addEvents(log, [ev], null);
    for (const p of invitees) this.invite(ev.gid, p);
    this.touch(ev.gid);
    return ev.gid;
  }
  invite(gid, p) {
    const log = this.require(gid, "member");
    if (log.state.members.has(p.id)) throw new Error(`${p.name} is already in the group`);
    this.emit(log, "invite", { member: p.id, pub: p.pub, name: cleanName(p.name) });
  }
  accept(gid) {
    this.emit(this.require(gid, "invited"), "join", {});
  }
  decline(gid) {
    this.emit(this.require(gid, "invited"), "decline", {});
  }
  leave(gid) {
    this.emit(this.require(gid, "member"), "leave", {});
  }
  kick(gid, memberId) {
    const log = this.require(gid, "member");
    if (log.state.creator !== this.me.id) throw new Error("Only the creator can remove members");
    if (!log.state.members.has(memberId)) throw new Error("Not a member");
    this.emit(log, "kick", { member: memberId });
  }
  rename(gid, name) {
    this.emit(this.require(gid, "member"), "rename", { name: cleanName(name) });
  }
  send(gid, raw) {
    const text = sanitizeText(raw).trim();
    if (!text) throw new Error("Empty message");
    if (text.length > MAX_TEXT) throw new Error(`Message too long (max. ${MAX_TEXT} characters)`);
    return this.emit(this.require(gid, "member"), "msg", { text });
  }
  /** Removes a group I'm no longer part of from this device. */
  deleteLocal(gid) {
    const status = this.myStatus(gid);
    if (status === "member" || status === "invited") throw new Error("Leave the group first: /leave");
    this.groups.delete(gid);
    delete this.meta[gid];
    this.saveMeta();
    fs11.rmSync(this.file(gid), { force: true });
    this.hooks.changed();
  }
  require(gid, status) {
    const log = this.groups.get(gid);
    if (!log) throw new Error("Unknown group");
    const mine = this.myStatus(gid);
    if (mine !== status) {
      throw new Error(status === "member" ? "You're not a member of this group" : "There is no pending invite");
    }
    return log;
  }
  emit(log, kind, data) {
    const ev = signEvent(this.me, { gid: log.gid, seq: log.state.maxSeq + 1, kind, data });
    this.addEvents(log, [ev], null);
    this.touch(log.gid);
    return ev;
  }
  // ───────────── Sync & forwarding ─────────────
  /** Am I (still) part of it – or do I have own events others haven't seen yet (leave/decline)? */
  involved(log) {
    const mine = log.state.members.get(this.me.id);
    if (mine) return true;
    for (const ev of log.events.values()) {
      if (ev.author !== this.me.id) continue;
      if (![...log.has.values()].some((set) => set.has(ev.id))) return true;
    }
    return false;
  }
  relevant(log, peerId) {
    return log.state.members.has(peerId) && this.involved(log);
  }
  /** New members only get messages written after they were invited. */
  visibleTo(log, peerId, ev) {
    if (ev.kind !== "msg") return true;
    return ev.seq > (log.state.members.get(peerId)?.inviteSeq ?? Number.MAX_SAFE_INTEGER);
  }
  onSessionUp(peerId) {
    this.synced.set(peerId, /* @__PURE__ */ new Set());
    for (const log of this.groups.values()) if (this.relevant(log, peerId)) this.sendSync(peerId, log);
  }
  onSessionDown(peerId) {
    this.synced.delete(peerId);
  }
  sendSync(peerId, log) {
    const sorted = [...log.events.values()].sort((a, b) => b.seq - a.seq);
    const taken = sorted.slice(0, MAX_SYNC_IDS);
    const since = sorted.length > taken.length ? taken[taken.length - 1]?.seq ?? 0 : 0;
    this.hooks.send(peerId, { t: "gsync", gid: log.gid, have: taken.map((e) => e.id), since });
    this.synced.get(peerId)?.add(log.gid);
  }
  sendEvents(peerId, gid, evs) {
    let batch = [];
    let size = 0;
    const flush = () => {
      if (batch.length) this.hooks.send(peerId, { t: "gev", gid, evs: batch });
      batch = [];
      size = 0;
    };
    for (const ev of [...evs].sort((a, b) => a.seq - b.seq)) {
      const s = JSON.stringify(ev).length;
      if (size + s > BATCH_BYTES || batch.length >= 400) flush();
      batch.push(ev);
      size += s;
    }
    flush();
  }
  onWire(peerId, m) {
    if (m.t === "gsync") this.onSync(peerId, m);
    else if (m.t === "gev") this.onEvents(peerId, m.gid, m.evs);
    else if (m.t === "gack") this.onAck(peerId, m);
  }
  /**
   * Receipts. If someone got events from me that another member wrote, I pass the
   * receipt on to that author – otherwise they'd never learn about relayed deliveries.
   */
  onAck(peerId, m) {
    const log = this.groups.get(m.gid);
    if (!log || !log.state.members.has(peerId)) return;
    const by = m.by ?? peerId;
    if (m.by && !log.state.members.has(m.by)) return;
    if (this.recordHas(log, by, m.ids)) this.hooks.changed();
    if (m.by) return;
    const connected = new Set(this.hooks.connectedPeers());
    const byAuthor = /* @__PURE__ */ new Map();
    for (const id of m.ids) {
      const author = log.events.get(id)?.author;
      if (!author || author === this.me.id || author === peerId || !connected.has(author)) continue;
      byAuthor.set(author, [...byAuthor.get(author) ?? [], id]);
    }
    for (const [author, ids] of byAuthor) this.hooks.send(author, { t: "gack", gid: log.gid, ids, by: peerId });
  }
  onSync(peerId, m) {
    const log = this.groups.get(m.gid);
    if (!log) {
      if (this.hooks.isAcceptedContact(peerId)) {
        this.hooks.send(peerId, { t: "gsync", gid: m.gid, have: [], since: 0 });
      }
      return;
    }
    if (!this.relevant(log, peerId)) return;
    const have = new Set(m.have);
    if (this.recordHas(log, peerId, m.have)) this.hooks.changed();
    const missing = [...log.events.values()].filter(
      (e) => e.seq >= m.since && !have.has(e.id) && this.visibleTo(log, peerId, e)
    );
    this.sendEvents(peerId, log.gid, missing);
    if (!this.synced.get(peerId)?.has(log.gid)) this.sendSync(peerId, log);
  }
  onEvents(peerId, gid, raw) {
    const evs = [];
    for (const r of raw) {
      const ev = parseEvent(r);
      if (ev && ev.gid === gid && verifyEvent(ev)) evs.push(ev);
    }
    if (!evs.length) return;
    let log = this.groups.get(gid);
    if (!log) {
      if (!this.hooks.isAcceptedContact(peerId)) return;
      const state = deriveGroup(gid, evs);
      if (!state) {
        this.hooks.send(peerId, { t: "gsync", gid, have: [], since: 0 });
        return;
      }
      if (state.members.get(this.me.id)?.status !== "invited") return;
      log = { gid, events: /* @__PURE__ */ new Map(), state, has: /* @__PURE__ */ new Map() };
      this.groups.set(gid, log);
      this.addEvents(log, evs, peerId);
      this.touch(gid);
      const invite = [...state.timeline].reverse().find((t) => t.type === "system" && t.action === "invite" && t.target === this.me.id);
      this.hooks.onInvited(gid, log.state, invite?.ev.author ?? peerId);
      return;
    }
    const wasMember = log.state.members.has(peerId);
    const after = deriveGroup(gid, [...log.events.values(), ...evs]);
    if (!wasMember && !after?.members.has(peerId)) return;
    const added = this.addEvents(log, evs, peerId);
    if (added.length) this.hooks.send(peerId, { t: "gack", gid, ids: added.map((e) => e.id) });
  }
  recordHas(log, peerId, ids) {
    const mine = ids.filter((id) => log.events.get(id)?.author === this.me.id);
    const set = log.has.get(peerId) ?? /* @__PURE__ */ new Set();
    const fresh = mine.filter((id) => !set.has(id));
    if (!fresh.length) return false;
    for (const id of fresh) set.add(id);
    log.has.set(peerId, set);
    appendJsonl(this.file(log.gid), { k: "has", by: peerId, ids: fresh });
    return true;
  }
  /**
   * Adds events (dedup by id), re-derives the group and forwards new events to everyone
   * connected who should have them – including people who were just removed, so they learn it.
   */
  addEvents(log, evs, from) {
    const added = evs.filter((e) => !log.events.has(e.id));
    if (!added.length) return [];
    const before = new Set(log.state.members.keys());
    const prevApplied = log.state.applied;
    const wasInvited = log.state.members.get(this.me.id)?.status === "invited";
    for (const e of added) {
      log.events.set(e.id, e);
      appendJsonl(this.file(log.gid), { k: "ev", ev: e });
    }
    log.state = deriveGroup(log.gid, log.events.values()) ?? log.state;
    if (from) this.recordHas(log, from, added.map((e) => e.id));
    if (from && log.state.members.get(this.me.id)?.status === "member") {
      for (const t of log.state.timeline) {
        if (t.type === "msg" && !prevApplied.has(t.ev.id) && t.ev.author !== this.me.id) {
          this.touch(log.gid, 1);
          this.hooks.onMessage(log.gid, t.ev, log.state);
        }
      }
    }
    const me = log.state.members.get(this.me.id);
    if (from && me?.status === "invited" && !wasInvited && prevApplied.size) {
      this.touch(log.gid);
      this.hooks.onInvited(log.gid, log.state, me.invitedBy ?? from);
    }
    const targets = /* @__PURE__ */ new Set([...before, ...log.state.members.keys()]);
    targets.delete(this.me.id);
    const connected = new Set(this.hooks.connectedPeers());
    for (const peerId of targets) {
      if (peerId === from || !connected.has(peerId)) continue;
      const pool = before.has(peerId) ? added : [...log.events.values()];
      this.sendEvents(peerId, log.gid, pool.filter((e) => this.visibleTo(log, peerId, e)));
    }
    this.hooks.changed();
    return added;
  }
};

// src/core/history.ts
import fs12 from "fs";
import path14 from "path";
var HistoryStore = class {
  constructor(paths) {
    this.paths = paths;
  }
  cache = /* @__PURE__ */ new Map();
  file(peerId) {
    return path14.join(this.paths.historyDir, `${peerId}.jsonl`);
  }
  get(peerId) {
    const cached = this.cache.get(peerId);
    if (cached) return cached;
    const byId = /* @__PURE__ */ new Map();
    for (const e of readJsonl(this.file(peerId))) {
      if (e.k === "m" && e.m?.id && !byId.has(e.m.id)) byId.set(e.m.id, e.m);
      else if (e.k === "d") {
        const m = byId.get(e.id);
        if (m?.status === "pending") byId.set(e.id, { ...m, status: "delivered" });
      } else if (e.k === "r" && Array.isArray(e.ids)) {
        for (const id of e.ids) {
          const m = byId.get(id);
          if (m) byId.set(id, { ...m, status: "read" });
        }
      }
    }
    const list = [...byId.values()];
    this.cache.set(peerId, list);
    return list;
  }
  has(peerId, msgId) {
    return this.get(peerId).some((m) => m.id === msgId);
  }
  add(peerId, msg) {
    const list = this.get(peerId);
    appendJsonl(this.file(peerId), { k: "m", m: msg });
    this.cache.set(peerId, [...list, msg]);
  }
  markDelivered(peerId, ids) {
    const wanted = new Set(ids);
    let changed = false;
    const next = this.get(peerId).map((m) => {
      if (m.from === "me" && m.status === "pending" && wanted.has(m.id)) {
        appendJsonl(this.file(peerId), { k: "d", id: m.id });
        changed = true;
        return { ...m, status: "delivered" };
      }
      return m;
    });
    if (changed) this.cache.set(peerId, next);
    return changed;
  }
  /** Marks messages as read – `from: 'me'` for receipts from the peer, `'peer'` for messages seen here. Returns the ids that changed. */
  markRead(peerId, ids, from) {
    const wanted = new Set(ids);
    const changed = [];
    const next = this.get(peerId).map((m) => {
      if (m.from === from && m.status !== "read" && wanted.has(m.id)) {
        changed.push(m.id);
        return { ...m, status: "read" };
      }
      return m;
    });
    if (changed.length) {
      appendJsonl(this.file(peerId), { k: "r", ids: changed });
      this.cache.set(peerId, next);
    }
    return changed;
  }
  /** Peer messages not seen yet. */
  unseen(peerId) {
    return this.get(peerId).filter((m) => m.from === "peer" && m.status !== "read").map((m) => m.id);
  }
  /** The last `n` peer messages seen here (their receipts are re-sent on reconnect). */
  recentlyRead(peerId, n) {
    return this.get(peerId).filter((m) => m.from === "peer" && m.status === "read").slice(-n).map((m) => m.id);
  }
  pending(peerId) {
    return this.get(peerId).filter((m) => m.from === "me" && m.status === "pending");
  }
  last(peerId) {
    const list = this.get(peerId);
    return list[list.length - 1];
  }
  /**
   * A contact has a new id (the move to ~/.termhub): their chat moves along. If there's
   * already a chat under the new id, both are kept – `get` skips messages it already has.
   */
  rekey(oldId, newId) {
    const from = this.file(oldId);
    if (!fs12.existsSync(from)) return;
    const to = this.file(newId);
    if (fs12.existsSync(to)) {
      fs12.appendFileSync(to, fs12.readFileSync(from));
      fs12.rmSync(from);
    } else {
      fs12.renameSync(from, to);
    }
    this.cache.delete(oldId);
    this.cache.delete(newId);
  }
  /** Is there a chat with this id? */
  hasChat(peerId) {
    return fs12.existsSync(this.file(peerId));
  }
  delete(peerId) {
    fs12.rmSync(this.file(peerId), { force: true });
    this.cache.set(peerId, []);
  }
};

// src/core/store.ts
var GROUP_PREFIX = "g-";
var isGroupChat = (chatId) => chatId.startsWith(GROUP_PREFIX);
var groupChatId = (gid) => GROUP_PREFIX + gid;
var gidOf = (chatId) => chatId.slice(GROUP_PREFIX.length);
var md = (s) => s.replace(/[\\`*_~#>\[\]|]/g, (ch) => `\\${ch}`);
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.history = new HistoryStore(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.net = new FriendNet({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port ?? readConfig(opts.paths).port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: opts.discoveryOptions,
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: WIRE,
      hooks: {
        changed: () => this.changed(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: (s, m) => this.onMessage(s, m),
        session: (s) => this.groups.onSessionUp(s.peerId),
        offline: (id) => this.groups.onSessionDown(id),
        stateMessage: (s, m) => {
          if (this.groups.sharesGroup(s.peerId)) {
            this.net.peerBook.update(s.peerId, { name: m.name, lastIp: s.remoteAddress, lastPort: m.port || void 0, lastSeen: Date.now() });
          }
        },
        stateChanged: (id, _prev, next) => {
          if (next === "accepted") this.flushOutbox(id);
        },
        // not a contact, but we share a group → keep the connection for group sync
        keepUnknown: (id) => this.groups.sharesGroup(id),
        extraDialIds: () => this.groups.peers(),
        alsoWants: (id) => this.groups.sharesGroup(id),
        extraHints: () => [...this.groups.peers()].map((id) => this.net.peerBook.get(id)?.lastIp).filter((ip) => !!ip),
        knowsId: (id) => this.history.hasChat(id),
        rekey: (oldId, newId) => this.history.rekey(oldId, newId),
        settings: (s) => this.applySettings(s)
      }
    });
    this.applySettings(this.hub.settings.get());
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.groups = new GroupManager(opts.paths, this.identity, {
      send: (id, msg) => this.net.send(id, msg),
      connectedPeers: () => [...this.network.sessions.keys()],
      isAcceptedContact: (id) => this.contacts.get(id)?.state === "accepted",
      changed: () => this.changed(),
      onMessage: (gid, ev, state) => this.onGroupMessage(gid, ev, state),
      onInvited: (gid, state, by) => {
        if (!this.net.dnd) this.showToast(`${this.peerName(by, state)} invited you to #${state.name}`, "info", groupChatId(gid));
      }
    });
  }
  net;
  hub;
  history;
  groups;
  paths;
  toasts;
  notes = /* @__PURE__ */ new Map();
  viewCutoffs = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  activeChat = null;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths, name) {
    return Hub.createProfile(paths.hub, name).id;
  }
  /** Is there a profile yet (in any app)? */
  static hasProfile(paths) {
    return Hub.hasProfile(paths.hub);
  }
  // ───────────── Shortcuts ─────────────
  get identity() {
    return this.net.identity;
  }
  get contacts() {
    return this.net.contacts;
  }
  get network() {
    return this.net.network;
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.net.start();
    this.changed();
  }
  async stop() {
    this.toasts.stop();
    await this.net.stop();
  }
  // ───────────── Subscription for React ─────────────
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }
  applySettings(s) {
    if (setAccent(s.accent)) this.changed();
  }
  // ───────────── Queries ─────────────
  get me() {
    return this.net.me;
  }
  get toast() {
    return this.toasts.current;
  }
  get settings() {
    return this.net.settings;
  }
  /** /effects – how <rgb>/<shine> (and the logo) animate; shared by all apps. */
  get effects() {
    return this.net.animations;
  }
  isOnline(id) {
    return this.net.isOnline(id);
  }
  away(id) {
    return this.net.presenceOf(id)?.away ?? false;
  }
  contact(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const online = this.isOnline(id);
    const p = this.net.presenceOf(id);
    return {
      ...c2,
      kind: "direct",
      display: displayName(c2),
      online,
      inactive: online && (p?.away ?? false),
      unread: c2.unread ?? 0,
      status: p?.status ?? "available",
      ...p?.msg ? { statusMsg: p.msg } : {},
      last: this.history.last(id)
    };
  }
  /** Best name for any peer: own nickname/contact name, else what the group says. */
  peerName(id, state) {
    if (id === this.identity.id) return this.net.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return state?.names.get(id) ?? this.net.peerBook.get(id)?.name ?? "Unknown";
  }
  group(chatId) {
    const gid = gidOf(chatId);
    const state = this.groups.get(gid);
    const myStatus = this.groups.myStatus(gid);
    if (!state || !myStatus) return void 0;
    const members = [...state.members.values()].map(
      (m) => ({
        id: m.id,
        name: this.peerName(m.id, state),
        status: m.status,
        online: m.id === this.identity.id || this.isOnline(m.id),
        inactive: m.id === this.identity.id ? !this.net.isFocused : this.isOnline(m.id) && this.away(m.id),
        isMe: m.id === this.identity.id,
        isCreator: m.id === state.creator
      })
    );
    const lastMsg = [...state.timeline].reverse().find((t) => t.type === "msg");
    const meta = this.groups.metaOf(gid);
    return {
      kind: "group",
      id: chatId,
      gid,
      display: state.name,
      creator: state.creator,
      myStatus,
      members,
      onlineCount: members.filter((m) => m.online && !m.inactive && !m.isMe && m.status === "member").length,
      inactiveCount: members.filter((m) => m.online && m.inactive && !m.isMe && m.status === "member").length,
      invitedBy: state.members.get(this.identity.id)?.invitedBy,
      unread: meta.unread,
      lastActivity: meta.lastActivity,
      last: lastMsg?.type === "msg" && myStatus !== "invited" ? {
        text: lastMsg.text,
        ts: lastMsg.ev.ts,
        mine: lastMsg.ev.author === this.identity.id,
        sender: this.peerName(lastMsg.ev.author, state)
      } : void 0
    };
  }
  /** Direct contact or group, by chat id. */
  chat(chatId) {
    return isGroupChat(chatId) ? this.group(chatId) : this.contact(chatId);
  }
  chatList() {
    const contacts = this.contacts.all().map((c2) => this.contact(c2.id));
    const groups = this.groups.list().map((g) => this.group(groupChatId(g.gid))).filter((g) => g && g.myStatus !== "declined");
    const all = [...contacts, ...groups].sort((a, b) => b.lastActivity - a.lastActivity);
    const isRequest = (e) => e.kind === "direct" ? e.state === "incoming" : e.myStatus === "invited";
    const rank = (e) => e.kind === "direct" && e.state === "blocked" ? 1 : 0;
    const rest = all.filter((e) => !isRequest(e));
    const isUnread = (e) => e.unread > 0;
    return {
      requests: all.filter(isRequest),
      unread: rest.filter(isUnread),
      chats: rest.filter((e) => e.kind === "direct" && !isUnread(e)).sort((a, b) => rank(a) - rank(b)),
      groups: rest.filter((e) => e.kind === "group" && !isUnread(e)),
      nearby: this.net.nearby()
    };
  }
  /** Everything shown in a chat, as UI-independent items (without ephemeral notes). */
  items(chatId) {
    if (!isGroupChat(chatId)) {
      const name = this.contact(chatId)?.display ?? "Unknown";
      return this.history.get(chatId).map((m) => ({
        kind: "msg",
        id: m.id,
        ts: m.ts,
        mine: m.from === "me",
        senderId: m.from === "me" ? this.identity.id : chatId,
        senderName: m.from === "me" ? "You" : name,
        text: m.text,
        status: m.status
      }));
    }
    const gid = gidOf(chatId);
    const state = this.groups.get(gid);
    if (!state) return [];
    const invited = this.groups.myStatus(gid) === "invited";
    const who = (id, object = false) => id === this.identity.id ? object ? "you" : "You" : `**${md(this.peerName(id, state))}**`;
    const out = [];
    for (const t of state.timeline) {
      const ev = t.ev;
      if (t.type === "msg") {
        if (invited || this.contacts.get(ev.author)?.state === "blocked") continue;
        const mine = ev.author === this.identity.id;
        const d = mine ? this.groups.delivery(gid, ev.id) : null;
        out.push({
          kind: "msg",
          id: ev.id,
          ts: ev.ts,
          mine,
          senderId: ev.author,
          senderName: mine ? "You" : this.peerName(ev.author, state),
          text: t.text,
          status: !d ? "delivered" : d.total === 0 || d.n === d.total ? "delivered" : d.n === 0 ? "pending" : d
        });
        continue;
      }
      const target = t.target ? who(t.target, true) : "";
      const text = t.action === "create" ? `${who(ev.author)} created the group **${md(t.value ?? "")}**` : t.action === "invite" ? `${who(ev.author)} invited ${target}` : t.action === "join" ? `${who(ev.author)} joined` : t.action === "decline" ? `${who(ev.author)} declined the invite` : t.action === "leave" ? `${who(ev.author)} left` : t.action === "kick" ? `${who(ev.author)} removed ${target}` : `${who(ev.author)} renamed the group to **${md(t.value ?? "")}**`;
      out.push({ kind: "note", id: ev.id, ts: ev.ts, text, noteKind: "info" });
    }
    return out;
  }
  onlineCount() {
    return this.network.sessions.size;
  }
  messages(id) {
    return this.history.get(id);
  }
  notesFor(id) {
    return this.notes.get(id) ?? [];
  }
  safetyCodeWith(id) {
    return this.net.safetyCodeWith(id);
  }
  // ───────────── UI helpers ─────────────
  setActiveChat(id) {
    this.activeChat = id;
    if (id) {
      this.markRead(id);
      this.seeChat(id);
    }
  }
  /**
   * Read receipts: messages count as read once their chat is open while the terminal is
   * in front. Receipts only go out while connected; flushOutbox re-sends recent ones.
   */
  seeChat(id) {
    if (isGroupChat(id) || this.activeChat !== id || !this.net.isFocused) return;
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== "accepted") return;
    const ids = this.history.markRead(id, this.history.unseen(id), "peer");
    for (let i = 0; i < ids.length; i += 500) s.send({ t: "read", ids: ids.slice(i, i + 500) });
  }
  markRead(id) {
    if (isGroupChat(id)) {
      if (this.groups.markRead(gidOf(id))) this.changed();
      return;
    }
    const c2 = this.contacts.get(id);
    if (c2 && (c2.unread ?? 0) > 0) {
      this.contacts.upsert(id, { unread: void 0 });
      this.changed();
    }
  }
  note(chatId, text, kind = "info") {
    const list = [...this.notesFor(chatId), { id: crypto8.randomUUID(), ts: Date.now(), text, kind }];
    this.notes.set(chatId, list.slice(-50));
    this.changed();
  }
  /** /clear: hides everything up to now without deleting the history. */
  clearView(chatId) {
    this.notes.delete(chatId);
    this.viewCutoffs.set(chatId, Date.now());
    this.changed();
  }
  viewCutoff(chatId) {
    return this.viewCutoffs.get(chatId) ?? 0;
  }
  showToast(text, kind = "info", chatId) {
    this.toasts.show(text, kind, chatId ? { chatId } : void 0);
  }
  /** Note in the chat if it's open – otherwise as a toast. */
  event(chatId, text, kind = "info") {
    this.note(chatId, text, kind);
    if (this.activeChat !== chatId) this.showToast(text, kind, chatId);
  }
  log(line) {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }
  onEvent(e) {
    switch (e.kind) {
      case "accepted":
        return this.event(e.id, e.byThem ? `${e.who} accepted your request` : `You are now connected with ${e.who}`, "success");
      case "incoming":
        return this.showToast(`${e.who} wants to chat with you`, "info", e.id);
      case "removedUs":
        return this.event(e.id, `${e.who} removed you as a contact \u2013 your request is waiting to be accepted`, "error");
      case "declinedUs":
        return this.event(e.id, `${e.who} declined your request`, "error");
      case "withdrawn":
        return this.showToast(`${e.who} withdrew their request`);
      case "requestSent":
        return this.note(e.id, "Request sent \u2013 waiting for them to accept");
      case "unreachable":
        return this.note(
          e.id,
          `Can't reach ${md(e.who)} at ${e.ip}:${e.port} yet (${md(e.error)}) \u2013 still trying. If this stays, a firewall is probably blocking termchat on one of your computers: on Windows, allow Node.js for public networks; on macOS, allow incoming connections for node.`,
          "error"
        );
      case "linked":
        for (const map of [this.notes, this.viewCutoffs]) {
          if (map.has(e.oldId) && !map.has(e.id)) map.set(e.id, map.get(e.oldId));
          map.delete(e.oldId);
        }
        if (this.activeChat === e.oldId) this.activeChat = e.id;
        return;
    }
  }
  // ───────────── Actions ─────────────
  sendMessage(id, raw) {
    const c2 = this.contacts.get(id);
    if (!c2) return { ok: false, error: "Unknown contact" };
    const text = sanitizeText(raw).trim();
    if (!text) return { ok: false };
    if (text.length > MAX_TEXT) return { ok: false, error: `Message too long (max. ${MAX_TEXT} characters)` };
    if (c2.state === "incoming") return { ok: false, error: "Accept the request first: /accept" };
    if (c2.state === "blocked") return { ok: false, error: "Contact is blocked: /unblock" };
    if (c2.state === "declined") return { ok: false, error: "Your request was declined. Ask again: /request" };
    const msg = { id: crypto8.randomUUID(), from: "me", text, ts: Date.now(), status: "pending" };
    this.history.add(id, msg);
    this.contacts.upsert(id, { lastActivity: msg.ts });
    if (c2.state === "accepted") this.network.get(id)?.send({ t: "msg", id: msg.id, ts: msg.ts, text: msg.text });
    else this.net.tryDial(id);
    this.changed();
    return { ok: true };
  }
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const r = this.net.requestNearby(id);
    if (r === "sent") this.note(id, "Sending request \u2026");
    else if (r === "accepted") this.note(id, `You accepted ${this.peerName(id)}'s request`, "success");
  }
  /** Ask again (after a decline). */
  request(id) {
    this.net.request(id);
    this.note(id, "Request sent again");
  }
  /** Add a contact by IP – for networks that block broadcast. */
  addByAddress(host, port = APP.tcpPort) {
    return this.net.addByAddress(host, port);
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || !this.net.accept(id)) return;
    this.note(id, `You accepted ${displayName(c2)}'s request`, "success");
    this.flushOutbox(id);
  }
  decline(id) {
    const c2 = this.net.decline(id);
    if (c2) this.showToast(`Declined ${displayName(c2)}'s request`);
  }
  block(id) {
    if (this.net.block(id)) this.note(id, "Contact blocked. No more connections will be accepted.", "error");
  }
  unblock(id) {
    if (this.net.unblock(id)) this.note(id, "Unblocked \u2013 request sent", "success");
  }
  /** Remove contact + history. */
  removeContact(id) {
    this.history.delete(id);
    this.notes.delete(id);
    this.net.remove(id);
  }
  rename(id, alias) {
    this.net.rename(id, alias);
  }
  /** Changes the shared name (all apps). */
  setName(name) {
    return this.net.setName(name);
  }
  deleteHistory(id) {
    this.history.delete(id);
    this.notes.delete(id);
    this.changed();
  }
  // ───────────── Groups ─────────────
  invitee(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "accepted" || !c2.publicKey) throw new Error("Only accepted contacts can be invited");
    return { id, pub: c2.publicKey, name: c2.name };
  }
  createGroup(name, memberIds) {
    if (!name.trim()) throw new Error("A group needs a name");
    const gid = this.groups.create(name, memberIds.map((id) => this.invitee(id)), this.net.name);
    for (const id of memberIds) this.net.tryDial(id);
    return groupChatId(gid);
  }
  groupInvite(chatId, memberIds) {
    for (const id of memberIds) {
      this.groups.invite(gidOf(chatId), this.invitee(id));
      this.net.tryDial(id);
    }
  }
  groupAccept(chatId) {
    this.groups.accept(gidOf(chatId));
  }
  groupDecline(chatId) {
    this.groups.decline(gidOf(chatId));
  }
  groupLeave(chatId) {
    this.groups.leave(gidOf(chatId));
  }
  groupKick(chatId, memberId) {
    this.groups.kick(gidOf(chatId), memberId);
  }
  groupRename(chatId, name) {
    if (!name.trim()) throw new Error("A group needs a name");
    this.groups.rename(gidOf(chatId), name);
  }
  deleteGroup(chatId) {
    this.groups.deleteLocal(gidOf(chatId));
    this.notes.delete(chatId);
  }
  sendGroupMessage(chatId, raw) {
    try {
      this.groups.send(gidOf(chatId), raw);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  onGroupMessage(gid, ev, state) {
    const chatId = groupChatId(gid);
    const preview = sanitizeText(ev.data.text ?? "").replace(/\s+/g, " ").slice(0, 60);
    this.net.notify(`#${state.name}`, `${this.peerName(ev.author, state)}: ${preview}`);
    if (this.activeChat === chatId) {
      this.groups.markRead(gid);
      return;
    }
    if (!this.net.dnd) this.showToast(`#${state.name} \xB7 ${this.peerName(ev.author, state)}: ${preview}`, "info", chatId);
  }
  // ───────────── Presence and notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    this.net.setFocused(focused);
    if (focused && this.activeChat) this.seeChat(this.activeChat);
  }
  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused() {
    return this.net.isFocused;
  }
  /** Do not disturb (profile status): messages arrive quietly, no notifications. */
  get dnd() {
    return this.net.dnd;
  }
  notificationsEnabled() {
    return this.net.notificationsEnabled();
  }
  setNotifications(on) {
    this.net.setNotifications(on);
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termchat ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
  /** /effects: shared by all apps (settings.json → animations). */
  setEffects(mode) {
    this.net.setAnimations(mode);
    this.changed();
  }
  // ───────────── Network events ─────────────
  onMessage(s, m) {
    const id = s.peerId;
    switch (m.t) {
      case "msg": {
        const c2 = this.contacts.get(id);
        if (c2?.state !== "accepted") return;
        if (!this.history.has(id, m.id)) {
          this.history.add(id, { id: m.id, from: "peer", text: m.text, ts: m.ts, status: "delivered" });
          const active = this.activeChat === id;
          this.net.notify(displayName(c2), m.text.replace(/\s+/g, " ").slice(0, 100));
          this.contacts.mutate(id, (cur) => ({ lastActivity: Date.now(), unread: active ? void 0 : (cur?.unread ?? 0) + 1 }));
          if (!active && !this.net.dnd) {
            const preview = m.text.replace(/\s+/g, " ").slice(0, 60);
            this.showToast(`${displayName(c2)}: ${preview}`, "info", id);
          }
          this.changed();
        }
        s.send({ t: "ack", ids: [m.id] });
        this.seeChat(id);
        return;
      }
      case "ack":
        if (this.history.markDelivered(id, m.ids)) this.changed();
        return;
      case "read":
        if (this.history.markRead(id, m.ids, "me").length) this.changed();
        return;
      case "gsync":
      case "gev":
      case "gack":
        this.groups.onWire(id, m);
        return;
    }
  }
  flushOutbox(id) {
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== "accepted") return;
    for (const m of this.history.pending(id)) s.send({ t: "msg", id: m.id, ts: m.ts, text: m.text });
    const read = this.history.recentlyRead(id, 100);
    if (read.length) s.send({ t: "read", ids: read });
    this.seeChat(id);
  }
};

// src/commands/registry.ts
var chatKindOf = (chatId) => chatId ? isGroupChat(chatId) ? "group" : "direct" : null;
var CommandRegistry2 = class extends CommandRegistry {
  constructor(commands) {
    super(commands, {
      where: (ctx) => chatKindOf(ctx.chatId),
      inScope: (scope, kind) => kind !== null && (scope === "chat" || scope === kind),
      outOfScope: (cmd, scope, kind) => !kind ? `/${cmd} only works inside an open chat` : `/${cmd} only works in ${scope === "group" ? "group chats" : "one-to-one chats"}`
    });
  }
};

// src/commands/builtin.ts
var STATE_LABEL = {
  accepted: "contact",
  outgoing: "request sent",
  incoming: "wants to chat with you",
  declined: "declined your request",
  blocked: "blocked"
};
function contactOf(ctx) {
  const c2 = ctx.chatId ? ctx.store.contact(ctx.chatId) : void 0;
  if (!c2) throw new Error("No contact selected");
  return c2;
}
function groupOf(ctx) {
  const g = ctx.chatId ? ctx.store.group(ctx.chatId) : void 0;
  if (!g) throw new Error("No group selected");
  return g;
}
function contactOptions(ctx, exclude = /* @__PURE__ */ new Set()) {
  return ctx.store.contacts.all().filter((c2) => c2.state === "accepted" && c2.publicKey && !exclude.has(c2.id)).map((c2) => ({ id: c2.id, label: c2.alias || c2.name, hint: ctx.store.isOnline(c2.id) ? "online" : void 0 })).sort((a, b) => a.label.localeCompare(b.label));
}
function parseAddress(input) {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1];
  const port = m[2] ? Number(m[2]) : APP.tcpPort;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net3.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}
var builtinCommands = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show all commands and shortcuts",
    scope: "global",
    run(ctx) {
      const kind = chatKindOf(ctx.chatId);
      const cmds = registry.available(kind);
      const width = Math.max(...cmds.map((c2) => `/${c2.name} ${c2.usage ?? ""}`.length));
      const lines = cmds.map((c2) => `\`${`/${c2.name} ${c2.usage ?? ""}`.trimEnd().padEnd(width)}\`  ${c2.description.replace(/</g, "\\<")}`);
      const keys = kind ? "**Keys:** `enter` send \xB7 `alt+enter` or `\\`+`enter` new line \xB7 `esc` back \xB7 scroll with wheel/trackpad or `\u2191/\u2193` (`alt+\u2191/\u2193` = input history) \xB7 `ctrl+n/p` next/previous chat \xB7 drag to select text" : "**Keys:** `\u2191\u2193` select \xB7 `enter` open \xB7 `g` new group \xB7 `a` add by IP \xB7 `/` command \xB7 `q` quit";
      ctx.ui.print(
        [
          "### Commands",
          "",
          ...lines.map((l) => `- ${l}`),
          "",
          keys,
          "",
          "Markdown: `**bold**` `*italic*` `~~strike~~` `` `code` `` `# Heading` `> Quote` `- List`",
          'Effects (type `<`): `<rgb>\u2026</rgb>` `<shine color="gold">\u2026</shine>`'
        ].join("\n")
      );
    }
  },
  {
    name: "me",
    aliases: ["id"],
    description: "Show your name, ID and address",
    scope: "global",
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(", ") : "no network";
      const status = statusText(me.status, me.statusMsg);
      ctx.ui.print(
        `**${me.name}** \xB7 ID \`${formatId(me.id, true)}\`${status ? ` \xB7 ${status}` : ""}
Reachable at ${addr}
_Name, ID and contacts are shared by termchat, keyrace and termdrop (~/.termhub)._`
      );
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name (in all apps)",
    scope: "global",
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now **${name}**`, "success");
    }
  },
  {
    name: "add",
    usage: "<ip[:port]>",
    minArgs: 1,
    description: "Add a contact by IP (if they don't show up under Nearby)",
    scope: "global",
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]);
      ctx.ui.print(`Connecting to ${host}:${port} \u2026`);
      const id = await ctx.store.addByAddress(host, port);
      ctx.ui.openChat(id);
    }
  },
  {
    name: "group",
    usage: "<name>",
    minArgs: 1,
    description: "Create a group chat and invite contacts",
    scope: "global",
    async run(ctx, _args, rest) {
      const options = contactOptions(ctx);
      if (!options.length) throw new Error("Add some contacts first \u2013 only contacts can be invited");
      const ids = await ctx.ui.pick(`Who should join #${rest}?`, options, true);
      if (ids === null) return;
      const chatId = ctx.store.createGroup(rest, ids);
      ctx.ui.openChat(chatId);
    }
  },
  {
    name: "accept",
    description: "Accept a chat request or group invite",
    scope: "chat",
    run(ctx) {
      if (chatKindOf(ctx.chatId) === "group") {
        ctx.store.groupAccept(groupOf(ctx).id);
        return;
      }
      const c2 = contactOf(ctx);
      if (c2.state === "outgoing") {
        throw new Error("You already sent a request \u2013 you're connected as soon as it reaches them and they accept");
      }
      if (c2.state !== "incoming") throw new Error("There is no pending request");
      ctx.store.accept(c2.id);
    }
  },
  {
    name: "decline",
    description: "Decline a chat request or group invite",
    scope: "chat",
    run(ctx) {
      if (chatKindOf(ctx.chatId) === "group") {
        ctx.store.groupDecline(groupOf(ctx).id);
        ctx.ui.goHome();
        return;
      }
      const c2 = contactOf(ctx);
      if (c2.state !== "incoming") throw new Error("There is no pending request");
      ctx.store.decline(c2.id);
      ctx.ui.goHome();
    }
  },
  {
    name: "request",
    description: "Send a new chat request",
    scope: "direct",
    run(ctx) {
      const c2 = contactOf(ctx);
      if (c2.state === "accepted" || c2.state === "outgoing") throw new Error("A request is already pending or you're connected");
      if (c2.state === "incoming") throw new Error("This person sent you a request \u2013 accept it with /accept");
      ctx.store.request(c2.id);
    }
  },
  {
    name: "invite",
    description: "Invite contacts to this group",
    scope: "group",
    async run(ctx) {
      const g = groupOf(ctx);
      const options = contactOptions(ctx, new Set(g.members.map((m) => m.id)));
      if (!options.length) throw new Error("All your contacts are already in this group");
      const ids = await ctx.ui.pick(`Invite to #${g.display}`, options, true);
      if (!ids?.length) return;
      ctx.store.groupInvite(g.id, ids);
    }
  },
  {
    name: "members",
    aliases: ["who"],
    description: "Show who is in this group",
    scope: "group",
    run(ctx) {
      const g = groupOf(ctx);
      const lines = g.members.sort((a, b) => Number(b.isCreator) - Number(a.isCreator) || a.name.localeCompare(b.name)).map((m) => {
        const tags = [
          m.isMe ? "you" : m.inactive ? "inactive" : m.online ? "online" : "offline",
          m.status === "invited" ? "invited" : "",
          m.isCreator ? "creator" : ""
        ].filter(Boolean);
        return `- ${m.isCreator ? "\u2605 " : ""}**${m.name}** _${tags.join(" \xB7 ")}_`;
      });
      ctx.ui.print([`### #${g.display} \xB7 ${g.members.length} members`, "", ...lines].join("\n"));
    }
  },
  {
    name: "kick",
    description: "Remove members from this group (creator only)",
    scope: "group",
    async run(ctx) {
      const g = groupOf(ctx);
      if (g.creator !== ctx.store.identity.id) throw new Error("Only the creator can remove members");
      const options = g.members.filter((m) => !m.isMe).map((m) => ({ id: m.id, label: m.name, hint: m.status === "invited" ? "invited" : void 0 }));
      if (!options.length) throw new Error("There's nobody else in this group");
      const ids = await ctx.ui.pick(`Remove from #${g.display}`, options, true);
      if (!ids?.length) return;
      const names = ids.map((id) => options.find((o) => o.id === id)?.label).join(", ");
      if (!await ctx.ui.confirm(`Remove ${names} from #${g.display}?`)) return;
      for (const id of ids) ctx.store.groupKick(g.id, id);
    }
  },
  {
    name: "leave",
    description: "Leave this group",
    scope: "group",
    async run(ctx) {
      const g = groupOf(ctx);
      if (await ctx.ui.confirm(`Leave #${g.display}?`)) ctx.store.groupLeave(g.id);
    }
  },
  {
    name: "rename",
    usage: "[name]",
    description: "Rename the group, or set your own nickname for a contact (empty = reset)",
    scope: "chat",
    run(ctx, _args, rest) {
      if (chatKindOf(ctx.chatId) === "group") {
        if (!rest) throw new Error("Usage: /rename <new group name>");
        ctx.store.groupRename(groupOf(ctx).id, rest);
        return;
      }
      const c2 = contactOf(ctx);
      ctx.store.rename(c2.id, rest);
      ctx.ui.print(rest ? `Now shown as **${ctx.store.contact(c2.id)?.display}**` : "Nickname removed", "success");
    }
  },
  {
    name: "whois",
    aliases: ["info"],
    description: "Contact details and safety code",
    scope: "direct",
    run(ctx) {
      const c2 = contactOf(ctx);
      const code = ctx.store.safetyCodeWith(c2.id);
      const lines = [
        `### ${c2.display}${c2.alias ? ` _(calls themselves ${c2.name})_` : ""}`,
        "",
        `- **ID** \`${formatId(c2.id, true)}\``,
        `- **Status** ${c2.inactive ? "inactive" : c2.online ? "online" : "offline"}${c2.online && statusText(c2.status, c2.statusMsg) ? ` \xB7 ${statusText(c2.status, c2.statusMsg)}` : ""} \xB7 ${STATE_LABEL[c2.state] ?? c2.state}`,
        `- **Address** ${c2.lastIp ? `\`${c2.lastIp}:${c2.lastPort ?? "?"}\`` : "unknown"}`,
        `- **Safety code** ${code ? `\`${code}\`` : "not connected yet"}`,
        "",
        "_Compare the safety code in person. If it matches, nobody can be listening in._"
      ];
      ctx.ui.print(lines.join("\n"));
    }
  },
  {
    name: "block",
    description: "Block this contact",
    scope: "direct",
    async run(ctx) {
      const c2 = contactOf(ctx);
      if (await ctx.ui.confirm(`Block ${c2.display}?`)) ctx.store.block(c2.id);
    }
  },
  {
    name: "unblock",
    description: "Unblock this contact",
    scope: "direct",
    run(ctx) {
      const c2 = contactOf(ctx);
      if (c2.state !== "blocked") throw new Error("Contact is not blocked");
      ctx.store.unblock(c2.id);
    }
  },
  {
    name: "clear",
    description: "Clear the view (history stays saved)",
    scope: "chat",
    run(ctx) {
      ctx.store.clearView(ctx.chatId);
    }
  },
  {
    name: "delete",
    description: "Permanently delete this chat's history",
    scope: "chat",
    async run(ctx) {
      if (chatKindOf(ctx.chatId) === "group") {
        const g = groupOf(ctx);
        if (g.myStatus === "member" || g.myStatus === "invited") throw new Error("Leave the group first: /leave");
        if (await ctx.ui.confirm(`Delete #${g.display} and its history from this device?`)) {
          ctx.store.deleteGroup(g.id);
          ctx.ui.goHome();
        }
        return;
      }
      const c2 = contactOf(ctx);
      if (await ctx.ui.confirm(`Delete the entire history with ${c2.display}?`)) {
        ctx.store.deleteHistory(c2.id);
        ctx.ui.print("History deleted", "success");
      }
    }
  },
  {
    name: "remove",
    description: "Remove contact and history",
    scope: "direct",
    async run(ctx) {
      const c2 = contactOf(ctx);
      if (await ctx.ui.confirm(`Remove ${c2.display} as a contact and delete the history?`)) {
        ctx.store.removeContact(c2.id);
        ctx.ui.goHome();
      }
    }
  },
  {
    name: "export",
    aliases: ["save"],
    usage: "[file.md]",
    description: "Save the history as a Markdown file",
    scope: "chat",
    run(ctx, args) {
      const file = exportChat(ctx.store, ctx.chatId, args[0]);
      ctx.ui.print(`Saved to \`${file}\``, "success");
    }
  },
  {
    name: "copy",
    description: "Copy the last code block (or else the last message) to the clipboard",
    scope: "chat",
    async run(ctx) {
      const texts = ctx.store.items(ctx.chatId).filter((it) => it.kind === "msg").map((it) => it.text);
      if (!texts.length) throw new Error("Nothing to copy yet");
      let text = texts[texts.length - 1];
      let what = "the last message";
      for (let i = texts.length - 1; i >= 0; i--) {
        const blocks2 = codeBlocks(texts[i]);
        if (blocks2.length) {
          text = blocks2[blocks2.length - 1];
          what = "the last code block";
          break;
        }
      }
      await copyToClipboard(text);
      ctx.ui.print(`Copied ${what} to the clipboard`, "success");
    }
  },
  {
    name: "effects",
    usage: "[nonstop|brief|off]",
    description: "<rgb>/<shine>: animate nonstop, for 8 seconds (default) or not at all (logos too, all apps)",
    scope: "global",
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      const mode = arg === "on" ? "nonstop" : arg === "8s" ? "brief" : arg;
      if (mode && !ANIMATIONS.includes(mode)) throw new Error("Usage: /effects nonstop|brief|off");
      if (mode) ctx.store.setEffects(mode);
      const label = { nonstop: "animate nonstop", brief: "animate for 8 seconds, then rest", off: "are off (shown without animation)" };
      ctx.ui.print(`Effects ${label[ctx.store.effects]}`, "info");
    }
  },
  {
    name: "notifications",
    aliases: ["notify"],
    usage: "[on|off]",
    description: "Desktop notifications while the app is in the background (all apps)",
    scope: "global",
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== "on" && arg !== "off") throw new Error("Usage: /notifications on|off");
      if (arg) ctx.store.setNotifications(arg === "on");
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? "on" : "off"}`, "info");
    }
  },
  {
    name: "update",
    description: "Install the latest termchat version from GitHub",
    scope: "global",
    async run(ctx) {
      if (installKind() === "source") return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print("Checking for updates \u2026");
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub \u2013 are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`termchat ${VERSION} is up to date`, "success");
        return;
      }
      if (!await ctx.ui.confirm(`Update termchat ${VERSION} \u2192 ${latest}?`)) return;
      ctx.ui.print(`Installing termchat ${latest} \u2026 (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split("\n").slice(-6).join("\n");
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:
\`\`\`
${tail}
\`\`\``);
      }
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart termchat now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated \u2013 restart termchat to use ${latest}`, "success");
      }
    }
  },
  {
    name: "quit",
    aliases: ["exit", "q"],
    description: "Quit termchat",
    scope: "global",
    run(ctx) {
      ctx.ui.quit();
    }
  }
];
var registry = new CommandRegistry2(builtinCommands);

// ../termcore/src/ui/components/Header.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var friendsOnline = (n, wide) => wide ? n === 1 ? "friend online" : "friends online" : "online";
function Header({ app, version, width, me, address, online, onlineLabel = friendsOnline, updateAvailable }) {
  const wide = width >= 72;
  const status = me.status && me.status !== "available" ? presenceDot({ online: true, status: me.status }) : null;
  const statusLine = wide ? statusText(me.status, me.statusMsg) : "";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: theme.onAccent, bold: true, children: ` ${app} ` }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          version
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: me.color, children: me.name }),
        status ? /* @__PURE__ */ jsxs(Text, { color: status.color, children: [
          " ",
          status.icon
        ] }) : null,
        statusLine ? /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          statusLine
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: address }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " ",
          onlineLabel(online, wide)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// ../termcore/src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";

// ../termcore/src/ui/text.ts
import chalk5 from "chalk";
import wrapAnsi2 from "wrap-ansi";
function inline2(text) {
  return text.replace(/`([^`]+)`/g, (_m, s) => chalk5.hex(theme.accent)(s)).replace(/\*\*([^*]+)\*\*/g, (_m, s) => chalk5.bold(s)).replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, (_m, pre, s) => pre + chalk5.hex(theme.dim)(s));
}
function renderText(text, width) {
  const out = [];
  for (const raw of text.split("\n")) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) {
      out.push(chalk5.bold(inline2(h[1])));
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (li) {
      const indent = li[1].length;
      const body = wrapAnsi2(inline2(li[2]), Math.max(10, width - indent - 2), { hard: true }).split("\n");
      body.forEach((l, i) => out.push(" ".repeat(indent) + (i === 0 ? chalk5.hex(theme.dim)("\u2022 ") : "  ") + l));
      continue;
    }
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapAnsi2(inline2(raw), Math.max(10, width), { hard: true }).split("\n"));
  }
  return out;
}

// ../termcore/src/ui/components/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({
  text,
  width,
  height,
  onClose,
  render: render2 = renderText
}) {
  useInput(() => onClose());
  const lines = render2(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: l || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// ../termcore/src/ui/editor.ts
import stringWidth3 from "string-width";
var emptyEditor = { value: "", cursor: 0 };
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function graphemes3(text) {
  return [...segmenter.segment(text)].map((s) => ({ segment: s.segment, index: s.index }));
}
function prevBoundary(value, cursor) {
  let prev = 0;
  for (const g of graphemes3(value)) {
    if (g.index >= cursor) break;
    prev = g.index;
  }
  return prev;
}
function nextBoundary(value, cursor) {
  for (const g of graphemes3(value)) {
    if (g.index >= cursor) return g.index + g.segment.length;
  }
  return value.length;
}
var isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);
function wordLeft(value, cursor) {
  let i = cursor;
  while (i > 0 && !isWordChar(value[i - 1])) i--;
  while (i > 0 && isWordChar(value[i - 1])) i--;
  return i;
}
function wordRight(value, cursor) {
  let i = cursor;
  while (i < value.length && !isWordChar(value[i])) i++;
  while (i < value.length && isWordChar(value[i])) i++;
  return i;
}
var lineStart = (value, cursor) => value.lastIndexOf("\n", cursor - 1) + 1;
var lineEnd = (value, cursor) => {
  const i = value.indexOf("\n", cursor);
  return i === -1 ? value.length : i;
};
var edit = {
  insert(s, text) {
    return { value: s.value.slice(0, s.cursor) + text + s.value.slice(s.cursor), cursor: s.cursor + text.length };
  },
  backspace(s) {
    if (s.cursor === 0) return s;
    const p = prevBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  deleteForward(s) {
    if (s.cursor >= s.value.length) return s;
    const n = nextBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(n), cursor: s.cursor };
  },
  deleteWordBack(s) {
    const p = wordLeft(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineStart(s) {
    const p = lineStart(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineEnd(s) {
    const e = lineEnd(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(e), cursor: s.cursor };
  },
  left: (s) => ({ ...s, cursor: prevBoundary(s.value, s.cursor) }),
  right: (s) => ({ ...s, cursor: nextBoundary(s.value, s.cursor) }),
  wordLeft: (s) => ({ ...s, cursor: wordLeft(s.value, s.cursor) }),
  wordRight: (s) => ({ ...s, cursor: wordRight(s.value, s.cursor) }),
  home: (s) => ({ ...s, cursor: lineStart(s.value, s.cursor) }),
  end: (s) => ({ ...s, cursor: lineEnd(s.value, s.cursor) }),
  /** One line up/down; `null` if already on the first/last line. */
  vertical(s, dir) {
    const start2 = lineStart(s.value, s.cursor);
    const col = s.cursor - start2;
    if (dir === -1) {
      if (start2 === 0) return null;
      const prevStart = lineStart(s.value, start2 - 1);
      return { ...s, cursor: Math.min(prevStart + col, start2 - 1) };
    }
    const end = lineEnd(s.value, s.cursor);
    if (end === s.value.length) return null;
    const nextEnd = lineEnd(s.value, end + 1);
    return { ...s, cursor: Math.min(end + 1 + col, nextEnd) };
  }
};
function cleanPaste(text) {
  return text.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}
function layoutEditor(s, width) {
  const w = Math.max(1, width);
  const lines = [];
  let offset = 0;
  for (const logical of s.value.split("\n")) {
    let current = "";
    let currentWidth = 0;
    let cursorAt = null;
    for (const g of graphemes3(logical)) {
      const gw = stringWidth3(g.segment);
      if (currentWidth + gw > w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      if (offset + g.index === s.cursor) cursorAt = current.length;
      current += g.segment;
      currentWidth += gw;
    }
    if (offset + logical.length === s.cursor) {
      if (currentWidth >= w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      cursorAt = current.length;
    }
    lines.push({ text: current, cursor: cursorAt });
    offset += logical.length + 1;
  }
  return lines;
}

// ../termcore/src/ui/mouse.ts
import { EventEmitter as EventEmitter6 } from "events";
import { PassThrough } from "stream";
import { useEffect as useEffect2, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h\x1B[?2004h";
var MOUSE_OFF = "\x1B[?2004l\x1B[?1004l\x1B[?1007l";
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
var PASTE_PENDING_MS = 1e3;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending = "") {
  const s = pending + input;
  const events = [];
  const focus = [];
  const pastes = [];
  let text = "";
  let i = 0;
  const done = (rest) => finish(text, events, rest, focus, pastes);
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);
    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      if (end === -1) return done(rest);
      pastes.push(rest.slice(PASTE_START.length, end));
      i = esc + end + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(PASTE_END)) {
      i = esc + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === "I");
      i = esc + 3;
      continue;
    }
    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === "M" ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(rest);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest) || rest.length < PASTE_START.length && PASTE_START.startsWith(rest)) {
      return done(rest);
    }
    text += ESC;
    i = esc + 1;
  }
  return done("");
}
function finish(text, events, pending, focus, pastes) {
  return { text, events, pending, ...focus.length ? { focus } : {}, ...pastes.length ? { pastes } : {} };
}
var mouse = new EventEmitter6();
var pasteHandlers = [];
function emitPaste(text) {
  for (let i = pasteHandlers.length - 1; i >= 0; i--) if (pasteHandlers[i].cb(text)) return true;
  return false;
}
var MouseFilterStdin = class extends PassThrough {
  constructor(source) {
    super();
    this.source = source;
    source.setEncoding("utf8");
    source.on("data", (chunk) => this.feed(chunk));
  }
  isTTY = true;
  pending = "";
  timer = null;
  feed(chunk) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit("wheel", e);
    for (const f of r.focus ?? []) mouse.emit("focus", f);
    if (r.text) this.write(r.text);
    for (const p of r.pastes ?? []) this.paste(p);
    if (this.pending) {
      const inPaste = this.pending.startsWith(PASTE_START);
      this.timer = setTimeout(
        () => {
          const p = this.pending;
          this.pending = "";
          if (inPaste) this.paste(p.slice(PASTE_START.length));
          else if (p) this.write(p);
        },
        inPaste ? PASTE_PENDING_MS : PENDING_MS
      );
    }
  }
  paste(text) {
    if (!emitPaste(text) && text) this.write(text);
  }
  setRawMode(mode) {
    this.source.setRawMode(mode);
    return this;
  }
  ref() {
    this.source.ref();
    return this;
  }
  unref() {
    this.source.unref();
    return this;
  }
};
function usePaste(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const h = { cb: (text) => latest.current(text) };
    pasteHandlers.push(h);
    return () => {
      pasteHandlers.splice(pasteHandlers.indexOf(h), 1);
    };
  }, [isActive]);
}
function useWheel(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const on = (dir) => latest.current(dir);
    mouse.on("wheel", on);
    return () => {
      mouse.off("wheel", on);
    };
  }, [isActive]);
}

// ../termcore/src/ui/hooks.ts
import { useStdout } from "ink";
import { useEffect as useEffect3, useState as useState2, useSyncExternalStore } from "react";
function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState2(read);
  useEffect3(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}
function useStoreVersion(store) {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

// src/ui/screens/Chat.tsx
import { Box as Box8, Text as Text8 } from "ink";
import { useEffect as useEffect6, useMemo, useRef as useRef4, useState as useState6 } from "react";

// ../termcore/src/ui/components/CommandMenu.tsx
import { Box as Box3, Text as Text3 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start2 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start2, start2 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx3(Box3, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start2 + i === selected;
    return /* @__PURE__ */ jsxs3(Box3, { children: [
      /* @__PURE__ */ jsx3(Box3, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx3(Text3, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx3(Text3, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Box as Box5, Text as Text5, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// ../termcore/src/ui/components/InputBox.tsx
import { Box as Box4, Text as Text4, useInput as useInput2 } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function inputBoxHeight(state, width, maxLines = 8) {
  return Math.min(layoutEditor(state, contentWidth(width)).length, maxLines) + 2;
}
var contentWidth = (width) => Math.max(
  4,
  width - 2 - 2 - 2
  /* Prompt */
);
function InputBox({
  state,
  onChange,
  onSubmit,
  isActive,
  width,
  placeholder,
  maxLines = 8,
  history = [],
  onKey,
  singleLine = false,
  borderColor = theme.border,
  maxLength,
  onPaste,
  afterType
}) {
  const histIndex = useRef2(null);
  const draft = useRef2("");
  const latest = useRef2(state);
  latest.current = state;
  const change = (next) => {
    latest.current = next;
    onChange(next);
  };
  const recall = (dir) => {
    if (!history.length) return false;
    let idx = histIndex.current;
    if (idx === null) {
      if (dir === 1) return false;
      draft.current = latest.current.value;
      idx = history.length;
    }
    idx += dir;
    if (idx < 0) return true;
    if (idx >= history.length) {
      histIndex.current = null;
      change({ value: draft.current, cursor: draft.current.length });
      return true;
    }
    histIndex.current = idx;
    const v = history[idx];
    change({ value: v, cursor: v.length });
    return true;
  };
  const insertText = (raw, typed = false) => {
    let text = cleanPaste(raw);
    if (singleLine) text = text.replace(/\n/g, " ");
    const state2 = latest.current;
    if (!text) return;
    if (maxLength !== void 0 && [...state2.value].length + [...text].length > maxLength) return;
    histIndex.current = null;
    const next = edit.insert(state2, text);
    change(typed && afterType ? afterType(next, raw) : next);
  };
  usePaste((text) => {
    if (!onPaste?.(text)) insertText(text);
    return true;
  }, isActive);
  useInput2(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === "c") return;
      const state2 = latest.current;
      const set = (next) => {
        histIndex.current = null;
        change(next);
      };
      if (key.return) {
        if (!singleLine && key.meta) return set(edit.insert(state2, "\n"));
        if (!singleLine && state2.value[state2.cursor - 1] === "\\") {
          return set(edit.insert(edit.backspace(state2), "\n"));
        }
        histIndex.current = null;
        onSubmit(state2.value);
        return;
      }
      if (key.escape) return;
      if (key.tab) return;
      if ((key.backspace || key.delete) && key.meta) return set(edit.deleteWordBack(state2));
      if (key.backspace || key.delete) return set(edit.backspace(state2));
      if (key.leftArrow) return set(key.meta || key.ctrl ? edit.wordLeft(state2) : edit.left(state2));
      if (key.rightArrow) return set(key.meta || key.ctrl ? edit.wordRight(state2) : edit.right(state2));
      if (key.home) return set(edit.home(state2));
      if (key.end) return set(edit.end(state2));
      if (key.upArrow) {
        const moved = edit.vertical(state2, -1);
        if (moved) return set(moved);
        recall(-1);
        return;
      }
      if (key.downArrow) {
        const moved = edit.vertical(state2, 1);
        if (moved) return set(moved);
        recall(1);
        return;
      }
      if (key.pageUp || key.pageDown) return;
      if (key.ctrl) {
        switch (input) {
          case "a":
            return set(edit.home(state2));
          case "e":
            return set(edit.end(state2));
          case "u":
            return set(edit.killToLineStart(state2));
          case "k":
            return set(edit.killToLineEnd(state2));
          case "w":
            return set(edit.deleteWordBack(state2));
          case "d":
            return set(edit.deleteForward(state2));
          case "j":
            return singleLine ? void 0 : set(edit.insert(state2, "\n"));
          default:
            return;
        }
      }
      if (key.meta) {
        if (input === "b") return set(edit.wordLeft(state2));
        if (input === "f") return set(edit.wordRight(state2));
        return;
      }
      if (input.length > 1 && onPaste?.(input)) return;
      insertText(input, true);
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start2 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start2, start2 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx4(Box4, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start2 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx4(Text4, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx4(Text4, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx4(Text4, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  if (d.kind === "custom") return d.height;
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx5(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx5(PromptDialog, { spec, width });
  if (spec.kind === "custom") return /* @__PURE__ */ jsx5(Fragment2, { children: spec.render(width) });
  return /* @__PURE__ */ jsx5(PickDialog, { spec, width });
}
function DialogFrame({ width, children }) {
  return /* @__PURE__ */ jsx5(Box5, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs5(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx5(Text5, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs5(Text5, { color: theme.dim, children: [
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState3(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs5(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx5(Text5, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx5(Text5, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx5(
      InputBox,
      {
        state,
        onChange: setState,
        onSubmit: (v) => spec.resolve(v.trim()),
        onKey: (_i, key) => {
          if (key.escape) {
            spec.resolve(null);
            return true;
          }
          return false;
        },
        isActive: true,
        singleLine: true,
        width: width - 4
      }
    ),
    /* @__PURE__ */ jsx5(Text5, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
  ] });
}
function PickDialog({ spec, width }) {
  const [cursor, setCursor] = useState3(0);
  const [chosen, setChosen] = useState3(() => new Set(spec.opts?.preselect ?? []));
  const n = spec.options.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput3((input, key) => {
    if (key.escape) return spec.resolve(null);
    if (key.upArrow || input === "k") return setCursor((c2) => (c2 - 1 + n) % n);
    if (key.downArrow || input === "j") return setCursor((c2) => (c2 + 1) % n);
    const current = spec.options[cursor];
    if (input === " " && spec.multi && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (key.return) {
      if (!spec.multi) return spec.resolve(current ? [current.id] : []);
      if (chosen.size) return spec.resolve(spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id));
      spec.resolve(spec.opts?.emptyOk || !current ? [] : [current.id]);
    }
  });
  const start2 = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start2, start2 + PICK_VISIBLE);
  return /* @__PURE__ */ jsxs5(DialogFrame, { width, children: [
    /* @__PURE__ */ jsxs5(Text5, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs5(Text5, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start2 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx5(Text5, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx5(Text5, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs5(Text5, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx5(Text5, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// ../termcore/src/ui/components/Footer.tsx
import { Box as Box6, Text as Text6 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var kindStyle = (kind) => kind === "success" ? { color: theme.success, icon: icons.done } : kind === "error" ? { color: theme.error, icon: icons.error } : { color: theme.accent, icon: icons.request };
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = kindStyle(toast.kind);
    return /* @__PURE__ */ jsx6(Box6, { width, paddingX: 1, children: /* @__PURE__ */ jsxs6(Text6, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs6(Text6, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx6(Box6, { width, paddingX: 1, children: /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// src/ui/components/MessageList.tsx
import { Box as Box7, Text as Text7 } from "ink";
import { useEffect as useEffect4, useRef as useRef3, useState as useState4 } from "react";
import stringWidth4 from "string-width";

// ../termcore/src/ui/format.ts
var pad = (n) => String(n).padStart(2, "0");
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function clock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var daysAgo = (ts, now) => Math.round((startOfDay(now) - startOfDay(ts)) / 864e5);
function shortTime(ts, now = Date.now()) {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return clock(ts);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[d.getDay()];
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
function dayLabel(ts, now = Date.now()) {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS_LONG[d.getDay()];
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function lastSeen(ts, now = Date.now()) {
  if (!ts) return "offline";
  const min2 = Math.floor((now - ts) / 6e4);
  if (min2 < 1) return "last seen just now";
  if (min2 < 60) return `last seen ${min2} min ago`;
  const days = daysAgo(ts, now);
  if (days <= 0) return `last seen at ${clock(ts)}`;
  return `last seen ${shortTime(ts, now)}`;
}

// src/ui/components/MessageList.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var GROUP_GAP = 5 * 6e4;
var INDENT = "  ";
var cache = /* @__PURE__ */ new Map();
function cachedMarkdown(text, width) {
  const k = `${width}\0${text}`;
  let lines = cache.get(k);
  if (!lines) {
    if (cache.size > 3e3) cache.clear();
    lines = renderMarkdown(text, width);
    cache.set(k, lines);
  }
  return lines;
}
function statusMark(status) {
  if (status === "read") return c.success(icons.read);
  if (status === "delivered") return c.dim(icons.delivered);
  if (status === "pending") return c.faint(icons.pending);
  return c.dim(`${icons.delivered} ${status.n}/${status.total}`);
}
function buildChatLines({ items, notes, width, colorful = false, cutoff = 0, now = Date.now() }) {
  const merged = [];
  const pendingNotes = [...notes].sort((a, b) => a.ts - b.ts);
  const noteItem = (n) => ({ kind: "note", id: n.id, ts: n.ts, text: n.text, noteKind: n.kind });
  for (const item of items) {
    if (item.ts <= cutoff) continue;
    while (pendingNotes.length && pendingNotes[0].ts < item.ts) merged.push(noteItem(pendingNotes.shift()));
    merged.push(item);
  }
  for (const n of pendingNotes) merged.push(noteItem(n));
  const bodyWidth = Math.max(10, width - INDENT.length - 2);
  const lines = [];
  let lastDay = -1;
  let lastSender = null;
  let lastTs = 0;
  for (const item of merged) {
    const day = startOfDay(item.ts);
    if (day !== lastDay) {
      if (lines.length) lines.push("");
      const label = ` ${dayLabel(item.ts, now)} `;
      const side = Math.max(2, Math.floor((width - stringWidth4(label)) / 2));
      lines.push(c.faint("\u2500".repeat(side) + label + "\u2500".repeat(side)));
      lastDay = day;
      lastSender = null;
    }
    if (item.kind === "note") {
      const icon = item.noteKind === "error" ? c.error(icons.error) : item.noteKind === "success" ? c.success(icons.delivered) : c.dim(icons.info);
      const body2 = cachedMarkdown(item.text, bodyWidth - 2);
      if (lastSender !== null) lines.push("");
      body2.forEach((l, i) => lines.push(INDENT + (i === 0 ? `${icon} ` : "  ") + (item.noteKind === "info" ? c.dim(l) : l)));
      lastSender = null;
      continue;
    }
    if (item.senderId !== lastSender || item.ts - lastTs > GROUP_GAP) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      const paint = item.mine ? c.accent : colorful ? senderColor(item.senderId) : c.peer;
      lines.push(`${paint.bold(item.mine ? "You" : item.senderName)}  ${c.faint(clock(item.ts))}`);
    }
    const body = cachedMarkdown(item.text, bodyWidth);
    body.forEach((l, i) => {
      let line = INDENT + l;
      if (item.mine && i === body.length - 1) line += " " + statusMark(item.status);
      lines.push(line);
    });
    lastSender = item.senderId;
    lastTs = item.ts;
  }
  return lines;
}
function useEffectsTime(signature, mode) {
  const since = useRef3(Date.now());
  const last = useRef3(signature);
  if (last.current !== signature) {
    last.current = signature;
    since.current = Date.now();
  }
  const [now, setNow] = useState4(Date.now);
  const moving = signature !== "" && (mode === "nonstop" || mode === "brief" && now - since.current < ANIM_MS);
  useEffect4(() => {
    if (!signature || mode === "off") return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (mode === "brief" && n - since.current >= ANIM_MS) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [signature, mode]);
  return effectTime(mode, moving ? now : Math.max(now, since.current + ANIM_MS), since.current);
}
function MessageList({
  lines,
  height,
  offset,
  width,
  effects = "brief"
}) {
  const h = Math.max(1, height);
  const end = Math.max(0, lines.length - offset);
  const start2 = Math.max(0, end - h);
  const visible = lines.slice(start2, end);
  const indicator = offset > 0;
  if (indicator) visible[visible.length - 1] = c.dim(`  \u2193 ${offset} newer lines`);
  const padding = Math.max(0, h - visible.length);
  const animated = visible.some(hasEffects);
  const now = useEffectsTime(animated ? visible.filter(hasEffects).join("\n") : "", effects);
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", height: h, width, paddingX: 1, overflow: "hidden", children: [
    Array.from({ length: padding }, (_, i) => /* @__PURE__ */ jsx7(Text7, { children: " " }, `p${i}`)),
    visible.map((l, i) => /* @__PURE__ */ jsx7(Text7, { wrap: "truncate-end", children: (animated ? applyEffects(l, now) : l) || " " }, i))
  ] });
}

// src/ui/screens/useCommandInput.ts
import { useEffect as useEffect5, useState as useState5 } from "react";
function useCommandInput({ editor, setEditor, kind, onSubmit, onEscape, tags = false }) {
  const [selected, setSelected] = useState5(0);
  const [dismissed, setDismissed] = useState5(-1);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands = filter !== null ? registry.suggest(filter, kind) : [];
  const tagAt = tags && filter === null ? tagStart(editor.value, editor.cursor) : -1;
  const tagList = tagAt >= 0 && tagAt !== dismissed ? tagSuggestions(editor.value, editor.cursor) : [];
  const items = commands.length ? commands.map((c2) => ({ key: c2.name, label: `/${c2.name} ${c2.usage ?? ""}`.trimEnd(), description: c2.description })) : tagList.map((t) => ({ key: t.name, label: `${t.open}\u2026${t.close}`, description: t.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  const menuKey = filter ?? (tagList.length ? `<${editor.value.slice(tagAt + 1, editor.cursor)}` : null);
  useEffect5(() => setSelected(0), [menuKey]);
  useEffect5(() => {
    if (dismissed >= 0 && tagAt !== dismissed) setDismissed(-1);
  }, [tagAt, dismissed]);
  const complete = (cmd) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };
  const onKey = (_input, key) => {
    if (items.length) {
      const n = items.length;
      if (key.upArrow) {
        setSelected((sel - 1 + n) % n);
        return true;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % n);
        return true;
      }
    }
    if (tagList.length) {
      if (key.tab || key.return && !key.meta) {
        setEditor(insertTag(editor, tagList[sel]));
        return true;
      }
      if (key.escape) {
        setDismissed(tagAt);
        return true;
      }
    }
    if (commands.length) {
      if (key.tab) {
        complete(commands[sel]);
        return true;
      }
      if (key.return && !key.meta) {
        const exact = filter ? registry.find(filter) : void 0;
        const target = exact ?? (commands.length === 1 ? commands[0] : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands[sel]);
        else onSubmit(`/${target.name}`);
        return true;
      }
    }
    if (key.escape) {
      onEscape();
      return true;
    }
    return false;
  };
  return { items, selected: sel, onKey, submit: onSubmit };
}

// src/ui/screens/Chat.tsx
import { Fragment as Fragment3, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function directBanner(contact) {
  const name = contact.display;
  switch (contact.state) {
    case "incoming":
      return `${c.accent(icons.request)} ${c.bold(name)} wants to chat with you ${c.dim("\xB7 /accept to accept \xB7 /decline to decline")}`;
    case "outgoing":
      return `${c.dim(icons.pending)} ${c.dim(`Request sent \u2013 messages will be delivered once ${name} accepts`)}`;
    case "declined":
      return `${c.error(icons.error)} ${name} declined your request ${c.dim("\xB7 /request to ask again")}`;
    case "blocked":
      return `${c.error(icons.error)} Blocked ${c.dim("\xB7 /unblock to undo")}`;
    default:
      return null;
  }
}
function groupBanner(store, g) {
  switch (g.myStatus) {
    case "invited": {
      const by = g.invitedBy ? store.peerName(g.invitedBy) : "Someone";
      return `${c.accent(icons.request)} ${c.bold(by)} invited you to ${c.bold(`#${g.display}`)} ${c.dim("\xB7 /accept to join \xB7 /decline")}`;
    }
    case "left":
      return `${c.dim(icons.info)} ${c.dim("You left this group \xB7 /delete removes it from this device")}`;
    case "removed":
      return `${c.error(icons.error)} You were removed from this group ${c.dim("\xB7 /delete removes it from this device")}`;
    default:
      return null;
  }
}
function Header2({ chat, width }) {
  let left;
  let right = null;
  if (chat.kind === "group") {
    const members = chat.members.filter((m) => m.status === "member").length;
    left = /* @__PURE__ */ jsxs8(Fragment3, { children: [
      /* @__PURE__ */ jsx8(Text8, { color: theme.accent, bold: true, children: icons.group }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: chat.display }),
      /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
      /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: members === 1 ? "1 member" : `${members} members` }),
      chat.myStatus === "member" ? /* @__PURE__ */ jsxs8(Fragment3, { children: [
        /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsxs8(Text8, { color: chat.onlineCount ? theme.success : theme.dim, children: [
          chat.onlineCount,
          " online"
        ] }),
        /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
        /* @__PURE__ */ jsxs8(Text8, { color: chat.inactiveCount ? theme.warning : theme.dim, children: [
          chat.inactiveCount,
          " inactive"
        ] })
      ] }) : null
    ] });
  } else {
    const dot = presenceDot({ online: chat.online, away: chat.inactive, status: chat.status });
    left = /* @__PURE__ */ jsxs8(Fragment3, { children: [
      /* @__PURE__ */ jsxs8(Text8, { color: dot.color, children: [
        dot.icon,
        " "
      ] }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, color: chat.state === "accepted" ? personHex(chat.id, chat.color) : void 0, children: chat.display }),
      chat.alias ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " (",
        chat.name,
        ")"
      ] }) : null,
      /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
      chat.online && chat.status !== "available" ? /* @__PURE__ */ jsx8(Text8, { color: dot.color, children: statusText(chat.status, chat.statusMsg) }) : chat.inactive ? /* @__PURE__ */ jsx8(Text8, { color: theme.warning, children: "inactive" }) : chat.online ? /* @__PURE__ */ jsx8(Text8, { color: theme.success, children: "online" }) : /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: lastSeen(chat.lastSeen) }),
      chat.online && chat.status === "available" && chat.statusMsg ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " \xB7 ",
        chat.statusMsg
      ] }) : null
    ] });
    right = formatId(chat.id);
  }
  return /* @__PURE__ */ jsxs8(Box8, { paddingX: 1, width, children: [
    /* @__PURE__ */ jsx8(Box8, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs8(Text8, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: "\u2039 esc " }),
      left
    ] }) }),
    right && width >= 60 ? /* @__PURE__ */ jsx8(Box8, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: right }) }) : null
  ] });
}
function completeTag(next, input) {
  const closing = input === ">" ? autoCloseTag(next.value, next.cursor) : null;
  return closing ? { value: next.value.slice(0, next.cursor) + closing + next.value.slice(next.cursor), cursor: next.cursor } : next;
}
function Chat({ store, id, width, height, actions, dialog, editor, setEditor, history, pushHistory, version, onCycle }) {
  const chat = store.chat(id);
  const isGroup = chat?.kind === "group";
  const [offset, setOffset] = useState6(0);
  const prevTotal = useRef4(0);
  const send = async (raw) => {
    const value = raw.trim();
    if (!value) return;
    pushHistory(raw);
    setEditor({ value: "", cursor: 0 });
    if (value.startsWith("/") && !value.startsWith("//")) {
      await actions.runCommand(value, id);
      return;
    }
    const text = value.startsWith("//") ? value.slice(1) : raw;
    const res = isGroup ? store.sendGroupMessage(id, text) : store.sendMessage(id, text);
    if (!res.ok) {
      if (res.error) store.note(id, res.error, "error");
      setEditor({ value: raw, cursor: raw.length });
      return;
    }
    setOffset(0);
  };
  const cmd = useCommandInput({
    editor,
    setEditor,
    kind: isGroup ? "group" : "direct",
    tags: true,
    onSubmit: (v) => void send(v),
    onEscape: () => {
      if (editor.value.startsWith("/")) setEditor({ value: "", cursor: 0 });
      else actions.goHome();
    }
  });
  const listWidth = width - 2;
  const lines = useMemo(
    () => chat ? buildChatLines({
      items: store.items(id),
      notes: store.notesFor(id),
      width: listWidth,
      colorful: isGroup,
      cutoff: store.viewCutoff(id)
    }) : [],
    // version: any store change (new message, delivery status, …)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, listWidth]
  );
  useEffect6(() => {
    const delta = lines.length - prevTotal.current;
    if (offset > 0 && delta > 0) setOffset((o) => o + delta);
    prevTotal.current = lines.length;
  }, [lines.length]);
  if (!chat) {
    return /* @__PURE__ */ jsx8(Box8, { flexDirection: "column", height, paddingX: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: "This chat no longer exists. esc \u2192 back" }) });
  }
  const bannerText = chat.kind === "group" ? groupBanner(store, chat) : directBanner(chat);
  const bottom = dialog ? dialogHeight(dialog) : inputBoxHeight(editor, width) + menuHeight(cmd.items.length);
  const listHeight = Math.max(3, height - 2 - (bannerText ? 1 : 0) - bottom - 1);
  const maxOffset = Math.max(0, lines.length - listHeight);
  const scroll = (d) => setOffset((o) => Math.max(0, Math.min(maxOffset, o + d)));
  const onKey = (input, key) => {
    if (key.pageUp) {
      scroll(listHeight - 2);
      return true;
    }
    if (key.pageDown) {
      scroll(-(listHeight - 2));
      return true;
    }
    if ((key.upArrow || key.downArrow) && !key.meta && !cmd.items.length) {
      const dir = key.upArrow ? -1 : 1;
      if (!edit.vertical(editor, dir)) {
        scroll(-dir * 2);
        return true;
      }
    }
    if (key.ctrl && (input === "n" || input === "p")) {
      onCycle(input === "n" ? 1 : -1);
      return true;
    }
    return cmd.onKey(input, key);
  };
  const emptyHint = chat.kind === "group" ? chat.myStatus === "invited" ? "Accept the invite to see new messages." : "End-to-end encrypted \xB7 /members shows who is here \xB7 /invite adds people \xB7 /help for all commands" : "End-to-end encrypted \xB7 /whois shows the safety code \xB7 /help for all commands";
  const shownLines = lines.length ? lines : [c.dim("No messages yet."), c.faint(emptyHint)];
  const placeholder = chat.kind === "group" ? chat.myStatus === "invited" ? "/accept to join" : `Message #${chat.display} \u2026  (/ for commands)` : chat.state === "incoming" ? "/accept to accept" : `Message ${chat.display} \u2026  (/ for commands)`;
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx8(Header2, { chat, width }),
    /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: "\u2500".repeat(width) }),
    /* @__PURE__ */ jsx8(MessageList, { lines: shownLines, height: listHeight, offset: Math.min(offset, maxOffset), width, effects: store.effects }),
    bannerText ? /* @__PURE__ */ jsx8(Box8, { paddingX: 1, children: /* @__PURE__ */ jsx8(Text8, { wrap: "truncate-end", children: bannerText }) }) : null,
    dialog ? /* @__PURE__ */ jsx8(Dialog, { spec: dialog, width }) : /* @__PURE__ */ jsxs8(Fragment3, { children: [
      /* @__PURE__ */ jsx8(
        InputBox,
        {
          state: editor,
          onChange: setEditor,
          onSubmit: (v) => void send(v),
          onKey,
          isActive: !dialog,
          width,
          history,
          placeholder,
          borderColor: editor.value.startsWith("/") ? theme.accent : theme.border,
          afterType: completeTag
        }
      ),
      /* @__PURE__ */ jsx8(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }),
    /* @__PURE__ */ jsx8(
      Footer,
      {
        hints: ["enter send", "alt+enter new line", "esc back", "scroll wheel/trackpad", "drag select", "ctrl+n/p switch chat"],
        toast: store.toast?.chatId === id ? null : store.toast,
        width
      }
    )
  ] });
}

// src/ui/screens/ChatList.tsx
import { Box as Box10, Text as Text11, useInput as useInput4 } from "ink";
import { useRef as useRef5, useState as useState7 } from "react";

// src/ui/components/Banner.tsx
import { Box as Box9, Text as Text10 } from "ink";

// ../termcore/src/ui/components/Logo.tsx
import { Text as Text9 } from "ink";
import stringWidth5 from "string-width";
import { Fragment as Fragment4, jsx as jsx9 } from "react/jsx-runtime";
function Logo({ lines, animate = true, mode = "brief", color }) {
  const t = useShine(animate, mode);
  const width = Math.max(...lines.map((l) => stringWidth5(l)));
  return /* @__PURE__ */ jsx9(Fragment4, { children: lines.map((line, i) => /* @__PURE__ */ jsx9(Text9, { children: shineLine(line, i, width, color ?? theme.accent, t) }, i)) });
}

// src/ui/components/Banner.tsx
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551   \u2588\u2588\u2551   ",
  "   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551   \u2588\u2588\u2551   ",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551   \u2588\u2588\u2551   ",
  "   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D   \u255A\u2550\u255D   "
];
var LOGO_SMALL = ["\u2580\u2588\u2580 \u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584\u2580\u2588 \u2588\u2580\u2580 \u2588 \u2588 \u2584\u2580\u2588 \u2580\u2588\u2580", " \u2588  \u2588\u2588\u2584 \u2588\u2580\u2584 \u2588 \u2580 \u2588 \u2588\u2584\u2584 \u2588\u2580\u2588 \u2588\u2580\u2588  \u2588 "];
function bannerCompact(width, height) {
  return width < 80 || height < 22;
}
function bannerHeight(compact2) {
  return (compact2 ? LOGO_SMALL.length : LOGO.length) + 3;
}
function Banner({
  width,
  compact: compact2,
  animate = true,
  mode = "brief"
}) {
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    /* @__PURE__ */ jsx10(Logo, { lines: compact2 ? LOGO_SMALL : LOGO, animate, mode }),
    /* @__PURE__ */ jsx10(Text10, { children: " " }),
    /* @__PURE__ */ jsx10(Text10, { color: theme.faint, wrap: "truncate-end", children: "end-to-end encrypted chat for your local network" }),
    /* @__PURE__ */ jsx10(Text10, { children: " " })
  ] });
}

// src/ui/screens/ChatList.tsx
import { Fragment as Fragment5, jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
function previewOf(c2, store) {
  if (c2.kind === "group") {
    if (c2.myStatus === "invited") {
      const by = c2.invitedBy ? store.peerName(c2.invitedBy) : "Someone";
      return { text: `${by} invited you \xB7 ${c2.members.length} members`, dim: false };
    }
    if (c2.myStatus === "left") return { text: "You left this group", dim: true };
    if (c2.myStatus === "removed") return { text: "You were removed from this group", dim: true };
    if (!c2.last) return { text: "No messages yet", dim: true };
    return { text: `${c2.last.mine ? "You" : c2.last.sender}: ${plainPreview(c2.last.text)}`, dim: c2.unread === 0 };
  }
  switch (c2.state) {
    case "outgoing":
      return { text: "Request sent \u2013 waiting for them to accept", dim: true };
    case "declined":
      return { text: "declined your request", dim: true };
    case "blocked":
      return { text: "blocked", dim: true };
    case "incoming":
      return { text: "wants to chat with you", dim: false };
  }
  if (!c2.last) return { text: "No messages yet", dim: true };
  return { text: (c2.last.from === "me" ? "You: " : "") + plainPreview(c2.last.text), dim: c2.unread === 0 };
}
function ChatList({ store, width, height, actions, dialog, selectedKey, onSelect, history }) {
  const data = store.chatList();
  const chatEntry = (type) => (c2) => ({ type, key: `c:${c2.id}`, chat: c2 });
  const sections = {
    requests: data.requests.map(chatEntry("request")),
    unread: data.unread.map(chatEntry("chat")),
    chats: data.chats.map(chatEntry("chat")),
    groups: data.groups.map(chatEntry("chat")),
    nearby: data.nearby.map((p) => ({ type: "nearby", key: `n:${p.id}`, peer: p }))
  };
  const entries = Object.values(sections).flat();
  let selected = entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = entries[selected];
  const [commandMode, setCommandMode] = useState7(false);
  const commandRef = useRef5(false);
  const [editor, setEditor] = useState7(emptyEditor);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const cmd = useCommandInput({
    editor,
    setEditor,
    kind: null,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim(), null);
    },
    onEscape: closeCommand
  });
  const attempt = (fn) => {
    try {
      fn();
    } catch (err) {
      store.showToast(err.message, "error");
    }
  };
  const activate = (e) => {
    if (!e) return;
    if (e.type === "request") {
      const chat = e.chat;
      attempt(() => chat.kind === "group" ? store.groupAccept(chat.id) : store.accept(chat.id));
      actions.openChat(chat.id);
    } else if (e.type === "chat") {
      actions.openChat(e.chat.id);
    } else {
      try {
        store.requestNearby(e.peer.id);
        actions.openChat(e.peer.id);
      } catch (err) {
        store.showToast(err.message, "error");
      }
    }
  };
  useWheel((dir) => {
    if (!entries.length) return;
    onSelect(entries[Math.max(0, Math.min(entries.length - 1, selected + dir))].key);
  }, !dialog && !commandMode);
  useInput4(
    (input, key) => {
      if (commandRef.current) {
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      const move = (d) => {
        if (!entries.length) return;
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        onSelect(entries[next].key);
      };
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input.startsWith("/")) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === "?") return void actions.runCommand("/help", null);
      if (input === "q") return actions.quit();
      if (input === "a") {
        void actions.prompt("Add contact by IP", { hint: "e.g. 192.168.1.20 or 192.168.1.20:5050" }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`, null);
        });
        return;
      }
      if (input === "g") {
        void actions.prompt("New group", { hint: "Name of the group \u2013 you pick the members next" }).then((v) => {
          if (v) void actions.runCommand(`/group ${v}`, null);
        });
        return;
      }
      if (input === "x" && current?.type === "request") {
        const chat = current.chat;
        attempt(() => chat.kind === "group" ? store.groupDecline(chat.id) : store.decline(chat.id));
        return;
      }
      if (input === "r" && current && current.type !== "nearby") {
        const chat = current.chat;
        if (chat.kind === "group") {
          if (chat.myStatus !== "member") return;
          void actions.prompt(`Rename #${chat.display}`, { initial: chat.display }).then((v) => {
            if (v) attempt(() => store.groupRename(chat.id, v));
          });
          return;
        }
        void actions.prompt(`Nickname for ${chat.name}`, { hint: "Leave empty to use the person's own name", initial: chat.alias }).then((v) => {
          if (v !== null) store.rename(chat.id, v);
        });
        return;
      }
      if (input === "d" && current && current.type !== "nearby") {
        const chat = current.chat;
        if (chat.kind === "group") {
          const active = chat.myStatus === "member" || chat.myStatus === "invited";
          void actions.confirm(active ? `Leave #${chat.display}?` : `Delete #${chat.display} from this device?`).then((ok) => {
            if (!ok) return;
            attempt(
              () => active ? chat.myStatus === "invited" ? store.groupDecline(chat.id) : store.groupLeave(chat.id) : store.deleteGroup(chat.id)
            );
          });
          return;
        }
        void actions.confirm(`Remove ${chat.display} as a contact and delete the history?`).then((ok) => ok && store.removeContact(chat.id));
      }
    },
    { isActive: !dialog && !commandMode }
  );
  const inner = width - 2;
  const bottom = dialog ? dialogHeight(dialog) : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const compact2 = bannerCompact(width, height);
  const banner = height - bannerHeight(compact2) - 1 >= 8 ? bannerHeight(compact2) : 0;
  const bodyHeight = Math.max(3, height - banner - bottom - 1);
  const lines = [];
  const section = (title, list, showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: "gap" });
    lines.push({ kind: "section", title });
    for (const e of list) lines.push({ kind: "entry", entry: e, index: entries.indexOf(e) });
  };
  section(`Requests \xB7 ${data.requests.length}`, sections.requests);
  section(`Unread \xB7 ${data.unread.length}`, sections.unread);
  section("Chats", sections.chats);
  section("Groups", sections.groups);
  const scanning = store.me.scanning;
  section(scanning ? "Nearby \xB7 searching the network \u2026" : "Nearby", sections.nearby, scanning);
  const selLine = lines.findIndex((l) => l.kind === "entry" && l.index === selected);
  const start2 = Math.max(0, Math.min(selLine - Math.floor(bodyHeight / 2), lines.length - bodyHeight));
  const visible = lines.slice(start2, start2 + bodyHeight);
  const hints = (() => {
    if (!current) return ["a add by IP", "g new group", "/ commands", "? help", "q quit"];
    const base = ["\u2191\u2193 select"];
    if (current.type === "request") base.push("enter accept", "x decline");
    else if (current.type === "nearby") base.push("enter send request");
    else if (current.chat.kind === "group") {
      const active = current.chat.myStatus === "member";
      base.push("enter open", ...active ? ["r rename"] : [], active ? "d leave" : "d delete");
    } else base.push("enter open", "r rename", "d remove");
    return [...base, "g new group", "a add by IP", "/ commands", "q quit"];
  })();
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", width, height, children: [
    banner ? /* @__PURE__ */ jsx11(Banner, { width, compact: compact2, animate: store.isFocused && !dialog && !commandMode, mode: store.effects }) : null,
    /* @__PURE__ */ jsx11(Box10, { flexDirection: "column", height: bodyHeight, paddingX: 1, overflow: "hidden", children: entries.length === 0 ? /* @__PURE__ */ jsx11(EmptyState, { store }) : visible.map((l, i) => {
      if (l.kind === "gap") return /* @__PURE__ */ jsx11(Text11, { children: " " }, i);
      if (l.kind === "section") {
        return /* @__PURE__ */ jsx11(Text11, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, i);
      }
      return /* @__PURE__ */ jsx11(Row, { entry: l.entry, selected: l.index === selected, width: inner, store }, l.entry.key);
    }) }),
    dialog ? /* @__PURE__ */ jsx11(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs10(Fragment5, { children: [
      /* @__PURE__ */ jsx11(
        InputBox,
        {
          state: editor,
          onChange: setEditor,
          onSubmit: cmd.submit,
          onKey: cmd.onKey,
          isActive: true,
          width,
          history,
          borderColor: theme.accent,
          singleLine: true
        }
      ),
      /* @__PURE__ */ jsx11(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx11(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Row({ entry, selected, width, store }) {
  const pointer = /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: selected ? icons.pointer : " " }) });
  const nameWidth = Math.min(22, Math.max(10, Math.floor(width * 0.25)));
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs10(Box10, { children: [
      pointer,
      /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.success, children: icons.online }) }),
      /* @__PURE__ */ jsx11(Box10, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: p.name }) }),
      /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, wrap: "truncate-end", children: [
        "on your network \xB7 ",
        p.ip
      ] })
    ] });
  }
  const c2 = entry.chat;
  const isRequest = entry.type === "request";
  const isGroup = c2.kind === "group";
  const preview = previewOf(c2, store);
  const inactive = isGroup ? c2.myStatus !== "member" && c2.myStatus !== "invited" : c2.state !== "accepted";
  const dot = /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: isRequest ? /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: icons.request }) : isGroup ? /* @__PURE__ */ jsx11(Text11, { color: inactive ? theme.faint : theme.accent, bold: true, children: icons.group }) : /* @__PURE__ */ jsx11(Text11, { color: presenceDot({ online: c2.online, away: c2.inactive, status: c2.status }).color, children: presenceDot({ online: c2.online, away: c2.inactive, status: c2.status }).icon }) });
  const time = c2.last ? shortTime(c2.last.ts) : "";
  const status = c2.kind === "direct" && c2.state === "accepted" && c2.online ? statusText(c2.status, c2.statusMsg) : "";
  const nameColor = selected ? theme.accent : !isGroup && c2.state === "accepted" ? personHex(c2.id, c2.color) : void 0;
  return /* @__PURE__ */ jsxs10(Box10, { children: [
    pointer,
    dot,
    /* @__PURE__ */ jsx11(Box10, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { bold: selected || c2.unread > 0, color: nameColor, wrap: "truncate-end", children: c2.display }) }),
    /* @__PURE__ */ jsx11(Box10, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs10(Text11, { wrap: "truncate-end", children: [
      status ? /* @__PURE__ */ jsxs10(Fragment5, { children: [
        /* @__PURE__ */ jsx11(Text11, { color: presenceDot({ online: true, status: c2.kind === "direct" ? c2.status : void 0 }).color, children: status }),
        /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: " \xB7 " })
      ] }) : null,
      /* @__PURE__ */ jsx11(Text11, { color: preview.dim ? theme.dim : void 0, italic: inactive && !isRequest, children: preview.text })
    ] }) }),
    /* @__PURE__ */ jsx11(Box10, { width: 9, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: time }) }),
    /* @__PURE__ */ jsx11(Box10, { width: 5, flexShrink: 0, justifyContent: "flex-end", children: c2.unread > 0 ? /* @__PURE__ */ jsx11(Text11, { backgroundColor: theme.accent, color: theme.onAccent, bold: true, children: ` ${c2.unread > 99 ? "99+" : c2.unread} ` }) : null })
  ] });
}
function EmptyState({ store }) {
  const me = store.me;
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", paddingTop: 1, paddingX: 1, children: [
    /* @__PURE__ */ jsx11(Text11, { bold: true, children: "No chats yet" }),
    /* @__PURE__ */ jsx11(Text11, { children: " " }),
    /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "Other termchat users on the same network show up here automatically" }),
    /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: 'under "Nearby". Press enter to send them a chat request.' }),
    me.scanning ? /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "Searching the network \u2026" }) : null,
    /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, children: [
      "Once you have contacts, press ",
      /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "g" }),
      " to start a group chat."
    ] }),
    /* @__PURE__ */ jsx11(Text11, { children: " " }),
    /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, children: [
      "Someone not showing up? Press ",
      /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "a" }),
      " and enter their IP."
    ] }),
    /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, children: [
      "Your address for others:",
      " ",
      /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network" })
    ] })
  ] });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Box as Box11, Text as Text12, useInput as useInput5 } from "ink";
import { useState as useState8 } from "react";
import { Fragment as Fragment6, jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
function Onboarding({ logo, tagline, width, create, onDone, question = "What should your friends see you as?" }) {
  const [editor, setEditor] = useState8(emptyEditor);
  const [created, setCreated] = useState8(null);
  const [error, setError] = useState8(null);
  useInput5((_i, key) => key.return && onDone(), { isActive: created !== null });
  const submit = (value) => {
    const name = value.trim();
    if (!name) {
      setError("Please enter a name.");
      return;
    }
    try {
      setCreated({ name, id: create(name) });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const boxWidth = Math.min(64, width - 4);
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    logo.map((l, i) => /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: tagline }),
    /* @__PURE__ */ jsx12(Text12, { children: " " }),
    created ? /* @__PURE__ */ jsxs11(Fragment6, { children: [
      /* @__PURE__ */ jsxs11(Text12, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx12(Text12, { bold: true, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs11(Text12, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "you \u2013 even if your name or IP address changes. termchat, keyrace and termdrop" }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "share it, along with your friends. Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsxs11(Text12, { children: [
        "Press ",
        /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] }) : /* @__PURE__ */ jsxs11(Fragment6, { children: [
      /* @__PURE__ */ jsx12(Text12, { bold: true, children: question }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "You can change it later with /name." }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(
        InputBox,
        {
          state: editor,
          onChange: (s) => {
            setEditor(s);
            setError(null);
          },
          onSubmit: submit,
          isActive: true,
          singleLine: true,
          width: boxWidth,
          placeholder: "Your name",
          borderColor: theme.accent
        }
      ),
      error ? /* @__PURE__ */ jsx12(Text12, { color: theme.error, children: error }) : null
    ] })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function Root({
  paths,
  options,
  notice
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState9(() => AppStore.hasProfile(paths) ? { name: "starting" } : { name: "onboarding" });
  const storeRef = useRef6(null);
  const quitting = useRef6(false);
  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);
  useInput6((input, key) => {
    if (key.ctrl && input === "c") quit();
  });
  useEffect7(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (notice) store.showToast(notice, "success");
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: "ready", store });
      } catch (err) {
        setPhase({ name: "error", message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);
  const height = Math.max(10, rows - 1);
  if (phase.name === "onboarding") {
    return /* @__PURE__ */ jsx13(
      Onboarding,
      {
        logo: LOGO_SMALL,
        tagline: "end-to-end encrypted chat for your local network",
        question: "What should others see you as?",
        width: columns,
        create: (name) => AppStore.createProfile(paths, name),
        onDone: () => setPhase({ name: "starting" })
      }
    );
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx13(Box12, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "Starting termchat \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs12(Box12, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { color: theme.error, bold: true, children: "termchat could not start" }),
      /* @__PURE__ */ jsx13(Text13, { children: phase.message }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx13(Main, { store: phase.store, width: columns, height, quit });
}
function Main({ store, width, height, quit }) {
  const version = useStoreVersion(store);
  const [chatId, setChatId] = useState9(null);
  const [dialog, setDialog] = useState9(null);
  const [panel, setPanel] = useState9(null);
  const [selectedKey, setSelectedKey] = useState9(null);
  const [drafts, setDrafts] = useState9(/* @__PURE__ */ new Map());
  const [history, setHistory] = useState9([]);
  useEffect7(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);
  useEffect7(() => {
    mouse.on("focus", (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners("focus");
  }, [store]);
  const openChat = useCallback(
    (id) => {
      store.setActiveChat(id);
      setChatId(id);
      setSelectedKey(`c:${id}`);
    },
    [store]
  );
  const goHome = useCallback(() => {
    store.setActiveChat(null);
    setChatId(null);
  }, [store]);
  const actions = useMemo2(() => {
    const a = {
      openChat,
      goHome,
      quit,
      confirm: (title) => new Promise(
        (resolve) => setDialog({
          kind: "confirm",
          title,
          resolve: (ok) => {
            setDialog(null);
            resolve(ok);
          }
        })
      ),
      prompt: (title, opts) => new Promise(
        (resolve) => setDialog({
          kind: "prompt",
          title,
          hint: opts?.hint,
          initial: opts?.initial,
          resolve: (v) => {
            setDialog(null);
            resolve(v);
          }
        })
      ),
      pick: (title, options, multi) => new Promise(
        (resolve) => setDialog({
          kind: "pick",
          title,
          options,
          multi,
          resolve: (ids) => {
            setDialog(null);
            resolve(ids);
          }
        })
      ),
      print: (id, text, kind = "info") => {
        if (id) store.note(id, text, kind);
        else if (text.includes("\n")) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ""), kind);
      },
      runCommand: async (input, id) => {
        await registry.execute(input, {
          store,
          chatId: id,
          ui: {
            print: (text, kind) => a.print(id, text, kind),
            openChat: a.openChat,
            goHome: a.goHome,
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick
          }
        });
      }
    };
    return a;
  }, [store, openChat, goHome, quit]);
  const cycle = (dir) => {
    const data = store.chatList();
    const ids = [...data.requests, ...data.unread, ...data.chats, ...data.groups].map((c2) => c2.id);
    if (!ids.length || !chatId) return;
    const i = ids.indexOf(chatId);
    openChat(ids[(i + dir + ids.length) % ids.length]);
  };
  const pushHistory = (entry) => setHistory((h) => h[h.length - 1] === entry ? h : [...h.slice(-99), entry]);
  const bodyHeight = height - 2;
  let body;
  if (chatId) {
    body = /* @__PURE__ */ jsx13(
      Chat,
      {
        store,
        id: chatId,
        width,
        height: bodyHeight,
        actions,
        dialog,
        editor: drafts.get(chatId) ?? emptyEditor,
        setEditor: (s) => setDrafts((d) => new Map(d).set(chatId, s)),
        history,
        pushHistory,
        version,
        onCycle: cycle
      },
      chatId
    );
  } else if (panel) {
    body = /* @__PURE__ */ jsx13(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null), render: (t, w) => renderMarkdown(t, w).map(stripMarkers) });
  } else {
    body = /* @__PURE__ */ jsx13(
      ChatList,
      {
        store,
        width,
        height: bodyHeight,
        actions,
        dialog,
        selectedKey,
        onSelect: setSelectedKey,
        history
      }
    );
  }
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx13(
      Header,
      {
        app: "termchat",
        version: VERSION,
        width,
        me: store.me,
        address: store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : "no network",
        online: store.onlineCount(),
        onlineLabel: () => "connected",
        updateAvailable: store.updateAvailable
      }
    ),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx14 } from "react/jsx-runtime";
var HELP = `termchat \u2013 end-to-end encrypted chat for your local network

Usage: termchat [options]
       termchat update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.termhub shared by all apps plus
                    ~/.termchat; with --home: <dir> and <dir>/termchat; or $TERMHUB_HOME)
  --port <port>     TCP port (default: 5050, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/termchat.log
  -h, --help        Show this help
  -v, --version     Show the version
`;
var ALT_SCREEN_ON = "\x1B[?1049h\x1B[H";
var ALT_SCREEN_OFF = "\x1B[?1049l";
var SHOW_CURSOR = "\x1B[?25h";
async function update() {
  if (installKind() === "source") {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, "")}
`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json \u2192 repository).\n");
    return 1;
  }
  process.stdout.write("Checking for updates \u2026\n");
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`termchat ${VERSION} is up to date.
`);
    return 0;
  }
  process.stdout.write(latest ? `Updating termchat ${VERSION} \u2192 ${latest} \u2026
` : `Couldn't check the latest version \u2013 installing anyway \u2026
`);
  const res = await runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      process.stderr.write(`
${staleInstallHint(installed).replace(/`/g, "")}
`);
      return 1;
    }
    process.stdout.write(`
Done${installed ? ` \u2013 termchat ${installed} is installed` : ""}. Start it with: termchat
`);
    return 0;
  }
  process.stderr.write(`
Update failed. ${installHint(res.output) ?? "See the npm output above."}
`);
  return 1;
}
async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: "string" },
        port: { type: "string" },
        "no-discovery": { type: "boolean" },
        debug: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      },
      strict: true
    }));
  } catch (err) {
    process.stderr.write(`${err.message}

${HELP}`);
    process.exit(2);
  }
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`termchat ${VERSION}
`);
    return;
  }
  if (positionals[0] === "update" && positionals.length === 1) {
    void update().then((code) => process.exit(code));
    return;
  }
  if (positionals.length) {
    process.stderr.write(`Unknown command: ${positionals.join(" ")}

${HELP}`);
    process.exit(2);
  }
  let port;
  if (values.port !== void 0) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}
`);
      process.exit(2);
    }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("termchat needs an interactive terminal.\n");
    process.exit(1);
  }
  const paths = resolvePaths(values.home);
  let lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!("release" in got)) {
      process.stdout.write("termchat is already open in another window.\n");
      process.exit(0);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start termchat: ${err.message}
`);
    process.exit(1);
  }
  let notice;
  try {
    const report = Hub.prepare(paths.hub);
    if (report.migrated) notice = migrationNotice(report.friends);
  } catch (err) {
    lock.release();
    process.stderr.write(`Couldn't read your profile in ${paths.hub.dir}: ${err.message}
`);
    process.exit(1);
  }
  try {
    await startInstanceServer(paths.socket);
  } catch {
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== "win32") fs13.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on("exit", restore);
  const crash = (err) => {
    restore();
    process.stderr.write(`
termchat crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  for (const sig of ["SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));
  const app = render(
    /* @__PURE__ */ jsx14(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug }, notice }),
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) }
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
      const child = spawn3(process.execPath, process.argv.slice(1), { stdio: "inherit" });
      child.on("exit", (code) => process.exit(code ?? 0));
      child.on("error", () => process.exit(0));
    },
    crash
  );
}
async function start() {
  const local = installKind() === "npm" ? newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start termchat ${local.version} (${err.message}) \u2013 starting ${VERSION} instead.
`);
    }
  }
  await main();
}
void start();
