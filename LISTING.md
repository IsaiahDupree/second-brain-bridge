# SecondBrainBridge — paste-ready submission answers

Fill the OpenAI plugin submission form (platform.openai.com/plugins → **Create
plugin** → **With MCP**) with the values below. Fields verified against the live
portal on 2026-07-17. Requires developer identity verification first (see
SUBMISSION.md).

---

## Connection

| Field | Value |
|---|---|
| MCP Server URL | `https://secondbrainbridge.vercel.app/mcp` |
| Authentication | OAuth |
| OAuth — the portal auto-discovers these from the URL's `/.well-known` metadata | authorization: `https://secondbrainbridge.vercel.app/oauth/authorize` · token: `https://secondbrainbridge.vercel.app/api/oauth/token` · registration (DCR): `https://secondbrainbridge.vercel.app/api/oauth/register` · PKCE S256 · scope `knowledge` |

After entering the URL, click **Scan Tools** — it should discover all 7 tools.

## Listing (App Info section — exact fields on the live form)

| Field | Value |
|---|---|
| **Name** | SecondBrainBridge |
| **Subtitle** ⚠️ ≤30 chars | `Search your Obsidian notes` |
| **Category** | Productivity |
| **Developer Identity** | Business — Dupree Ops LLC *(the verified identity; requires ID verification first)* |
| **Plugin Author** | Isaiah Dupree |
| **Website URL** | `https://secondbrainbridge.vercel.app` |
| **Customer support URL** | `https://secondbrainbridge.vercel.app/support` |
| **Privacy policy URL** | `https://secondbrainbridge.vercel.app/privacy` |
| **Terms of Service URL** | `https://secondbrainbridge.vercel.app/terms` |
| **Demo Recording URL** ⚠️ required | *(a hosted screen-recording of the plugin working — you must record this)* |
| **Directory icon / composer icon** | `assets/icon-512.png` (512×512 PNG) |
| **Commerce & Purchasing** | leave unchecked — Pro billing is handled externally by Stripe, not through ChatGPT |

**Description:**
> SecondBrainBridge connects ChatGPT to your Obsidian-style Markdown vault — the folder of notes on your Mac. Ask a question and get an answer grounded in your own notes, search your vault by keyword, read any note, or browse your folders. Free to use for search, ask, and read (up to 20 searches/day). **Pro ($8/mo, billed by Stripe)** unlocks unlimited searches, the `[[wikilinks]]` backlinks graph, and creating notes from chat — upgrade at `/upgrade`, and run `get_plan` any time to see your plan and upgrade link. Your notes never live on our servers: every action is executed on your own Mac by a small open-source agent you install with one command (`npx second-brain-agent`), and the relay only carries each request for the seconds it's in flight. Write actions are always confirmed by you in ChatGPT before they happen. Open source (MIT) and self-hostable.

*These values are also encoded in [`kit/submission.config.json`](./kit/submission.config.json), which `kit/submit-plugin.mjs` fills automatically.*

## Demo / reviewer account (no MFA)

> This connector normally relays to the user's own Mac. For review, sign in with
> the account below — it runs every tool against a built-in **sample vault**, and
> the account is treated as **Pro**, so all 7 tools (including the Pro-only
> `backlinks` and `create_note`) work 24/7 with no desktop app or pairing required.
> The sample vault contains fictional notes: *Q3 Planning, OKRs, Deep Work,
> Project Atlas, Sourdough, Reading List*.

- Email: `reviewer@secondbrainbridge.demo`
- Password: *(the `DEMO_PASSWORD` value in `.env.local` — paste it here at submission)*

## Test prompts & expected responses

Sign in as the reviewer account (it's Pro, so every tool works), add the connector
via OAuth, then run this end-to-end flow against the sample vault:

1. **"List the folders in my knowledge vault"** → `list_sources` →
   `{ "sources": [ { "name": "Planning", "notes": 2 }, { "name": "Projects", "notes": 2 }, { "name": "Personal", "notes": 2 } ] }`
2. **"Search my notes for quarter goals"** → `search_knowledge` (`"quarter goals"`) →
   `{ "results": [ { "id": "okrs", "title": "OKRs", "snippet": "Q3 objectives and key results…" }, { "id": "q3-planning", "title": "Q3 Planning", "snippet": "Roadmap and priorities for the quarter…" } ] }`
3. **"Open my OKRs note"** → `get_note` (`"OKRs"`) → returns the full body of the OKRs note.
4. **"What links to my OKRs note?"** → `backlinks` (`"OKRs"`, **Pro**) →
   `{ "backlinks": [ { "title": "Q3 Planning" }, { "title": "Project Atlas" } ] }`
5. **"Add a note called 'Weekly Review' to my Planning folder"** → `create_note` (**Pro**) →
   `{ "note": { "id": "weekly-review", "title": "Weekly Review", "source": "Planning" } }` (ChatGPT confirms before writing)

Finally, **"What plan am I on?"** → `get_plan` → returns the current plan (**Pro** for
the demo account) and the upgrade link, confirming the Free/Pro gating.

## Negative test cases (exactly 3 — prompts where SecondBrainBridge should NOT trigger)

1. **General productivity advice** — *"What's a good system for organizing my
   notes?"* — abstract question, no action on the user's own vault.
2. **A different app** — *"Search my Notion workspace."* — SecondBrainBridge only
   works with your local Obsidian/Markdown vault, not Notion, Evernote, or Google Docs.
3. **A task/to-do action** — *"Add milk to my shopping list."* — SecondBrainBridge
   reads and writes notes in your knowledge vault, not task lists or to-do apps.

## Release notes (first release)

> Initial release. SecondBrainBridge connects ChatGPT to your Obsidian-style
> Markdown vault through a small open-source agent that runs on your own Mac —
> ask questions grounded in your notes, search passages by keyword, read any note,
> and browse your folders. Free to start (search/ask/read, 20 searches/day); Pro
> ($8/mo via Stripe) unlocks unlimited searches, the `[[wikilinks]]` backlinks
> graph, and creating notes from chat. Every write is confirmed by you before it
> happens. Your notes never live on our servers; the cloud piece is only a
> stateless relay. Open source (MIT) and self-hostable.

## Tools declared (7)

`search_knowledge`, `ask`, `get_note`, `list_sources`, `backlinks` (Pro),
`create_note` (Pro), `get_plan` (the write tool `create_note` is annotated
destructive → ChatGPT confirms before adding a note; `backlinks` and `create_note`
require a Pro subscription).
