// Unit/integration tests for knowledge-agent.mjs — runs against a REAL temp
// vault on disk (fs-based, no osascript). Run: node --test test-agent-unit.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildJxaArgs, cleanError, resolveVault, runTool } from './knowledge-agent.mjs';
import { buildPlist, xmlEscape } from './cli.mjs';

// Build a small fictional vault and point the agent at it.
const VAULT = mkdtempSync(join(tmpdir(), 'sbb-vault-'));
mkdirSync(join(VAULT, 'Work'), { recursive: true });
writeFileSync(join(VAULT, 'Work', 'Q3 Planning.md'), '# Q3 Planning\n\nShip four connectors and grow to 1000 users. Depends on [[OKRs]] and staying focused — see [[Deep Work]].');
writeFileSync(join(VAULT, 'Work', 'OKRs.md'), '# OKRs\n\nObjective: be the default way people bring tools into ChatGPT.');
writeFileSync(join(VAULT, 'Deep Work.md'), '# Deep Work\n\nLong uninterrupted focus blocks beat busywork. One block before noon.');
process.env.SECONDBRAIN_VAULT = VAULT;

test('buildJxaArgs passes args through untouched', () => {
  const a = { query: 'focus', limit: 5 };
  assert.deepEqual(buildJxaArgs('search_knowledge', a), a);
});

test('cleanError falls back to a generic message', () => {
  assert.equal(cleanError(''), 'knowledge lookup failed');
  assert.equal(cleanError('boom'), 'boom');
});

test('resolveVault honours SECONDBRAIN_VAULT', () => {
  assert.equal(resolveVault(), VAULT);
});

test('search_knowledge ranks passages by term + title', async () => {
  const r = await runTool('search_knowledge', { query: 'focus' });
  assert.ok(r.results.length >= 1);
  assert.ok(r.results.some((h) => h.title === 'Deep Work'));
  assert.ok(r.results[0].snippet.length > 0);
});

test('ask retrieves relevant passages for a question', async () => {
  const r = await runTool('ask', { question: 'how many connectors should I ship and how many users?' });
  assert.ok(r.results.some((h) => h.title === 'Q3 Planning'));
});

test('get_note reads a note by title', async () => {
  const r = await runTool('get_note', { title: 'OKRs' });
  assert.match(r.note.body, /default way people bring tools/);
});

test('list_sources counts notes by folder', async () => {
  const r = await runTool('list_sources', {});
  assert.equal(r.total_notes, 3);
  assert.ok(r.folders.find((f) => f.name === 'Work' && f.count === 2));
});

test('backlinks resolves wikilink neighbours', async () => {
  const r = await runTool('backlinks', { note: 'OKRs' });
  assert.ok(r.linked_from.some((n) => n.title === 'Q3 Planning')); // Q3 links to [[OKRs]]
  const q3 = await runTool('backlinks', { note: 'Q3 Planning' });
  assert.ok(q3.links_to.includes('OKRs') && q3.links_to.includes('Deep Work'));
});

test('create_note writes a markdown file into the vault', async () => {
  const r = await runTool('create_note', { title: 'Test Idea', body: 'try the second brain' });
  assert.equal(r.note.title, 'Test Idea');
  assert.ok(existsSync(join(VAULT, 'Test Idea.md')));
  assert.match(readFileSync(join(VAULT, 'Test Idea.md'), 'utf8'), /try the second brain/);
});

test('runTool rejects unknown tools', async () => {
  await assert.rejects(() => runTool('nope', {}), /Unknown tool: nope/);
});

test('buildPlist emits the SecondBrain label + KeepAlive', () => {
  const xml = buildPlist({
    label: 'com.secondbrainbridge.second-brain-agent',
    nodePath: '/usr/local/bin/node', cliPath: '/Users/me/agent/cli.mjs',
    workingDir: '/Users/me', outLog: '/Users/me/Library/Logs/secondbrainbridge-agent.log',
    errLog: '/Users/me/Library/Logs/secondbrainbridge-agent.err.log',
  });
  assert.match(xml, /<key>Label<\/key>\s*<string>com\.secondbrainbridge\.second-brain-agent<\/string>/);
  assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/);
});

test('xmlEscape escapes &, <, >', () => {
  assert.equal(xmlEscape('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});
