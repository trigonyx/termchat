import { spawn } from 'node:child_process';

const TOOLS: Partial<Record<NodeJS.Platform, [string, string[]][]>> = {
  darwin: [['pbcopy', []]],
  win32: [['clip', []]],
  linux: [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ],
};

function run(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
      p.stdin.on('error', () => {});
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

/** Puts text on the system clipboard (text goes via stdin, never through a shell). */
export async function copyToClipboard(text: string): Promise<void> {
  for (const [cmd, args] of TOOLS[process.platform] ?? []) {
    if (await run(cmd, args, text)) return;
  }
  throw new Error('No clipboard tool found (pbcopy, wl-copy, xclip or xsel)');
}
