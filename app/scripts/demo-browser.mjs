import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.TEST_DEMO_ORIGIN || 'http://127.0.0.1:5174';
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
  let counter = 0; const pending = new Map(); const browserErrors = []; const externalRequests = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent' && /^https?:/.test(m.params.request.url) && new URL(m.params.request.url).origin !== new URL(origin).origin) externalRequests.push(m.params.request.url);
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
  async function waitFor(expression, label) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error('Browser wait failed: ' + label);
  }
  const bodyHas = text => `document.body.innerText.includes(${JSON.stringify(text)})`;
  async function choose(id) {
    await evaluate(`(() => { const s=document.querySelector('[aria-label="Demo identity"]'); s.value=${JSON.stringify(id)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitFor(`document.querySelector('.page-heading .eyebrow')?.textContent.includes(${JSON.stringify(id === 'admin-1' ? 'ADMIN 1' : id === 'admin-2' ? 'ADMIN 2' : id === 'binh' ? 'BÌNH' : id.toUpperCase())})`, 'selected identity');
    await waitFor('![...document.querySelectorAll("button")].some(b=>b.disabled)', 'identity loaded');
    assert.equal(await evaluate('document.querySelectorAll(".decrypted").length'), 0, 'Identity switch clears plaintext');
  }
  async function recordButton(id, text) {
    const ok = await evaluate(`(() => { const card=[...document.querySelectorAll('[data-record-id]')].find(c=>c.dataset.recordId===${JSON.stringify(id)} && [...c.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)})); const b=card&&[...card.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b||b.disabled)return false;b.click();return true; })()`);
    assert.ok(ok, `Record button ${text}`); await pause(200);
  }
  async function screenshot(name) {
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`test-results/demo-${name}.png`, Buffer.from(shot.data, 'base64'));
  }
  await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin });
  await waitFor(bodyHas('Your words.'), 'landing');
  assert.ok(await evaluate(bodyHas('Demo mode — Tide protections simulated')));
  assert.equal(await evaluate("fetch('/.demo/local-storage.key').then(r=>r.status)"), 403, 'Vite cannot serve private demo storage key');
  assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Demo identity\"] option').length"), 6);
  mkdirSync('test-results', { recursive: true }); await screenshot('landing');
  await click('Governance'); await waitFor(bodyHas('Prepare another recording'), 'demo workspace');
  await click('Reset demo'); await click('Confirm reset synthetic demo');
  await waitFor(bodyHas('Synthetic demo reset.'), 'reset');
  await click('My contributions'); await click('Create two sample records');
  await waitFor('document.querySelectorAll("[data-record-id]").length===2', 'two records created');
  const records = await evaluate('[...document.querySelectorAll("[data-record-id]")].map(c=>({id:c.dataset.recordId,kind:c.querySelector("h3").textContent}))');
  const first = records.find(r => r.kind === 'Vietnamese text'), second = records.find(r => r.kind === 'Private survey');
  await recordButton(first.id, 'Open contribution'); await waitFor('document.querySelectorAll(".decrypted").length===1', 'owner opens passage');
  await recordButton(second.id, 'Open contribution'); await waitFor('document.querySelectorAll(".decrypted").length===2', 'owner opens survey');
  await screenshot('lan-two-records');
  await recordButton(first.id, 'Request sharing');
  await evaluate('document.querySelector(".demo-share input[type=checkbox]").click()');
  await click('Record my consent'); await waitFor(bodyHas('Pending: 0/2'), 'owner consent pending');
  await choose('an'); await click('Shared with me');
  await waitFor('document.querySelectorAll(".demo-access-checks [data-record-id]").length===2', 'catalog available');
  await recordButton(first.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'An denied before approval');
  await choose('admin-1'); await click('Governance'); await waitFor(bodyHas('pending · 0/2 approvals'), 'zero approvals');
  await click('Approve as Admin 1'); await waitFor(bodyHas('pending · 1/2 approvals'), 'one admin pending');
  await screenshot('one-admin-pending');
  await click('Try duplicate approval'); await waitFor(bodyHas('This admin already approved.'), 'duplicate denied');
  await choose('an'); await click('Shared with me');
  await recordButton(first.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'An still denied after one admin');
  await choose('admin-2'); await click('Governance'); await waitFor(bodyHas('pending · 1/2 approvals'), 'pending persists across identity');
  await click('Approve as Admin 2'); await waitFor(bodyHas('active · 2/2 approvals'), 'second admin activates grant');
  await screenshot('two-admins-active');
  await choose('an'); await click('Shared with me');
  await waitFor('document.querySelectorAll("[data-record-id]").length===3', 'one shared record plus two catalog cards');
  await recordButton(first.id, 'Open contribution'); await waitFor('!!document.querySelector(".decrypted")', 'An opens record 1');
  assert.ok(await evaluate('document.querySelector(".decrypted").textContent.includes("Mỗi buổi sáng")'));
  await recordButton(second.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'An record 2 denied');
  assert.ok(!await evaluate('[...document.querySelectorAll(".decrypted")].some(e=>e.textContent.includes("lo lắng"))'));
  await screenshot('an-limited-access');
  await choose('binh');
  await recordButton(first.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'Binh record 1 denied');
  await recordButton(second.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'Binh record 2 denied');
  assert.equal(await evaluate('document.querySelectorAll(".decrypted").length'), 0);
  await choose('operator'); await click('Governance');
  await recordButton(first.id, 'Try self-grant'); await waitFor(bodyHas('Self-grant denied:'), 'operator cannot self-grant');
  await recordButton(first.id, 'Try opening record'); await waitFor(bodyHas('Access denied:'), 'operator cannot read');
  await waitFor('document.querySelectorAll("[data-outcome=denied]").length>=5', 'denied actions logged');
  assert.ok(await evaluate('document.querySelectorAll("[data-outcome=allowed]").length>0'));
  await screenshot('operator-denied-and-audit');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile has no horizontal overflow');
  await evaluate('window.scrollTo(0,700)');
  assert.ok(await evaluate('document.querySelector(".demo-banner").getBoundingClientRect().top>=0'), 'Banner stays visible while scrolling');
  await screenshot('mobile');
  await call('Page.navigate', { url: origin }); await waitFor(bodyHas('Your words.'), 'reload');
  await click('Shared with me'); await choose('an');
  await waitFor('document.querySelectorAll("[data-record-id]").length===3', 'grant persists on reload');
  await recordButton(first.id, 'Open contribution'); await waitFor('!!document.querySelector(".decrypted")', 'read works after reload');
  assert.deepEqual(browserErrors, [], 'No uncaught browser errors');
  assert.deepEqual(externalRequests, [], 'No external HTTP/Tide requests; HTTPS blocked throughout');
  console.log('PASS: offline demo UI, six identities, Lan creates two records, owner consent, 1/2 pending, duplicate denied, 2/2 active, An limited access, Binh/operator denied, audit, persistence, mobile/banner, no external requests.');
} finally {
  ws?.close(); browser.kill('SIGTERM');
  await Promise.race([new Promise(r => browser.once('exit', r)), pause(3000)]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
