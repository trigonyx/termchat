import { CommandRegistry as Registry, type Command as BaseCommand } from 'termcore/ui/commands/registry';
import type { PickOption } from 'termcore/ui/components/Dialog';
import { isGroupChat, type AppStore, type NoteKind } from '../core/store.js';

export type { PickOption };

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

export type ChatKind = 'direct' | 'group' | null;

export const chatKindOf = (chatId: string | null): ChatKind => (chatId ? (isGroupChat(chatId) ? 'group' : 'direct') : null);

export interface CommandContext {
  store: AppStore;
  chatId: string | null;
  ui: CommandUI;
}

/** `chat` = any open chat, `direct` = 1:1 chats only, `group` = group chats only */
export type Scope = 'chat' | 'direct' | 'group';

export type Command = BaseCommand<CommandContext, Scope>;

export class CommandRegistry extends Registry<CommandContext, Scope, ChatKind> {
  constructor(commands: Command[]) {
    super(commands, {
      where: (ctx) => chatKindOf(ctx.chatId),
      inScope: (scope, kind) => kind !== null && (scope === 'chat' || scope === kind),
      outOfScope: (cmd, scope, kind) =>
        !kind ? `/${cmd} only works inside an open chat` : `/${cmd} only works in ${scope === 'group' ? 'group chats' : 'one-to-one chats'}`,
    });
  }
}
