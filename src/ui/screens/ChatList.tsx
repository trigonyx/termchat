import { Box, Text, useInput } from 'ink';
import { useRef, useState } from 'react';
import { registry } from '../../commands/builtin.js';
import type { DiscoveredPeer } from '../../core/discovery.js';
import type { AppStore, ChatEntry } from '../../core/store.js';
import type { Actions } from '../actions.js';
import { CommandMenu, menuHeight } from '../components/CommandMenu.js';
import { Dialog, dialogHeight, type DialogSpec } from '../components/Dialog.js';
import { Footer } from '../components/Footer.js';
import { InputBox, inputBoxHeight } from '../components/InputBox.js';
import { cleanPaste, edit, emptyEditor, type EditorState } from '../editor.js';
import { shortTime } from '../format.js';
import { plainPreview } from '../markdown.js';
import { useWheel } from '../mouse.js';
import { icons, theme } from '../theme.js';
import { useCommandInput } from './useCommandInput.js';

type Entry =
  | { type: 'request'; key: string; chat: ChatEntry }
  | { type: 'chat'; key: string; chat: ChatEntry }
  | { type: 'nearby'; key: string; peer: DiscoveredPeer };

type Line = { kind: 'section'; title: string } | { kind: 'gap' } | { kind: 'entry'; entry: Entry; index: number };

interface Props {
  store: AppStore;
  width: number;
  height: number;
  actions: Actions;
  dialog: DialogSpec | null;
  selectedKey: string | null;
  onSelect(key: string | null): void;
  history: string[];
}

function previewOf(c: ChatEntry, store: AppStore): { text: string; dim: boolean } {
  if (c.kind === 'group') {
    if (c.myStatus === 'invited') {
      const by = c.invitedBy ? store.peerName(c.invitedBy) : 'Someone';
      return { text: `${by} invited you · ${c.members.length} members`, dim: false };
    }
    if (c.myStatus === 'left') return { text: 'You left this group', dim: true };
    if (c.myStatus === 'removed') return { text: 'You were removed from this group', dim: true };
    if (!c.last) return { text: 'No messages yet', dim: true };
    return { text: `${c.last.mine ? 'You' : c.last.sender}: ${plainPreview(c.last.text)}`, dim: c.unread === 0 };
  }
  switch (c.state) {
    case 'outgoing':
      return { text: 'Request sent – waiting for them to accept', dim: true };
    case 'declined':
      return { text: 'declined your request', dim: true };
    case 'blocked':
      return { text: 'blocked', dim: true };
    case 'incoming':
      return { text: 'wants to chat with you', dim: false };
  }
  if (!c.last) return { text: 'No messages yet', dim: true };
  return { text: (c.last.from === 'me' ? 'You: ' : '') + plainPreview(c.last.text), dim: c.unread === 0 };
}

export function ChatList({ store, width, height, actions, dialog, selectedKey, onSelect, history }: Props) {
  const data = store.chatList();
  const entries: Entry[] = [
    ...data.requests.map((c): Entry => ({ type: 'request', key: `c:${c.id}`, chat: c })),
    ...data.chats.map((c): Entry => ({ type: 'chat', key: `c:${c.id}`, chat: c })),
    ...data.nearby.map((p): Entry => ({ type: 'nearby', key: `n:${p.id}`, peer: p })),
  ];
  let selected = entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = entries[selected];

  const [commandMode, setCommandMode] = useState(false);
  // set synchronously so characters typed right after "/" are not lost
  const commandRef = useRef(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
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
    onEscape: closeCommand,
  });

  /** Runs an action and turns errors into a toast instead of crashing. */
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    if (e.type === 'request') {
      const chat = e.chat;
      attempt(() => (chat.kind === 'group' ? store.groupAccept(chat.id) : store.accept(chat.id)));
      actions.openChat(chat.id);
    } else if (e.type === 'chat') {
      actions.openChat(e.chat.id);
    } else {
      try {
        store.requestNearby(e.peer.id);
        actions.openChat(e.peer.id);
      } catch (err) {
        store.showToast((err as Error).message, 'error');
      }
    }
  };

  useWheel((dir) => {
    if (!entries.length) return;
    onSelect(entries[Math.max(0, Math.min(entries.length - 1, selected + dir))]!.key);
  }, !dialog && !commandMode);

  useInput(
    (input, key) => {
      if (commandRef.current) {
        // input isn't active yet – forward characters to it
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      const move = (d: number) => {
        if (!entries.length) return;
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        onSelect(entries[next]!.key);
      };
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input.startsWith('/')) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === '?') return void actions.runCommand('/help', null);
      if (input === 'q') return actions.quit();
      if (input === 'a') {
        void actions
          .prompt('Add contact by IP', { hint: 'e.g. 192.168.1.20 or 192.168.1.20:5050' })
          .then((v) => {
            if (v) void actions.runCommand(`/add ${v}`, null);
          });
        return;
      }
      if (input === 'g') {
        void actions.prompt('New group', { hint: 'Name of the group – you pick the members next' }).then((v) => {
          if (v) void actions.runCommand(`/group ${v}`, null);
        });
        return;
      }
      if (input === 'x' && current?.type === 'request') {
        const chat = current.chat;
        attempt(() => (chat.kind === 'group' ? store.groupDecline(chat.id) : store.decline(chat.id)));
        return;
      }
      if (input === 'r' && current && current.type !== 'nearby') {
        const chat = current.chat;
        if (chat.kind === 'group') {
          if (chat.myStatus !== 'member') return;
          void actions.prompt(`Rename #${chat.display}`, { initial: chat.display }).then((v) => {
            if (v) attempt(() => store.groupRename(chat.id, v));
          });
          return;
        }
        void actions
          .prompt(`Nickname for ${chat.name}`, { hint: "Leave empty to use the person's own name", initial: chat.alias })
          .then((v) => {
            if (v !== null) store.rename(chat.id, v);
          });
        return;
      }
      if (input === 'd' && current && current.type !== 'nearby') {
        const chat = current.chat;
        if (chat.kind === 'group') {
          const active = chat.myStatus === 'member' || chat.myStatus === 'invited';
          void actions
            .confirm(active ? `Leave #${chat.display}?` : `Delete #${chat.display} from this device?`)
            .then((ok) => {
              if (!ok) return;
              attempt(() =>
                active
                  ? chat.myStatus === 'invited'
                    ? store.groupDecline(chat.id)
                    : store.groupLeave(chat.id)
                  : store.deleteGroup(chat.id),
              );
            });
          return;
        }
        void actions
          .confirm(`Remove ${chat.display} as a contact and delete the history?`)
          .then((ok) => ok && store.removeContact(chat.id));
      }
    },
    { isActive: !dialog && !commandMode },
  );

  // ── Layout ──
  const inner = width - 2;
  const bottom = dialog
    ? dialogHeight(dialog)
    : commandMode
      ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length)
      : 0;
  const bodyHeight = Math.max(3, height - bottom - 1);

  const lines: Line[] = [];
  const section = (title: string, list: Entry[], showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: 'gap' });
    lines.push({ kind: 'section', title });
    for (const e of list) lines.push({ kind: 'entry', entry: e, index: entries.indexOf(e) });
  };
  section(`Requests · ${data.requests.length}`, entries.filter((e) => e.type === 'request'));
  section('Chats', entries.filter((e) => e.type === 'chat'));
  const scanning = store.me.scanning;
  section(scanning ? 'Nearby · searching the network …' : 'Nearby', entries.filter((e) => e.type === 'nearby'), scanning);

  const selLine = lines.findIndex((l) => l.kind === 'entry' && l.index === selected);
  const start = Math.max(0, Math.min(selLine - Math.floor(bodyHeight / 2), lines.length - bodyHeight));
  const visible = lines.slice(start, start + bodyHeight);

  const hints = (() => {
    if (!current) return ['a add by IP', 'g new group', '/ commands', '? help', 'q quit'];
    const base = ['↑↓ select'];
    if (current.type === 'request') base.push('enter accept', 'x decline');
    else if (current.type === 'nearby') base.push('enter send request');
    else if (current.chat.kind === 'group') {
      const active = current.chat.myStatus === 'member';
      base.push('enter open', ...(active ? ['r rename'] : []), active ? 'd leave' : 'd delete');
    } else base.push('enter open', 'r rename', 'd remove');
    return [...base, 'g new group', 'a add by IP', '/ commands', 'q quit'];
  })();

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" height={bodyHeight} paddingX={1} overflow="hidden">
        {entries.length === 0 ? (
          <EmptyState store={store} />
        ) : (
          visible.map((l, i) => {
            if (l.kind === 'gap') return <Text key={i}> </Text>;
            if (l.kind === 'section') {
              return (
                <Text key={i} color={theme.dim} bold>
                  {l.title.toUpperCase()}
                </Text>
              );
            }
            return <Row key={l.entry.key} entry={l.entry} selected={l.index === selected} width={inner} store={store} />;
          })
        )}
      </Box>
      {dialog ? (
        <Dialog spec={dialog} width={width} />
      ) : commandMode ? (
        <>
          <InputBox
            state={editor}
            onChange={setEditor}
            onSubmit={cmd.submit}
            onKey={cmd.onKey}
            isActive
            width={width}
            history={history}
            borderColor={theme.accent}
            singleLine
          />
          <CommandMenu items={cmd.items} selected={cmd.selected} width={width} />
        </>
      ) : null}
      <Footer hints={commandMode ? ['enter run', 'tab complete', 'esc cancel'] : hints} toast={store.toast} width={width} />
    </Box>
  );
}

function Row({ entry, selected, width, store }: { entry: Entry; selected: boolean; width: number; store: AppStore }) {
  const pointer = (
    <Box width={2} flexShrink={0}>
      <Text color={theme.accent}>{selected ? icons.pointer : ' '}</Text>
    </Box>
  );
  const nameWidth = Math.min(22, Math.max(10, Math.floor(width * 0.25)));

  if (entry.type === 'nearby') {
    const p = entry.peer;
    return (
      <Box>
        {pointer}
        <Box width={2} flexShrink={0}>
          <Text color={theme.success}>{icons.online}</Text>
        </Box>
        <Box width={nameWidth} flexShrink={0}>
          <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
            {p.name}
          </Text>
        </Box>
        <Text color={theme.dim} wrap="truncate-end">
          on your network · {p.ip}
        </Text>
      </Box>
    );
  }

  const c = entry.chat;
  const isRequest = entry.type === 'request';
  const isGroup = c.kind === 'group';
  const preview = previewOf(c, store);
  const inactive = isGroup ? c.myStatus !== 'member' && c.myStatus !== 'invited' : c.state !== 'accepted';
  const dot = (
    <Box width={2} flexShrink={0}>
      {isRequest ? (
        <Text color={theme.accent}>{icons.request}</Text>
      ) : isGroup ? (
        <Text color={inactive ? theme.faint : theme.accent} bold>
          {icons.group}
        </Text>
      ) : (
        <Text color={c.inactive ? theme.warning : c.online ? theme.success : theme.faint}>
          {c.inactive ? icons.away : c.online ? icons.online : icons.offline}
        </Text>
      )}
    </Box>
  );
  const time = c.last ? shortTime(c.last.ts) : '';
  return (
    <Box>
      {pointer}
      {dot}
      <Box width={nameWidth} flexShrink={0}>
        <Text bold={selected || c.unread > 0} color={selected ? theme.accent : undefined} wrap="truncate-end">
          {c.display}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={preview.dim ? theme.dim : undefined} italic={inactive && !isRequest} wrap="truncate-end">
          {preview.text}
        </Text>
      </Box>
      <Box width={9} flexShrink={0} justifyContent="flex-end">
        <Text color={theme.faint}>{time}</Text>
      </Box>
      <Box width={5} flexShrink={0} justifyContent="flex-end">
        {c.unread > 0 ? (
          <Text backgroundColor={theme.accent} color="#1E1E1E" bold>
            {` ${c.unread > 99 ? '99+' : c.unread} `}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

function EmptyState({ store }: { store: AppStore }) {
  const me = store.me;
  return (
    <Box flexDirection="column" paddingTop={1} paddingX={1}>
      <Text bold>No chats yet</Text>
      <Text> </Text>
      <Text color={theme.dim}>Other termchat users on the same network show up here automatically</Text>
      <Text color={theme.dim}>under "Nearby". Press enter to send them a chat request.</Text>
      {me.scanning ? <Text color={theme.accent}>Searching the network …</Text> : null}
      <Text color={theme.dim}>
        Once you have contacts, press <Text color={theme.accent}>g</Text> to start a group chat.
      </Text>
      <Text> </Text>
      <Text color={theme.dim}>
        Someone not showing up? Press <Text color={theme.accent}>a</Text> and enter their IP.
      </Text>
      <Text color={theme.dim}>
        Your address for others:{' '}
        <Text color={theme.accent}>{me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(', ') : 'no network'}</Text>
      </Text>
    </Box>
  );
}
