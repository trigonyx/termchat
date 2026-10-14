import type { Key } from 'ink';
import { useEffect, useState } from 'react';
import { registry } from '../../commands/builtin.js';
import type { ChatKind, Command } from '../../commands/registry.js';
import type { MenuItem } from 'termcore/ui/components/CommandMenu';
import type { EditorState } from 'termcore/ui/editor';
import { insertTag, tagStart, tagSuggestions, type TagSpec } from '../effects.js';

interface Options {
  editor: EditorState;
  setEditor(s: EditorState): void;
  kind: ChatKind;
  onSubmit(value: string): void;
  onEscape(): void;
  /** Also suggest <rgb>/<shine> after typing "<" (chats only). */
  tags?: boolean;
}

/**
 * Suggestion menu below the input: "/" lists commands (enter runs if unambiguous),
 * "<" lists the effect tags. ↑↓ pick, tab completes, esc closes the tag menu.
 */
export function useCommandInput({ editor, setEditor, kind, onSubmit, onEscape, tags = false }: Options) {
  const [selected, setSelected] = useState(0);
  // position of a "<" whose menu was closed with esc
  const [dismissed, setDismissed] = useState(-1);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands: Command[] = filter !== null ? registry.suggest(filter, kind) : [];
  const tagAt = tags && filter === null ? tagStart(editor.value, editor.cursor) : -1;
  const tagList: TagSpec[] = tagAt >= 0 && tagAt !== dismissed ? tagSuggestions(editor.value, editor.cursor) : [];
  const items: MenuItem[] = commands.length
    ? commands.map((c) => ({ key: c.name, label: `/${c.name} ${c.usage ?? ''}`.trimEnd(), description: c.description }))
    : tagList.map((t) => ({ key: t.name, label: `${t.open}…${t.close}`, description: t.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  const menuKey = filter ?? (tagList.length ? `<${editor.value.slice(tagAt + 1, editor.cursor)}` : null);

  useEffect(() => setSelected(0), [menuKey]);
  useEffect(() => {
    if (dismissed >= 0 && tagAt !== dismissed) setDismissed(-1);
  }, [tagAt, dismissed]);

  const complete = (cmd: Command) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };

  const onKey = (_input: string, key: Key): boolean => {
    if (items.length) {
      const n = items.length;
      if (key.upArrow) {
        setSelected((sel - 1 + n) % n);
        return true;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % n);
        return true;
      }
    }
    if (tagList.length) {
      if (key.tab || (key.return && !key.meta)) {
        setEditor(insertTag(editor, tagList[sel]!));
        return true;
      }
      if (key.escape) {
        setDismissed(tagAt);
        return true;
      }
    }
    if (commands.length) {
      if (key.tab) {
        complete(commands[sel]!);
        return true;
      }
      if (key.return && !key.meta) {
        // Only an exact match or a single suggestion is executed. Otherwise complete
        // first – "/e" must not unexpectedly trigger /export.
        const exact = filter ? registry.find(filter) : undefined;
        const target = exact ?? (commands.length === 1 ? commands[0]! : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands[sel]!);
        else onSubmit(`/${target.name}`);
        return true;
      }
    }
    if (key.escape) {
      onEscape();
      return true;
    }
    return false;
  };

  return { items, selected: sel, onKey, submit: onSubmit };
}
