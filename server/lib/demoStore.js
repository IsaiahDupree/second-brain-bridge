// demoStore.js — a server-side FICTIONAL knowledge vault for the reviewer/demo
// account. Lets reviewers exercise every tool 24/7 with no Mac, no real notes.
// The demo account is treated as Pro, so all tools (incl. backlinks/create_note)
// work. State persists under demoBrain:<userId>. Result shapes mirror the real
// knowledge-agent exactly.

import { redis } from './redis.js';

export const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'reviewer@secondbrainbridge.demo').toLowerCase();

const KEY = (userId) => `demoBrain:${userId}`;

function seed() {
  const N = (rel, title, body) => ({ rel, title, body });
  return {
    vault: 'Demo Vault',
    notes: [
      N('Work/Q3 Planning.md', 'Q3 Planning', '# Q3 Planning\n\nGoals for the quarter tie back to our [[OKRs]]. Ship the connector directory listings, grow the newsletter to 2k, and land three pilot customers. Biggest risk is spreading too thin — see [[Deep Work]].'),
      N('Work/OKRs.md', 'OKRs', '# OKRs\n\nObjective: become the default way people bring their own tools into ChatGPT.\nKR1: 4 connectors live. KR2: 1,000 weekly active. KR3: $2k MRR.'),
      N('Work/Project Atlas.md', 'Project Atlas', '# Project Atlas\n\nInternal codename for the cloud knowledge aggregator. Pulls notes from Obsidian, Apple Notes, and Google Docs into one graph. Depends on the [[Q3 Planning]] timeline.'),
      N('Ideas/Deep Work.md', 'Deep Work', '# Deep Work\n\nCal Newport\'s idea: long, uninterrupted focus blocks beat fragmented busywork. My rule: one deep block before noon, phone in another room. Ties into how I plan the quarter.'),
      N('Recipes/Sourdough.md', 'Sourdough', '# Sourdough\n\nFeed starter the night before. 500g flour, 350g water, 10g salt, 100g active starter. Autolyse 1h, stretch-and-fold every 30 min x4, cold proof overnight, bake at 245°C in a Dutch oven.'),
      N('Reading List.md', 'Reading List', '# Reading List\n\n- Deep Work — Cal Newport (see [[Deep Work]])\n- The Beginning of Infinity — Deutsch\n- Working in Public — Nadia Eghbal'),
    ],
    nextId: 7,
  };
}

async function load(userId) {
  const raw = await redis.get(KEY(userId));
  if (!raw) { const db = seed(); await redis.set(KEY(userId), JSON.stringify(db)); return db; }
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
const save = (userId, db) => redis.set(KEY(userId), JSON.stringify(db));

const passages = (t) => t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
function findByRef(notes, ref) {
  const r = String(ref || '').toLowerCase().replace(/\.(md|markdown|txt)$/i, '');
  return notes.find((n) => n.rel.toLowerCase() === String(ref).toLowerCase())
    || notes.find((n) => n.title.toLowerCase() === r)
    || notes.find((n) => n.rel.toLowerCase().replace(/\.md$/i, '').endsWith(r))
    || notes.find((n) => (n.title.toLowerCase().includes(r) || n.rel.toLowerCase().includes(r)) && r);
}

export async function demoExec(userId, tool, args = {}) {
  const db = await load(userId);
  const notes = db.notes;

  switch (tool) {
    case 'search_knowledge':
    case 'ask': {
      const q = String(args.query || args.question || '').toLowerCase();
      const terms = q.split(/\s+/).filter((t) => t.length > 1);
      const hits = [];
      for (const n of notes) {
        for (const p of passages(n.body)) {
          const low = p.toLowerCase();
          let s = 0;
          for (const t of terms) { s += (low.split(t).length - 1) * 2; if (n.title.toLowerCase().includes(t)) s += 3; }
          if (s > 0) hits.push({ source: n.rel, title: n.title, score: s, snippet: p.slice(0, 500) });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      return { results: hits.slice(0, Math.min(args.limit || (tool === 'ask' ? 8 : 12), 40)) };
    }
    case 'get_note': {
      const n = findByRef(notes, args.id || args.path || args.title);
      if (!n) throw new Error(`Note not found: ${args.id || args.path || args.title || ''}`);
      return { note: { source: n.rel, title: n.title, body: n.body } };
    }
    case 'list_sources': {
      const folders = {};
      for (const n of notes) { const d = n.rel.includes('/') ? n.rel.split('/')[0] : '(root)'; folders[d] = (folders[d] || 0) + 1; }
      return { vault: db.vault, total_notes: notes.length, folders: Object.entries(folders).map(([name, count]) => ({ name, count })) };
    }
    case 'backlinks': {
      const n = findByRef(notes, args.note || args.id || args.title);
      if (!n) throw new Error(`Note not found: ${args.note || args.id || args.title || ''}`);
      const linked_from = notes.filter((o) => o !== n && new RegExp(`\\[\\[\\s*${n.title}\\s*(\\|[^\\]]*)?\\]\\]`, 'i').test(o.body)).map((o) => ({ source: o.rel, title: o.title }));
      const links_to = [...new Set([...n.body.matchAll(/\[\[\s*([^\]|#]+)/g)].map((m) => m[1].trim()))];
      return { note: n.title, linked_from, links_to };
    }
    case 'create_note': {
      const title = String(args.title || 'Untitled').replace(/[\/\\:]/g, '-');
      const body = String(args.body || '');
      const content = /^#\s/.test(body) ? body : `# ${title}\n\n${body}\n`;
      const rel = `${title}.md`;
      db.notes.push({ rel, title, body: content });
      db.nextId++;
      await save(userId, db);
      return { note: { source: rel, title, body: content } };
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
