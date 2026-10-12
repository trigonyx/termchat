import chalk from 'chalk';
import stringWidth from 'string-width';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANIM_MS,
  applyEffects,
  autoCloseTag,
  closeSpansPerLine,
  effectTime,
  hasEffects,
  insertTag,
  parseColor,
  stripMarkers,
  tagSuggestions,
  TAGS,
} from '../src/ui/effects.js';
import { registry } from '../src/commands/builtin.js';
import { codeBlocks, plainPreview, renderMarkdown } from '../src/ui/markdown.js';

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const visible = (s: string) => strip(stripMarkers(s));

beforeAll(() => {
  chalk.level = 3;
});

describe('<rgb> / <shine> tags', () => {
  it('turns tags into markers without leaving tag text behind', () => {
    const out = renderMarkdown('hi <rgb>Hallo Welt</rgb>!', 40);
    expect(out.some(hasEffects)).toBe(true);
    expect(out.map(visible)).toEqual(['hi Hallo Welt!']);
    expect(renderMarkdown('<shine color="gold">x</shine>', 40).map(visible)).toEqual(['x']);
  });

  it('works when a tag is alone on its line and with Markdown inside', () => {
    expect(renderMarkdown('<rgb>\nline\n</rgb>', 40).map(visible).join('|')).toContain('line');
    const out = renderMarkdown('<rgb>**fett**</rgb>', 40);
    expect(out.map(visible)).toEqual(['fett']);
    expect(out[0]).toContain('\u001b[1m');
  });

  it('leaves tags in code untouched', () => {
    const out = renderMarkdown('`<rgb>x</rgb>`', 40);
    expect(out.some(hasEffects)).toBe(false);
    expect(out.map(strip)).toEqual(['<rgb>x</rgb>']);
  });

  it('animates: colors change over time, text and width stay the same', () => {
    const [line] = renderMarkdown('<rgb>Hallo Welt</rgb>', 40);
    const a = applyEffects(line!, 0);
    const b = applyEffects(line!, 700);
    expect(a).not.toBe(b);
    expect(strip(a)).toBe('Hallo Welt');
    expect(strip(b)).toBe('Hallo Welt');
    expect(stringWidth(a)).toBe(stringWidth('Hallo Welt'));
  });

  it('shine: base color most of the time, a lighter shimmer now and then', () => {
    const [line] = renderMarkdown('<shine color="#ff0000">Schimmer</shine>', 40);
    const idle = applyEffects(line!, 2000);
    expect(idle).toContain('38;2;255;0;0');
    expect(applyEffects(line!, 300)).not.toBe(idle);
    expect(applyEffects(line!, 2000 + 3600)).toBe(idle);
  });

  it('the shimmer travels from right to left', () => {
    const [line] = renderMarkdown('<shine color="#800000">abcdefghijklmnop</shine>', 40);
    const brightest = (t: number) => {
      const reds = [...applyEffects(line!, t).matchAll(/38;2;(\d+);/g)].map((m) => Number(m[1]));
      return reds.indexOf(Math.max(...reds));
    };
    expect(brightest(150)).toBeGreaterThan(brightest(650));
  });

  it('never puts user input into escape sequences', () => {
    expect(parseColor('red;rm -rf')).toBe(parseColor('accent'));
    const [line] = renderMarkdown('<shine color="xyz\u001b[2J">x</shine>', 40);
    expect(applyEffects(line!, 0)).not.toContain('[2J');
    // colors: names, #rrggbb, #rgb
    expect(parseColor('Gold')).toBe('ffd24a');
    expect(parseColor('#0af')).toBe('00aaff');
  });

  it('ignores markers smuggled in by a peer', () => {
    expect(renderMarkdown('a⁢b⁤︀︀︀︀︀︀c', 40).some(hasEffects)).toBe(false);
  });

  it('survives unbalanced and wrapped tags', () => {
    expect(() => renderMarkdown('</rgb> <shine>offen', 40)).not.toThrow();
    const lines = renderMarkdown('<rgb>' + 'wort '.repeat(20) + '</rgb>', 20);
    expect(lines.length).toBeGreaterThan(1);
    // every wrapped line is colored on its own
    expect(lines.every((l) => applyEffects(l, 0).includes('38;2;'))).toBe(true);
    expect(closeSpansPerLine(['⁢a', 'b⁣'])).toEqual(['⁢a⁣', '⁢b⁣']);
  });

  it('chat list preview shows plain text', () => {
    expect(plainPreview('<rgb>hi</rgb> <shine color="red">du</shine>')).toBe('hi du');
  });

  it('rainbow is only available as <rgb>', () => {
    expect(renderMarkdown('<rainbow>x</rainbow>', 40).some(hasEffects)).toBe(false);
  });

  it('auto-completes the closing tag after typing the opening tag', () => {
    expect(autoCloseTag('hi <rgb>', 8)).toBe('</rgb>');
    expect(autoCloseTag('<RGB>', 5)).toBe('</rgb>');
    expect(autoCloseTag('<shine color="gold">', 20)).toBe('</shine>');
    expect(autoCloseTag('<shine>', 7)).toBe('</shine>');
    expect(autoCloseTag('<rgb></rgb>', 5)).toBeNull(); // already there
    expect(autoCloseTag('a > b', 5)).toBeNull();
    expect(autoCloseTag('</rgb>', 6)).toBeNull();
  });
});

describe('effects playback', () => {
  it('brief plays for 8 s and then rests, off never moves, nonstop keeps going', () => {
    expect(effectTime('brief', 1000, 0)).toBe(1000);
    expect(effectTime('brief', 60_000, 0)).toBe(ANIM_MS);
    expect(effectTime('off', 1000, 0)).toBe(ANIM_MS);
    expect(effectTime('nonstop', 60_000, 0)).toBe(60_000);
  });

  it('rests on a frame where shine shows its plain color', () => {
    const [line] = renderMarkdown('<shine color="#ff0000">Schimmer</shine>', 40);
    expect(applyEffects(line!, ANIM_MS)).toBe(applyEffects(line!, 2000));
  });
});

describe('tag menu', () => {
  it('suggests tags after "<"', () => {
    expect(tagSuggestions('<', 1).map((t) => t.name)).toEqual(['rgb', 'shine']);
    expect(tagSuggestions('hi <s', 5).map((t) => t.name)).toEqual(['shine']);
    expect(tagSuggestions('a<b', 3)).toEqual([]);
    expect(tagSuggestions('<x', 2)).toEqual([]);
    expect(tagSuggestions('<rgb> ', 6)).toEqual([]);
  });

  it('inserts the tag pair with the cursor in between', () => {
    expect(insertTag({ value: 'hi <r!', cursor: 5 }, TAGS[0]!)).toEqual({ value: 'hi <rgb></rgb>!', cursor: 8 });
    const shine = insertTag({ value: '<', cursor: 1 }, TAGS[1]!);
    expect(shine.value).toBe('<shine color="gold"></shine>');
    expect(shine.value.slice(0, shine.cursor)).toBe('<shine color="gold">');
  });
});

describe('code and strikethrough', () => {
  it('strikes through with a combining overlay (no SGR 9 needed)', () => {
    const [line] = renderMarkdown('a ~~no way~~ b', 40);
    expect(strip(line!)).toBe('a n\u0336o\u0336 w\u0336a\u0336y\u0336 b');
    expect(stringWidth(line!)).toBe('a no way b'.length);
  });

  it('keeps lines and indentation of multi-line inline code', () => {
    const out = renderMarkdown('look: `function f() {\n    return 1;\n}` ok', 40).map(strip);
    expect(out[0]).toBe('look:');
    expect(out.slice(1, 4).map((l) => l.trimEnd())).toEqual([' function f() {', '     return 1;', ' }']);
    expect(out[4]).toBe('ok');
  });

  it('keeps leading spaces inside inline code', () => {
    const out = renderMarkdown('`if (x) {`\n`    go();`\n`}`', 40).map(strip);
    expect(out).toEqual(['if (x) {', '    go();', '}']);
  });

  it('code blocks have no gutter characters to copy along', () => {
    const out = renderMarkdown('```\nconst x = 1;\n```', 40).map(strip);
    expect(out.join('\n')).not.toMatch(/[│╭]/);
    expect(out[0]!.trim()).toBe('const x = 1;');
  });

  it('finds code blocks for /copy', () => {
    expect(codeBlocks('see:\n```js\nlet a;\n```\nand `x\n  y`')).toEqual(['let a;', 'x\n  y']);
    expect(codeBlocks('just `inline`')).toEqual([]);
  });
});

describe('help text', () => {
  it('shows tag names literally instead of turning them into effects', async () => {
    for (const chatId of [null, 'PEERID']) {
      let text = '';
      const ui = { print: (t: string) => void (text = t) } as never;
      await registry.execute('/help', { store: {} as never, chatId, ui });
      const lines = renderMarkdown(text, 100);
      expect(lines.some(hasEffects)).toBe(false);
      expect(lines.map(strip).join('\n')).toContain('<rgb>/<shine>: animate');
    }
  });
});
