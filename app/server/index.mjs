import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { openStore } from './store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
let config = null;
const configPath = resolve(root, process.env.TIDECLOAK_CONFIG || 'tidecloak.json');
try { if (existsSync(configPath)) {
  const candidate = JSON.parse(readFileSync(configPath, 'utf8'));
  const url = new URL(candidate['auth-server-url']);
  if (url.username || url.password || url.search || url.hash) throw new Error('Identity URL must not contain credentials, query or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('TideCloak requires HTTPS except for local development.');
  if (!candidate.realm || !candidate.resource || !/^[A-Za-z0-9_.-]+$/.test(candidate.realm)) throw new Error('Invalid TideCloak realm/client.');
  config = candidate;
} } catch {
  console.error('Invalid identity configuration. Check the public adapter URL, realm, client and pinned algorithms. Configuration values were not logged.');
  process.exit(1);
}
const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
// Preserve the earlier envelope-prototype database; no silent crypto migration.
const db = openStore(resolve(root, process.env.DATABASE_PATH || 'data/consentvault-policy.sqlite'));
const app = createApp({ db, getConfig: () => config, origin, distPath: resolve(root, 'dist') });
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', error => {
  if (error) { console.error('ConsentVault API could not bind its port. Check PORT and stop duplicate instances.'); db.close(); process.exitCode = 1; return; }
  console.log(`ConsentVault API listening; identity ${config ? 'configured' : 'not configured'}. No payload logging.`);
});
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
