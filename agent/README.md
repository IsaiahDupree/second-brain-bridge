# second-brain-agent

The Mac-side half of **SecondBrainBridge** — it lets ChatGPT and Claude search and read your
**Obsidian-style Markdown knowledge vault** (a folder of `.md` notes). This tiny agent runs on
your Mac, connects to the SecondBrainBridge relay, and does the actual work against your vault
(via the local filesystem). Your notes never leave your machine except for the specific passage
a request asks for.

- No account, no password, no cloud copy of your notes.
- One command to pair, one command to keep it running forever.
- No dependencies — just Node 18+.

---

## Quick start

You need [Node.js 18 or newer](https://nodejs.org). Then:

```sh
# 1. On the SecondBrainBridge site, click "Connect my Mac" to get a pairing code.
# 2. Pair this Mac (replace ABCD-1234 with your code):
npx second-brain-agent pair ABCD-1234

# 3. Point the agent at your vault (the folder that holds your .md notes):
export SECONDBRAIN_VAULT="$HOME/Documents/Obsidian/MyVault"

# 4. Keep it running in the background — starts on login, restarts if it crashes:
npx second-brain-agent install
```

That's it. You can close the terminal — the agent keeps running.

### Point the agent at your vault

This is the one setup step that matters. The agent works against a **folder of Markdown
notes** — your Obsidian vault, or any directory of `.md` files. It resolves the vault in this
order:

1. **`SECONDBRAIN_VAULT`** environment variable — an absolute path to your vault folder.
2. The **`vault`** field in `~/.secondbrainbridge-agent.json` (add it next to your token).
3. **Common Obsidian locations** it can auto-detect (e.g. `~/Documents`, `~/Obsidian`, iCloud
   Obsidian folders).

To pin it explicitly, either export the variable before `install`, or edit the config file:

```json
{
  "vault": "/Users/you/Documents/Obsidian/MyVault"
}
```

> **First-run permission prompt:** the agent reads your vault folder through the filesystem.
> If that folder lives in a protected location (Documents, Desktop, or iCloud Drive), macOS
> shows a one-time prompt asking to allow access to files in that folder. Click **OK**. If you
> miss it, enable it later under
> **System Settings → Privacy & Security → Files and Folders**.
>
> The agent does **not** use Automation / Apple Events — there is no "allow control of another
> app" prompt. It only reads (and, on Pro, writes) `.md` files in the folder you point it at.

### Want it permanent? Install globally

`npx` runs from a cache that npm can prune, which would break the background agent.
For an always-on setup, install it globally so the path is stable:

```sh
npm install -g second-brain-agent
second-brain-agent pair ABCD-1234
second-brain-agent install
```

---

## Commands

| Command | What it does |
|---|---|
| `second-brain-agent pair <CODE>` | Claim a pairing code and save the agent token to `~/.secondbrainbridge-agent.json` (mode 600). |
| `second-brain-agent install` | Install a macOS LaunchAgent so the agent auto-starts on login and restarts on crash. |
| `second-brain-agent run` | Run the agent in the foreground (Ctrl-C to stop). `install` does this for you in the background. |
| `second-brain-agent status` | Check that you're paired, the server is reachable, and whether auto-start is installed. |
| `second-brain-agent logs` | Show the last ~50 lines of the background agent log. |
| `second-brain-agent uninstall` | Stop and remove the background agent (LaunchAgent). |
| `second-brain-agent --version` | Print the version. |
| `second-brain-agent --help` | Show usage. |

All commands accept `--server <URL>` to point at a different relay
(default: `https://secondbrainbridge.vercel.app`).

---

## How it works

```
ChatGPT / Claude  ──MCP──▶  SecondBrainBridge relay  ◀──poll──  second-brain-agent (your Mac)
                                                                │
                                                                ▼
                                                           Markdown vault
                                                          (a folder of .md
                                                           notes, via Node fs)
```

The agent long-polls the relay for jobs, runs each one against your vault folder using Node's
built-in filesystem (`fs`) — **no `osascript`, no JXA, no Apple Events** — and posts the result
back. When there's nothing to do it just idles. It indexes your notes, retrieves the passages
most relevant to a query (ranked keyword + title match), reads individual notes, resolves
`[[wikilink]]` backlinks, and (on Pro) creates new notes.

It serves seven tools:

| Tool | What it does | Tier |
|---|---|---|
| `search_knowledge` | Rank and return the notes/passages most relevant to a query. | Free (capped) |
| `ask` | Answer a question using retrieved passages from your vault. | Free (capped) |
| `get_note` | Return the full contents of a specific note. | Free (capped) |
| `list_sources` | List the folders / notes available in the vault. | Free |
| `backlinks` | Resolve `[[wikilink]]` backlinks — which notes link to a given note. | **Pro** |
| `create_note` | Create a new `.md` note in the vault. | **Pro** |
| `get_plan` | Report the current plan (Free or Pro) and what's unlocked. | Free |

- Config/token: `~/.secondbrainbridge-agent.json` (permissions `600`; holds your token and,
  optionally, the `vault` path).
- Background logs: `~/Library/Logs/secondbrainbridge-agent.log` and
  `secondbrainbridge-agent.err.log`.
- LaunchAgent: `~/Library/LaunchAgents/com.secondbrainbridge.second-brain-agent.plist`.

### Free vs Pro

Billing and gating live in the relay (server side) — the agent just does the work it's asked
to. On the **Free** tier, `search_knowledge`, `ask`, and `get_note` are capped. **Pro**
($8/mo, billed via Stripe) lifts the caps and unlocks `backlinks`, `create_note`, and cloud
aggregation across devices (coming). Manage your plan from the SecondBrainBridge site.

---

## Troubleshooting

**"Not paired" / it stopped working after a while.**
Your pairing token may have been revoked. Re-pair and reinstall:

```sh
second-brain-agent pair <NEW-CODE>
second-brain-agent install
```

If the background agent hit a `401`, it writes `~/.secondbrainbridge-agent.unauthorized`
and keeps the reason in the error log — check `second-brain-agent logs`.

**Notes aren't being found or read.**
First make sure the agent knows where your vault is — set `SECONDBRAIN_VAULT` or the `vault`
field in `~/.secondbrainbridge-agent.json` (see [Point the agent at your vault](#point-the-agent-at-your-vault)).
If the vault is in a protected folder, make sure it's allowed under
**System Settings → Privacy & Security → Files and Folders**. Then
`second-brain-agent uninstall` and `install` again.

**Check what's happening.**

```sh
second-brain-agent status   # paired? reachable? auto-start installed?
second-brain-agent logs     # recent activity + errors
```

**Uninstall completely.**

```sh
second-brain-agent uninstall
rm ~/.secondbrainbridge-agent.json   # also forget the pairing token
```

**Non-macOS.** `install`/`uninstall`/`logs` are macOS-only (they use LaunchAgents).
`pair`, `run`, and `status` work anywhere Node runs, and because the agent reads a plain folder
of `.md` files, the vault work itself is cross-platform.

---

## Privacy

The agent only contacts the relay server you paired with. It sends the result of the specific
knowledge-vault operation you (via ChatGPT/Claude) requested — a ranked passage, a note's
contents, a set of backlinks — and nothing else. Your notes are not uploaded or indexed
anywhere off your Mac.

## License

MIT © Isaiah Dupree
