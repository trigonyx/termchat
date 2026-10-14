import { configDefaults, defineConfig } from 'vitest/config';
import { vitestTermcore } from 'termcore/build';

export default defineConfig({
  ...vitestTermcore(),
  // old Claude Code worktrees are copies of the project, not tests of this one
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
