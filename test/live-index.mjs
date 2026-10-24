// Read-only validation of the actual selected owner vault and private SQLite snapshot.
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { resolveVault, runTool } from '../agent/knowledge-agent.mjs';
import { inventory, indexedNotes, indexStatus, readNote } from '../agent/knowledge-index.mjs';
const vault = resolveVault();
const state = await indexStatus(vault);
assert.ok(state.ready && state.fresh, 'Build a fresh complete index first');
assert.equal(statSync(state.path).mode & 0o777, 0o600);
const files = await inventory(vault), notes = await indexedNotes(vault);
assert.deepEqual(notes.map(n => n.rel).sort(), files.map(n => n.rel).sort());
for (const n of [notes[0], notes[Math.floor(notes.length / 2)], notes.at(-1)]) {
  assert.equal(n.text, await readNote(vault, n.rel));
  const fetched = await runTool('get_note', { id: n.rel });
  assert.equal(fetched.note.source, n.rel);
  assert.equal(fetched.note.body, n.text.slice(0, 20000));
}
const found = notes.find(n => /[a-z]{5,}/i.test(n.text));
const query = found.text.match(/[a-z]{5,}/i)[0];
const searched = await runTool('search_knowledge', { query });
assert.ok(searched.results.length > 0);
const sources = await runTool('list_sources');
assert.equal(sources.total_notes, files.length);
console.log(JSON.stringify({ indexed_notes: files.length, complete_inventory: true, private_permissions: true, live_text_comparisons: 3, search: true, fetch: true }));
