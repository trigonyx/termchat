import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface Paths {
  home: string;
  identity: string;
  config: string;
  contacts: string;
  historyDir: string;
  groupsDir: string;
  groupsMeta: string;
  peers: string;
  log: string;
  /** Held by the running instance (pid + start time), so a second one can't start. */
  lock: string;
  /** Unix socket (named pipe on Windows) the running instance answers on. */
  socket: string;
}

/** Unix socket paths are limited to ~104 bytes on macOS – long homes fall back to the temp dir. */
const MAX_SOCKET_PATH = 100;

export function socketPath(root: string, platform = process.platform): string {
  const tag = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
  if (platform === 'win32') return `\\\\.\\pipe\\termchat-${tag}`;
  const inHome = path.join(root, 'termchat.sock');
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path.join(os.tmpdir(), `termchat-${tag}.sock`);
}

export function resolvePaths(home?: string): Paths {
  const root = path.resolve(home ?? process.env.TERMCHAT_HOME ?? path.join(os.homedir(), '.termchat'));
  return {
    home: root,
    identity: path.join(root, 'identity.json'),
    config: path.join(root, 'config.json'),
    contacts: path.join(root, 'contacts.json'),
    historyDir: path.join(root, 'history'),
    groupsDir: path.join(root, 'groups'),
    groupsMeta: path.join(root, 'groups.json'),
    peers: path.join(root, 'peers.json'),
    log: path.join(root, 'termchat.log'),
    lock: path.join(root, 'termchat.lock'),
    socket: socketPath(root),
  };
}
