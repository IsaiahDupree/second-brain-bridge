// mcpTools.js — the MCP server exposed to ChatGPT. Read tools forward to the
// paired Mac agent (which searches the user's local vault); a few tools are
// gated behind the Pro plan. This is where monetization lives: free accounts get
// capped retrieval; Pro (Stripe subscription) unlocks unlimited search, the
// backlink graph, and note creation. (Tool names match the agent's
// knowledge-agent executor keys 1:1, plus a local get_plan billing tool.)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { enqueueJob } from './relay.js';
import { demoExec } from './demoStore.js';
import { redis } from './redis.js';
import { getPlan, billingEnabled } from './billing.js';

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const asError = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }] });

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const UPGRADE_URL = `${(process.env.PUBLIC_BASE_URL || 'https://secondbrainbridge.vercel.app').replace(/\/+$/, '')}/upgrade`;
const FREE_DAILY = Number(process.env.FREE_DAILY_QUERIES || 20);
const PRO_ONLY = new Set(['backlinks', 'create_note']);
const CAPPED = new Set(['search_knowledge', 'ask']);

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
async function bumpDaily(userId) {
  const key = `usage:${userId}:${today()}`;
  const n = await redis.incr(key);
  await redis.expire(key, 172800); // 2 days
  return n;
}

export function buildServer(userId, { demo = false } = {}) {
  const server = new McpServer({ name: 'second-brain-relay', version: '1.0.0' });

  // Demo accounts are treated as Pro (reviewers can exercise every tool against
  // the fictional sample vault). Real accounts get their plan from Stripe.
  const planIsPro = async () => (demo ? true : billingEnabled ? (await getPlan(userId)) === 'pro' : true);
  const exec = demo ? (tool, args) => demoExec(userId, tool, args) : (tool, args) => enqueueJob(userId, tool, args);

  const forward = (tool) => async (args) => {
    try {
      const pro = await planIsPro();
      if (PRO_ONLY.has(tool) && !pro) {
        return asText({
          upgrade_required: true,
          message: `${tool} is a Pro feature. Upgrade to unlock the backlink graph and note creation, plus unlimited search.`,
          upgrade_url: UPGRADE_URL,
        });
      }
      if (CAPPED.has(tool) && !pro) {
        const n = await bumpDaily(userId);
        if (n > FREE_DAILY) {
          return asText({
            upgrade_required: true,
            message: `You've reached the free tier's ${FREE_DAILY} searches/day. Upgrade to Pro for unlimited search across your whole knowledge base.`,
            upgrade_url: UPGRADE_URL,
          });
        }
      }
      return asText(await exec(tool, args ?? {}));
    } catch (e) {
      return asError(e);
    }
  };

  server.registerTool(
    'search_knowledge',
    {
      title: 'Search your knowledge base',
      description: "Search the user's local knowledge vault (Obsidian-style Markdown notes) and return the most relevant passages with their source note, so you can answer grounded in their own writing.",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(40).optional() },
      annotations: RO,
    },
    forward('search_knowledge')
  );

  server.registerTool(
    'ask',
    {
      title: 'Ask your notes',
      description: "Retrieve the passages most relevant to a natural-language question from the user's vault. Use the returned passages to answer the question grounded in their own notes; cite the source notes.",
      inputSchema: { question: z.string(), limit: z.number().int().min(1).max(40).optional() },
      annotations: RO,
    },
    forward('ask')
  );

  server.registerTool(
    'get_note',
    {
      title: 'Read a note',
      description: 'Read the full contents of one note by its path/id or title (from search results).',
      inputSchema: { id: z.string().optional(), path: z.string().optional(), title: z.string().optional() },
      annotations: RO,
    },
    forward('get_note')
  );

  server.registerTool(
    'list_sources',
    {
      title: 'List knowledge sources',
      description: 'Summarize the indexed vault: the vault name, total note count, and a breakdown by top-level folder.',
      inputSchema: {},
      annotations: RO,
    },
    forward('list_sources')
  );

  server.registerTool(
    'backlinks',
    {
      title: 'Note backlinks & links (Pro)',
      description: "Pro. Show the knowledge-graph neighborhood of a note: which notes link to it (Obsidian [[wikilinks]]) and which notes it links out to.",
      inputSchema: { note: z.string() },
      annotations: RO,
    },
    forward('backlinks')
  );

  server.registerTool(
    'create_note',
    {
      title: 'Create a note (Pro)',
      description: 'Pro. Write a new Markdown note into the user\'s vault with a title and body. Confirmed by the user in ChatGPT before it writes.',
      inputSchema: { title: z.string(), body: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    forward('create_note')
  );

  server.registerTool(
    'get_plan',
    {
      title: 'Check plan & upgrade',
      description: 'Report the user\'s current plan (free or pro), what Pro unlocks, and the link to upgrade. Use this when a Pro feature is requested on a free plan.',
      inputSchema: {},
      annotations: RO,
    },
    async () => {
      const pro = await planIsPro();
      return asText({
        plan: pro ? 'pro' : 'free',
        billing_enabled: billingEnabled,
        pro_features: ['Unlimited search & ask', 'Backlink / knowledge-graph tools', 'Create notes from chat', 'Cloud aggregation (coming soon)'],
        free_limit: `${FREE_DAILY} searches/day`,
        upgrade_url: UPGRADE_URL,
        note: pro ? 'You have Pro — everything is unlocked.' : `You're on the free plan. Upgrade at ${UPGRADE_URL} to unlock unlimited search, backlinks, and note creation.`,
      });
    }
  );

  return server;
}
