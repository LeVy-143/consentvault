import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDemoStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS demo_records(
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, sealed TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_requests(
      id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES demo_records(id), recipient TEXT NOT NULL,
      consent_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','active')), created TEXT NOT NULL,
      UNIQUE(record_id,recipient));
    CREATE TABLE IF NOT EXISTS demo_approvals(
      request_id TEXT NOT NULL REFERENCES demo_requests(id), admin TEXT NOT NULL, created TEXT NOT NULL,
      PRIMARY KEY(request_id,admin));
    CREATE TABLE IF NOT EXISTS demo_audit(
      id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL,
      record_id TEXT, reason TEXT NOT NULL, created TEXT NOT NULL);`);
  return db;
}
