import chalk from 'chalk';

/** Central color palette – muted grays, one warm accent like Claude Code. */
export const theme = {
  accent: '#D97757',
  peer: '#7AA2F7',
  dim: '#8C8C8C',
  faint: '#5A5A5A',
  border: '#4E4E4E',
  success: '#8CC08A',
  error: '#E5737B',
  warning: '#E5C07B',
  code: '#C3A6E8',
};

export const c = {
  accent: chalk.hex(theme.accent),
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic,
};

export const icons = {
  pointer: '❯',
  online: '●',
  offline: '○',
  away: '◐',
  request: '◆',
  pending: '◷',
  delivered: '✓',
  read: '✓✓',
  error: '✗',
  info: '·',
  group: '#',
};

/** Distinct, muted colors for senders in group chats (picked by hashing the peer id). */
const SENDER_COLORS = ['#7AA2F7', '#9ECE6A', '#E0AF68', '#BB9AF7', '#7DCFFF', '#F7768E', '#73DACA', '#FF9E64'];

export function senderColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return chalk.hex(SENDER_COLORS[h % SENDER_COLORS.length]!);
}
