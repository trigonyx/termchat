import chalk from 'chalk';
import { highlight, supportsLanguage } from 'cli-highlight';
import { Lexer, type Token, type Tokens } from 'marked';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import { closeSpansPerLine, hasTags, sanitizeInput, stripTags, tagMarker } from './effects.js';
import { c, theme } from 'termcore/ui/theme';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescape = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);

const OPTIONS = { gfm: true, breaks: true };

/**
 * Spaces inside inline code become this placeholder while wrapping, so indentation
 * survives and code isn't split at its spaces; renderMarkdown turns it back into spaces.
 */
const CODE_SPACE = '\uE000';
const CODE_SPACES = /\uE000/g;

/** Strikethrough via a combining overlay (U+0336) – works in terminals without SGR 9 (Terminal.app). */
function strike(text: string): string {
  return text
    .split(/(\u001b\[[0-9;]*m|[\u2061-\u2064][\ufe00-\ufe0f]*)/)
    .map((part, i) =>
      i % 2 ? part : [...graphemes.segment(part)].map(({ segment }) => (segment.trim() ? segment + '\u0336' : segment)).join(''),
    )
    .join('');
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Inline code content from the raw token: keeps whitespace (marked collapses it in `text`). */
function codeContent(raw: string): string {
  const n = /^`+/.exec(raw)?.[0].length ?? 0;
  let code = raw.slice(n, raw.length - n);
  if (/^ .*[^ ].* $/s.test(code)) code = code.slice(1, -1);
  return code;
}

/**
 * Inline code that spans several lines (e.g. pasted between two single backticks)
 * becomes a fenced code block, so its lines and indentation are kept.
 */
function fenceMultilineCode(text: string): string {
  let out = '';
  let i = 0;
  let inFence: string | null = null;
  while (i < text.length) {
    const lineStart = i === 0 || text[i - 1] === '\n';
    if (lineStart) {
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(i));
      if (fence && (!inFence || fence[1]!.startsWith(inFence))) {
        inFence = inFence ? null : fence[1]!;
        const end = text.indexOf('\n', i);
        const stop = end === -1 ? text.length : end + 1;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (inFence || text[i] !== '`' || text[i - 1] === '\\') {
      out += text[i++];
      continue;
    }
    const run = /^`+/.exec(text.slice(i))![0];
    const close = run.length < 3 ? findRun(text, i + run.length, run.length) : -1;
    const code = close === -1 ? '' : text.slice(i + run.length, close);
    if (!code.includes('\n')) {
      out += close === -1 ? run : text.slice(i, close + run.length);
      i = close === -1 ? i + run.length : close + run.length;
      continue;
    }
    const body = code.replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '');
    const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    out += `${out && !out.endsWith('\n') ? '\n' : ''}${fence}\n${body}\n${fence}\n`;
    i = close + run.length;
    if (text[i] === '\n') i++;
  }
  return out;
}

/** Position of the next run of exactly `n` backticks from `from`, or -1. */
function findRun(text: string, from: number, n: number): number {
  const re = /`+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) if (m[0].length === n) return m.index;
  return -1;
}

export function wrap(text: string, width: number, trim = true): string[] {
  return wrapAnsi(text, Math.max(1, width), { hard: true, trim }).split('\n');
}

function inline(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        out += 'tokens' in t && t.tokens ? inline(t.tokens) : unescape(t.text);
        break;
      case 'strong':
        out += chalk.bold(inline((t as Tokens.Strong).tokens));
        break;
      case 'em':
        out += chalk.italic(inline((t as Tokens.Em).tokens));
        break;
      case 'del':
        out += strike(inline((t as Tokens.Del).tokens));
        break;
      case 'codespan':
        out += c.code(codeContent(t.raw).replace(/ /g, CODE_SPACE));
        break;
      case 'link': {
        const l = t as Tokens.Link;
        const label = inline(l.tokens);
        out += l.text === l.href || label === l.href ? c.accent.underline(l.href) : `${c.accent.underline(label)} ${c.dim(`(${l.href})`)}`;
        break;
      }
      case 'image':
        out += c.dim(`[Image: ${(t as Tokens.Image).text || 'untitled'}] ${(t as Tokens.Image).href}`);
        break;
      case 'br':
        out += '\n';
        break;
      case 'escape':
        out += (t as Tokens.Escape).text;
        break;
      case 'html':
        out += tagMarker(t.raw) ?? ('text' in t && typeof t.text === 'string' ? t.text : t.raw);
        break;
      default:
        out += 'text' in t && typeof t.text === 'string' ? t.text : t.raw;
    }
  }
  return out;
}

function heading(t: Tokens.Heading): string {
  const text = inline(t.tokens);
  if (t.depth === 1) return chalk.bold.underline.hex(theme.accent)(text);
  if (t.depth === 2) return chalk.bold.hex(theme.accent)(text);
  if (t.depth === 3) return chalk.bold(text);
  return chalk.bold.hex(theme.dim)(text);
}

/**
 * Code blocks: highlighted, slightly indented, no gutter characters – so selecting them
 * with the mouse copies clean code; indentation is kept.
 */
function codeBlock(t: Tokens.Code, width: number): string[] {
  const lang = t.lang?.split(/\s/)[0];
  let body: string;
  try {
    body = lang && supportsLanguage(lang) ? highlight(t.text, { language: lang, ignoreIllegals: true }) : c.code(t.text);
  } catch {
    body = c.code(t.text);
  }
  const lines = body.split('\n').flatMap((l) => wrap(l, width - 1, false));
  const code = lines.map((l) => ` ${l}`);
  return lang ? [c.faint(lang), ...code] : code;
}

function table(t: Tokens.Table, width: number): string[] {
  const head = t.header.map((h) => chalk.bold(inline(h.tokens)));
  const rows = t.rows.map((r) => r.map((cell) => inline(cell.tokens)));
  const cols = head.length;
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(stringWidth(head[i] ?? ''), ...rows.map((r) => stringWidth(r[i] ?? ''))),
  );
  const total = widths.reduce((a, b) => a + b, 0) + (cols - 1) * 3;
  if (total > width) {
    // too wide: render as a list
    return rows.flatMap((r) => r.map((cell, i) => `${head[i]}: ${cell}`).flatMap((l) => wrap(l, width)));
  }
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stringWidth(s)));
  const line = (cells: string[]) => cells.map((cell, i) => pad(cell, widths[i]!)).join(c.faint(' │ '));
  return [line(head), c.faint(widths.map((w) => '─'.repeat(w)).join('─┼─')), ...rows.map(line)];
}

function blocks(tokens: Token[], width: number): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
        if (out.length) out.push('');
        break;
      case 'heading':
        out.push(...wrap(heading(t as Tokens.Heading), width));
        break;
      case 'paragraph':
        out.push(...wrap(inline((t as Tokens.Paragraph).tokens), width));
        break;
      case 'text': {
        const tt = t as Tokens.Text;
        out.push(...wrap(tt.tokens ? inline(tt.tokens) : unescape(tt.text), width));
        break;
      }
      case 'code':
        out.push(...codeBlock(t as Tokens.Code, width));
        break;
      case 'blockquote': {
        const inner = blocks((t as Tokens.Blockquote).tokens, width - 2);
        out.push(...inner.map((l) => c.faint('▎ ') + c.dim(l)));
        break;
      }
      case 'list': {
        const list = t as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        list.items.forEach((item, i) => {
          let bullet = list.ordered ? `${start + i}.` : '•';
          if (item.task) bullet = item.checked ? c.success('☑') : '☐';
          const bw = stringWidth(bullet) + 1;
          const body = blocks(item.tokens.filter((x) => x.type !== 'checkbox'), width - bw);
          body.forEach((l, j) => out.push((j === 0 ? c.dim(bullet) + ' ' : ' '.repeat(bw)) + l));
        });
        break;
      }
      case 'hr':
        out.push(c.faint('─'.repeat(Math.min(width, 40))));
        break;
      case 'table':
        out.push(...table(t as Tokens.Table, width));
        break;
      case 'html': {
        // our own tags can sit alone on a line, which marked treats as a block
        const raw = t.raw.replace(/\n+$/, '');
        out.push(...wrap(hasTags(raw) ? inline(new Lexer(OPTIONS).inlineTokens(raw)) : unescape(raw), width));
        break;
      }
      default:
        out.push(...wrap(unescape(t.raw.replace(/\n+$/, '')), width));
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * Renders Markdown into wrapped, colored terminal lines. <rgb>/<shine> tags stay in the
 * lines as zero-width markers; MessageList animates them (see effects.ts).
 */
export function renderMarkdown(text: string, width: number): string[] {
  let tokens: Token[];
  try {
    tokens = new Lexer(OPTIONS).lex(fenceMultilineCode(sanitizeInput(text).replace(CODE_SPACES, '')));
  } catch {
    return wrap(stripTags(text), width);
  }
  const lines = closeSpansPerLine(blocks(tokens, Math.max(10, width)).map((l) => l.replace(CODE_SPACES, ' ')));
  return lines.length ? lines : [''];
}

/** Single-line preview without Markdown characters (for the chat list). */
export function plainPreview(text: string): string {
  return stripTags(text)
    .replace(/```[\s\S]*?```/g, '[Code]')
    .replace(/[*_~`>#]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All code blocks in a message (fenced, indented, or inline code spanning several lines). */
export function codeBlocks(text: string): string[] {
  let tokens: Token[];
  try {
    tokens = new Lexer(OPTIONS).lex(fenceMultilineCode(sanitizeInput(text)));
  } catch {
    return [];
  }
  const out: string[] = [];
  const walk = (list: Token[]) => {
    for (const t of list) {
      if (t.type === 'code') out.push((t as Tokens.Code).text);
      if ('tokens' in t && Array.isArray(t.tokens)) walk(t.tokens);
      if (t.type === 'list') walk((t as Tokens.List).items);
    }
  };
  walk(tokens);
  return out;
}
