// This executable is never imported by the live server. Fixed paths and bind address
// deliberately ignore DATABASE_PATH, TIDECLOAK_CONFIG, HOST and PORT from live settings.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDemoStore } from './store.mjs';
import { createDemoApp } from './app.mjs';
const directory = fileURLToPath(new URL('../.demo/', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath = directory + 'local-storage.key';
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
const storageKey = readFileSync(keyPath);
const db = openDemoStore(directory + 'consentvault-demo.sqlite');
const server = createDemoApp({ db, storageKey }).listen(3101, '127.0.0.1', error => {
  if (error) { console.error('Demo API port 3101 is unavailable.'); db.close(); process.exitCode = 1; return; }
  console.log('Demo mode — Tide protections simulated. Local API: 127.0.0.1:3101. Synthetic data only.');
});
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
