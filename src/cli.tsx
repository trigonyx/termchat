import { render } from 'ink';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolvePaths } from './core/paths.js';
import { fetchLatestVersion, compareVersions, installHint, installKind, restartRequested, runInstall, SOURCE_HINT } from './core/update.js';
import { REPO_CONFIGURED, VERSION } from './core/version.js';
import { Root } from './ui/App.js';
import { MOUSE_OFF, MOUSE_ON, MouseFilterStdin } from './ui/mouse.js';

const HELP = `termchat – end-to-end encrypted chat for your local network

Usage: termchat [options]
       termchat update   Install the latest version from GitHub

  --home <dir>      Data directory (default: ~/.termchat, or $TERMCHAT_HOME)
  --port <port>     TCP port (default: 5050, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/termchat.log
  -h, --help        Show this help
  -v, --version     Show the version
`;

const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
const ALT_SCREEN_OFF = '\u001b[?1049l';
const SHOW_CURSOR = '\u001b[?25h';

/** `termchat update`: same as running INSTALL_CMD, with a version check first. */
async function update(): Promise<number> {
  if (installKind() === 'source') {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, '')}\n`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json → repository).\n");
    return 1;
  }
  process.stdout.write('Checking for updates …\n');
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`termchat ${VERSION} is up to date.\n`);
    return 0;
  }
  process.stdout.write(latest ? `Updating termchat ${VERSION} → ${latest} …\n` : `Couldn't check the latest version – installing anyway …\n`);
  const res = await runInstall({ inherit: true });
  if (res.ok) {
    process.stdout.write(`\nDone${latest ? ` – termchat ${latest} is installed` : ''}. Start it with: termchat\n`);
    return 0;
  }
  process.stderr.write(`\nUpdate failed. ${installHint(res.output) ?? 'See the npm output above.'}\n`);
  return 1;
}

function main(): void {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: 'string' },
        port: { type: 'string' },
        'no-discovery': { type: 'boolean' },
        debug: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
    }));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    process.exit(2);
  }

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`termchat ${VERSION}\n`);
    return;
  }
  if (positionals[0] === 'update' && positionals.length === 1) {
    void update().then((code) => process.exit(code));
    return;
  }
  if (positionals.length) {
    process.stderr.write(`Unknown command: ${positionals.join(' ')}\n\n${HELP}`);
    process.exit(2);
  }
  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}\n`);
      process.exit(2);
    }
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('termchat needs an interactive terminal.\n');
    process.exit(1);
  }

  const paths = resolvePaths(values.home);

  // full screen like vim/less – on exit the terminal is back to how it was
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  // mouse reporting: trackpad/wheel scroll the chat instead of sending ↑/↓
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on('exit', restore);
  const crash = (err: unknown) => {
    restore();
    process.stderr.write(`\ntermchat crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  for (const sig of ['SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(0));

  const app = render(
    <Root paths={paths} options={{ port, discovery: !values['no-discovery'], debug: values.debug }} />,
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) as unknown as NodeJS.ReadStream },
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      // after /update: start the freshly installed version in this terminal – and stop
      // reading the terminal here, so every keystroke goes to the new process
      process.stdin.removeAllListeners('data');
      process.stdin.pause();
      const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      child.on('error', () => process.exit(0));
    },
    crash,
  );
}

main();
