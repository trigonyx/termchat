#!/usr/bin/env node
// npm run release [patch|minor|major]
// Checks, bumps the version, commits + tags and pushes. Everyone running termchat
// gets told about the new version on their next launch.
import { execFileSync } from 'node:child_process';

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: npm run release [patch|minor|major]');
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Commit your changes first – the working tree is not clean:\n' + dirty);
  process.exit(1);
}

try {
  run(npm, ['run', 'typecheck']);
  run(npm, ['test']);
  run(npm, ['version', bump, '-m', 'Release v%s']);
  run('git', ['push', '--follow-tags']);
} catch {
  console.error('\nRelease aborted.');
  process.exit(1);
}
console.log('\nReleased. Friends see the update the next time they start termchat.');
