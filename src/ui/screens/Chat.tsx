import { Box, Text } from 'ink';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatId } from 'termcore/net/identity';
import type { AppStore, ChatEntry, ContactView, GroupView } from '../../core/store.js';
import type { Actions } from '../actions.js';
import { CommandMenu, menuHeight } from 'termcore/ui/components/CommandMenu';
import { Dialog, dialogHeight, type DialogSpec } from 'termcore/ui/components/Dialog';
import { Footer } from 'termcore/ui/components/Footer';
import { InputBox, inputBoxHeight } from 'termcore/ui/components/InputBox';
import { buildChatLines, MessageList } from '../components/MessageList.js';
import { edit } from 'termcore/ui/editor';
import type { EditorState } from 'termcore/ui/editor';
import { lastSeen } from 'termcore/ui/format';
import { elsewhereDot, elsewhereText, presenceDot, statusText } from 'termcore/ui/presence';
import { c, icons, personHex, theme } from 'termcore/ui/theme';
import { autoCloseTag } from '../effects.js';
import { useCommandInput } from './useCommandInput.js';

interface Props {
  store: AppStore;
  id: string;
  width: number;
  height: number;
  actions: Actions;
  dialog: DialogSpec | null;
  editor: EditorState;
  setEditor(s: EditorState): void;
  history: string[];
  pushHistory(entry: string): void;
  version: number;
  onCycle(dir: 1 | -1): void;
}

function directBanner(contact: ContactView): string | null {
  const name = contact.display;
  switch (contact.state) {
    case 'incoming':
      return `${c.accent(icons.request)} ${c.bold(name)} wants to chat with you ${c.dim('· /accept to accept · /decline to decline')}`;
    case 'outgoing':
      return `${c.dim(icons.pending)} ${c.dim(`Request sent – messages will be delivered once ${name} accepts`)}`;
    case 'declined':
      return `${c.error(icons.error)} ${name} declined your request ${c.dim('· /request to ask again')}`;
    case 'blocked':
      return `${c.error(icons.error)} Blocked ${c.dim('· /unblock to undo')}`;
    default:
      return null;
  }
}

function groupBanner(store: AppStore, g: GroupView): string | null {
  switch (g.myStatus) {
    case 'invited': {
      const by = g.invitedBy ? store.peerName(g.invitedBy) : 'Someone';
      return `${c.accent(icons.request)} ${c.bold(by)} invited you to ${c.bold(`#${g.display}`)} ${c.dim('· /accept to join · /decline')}`;
    }
    case 'left':
      return `${c.dim(icons.info)} ${c.dim('You left this group · /delete removes it from this device')}`;
    case 'removed':
      return `${c.error(icons.error)} You were removed from this group ${c.dim('· /delete removes it from this device')}`;
    default:
      return null;
  }
}

function Header({ chat, width }: { chat: ChatEntry; width: number }) {
  let left: ReactNode;
  let right: string | null = null;
  if (chat.kind === 'group') {
    const members = chat.members.filter((m) => m.status === 'member').length;
    left = (
      <>
        <Text color={theme.accent} bold>
          {icons.group}
        </Text>
        <Text bold>{chat.display}</Text>
        <Text color={theme.faint}> · </Text>
        <Text color={theme.dim}>{members === 1 ? '1 member' : `${members} members`}</Text>
        {chat.myStatus === 'member' ? (
          <>
            <Text color={theme.faint}> · </Text>
            <Text color={chat.onlineCount ? theme.success : theme.dim}>{chat.onlineCount} online</Text>
            <Text color={theme.faint}> · </Text>
            <Text color={chat.inactiveCount ? theme.warning : theme.dim}>{chat.inactiveCount} inactive</Text>
          </>
        ) : null}
      </>
    );
  } else {
    const dot = !chat.online && chat.elsewhere.length ? elsewhereDot() : presenceDot({ online: chat.online, away: chat.inactive, status: chat.status });
    left = (
      <>
        <Text color={dot.color}>{dot.icon} </Text>
        <Text bold color={chat.state === 'accepted' ? personHex(chat.id, chat.color) : undefined}>
          {chat.display}
        </Text>
        {chat.alias ? <Text color={theme.dim}> ({chat.name})</Text> : null}
        <Text color={theme.faint}> · </Text>
        {chat.online && chat.status !== 'available' ? (
          <Text color={dot.color}>{statusText(chat.status, chat.statusMsg)}</Text>
        ) : chat.inactive ? (
          <Text color={theme.warning}>inactive</Text>
        ) : chat.online ? (
          <Text color={theme.success}>online</Text>
        ) : chat.elsewhere.length ? (
          <Text color={theme.dim}>{elsewhereText(chat.elsewhere)} – messages reach them there</Text>
        ) : (
          <Text color={theme.dim}>{lastSeen(chat.lastSeen)}</Text>
        )}
        {chat.online && chat.status === 'available' && chat.statusMsg ? <Text color={theme.dim}> · {chat.statusMsg}</Text> : null}
      </>
    );
    right = formatId(chat.id);
  }
  return (
    <Box paddingX={1} width={width}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color={theme.faint}>‹ esc </Text>
          {left}
        </Text>
      </Box>
      {right && width >= 60 ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.faint}>{right}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** Typing "<rgb>" / "<shine …>" completes the closing tag behind the cursor (not for pastes). */
function completeTag(next: EditorState, input: string): EditorState {
  const closing = input === '>' ? autoCloseTag(next.value, next.cursor) : null;
  return closing ? { value: next.value.slice(0, next.cursor) + closing + next.value.slice(next.cursor), cursor: next.cursor } : next;
}

export function Chat({ store, id, width, height, actions, dialog, editor, setEditor, history, pushHistory, version, onCycle }: Props) {
  const chat = store.chat(id);
  const isGroup = chat?.kind === 'group';
  const [offset, setOffset] = useState(0);
  const prevTotal = useRef(0);

  const send = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    pushHistory(raw);
    setEditor({ value: '', cursor: 0 });
    if (value.startsWith('/') && !value.startsWith('//')) {
      await actions.runCommand(value, id);
      return;
    }
    const text = value.startsWith('//') ? value.slice(1) : raw;
    const res = isGroup ? store.sendGroupMessage(id, text) : store.sendMessage(id, text);
    if (!res.ok) {
      if (res.error) store.note(id, res.error, 'error');
      setEditor({ value: raw, cursor: raw.length });
      return;
    }
    setOffset(0);
  };

  const cmd = useCommandInput({
    editor,
    setEditor,
    kind: isGroup ? 'group' : 'direct',
    tags: true,
    onSubmit: (v) => void send(v),
    onEscape: () => {
      if (editor.value.startsWith('/')) setEditor({ value: '', cursor: 0 });
      else actions.goHome();
    },
  });

  // ── Layout ──
  const listWidth = width - 2;
  const lines = useMemo(
    () =>
      chat
        ? buildChatLines({
            items: store.items(id),
            notes: store.notesFor(id),
            width: listWidth,
            colorful: isGroup,
            cutoff: store.viewCutoff(id),
          })
        : [],
    // version: any store change (new message, delivery status, …)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, listWidth],
  );

  // while reading older messages, keep the view in place instead of jumping away
  useEffect(() => {
    const delta = lines.length - prevTotal.current;
    if (offset > 0 && delta > 0) setOffset((o) => o + delta);
    prevTotal.current = lines.length;
  }, [lines.length]);

  if (!chat) {
    return (
      <Box flexDirection="column" height={height} paddingX={1}>
        <Text color={theme.dim}>This chat no longer exists. esc → back</Text>
      </Box>
    );
  }

  const bannerText = chat.kind === 'group' ? groupBanner(store, chat) : directBanner(chat);
  const bottom = dialog
    ? dialogHeight(dialog)
    : inputBoxHeight(editor, width) + menuHeight(cmd.items.length);
  const listHeight = Math.max(3, height - 2 - (bannerText ? 1 : 0) - bottom - 1);
  const maxOffset = Math.max(0, lines.length - listHeight);
  const scroll = (d: number) => setOffset((o) => Math.max(0, Math.min(maxOffset, o + d)));

  const onKey: typeof cmd.onKey = (input, key) => {
    if (key.pageUp) {
      scroll(listHeight - 2);
      return true;
    }
    if (key.pageDown) {
      scroll(-(listHeight - 2));
      return true;
    }
    // wheel / trackpad arrive as ↑/↓ (alternate scroll mode); alt+↑/↓ stays input history
    if ((key.upArrow || key.downArrow) && !key.meta && !cmd.items.length) {
      const dir = key.upArrow ? -1 : 1;
      if (!edit.vertical(editor, dir)) {
        scroll(-dir * 2);
        return true;
      }
    }
    if (key.ctrl && (input === 'n' || input === 'p')) {
      onCycle(input === 'n' ? 1 : -1);
      return true;
    }
    return cmd.onKey(input, key);
  };

  const emptyHint =
    chat.kind === 'group'
      ? chat.myStatus === 'invited'
        ? 'Accept the invite to see new messages.'
        : 'End-to-end encrypted · /members shows who is here · /invite adds people · /help for all commands'
      : 'End-to-end encrypted · /whois shows the safety code · /help for all commands';
  const shownLines = lines.length ? lines : [c.dim('No messages yet.'), c.faint(emptyHint)];

  const placeholder =
    chat.kind === 'group'
      ? chat.myStatus === 'invited'
        ? '/accept to join'
        : `Message #${chat.display} …  (/ for commands)`
      : chat.state === 'incoming'
        ? '/accept to accept'
        : `Message ${chat.display} …  (/ for commands)`;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header chat={chat} width={width} />
      <Text color={theme.faint}>{'─'.repeat(width)}</Text>
      <MessageList lines={shownLines} height={listHeight} offset={Math.min(offset, maxOffset)} width={width} effects={store.effects} />
      {bannerText ? (
        <Box paddingX={1}>
          <Text wrap="truncate-end">{bannerText}</Text>
        </Box>
      ) : null}
      {dialog ? (
        <Dialog spec={dialog} width={width} />
      ) : (
        <>
          <InputBox
            state={editor}
            onChange={setEditor}
            onSubmit={(v) => void send(v)}
            onKey={onKey}
            isActive={!dialog}
            width={width}
            history={history}
            placeholder={placeholder}
            borderColor={editor.value.startsWith('/') ? theme.accent : theme.border}
            afterType={completeTag}
          />
          <CommandMenu items={cmd.items} selected={cmd.selected} width={width} />
        </>
      )}
      <Footer
        hints={['enter send', 'alt+enter new line', 'esc back', 'scroll wheel/trackpad', 'drag select', 'ctrl+n/p switch chat']}
        toast={store.toast?.chatId === id ? null : store.toast}
        width={width}
      />
    </Box>
  );
}
