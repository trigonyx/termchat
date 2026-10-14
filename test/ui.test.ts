import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { parseAddress, registry } from '../src/commands/builtin.js';
import { parseCommand, tokenize } from '../src/commands/parse.js';
import type { AppStore } from '../src/core/store.js';
import { VERSION } from '../src/core/version.js';
import { Banner, bannerCompact, bannerHeight, LOGO, LOGO_SMALL } from '../src/ui/components/Banner.js';
import { Header } from '../src/ui/components/Header.js';
import { cleanPaste, edit, layoutEditor } from '../src/ui/editor.js';
import { plainPreview, renderMarkdown } from '../src/ui/markdown.js';

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command parser', () => {
  it('splits commands and arguments', () => {
    expect(parseCommand('/name Max Power')).toEqual({ name: 'name', args: ['Max', 'Power'], rest: 'Max Power' });
    expect(parseCommand('/EXPORT "my chat.md"')?.args).toEqual(['my chat.md']);
    expect(parseCommand('not a command')).toBeNull();
    expect(parseCommand('//not a command')).toBeNull();
    expect(parseCommand('/')?.name).toBe('');
  });

  it('does not crash on broken input', () => {
    for (const input of ['/"', "/add 'x", '/ / /', '/\u0000', '/spam(x;y', '/save=', '/e']) {
      expect(() => parseCommand(input)).not.toThrow();
    }
    expect(tokenize('a "b c')).toEqual(['a', 'b c']);
  });

  it('does not match the wrong command via substrings (old "/e" bug)', () => {
    expect(registry.find('e')).toBeUndefined();
    expect(registry.find('exit')?.name).toBe('quit');
    expect(registry.find('effects')?.name).toBe('effects');
    expect(registry.find('copy')?.name).toBe('copy');
  });

  it('validates addresses', () => {
    expect(parseAddress('192.168.1.20')).toEqual({ host: '192.168.1.20', port: 5050 });
    expect(parseAddress('10.0.0.1:6000')).toEqual({ host: '10.0.0.1', port: 6000 });
    expect(() => parseAddress('1.2.3.4:99999')).toThrow();
    expect(() => parseAddress('rm -rf')).toThrow();
  });
});

describe('editor', () => {
  it('edits text, treating an emoji as one character', () => {
    let s = edit.insert({ value: '', cursor: 0 }, 'hi 👋🏽');
    s = edit.backspace(s);
    expect(s.value).toBe('hi ');
    s = edit.insert(s, 'world foo');
    expect(edit.deleteWordBack(s).value).toBe('hi world ');
  });

  it('moves between lines', () => {
    const s = { value: 'abc\nde', cursor: 6 };
    expect(edit.vertical(s, -1)?.cursor).toBe(2);
    expect(edit.vertical(s, 1)).toBeNull();
  });

  it('wraps and places the cursor correctly', () => {
    const lines = layoutEditor({ value: 'abcdef', cursor: 6 }, 3);
    expect(lines.map((l) => l.text)).toEqual(['abc', 'def', '']);
    expect(lines[2]?.cursor).toBe(0);
    expect(cleanPaste('a\r\nb\u001b[201~')).toBe('a\nb');
  });
});

describe('markdown', () => {
  it('renders formatting, headings and lists', () => {
    const out = renderMarkdown('### Title\n**bold** and `code`\n- one\n- two', 40).map(strip);
    expect(out).toEqual(['Title', 'bold and code', '• one', '• two']);
  });

  it('wraps long lines to the width', () => {
    const out = renderMarkdown('word '.repeat(30), 20).map(strip);
    expect(out.every((l) => l.length <= 20)).toBe(true);
  });

  it('preview without Markdown characters', () => {
    expect(plainPreview('**Hello** [Link](http://x)\n# Title')).toBe('Hello Link Title');
  });
});

describe('header', () => {
  it('shows the app version next to the logo, also in narrow terminals', () => {
    const store = {
      me: { id: 'ABCDEFGHIJKLMNOPQRST', name: 'Max', ips: ['10.0.0.2'], port: 5050, discovery: true, scanning: false },
      onlineCount: () => 0,
      updateAvailable: null,
    } as unknown as AppStore;
    for (const width of [100, 40]) {
      const { lastFrame, unmount } = render(createElement(Header, { store, width }));
      expect(strip(lastFrame() ?? '')).toContain(`termchat  v${VERSION}`);
      unmount();
    }
  });
});

describe('banner', () => {
  it('shows the big logo where it fits and the small one in narrow terminals', () => {
    for (const [width, compact, logo] of [
      [100, false, LOGO],
      [60, true, LOGO_SMALL],
    ] as const) {
      const { lastFrame, unmount } = render(createElement(Banner, { width, compact, animate: false }));
      const frame = strip(lastFrame() ?? '');
      for (const line of logo) expect(frame).toContain(line.trimEnd());
      expect(frame).toContain('end-to-end encrypted chat');
      expect(frame.split('\n')).toHaveLength(bannerHeight(compact));
      unmount();
    }
    expect(bannerCompact(120, 40)).toBe(false);
    expect(bannerCompact(79, 40)).toBe(true);
    expect(bannerCompact(120, 15)).toBe(true);
  });
});
