import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.TEST_APP_ORIGIN || 'http://localhost:5173';
const executable = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium');
if (!existsSync(executable)) throw new Error('Set CHROME_PATH to a real Chrome/Chromium executable. Browser checks have not run.');
const profile = mkdtempSync(join(tmpdir(), 'consentvault-browser-'));
const browser = spawn(executable, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await pause(100);
  if (!existsSync(portFile)) throw new Error('Chromium did not start.');
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let counter = 0; const pending = new Map(); const browserErrors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') browserErrors.push('Uncaught browser exception');
  };
  function call(method, params = {}) { return new Promise((resolve, reject) => {
    const id = ++counter; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 15000);
    pending.set(id, result => { clearTimeout(timer); result.error ? reject(new Error('Browser command failed')) : resolve(result.result); });
    ws.send(JSON.stringify({ id, method, params }));
  }); }
  async function evaluate(expression) {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('Browser evaluation failed');
    return r.result.value;
  }
  async function click(text) { const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if(!b) return false; b.click(); return true; })()`); assert.ok(ok, `Button exists: ${text}`); await pause(200); }
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin });
  for (let i = 0; i < 100; i++) { if ((await evaluate('document.body?.innerText ?? ""')).includes('Your words.')) break; await pause(100); }
  const body = await evaluate('document.body.innerText');
  assert.ok(body.includes('Your words.') && body.includes('Your permission.'), 'Landing renders');
  assert.ok(!body.includes('FairEnrol') && !body.includes('Enrol in course'), 'Original idea is absent');
  assert.equal(await evaluate('document.querySelectorAll("select").length'), 0, 'No role switcher');
  mkdirSync('test-results', { recursive: true });
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('test-results/landing-desktop.png', Buffer.from(shot.data, 'base64'));
  for (const tab of ['My contributions', 'Shared with me', 'Governance']) {
    await click(tab);
    assert.ok((await evaluate('document.body.innerText')).includes('Start with your own identity.'), `${tab} requires sign-in`);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('Overview');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile has no horizontal overflow');
  const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('test-results/landing-mobile.png', Buffer.from(mobile.data, 'base64'));
  const setup = await (await fetch(origin + '/api/config')).json();
  if (setup.configured) {
    await click('Sign in');
    let path = '';
    for (let i = 0; i < 100; i++) { path = await evaluate('location.pathname'); if (path.includes('/protocol/openid-connect/auth')) break; await pause(100); }
    assert.ok(path.includes('/protocol/openid-connect/auth'), 'Real TideCloak login redirect');
    console.log('PASS: real TideCloak authorization redirect (no user credentials entered).');
  } else assert.ok(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Sign in").disabled'), 'No fake sign-in when unconfigured');
  assert.deepEqual(browserErrors, [], 'No uncaught browser errors');
  console.log('PASS: landing, all protected tabs, no role switcher, mobile layout, fail-closed sign-in. Screenshots: test-results/.');
} finally {
  ws?.close(); browser.kill('SIGTERM');
  await Promise.race([new Promise(r => browser.once('exit', r)), pause(3000)]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
