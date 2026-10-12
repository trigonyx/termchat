import type { PickOption } from '../commands/registry.js';
import type { NoteKind } from '../core/store.js';

/** What the screens need from the app (navigation, prompts, commands). */
export interface Actions {
  openChat(id: string): void;
  goHome(): void;
  quit(): void;
  confirm(title: string): Promise<boolean>;
  prompt(title: string, opts?: { hint?: string; initial?: string }): Promise<string | null>;
  pick(title: string, options: PickOption[], multi: boolean): Promise<string[] | null>;
  runCommand(input: string, chatId: string | null): Promise<void>;
  print(chatId: string | null, text: string, kind?: NoteKind): void;
}
