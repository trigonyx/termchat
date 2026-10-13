#!/usr/bin/env node

// src/cli.tsx
import { render } from "ink";
import { spawn as spawn3 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import os from "os";
import path from "path";
function resolvePaths(home) {
  const root = path.resolve(home ?? process.env.TERMCHAT_HOME ?? path.join(os.homedir(), ".termchat"));
  return {
    home: root,
    identity: path.join(root, "identity.json"),
    config: path.join(root, "config.json"),
    contacts: path.join(root, "contacts.json"),
    historyDir: path.join(root, "history"),
    groupsDir: path.join(root, "groups"),
    groupsMeta: path.join(root, "groups.json"),
    peers: path.join(root, "peers.json"),
    log: path.join(root, "termchat.log")
  };
}

// src/core/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os2 from "os";
import path2 from "path";

// package.json
var package_default = {
  name: "termchat",
  version: "1.3.1",
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
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/core/version.ts
var VERSION = package_default.version;
var REPO = /github\.com[/:]([^/]+\/[^/.]+)/.exec(package_default.repository.url)?.[1] ?? "OWNER/termchat";
var REPO_CONFIGURED = !REPO.startsWith("OWNER/");
var INSTALL_SPEC = `https://github.com/${REPO}/tarball/main`;
var INSTALL_CMD = `npm i -g ${INSTALL_SPEC}`;

// src/core/update.ts
var VERSION_RE = /^\d+\.\d+\.\d+$/;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var latestUrl = () => process.env.TERMCHAT_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/main/package.json`;
async function fetchLatestVersion(fetchImpl = fetch, timeoutMs = 5e3) {
  if (!REPO_CONFIGURED && !process.env.TERMCHAT_UPDATE_URL) return null;
  try {
    const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const version = (await res.json())?.version;
    return typeof version === "string" && VERSION_RE.test(version) ? version : null;
  } catch {
    return null;
  }
}
async function checkForUpdate(fetchImpl) {
  if (process.env.TERMCHAT_NO_UPDATE_CHECK === "1") return null;
  const latest = await fetchLatestVersion(fetchImpl);
  return latest && compareVersions(latest, VERSION) > 0 ? latest : null;
}
function installKind(script = process.argv[1] ?? "") {
  let real = script;
  try {
    real = fs.realpathSync(script);
  } catch {
  }
  return real.split(path2.sep).join("/").includes("/node_modules/termchat/") ? "npm" : "source";
}
var SOURCE_HINT = `This termchat runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD}\`.`;
var releaseSpec = (version) => `https://github.com/${REPO}/tarball/v${version}`;
var appDir = () => process.env.TERMCHAT_APP_DIR || path2.join(os2.homedir(), ".termchat", "app");
var installSpec = (version) => process.env.TERMCHAT_INSTALL_SPEC || (version ? releaseSpec(version) : INSTALL_SPEC);
var isRoot = () => process.getuid?.() === 0;
function localInstall(dir = appDir()) {
  const root = path2.join(dir, "node_modules", "termchat");
  try {
    const pkg = JSON.parse(fs.readFileSync(path2.join(root, "package.json"), "utf8"));
    const cli = path2.join(root, "dist", "cli.js");
    if (pkg?.name !== "termchat" || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
    return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
  } catch {
    return null;
  }
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path2.resolve(p);
  }
};
function newerLocalInstall(self, ownVersion = VERSION) {
  const local = localInstall();
  if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
  return realpath(local.cli) === realpath(self) ? null : local;
}
function installedInto(script) {
  let dir = path2.dirname(realpath(script));
  while (path2.dirname(dir) !== dir) {
    if (path2.basename(dir) === "termchat" && path2.basename(path2.dirname(dir)) === "node_modules") return path2.dirname(dir);
    dir = path2.dirname(dir);
  }
  return null;
}
function installTarget(script = process.argv[1] ?? "", root = isRoot()) {
  const modules = installedInto(script);
  if (!modules) return "global";
  if (realpath(modules).startsWith(realpath(appDir()) + path2.sep)) return "local";
  if (root) return "global";
  try {
    fs.accessSync(modules, fs.constants.W_OK);
    return "global";
  } catch {
    return "local";
  }
}
function npmInstall(spec, inherit, target) {
  const dir = appDir();
  const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
    // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
    ["install", "--prefix", dir, "--cache", path2.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
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
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
async function runInstall({ inherit, version }) {
  if (!REPO_CONFIGURED && !process.env.TERMCHAT_INSTALL_SPEC) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
  const attempt = async (target2) => {
    if (version && !process.env.TERMCHAT_INSTALL_SPEC) {
      const res2 = await npmInstall(installSpec(version), inherit, target2);
      if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
    }
    return npmInstall(installSpec(), inherit, target2);
  };
  const target = installTarget();
  const res = await attempt(target);
  if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) return attempt("local");
  return res;
}
function installedVersion(script = process.argv[1] ?? "") {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, "--version"], { timeout: 15e3 }, (err, stdout) => {
      const version = /termchat (\d+\.\d+\.\d+)/.exec(String(stdout))?.[1];
      resolve(err || !version ? null : version);
    });
  });
}
var staleInstallHint = (installed) => `npm finished, but termchat ${installed} is still the version that starts. Try \`termchat update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
function installHint(output) {
  if (PERMISSION_RE.test(output)) {
    return `npm isn't allowed to write to ${appDir()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.termchat\`, then run /update again.`;
  }
  return null;
}
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;

// src/ui/App.tsx
import { Box as Box11, Text as Text11, useApp, useInput as useInput6 } from "ink";
import { useCallback, useEffect as useEffect6, useMemo as useMemo2, useRef as useRef6, useState as useState8 } from "react";

// src/commands/builtin.ts
import net2 from "net";

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
import fs2 from "fs";
import path3 from "path";
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
  const target = path3.resolve(file || `termchat-${safeName}-${stamp(Date.now()).slice(0, 10)}.md`);
  const lines = [`# ${title}`, "", `_Exported on ${stamp(Date.now())}_`, ""];
  for (const item of store.items(chatId)) {
    if (item.kind === "note") {
      lines.push(`_${item.text}_ \xB7 ${stamp(item.ts)}`, "");
      continue;
    }
    const who = item.mine ? store.me.name : item.senderName;
    lines.push(`**${who}** \xB7 ${stamp(item.ts)}`, "", item.text, "", "---", "");
  }
  fs2.writeFileSync(target, lines.join("\n"), "utf8");
  return target;
}

// src/core/identity.ts
import crypto from "crypto";

// src/core/storage.ts
import fs3 from "fs";
import path4 from "path";
function readJson(file, fallback) {
  let raw;
  try {
    raw = fs3.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    fs3.renameSync(file, `${file}.corrupt-${Date.now()}`);
    return fallback;
  }
}
function writeJsonAtomic(file, data) {
  ensureDir(path4.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs3.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs3.renameSync(tmp, file);
}
function appendJsonl(file, entry) {
  ensureDir(path4.dirname(file));
  fs3.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 384 });
}
function readJsonl(file) {
  let raw;
  try {
    raw = fs3.readFileSync(file, "utf8");
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
  fs3.mkdirSync(dir, { recursive: true, mode: 448 });
}

// src/core/identity.ts
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
  return base32(crypto.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function fromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function loadOrCreateIdentity(paths) {
  const existing = readJson(paths.identity, null);
  if (existing?.v === 1 && existing.publicKey && existing.privateKey) return fromFile(existing);
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const file = { v: 1, publicKey: jwk.x, privateKey: jwk.d };
  writeJsonAtomic(paths.identity, file);
  return fromFile(file);
}
function loadConfig(paths) {
  const cfg = readJson(paths.config, null);
  return cfg && typeof cfg.name === "string" && cfg.name ? cfg : null;
}
function saveConfig(paths, cfg) {
  writeJsonAtomic(paths.config, cfg);
}

// src/core/network.ts
import net from "net";
import { EventEmitter as EventEmitter3 } from "events";

// src/core/framing.ts
import { EventEmitter } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload2) {
  if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload2.length, 0);
  return Buffer.concat([header, payload2]);
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
var FrameSocket = class extends EventEmitter {
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
  send(payload2) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload2));
    return true;
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

// src/core/handshake.ts
import crypto3 from "crypto";

// src/core/channel.ts
import crypto2 from "crypto";
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
    const cipher = crypto2.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN) throw new Error("Frame too short");
    const decipher = crypto2.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
};

// src/core/sanitize.ts
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

// src/core/handshake.ts
var PROTOCOL = "termchat/1";
var HANDSHAKE_TIMEOUT = 5e3;
var HandshakeError = class extends Error {
};
function parseHello(frame) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== PROTOCOL || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError("Not a termchat peer or incompatible version");
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(role, transcript) {
  return Buffer.concat([Buffer.from(`${PROTOCOL} auth ${role}`), transcript]);
}
async function performHandshake(fs7, me, myName, initiator, timeoutMs = HANDSHAKE_TIMEOUT) {
  const { privateKey: ephPriv, publicKey: ephPub } = crypto3.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto3.randomBytes(16);
  fs7.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: PROTOCOL, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs7.read(timeoutMs));
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto3.createHash("sha256").update(PROTOCOL).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto3.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto3.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto3.hkdfSync("sha256", shared, transcript, `${PROTOCOL} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto3.sign(null, authPayload(myRole, transcript), me.privateKey);
  fs7.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({ pub: me.publicRaw.toString("base64url"), name: myName, sig: sig.toString("base64url") })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs7.read(timeoutMs)).toString("utf8"));
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
    valid = crypto3.verify(
      null,
      authPayload(peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv };
}

// src/core/peer.ts
import { EventEmitter as EventEmitter2 } from "events";

// src/core/groupEvents.ts
import crypto4 from "crypto";
var MAX_MEMBERS = 32;
var EVENT_ID_RE = /^[A-Za-z0-9_-]{32}$/;
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
var B64URL_RE = /^[A-Za-z0-9_-]+$/;
var MAX_SEQ = 2 ** 40;
var KINDS = ["create", "invite", "join", "decline", "leave", "kick", "rename", "msg"];
function payload(e) {
  const data = Object.keys(e.data).sort().map((k) => [k, e.data[k]]);
  const gid = e.kind === "create" ? "" : e.gid;
  return Buffer.from(JSON.stringify(["termchat/group/1", gid, e.author, e.authorPub, e.seq, e.ts, e.kind, data]));
}
function eventId(p) {
  return crypto4.createHash("sha256").update(p).digest("base64url").slice(0, 32);
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
  const p = payload(unsigned);
  const id = eventId(p);
  const sig = crypto4.sign(null, p, me.privateKey).toString("base64url");
  return { ...unsigned, gid: fields.kind === "create" ? id : fields.gid, id, sig };
}
var str = (v, max) => typeof v === "string" && v.length <= max;
function parseEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  if (o.v !== 1 || !KINDS.includes(o.kind)) return null;
  if (!str(o.gid, 32) || !EVENT_ID_RE.test(o.gid) || !str(o.id, 32) || !EVENT_ID_RE.test(o.id)) return null;
  if (!str(o.author, 20) || !PEER_ID_RE.test(o.author)) return null;
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
  const p = payload(e);
  if (eventId(p) !== e.id) return false;
  if (e.kind === "create" ? e.gid !== e.id : e.gid === e.id) return false;
  try {
    return crypto4.verify(null, p, publicKeyFromRaw(pub), Buffer.from(e.sig, "base64url"));
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
var REL_STATES = ["accepted", "outgoing", "none"];
var MAX_SYNC_IDS = 1200;
function parseWire(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0
      };
    }
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
      const by = typeof o.by === "string" && /^[A-Z2-7]{20}$/.test(o.by) ? o.by : void 0;
      return { t: "gack", gid: o.gid, ids, ...by ? { by } : {} };
    }
    case "presence":
      return typeof o.away === "boolean" ? { t: "presence", away: o.away } : null;
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return null;
  }
}
function encodeWire(msg) {
  return Buffer.from(JSON.stringify(msg), "utf8");
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

// src/core/peer.ts
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter2 {
  constructor(fs7, hs, initiator, tag) {
    super();
    this.fs = fs7;
    this.hs = hs;
    this.initiator = initiator;
    this.tag = tag;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs7.on("frame", (frame) => this.onFrame(frame));
    fs7.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
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
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(encodeWire(msg)));
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
    const msg = parseWire(plain);
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

// src/core/network.ts
var DEFAULT_PORT = 5050;
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter3 {
  constructor(me, getName) {
    super();
    this.me = me;
    this.getName = getName;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort = DEFAULT_PORT) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onIncoming(socket));
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
    this.server.on("error", (err) => this.emit("log", `Server-Fehler: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately.
   */
  async dial(host, port, expectedId, tag) {
    const socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
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
    const fs7 = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs7, this.me, this.getName(), true);
      if (expectedId && hs.peerId !== expectedId) {
        throw new HandshakeError("Someone else is now reachable at this address");
      }
      return this.register(new Session(fs7, hs, true, tag));
    } catch (err) {
      fs7.destroy();
      throw err;
    }
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs7 = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs7, this.me, this.getName(), false);
      this.register(new Session(fs7, hs, false));
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs7.remoteAddress}: ${err.message}`);
      fs7.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = this.me.id < session.peerId ? this.me.id : session.peerId;
      const initiatorOf = (s) => s.initiator ? this.me.id : s.peerId;
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

// src/ui/effects.ts
import chalk2 from "chalk";
import stringWidth from "string-width";

// src/ui/theme.ts
import chalk from "chalk";
var theme = {
  accent: "#D97757",
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8"
};
var c = {
  accent: chalk.hex(theme.accent),
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
  request: "\u25C6",
  pending: "\u25F7",
  delivered: "\u2713",
  read: "\u2713\u2713",
  error: "\u2717",
  info: "\xB7",
  group: "#"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function senderColor(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return chalk.hex(SENDER_COLORS[h % SENDER_COLORS.length]);
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
  grey: "9a9a9a",
  accent: theme.accent.slice(1)
};
function parseColor(input) {
  const v = (input ?? "").trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (m) return m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1];
  return NAMED.accent;
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
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var RAINBOW_PERIOD = 30;
var RAINBOW_SPEED = 9;
var SHINE_CYCLE = 3600;
var SHINE_SWEEP = 800;
var SHINE_HALF = 3;
function rainbowColor(col, now) {
  const phase = ((col + RAINBOW_SPEED * now / 1e3) % RAINBOW_PERIOD + RAINBOW_PERIOD) % RAINBOW_PERIOD;
  const dist = Math.min(phase, RAINBOW_PERIOD - phase);
  const white = Math.max(0, 1 - dist / 2.5) * 0.75;
  return mix(hslToRgb(phase / RAINBOW_PERIOD * 360, 0.85, 0.64), WHITE, white);
}
function shineColor(base, col, width, now) {
  const u = now % SHINE_CYCLE / SHINE_SWEEP;
  if (u >= 1) return base;
  const center = (width + 2 * SHINE_HALF) * (1 - u) - SHINE_HALF;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
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
          const [r, g, b] = top.span.kind === "rainbow" ? rainbowColor(col, now) : shineColor(top.span.base, top.col, top.span.width, now);
          out += chalk2.rgb(Math.round(r), Math.round(g), Math.round(b))(segment);
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
var EFFECTS_MODES = ["nonstop", "brief", "off"];
var ANIM_MS = 8e3;
function effectTime(mode, now, since) {
  if (mode === "off") return ANIM_MS;
  const t = Math.max(0, now - since);
  return mode === "brief" ? Math.min(t, ANIM_MS) : t;
}

// src/ui/markdown.ts
import chalk3 from "chalk";
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
        out += chalk3.bold(inline(t.tokens));
        break;
      case "em":
        out += chalk3.italic(inline(t.tokens));
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
  if (t.depth === 1) return chalk3.bold.underline.hex(theme.accent)(text);
  if (t.depth === 2) return chalk3.bold.hex(theme.accent)(text);
  if (t.depth === 3) return chalk3.bold(text);
  return chalk3.bold.hex(theme.dim)(text);
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
  const head = t.header.map((h) => chalk3.bold(inline(h.tokens)));
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

// src/core/store.ts
import crypto5 from "crypto";
import fs6 from "fs";

// src/core/contacts.ts
function displayName(c2) {
  return c2.alias || c2.name;
}
var ContactBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.contacts, []);
    for (const c2 of Array.isArray(list) ? list : []) {
      if (c2 && typeof c2.id === "string") this.contacts.set(c2.id, { ...c2, unread: c2.unread ?? 0 });
    }
  }
  contacts = /* @__PURE__ */ new Map();
  get(id) {
    return this.contacts.get(id);
  }
  all() {
    return [...this.contacts.values()];
  }
  upsert(id, patch) {
    const prev = this.contacts.get(id);
    if (!prev && (patch.publicKey === void 0 || !patch.name || !patch.state)) return void 0;
    const now = Date.now();
    const base = prev ?? { unread: 0, lastActivity: now, createdAt: now };
    const next = { ...base, ...patch, id };
    this.contacts.set(id, next);
    this.save();
    return next;
  }
  remove(id) {
    if (this.contacts.delete(id)) this.save();
  }
  save() {
    writeJsonAtomic(this.paths.contacts, this.all());
  }
};

// src/core/discovery.ts
import dgram from "dgram";
import os3 from "os";
import { EventEmitter as EventEmitter4 } from "events";
var DISCOVERY_PORT = 5051;
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var ID_RE2 = /^[A-Z2-7]{20}$/;
var IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os3.networkInterfaces())) {
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
    const net3 = (ip & mask) >>> 0;
    const broadcast = (net3 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net3, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net3, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net3; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net3) yield toIp(ip - d);
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
      send(buf, address) {
        try {
          socket.send(buf, port, address, () => {
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
var Discovery = class extends EventEmitter4 {
  constructor(myId, getName, getPort, opts = {}) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
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
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.opts.udpPort ?? DISCOVERY_PORT);
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
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      this.sendTo(this.opts.wants?.(p.id) ? { ...msg, c: 1 } : msg, p.ip);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.peers.get(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip);
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
    const msg = { app: "termchat", v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    return msg;
  }
  sendTo(msg, address) {
    this.transport?.send(Buffer.from(JSON.stringify(msg)), address);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether termchat runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.sendTo(this.message(true), ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
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
    const msg = this.message(true);
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
      this.sendTo(msg, next.value);
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
    if (!msg || msg.app !== "termchat" || msg.v !== 1 || typeof msg.id !== "string" || !ID_RE2.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const prev = this.peers.get(msg.id);
    const peer = { id: msg.id, name: cleanName(msg.name), ip: address, port, lastSeen: Date.now() };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name) this.emit("change");
    if (msg.q) this.sendTo(this.message(false), address);
    if (msg.c === 1) this.emit("callback", msg.id);
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === "string" && IPV4_RE.test(ip) && nearby(ip)) this.probe(ip);
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

// src/core/history.ts
import fs4 from "fs";
import path5 from "path";
var HistoryStore = class {
  constructor(paths) {
    this.paths = paths;
  }
  cache = /* @__PURE__ */ new Map();
  file(peerId) {
    return path5.join(this.paths.historyDir, `${peerId}.jsonl`);
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
  delete(peerId) {
    fs4.rmSync(this.file(peerId), { force: true });
    this.cache.set(peerId, []);
  }
};

// src/core/groups.ts
import fs5 from "fs";
import path6 from "path";
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
    return path6.join(this.paths.groupsDir, `${gid}.jsonl`);
  }
  load() {
    let files = [];
    try {
      files = fs5.readdirSync(this.paths.groupsDir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return;
    }
    for (const f of files) {
      const gid = f.slice(0, -".jsonl".length);
      const events = /* @__PURE__ */ new Map();
      const has = /* @__PURE__ */ new Map();
      for (const line of readJsonl(path6.join(this.paths.groupsDir, f))) {
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
    fs5.rmSync(this.file(gid), { force: true });
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

// src/core/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body) {
  if (process.platform !== "darwin") return;
  try {
    execFile2("osascript", ["-e", MAC_SCRIPT, title, body], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// src/core/peers.ts
var PeerBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.peers, []);
    for (const p of Array.isArray(list) ? list : []) {
      if (p && typeof p.id === "string") this.peers.set(p.id, p);
    }
  }
  peers = /* @__PURE__ */ new Map();
  get(id) {
    return this.peers.get(id);
  }
  update(id, patch) {
    const prev = this.peers.get(id) ?? { id, name: patch.name ?? "Unknown" };
    const next = { ...prev, ...patch, id };
    if (JSON.stringify(prev) === JSON.stringify(next) && this.peers.has(id)) return;
    this.peers.set(id, next);
    writeJsonAtomic(this.paths.peers, [...this.peers.values()]);
  }
};

// src/core/store.ts
var GROUP_PREFIX = "g-";
var isGroupChat = (chatId) => chatId.startsWith(GROUP_PREFIX);
var groupChatId = (gid) => GROUP_PREFIX + gid;
var gidOf = (chatId) => chatId.slice(GROUP_PREFIX.length);
var md = (s) => s.replace(/[\\`*_~#>\[\]|]/g, (ch) => `\\${ch}`);
var TOAST_MS = 4e3;
var MAX_BACKOFF = 3e4;
var MAX_BACKOFF_NEARBY = 5e3;
var CALLBACK_TTL = 15e3;
var MAX_CALLBACKS_PER_MINUTE = 10;
var UNKNOWN_PEER_TIMEOUT = 15e3;
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    const cfg = loadConfig(opts.paths);
    if (!cfg) throw new Error("No profile found");
    this.name = cfg.name;
    this.effects = cfg.effects ?? "brief";
    this.preferredPort = opts.port ?? cfg.port ?? DEFAULT_PORT;
    this.identity = loadOrCreateIdentity(opts.paths);
    this.contacts = new ContactBook(opts.paths);
    this.history = new HistoryStore(opts.paths);
    this.network = new Network(this.identity, () => this.name);
    this.peerBook = new PeerBook(opts.paths);
    this.groups = new GroupManager(opts.paths, this.identity, {
      send: (id, msg) => this.network.get(id)?.send(msg) ?? false,
      connectedPeers: () => [...this.network.sessions.keys()],
      isAcceptedContact: (id) => this.contacts.get(id)?.state === "accepted",
      changed: () => this.changed(),
      onMessage: (gid, ev, state) => this.onGroupMessage(gid, ev, state),
      onInvited: (gid, state, by) => this.showToast(`${this.peerName(by, state)} invited you to #${state.name}`, "info", groupChatId(gid))
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
  }
  identity;
  contacts;
  history;
  network;
  groups;
  peerBook;
  discovery = null;
  name;
  preferredPort;
  notes = /* @__PURE__ */ new Map();
  viewCutoffs = /* @__PURE__ */ new Map();
  dialStates = /* @__PURE__ */ new Map();
  /** Peers that asked us to connect to them (id → when). */
  callbacks = /* @__PURE__ */ new Map();
  callbackTimes = [];
  /** Contacts we already told that they can't be reached. */
  reachWarned = /* @__PURE__ */ new Set();
  dialTimer = null;
  toastTimer = null;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  activeChat = null;
  focused = true;
  /** /effects – cached, the UI reads it on every animation frame */
  effects;
  /** Peers that reported their terminal is in the background. */
  away = /* @__PURE__ */ new Set();
  version = 0;
  toast = null;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** Creates the profile and keys on first launch. */
  static createProfile(paths, name) {
    loadOrCreateIdentity(paths);
    saveConfig(paths, { name: cleanName(name) });
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.network.start(this.preferredPort);
    if (this.opts.discovery !== false) {
      this.discovery = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...this.opts.discoveryOptions,
        udpPort: this.opts.discoveryPort,
        hints: () => this.lastKnownIps(),
        wants: (id) => this.wantsConnection(id)
      });
      this.discovery.on("change", () => {
        for (const p of this.discovery?.peers.values() ?? []) {
          const c2 = this.contacts.get(p.id);
          if (c2 && (c2.lastIp !== p.ip || c2.lastPort !== p.port)) this.contacts.upsert(p.id, { lastIp: p.ip, lastPort: p.port });
          if (this.peerBook.get(p.id)) this.peerBook.update(p.id, { lastIp: p.ip, lastPort: p.port });
          const ds = this.dialStates.get(p.id);
          if (ds && !ds.inFlight) ds.next = 0;
        }
        this.changed();
      });
      this.discovery.on("log", (l) => this.log(l));
      this.discovery.on("callback", (id) => this.onCallback(id));
      this.discovery.start();
    }
    this.dialTimer = setInterval(() => this.dialLoop(), this.opts.dialIntervalMs ?? 1500);
    this.dialTimer.unref();
    this.dialLoop();
    this.changed();
  }
  async stop() {
    if (this.dialTimer) clearInterval(this.dialTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.discovery?.stop();
    await this.network.stop();
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
  // ───────────── Queries ─────────────
  get me() {
    return {
      id: this.identity.id,
      name: this.name,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discovery !== null,
      scanning: this.discovery?.scanning ?? false
    };
  }
  isOnline(id) {
    return this.network.isOnline(id);
  }
  contact(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    return { ...c2, kind: "direct", display: displayName(c2), online: this.isOnline(id), inactive: this.isOnline(id) && this.away.has(id), last: this.history.last(id) };
  }
  /** Best name for any peer: own nickname/contact name, else what the group says. */
  peerName(id, state) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return state?.names.get(id) ?? this.peerBook.get(id)?.name ?? "Unknown";
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
        inactive: m.id === this.identity.id ? !this.focused : this.isOnline(m.id) && this.away.has(m.id),
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
    const known = new Set(contacts.map((v) => v.id));
    const isRequest = (e) => e.kind === "direct" ? e.state === "incoming" : e.myStatus === "invited";
    const rank = (e) => e.kind === "direct" && e.state === "blocked" ? 1 : 0;
    const rest = all.filter((e) => !isRequest(e));
    const isUnread = (e) => e.unread > 0;
    return {
      requests: all.filter(isRequest),
      unread: rest.filter(isUnread),
      chats: rest.filter((e) => e.kind === "direct" && !isUnread(e)).sort((a, b) => rank(a) - rank(b)),
      groups: rest.filter((e) => e.kind === "group" && !isUnread(e)),
      nearby: [...this.discovery?.peers.values() ?? []].filter((p) => !known.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
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
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
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
    if (isGroupChat(id) || this.activeChat !== id || !this.focused) return;
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
    if (c2 && c2.unread > 0) {
      this.contacts.upsert(id, { unread: 0 });
      this.changed();
    }
  }
  note(chatId, text, kind = "info") {
    const list = [...this.notesFor(chatId), { id: crypto5.randomUUID(), ts: Date.now(), text, kind }];
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
    this.toast = { text, kind, chatId };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.changed();
    }, TOAST_MS);
    this.toastTimer.unref();
    this.changed();
  }
  /** Note in the chat if it's open – otherwise as a toast. */
  event(chatId, text, kind = "info") {
    this.note(chatId, text, kind);
    if (this.activeChat !== chatId) this.showToast(text, kind, chatId);
  }
  log(line) {
    if (!this.opts.debug) return;
    try {
      fs6.appendFileSync(this.opts.paths.log, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
    } catch {
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
    const msg = { id: crypto5.randomUUID(), from: "me", text, ts: Date.now(), status: "pending" };
    this.history.add(id, msg);
    this.contacts.upsert(id, { lastActivity: msg.ts });
    if (c2.state === "accepted") this.network.get(id)?.send({ t: "msg", id: msg.id, ts: msg.ts, text: msg.text });
    else this.tryDial(id);
    this.changed();
    return { ok: true };
  }
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discovery?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      if (existing.state === "incoming") this.accept(id);
      else if (existing.state === "declined" || existing.state === "blocked") this.setState(id, "outgoing");
      this.connect(id);
      return;
    }
    if (!p) throw new Error("Peer is no longer nearby");
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, lastPort: p.port });
    this.note(id, "Sending request \u2026");
    this.connect(id);
    this.changed();
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.note(id, "Request sent again");
    this.connect(id);
  }
  /** Add a contact by IP – for networks that block broadcast. */
  async addByAddress(host, port = DEFAULT_PORT) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return;
    this.setState(id, "accepted");
    this.note(id, `You accepted ${displayName(c2)}'s request`, "success");
    this.flushOutbox(id);
    this.connect(id);
  }
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      s.close("Declined");
    }
    this.contacts.remove(id);
    this.showToast(`Declined ${displayName(c2)}'s request`);
    this.changed();
  }
  block(id) {
    if (!this.contacts.get(id)) return;
    this.contacts.upsert(id, { state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.note(id, "Contact blocked. No more connections will be accepted.", "error");
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return;
    this.setState(id, "outgoing");
    this.note(id, "Unblocked \u2013 request sent", "success");
    this.connect(id);
  }
  /** Remove contact + history. */
  removeContact(id) {
    this.contacts.remove(id);
    this.history.delete(id);
    this.notes.delete(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      s.close("Contact removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  setName(name) {
    this.name = cleanName(name);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), name: this.name });
    for (const id of this.network.sessions.keys()) this.sendState(id);
    this.discovery?.announce(false);
    this.changed();
    return this.name;
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
    const clean = cleanName(name);
    if (!name.trim()) throw new Error("A group needs a name");
    const gid = this.groups.create(clean, memberIds.map((id) => this.invitee(id)), this.name);
    for (const id of memberIds) this.tryDial(id);
    return groupChatId(gid);
  }
  groupInvite(chatId, memberIds) {
    for (const id of memberIds) {
      this.groups.invite(gidOf(chatId), this.invitee(id));
      this.tryDial(id);
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
    this.desktopNotify(`#${state.name}`, `${this.peerName(ev.author, state)}: ${preview}`);
    if (this.activeChat === chatId) {
      this.groups.markRead(gid);
      return;
    }
    this.showToast(`#${state.name} \xB7 ${this.peerName(ev.author, state)}: ${preview}`, "info", chatId);
  }
  // ───────────── Desktop notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
    if (focused && this.activeChat) this.seeChat(this.activeChat);
    this.changed();
  }
  sendPresence(id) {
    this.network.get(id)?.send({ t: "presence", away: !this.focused });
  }
  notificationsEnabled() {
    return loadConfig(this.opts.paths)?.notifications !== false;
  }
  setNotifications(on) {
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), notifications: on });
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termchat ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
  setEffects(mode) {
    this.effects = mode;
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), effects: mode });
    this.changed();
  }
  desktopNotify(title, body) {
    if (this.focused || !this.notificationsEnabled()) return;
    (this.opts.notify ?? notify)(title, body);
  }
  // ───────────── Network events ─────────────
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    const c2 = this.contacts.get(id);
    s?.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port });
  }
  onSession(s) {
    const id = s.peerId;
    let c2 = this.contacts.get(id);
    if (c2?.state === "blocked") {
      s.close("Blocked", false);
      return;
    }
    this.dialStates.delete(id);
    this.callbacks.delete(id);
    this.reachWarned.delete(id);
    if (s.tag === "request") {
      if (!c2) {
        c2 = this.contacts.upsert(id, { publicKey: "", name: s.peerName, state: "outgoing" });
        this.note(id, "Request sent \u2013 waiting for them to accept");
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
    if (!c2 && !this.groups.sharesGroup(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.groups.sharesGroup(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    this.sendState(id);
    if (!this.focused) this.sendPresence(id);
    this.groups.onSessionUp(id);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.away.delete(id);
    this.groups.onSessionDown(id);
    this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  onWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    switch (m.t) {
      case "state":
        return this.onState(s, m);
      case "decline": {
        const c2 = this.contacts.get(id);
        if (c2?.state === "outgoing") {
          this.contacts.upsert(id, { state: "declined" });
          this.event(id, `${displayName(c2)} declined your request`, "error");
        }
        return;
      }
      case "msg": {
        const c2 = this.contacts.get(id);
        if (c2?.state !== "accepted") return;
        if (!this.history.has(id, m.id)) {
          this.history.add(id, { id: m.id, from: "peer", text: m.text, ts: m.ts, status: "delivered" });
          const active = this.activeChat === id;
          this.desktopNotify(displayName(c2), m.text.replace(/\s+/g, " ").slice(0, 100));
          this.contacts.upsert(id, { lastActivity: Date.now(), unread: active ? 0 : c2.unread + 1 });
          if (!active) {
            const preview = m.text.replace(/\s+/g, " ").slice(0, 60);
            this.showToast(`${displayName(c2)}: ${preview}`, "info", id);
          }
          this.changed();
        }
        s.send({ t: "ack", ids: [m.id] });
        this.seeChat(id);
        return;
      }
      case "presence":
        if (!this.contacts.get(id) && !this.groups.sharesGroup(id)) return;
        if (m.away === this.away.has(id)) return;
        if (m.away) this.away.add(id);
        else this.away.delete(id);
        this.changed();
        return;
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
  onState(s, m) {
    const id = s.peerId;
    const c2 = this.contacts.get(id);
    const prev = c2?.state ?? null;
    const next = reconcile(prev, m.state);
    if (this.groups.sharesGroup(id)) {
      this.peerBook.update(id, { name: m.name, lastIp: s.remoteAddress, lastPort: m.port || void 0, lastSeen: Date.now() });
    }
    if (next === null && this.groups.sharesGroup(id)) {
      if (c2) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c2)} withdrew their request`);
      }
      this.changed();
      return;
    }
    if (next === null) {
      if (c2) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c2)} withdrew their request`);
      }
      s.close("Not a contact");
      this.changed();
      return;
    }
    const updated = this.contacts.upsert(id, {
      publicKey: s.peerPublicRaw.toString("base64url"),
      name: m.name,
      state: next,
      lastIp: s.remoteAddress,
      lastPort: m.port || c2?.lastPort,
      lastSeen: Date.now(),
      ...prev !== next ? { lastActivity: Date.now() } : {}
    });
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.event(id, prev === "outgoing" ? `${who} accepted your request` : `You are now connected with ${who}`, "success");
    } else if (next === "incoming" && prev !== "incoming") {
      this.showToast(`${who} wants to chat with you`, "info", id);
    } else if (prev === "accepted" && next === "outgoing") {
      this.event(id, `${who} removed you as a contact \u2013 your request is waiting to be accepted`, "error");
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    if (next === "accepted") this.flushOutbox(id);
    this.changed();
  }
  flushOutbox(id) {
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== "accepted") return;
    for (const m of this.history.pending(id)) s.send({ t: "msg", id: m.id, ts: m.ts, text: m.text });
    const read = this.history.recentlyRead(id, 100);
    if (read.length) s.send({ t: "read", ids: read });
    this.seeChat(id);
  }
  // ───────────── Auto-connect ─────────────
  target(id) {
    const p = this.discovery?.peers.get(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const c2 = this.contacts.get(id);
    if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort, discovered: false };
    const known = this.peerBook.get(id);
    if (known?.lastIp && known.lastPort) return { ip: known.lastIp, port: known.lastPort, discovered: false };
    return null;
  }
  /** Where contacts and group members were last seen – discovery asks there directly. */
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    for (const id of this.groups.peers()) {
      const ip = this.peerBook.get(id)?.lastIp;
      if (ip) ips.add(ip);
    }
    return [...ips];
  }
  dialLoop() {
    for (const c2 of this.contacts.all()) {
      if (c2.state === "accepted" || c2.state === "outgoing") this.tryDial(c2.id);
    }
    for (const id of this.groups.peers()) this.tryDial(id);
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.discovery?.callMe(id);
  }
  wantsConnection(id) {
    if (this.network.isOnline(id)) return false;
    const state = this.contacts.get(id)?.state;
    return state === "accepted" || state === "outgoing" || state !== "blocked" && this.groups.sharesGroup(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.network.isOnline(id) || this.contacts.get(id)?.state === "blocked") return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 6e4);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }
  tryDial(id) {
    if (this.network.isOnline(id)) return;
    const c2 = this.contacts.get(id);
    const now = Date.now();
    const wanted = c2?.state === "accepted" || c2?.state === "outgoing";
    const calledBack = c2?.state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!wanted && !calledBack && (c2?.state === "blocked" || !this.groups.sharesGroup(id))) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.dialStates.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.dialStates.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && c2?.state !== "outgoing" && this.identity.id > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    this.network.dial(t.ip, t.port, id).then(() => {
      this.dialStates.delete(id);
    }).catch((err) => {
      this.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const contact = this.contacts.get(id);
      const waiting = contact?.state === "outgoing" || contact?.state === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !this.network.isOnline(id) && !this.reachWarned.has(id)) {
        this.reachWarned.add(id);
        this.note(
          id,
          `Can't reach ${md(displayName(contact))} at ${t.ip}:${t.port} yet (${md(err.message)}) \u2013 still trying. If this stays, a firewall is probably blocking termchat on one of your computers: on Windows, allow Node.js for public networks; on macOS, allow incoming connections for node.`,
          "error"
        );
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// src/commands/parse.ts
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

// src/commands/registry.ts
var chatKindOf = (chatId) => chatId ? isGroupChat(chatId) ? "group" : "direct" : null;
var CommandRegistry = class {
  constructor(commands) {
    this.commands = commands;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  available(kind) {
    return this.commands.filter((c2) => c2.scope === "global" || kind !== null && (c2.scope === "chat" || c2.scope === kind));
  }
  /** Commands available in the current context, filtered by prefix. */
  suggest(prefix, kind) {
    const p = prefix.toLowerCase();
    return this.available(kind).filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
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
    const kind = chatKindOf(ctx.chatId);
    const cmd = this.available(kind).find((c2) => c2.name === parsed.name || c2.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
      return true;
    }
    if (cmd.scope !== "global" && !kind) {
      ui.print(`/${cmd.name} only works inside an open chat`, "error");
      return true;
    }
    if (cmd.scope === "direct" && kind === "group" || cmd.scope === "group" && kind === "direct") {
      ui.print(`/${cmd.name} only works in ${cmd.scope === "group" ? "group chats" : "one-to-one chats"}`, "error");
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
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net2.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
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
      ctx.ui.print(`**${me.name}** \xB7 ID \`${formatId(me.id, true)}\`
Reachable at ${addr}`);
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name",
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
        `- **Status** ${c2.inactive ? "inactive" : c2.online ? "online" : "offline"} \xB7 ${STATE_LABEL[c2.state] ?? c2.state}`,
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
    description: "<rgb>/<shine>: animate nonstop, for 8 seconds (default) or not at all",
    scope: "global",
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      const mode = arg === "on" ? "nonstop" : arg === "8s" ? "brief" : arg;
      if (mode && !EFFECTS_MODES.includes(mode)) throw new Error("Usage: /effects nonstop|brief|off");
      if (mode) ctx.store.setEffects(mode);
      const label = { nonstop: "animate nonstop", brief: "animate for 8 seconds, then rest", off: "are off (shown without animation)" };
      ctx.ui.print(`Effects ${label[ctx.store.effects]}`, "info");
    }
  },
  {
    name: "notifications",
    aliases: ["notify"],
    usage: "[on|off]",
    description: "Desktop notifications for messages while termchat is in the background",
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
var registry = new CommandRegistry(builtinCommands);

// src/ui/components/Header.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ store, width }) {
  const me = store.me;
  const online = store.onlineCount();
  const ip = me.ips[0] ? `${me.ips[0]}:${me.port}` : "no network";
  const wide = width >= 72;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: "#1E1E1E", bold: true, children: " termchat " }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          VERSION
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: me.name }),
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        store.updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${store.updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: ip }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " connected"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({ text, width, height, onClose }) {
  useInput(() => onClose());
  const lines = renderMarkdown(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: stripMarkers(l) || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// src/ui/editor.ts
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

// src/ui/mouse.ts
import { EventEmitter as EventEmitter5 } from "events";
import { PassThrough } from "stream";
import { useEffect, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h";
var MOUSE_OFF = "\x1B[?1004l\x1B[?1007l";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending = "") {
  const s = pending + input;
  const events = [];
  const focus = [];
  let text = "";
  let i = 0;
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);
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
      if (rest.length < 6) return done(text, events, rest, focus);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest)) return done(text, events, rest, focus);
    text += ESC;
    i = esc + 1;
  }
  return done(text, events, "", focus);
}
function done(text, events, pending, focus) {
  return focus.length ? { text, events, pending, focus } : { text, events, pending };
}
var mouse = new EventEmitter5();
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
    if (this.pending) {
      this.timer = setTimeout(() => {
        const p = this.pending;
        this.pending = "";
        if (p) this.write(p);
      }, PENDING_MS);
    }
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
function useWheel(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const on = (dir) => latest.current(dir);
    mouse.on("wheel", on);
    return () => {
      mouse.off("wheel", on);
    };
  }, [isActive]);
}

// src/ui/hooks.ts
import { useStdout } from "ink";
import { useEffect as useEffect2, useState, useSyncExternalStore } from "react";
function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect2(() => {
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
import { useEffect as useEffect5, useMemo, useRef as useRef4, useState as useState5 } from "react";

// src/ui/components/CommandMenu.tsx
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

// src/ui/components/Dialog.tsx
import { Box as Box5, Text as Text5, useInput as useInput3 } from "ink";
import { useState as useState2 } from "react";

// src/ui/components/InputBox.tsx
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
  borderColor = theme.border
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
  useInput2(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === "c") return;
      const state2 = latest.current;
      const set = (next2) => {
        histIndex.current = null;
        change(next2);
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
      let text = cleanPaste(input);
      if (singleLine) text = text.replace(/\n/g, " ");
      if (!text) return;
      let next = edit.insert(state2, text);
      const closing = input === ">" ? autoCloseTag(next.value, next.cursor) : null;
      if (closing) next = { value: next.value.slice(0, next.cursor) + closing + next.value.slice(next.cursor), cursor: next.cursor };
      set(next);
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

// src/ui/components/Dialog.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx5(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx5(PromptDialog, { spec, width });
  return /* @__PURE__ */ jsx5(PickDialog, { spec, width });
}
function Frame({ width, children }) {
  return /* @__PURE__ */ jsx5(Box5, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs5(Frame, { width, children: [
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
  const [state, setState] = useState2(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs5(Frame, { width, children: [
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
  const [cursor, setCursor] = useState2(0);
  const [chosen, setChosen] = useState2(/* @__PURE__ */ new Set());
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
      spec.resolve(chosen.size ? spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id) : current ? [current.id] : []);
    }
  });
  const start2 = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start2, start2 + PICK_VISIBLE);
  return /* @__PURE__ */ jsxs5(Frame, { width, children: [
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
    /* @__PURE__ */ jsx5(Text5, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? "\u2191\u2193 move \xB7 space select \xB7 enter confirm \xB7 esc cancel" : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// src/ui/components/Footer.tsx
import { Box as Box6, Text as Text6 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var KIND_STYLE = {
  info: { color: theme.accent, icon: icons.request },
  success: { color: theme.success, icon: icons.delivered },
  error: { color: theme.error, icon: icons.error }
};
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = KIND_STYLE[toast.kind];
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
import { useEffect as useEffect3, useRef as useRef3, useState as useState3 } from "react";
import stringWidth4 from "string-width";

// src/ui/format.ts
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
  const min = Math.floor((now - ts) / 6e4);
  if (min < 1) return "last seen just now";
  if (min < 60) return `last seen ${min} min ago`;
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
  const [now, setNow] = useState3(Date.now);
  const moving = signature !== "" && (mode === "nonstop" || mode === "brief" && now - since.current < ANIM_MS);
  useEffect3(() => {
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
import { useEffect as useEffect4, useState as useState4 } from "react";
function useCommandInput({ editor, setEditor, kind, onSubmit, onEscape, tags = false }) {
  const [selected, setSelected] = useState4(0);
  const [dismissed, setDismissed] = useState4(-1);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands = filter !== null ? registry.suggest(filter, kind) : [];
  const tagAt = tags && filter === null ? tagStart(editor.value, editor.cursor) : -1;
  const tagList = tagAt >= 0 && tagAt !== dismissed ? tagSuggestions(editor.value, editor.cursor) : [];
  const items = commands.length ? commands.map((c2) => ({ key: c2.name, label: `/${c2.name} ${c2.usage ?? ""}`.trimEnd(), description: c2.description })) : tagList.map((t) => ({ key: t.name, label: `${t.open}\u2026${t.close}`, description: t.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  const menuKey = filter ?? (tagList.length ? `<${editor.value.slice(tagAt + 1, editor.cursor)}` : null);
  useEffect4(() => setSelected(0), [menuKey]);
  useEffect4(() => {
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
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
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
    left = /* @__PURE__ */ jsxs8(Fragment2, { children: [
      /* @__PURE__ */ jsx8(Text8, { color: theme.accent, bold: true, children: icons.group }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: chat.display }),
      /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
      /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: members === 1 ? "1 member" : `${members} members` }),
      chat.myStatus === "member" ? /* @__PURE__ */ jsxs8(Fragment2, { children: [
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
    left = /* @__PURE__ */ jsxs8(Fragment2, { children: [
      /* @__PURE__ */ jsxs8(Text8, { color: chat.inactive ? theme.warning : chat.online ? theme.success : theme.faint, children: [
        chat.inactive ? icons.away : chat.online ? icons.online : icons.offline,
        " "
      ] }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: chat.display }),
      chat.alias ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
        " (",
        chat.name,
        ")"
      ] }) : null,
      /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: " \xB7 " }),
      chat.inactive ? /* @__PURE__ */ jsx8(Text8, { color: theme.warning, children: "inactive" }) : chat.online ? /* @__PURE__ */ jsx8(Text8, { color: theme.success, children: "online" }) : /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: lastSeen(chat.lastSeen) })
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
function Chat({ store, id, width, height, actions, dialog, editor, setEditor, history, pushHistory, version, onCycle }) {
  const chat = store.chat(id);
  const isGroup = chat?.kind === "group";
  const [offset, setOffset] = useState5(0);
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
  useEffect5(() => {
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
    dialog ? /* @__PURE__ */ jsx8(Dialog, { spec: dialog, width }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
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
          borderColor: editor.value.startsWith("/") ? theme.accent : theme.border
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
import { Box as Box9, Text as Text9, useInput as useInput4 } from "ink";
import { useRef as useRef5, useState as useState6 } from "react";
import { Fragment as Fragment3, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
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
  const [commandMode, setCommandMode] = useState6(false);
  const commandRef = useRef5(false);
  const [editor, setEditor] = useState6(emptyEditor);
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
  const bodyHeight = Math.max(3, height - bottom - 1);
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
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx9(Box9, { flexDirection: "column", height: bodyHeight, paddingX: 1, overflow: "hidden", children: entries.length === 0 ? /* @__PURE__ */ jsx9(EmptyState, { store }) : visible.map((l, i) => {
      if (l.kind === "gap") return /* @__PURE__ */ jsx9(Text9, { children: " " }, i);
      if (l.kind === "section") {
        return /* @__PURE__ */ jsx9(Text9, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, i);
      }
      return /* @__PURE__ */ jsx9(Row, { entry: l.entry, selected: l.index === selected, width: inner, store }, l.entry.key);
    }) }),
    dialog ? /* @__PURE__ */ jsx9(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs9(Fragment3, { children: [
      /* @__PURE__ */ jsx9(
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
      /* @__PURE__ */ jsx9(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx9(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Row({ entry, selected, width, store }) {
  const pointer = /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: selected ? icons.pointer : " " }) });
  const nameWidth = Math.min(22, Math.max(10, Math.floor(width * 0.25)));
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      pointer,
      /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color: theme.success, children: icons.online }) }),
      /* @__PURE__ */ jsx9(Box9, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: p.name }) }),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "truncate-end", children: [
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
  const dot = /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: isRequest ? /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: icons.request }) : isGroup ? /* @__PURE__ */ jsx9(Text9, { color: inactive ? theme.faint : theme.accent, bold: true, children: icons.group }) : /* @__PURE__ */ jsx9(Text9, { color: c2.inactive ? theme.warning : c2.online ? theme.success : theme.faint, children: c2.inactive ? icons.away : c2.online ? icons.online : icons.offline }) });
  const time = c2.last ? shortTime(c2.last.ts) : "";
  return /* @__PURE__ */ jsxs9(Box9, { children: [
    pointer,
    dot,
    /* @__PURE__ */ jsx9(Box9, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected || c2.unread > 0, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: c2.display }) }),
    /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx9(Text9, { color: preview.dim ? theme.dim : void 0, italic: inactive && !isRequest, wrap: "truncate-end", children: preview.text }) }),
    /* @__PURE__ */ jsx9(Box9, { width: 9, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx9(Text9, { color: theme.faint, children: time }) }),
    /* @__PURE__ */ jsx9(Box9, { width: 5, flexShrink: 0, justifyContent: "flex-end", children: c2.unread > 0 ? /* @__PURE__ */ jsx9(Text9, { backgroundColor: theme.accent, color: "#1E1E1E", bold: true, children: ` ${c2.unread > 99 ? "99+" : c2.unread} ` }) : null })
  ] });
}
function EmptyState({ store }) {
  const me = store.me;
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", paddingTop: 1, paddingX: 1, children: [
    /* @__PURE__ */ jsx9(Text9, { bold: true, children: "No chats yet" }),
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: "Other termchat users on the same network show up here automatically" }),
    /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: 'under "Nearby". Press enter to send them a chat request.' }),
    me.scanning ? /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "Searching the network \u2026" }) : null,
    /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
      "Once you have contacts, press ",
      /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "g" }),
      " to start a group chat."
    ] }),
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
      "Someone not showing up? Press ",
      /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "a" }),
      " and enter their IP."
    ] }),
    /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
      "Your address for others:",
      " ",
      /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network" })
    ] })
  ] });
}

// src/ui/screens/Onboarding.tsx
import { Box as Box10, Text as Text10, useInput as useInput5 } from "ink";
import { useState as useState7 } from "react";
import { Fragment as Fragment4, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var LOGO = [
  "\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E",
  "\u2502   termchat                  \u2502",
  "\u2502   chat on your network      \u2502",
  "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F"
];
function Onboarding({ paths, width, onDone }) {
  const [editor, setEditor] = useState7(emptyEditor);
  const [created, setCreated] = useState7(null);
  const [error, setError] = useState7(null);
  useInput5((_i, key) => key.return && onDone(), { isActive: created !== null });
  const submit = (value) => {
    const name = value.trim();
    if (!name) {
      setError("Please enter a name.");
      return;
    }
    try {
      AppStore.createProfile(paths, name);
      setCreated({ name, id: loadOrCreateIdentity(paths).id });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const boxWidth = Math.min(64, width - 4);
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    LOGO.map((l, i) => /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx10(Text10, { children: " " }),
    created ? /* @__PURE__ */ jsxs10(Fragment4, { children: [
      /* @__PURE__ */ jsxs10(Text10, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx10(Text10, { bold: true, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs10(Text10, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your contacts recognize" }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "you \u2013 even if your name or IP address changes." }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "All messages are end-to-end encrypted." }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsxs10(Text10, { children: [
        "Press ",
        /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] }) : /* @__PURE__ */ jsxs10(Fragment4, { children: [
      /* @__PURE__ */ jsx10(Text10, { bold: true, children: "What should others see you as?" }),
      /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "You can change it later with /name." }),
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(
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
      error ? /* @__PURE__ */ jsx10(Text10, { color: theme.error, children: error }) : null
    ] })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function Root({ paths, options }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState8(() => loadConfig(paths) ? { name: "starting" } : { name: "onboarding" });
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
  useEffect6(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
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
    return /* @__PURE__ */ jsx11(Onboarding, { paths, width: columns, onDone: () => setPhase({ name: "starting" }) });
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx11(Box11, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "Starting termchat \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs11(Box11, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Text11, { color: theme.error, bold: true, children: "termchat could not start" }),
      /* @__PURE__ */ jsx11(Text11, { children: phase.message }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx11(Main, { store: phase.store, width: columns, height, quit });
}
function Main({ store, width, height, quit }) {
  const version = useStoreVersion(store);
  const [chatId, setChatId] = useState8(null);
  const [dialog, setDialog] = useState8(null);
  const [panel, setPanel] = useState8(null);
  const [selectedKey, setSelectedKey] = useState8(null);
  const [drafts, setDrafts] = useState8(/* @__PURE__ */ new Map());
  const [history, setHistory] = useState8([]);
  useEffect6(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);
  useEffect6(() => {
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
    body = /* @__PURE__ */ jsx11(
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
    body = /* @__PURE__ */ jsx11(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null) });
  } else {
    body = /* @__PURE__ */ jsx11(
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
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx11(Header, { store, width }),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx12 } from "react/jsx-runtime";
var HELP = `termchat \u2013 end-to-end encrypted chat for your local network

Usage: termchat [options]
       termchat update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.termchat, or $TERMCHAT_HOME)
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
function main() {
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
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
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
    /* @__PURE__ */ jsx12(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug } }),
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
  main();
}
void start();
