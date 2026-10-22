import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS members(sub TEXT PRIMARY KEY, tide_key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, researcher INTEGER NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES members(sub), kind TEXT NOT NULL, ciphertext TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS policy_requests(id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES records(id), recipient TEXT NOT NULL REFERENCES members(sub), access TEXT NOT NULL, expiry INTEGER NOT NULL, requested_by TEXT NOT NULL, status TEXT NOT NULL, policy TEXT, signed_by TEXT, created TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS pending_request ON policy_requests(record_id,recipient) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS record_owner ON records(owner);
    CREATE INDEX IF NOT EXISTS request_recipient ON policy_requests(recipient);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proof_replay(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
  return db;
}
export function replayStore(db, keyId) {
  return { async claim(jti, expires) {
    db.prepare('DELETE FROM proof_replay WHERE expires < ?').run(Date.now());
    return db.prepare('INSERT OR IGNORE INTO proof_replay VALUES(?,?)').run(`${keyId}:${jti}`, expires).changes === 1;
  } };
}
