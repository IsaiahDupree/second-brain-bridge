// Private incremental snapshot of the selected Markdown vault; no cloud/model work.
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';

const directory = join(homedir(), 'Library', 'Application Support', 'SecondBrainBridge');
const paths = async (vault) => {
  const root = await realpath(vault);
  return { root, path: join(directory, createHash('sha256').update(root).digest('hex').slice(0, 20) + '.sqlite') };
};
async function open(vault) {
  const location = await paths(vault);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Index directory cannot be a symlink');
  chmodSync(directory, 0o700);
  if (existsSync(location.path)) {
    if (!lstatSync(location.path).isFile()) throw new Error('Index must be a regular private file');
  } else closeSync(openSync(location.path, 'wx', 0o600));
  chmodSync(location.path, 0o600);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(location.path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS notes (rel TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, mtime REAL NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  return { ...location, db };
}
// Never follow links outside the selected vault or silently truncate its inventory.
export async function inventory(vault) {
  const root = await realpath(vault), files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) {
        const info = await stat(path);
        files.push({ path, rel: relative(root, path), mtime: info.mtimeMs, size: info.size });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}
export async function readNote(vault, rel) {
  const root = await realpath(vault), path = join(root, rel);
  const resolved = await realpath(path);
  if (!resolved.startsWith(root + sep) || lstatSync(path).isSymbolicLink()) throw new Error('Note path left the selected vault');
  return readFile(path, 'utf8');
}
export async function indexStatus(vault) {
  const { db, path } = await open(vault);
  try {
    const at = db.prepare("SELECT value FROM metadata WHERE key='indexed_at'").get()?.value;
    return { path, ready: !!at, indexed_at: at || null, indexed_notes: db.prepare('SELECT count(*) AS n FROM notes').get().n,
      refresh_interval_seconds: 900, fresh: !!at && Date.now() - Date.parse(at) < 900_000 };
  } finally { db.close(); }
}
export async function refreshIndex(vault) {
  const files = await inventory(vault);
  const { db, path } = await open(vault);
  let changed = 0;
  try {
    // A transaction serializes refreshes and leaves the last complete snapshot intact on failure.
    db.exec('BEGIN IMMEDIATE');
    const old = new Map(db.prepare('SELECT rel,mtime,size FROM notes').all().map(n => [n.rel, n]));
    const write = db.prepare('INSERT OR REPLACE INTO notes VALUES (?,?,?,?,?)');
    for (const file of files) {
      const previous = old.get(file.rel); old.delete(file.rel);
      if (previous?.mtime === file.mtime && previous?.size === file.size) continue;
      const text = await readNote(vault, file.rel);
      const after = await stat(file.path);
      if (after.mtimeMs !== file.mtime || after.size !== file.size) throw new Error('Vault changed while indexing; retry the refresh');
      const title = ((text.match(/^#\s+(.+)$/m) || [])[1] || basename(file.rel).replace(/\.(md|markdown|txt)$/i, '')).trim();
      write.run(file.rel, title, text, file.mtime, file.size); changed++;
    }
    for (const rel of old.keys()) db.prepare('DELETE FROM notes WHERE rel=?').run(rel);
    const at = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO metadata VALUES ('indexed_at',?)").run(at);
    db.exec('COMMIT');
    return { ready: true, indexed_notes: files.length, changed, removed: old.size, indexed_at: at, path };
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  finally { db.close(); }
}
export async function indexedNotes(vault) {
  const state = await indexStatus(vault);
  if (!state.fresh) await refreshIndex(vault);
  const { db, root } = await open(vault);
  try { return db.prepare('SELECT * FROM notes').all().map(n => ({ ...n, path: join(root, n.rel) })); }
  finally { db.close(); }
}
export async function invalidateIndex(vault) {
  const { db } = await open(vault);
  try { db.prepare("DELETE FROM metadata WHERE key='indexed_at'").run(); }
  finally { db.close(); }
}
