import chalk from 'chalk';
import stringWidth from 'string-width';
import { theme } from './theme.js';

/**
 * Animated text tags: <rgb>…</rgb> and <shine color="gold">…</shine>.
 *
 * Messages are rendered once and cached, so the tags become zero-width marker
 * characters while parsing; the animation itself is applied to the visible lines
 * on every frame (applyEffects).
 */
const RB_OPEN = '⁢';
const RB_CLOSE = '⁣';
const SH_OPEN = '⁤'; // followed by 6 variation selectors = the 6 hex digits of the color
const SH_CLOSE = '⁡';

// peers must not be able to smuggle in markers themselves
const MARKERS_IN_INPUT = /[⁡-⁤]/g;
const TOKEN = /⁢|⁣|⁤[︀-️]{6}|⁡/g;
const SEGMENT = /(\u001b\[[0-9;]*m)|(⁢)|(⁣)|⁤([︀-️]{6})|(⁡)|([^\u001b⁡-⁤]+|[\s\S])/gu;

const NAMED: Record<string, string> = {
  red: 'ff5555',
  orange: 'ff9e64',
  yellow: 'ffe066',
  gold: 'ffd24a',
  green: '6fdc6f',
  lime: 'b5ff5c',
  teal: '2ec4b6',
  cyan: '5ce1ff',
  aqua: '5ce1ff',
  blue: '5c8dff',
  purple: 'b07cff',
  violet: 'b07cff',
  magenta: 'ff5cf0',
  pink: 'ff8fc7',
  white: 'f2f2f2',
  gray: '9a9a9a',
  grey: '9a9a9a',
  accent: theme.accent.slice(1),
};

/** Color name or #rgb/#rrggbb → 6 hex digits. Unknown values fall back to the accent color. */
export function parseColor(input: string | undefined): string {
  const v = (input ?? '').trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (m) return m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join('') : m[1]!;
  return NAMED.accent!;
}

const encodeColor = (hex: string) => [...hex].map((d) => String.fromCharCode(0xfe00 + parseInt(d, 16))).join('');
const decodeColor = (vs: string) => [...vs].map((ch) => (ch.charCodeAt(0) - 0xfe00).toString(16)).join('');

/** Strips marker characters a peer may have sent, so only real tags can produce effects. */
export function sanitizeInput(text: string): string {
  return text.replace(MARKERS_IN_INPUT, '');
}

/** Turns a raw HTML token (e.g. `<shine color="red">`) into its marker; null if it is not one of ours. */
export function tagMarker(raw: string): string | null {
  const tag = raw.trim();
  if (/^<rgb\s*>$/i.test(tag)) return RB_OPEN;
  if (/^<\/rgb\s*>$/i.test(tag)) return RB_CLOSE;
  if (/^<\/shine\s*>$/i.test(tag)) return SH_CLOSE;
  const m = /^<shine(?:\s+color\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s<>"']+)))?\s*>$/i.exec(tag);
  if (m) return SH_OPEN + encodeColor(parseColor(m[1] ?? m[2] ?? m[3]));
  return null;
}

export const hasTags = (text: string) => /<\/?(?:rgb|shine)[\s>]/i.test(text);
export const hasEffects = (line: string) => /[⁡-⁤]/.test(line);

/** Removes the tags (chat list previews). */
export function stripTags(text: string): string {
  return text.replace(/<\/?(?:rgb|shine)(?:\s[^<>]*)?>/gi, '');
}

/** Removes all markers from rendered lines (static output without animation). */
export function stripMarkers(line: string): string {
  return line.replace(TOKEN, '');
}

/**
 * Makes every line self-contained: spans still open at a line break are closed there and
 * reopened at the start of the next line, so lines can be scrolled and animated independently.
 */
export function closeSpansPerLine(lines: string[]): string[] {
  const stack: string[] = [];
  return lines.map((line) => {
    const prefix = stack.join('');
    for (const [tok] of line.matchAll(TOKEN)) {
      if (tok === RB_OPEN || tok[0] === SH_OPEN) stack.push(tok);
      else {
        const open = tok === RB_CLOSE ? RB_OPEN : SH_OPEN;
        const at = stack.map((s) => s[0]).lastIndexOf(open);
        if (at >= 0) stack.splice(at, 1);
      }
    }
    const suffix = [...stack].reverse().map((s) => (s === RB_OPEN ? RB_CLOSE : SH_CLOSE)).join('');
    return prefix || suffix ? prefix + line + suffix : line;
  });
}

type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];

const RAINBOW_PERIOD = 30; // columns until the colors repeat
const RAINBOW_SPEED = 9; // columns per second
const SHINE_CYCLE = 3600; // ms between two shimmers
const SHINE_SWEEP = 800; // ms a shimmer takes to cross the text
const SHINE_HALF = 3; // half width of the shimmer in columns

function rainbowColor(col: number, now: number): RGB {
  // the pattern at column c later equals the one at c + speed·t earlier → it moves to the left
  const phase = (((col + (RAINBOW_SPEED * now) / 1000) % RAINBOW_PERIOD) + RAINBOW_PERIOD) % RAINBOW_PERIOD;
  const dist = Math.min(phase, RAINBOW_PERIOD - phase);
  const white = Math.max(0, 1 - dist / 2.5) * 0.75;
  return mix(hslToRgb((phase / RAINBOW_PERIOD) * 360, 0.85, 0.64), WHITE, white);
}

function shineColor(base: RGB, col: number, width: number, now: number): RGB {
  const u = (now % SHINE_CYCLE) / SHINE_SWEEP;
  if (u >= 1) return base;
  const center = (width + 2 * SHINE_HALF) * (1 - u) - SHINE_HALF; // right → left
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.8);
}

interface Span {
  kind: 'rainbow' | 'shine';
  base: RGB;
  width: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Replaces the markers of a line with the colors of the animation frame at time `now` (ms). */
export function applyEffects(line: string, now: number): string {
  if (!hasEffects(line)) return line;
  const parts = [...line.matchAll(SEGMENT)];

  // pass 1: width of every span (the shimmer needs it)
  const spans: Span[] = [];
  const open: Span[] = [];
  for (const m of parts) {
    if (m[2] || m[4] !== undefined) {
      const hex = m[4] !== undefined ? decodeColor(m[4]) : '';
      const span: Span = m[2]
        ? { kind: 'rainbow', base: [0, 0, 0], width: 0 }
        : { kind: 'shine', base: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB, width: 0 };
      spans.push(span);
      open.push(span);
    } else if (m[3] || m[5]) {
      const at = open.map((s) => s.kind).lastIndexOf(m[3] ? 'rainbow' : 'shine');
      if (at >= 0) open.splice(at, 1);
    } else if (m[6] && !m[1] && open.length) {
      open[open.length - 1]!.width += stringWidth(m[6]);
    }
  }

  // pass 2: paint
  let out = '';
  let next = 0;
  let col = 0;
  const stack: { span: Span; col: number }[] = [];
  for (const m of parts) {
    if (m[1]) out += m[1];
    else if (m[2] || m[4] !== undefined) stack.push({ span: spans[next++]!, col: 0 });
    else if (m[3] || m[5]) {
      const at = stack.map((s) => s.span.kind).lastIndexOf(m[3] ? 'rainbow' : 'shine');
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
          const [r, g, b] = top.span.kind === 'rainbow' ? rainbowColor(col, now) : shineColor(top.span.base, top.col, top.span.width, now);
          out += chalk.rgb(Math.round(r), Math.round(g), Math.round(b))(segment);
        } else out += segment;
        top.col += w;
        col += w;
      }
    }
  }
  return out;
}

/**
 * Auto-completion while typing: right after the `>` of `<rgb>` or `<shine …>` the matching
 * closing tag is inserted behind the cursor. Returns null if nothing should be completed.
 */
export function autoCloseTag(value: string, cursor: number): string | null {
  const m = /<(rgb|shine)(?:\s[^<>]*)?>$/i.exec(value.slice(0, cursor));
  if (!m) return null;
  const closing = `</${m[1]!.toLowerCase()}>`;
  return value.slice(cursor).toLowerCase().startsWith(closing) ? null : closing;
}

// ───────────── Tag menu ─────────────

export interface TagSpec {
  name: string;
  open: string;
  close: string;
  description: string;
}

export const TAGS: TagSpec[] = [
  { name: 'rgb', open: '<rgb>', close: '</rgb>', description: 'Rainbow colors running across the text' },
  {
    name: 'shine',
    open: '<shine color="gold">',
    close: '</shine>',
    description: 'Colored text with a shimmer · color = red, gold, cyan, pink … or #rrggbb',
  },
];

const TAG_PREFIX = /(?:^|[^\w<])<([a-z]*)$/i;

/** Tags matching a `<partial` right before the cursor (empty when there is none). */
export function tagSuggestions(value: string, cursor: number): TagSpec[] {
  const m = TAG_PREFIX.exec(value.slice(0, cursor));
  if (!m) return [];
  const partial = m[1]!.toLowerCase();
  return TAGS.filter((t) => t.name.startsWith(partial));
}

/** Position of the `<` that tagSuggestions matched, or -1. */
export function tagStart(value: string, cursor: number): number {
  const m = TAG_PREFIX.exec(value.slice(0, cursor));
  return m ? cursor - m[1]!.length - 1 : -1;
}

/** Replaces the `<partial` before the cursor with the tag pair; the cursor ends up in between. */
export function insertTag(state: { value: string; cursor: number }, tag: TagSpec): { value: string; cursor: number } {
  const at = tagStart(state.value, state.cursor);
  if (at < 0) return state;
  const value = state.value.slice(0, at) + tag.open + tag.close + state.value.slice(state.cursor);
  return { value, cursor: at + tag.open.length };
}

// ───────────── Playback ─────────────

export type EffectsMode = 'nonstop' | 'brief' | 'off';
export const EFFECTS_MODES: EffectsMode[] = ['nonstop', 'brief', 'off'];

/**
 * How long effects play in `brief` mode before they rest. 8000 ms is also a moment where
 * the shimmer has just finished, so the resting frame shows shine in its plain color.
 */
export const ANIM_MS = 8000;

/** Animation time (ms) for the frame to draw; `since` = when the effects came into view. */
export function effectTime(mode: EffectsMode, now: number, since: number): number {
  if (mode === 'off') return ANIM_MS;
  const t = Math.max(0, now - since);
  return mode === 'brief' ? Math.min(t, ANIM_MS) : t;
}

// ───────────── The logo's glint ─────────────

/** ms the logo's glint takes to cross it (same as keyrace's and termdrop's banner) */
export const LOGO_SWEEP = 900;
/** half width of the glint in columns */
const LOGO_HALF = 4;

/**
 * Color of column `col` (of `width`) at time `t` ms after the glint started. It moves left to
 * right and leans with the rows (`row` shifts it), so it looks like a glint on metal.
 */
export function logoShineColor(base: RGB, col: number, row: number, width: number, t: number): RGB {
  const u = t / LOGO_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * LOGO_HALF + 6) * u - LOGO_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / LOGO_HALF);
  return mix(base, WHITE, strength * 0.85);
}

/** Paints one line of the logo for frame `t` (< 0 or ≥ LOGO_SWEEP = resting, plain color). */
export function logoLine(line: string, row: number, width: number, hex: string, t: number): string {
  if (t < 0 || t >= LOGO_SWEEP) return chalk.hex(hex)(line);
  const base = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  let out = '';
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') out += ch;
    else {
      const [r, g, b] = logoShineColor(base, col, row, width, t);
      out += chalk.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    }
    col++;
  }
  return out;
}
