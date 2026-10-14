import pkg from '../package.json';
import { defineApp } from 'termcore/app/suite';

/** termchat as termcore sees it: name, protocol `termchat/1`, ports 5050/5051, `TERMCHAT_*`, repo, version. */
export const APP = defineApp('termchat', pkg);
