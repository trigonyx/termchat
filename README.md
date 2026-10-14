# termchat

End-to-end encrypted peer-to-peer chat for your local network, right in the terminal.
No server, no account: anyone on the same Wi-Fi shows up automatically.

```
 termchat  v2.0.0  Alice · NMBU-CRR4                192.168.1.20:5050 · ● 1 connected
──────────────────────────────────────────────────────────────────────────────────────
 REQUESTS · 1
 ❯ ◆ Carl               wants to chat with you

 CHATS
   ● Bob                You: are you there?                                09:04   2

 NEARBY
   ● Dana               on your network · 192.168.1.31
```

## Installation

Requires [Node.js](https://nodejs.org) 22 or newer.

```sh
npm i -g https://github.com/trigonyx/termchat/tarball/main
termchat
```

### Updating

termchat checks for a new version every time it starts. If there is one, the header shows
`⬆ 1.2.0 available · /update`. Update in whichever way is handiest:

- inside termchat: `/update` (installs it and offers to restart)
- in a terminal: `termchat update`
- or the install command again: `npm i -g https://github.com/trigonyx/termchat/tarball/main`

Your profile and contacts live in `~/.termhub` (shared with keyrace and termdrop), your chats in
`~/.termchat`. Both are kept across updates.

Updates never need `sudo`. If Node came from the nodejs.org installer, npm's global folder belongs to root, so
`/update` and `termchat update` install the new version into `~/.termchat/app` instead, and the `termchat`
command always starts the newest version it finds. (Coming from 1.2.0 or older with such a setup? Run
`sudo termchat update` one last time; the old version can't do it without.)

Only the first install may need `sudo` on such a setup: if npm says `EACCES`, use `sudo npm i -g https://github.com/trigonyx/termchat/tarball/main`,
or install Node via a version manager such as [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm) or Homebrew.

## One profile for termchat, keyrace and termdrop

termchat, [keyrace](https://github.com/trigonyx/keyrace) and [termdrop](https://github.com/trigonyx/termdrop) share
one identity, one name and one contact list (in `~/.termhub`). Become friends in any of them, and you're friends
in all of them – even while several are open at the same time, a change in one shows up in the others right
away. Each app still has its own view (requests, Nearby, `a`, `/remove`, `/block` …), and they all work on the
same list.

**Coming from termchat 1.x?** Your contacts carry over automatically, and your termchat ID stays the same – it
becomes the shared one, so your chats and groups go on exactly as before. The first time a 2.x app starts, it
moves the identities, names and contact lists of all three apps into `~/.termhub` (the old files are kept as a
backup in `~/.termhub/legacy`). Friends who updated too recognize you everywhere under that one ID through a
signed link – **ask your friends to update too.** An older termchat still sees you as before.

**termhub** – one app to see all your friends and where they're online, set your profile color and status,
and start chats, races and transfers from one place – is coming soon.

## How it works

- **First launch:** you pick a name (unless keyrace or termdrop already asked you). termchat generates a key pair, and your ID comes from it (e.g. `NMBU-CRR4-…`). It never changes, even if you change your name or IP address, so your contacts always recognize you.
- **Finding people:** all termchat instances on the same network see each other automatically under "Nearby" (UDP port 5051). Many school and office Wi-Fis drop broadcasts, so termchat also asks every address of your subnet directly once at startup and whenever your IP changes (about 100 small packets per second, a few seconds for a typical network, at most the /16 around you), checks where your contacts were last seen, and passes on the addresses it knows, so finding one person is enough to find the rest. Contacts are recognized by their ID, never their IP: if a friend's IP changes, termchat picks up the new one and reconnects on its own. If someone still doesn't show up (for example on a different subnet), press `a` and enter their IP.
- **Firewalls:** chats need a direct connection, and it's enough if one of the two computers accepts incoming connections (whoever can't be reached asks the other to connect instead). If neither does, termchat tells you in the chat. Then allow Node.js in the firewall: on Windows, also for *public* networks (school Wi-Fi usually counts as public); on macOS, click "Allow" when asked whether node may accept incoming connections.
- **Requests:** nobody can just message you. Whoever reaches out first appears under "Requests", and you decide with `enter` (accept) or `x` (decline).
- **Ticks:** `◷` not sent yet (your contact is offline – it's delivered automatically once you're both online again) · gray `✓` delivered, but not read yet · green `✓✓` read (they had the chat open with their terminal in front).
- **Group chats:** press `g`, name the group and tick the contacts to invite. Invites show up under "Requests". Everyone in the group can invite people and rename it; only the creator can remove members; anyone can leave.
- **Security:** every connection is authenticated and encrypted (X25519 + Ed25519 + ChaCha20-Poly1305, using only Node's built-in crypto). `/whois` shows a safety code. Compare it once in person, and you can rule out anyone sitting in the middle.
- **Profile color and status:** contacts who picked a profile color show up in it – in the list, the chat header and group chats (otherwise in a color from their ID) – and their status (busy, do not disturb, a short message) appears next to their name. You set yours in termhub (coming soon); until then you can edit `~/.termhub/profile.json`. In **do not disturb**, messages arrive as usual but quietly: no pop-up, no desktop notification.

## Usage

| Chat list | |
|---|---|
| `↑` `↓` / `j` `k` | select |
| `enter` | open chat · accept request · send request |
| `x` | decline request |
| `a` | add contact by IP |
| `g` | new group chat |
| `r` / `d` | rename / remove (groups: leave or delete) |
| `/` | enter a command |
| `?` | help |
| `q` / `ctrl+c` | quit |

| Chat | |
|---|---|
| `enter` | send |
| `alt+enter` or `\` + `enter` | new line |
| `esc` | back to the list |
| trackpad / mouse wheel | scroll |
| `pgup` / `pgdn` | scroll a page (on a Mac: `shift+fn+↑/↓`, see below) |
| `ctrl+n` / `ctrl+p` | next / previous chat |
| `↑` / `↓` | previous inputs |
| `/` | command menu (`tab` completes) |
| `<` | tag menu for `<rgb>` / `<shine>` (`tab`/`enter` inserts, `esc` closes) |

**Markdown** is rendered on the recipient's side: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``,
`# Heading`, `> Quote`, lists, code blocks with syntax highlighting, tables.
Code is shown on a shaded background without border characters, so selecting it with the mouse copies clean code.
Code pasted between single backticks keeps its lines and indentation; ```` ```js ```` blocks get syntax highlighting.
`/copy` puts the last code block (or the last message) on the clipboard.
Two animated tags are available as well (type `<` to pick one):
`<rgb>text</rgb>` (rainbow colors running from right to left, the closing tag is completed while you type) and
`<shine color="gold">text</shine>` (text in that color, with a light shimmer running over it every few seconds;
`color` is a name like `red`, `gold`, `cyan`, `pink` … or `#rrggbb`). Clients without this feature just show the tags.
By default effects play for 8 seconds when they appear and then rest, so the screen stays still and you can select text.
`/effects nonstop` keeps them moving, `/effects off` shows them without animation, and `/effects brief` is the default.
To send a message that starts with `/`, type `//`.

### Commands

| Command | |
|---|---|
| `/help` | all commands |
| `/me` | your name, ID and address |
| `/name <name>` | change your display name (in all three apps) |
| `/add <ip[:port]>` | add a contact by IP |
| `/group <name>` | create a group and pick who to invite |
| `/accept` · `/decline` | accept / decline a request or group invite |
| `/request` | ask again after being declined |
| `/rename [name]` | nickname for a contact, or rename the group |
| `/invite` | invite contacts to the current group |
| `/members` | who's in the group |
| `/kick` | remove members (group creator only) |
| `/leave` | leave the group |
| `/whois` | details and safety code |
| `/block` · `/unblock` | block / unblock |
| `/clear` | clear the view (history is kept) |
| `/delete` | delete the history (groups: after leaving) |
| `/remove` | remove the contact and its history |
| `/export [file]` | save the history as Markdown |
| `/copy` | copy the last code block (or message) to the clipboard |
| `/effects [nonstop\|brief\|off]` | how `<rgb>` / `<shine>` and the logos animate (all three apps) |
| `/notifications [on\|off]` | desktop notifications (for all three apps) |
| `/update` | install the latest version |
| `/quit` | quit |

## On macOS

- **Notifications:** on macOS, a system banner (sender + preview) appears when a message arrives while the terminal window is in the background. Toggle with `/notifications on|off`. The banner position is set by macOS (System Settings → Notifications), and it needs a terminal that reports focus (Terminal.app, iTerm2).
- **Scrolling:** mouse wheel or two-finger swipe on the trackpad (also `↑/↓`; `shift+fn+↑/↓` pages in Terminal.app).
- **Selecting text:** just click and drag – termchat doesn't capture the mouse, only the wheel is turned into ↑/↓ by the terminal (alternate scroll mode). `alt+↑/↓` recalls input history. While `<rgb>`/`<shine>` are animating the screen redraws and the terminal drops the selection – wait until they rest (8 s) or use `/effects off`.

## Group chats

A group is a set of signed events (created, invited, joined, message, …). Every member keeps a copy, and whenever two members are connected they exchange what the other one is missing. That means:

- **No server:** messages go directly between members.
- **Others forward for you:** if Carl is offline when Bob writes, Carl still gets the message later from anyone else in the group – even if Bob is long gone. Every event is signed by its author, so nobody can fake or alter messages on the way.
- **Ticks:** `◷` nobody has it yet · `✓ 1/3` some members have it · `✓` everyone has it (groups have no read receipts).
- **New members** don't see messages from before they were invited.
- **Only your contacts** can invite you; invites from strangers are ignored.
- Up to 32 members per group.

## Options

```
termchat --home <dir>      # different data directory: <dir> instead of ~/.termhub, <dir>/termchat
                           # instead of ~/.termchat (or $TERMHUB_HOME)
         --port <port>     # TCP port (default 5050)
         --no-discovery    # no automatic search
         --debug           # connection log at <home>/termchat.log
```

Two instances on one machine (to try it out):

```sh
termchat --home /tmp/alice --port 5060
termchat --home /tmp/bob   --port 5061
```

keyrace or termdrop with the same `--home` are the same person, with the same contacts.

## Data

Readable only by you. Shared by termchat, keyrace and termdrop, in `~/.termhub/`:

- `identity.json`: your secret key. **Don't share it.** If it's lost, you get a new ID.
- `profile.json`: your name, profile color and status
- `friends.json`: your contacts (and requests), with their last known address, your nicknames and unread counters
- `peers.json`: addresses of group members who aren't contacts
- `settings.json`: accent color, animations (`/effects`), desktop notifications
- `links.json`: links from your old IDs (one per app before 2.0) to the shared one, and the ones your friends sent
- `legacy/`: backups of the old identities and contact lists from before 2.0

termchat's own, in `~/.termchat/`:

- `config.json`: port
- `history/<id>.jsonl`: chat histories
- `groups/<gid>.jsonl`, `groups.json`: group logs and unread counters
- `termchat.lock` and `termchat.sock`: held by the running termchat (one per data folder)

## Development

```sh
npm install                          # needs ../termcore next to this folder
npm run dev -- --home /tmp/alice     # run from source
npm test
npm run typecheck
```

Identity, encryption, discovery, contacts and the shared data folder come from termcore (a sibling repo),
which is bundled into `dist/` – nothing extra to install.
