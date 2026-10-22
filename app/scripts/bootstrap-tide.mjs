// Add one NEW realm to an existing instance. Never stop a container or wipe a database.
// Sequence adapted from @tideorg/mcp@1.9.33 templates/shared/bootstrap-tidecloak.sh.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const base = (process.env.TIDECLOAK_URL || 'http://localhost:8080').replace(/\/$/, '');
const realm = process.env.REALM_NAME || 'consentvault-tide';
const clientId = process.env.CLIENT_NAME || 'consentvault';
const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
const email = process.env.TIDE_LICENSE_EMAIL;
const password = process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;
const action = process.argv[2] || 'prepare';
const validEmail = typeof email === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) && !/(@example\.(com|org|net)|\.invalid|\.test)$/i.test(email);
if (action !== 'status' && (!validEmail || process.env.TIDE_TERMS_ACCEPTED !== 'yes')) { console.error('Ask the owner for their licence email and explicit agreement to https://tide.org/legal. Nothing was created.'); process.exit(2); }
if (!password) { console.error('Set KC_BOOTSTRAP_ADMIN_PASSWORD securely for bootstrap only.'); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]+$/.test(realm) || !['prepare','complete','status'].includes(action)) throw new Error('Invalid bootstrap arguments.');
mkdirSync('.setup', { recursive: true, mode: 0o700 });
const stateFile = resolve('.setup', `${realm}.json`);
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { realm, base, stage: 'new' };
if (state.base !== base || state.realm !== realm) throw new Error('Bootstrap state does not match this instance.');
function save(stage) { state.stage = stage; writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); }
let token;
async function adminToken() {
  const r = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME || 'admin', password }), signal: AbortSignal.timeout(20000), redirect: 'manual' });
  if (!r.ok) throw new Error(`Bootstrap authentication failed (HTTP ${r.status}).`);
  token = (await r.json()).access_token;
}
async function api(method, path, data, form = false) {
  await adminToken();
  const r = await fetch(`${base}/admin/realms${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(data !== undefined ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) }, body: data === undefined ? undefined : form ? new URLSearchParams(data) : JSON.stringify(data), signal: AbortSignal.timeout(120000), redirect: 'manual' });
  const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) { const error = new Error(`Tide bootstrap request ${method} ${path.split('?')[0]} failed (HTTP ${r.status}). Response values were not logged.`); error.status = r.status; throw error; }
  return body;
}
async function drain() {
  // This is ONLY for the fresh firstAdmin realm owned by this bootstrap state.
  // Never auto-authorize changes after the realm has switched to multiAdmin.
  for (let pass = 0; pass < 8; pass++) {
    const pending = await api('GET', `/${realm}/iga/change-requests?status=PENDING`);
    if (!Array.isArray(pending)) throw new Error('Unexpected change-request list.');
    const safe = pending.filter(c => !['DISABLE_IGA','DELETE_REALM','OFFBOARD_REALM'].includes(c.actionType));
    if (!safe.length) return;
    for (const c of safe) {
      let result;
      try { result = await api('POST', `/${realm}/iga/change-requests/${c.id}/approve`, {}); }
      catch (e) { if (![404,405].includes(e.status)) throw e; result = await api('POST', `/${realm}/iga/change-requests/${c.id}/authorize`, {}); }
      if (result?.mode === 'needs-approval') throw new Error('The realm now requires a human enclave approval. Continue in the Tide console; no server-side bypass is attempted.');
    }
    const ready = await api('GET', `/${realm}/iga/change-requests?status=PENDING`);
    for (const c of ready.filter(c => c.readyToCommit && !['DISABLE_IGA','DELETE_REALM','OFFBOARD_REALM'].includes(c.actionType))) await api('POST', `/${realm}/iga/change-requests/${c.id}/commit`);
  }
  throw new Error('Change requests remain pending. Stop and inspect the realm; no approvals were fabricated.');
}
try {
  if (action === 'status') {
    const r = await api('GET', `/${realm}`);
    console.log(JSON.stringify({ realm, stage: state.stage, igaEnabled: r.attributes?.isIGAEnabled === 'true' || r.attributes?.isIGAEnabled === true }));
    process.exit(0);
  }
  if (state.stage === 'new') {
    let found = false; try { await api('GET', `/${realm}`); found = true; } catch (e) { if (e.status !== 404) throw e; }
    if (found) throw new Error('Realm already exists without our bootstrap state. Refusing to modify it.');
    let source = readFileSync(new URL('../config/realm.json.template', import.meta.url), 'utf8');
    source = source.replaceAll('REALM_NAME', realm).replaceAll('CLIENT_NAME', clientId).replaceAll('CLIENT_APP_URL', appOrigin);
    const template = JSON.parse(source);
    template.roles.realm.push(...['contributor','researcher','operator'].map(name => ({ name })));
    template.clients.find(c => c.clientId === clientId).attributes['pkce.code.challenge.method'] = 'S256';
    await api('POST', '', template); save('created'); console.log('Fresh realm created; existing realms preserved.');
  }
  if (state.stage === 'created') {
    const executions = await api('GET', `/${realm}/authentication/flows/first%20broker%20login/executions`);
    const review = executions.find(e => e.providerId === 'idp-review-profile');
    if (review) await api(review.authenticationConfig ? 'PUT' : 'POST', review.authenticationConfig ? `/${realm}/authentication/config/${review.authenticationConfig}` : `/${realm}/authentication/executions/${review.id}/config`, { alias: 'review profile config', config: { 'update.profile.on.first.login': 'off' } });
    const licensed = await api('POST', `/${realm}/vendorResources/setUpTideRealm`, { email, isRagnarokEnabled: 'true' }, true);
    if (JSON.stringify(licensed).includes('NEED_PAYMENT')) throw new Error('Free-tier licence was not issued. No paid checkout was followed.');
    save('licensed'); console.log('Tide realm setup returned success; checking IGA next.');
  }
  if (state.stage === 'licensed') {
    const r = await api('GET', `/${realm}`);
    r.attributes = { ...r.attributes, 'iga.attestor': 'tide' };
    await api('PUT', `/${realm}`, r);
    if (r.attributes.isIGAEnabled !== 'true' && r.attributes.isIGAEnabled !== true) await api('POST', `/${realm}/tide-admin/toggle-iga`, { isIGAEnabled: 'true' }, true);
    const checked = await api('GET', `/${realm}`);
    if (![true,'true'].includes(checked.attributes?.isIGAEnabled)) throw new Error('IGA activation was not confirmed.');
    await drain(); save('iga'); console.log('IGA enabled; fresh-realm baseline changes committed.');
  }
  if (state.stage === 'iga') {
    await api('POST', `/${realm}/users`, { username: 'consentvault-admin', email, enabled: true, emailVerified: false, attributes: { tideInvitable: ['true'] } });
    await drain();
    const users = await api('GET', `/${realm}/users?username=consentvault-admin&exact=true`);
    if (!users[0]?.id) throw new Error('Bootstrap admin creation not confirmed.');
    state.adminId = users[0].id;
    const invite = await api('POST', `/${realm}/tideAdminResources/get-required-action-link?userId=${state.adminId}&lifespan=43200`, ['link-tide-account-action']);
    // Invitation is a one-time credential. Keep it private; never print it into logs/chat.
    writeFileSync(resolve('.setup/enrollment.json'), JSON.stringify({ realm, invite }, null, 2), { mode: 0o600 });
    save('enrollment'); console.log('Human Tide enrollment is required. Private invitation stored in .setup/enrollment.json; not printed.');
  }
  if (action !== 'complete') process.exit(0);
  if (state.stage === 'enrollment') {
    const user = await api('GET', `/${realm}/users/${state.adminId}`);
    if (!user.attributes?.tideUserKey?.[0]) { console.error('WAITING: the owner must link their own Tide account in the enclave. No password or recovery key should be sent to the agent.'); process.exit(3); }
    await drain();
    const idp = await api('GET', `/${realm}/identity-provider/instances/tide`);
    idp.config.CustomAdminUIDomain = `${base}/realms/${realm}/tide-console/`;
    await api('PUT', `/${realm}/identity-provider/instances/tide`, idp);
    await api('POST', `/${realm}/vendorResources/sign-idp-settings`);
    const [rm] = await api('GET', `/${realm}/clients?clientId=realm-management`);
    const role = await api('GET', `/${realm}/clients/${rm.id}/roles/tide-realm-admin`);
    await api('POST', `/${realm}/users/${state.adminId}/role-mappings/clients/${rm.id}`, [role]);
    save('admin_grant_pending');
  }
  if (state.stage === 'admin_grant_pending') {
    await drain(); save('linked');
  }
  if (state.stage === 'linked') {
    const [client] = await api('GET', `/${realm}/clients?clientId=${encodeURIComponent(clientId)}`);
    const adapter = await api('GET', `/${realm}/vendorResources/get-installations-provider?clientId=${client.id}&providerId=keycloak-oidc-keycloak-json`);
    if (!adapter?.jwk?.keys?.length || !adapter.vendorId || !adapter.homeOrkUrl || !adapter[`client-origin-auth-${appOrigin}`]) throw new Error('Export did not return a complete Tide adapter. Existing adapter preserved.');
    const target = resolve('tidecloak.json');
    if (existsSync(target) && !existsSync(resolve('tidecloak.oidc-backup.json'))) writeFileSync('tidecloak.oidc-backup.json', readFileSync(target), { mode: 0o600 });
    writeFileSync(target, JSON.stringify(adapter, null, 2), { mode: 0o600 }); save('exported');
    console.log('Official Tide adapter exported. Multiple independently enrolled admins and live policy checks are still required.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
