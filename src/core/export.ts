import fs from 'node:fs';
import path from 'node:path';
import type { AppStore } from './store.js';

function stamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Writes a chat (direct or group) as a Markdown file and returns its absolute path. */
export function exportChat(store: AppStore, chatId: string, file?: string): string {
  const chat = store.chat(chatId);
  if (!chat) throw new Error('Unknown chat');
  const title = chat.kind === 'group' ? `#${chat.display}` : `Chat with ${chat.display}`;
  const safeName = chat.display.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const target = path.resolve(file || `termchat-${safeName}-${stamp(Date.now()).slice(0, 10)}.md`);

  const lines = [`# ${title}`, '', `_Exported on ${stamp(Date.now())}_`, ''];
  for (const item of store.items(chatId)) {
    if (item.kind === 'note') {
      lines.push(`_${item.text}_ · ${stamp(item.ts)}`, '');
      continue;
    }
    const who = item.mine ? store.me.name : item.senderName;
    lines.push(`**${who}** · ${stamp(item.ts)}`, '', item.text, '', '---', '');
  }
  fs.writeFileSync(target, lines.join('\n'), 'utf8');
  return target;
}
