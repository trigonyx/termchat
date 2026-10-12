import { isGroupChat, type AppStore, type NoteKind } from '../core/store.js';
import { parseCommand } from './parse.js';

export interface CommandUI {
  /** Output in the current chat, or as a toast in the chat list. */
  print(text: string, kind?: NoteKind): void;
  openChat(id: string): void;
  goHome(): void;
  quit(): void;
  confirm(question: string): Promise<boolean>;
  /** Choose from a list; `null` = cancelled. */
  pick(title: string, options: PickOption[], multi: boolean): Promise<string[] | null>;
}

export interface PickOption {
  id: string;
  label: string;
  hint?: string;
}

export type ChatKind = 'direct' | 'group' | null;

export const chatKindOf = (chatId: string | null): ChatKind => (chatId ? (isGroupChat(chatId) ? 'group' : 'direct') : null);

export interface CommandContext {
  store: AppStore;
  chatId: string | null;
  ui: CommandUI;
}

export interface Command {
  name: string;
  aliases?: string[];
  usage?: string;
  description: string;
  /** `chat` = any open chat, `direct` = 1:1 chats only, `group` = group chats only */
  scope: 'global' | 'chat' | 'direct' | 'group';
  minArgs?: number;
  run(ctx: CommandContext, args: string[], rest: string): void | Promise<void>;
}

export class CommandRegistry {
  constructor(readonly commands: Command[]) {}

  find(name: string): Command | undefined {
    const n = name.toLowerCase();
    return this.commands.find((c) => c.name === n || c.aliases?.includes(n));
  }

  available(kind: ChatKind): Command[] {
    return this.commands.filter((c) => c.scope === 'global' || (kind !== null && (c.scope === 'chat' || c.scope === kind)));
  }

  /** Commands available in the current context, filtered by prefix. */
  suggest(prefix: string, kind: ChatKind): Command[] {
    const p = prefix.toLowerCase();
    return this.available(kind).filter((c) => c.name.startsWith(p) || c.aliases?.some((a) => a.startsWith(p)));
  }

  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input: string, ctx: CommandContext): Promise<boolean> {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;

    if (!parsed.name) {
      ui.print('Type a command, e.g. /help', 'error');
      return true;
    }
    const kind = chatKindOf(ctx.chatId);
    const cmd = this.available(kind).find((c) => c.name === parsed.name || c.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} – all commands: /help`, 'error');
      return true;
    }
    if (cmd.scope !== 'global' && !kind) {
      ui.print(`/${cmd.name} only works inside an open chat`, 'error');
      return true;
    }
    if ((cmd.scope === 'direct' && kind === 'group') || (cmd.scope === 'group' && kind === 'direct')) {
      ui.print(`/${cmd.name} only works in ${cmd.scope === 'group' ? 'group chats' : 'one-to-one chats'}`, 'error');
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ''}`.trim(), 'error');
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err) {
      ui.print(`/${cmd.name} failed: ${(err as Error).message}`, 'error');
    }
    return true;
  }
}
