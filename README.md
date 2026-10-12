# termchat

End-to-end encrypted peer-to-peer chat for your local network, right in the terminal.
No server, no account: anyone on the same Wi-Fi shows up automatically.

```
 termchat  Alice · NMBU-CRR4                        192.168.1.20:5050 · ● 1 connected
──────────────────────────────────────────────────────────────────────────────────────
 REQUESTS · 1
 ❯ ◆ Carl               wants to chat with you

 CHATS
   ● Bob                You: are you there?                                09:04   2

 NEARBY
   ● Dana               on your network · 192.168.1.31
```

## Installation

Requires [Node.js](https://nodejs.org) 22 or newer and git.

```sh
npm i -g github:trigonyx/termchat
termchat
```

### Updating

termchat checks for a new version every time it starts. If there is one, the header shows
`⬆ 1.2.0 available · /update`. Update in whichever way is handiest:

- inside termchat: `/update` (installs it and offers to restart)
- in a terminal: `termchat update`
- or the install command again: `npm i -g github:trigonyx/termchat`

Your profile, contacts and chats live in `~/.termchat` and are kept across updates.

If npm says `EACCES` (no permission to install globally), either use `sudo npm i -g github:trigonyx/termchat`
or install Node via a version manager such as [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm) or Homebrew.

## How it works

- **First launch:** you pick a name. termchat generates a key pair, and your ID comes from it (e.g. `NMBU-CRR4-…`). It never changes, even if you change your name or IP address, so your contacts always recognize you.
- **Finding people:** all termchat instances on the same network see each other automatically under "Nearby", via UDP broadcast on port 5051. If someone's IP changes, the new one is picked up automatically. If the network blocks broadcasts (some school or office Wi-Fi does), press `a` and enter the IP.
- **Requests:** nobody can just message you. Whoever reaches out first appears under "Requests", and you decide with `enter` (accept) or `x` (decline).
- **Ticks:** `◷` not sent yet (your contact is offline – it's delivered automatically once you're both online again) · gray `✓` delivered, but not read yet · green `✓✓` read (they had the chat open with their terminal in front).
- **Group chats:** press `g`, name the group and tick the contacts to invite. Invites show up under "Requests". Everyone in the group can invite people and rename it; only the creator can remove members; anyone can leave.
- **Security:** every connection is authenticated and encrypted (X25519 + Ed25519 + ChaCha20-Poly1305, using only Node's built-in crypto). `/whois` shows a safety code. Compare it once in person, and you can rule out anyone sitting in the middle.

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
| `/name <name>` | change your display name |
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
| `/effects [nonstop\|brief\|off]` | how `<rgb>` / `<shine>` animate |
| `/notifications [on\|off]` | desktop notifications |
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
termchat --home <dir>      # different data directory (default ~/.termchat)
         --port <port>     # TCP port (default 5050)
         --no-discovery    # no automatic search
         --debug           # connection log at <home>/termchat.log
```

Two instances on one machine (to try it out):

```sh
termchat --home /tmp/alice --port 5060
termchat --home /tmp/bob   --port 5061
```

## Data

Everything lives in `~/.termchat/` (readable only by you):

- `identity.json`: your secret key. **Don't share it.** If it's lost, you get a new ID.
- `config.json`: name and port
- `contacts.json`: contacts, including their last known address
- `history/<id>.jsonl`: chat histories
- `groups/<gid>.jsonl`, `groups.json`: group logs and unread counters
- `peers.json`: addresses of group members who aren't contacts
