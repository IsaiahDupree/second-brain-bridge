// knowledge-agent.mjs — runs SecondBrainBridge tools against a local knowledge
// base: an Obsidian-style vault (a folder of Markdown notes) on the user's Mac.
// Everything is read/written on-device; the relay never sees note content.
//
// The connector's job is RETRIEVAL — it finds the most relevant notes/passages
// for a query so ChatGPT can reason over them. No embeddings model is required
// for v1 (ranked keyword + title + recency); semantic/cloud ranking is a Pro/
// cloud enhancement handled server-side later.
//
// Vault location resolves from: SECONDBRAIN_VAULT env → the `vault` field in
// ~/.secondbrainbridge-agent.json → a small set of common Obsidian paths.

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { indexedNotes, indexStatus, invalidateIndex, readNote } from './knowledge-index.mjs';

const CONFIG_PATH = join(homedir(), '.secondbrainbridge-agent.json');


export function buildJxaArgs(tool, args = {}) {
  return args;
}

export function cleanError(msg) {
  return String(msg || '').trim() || 'knowledge lookup failed';
}

export function resolveVault() {
  if (process.env.SECONDBRAIN_VAULT) return process.env.SECONDBRAIN_VAULT;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (cfg.vault && existsSync(cfg.vault)) return cfg.vault;
  } catch {}
  const guesses = [
    join(homedir(), 'Obsidian'),
    join(homedir(), 'Documents', 'Obsidian'),
    join(homedir(), 'Notes'),
    join(homedir(), 'Documents', 'Notes'),
  ];
  return guesses.find((g) => existsSync(g)) || null;
}

// Split note text into paragraph-ish passages.
const passages = (text) => text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

function scorePassage(p, terms, title) {
  const low = p.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const n = low.split(t).length - 1;
    s += n * 2;
    if (title.toLowerCase().includes(t)) s += 3;
  }
  return s;
}

const loadNotes = indexedNotes;

async function retrieve(vault, query, limit) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const notes = await loadNotes(vault);
  const hits = [];
  for (const n of notes) {
    for (const p of passages(n.text)) {
      const sc = scorePassage(p, terms, n.title);
      if (sc > 0) hits.push({ source: n.rel, title: n.title, score: sc, mtime: n.mtime, snippet: p.slice(0, 500) });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return hits.slice(0, limit);
}

function findByRef(notes, ref) {
  if (!String(ref || '').trim()) return null;
  const r = String(ref || '').toLowerCase().replace(/\.(md|markdown|txt)$/i, '');
  return (
    notes.find((n) => n.rel.toLowerCase() === String(ref).toLowerCase()) ||
    notes.find((n) => n.title.toLowerCase() === r) ||
    notes.find((n) => n.rel.toLowerCase().replace(/\.(md|markdown|txt)$/i, '').endsWith(r)) ||
    notes.find((n) => n.title.toLowerCase().includes(r) && r)
  );
}

export async function runTool(tool, args = {}) {
  const vault = resolveVault();
  if (!vault) {
    throw new Error('No knowledge vault found. Point the agent at your Obsidian/notes folder: set SECONDBRAIN_VAULT or add {"vault":"/path/to/vault"} to ~/.secondbrainbridge-agent.json.');
  }

  switch (tool) {
    case 'search_knowledge':
    case 'ask': {
      const limit = Math.min(args.limit || (tool === 'ask' ? 8 : 12), 40);
      const results = await retrieve(vault, args.query || args.question || '', limit);
      return { results, index: await indexStatus(vault) };
    }
    case 'get_note': {
      const notes = await loadNotes(vault);
      const n = findByRef(notes, args.id || args.path || args.title);
      if (!n) throw new Error(`Note not found: ${args.id || args.path || args.title || ''}`);
      const text = await readNote(vault, n.rel);
      return { note: { source: n.rel, title: n.title, body: text.slice(0, 20000), truncated: text.length > 20000 } };
    }
    case 'list_sources': {
      const notes = await loadNotes(vault);
      const folders = {};
      for (const n of notes) {
        const dir = n.rel.includes('/') ? n.rel.split('/')[0] : '(root)';
        folders[dir] = (folders[dir] || 0) + 1;
      }
      return { vault: basename(vault), total_notes: notes.length, index: await indexStatus(vault), folders: Object.entries(folders).map(([name, count]) => ({ name, count })) };
    }
    case 'backlinks': {
      const notes = await loadNotes(vault);
      const n = findByRef(notes, args.note || args.id || args.title);
      if (!n) throw new Error(`Note not found: ${args.note || args.id || args.title || ''}`);
      const linkedFrom = notes.filter((o) => new RegExp(`\\[\\[\\s*${n.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\|[^\\]]*)?\\]\\]`, 'i').test(o.text)).map((o) => ({ source: o.rel, title: o.title }));
      const linksTo = [...n.text.matchAll(/\[\[\s*([^\]|#]+)/g)].map((m) => m[1].trim());
      return { note: n.title, linked_from: linkedFrom, links_to: [...new Set(linksTo)] };
    }
    case 'create_note': {
      const title = String(args.title || 'Untitled').replace(/[\/\\:]/g, '-');
      const body = String(args.body || '');
      const path = join(vault, `${title}.md`);
      const content = /^#\s/.test(body) ? body : `# ${title}\n\n${body}\n`;
      await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await invalidateIndex(vault);
      return { note: { source: `${title}.md`, title, body: content } };
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
