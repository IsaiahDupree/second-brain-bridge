# SecondBrainBridge owner restoration — 2026-10-24

## Implemented and deployed

- Relay 1.4 uses service-specific storage tables and RPC functions on the required shared Supabase project. RLS is enabled and public/anon/authenticated grants are revoked; service_role alone has access. No other bridge's tables/functions were replaced.
- Production refuses missing persistent storage configuration. RPC requests are bounded to ten seconds. Health reports HTTP 503 when storage or signing configuration is unavailable. The production deployment passed a health check with all checks true.
- The owner account is registered as isaiahdupree33@gmail.com, is non-demo, and passes actual production password login. A separate random32-character password is saved and encrypted-save verified in the existing KeePass vault. No credential values are stored in this report or Git. Email delivery is not configured in these deployments: the existing application marks the account verified automatically; no inbox-verification claim is made.
- The owner Mac is paired, and the agent is installed as a login LaunchAgent. Job logs no longer print private tool arguments.
- Agent and server test suites pass. The real storage integration verifies persistent get/set, FIFO, counter and expiry using temporary integration keys and cleanup.

## Acceptance still in progress

Browser reconnect, refreshed tool definitions and installed-plugin data reads are being verified separately. Intermittent production RPC timeouts and native macOS permission prompts were observed and are not counted as successful data reads.

The private local SQLite snapshot contains all2,578 Markdown/text files from the actual selected owner vault. The live integration verified exact independent inventory coverage, mode600 storage, three live text comparisons, search and fetch. Incremental refresh runs every900seconds and exits between runs. Search/list responses report freshness; direct fetch reads current files. Symlinks and dot directories are excluded; there is no silent5,000-file cap. Creation refuses overwrites and invalidates the snapshot. Source agent1.1 requires Node22.13+; no npm publication is claimed.

## Final installed connection acceptance

Installed ChatGPT reconnection and Refresh tools completed. The installed list_sources tool returned 2,578 real indexed notes; search_knowledge returned actual matching vault passages. The local live-index test independently checked complete file coverage, permissions, search and three file-text comparisons.

The hosted agent long-poll now caps its wait at 15 seconds, reserving the other half of Vercel’s 30-second limit for authentication and persistent-storage calls. This addresses observed idle-poll 504s; upstream database connectivity can still fail explicitly rather than returning sample data. Existing server unit tests passed after the change.
