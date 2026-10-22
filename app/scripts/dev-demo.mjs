import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
// No .env file, bootstrap, Docker, SDK policy build or network request is needed.
const children = [
  spawn(process.execPath, ['demo/index.mjs'], { cwd, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'demo', '--host', '127.0.0.1'], { cwd, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code || 1)); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
