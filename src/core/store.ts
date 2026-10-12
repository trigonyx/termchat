import crypto from 'node:crypto';
import fs from 'node:fs';
import { ContactBook, displayName, type Contact } from './contacts.js';
import { Discovery, localIPv4s, type DiscoveredPeer, type DiscoveryOptions } from './discovery.js';
import { HistoryStore, type ChatMessage } from './history.js';
import { loadConfig, loadOrCreateIdentity, safetyCode, saveConfig, type Identity } from './identity.js';
import type { GroupEvent, GroupState } from './groupEvents.js';
import { GroupManager, type MyGroupStatus } from './groups.js';
import { DEFAULT_PORT, Network } from './network.js';
import type { Paths } from './paths.js';
import type { Session } from './peer.js';
import { notify } from './notify.js';
import { PeerBook } from './peers.js';
import { reconcile, relStateFor, type ContactState, type Wire } from './protocol.js';
import { cleanName, MAX_TEXT, sanitizeText } from './sanitize.js';

export interface StoreOptions {
  paths: Paths;
  port?: number;
  discovery?: boolean;
  discoveryPort?: number;
  /** Simulated network for discovery (tests). */
  discoveryOptions?: Pick<DiscoveryOptions, 'transport' | 'interfaces'>;
  dialIntervalMs?: number;
  debug?: boolean;
  /** Desktop notification sink (defaults to the OS notifier). */
  notify?: (title: string, body: string) => void;
}

export type NoteKind = 'info' | 'success' | 'error';

export interface Note {
  id: string;
  ts: number;
  text: string;
  kind: NoteKind;
}

export interface Toast {
  text: string;
  kind: NoteKind;
  chatId?: string;
}

export interface ContactView extends Contact {
  kind: 'direct';
  display: string;
  online: boolean;
  /** connected, but their terminal is in the background */
  inactive: boolean;
  last?: ChatMessage;
}

export interface GroupMemberView {
  id: string;
  name: string;
  status: 'member' | 'invited';
  online: boolean;
  inactive: boolean;
  isMe: boolean;
  isCreator: boolean;
}

export interface GroupView {
  kind: 'group';
  /** chat id ("g-" + gid) */
  id: string;
  gid: string;
  display: string;
  creator: string;
  myStatus: MyGroupStatus;
  members: GroupMemberView[];
  onlineCount: number;
  invitedBy?: string;
  unread: number;
  lastActivity: number;
  last?: { text: string; ts: number; mine: boolean; sender: string };
}

export type ChatEntry = ContactView | GroupView;

export interface ChatListData {
  requests: ChatEntry[];
  chats: ChatEntry[];
  nearby: DiscoveredPeer[];
}

/** UI-independent view of one line in a chat (direct or group). */
export type ChatItem =
  | {
      kind: 'msg';
      id: string;
      ts: number;
      mine: boolean;
      senderId: string;
      senderName: string;
      text: string;
      status: 'pending' | 'delivered' | 'read' | { n: number; total: number };
    }
  | { kind: 'note'; id: string; ts: number; text: string; noteKind: NoteKind };

export const GROUP_PREFIX = 'g-';
export const isGroupChat = (chatId: string) => chatId.startsWith(GROUP_PREFIX);
export const groupChatId = (gid: string) => GROUP_PREFIX + gid;
const gidOf = (chatId: string) => chatId.slice(GROUP_PREFIX.length);

/** Escapes names before putting them into Markdown notes. */
const md = (s: string) => s.replace(/[\\`*_~#>\[\]|]/g, (ch) => `\\${ch}`);

interface DialState {
  inFlight: boolean;
  next: number;
  backoff: number;
  deferredSince?: number;
}

const TOAST_MS = 4000;
const MAX_BACKOFF = 30_000;
/** Unknown connections that don't introduce themselves are dropped after this time. */
const UNKNOWN_PEER_TIMEOUT = 15_000;

/**
 * Central app logic: ties together network, contacts and history and exposes a
 * subscribable state to the UI. Also runs without a UI (tests).
 */
export class AppStore {
  readonly identity: Identity;
  readonly contacts: ContactBook;
  readonly history: HistoryStore;
  readonly network: Network;
  readonly groups: GroupManager;
  private readonly peerBook: PeerBook;
  private discovery: Discovery | null = null;
  private name: string;
  private readonly preferredPort: number;
  private notes = new Map<string, Note[]>();
  private viewCutoffs = new Map<string, number>();
  private dialStates = new Map<string, DialState>();
  private dialTimer: NodeJS.Timeout | null = null;
  private toastTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private activeChat: string | null = null;
  private focused = true;
  /** /effects – cached, the UI reads it on every animation frame */
  effects: 'nonstop' | 'brief' | 'off';
  /** Peers that reported their terminal is in the background. */
  private away = new Set<string>();
  version = 0;
  toast: Toast | null = null;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable: string | null = null;

  constructor(private readonly opts: StoreOptions) {
    const cfg = loadConfig(opts.paths);
    if (!cfg) throw new Error('No profile found');
    this.name = cfg.name;
    this.effects = cfg.effects ?? 'brief';
    this.preferredPort = opts.port ?? cfg.port ?? DEFAULT_PORT;
    this.identity = loadOrCreateIdentity(opts.paths);
    this.contacts = new ContactBook(opts.paths);
    this.history = new HistoryStore(opts.paths);
    this.network = new Network(this.identity, () => this.name);
    this.peerBook = new PeerBook(opts.paths);
    this.groups = new GroupManager(opts.paths, this.identity, {
      send: (id, msg) => this.network.get(id)?.send(msg) ?? false,
      connectedPeers: () => [...this.network.sessions.keys()],
      isAcceptedContact: (id) => this.contacts.get(id)?.state === 'accepted',
      changed: () => this.changed(),
      onMessage: (gid, ev, state) => this.onGroupMessage(gid, ev, state),
      onInvited: (gid, state, by) =>
        this.showToast(`${this.peerName(by, state)} invited you to #${state.name}`, 'info', groupChatId(gid)),
    });
    this.network.on('session', (s) => this.onSession(s));
    this.network.on('offline', (id) => this.onOffline(id));
    this.network.on('log', (l) => this.log(l));
  }

  /** Creates the profile and keys on first launch. */
  static createProfile(paths: Paths, name: string): void {
    loadOrCreateIdentity(paths);
    saveConfig(paths, { name: cleanName(name) });
  }

  // ───────────── Lifecycle ─────────────

  async start(): Promise<void> {
    await this.network.start(this.preferredPort);
    if (this.opts.discovery !== false) {
      this.discovery = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...this.opts.discoveryOptions,
        udpPort: this.opts.discoveryPort,
        hints: () => this.lastKnownIps(),
      });
      this.discovery.on('change', () => {
        for (const p of this.discovery?.peers.values() ?? []) {
          // Recognized by ID: if a contact's address changed, remember the new one …
          const c = this.contacts.get(p.id);
          if (c && (c.lastIp !== p.ip || c.lastPort !== p.port)) this.contacts.upsert(p.id, { lastIp: p.ip, lastPort: p.port });
          if (this.peerBook.get(p.id)) this.peerBook.update(p.id, { lastIp: p.ip, lastPort: p.port });
          // … and retry right away
          const ds = this.dialStates.get(p.id);
          if (ds && !ds.inFlight) ds.next = 0;
        }
        this.changed();
      });
      this.discovery.on('log', (l) => this.log(l));
      this.discovery.start();
    }
    this.dialTimer = setInterval(() => this.dialLoop(), this.opts.dialIntervalMs ?? 1500);
    this.dialTimer.unref();
    this.dialLoop();
    this.changed();
  }

  async stop(): Promise<void> {
    if (this.dialTimer) clearInterval(this.dialTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.discovery?.stop();
    await this.network.stop();
  }

  // ───────────── Subscription for React ─────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private changed(): void {
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
      scanning: this.discovery?.scanning ?? false,
    };
  }

  isOnline(id: string): boolean {
    return this.network.isOnline(id);
  }

  contact(id: string): ContactView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    return { ...c, kind: 'direct', display: displayName(c), online: this.isOnline(id), inactive: this.isOnline(id) && this.away.has(id), last: this.history.last(id) };
  }

  /** Best name for any peer: own nickname/contact name, else what the group says. */
  peerName(id: string, state?: GroupState): string {
    if (id === this.identity.id) return this.name;
    const c = this.contacts.get(id);
    if (c) return displayName(c);
    return state?.names.get(id) ?? this.peerBook.get(id)?.name ?? 'Unknown';
  }

  group(chatId: string): GroupView | undefined {
    const gid = gidOf(chatId);
    const state = this.groups.get(gid);
    const myStatus = this.groups.myStatus(gid);
    if (!state || !myStatus) return undefined;
    const members = [...state.members.values()].map(
      (m): GroupMemberView => ({
        id: m.id,
        name: this.peerName(m.id, state),
        status: m.status,
        online: m.id === this.identity.id || this.isOnline(m.id),
        inactive: m.id === this.identity.id ? !this.focused : this.isOnline(m.id) && this.away.has(m.id),
        isMe: m.id === this.identity.id,
        isCreator: m.id === state.creator,
      }),
    );
    const lastMsg = [...state.timeline].reverse().find((t) => t.type === 'msg');
    const meta = this.groups.metaOf(gid);
    return {
      kind: 'group',
      id: chatId,
      gid,
      display: state.name,
      creator: state.creator,
      myStatus,
      members,
      onlineCount: members.filter((m) => m.online && !m.isMe && m.status === 'member').length,
      invitedBy: state.members.get(this.identity.id)?.invitedBy,
      unread: meta.unread,
      lastActivity: meta.lastActivity,
      last:
        lastMsg?.type === 'msg' && myStatus !== 'invited'
          ? {
              text: lastMsg.text,
              ts: lastMsg.ev.ts,
              mine: lastMsg.ev.author === this.identity.id,
              sender: this.peerName(lastMsg.ev.author, state),
            }
          : undefined,
    };
  }

  /** Direct contact or group, by chat id. */
  chat(chatId: string): ChatEntry | undefined {
    return isGroupChat(chatId) ? this.group(chatId) : this.contact(chatId);
  }

  chatList(): ChatListData {
    const contacts = this.contacts.all().map((c) => this.contact(c.id)!);
    const groups = this.groups
      .list()
      .map((g) => this.group(groupChatId(g.gid))!)
      .filter((g) => g && g.myStatus !== 'declined');
    const all: ChatEntry[] = [...contacts, ...groups].sort((a, b) => b.lastActivity - a.lastActivity);
    const known = new Set(contacts.map((v) => v.id));
    const isRequest = (e: ChatEntry) => (e.kind === 'direct' ? e.state === 'incoming' : e.myStatus === 'invited');
    const rank = (e: ChatEntry) => (e.kind === 'direct' && e.state === 'blocked' ? 1 : 0);
    return {
      requests: all.filter(isRequest),
      chats: all.filter((e) => !isRequest(e)).sort((a, b) => rank(a) - rank(b)),
      nearby: [...(this.discovery?.peers.values() ?? [])]
        .filter((p) => !known.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Everything shown in a chat, as UI-independent items (without ephemeral notes). */
  items(chatId: string): ChatItem[] {
    if (!isGroupChat(chatId)) {
      const name = this.contact(chatId)?.display ?? 'Unknown';
      return this.history.get(chatId).map((m) => ({
        kind: 'msg',
        id: m.id,
        ts: m.ts,
        mine: m.from === 'me',
        senderId: m.from === 'me' ? this.identity.id : chatId,
        senderName: m.from === 'me' ? 'You' : name,
        text: m.text,
        status: m.status,
      }));
    }
    const gid = gidOf(chatId);
    const state = this.groups.get(gid);
    if (!state) return [];
    const invited = this.groups.myStatus(gid) === 'invited';
    const who = (id: string, object = false) =>
      id === this.identity.id ? (object ? 'you' : 'You') : `**${md(this.peerName(id, state))}**`;
    const out: ChatItem[] = [];
    for (const t of state.timeline) {
      const ev = t.ev;
      if (t.type === 'msg') {
        if (invited || this.contacts.get(ev.author)?.state === 'blocked') continue;
        const mine = ev.author === this.identity.id;
        const d = mine ? this.groups.delivery(gid, ev.id) : null;
        out.push({
          kind: 'msg',
          id: ev.id,
          ts: ev.ts,
          mine,
          senderId: ev.author,
          senderName: mine ? 'You' : this.peerName(ev.author, state),
          text: t.text,
          status: !d ? 'delivered' : d.total === 0 || d.n === d.total ? 'delivered' : d.n === 0 ? 'pending' : d,
        });
        continue;
      }
      const target = t.target ? who(t.target, true) : '';
      const text =
        t.action === 'create'
          ? `${who(ev.author)} created the group **${md(t.value ?? '')}**`
          : t.action === 'invite'
            ? `${who(ev.author)} invited ${target}`
            : t.action === 'join'
              ? `${who(ev.author)} joined`
              : t.action === 'decline'
                ? `${who(ev.author)} declined the invite`
                : t.action === 'leave'
                  ? `${who(ev.author)} left`
                  : t.action === 'kick'
                    ? `${who(ev.author)} removed ${target}`
                    : `${who(ev.author)} renamed the group to **${md(t.value ?? '')}**`;
      out.push({ kind: 'note', id: ev.id, ts: ev.ts, text, noteKind: 'info' });
    }
    return out;
  }

  onlineCount(): number {
    return this.network.sessions.size;
  }

  messages(id: string): ChatMessage[] {
    return this.history.get(id);
  }

  notesFor(id: string): Note[] {
    return this.notes.get(id) ?? [];
  }

  safetyCodeWith(id: string): string | null {
    const c = this.contacts.get(id);
    if (!c?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c.publicKey, 'base64url'));
  }

  // ───────────── UI helpers ─────────────

  setActiveChat(id: string | null): void {
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
  private seeChat(id: string): void {
    if (isGroupChat(id) || this.activeChat !== id || !this.focused) return;
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== 'accepted') return;
    const ids = this.history.markRead(id, this.history.unseen(id), 'peer');
    for (let i = 0; i < ids.length; i += 500) s.send({ t: 'read', ids: ids.slice(i, i + 500) });
  }

  markRead(id: string): void {
    if (isGroupChat(id)) {
      if (this.groups.markRead(gidOf(id))) this.changed();
      return;
    }
    const c = this.contacts.get(id);
    if (c && c.unread > 0) {
      this.contacts.upsert(id, { unread: 0 });
      this.changed();
    }
  }

  note(chatId: string, text: string, kind: NoteKind = 'info'): void {
    const list = [...this.notesFor(chatId), { id: crypto.randomUUID(), ts: Date.now(), text, kind }];
    this.notes.set(chatId, list.slice(-50));
    this.changed();
  }

  /** /clear: hides everything up to now without deleting the history. */
  clearView(chatId: string): void {
    this.notes.delete(chatId);
    this.viewCutoffs.set(chatId, Date.now());
    this.changed();
  }

  viewCutoff(chatId: string): number {
    return this.viewCutoffs.get(chatId) ?? 0;
  }

  showToast(text: string, kind: NoteKind = 'info', chatId?: string): void {
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
  private event(chatId: string, text: string, kind: NoteKind = 'info'): void {
    this.note(chatId, text, kind);
    if (this.activeChat !== chatId) this.showToast(text, kind, chatId);
  }

  private log(line: string): void {
    if (!this.opts.debug) return;
    try {
      fs.appendFileSync(this.opts.paths.log, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // logging must never break the app
    }
  }

  // ───────────── Actions ─────────────

  sendMessage(id: string, raw: string): { ok: boolean; error?: string } {
    const c = this.contacts.get(id);
    if (!c) return { ok: false, error: 'Unknown contact' };
    const text = sanitizeText(raw).trim();
    if (!text) return { ok: false };
    if (text.length > MAX_TEXT) return { ok: false, error: `Message too long (max. ${MAX_TEXT} characters)` };
    if (c.state === 'incoming') return { ok: false, error: 'Accept the request first: /accept' };
    if (c.state === 'blocked') return { ok: false, error: 'Contact is blocked: /unblock' };
    if (c.state === 'declined') return { ok: false, error: 'Your request was declined. Ask again: /request' };

    const msg: ChatMessage = { id: crypto.randomUUID(), from: 'me', text, ts: Date.now(), status: 'pending' };
    this.history.add(id, msg);
    this.contacts.upsert(id, { lastActivity: msg.ts });
    if (c.state === 'accepted') this.network.get(id)?.send({ t: 'msg', id: msg.id, ts: msg.ts, text: msg.text });
    else this.tryDial(id);
    this.changed();
    return { ok: true };
  }

  /** Request to a peer from "Nearby". */
  requestNearby(id: string): void {
    const p = this.discovery?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      if (existing.state === 'declined' || existing.state === 'blocked') this.setState(id, 'outgoing');
      return;
    }
    if (!p) throw new Error('Peer is no longer nearby');
    this.contacts.upsert(id, { publicKey: '', name: p.name, state: 'outgoing', lastIp: p.ip, lastPort: p.port });
    this.note(id, 'Sending request …');
    this.tryDial(id);
    this.changed();
  }

  /** Ask again (after a decline). */
  request(id: string): void {
    this.setState(id, 'outgoing');
    this.note(id, 'Request sent again');
    this.tryDial(id);
  }

  /** Add a contact by IP – for networks that block broadcast. */
  async addByAddress(host: string, port = DEFAULT_PORT): Promise<string> {
    const session = await this.network.dial(host, port, undefined, 'request');
    return session.peerId;
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (!c || c.state !== 'incoming') return;
    this.setState(id, 'accepted');
    this.note(id, `You accepted ${displayName(c)}'s request`, 'success');
    this.flushOutbox(id);
    this.tryDial(id);
  }

  decline(id: string): void {
    const c = this.contacts.get(id);
    if (!c) return;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: 'decline' });
      s.close('Declined');
    }
    this.contacts.remove(id);
    this.showToast(`Declined ${displayName(c)}'s request`);
    this.changed();
  }

  block(id: string): void {
    if (!this.contacts.get(id)) return;
    this.contacts.upsert(id, { state: 'blocked' });
    this.network.get(id)?.close('Blocked');
    this.note(id, 'Contact blocked. No more connections will be accepted.', 'error');
  }

  unblock(id: string): void {
    const c = this.contacts.get(id);
    if (c?.state !== 'blocked') return;
    this.setState(id, 'outgoing');
    this.note(id, 'Unblocked – request sent', 'success');
    this.tryDial(id);
  }

  /** Remove contact + history. */
  removeContact(id: string): void {
    this.contacts.remove(id);
    this.history.delete(id);
    this.notes.delete(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: 'state', name: this.name, state: 'none', port: this.network.port });
      s.close('Contact removed');
    }
    this.changed();
  }

  rename(id: string, alias: string): void {
    const clean = alias.trim() ? cleanName(alias) : undefined;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }

  setName(name: string): string {
    this.name = cleanName(name);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), name: this.name });
    for (const id of this.network.sessions.keys()) this.sendState(id);
    this.discovery?.announce(false);
    this.changed();
    return this.name;
  }

  deleteHistory(id: string): void {
    this.history.delete(id);
    this.notes.delete(id);
    this.changed();
  }

  // ───────────── Groups ─────────────

  private invitee(id: string): { id: string; pub: string; name: string } {
    const c = this.contacts.get(id);
    if (!c || c.state !== 'accepted' || !c.publicKey) throw new Error('Only accepted contacts can be invited');
    return { id, pub: c.publicKey, name: c.name };
  }

  createGroup(name: string, memberIds: string[]): string {
    const clean = cleanName(name);
    if (!name.trim()) throw new Error('A group needs a name');
    const gid = this.groups.create(clean, memberIds.map((id) => this.invitee(id)), this.name);
    for (const id of memberIds) this.tryDial(id);
    return groupChatId(gid);
  }

  groupInvite(chatId: string, memberIds: string[]): void {
    for (const id of memberIds) {
      this.groups.invite(gidOf(chatId), this.invitee(id));
      this.tryDial(id);
    }
  }

  groupAccept(chatId: string): void {
    this.groups.accept(gidOf(chatId));
  }

  groupDecline(chatId: string): void {
    this.groups.decline(gidOf(chatId));
  }

  groupLeave(chatId: string): void {
    this.groups.leave(gidOf(chatId));
  }

  groupKick(chatId: string, memberId: string): void {
    this.groups.kick(gidOf(chatId), memberId);
  }

  groupRename(chatId: string, name: string): void {
    if (!name.trim()) throw new Error('A group needs a name');
    this.groups.rename(gidOf(chatId), name);
  }

  deleteGroup(chatId: string): void {
    this.groups.deleteLocal(gidOf(chatId));
    this.notes.delete(chatId);
  }

  sendGroupMessage(chatId: string, raw: string): { ok: boolean; error?: string } {
    try {
      this.groups.send(gidOf(chatId), raw);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private onGroupMessage(gid: string, ev: GroupEvent, state: GroupState): void {
    const chatId = groupChatId(gid);
    const preview = sanitizeText(ev.data.text ?? '').replace(/\s+/g, ' ').slice(0, 60);
    this.desktopNotify(`#${state.name}`, `${this.peerName(ev.author, state)}: ${preview}`);
    if (this.activeChat === chatId) {
      this.groups.markRead(gid);
      return;
    }
    this.showToast(`#${state.name} · ${this.peerName(ev.author, state)}: ${preview}`, 'info', chatId);
  }

  // ───────────── Desktop notifications ─────────────

  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
    if (focused && this.activeChat) this.seeChat(this.activeChat);
    this.changed();
  }

  private sendPresence(id: string): void {
    this.network.get(id)?.send({ t: 'presence', away: !this.focused });
  }

  notificationsEnabled(): boolean {
    return loadConfig(this.opts.paths)?.notifications !== false;
  }

  setNotifications(on: boolean): void {
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths)!, notifications: on });
  }

  setUpdateAvailable(version: string | null): void {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termchat ${version} is available – /update installs it`);
    else this.changed();
  }

  setEffects(mode: 'nonstop' | 'brief' | 'off'): void {
    this.effects = mode;
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths)!, effects: mode });
    this.changed();
  }

  private desktopNotify(title: string, body: string): void {
    if (this.focused || !this.notificationsEnabled()) return;
    (this.opts.notify ?? notify)(title, body);
  }

  // ───────────── Network events ─────────────

  private setState(id: string, state: ContactState): void {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }

  private sendState(id: string): void {
    const s = this.network.get(id);
    const c = this.contacts.get(id);
    s?.send({ t: 'state', name: this.name, state: relStateFor(c?.state ?? null), port: this.network.port });
  }

  private onSession(s: Session): void {
    const id = s.peerId;
    let c = this.contacts.get(id);
    if (c?.state === 'blocked') {
      s.close('Blocked', false);
      return;
    }
    this.dialStates.delete(id);

    if (s.tag === 'request') {
      // user explicitly ran /add
      if (!c) {
        c = this.contacts.upsert(id, { publicKey: '', name: s.peerName, state: 'outgoing' });
        this.note(id, 'Request sent – waiting for them to accept');
      } else if (c.state === 'incoming') {
        this.accept(id);
      } else if (c.state === 'declined') {
        this.contacts.upsert(id, { state: 'outgoing' });
      }
    }
    if (c) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString('base64url'),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now(),
      });
    }

    s.on('message', (m) => this.onWire(s, m));
    if (!c && !this.groups.sharesGroup(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.groups.sharesGroup(id)) s.close('No request received');
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    this.sendState(id);
    if (!this.focused) this.sendPresence(id);
    this.groups.onSessionUp(id);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }

  private onOffline(id: string): void {
    this.away.delete(id);
    this.groups.onSessionDown(id);
    this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }

  private onWire(s: Session, m: Wire): void {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    switch (m.t) {
      case 'state':
        return this.onState(s, m);
      case 'decline': {
        const c = this.contacts.get(id);
        if (c?.state === 'outgoing') {
          this.contacts.upsert(id, { state: 'declined' });
          this.event(id, `${displayName(c)} declined your request`, 'error');
        }
        return;
      }
      case 'msg': {
        const c = this.contacts.get(id);
        if (c?.state !== 'accepted') return;
        if (!this.history.has(id, m.id)) {
          this.history.add(id, { id: m.id, from: 'peer', text: m.text, ts: m.ts, status: 'delivered' });
          const active = this.activeChat === id;
          this.desktopNotify(displayName(c), m.text.replace(/\s+/g, ' ').slice(0, 100));
          this.contacts.upsert(id, { lastActivity: Date.now(), unread: active ? 0 : c.unread + 1 });
          if (!active) {
            const preview = m.text.replace(/\s+/g, ' ').slice(0, 60);
            this.showToast(`${displayName(c)}: ${preview}`, 'info', id);
          }
          this.changed();
        }
        s.send({ t: 'ack', ids: [m.id] });
        this.seeChat(id);
        return;
      }
      case 'presence':
        if (!this.contacts.get(id) && !this.groups.sharesGroup(id)) return;
        if (m.away === this.away.has(id)) return;
        if (m.away) this.away.add(id);
        else this.away.delete(id);
        this.changed();
        return;
      case 'ack':
        if (this.history.markDelivered(id, m.ids)) this.changed();
        return;
      case 'read':
        if (this.history.markRead(id, m.ids, 'me').length) this.changed();
        return;
      case 'gsync':
      case 'gev':
      case 'gack':
        this.groups.onWire(id, m);
        return;
    }
  }

  private onState(s: Session, m: Extract<Wire, { t: 'state' }>): void {
    const id = s.peerId;
    const c = this.contacts.get(id);
    const prev = c?.state ?? null;
    const next = reconcile(prev, m.state);

    if (this.groups.sharesGroup(id)) {
      this.peerBook.update(id, { name: m.name, lastIp: s.remoteAddress, lastPort: m.port || undefined, lastSeen: Date.now() });
    }
    if (next === null && this.groups.sharesGroup(id)) {
      // not a contact, but we share a group → keep the connection for group sync
      if (c) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c)} withdrew their request`);
      }
      this.changed();
      return;
    }
    if (next === null) {
      if (c) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c)} withdrew their request`);
      }
      s.close('Not a contact');
      this.changed();
      return;
    }

    const updated = this.contacts.upsert(id, {
      publicKey: s.peerPublicRaw.toString('base64url'),
      name: m.name,
      state: next,
      lastIp: s.remoteAddress,
      lastPort: m.port || c?.lastPort,
      lastSeen: Date.now(),
      ...(prev !== next ? { lastActivity: Date.now() } : {}),
    });
    const who = displayName(updated);

    if (next === 'accepted' && prev !== 'accepted') {
      this.event(id, prev === 'outgoing' ? `${who} accepted your request` : `You are now connected with ${who}`, 'success');
    } else if (next === 'incoming' && prev !== 'incoming') {
      this.showToast(`${who} wants to chat with you`, 'info', id);
    } else if (prev === 'accepted' && next === 'outgoing') {
      this.event(id, `${who} removed you as a contact – your request is waiting to be accepted`, 'error');
    }

    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    if (next === 'accepted') this.flushOutbox(id);
    this.changed();
  }

  private flushOutbox(id: string): void {
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== 'accepted') return;
    for (const m of this.history.pending(id)) s.send({ t: 'msg', id: m.id, ts: m.ts, text: m.text });
    // receipts for messages read while they were offline (they ignore ones they already have)
    const read = this.history.recentlyRead(id, 100);
    if (read.length) s.send({ t: 'read', ids: read });
    this.seeChat(id);
  }

  // ───────────── Auto-connect ─────────────

  private target(id: string): { ip: string; port: number; discovered: boolean } | null {
    const p = this.discovery?.peers.get(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const c = this.contacts.get(id);
    if (c?.lastIp && c.lastPort) return { ip: c.lastIp, port: c.lastPort, discovered: false };
    const known = this.peerBook.get(id);
    if (known?.lastIp && known.lastPort) return { ip: known.lastIp, port: known.lastPort, discovered: false };
    return null;
  }

  /** Where contacts and group members were last seen – discovery asks there directly. */
  private lastKnownIps(): string[] {
    const ips = new Set<string>();
    for (const c of this.contacts.all()) if (c.lastIp && c.state !== 'blocked') ips.add(c.lastIp);
    for (const id of this.groups.peers()) {
      const ip = this.peerBook.get(id)?.lastIp;
      if (ip) ips.add(ip);
    }
    return [...ips];
  }

  private dialLoop(): void {
    for (const c of this.contacts.all()) {
      if (c.state === 'accepted' || c.state === 'outgoing') this.tryDial(c.id);
    }
    for (const id of this.groups.peers()) this.tryDial(id);
  }

  private tryDial(id: string): void {
    if (this.network.isOnline(id)) return;
    const c = this.contacts.get(id);
    const wanted = c?.state === 'accepted' || c?.state === 'outgoing';
    if (!wanted && (c?.state === 'blocked' || !this.groups.sharesGroup(id))) return;
    const t = this.target(id);
    if (!t) return;

    const now = Date.now();
    const ds = this.dialStates.get(id) ?? { inFlight: false, next: 0, backoff: 1000 };
    this.dialStates.set(id, ds);
    if (ds.inFlight || now < ds.next) return;

    // If both see each other via discovery, only the smaller ID dials right away – this
    // avoids duplicate connections. The larger one steps in if nothing happened after 4 s.
    if (t.discovered && c?.state !== 'outgoing' && this.identity.id > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4000) return;
    }

    ds.inFlight = true;
    this.network
      .dial(t.ip, t.port, id)
      .then(() => {
        this.dialStates.delete(id);
      })
      .catch((err: Error) => {
        this.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
        ds.backoff = Math.min(ds.backoff * 2, MAX_BACKOFF);
        ds.next = Date.now() + ds.backoff;
      })
      .finally(() => {
        ds.inFlight = false;
      });
  }
}
