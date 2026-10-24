<div align="center">

# 🧠 SecondBrainBridge

**Your Obsidian vault, searchable and reasoned over — inside ChatGPT, from your own Mac.**

[![License: MIT](https://img.shields.io/badge/License-MIT-f5b942.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/second-brain-agent.svg?color=4ade80&label=second-brain-agent)](https://www.npmjs.com/package/second-brain-agent)

</div>

SecondBrainBridge is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) connector that lets ChatGPT search and reason over your **Obsidian-style Markdown vault** — a folder of notes on your Mac. Reads execute locally and requested results pass through the authenticated relay — every action runs on **your own Mac** through a tiny local agent. The cloud piece is only a stateless relay that shuttles requests between ChatGPT and your Mac.

```
  ChatGPT  ──OAuth──►  SecondBrainBridge relay  ──job queue──►  second-brain-agent  ──►  Obsidian vault
 (connector)          (Vercel, stateless)      (your Mac, polls & executes)      (Markdown notes on your Mac)
```

Your Mac is the only place your notes are ever read or written. The relay stores only short-lived job payloads and your account record; it never sees note content unless a job is in flight, and jobs expire in seconds.

---

## For users — 3 steps

**1. Create your account** at **[secondbrainbridge.vercel.app](https://secondbrainbridge.vercel.app)** and generate a pairing code.

**2. Install the Mac agent** (needs [Node 18+](https://nodejs.org)):

```bash
npx second-brain-agent pair <YOUR-CODE>   # link this Mac to your account
npx second-brain-agent install            # keep it running on every restart
```

Point it at your vault folder — set `SECONDBRAIN_VAULT=/path/to/your/vault`, or save the path in `~/.secondbrainbridge-agent.json`. The first time the agent reads a vault kept in a protected location (Documents, Desktop, or iCloud Drive), macOS asks **once for Files-and-Folders access** — click **OK**.

**3. Connect ChatGPT:** Settings → **Plugins** → turn on **Developer mode** (Security & login) → **Create** a custom plugin → paste the MCP Server URL **`https://secondbrainbridge.vercel.app/mcp`** → Authentication **OAuth** → sign in & **Allow**.

That's it. In a new chat: *"Search my notes for the Q3 planning doc"* or *"What did I decide about Project Atlas?"*

> Your Mac must be awake with the agent running. `npx second-brain-agent install` makes it start automatically at login and restart if it ever crashes.

### Managing the agent

```bash
npx second-brain-agent status      # is it paired & reachable?
npx second-brain-agent logs        # recent activity
npx second-brain-agent uninstall   # stop auto-start
```

---

## What ChatGPT can do

| Tool | Action | Plan |
|------|--------|------|
| `search_knowledge` | Search your vault by keyword; returns ranked passages | Free |
| `ask` | Ask a question and get an answer grounded in your own notes | Free |
| `get_note` | Read one full note by title or id | Free |
| `list_sources` | List the folders/sources in your vault | Free |
| `backlinks` | Show the notes that link to a note (the `[[wikilinks]]` graph) | **Pro** |
| `create_note` | Create a new Markdown note in your vault | **Pro** |
| `get_plan` | Show your current plan and an upgrade link | Free |

Retrieval is v1 ranked keyword + title match, so answers stay grounded in the passages that actually appear in your notes. (Semantic/cloud ranking is a Pro/cloud enhancement.)

---

## Plans

SecondBrainBridge is free to start. Upgrade to **Pro** when you want the full graph and write access.

| | Free | Pro — **$8/mo** |
|---|:---:|:---:|
| Search, ask, and read your notes | ✓ | ✓ |
| List folders/sources | ✓ | ✓ |
| Searches per day | 20 / day | **Unlimited** |
| Backlinks / `[[wikilinks]]` graph | — | ✓ |
| Create notes from chat | — | ✓ |
| Cloud aggregation across Macs | — | *coming soon* |

Billing is handled by **[Stripe](https://stripe.com)**. Upgrade at **[secondbrainbridge.vercel.app/upgrade](https://secondbrainbridge.vercel.app/upgrade)**, and run `get_plan` in any chat to see your current plan plus an upgrade link. The relay enforces the Free daily cap and gates the Pro tools by your Stripe subscription (test mode for now).

---

## Self-hosting

You can run your own relay so nothing depends on the hosted instance.

**Prereqs:** a [Vercel](https://vercel.com) account and a [Supabase](https://supabase.com) project (free tiers are fine).

1. **Storage** — in your Supabase project's SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates a tiny Redis-shaped KV + queue surface (`nb_*` functions) with RLS on.
2. **Deploy** the `server/` directory to Vercel.
3. **Set env vars** (see [`server/.env.example`](./server/.env.example)):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — your project + service-role key
   - `JWT_SECRET` — `openssl rand -hex 32`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — for the Pro tier (optional; Free-only if omitted)
4. **Verify:** `curl https://YOUR-APP.vercel.app/api/health` → `redisConfigured`, `redisOk`, `jwtSecretSet` all `true`.
5. Point the agent at it: `npx second-brain-agent pair <CODE> --server https://YOUR-APP.vercel.app`.

---

## How it works

- **Auth** — OAuth 2.1 with PKCE and Dynamic Client Registration (RFC 7591). ChatGPT registers itself, the user signs in on the SecondBrainBridge consent page, and ChatGPT gets a scoped MCP access token. JWTs are HMAC-signed; three kinds (`session`, `agent`, `mcp`) with distinct privileges. Optional email verification via Resend (`RESEND_API_KEY`); off unless configured, and enforcement is opt-in (`REQUIRE_EMAIL_VERIFICATION`).
- **Relay** — MCP tool call → job pushed to `jobs:<user>` (TTL ≤ the caller's wait window, so an abandoned job can't run late) → the Mac agent (holding a hanging long-poll) is handed the job within ~200ms, executes it, pushes the result → the MCP handler returns it. The long-poll means jobs are delivered on arrival rather than on a fixed interval, so relay overhead is ~300ms instead of ~1s. The agent is considered "online" only while it's actively connected. The relay also enforces the Free daily search cap and unlocks the Pro tools based on the account's Stripe subscription.
- **Agent** — a dependency-free Node CLI. It indexes the Markdown files in your vault folder and answers retrieval queries locally (ranked keyword + title match); `create_note` writes a new Markdown file into the vault. Reads and writes happen straight against the filesystem — the first touch of a protected folder triggers the one-time macOS Files-and-Folders prompt. A macOS LaunchAgent keeps it alive across logins and crashes.

## Repository layout

```
server/    Vercel functions: OAuth + MCP endpoint + relay + Stripe billing   (deploy this)
agent/     second-brain-agent — the npm-published Mac CLI that indexes your vault  (users npx this)
kit/       Browser automations: register the dev-mode connector AND
           fill the OpenAI directory submission (see kit/README.md)
supabase/  schema.sql for self-hosting the storage
test/      end-to-end OAuth + MCP integration test
```

## Development

```bash
# server
cd server && cp .env.example .env.local   # fill in, then: vercel dev
# end-to-end test against a live deployment (reads ../.env.local)
node test/e2e-oauth.mjs
# agent unit tests
node --test agent/test-agent-unit.mjs
```

## Security & privacy

- Notes are read/written **only on your Mac**. The relay temporarily stores requested content in short-lived job/result queues — job payloads live in Redis-shaped storage with a short TTL and are deleted on delivery.
- The agent token (and your vault path) is stored at `~/.secondbrainbridge-agent.json` (mode `600`); the vault path can also come from `SECONDBRAIN_VAULT`.
- No secrets are committed; see [`.gitignore`](./.gitignore) and the `.env.example` files.
- The write tool (`create_note`) is marked destructive so ChatGPT asks before adding a note.

## License

[MIT](./LICENSE) © Isaiah Dupree

## Production storage and owner verification

Relay 1.4 uses isolated service-role-only tables/functions on the configured shared Supabase project. Production refuses missing storage configuration, bounds RPC requests to ten seconds, and returns HTTP 503 when storage or signing configuration is unavailable. Apply the checked-in isolated-storage migration before deploying this version; it does not replace another bridge's account tables or functions.

`node --env-file=.env.local test/live-storage.mjs` verifies the actual persistent store, FIFO, expiry and counters using temporary integration keys. `BRIDGE_SESSION_FILE=/private/owner-session.json BRIDGE_READ_TOOL=READ_TOOL node test/live-relay.mjs` verifies the actual owner session, PKCE OAuth, hosted MCP and paired-Mac read; choose this bridge's inventory tool. No reviewer data counts as a live acceptance. Credentials and sessions belong outside Git.

### Private vault index (source agent 1.1)

Requires Node 22.13+. Set the exact vault in the agent config, then run `node agent/cli.mjs index-install`. This builds a private SQLite snapshot under `~/Library/Application Support/SecondBrainBridge/` and incrementally checks changes every 15 minutes. It indexes Markdown/text files, excludes dot directories and symlinks, and reports the complete count without a silent 5,000-file cap. Search/list responses include the snapshot time and 15-minute freshness boundary. Fetch reads current file text; creating a note refuses overwrites and invalidates the snapshot. No embedding/model service is started.

`node agent/cli.mjs index-status` reports counts and freshness. `node test/live-index.mjs` checks actual ID coverage, private permissions, live text comparisons and read/search results. `uninstall` removes the refresh job while retaining the private index. No npm publication is claimed for this source upgrade.
