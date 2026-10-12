import pkg from '../../package.json';

export const VERSION: string = pkg.version;

/** "owner/repo", taken from package.json → repository (the single place that names the repo). */
export const REPO: string = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? 'OWNER/termchat';

/** False until package.json names the real GitHub repo – no update checks or installs before that. */
export const REPO_CONFIGURED = !REPO.startsWith('OWNER/');

export const INSTALL_CMD = `npm i -g github:${REPO}`;
