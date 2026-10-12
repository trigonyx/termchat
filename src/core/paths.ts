import os from 'node:os';
import path from 'node:path';

export interface Paths {
  home: string;
  identity: string;
  config: string;
  contacts: string;
  historyDir: string;
  groupsDir: string;
  groupsMeta: string;
  peers: string;
  log: string;
}

export function resolvePaths(home?: string): Paths {
  const root = path.resolve(home ?? process.env.TERMCHAT_HOME ?? path.join(os.homedir(), '.termchat'));
  return {
    home: root,
    identity: path.join(root, 'identity.json'),
    config: path.join(root, 'config.json'),
    contacts: path.join(root, 'contacts.json'),
    historyDir: path.join(root, 'history'),
    groupsDir: path.join(root, 'groups'),
    groupsMeta: path.join(root, 'groups.json'),
    peers: path.join(root, 'peers.json'),
    log: path.join(root, 'termchat.log'),
  };
}
