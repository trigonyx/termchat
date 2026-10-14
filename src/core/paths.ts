import path from 'node:path';
import { basePaths, type BasePaths } from 'termcore/app/paths';

/** termchat's own files, next to the shared ones in `hub` (~/.termhub). */
export interface Paths extends BasePaths {
  /** history/<id>.jsonl: one chat history per contact */
  historyDir: string;
  /** groups/<gid>.jsonl: the signed events of each group */
  groupsDir: string;
  /** groups.json: unread counters and last activity per group */
  groupsMeta: string;
}

/**
 * `home` (--home) moves everything: the shared data into `<home>`, termchat's own into
 * `<home>/termchat`. Default: ~/.termhub and ~/.termchat.
 */
export function resolvePaths(home?: string, env: NodeJS.ProcessEnv = process.env): Paths {
  const base = basePaths('termchat', home, env);
  return {
    ...base,
    historyDir: path.join(base.home, 'history'),
    groupsDir: path.join(base.home, 'groups'),
    groupsMeta: path.join(base.home, 'groups.json'),
  };
}
