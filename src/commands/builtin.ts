import net from 'node:net';
import { copyToClipboard } from '../core/clipboard.js';
import { exportChat } from '../core/export.js';
import { formatId } from '../core/identity.js';
import {
  compareVersions,
  fetchLatestVersion,
  installedVersion,
  installHint,
  installKind,
  requestRestart,
  runInstall,
  SOURCE_HINT,
  staleInstallHint,
} from '../core/update.js';
import { VERSION } from '../core/version.js';
import { DEFAULT_PORT } from '../core/network.js';
import type { GroupView } from '../core/store.js';
import { EFFECTS_MODES, type EffectsMode } from '../ui/effects.js';
import { codeBlocks } from '../ui/markdown.js';
import { chatKindOf, CommandRegistry, type Command, type CommandContext, type PickOption } from './registry.js';

const STATE_LABEL: Record<string, string> = {
  accepted: 'contact',
  outgoing: 'request sent',
  incoming: 'wants to chat with you',
  declined: 'declined your request',
  blocked: 'blocked',
};

function contactOf(ctx: CommandContext) {
  const c = ctx.chatId ? ctx.store.contact(ctx.chatId) : undefined;
  if (!c) throw new Error('No contact selected');
  return c;
}

function groupOf(ctx: CommandContext): GroupView {
  const g = ctx.chatId ? ctx.store.group(ctx.chatId) : undefined;
  if (!g) throw new Error('No group selected');
  return g;
}

/** Accepted contacts as pick options, optionally without some ids. */
function contactOptions(ctx: CommandContext, exclude = new Set<string>()): PickOption[] {
  return ctx.store.contacts
    .all()
    .filter((c) => c.state === 'accepted' && c.publicKey && !exclude.has(c.id))
    .map((c) => ({ id: c.id, label: c.alias || c.name, hint: ctx.store.isOnline(c.id) ? 'online' : undefined }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function parseAddress(input: string): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1]!;
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}

export const builtinCommands: Command[] = [
  {
    name: 'help',
    aliases: ['?'],
    description: 'Show all commands and shortcuts',
    scope: 'global',
    run(ctx) {
      const kind = chatKindOf(ctx.chatId);
      const cmds = registry.available(kind);
      const width = Math.max(...cmds.map((c) => `/${c.name} ${c.usage ?? ''}`.length));
      // descriptions are plain text – escape "<" so e.g. "<rgb>" isn't turned into an effect
      const lines = cmds.map((c) => `\`${`/${c.name} ${c.usage ?? ''}`.trimEnd().padEnd(width)}\`  ${c.description.replace(/</g, '\\<')}`);
      const keys = kind
        ? '**Keys:** `enter` send · `alt+enter` or `\\`+`enter` new line · `esc` back · scroll with wheel/trackpad or `↑/↓` (`alt+↑/↓` = input history) · `ctrl+n/p` next/previous chat · drag to select text'
        : '**Keys:** `↑↓` select · `enter` open · `g` new group · `a` add by IP · `/` command · `q` quit';
      ctx.ui.print(
        [
          '### Commands',
          '',
          ...lines.map((l) => `- ${l}`),
          '',
          keys,
          '',
          'Markdown: `**bold**` `*italic*` `~~strike~~` `` `code` `` `# Heading` `> Quote` `- List`',
          'Effects (type `<`): `<rgb>…</rgb>` `<shine color="gold">…</shine>`',
        ].join('\n'),
      );
    },
  },
  {
    name: 'me',
    aliases: ['id'],
    description: 'Show your name, ID and address',
    scope: 'global',
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(', ') : 'no network';
      ctx.ui.print(`**${me.name}** · ID \`${formatId(me.id, true)}\`\nReachable at ${addr}`);
    },
  },
  {
    name: 'name',
    usage: '<new name>',
    minArgs: 1,
    description: 'Change your display name',
    scope: 'global',
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now **${name}**`, 'success');
    },
  },
  {
    name: 'add',
    usage: '<ip[:port]>',
    minArgs: 1,
    description: "Add a contact by IP (if they don't show up under Nearby)",
    scope: 'global',
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]!);
      ctx.ui.print(`Connecting to ${host}:${port} …`);
      const id = await ctx.store.addByAddress(host, port);
      ctx.ui.openChat(id);
    },
  },
  {
    name: 'group',
    usage: '<name>',
    minArgs: 1,
    description: 'Create a group chat and invite contacts',
    scope: 'global',
    async run(ctx, _args, rest) {
      const options = contactOptions(ctx);
      if (!options.length) throw new Error('Add some contacts first – only contacts can be invited');
      const ids = await ctx.ui.pick(`Who should join #${rest}?`, options, true);
      if (ids === null) return;
      const chatId = ctx.store.createGroup(rest, ids);
      ctx.ui.openChat(chatId);
    },
  },
  {
    name: 'accept',
    description: 'Accept a chat request or group invite',
    scope: 'chat',
    run(ctx) {
      if (chatKindOf(ctx.chatId) === 'group') {
        ctx.store.groupAccept(groupOf(ctx).id);
        return;
      }
      const c = contactOf(ctx);
      if (c.state === 'outgoing') {
        throw new Error("You already sent a request – you're connected as soon as it reaches them and they accept");
      }
      if (c.state !== 'incoming') throw new Error('There is no pending request');
      ctx.store.accept(c.id);
    },
  },
  {
    name: 'decline',
    description: 'Decline a chat request or group invite',
    scope: 'chat',
    run(ctx) {
      if (chatKindOf(ctx.chatId) === 'group') {
        ctx.store.groupDecline(groupOf(ctx).id);
        ctx.ui.goHome();
        return;
      }
      const c = contactOf(ctx);
      if (c.state !== 'incoming') throw new Error('There is no pending request');
      ctx.store.decline(c.id);
      ctx.ui.goHome();
    },
  },
  {
    name: 'request',
    description: 'Send a new chat request',
    scope: 'direct',
    run(ctx) {
      const c = contactOf(ctx);
      if (c.state === 'accepted' || c.state === 'outgoing') throw new Error("A request is already pending or you're connected");
      if (c.state === 'incoming') throw new Error('This person sent you a request – accept it with /accept');
      ctx.store.request(c.id);
    },
  },
  {
    name: 'invite',
    description: 'Invite contacts to this group',
    scope: 'group',
    async run(ctx) {
      const g = groupOf(ctx);
      const options = contactOptions(ctx, new Set(g.members.map((m) => m.id)));
      if (!options.length) throw new Error('All your contacts are already in this group');
      const ids = await ctx.ui.pick(`Invite to #${g.display}`, options, true);
      if (!ids?.length) return;
      ctx.store.groupInvite(g.id, ids);
    },
  },
  {
    name: 'members',
    aliases: ['who'],
    description: 'Show who is in this group',
    scope: 'group',
    run(ctx) {
      const g = groupOf(ctx);
      const lines = g.members
        .sort((a, b) => Number(b.isCreator) - Number(a.isCreator) || a.name.localeCompare(b.name))
        .map((m) => {
          const tags = [
            m.isMe ? 'you' : m.inactive ? 'inactive' : m.online ? 'online' : 'offline',
            m.status === 'invited' ? 'invited' : '',
            m.isCreator ? 'creator' : '',
          ].filter(Boolean);
          return `- ${m.isCreator ? '★ ' : ''}**${m.name}** _${tags.join(' · ')}_`;
        });
      ctx.ui.print([`### #${g.display} · ${g.members.length} members`, '', ...lines].join('\n'));
    },
  },
  {
    name: 'kick',
    description: 'Remove members from this group (creator only)',
    scope: 'group',
    async run(ctx) {
      const g = groupOf(ctx);
      if (g.creator !== ctx.store.identity.id) throw new Error('Only the creator can remove members');
      const options = g.members.filter((m) => !m.isMe).map((m) => ({ id: m.id, label: m.name, hint: m.status === 'invited' ? 'invited' : undefined }));
      if (!options.length) throw new Error("There's nobody else in this group");
      const ids = await ctx.ui.pick(`Remove from #${g.display}`, options, true);
      if (!ids?.length) return;
      const names = ids.map((id) => options.find((o) => o.id === id)?.label).join(', ');
      if (!(await ctx.ui.confirm(`Remove ${names} from #${g.display}?`))) return;
      for (const id of ids) ctx.store.groupKick(g.id, id);
    },
  },
  {
    name: 'leave',
    description: 'Leave this group',
    scope: 'group',
    async run(ctx) {
      const g = groupOf(ctx);
      if (await ctx.ui.confirm(`Leave #${g.display}?`)) ctx.store.groupLeave(g.id);
    },
  },
  {
    name: 'rename',
    usage: '[name]',
    description: 'Rename the group, or set your own nickname for a contact (empty = reset)',
    scope: 'chat',
    run(ctx, _args, rest) {
      if (chatKindOf(ctx.chatId) === 'group') {
        if (!rest) throw new Error('Usage: /rename <new group name>');
        ctx.store.groupRename(groupOf(ctx).id, rest);
        return;
      }
      const c = contactOf(ctx);
      ctx.store.rename(c.id, rest);
      ctx.ui.print(rest ? `Now shown as **${ctx.store.contact(c.id)?.display}**` : 'Nickname removed', 'success');
    },
  },
  {
    name: 'whois',
    aliases: ['info'],
    description: 'Contact details and safety code',
    scope: 'direct',
    run(ctx) {
      const c = contactOf(ctx);
      const code = ctx.store.safetyCodeWith(c.id);
      const lines = [
        `### ${c.display}${c.alias ? ` _(calls themselves ${c.name})_` : ''}`,
        '',
        `- **ID** \`${formatId(c.id, true)}\``,
        `- **Status** ${c.inactive ? 'inactive' : c.online ? 'online' : 'offline'} · ${STATE_LABEL[c.state] ?? c.state}`,
        `- **Address** ${c.lastIp ? `\`${c.lastIp}:${c.lastPort ?? '?'}\`` : 'unknown'}`,
        `- **Safety code** ${code ? `\`${code}\`` : 'not connected yet'}`,
        '',
        '_Compare the safety code in person. If it matches, nobody can be listening in._',
      ];
      ctx.ui.print(lines.join('\n'));
    },
  },
  {
    name: 'block',
    description: 'Block this contact',
    scope: 'direct',
    async run(ctx) {
      const c = contactOf(ctx);
      if (await ctx.ui.confirm(`Block ${c.display}?`)) ctx.store.block(c.id);
    },
  },
  {
    name: 'unblock',
    description: 'Unblock this contact',
    scope: 'direct',
    run(ctx) {
      const c = contactOf(ctx);
      if (c.state !== 'blocked') throw new Error('Contact is not blocked');
      ctx.store.unblock(c.id);
    },
  },
  {
    name: 'clear',
    description: 'Clear the view (history stays saved)',
    scope: 'chat',
    run(ctx) {
      ctx.store.clearView(ctx.chatId!);
    },
  },
  {
    name: 'delete',
    description: "Permanently delete this chat's history",
    scope: 'chat',
    async run(ctx) {
      if (chatKindOf(ctx.chatId) === 'group') {
        const g = groupOf(ctx);
        if (g.myStatus === 'member' || g.myStatus === 'invited') throw new Error('Leave the group first: /leave');
        if (await ctx.ui.confirm(`Delete #${g.display} and its history from this device?`)) {
          ctx.store.deleteGroup(g.id);
          ctx.ui.goHome();
        }
        return;
      }
      const c = contactOf(ctx);
      if (await ctx.ui.confirm(`Delete the entire history with ${c.display}?`)) {
        ctx.store.deleteHistory(c.id);
        ctx.ui.print('History deleted', 'success');
      }
    },
  },
  {
    name: 'remove',
    description: 'Remove contact and history',
    scope: 'direct',
    async run(ctx) {
      const c = contactOf(ctx);
      if (await ctx.ui.confirm(`Remove ${c.display} as a contact and delete the history?`)) {
        ctx.store.removeContact(c.id);
        ctx.ui.goHome();
      }
    },
  },
  {
    name: 'export',
    aliases: ['save'],
    usage: '[file.md]',
    description: 'Save the history as a Markdown file',
    scope: 'chat',
    run(ctx, args) {
      const file = exportChat(ctx.store, ctx.chatId!, args[0]);
      ctx.ui.print(`Saved to \`${file}\``, 'success');
    },
  },
  {
    name: 'copy',
    description: 'Copy the last code block (or else the last message) to the clipboard',
    scope: 'chat',
    async run(ctx) {
      const texts = ctx.store
        .items(ctx.chatId!)
        .filter((it) => it.kind === 'msg')
        .map((it) => it.text);
      if (!texts.length) throw new Error('Nothing to copy yet');
      let text = texts[texts.length - 1]!;
      let what = 'the last message';
      for (let i = texts.length - 1; i >= 0; i--) {
        const blocks = codeBlocks(texts[i]!);
        if (blocks.length) {
          text = blocks[blocks.length - 1]!;
          what = 'the last code block';
          break;
        }
      }
      await copyToClipboard(text);
      ctx.ui.print(`Copied ${what} to the clipboard`, 'success');
    },
  },
  {
    name: 'effects',
    usage: '[nonstop|brief|off]',
    description: '<rgb>/<shine>: animate nonstop, for 8 seconds (default) or not at all',
    scope: 'global',
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      const mode = arg === 'on' ? 'nonstop' : arg === '8s' ? 'brief' : arg;
      if (mode && !EFFECTS_MODES.includes(mode as EffectsMode)) throw new Error('Usage: /effects nonstop|brief|off');
      if (mode) ctx.store.setEffects(mode as EffectsMode);
      const label = { nonstop: 'animate nonstop', brief: 'animate for 8 seconds, then rest', off: 'are off (shown without animation)' };
      ctx.ui.print(`Effects ${label[ctx.store.effects]}`, 'info');
    },
  },
  {
    name: 'notifications',
    aliases: ['notify'],
    usage: '[on|off]',
    description: 'Desktop notifications for messages while termchat is in the background',
    scope: 'global',
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== 'on' && arg !== 'off') throw new Error('Usage: /notifications on|off');
      if (arg) ctx.store.setNotifications(arg === 'on');
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? 'on' : 'off'}`, 'info');
    },
  },
  {
    name: 'update',
    description: 'Install the latest termchat version from GitHub',
    scope: 'global',
    async run(ctx) {
      if (installKind() === 'source') return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print('Checking for updates …');
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub – are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`termchat ${VERSION} is up to date`, 'success');
        return;
      }
      if (!(await ctx.ui.confirm(`Update termchat ${VERSION} → ${latest}?`))) return;
      ctx.ui.print(`Installing termchat ${latest} … (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split('\n').slice(-6).join('\n');
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:\n\`\`\`\n${tail}\n\`\`\``);
      }
      // don't claim success before the new version is really there
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart termchat now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated – restart termchat to use ${latest}`, 'success');
      }
    },
  },
  {
    name: 'quit',
    aliases: ['exit', 'q'],
    description: 'Quit termchat',
    scope: 'global',
    run(ctx) {
      ctx.ui.quit();
    },
  },
];

export const registry = new CommandRegistry(builtinCommands);
