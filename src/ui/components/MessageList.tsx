import { Box, Text } from 'ink';
import { useEffect, useRef, useState } from 'react';
import stringWidth from 'string-width';
import type { ChatItem, Note } from '../../core/store.js';
import { ANIM_MS, applyEffects, effectTime, hasEffects, type EffectsMode } from '../effects.js';
import { clock, dayLabel, startOfDay } from 'termcore/ui/format';
import { renderMarkdown } from '../markdown.js';
import { c, icons, senderColor } from 'termcore/ui/theme';

const GROUP_GAP = 5 * 60_000;
const INDENT = '  ';

const cache = new Map<string, string[]>();
function cachedMarkdown(text: string, width: number): string[] {
  const k = `${width}\u0000${text}`;
  let lines = cache.get(k);
  if (!lines) {
    if (cache.size > 3000) cache.clear();
    lines = renderMarkdown(text, width);
    cache.set(k, lines);
  }
  return lines;
}

export interface ChatLinesInput {
  items: ChatItem[];
  /** ephemeral notes (command output etc.), merged in by time */
  notes: Note[];
  width: number;
  /** group chats: color each sender differently */
  colorful?: boolean;
  cutoff?: number;
  now?: number;
}

/** ◷ not sent yet · gray ✓ delivered · green ✓✓ read (1:1 chats only) */
function statusMark(status: Extract<ChatItem, { kind: 'msg' }>['status']): string {
  if (status === 'read') return c.success(icons.read);
  if (status === 'delivered') return c.dim(icons.delivered);
  if (status === 'pending') return c.faint(icons.pending);
  return c.dim(`${icons.delivered} ${status.n}/${status.total}`);
}

/** Builds all lines of the chat history – pre-wrapped so scrolling is line-accurate. */
export function buildChatLines({ items, notes, width, colorful = false, cutoff = 0, now = Date.now() }: ChatLinesInput): string[] {
  // persistent items keep their order; ephemeral notes are slotted in between by time
  const merged: ChatItem[] = [];
  const pendingNotes = [...notes].sort((a, b) => a.ts - b.ts);
  const noteItem = (n: Note): ChatItem => ({ kind: 'note', id: n.id, ts: n.ts, text: n.text, noteKind: n.kind });
  for (const item of items) {
    if (item.ts <= cutoff) continue;
    while (pendingNotes.length && pendingNotes[0]!.ts < item.ts) merged.push(noteItem(pendingNotes.shift()!));
    merged.push(item);
  }
  for (const n of pendingNotes) merged.push(noteItem(n));

  const bodyWidth = Math.max(10, width - INDENT.length - 2);
  const lines: string[] = [];
  let lastDay = -1;
  let lastSender: string | null = null;
  let lastTs = 0;

  for (const item of merged) {
    const day = startOfDay(item.ts);
    if (day !== lastDay) {
      if (lines.length) lines.push('');
      const label = ` ${dayLabel(item.ts, now)} `;
      const side = Math.max(2, Math.floor((width - stringWidth(label)) / 2));
      lines.push(c.faint('─'.repeat(side) + label + '─'.repeat(side)));
      lastDay = day;
      lastSender = null;
    }

    if (item.kind === 'note') {
      const icon =
        item.noteKind === 'error'
          ? c.error(icons.error)
          : item.noteKind === 'success'
            ? c.success(icons.delivered)
            : c.dim(icons.info);
      const body = cachedMarkdown(item.text, bodyWidth - 2);
      if (lastSender !== null) lines.push('');
      body.forEach((l, i) => lines.push(INDENT + (i === 0 ? `${icon} ` : '  ') + (item.noteKind === 'info' ? c.dim(l) : l)));
      lastSender = null;
      continue;
    }

    if (item.senderId !== lastSender || item.ts - lastTs > GROUP_GAP) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      const paint = item.mine ? c.accent : colorful ? senderColor(item.senderId) : c.peer;
      lines.push(`${paint.bold(item.mine ? 'You' : item.senderName)}  ${c.faint(clock(item.ts))}`);
    }
    const body = cachedMarkdown(item.text, bodyWidth);
    body.forEach((l, i) => {
      let line = INDENT + l;
      if (item.mine && i === body.length - 1) line += ' ' + statusMark(item.status);
      lines.push(line);
    });
    lastSender = item.senderId;
    lastTs = item.ts;
  }
  return lines;
}

/**
 * Animation time for the visible effects. It restarts whenever different effect lines come
 * into view (new message, scrolling, opening the chat). The clock ticks ~10×/s only while
 * something actually moves – a still screen keeps mouse selections intact.
 */
function useEffectsTime(signature: string, mode: EffectsMode): number {
  const since = useRef(Date.now());
  const last = useRef(signature);
  if (last.current !== signature) {
    last.current = signature;
    since.current = Date.now();
  }
  const [now, setNow] = useState(Date.now);
  const moving = signature !== '' && (mode === 'nonstop' || (mode === 'brief' && now - since.current < ANIM_MS));
  useEffect(() => {
    if (!signature || mode === 'off') return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (mode === 'brief' && n - since.current >= ANIM_MS) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [signature, mode]);
  return effectTime(mode, moving ? now : Math.max(now, since.current + ANIM_MS), since.current);
}

/** Shows a slice of the lines; `offset` = distance in lines from the bottom. */
export function MessageList({
  lines,
  height,
  offset,
  width,
  effects = 'brief',
}: {
  lines: string[];
  height: number;
  offset: number;
  width: number;
  effects?: EffectsMode;
}) {
  const h = Math.max(1, height);
  const end = Math.max(0, lines.length - offset);
  const start = Math.max(0, end - h);
  const visible = lines.slice(start, end);
  const indicator = offset > 0;
  if (indicator) visible[visible.length - 1] = c.dim(`  ↓ ${offset} newer lines`);
  const padding = Math.max(0, h - visible.length);
  const animated = visible.some(hasEffects);
  const now = useEffectsTime(animated ? visible.filter(hasEffects).join('\n') : '', effects);
  return (
    <Box flexDirection="column" height={h} width={width} paddingX={1} overflow="hidden">
      {Array.from({ length: padding }, (_, i) => (
        <Text key={`p${i}`}> </Text>
      ))}
      {visible.map((l, i) => (
        <Text key={i} wrap="truncate-end">
          {(animated ? applyEffects(l, now) : l) || ' '}
        </Text>
      ))}
    </Box>
  );
}
