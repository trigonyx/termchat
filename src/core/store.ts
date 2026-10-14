import crypto from 'node:crypto';
import { MAX_TEXT, sanitizeText } from 'termcore/app/sanitize';
import { Toasts, type NoteKind, type Toast as BaseToast } from 'termcore/app/toasts';
import { displayName, type ContactOf } from 'termcore/friends/book';
import { appendLog, FriendNet, type FriendEvent, type Msg } from 'termcore/friends/net';
import type { Status } from 'termcore/friends/profile';
import type { DiscoveredPeer, DiscoveryOptions } from 'termcore/net/discovery';
import type { Session } from 'termcore/net/peer';
import type { Animations, Settings } from 'termcore/store/files';
import { Hub } from 'termcore/store/hub';
import { setAccent, setPersonColors } from 'termcore/ui/theme';
import { APP } from '../app.js';
import { readConfig } from './config.js';
import type { GroupEvent, GroupState } from './groupEvents.js';
import { GroupManager, type MyGroupStatus } from './groups.js';
import { HistoryStore, type ChatMessage } from './history.js';
import type { Paths } from './paths.js';
import { WIRE, type ChatWire } from './protocol.js';

export type { NoteKind };

/** termchat's own fields on a contact (in friends.json under `apps.termchat`). */
export interface TermchatFields {
  /** messages not read yet */
  unread?: number;
}

export type Contact = ContactOf<TermchatFields>;

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

export interface Note {
  id: string;
  ts: number;
  text: string;
  kind: NoteKind;
}

/** A toast may belong to a chat (enter opens it). */
export type Toast = BaseToast<{ chatId: string }>;

export interface ContactView extends Contact {
  kind: 'direct';
  display: string;
  online: boolean;
  /** connected, but their terminal is in the background */
  inactive: boolean;
  unread: number;
  /** their status (only while connected) */
  status: Status;
  statusMsg?: string;
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
  /** other members online with termchat in front */
  onlineCount: number;
  /** other members online, but with termchat in the background */
  inactiveCount: number;
  invitedBy?: string;
  unread: number;
  lastActivity: number;
  last?: { text: string; ts: number; mine: boolean; sender: string };
}

export type ChatEntry = ContactView | GroupView;

export interface ChatListData {
  requests: ChatEntry[];
  /** chats and groups with unread messages (not repeated below) */
  unread: ChatEntry[];
  /** 1:1 chats */
  chats: ChatEntry[];
  groups: ChatEntry[];
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

/**
 * Central app logic: contacts and presence (termcore's FriendNet on the shared ~/.termhub),
 * chat histories and groups. Exposes a subscribable state to the UI and also runs without a
 * UI (tests).
 */
export class AppStore {
  readonly net: FriendNet<ChatWire, TermchatFields>;
  readonly hub: Hub;
  readonly history: HistoryStore;
  readonly groups: GroupManager;
  readonly paths: Paths;
  private readonly toasts: Toasts<{ chatId: string }>;
  private notes = new Map<string, Note[]>();
  private viewCutoffs = new Map<string, number>();
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private activeChat: string | null = null;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable: string | null = null;

  constructor(private readonly opts: StoreOptions) {
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.history = new HistoryStore(opts.paths);
    this.toasts = new Toasts<{ chatId: string }>(() => this.changed());
    this.net = new FriendNet<ChatWire, TermchatFields>({
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
          // group members who aren't contacts: remember how to reach them
          if (this.groups.sharesGroup(s.peerId)) {
            this.net.peerBook.update(s.peerId, { name: m.name, lastIp: s.remoteAddress, lastPort: m.port || undefined, lastSeen: Date.now() });
          }
        },
        stateChanged: (id, _prev, next) => {
          if (next === 'accepted') this.flushOutbox(id);
        },
        // not a contact, but we share a group → keep the connection for group sync
        keepUnknown: (id) => this.groups.sharesGroup(id),
        extraDialIds: () => this.groups.peers(),
        alsoWants: (id) => this.groups.sharesGroup(id),
        extraHints: () => [...this.groups.peers()].map((id) => this.net.peerBook.get(id)?.lastIp).filter((ip): ip is string => !!ip),
        knowsId: (id) => this.history.hasChat(id),
        rekey: (oldId, newId) => this.history.rekey(oldId, newId),
        settings: (s) => this.applySettings(s),
      },
    });
    this.applySettings(this.hub.settings.get());
    // names in friends' profile colors wherever the UI colors people (group senders …)
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.groups = new GroupManager(opts.paths, this.identity, {
      send: (id, msg) => this.net.send(id, msg),
      connectedPeers: () => [...this.network.sessions.keys()],
      isAcceptedContact: (id) => this.contacts.get(id)?.state === 'accepted',
      changed: () => this.changed(),
      onMessage: (gid, ev, state) => this.onGroupMessage(gid, ev, state),
      onInvited: (gid, state, by) => {
        if (!this.net.dnd) this.showToast(`${this.peerName(by, state)} invited you to #${state.name}`, 'info', groupChatId(gid));
      },
    });
  }

  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths: Paths, name: string): string {
    return Hub.createProfile(paths.hub, name).id;
  }

  /** Is there a profile yet (in any app)? */
  static hasProfile(paths: Paths): boolean {
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

  async start(): Promise<void> {
    await this.net.start();
    this.changed();
  }

  async stop(): Promise<void> {
    this.toasts.stop();
    await this.net.stop();
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

  private applySettings(s: Settings): void {
    if (setAccent(s.accent)) this.changed();
  }

  // ───────────── Queries ─────────────

  get me() {
    return this.net.me;
  }

  get toast(): Toast | null {
    return this.toasts.current;
  }

  get settings(): Settings {
    return this.net.settings;
  }

  /** /effects – how <rgb>/<shine> (and the logo) animate; shared by all apps. */
  get effects(): Animations {
    return this.net.animations;
  }

  isOnline(id: string): boolean {
    return this.net.isOnline(id);
  }

  private away(id: string): boolean {
    return this.net.presenceOf(id)?.away ?? false;
  }

  contact(id: string): ContactView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    const online = this.isOnline(id);
    const p = this.net.presenceOf(id);
    return {
      ...c,
      kind: 'direct',
      display: displayName(c),
      online,
      inactive: online && (p?.away ?? false),
      unread: c.unread ?? 0,
      status: p?.status ?? 'available',
      ...(p?.msg ? { statusMsg: p.msg } : {}),
      last: this.history.last(id),
    };
  }

  /** Best name for any peer: own nickname/contact name, else what the group says. */
  peerName(id: string, state?: GroupState): string {
    if (id === this.identity.id) return this.net.name;
    const c = this.contacts.get(id);
    if (c) return displayName(c);
    return state?.names.get(id) ?? this.net.peerBook.get(id)?.name ?? 'Unknown';
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
        inactive: m.id === this.identity.id ? !this.net.isFocused : this.isOnline(m.id) && this.away(m.id),
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
      onlineCount: members.filter((m) => m.online && !m.inactive && !m.isMe && m.status === 'member').length,
      inactiveCount: members.filter((m) => m.online && m.inactive && !m.isMe && m.status === 'member').length,
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
    const isRequest = (e: ChatEntry) => (e.kind === 'direct' ? e.state === 'incoming' : e.myStatus === 'invited');
    const rank = (e: ChatEntry) => (e.kind === 'direct' && e.state === 'blocked' ? 1 : 0);
    const rest = all.filter((e) => !isRequest(e));
    const isUnread = (e: ChatEntry) => e.unread > 0;
    return {
      requests: all.filter(isRequest),
      unread: rest.filter(isUnread),
      chats: rest.filter((e) => e.kind === 'direct' && !isUnread(e)).sort((a, b) => rank(a) - rank(b)),
      groups: rest.filter((e) => e.kind === 'group' && !isUnread(e)),
      nearby: this.net.nearby(),
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
    return this.net.safetyCodeWith(id);
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
    if (isGroupChat(id) || this.activeChat !== id || !this.net.isFocused) return;
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
    if (c && (c.unread ?? 0) > 0) {
      this.contacts.upsert(id, { unread: undefined });
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
    this.toasts.show(text, kind, chatId ? { chatId } : undefined);
  }

  /** Note in the chat if it's open – otherwise as a toast. */
  private event(chatId: string, text: string, kind: NoteKind = 'info'): void {
    this.note(chatId, text, kind);
    if (this.activeChat !== chatId) this.showToast(text, kind, chatId);
  }

  private log(line: string): void {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }

  private onEvent(e: FriendEvent): void {
    switch (e.kind) {
      case 'accepted':
        return this.event(e.id, e.byThem ? `${e.who} accepted your request` : `You are now connected with ${e.who}`, 'success');
      case 'incoming':
        return this.showToast(`${e.who} wants to chat with you`, 'info', e.id);
      case 'removedUs':
        return this.event(e.id, `${e.who} removed you as a contact – your request is waiting to be accepted`, 'error');
      case 'declinedUs':
        return this.event(e.id, `${e.who} declined your request`, 'error');
      case 'withdrawn':
        return this.showToast(`${e.who} withdrew their request`);
      case 'requestSent':
        return this.note(e.id, 'Request sent – waiting for them to accept');
      case 'unreachable':
        return this.note(
          e.id,
          `Can't reach ${md(e.who)} at ${e.ip}:${e.port} yet (${md(e.error)}) – still trying. ` +
            'If this stays, a firewall is probably blocking termchat on one of your computers: ' +
            'on Windows, allow Node.js for public networks; on macOS, allow incoming connections for node.',
          'error',
        );
      case 'linked':
        // notes and the open chat follow the contact to the new id
        for (const map of [this.notes, this.viewCutoffs] as Map<string, unknown>[]) {
          if (map.has(e.oldId) && !map.has(e.id)) map.set(e.id, map.get(e.oldId));
          map.delete(e.oldId);
        }
        if (this.activeChat === e.oldId) this.activeChat = e.id;
        return;
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
    else this.net.tryDial(id);
    this.changed();
    return { ok: true };
  }

  /** Request to a peer from "Nearby". */
  requestNearby(id: string): void {
    const r = this.net.requestNearby(id);
    if (r === 'sent') this.note(id, 'Sending request …');
    else if (r === 'accepted') this.note(id, `You accepted ${this.peerName(id)}'s request`, 'success');
  }

  /** Ask again (after a decline). */
  request(id: string): void {
    this.net.request(id);
    this.note(id, 'Request sent again');
  }

  /** Add a contact by IP – for networks that block broadcast. */
  addByAddress(host: string, port = APP.tcpPort): Promise<string> {
    return this.net.addByAddress(host, port);
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (!c || !this.net.accept(id)) return;
    this.note(id, `You accepted ${displayName(c)}'s request`, 'success');
    this.flushOutbox(id);
  }

  decline(id: string): void {
    const c = this.net.decline(id);
    if (c) this.showToast(`Declined ${displayName(c)}'s request`);
  }

  block(id: string): void {
    if (this.net.block(id)) this.note(id, 'Contact blocked. No more connections will be accepted.', 'error');
  }

  unblock(id: string): void {
    if (this.net.unblock(id)) this.note(id, 'Unblocked – request sent', 'success');
  }

  /** Remove contact + history. */
  removeContact(id: string): void {
    this.history.delete(id);
    this.notes.delete(id);
    this.net.remove(id);
  }

  rename(id: string, alias: string): void {
    this.net.rename(id, alias);
  }

  /** Changes the shared name (all apps). */
  setName(name: string): string {
    return this.net.setName(name);
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
    if (!name.trim()) throw new Error('A group needs a name');
    const gid = this.groups.create(name, memberIds.map((id) => this.invitee(id)), this.net.name);
    for (const id of memberIds) this.net.tryDial(id);
    return groupChatId(gid);
  }

  groupInvite(chatId: string, memberIds: string[]): void {
    for (const id of memberIds) {
      this.groups.invite(gidOf(chatId), this.invitee(id));
      this.net.tryDial(id);
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
    this.net.notify(`#${state.name}`, `${this.peerName(ev.author, state)}: ${preview}`);
    if (this.activeChat === chatId) {
      this.groups.markRead(gid);
      return;
    }
    // do not disturb: it arrives (unread), but quietly
    if (!this.net.dnd) this.showToast(`#${state.name} · ${this.peerName(ev.author, state)}: ${preview}`, 'info', chatId);
  }

  // ───────────── Presence and notifications ─────────────

  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused: boolean): void {
    this.net.setFocused(focused);
    if (focused && this.activeChat) this.seeChat(this.activeChat);
  }

  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused(): boolean {
    return this.net.isFocused;
  }

  /** Do not disturb (profile status): messages arrive quietly, no notifications. */
  get dnd(): boolean {
    return this.net.dnd;
  }

  notificationsEnabled(): boolean {
    return this.net.notificationsEnabled();
  }

  setNotifications(on: boolean): void {
    this.net.setNotifications(on);
  }

  setUpdateAvailable(version: string | null): void {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termchat ${version} is available – /update installs it`);
    else this.changed();
  }

  /** /effects: shared by all apps (settings.json → animations). */
  setEffects(mode: Animations): void {
    this.net.setAnimations(mode);
    this.changed();
  }

  // ───────────── Network events ─────────────

  private onMessage(s: Session<Msg<ChatWire>>, m: ChatWire): void {
    const id = s.peerId;
    switch (m.t) {
      case 'msg': {
        const c = this.contacts.get(id);
        if (c?.state !== 'accepted') return;
        if (!this.history.has(id, m.id)) {
          this.history.add(id, { id: m.id, from: 'peer', text: m.text, ts: m.ts, status: 'delivered' });
          const active = this.activeChat === id;
          this.net.notify(displayName(c), m.text.replace(/\s+/g, ' ').slice(0, 100));
          this.contacts.mutate(id, (cur) => ({ lastActivity: Date.now(), unread: active ? undefined : (cur?.unread ?? 0) + 1 }));
          // do not disturb: it arrives (unread), but quietly
          if (!active && !this.net.dnd) {
            const preview = m.text.replace(/\s+/g, ' ').slice(0, 60);
            this.showToast(`${displayName(c)}: ${preview}`, 'info', id);
          }
          this.changed();
        }
        s.send({ t: 'ack', ids: [m.id] });
        this.seeChat(id);
        return;
      }
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

  private flushOutbox(id: string): void {
    const s = this.network.get(id);
    if (!s || this.contacts.get(id)?.state !== 'accepted') return;
    for (const m of this.history.pending(id)) s.send({ t: 'msg', id: m.id, ts: m.ts, text: m.text });
    // receipts for messages read while they were offline (they ignore ones they already have)
    const read = this.history.recentlyRead(id, 100);
    if (read.length) s.send({ t: 'read', ids: read });
    this.seeChat(id);
  }
}
