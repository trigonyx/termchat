import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registry } from '../commands/builtin.js';
import { loadConfig } from '../core/identity.js';
import type { Paths } from '../core/paths.js';
import { AppStore, type StoreOptions } from '../core/store.js';
import type { Actions } from './actions.js';
import type { DialogSpec } from './components/Dialog.js';
import { Header } from './components/Header.js';
import { Panel } from './components/Panel.js';
import { emptyEditor, type EditorState } from './editor.js';
import { checkForUpdate } from '../core/update.js';
import { mouse } from './mouse.js';
import { useStoreVersion, useTerminalSize } from './hooks.js';
import { Chat } from './screens/Chat.js';
import { ChatList } from './screens/ChatList.js';
import { Onboarding } from './screens/Onboarding.js';
import { theme } from './theme.js';

type Phase = { name: 'onboarding' } | { name: 'starting' } | { name: 'ready'; store: AppStore } | { name: 'error'; message: string };

export function Root({ paths, options }: { paths: Paths; options: Omit<StoreOptions, 'paths'> }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState<Phase>(() => (loadConfig(paths) ? { name: 'starting' } : { name: 'onboarding' }));
  const storeRef = useRef<AppStore | null>(null);
  const quitting = useRef(false);

  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') quit();
  });

  useEffect(() => {
    if (phase.name !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: 'ready', store });
      } catch (err) {
        setPhase({ name: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);

  // one spare row so Ink doesn't clear the whole screen on every render
  const height = Math.max(10, rows - 1);

  if (phase.name === 'onboarding') {
    return <Onboarding paths={paths} width={columns} onDone={() => setPhase({ name: 'starting' })} />;
  }
  if (phase.name === 'starting') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color={theme.dim}>Starting termchat …</Text>
      </Box>
    );
  }
  if (phase.name === 'error') {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.error} bold>
          termchat could not start
        </Text>
        <Text>{phase.message}</Text>
        <Text color={theme.dim}>ctrl+c to quit</Text>
      </Box>
    );
  }
  return <Main store={phase.store} width={columns} height={height} quit={quit} />;
}

function Main({ store, width, height, quit }: { store: AppStore; width: number; height: number; quit(): void }) {
  const version = useStoreVersion(store);
  const [chatId, setChatId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Map<string, EditorState>>(new Map());
  const [history, setHistory] = useState<string[]>([]);

  // once per launch: is there a newer version on GitHub? (shown in the header)
  useEffect(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);

  // terminal window focus (reported by the terminal) → desktop notifications while in background
  useEffect(() => {
    mouse.on('focus', (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners('focus');
  }, [store]);

  const openChat = useCallback(
    (id: string) => {
      store.setActiveChat(id);
      setChatId(id);
      setSelectedKey(`c:${id}`);
    },
    [store],
  );
  const goHome = useCallback(() => {
    store.setActiveChat(null);
    setChatId(null);
  }, [store]);

  const actions: Actions = useMemo(() => {
    const a: Actions = {
      openChat,
      goHome,
      quit,
      confirm: (title) =>
        new Promise((resolve) =>
          setDialog({
            kind: 'confirm',
            title,
            resolve: (ok) => {
              setDialog(null);
              resolve(ok);
            },
          }),
        ),
      prompt: (title, opts) =>
        new Promise((resolve) =>
          setDialog({
            kind: 'prompt',
            title,
            hint: opts?.hint,
            initial: opts?.initial,
            resolve: (v) => {
              setDialog(null);
              resolve(v);
            },
          }),
        ),
      pick: (title, options, multi) =>
        new Promise((resolve) =>
          setDialog({
            kind: 'pick',
            title,
            options,
            multi,
            resolve: (ids) => {
              setDialog(null);
              resolve(ids);
            },
          }),
        ),
      print: (id, text, kind = 'info') => {
        if (id) store.note(id, text, kind);
        else if (text.includes('\n')) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ''), kind);
      },
      runCommand: async (input, id) => {
        await registry.execute(input, {
          store,
          chatId: id,
          ui: {
            print: (text, kind) => a.print(id, text, kind),
            openChat: a.openChat,
            goHome: a.goHome,
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick,
          },
        });
      },
    };
    return a;
  }, [store, openChat, goHome, quit]);

  const cycle = (dir: 1 | -1) => {
    const data = store.chatList();
    const ids = [...data.requests, ...data.chats].map((c) => c.id);
    if (!ids.length || !chatId) return;
    const i = ids.indexOf(chatId);
    openChat(ids[(i + dir + ids.length) % ids.length]!);
  };

  const pushHistory = (entry: string) =>
    setHistory((h) => (h[h.length - 1] === entry ? h : [...h.slice(-99), entry]));

  const bodyHeight = height - 2;
  let body;
  if (chatId) {
    body = (
      <Chat
        key={chatId}
        store={store}
        id={chatId}
        width={width}
        height={bodyHeight}
        actions={actions}
        dialog={dialog}
        editor={drafts.get(chatId) ?? emptyEditor}
        setEditor={(s) => setDrafts((d) => new Map(d).set(chatId, s))}
        history={history}
        pushHistory={pushHistory}
        version={version}
        onCycle={cycle}
      />
    );
  } else if (panel) {
    body = <Panel text={panel} width={width} height={bodyHeight} onClose={() => setPanel(null)} />;
  } else {
    body = (
      <ChatList
        store={store}
        width={width}
        height={bodyHeight}
        actions={actions}
        dialog={dialog}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        history={history}
      />
    );
  }

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header store={store} width={width} />
      {body}
    </Box>
  );
}
