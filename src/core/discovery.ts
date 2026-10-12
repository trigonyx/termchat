import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { cleanName } from './sanitize.js';

export const DISCOVERY_PORT = 5051;
const ANNOUNCE_INTERVAL = 3000;
const EXPIRE_AFTER = 10_000;
const ID_RE = /^[A-Z2-7]{20}$/;

export interface DiscoveredPeer {
  id: string;
  name: string;
  ip: string;
  port: number;
  lastSeen: number;
}

interface Announce {
  app: 'termchat';
  v: 1;
  id: string;
  name: string;
  port: number;
  /** Asks for an immediate reply (on startup) so nobody has to wait 3 s. */
  q?: 1;
}

export function localIPv4s(): { address: string; broadcast: string }[] {
  const out: { address: string; broadcast: string }[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      const broadcast = ip.map((b, i) => (b | (~mask[i]! & 255)) & 255).join('.');
      out.push({ address: a.address, broadcast });
    }
  }
  return out;
}

/**
 * Finds other termchat instances on the local network via UDP broadcast.
 * This way a contact's current IP is always known, even when it changes.
 */
export class Discovery extends EventEmitter<{ change: []; log: [string] }> {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  readonly peers = new Map<string, DiscoveredPeer>();

  constructor(
    private readonly myId: string,
    private readonly getName: () => string,
    private readonly getPort: () => number,
    private readonly udpPort = DISCOVERY_PORT,
  ) {
    super();
  }

  start(): void {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', (err) => {
      this.emit('log', `Discovery unavailable: ${err.message}`);
      this.stop();
    });
    socket.on('message', (buf, rinfo) => this.onMessage(buf, rinfo.address));
    socket.bind(this.udpPort, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        // some environments don't allow broadcast – then only /add is left
      }
      this.announce(true);
      this.timer = setInterval(() => {
        this.announce(false);
        this.expire();
      }, ANNOUNCE_INTERVAL);
      this.timer.unref();
    });
  }

  /** Re-announce immediately, e.g. after a name change. */
  announce(query: boolean): void {
    const msg: Announce = { app: 'termchat', v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const targets = new Set(['255.255.255.255', ...localIPv4s().map((i) => i.broadcast)]);
    for (const target of targets) this.sendTo(msg, target);
  }

  private sendTo(msg: Announce, address: string): void {
    const buf = Buffer.from(JSON.stringify(msg));
    this.socket?.send(buf, this.udpPort, address, () => {
      // send errors (e.g. no network) are normal here and ignored
    });
  }

  private onMessage(buf: Buffer, address: string): void {
    if (buf.length > 1024) return;
    let msg: Partial<Announce>;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    if (msg.app !== 'termchat' || msg.v !== 1 || typeof msg.id !== 'string' || !ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;

    const prev = this.peers.get(msg.id);
    const peer: DiscoveredPeer = { id: msg.id, name: cleanName(msg.name), ip: address, port, lastSeen: Date.now() };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name) this.emit('change');

    if (msg.q) {
      const reply: Announce = { app: 'termchat', v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
      this.sendTo(reply, address);
    }
  }

  private expire(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('change');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}
