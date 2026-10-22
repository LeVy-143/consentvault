// No Tide SDK, JWT bypass, live store, or network calls belong in this server.
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { identities, samples, DEMO_BANNER } from './model.mjs';

const stamp = () => new Date().toISOString();
const kindSchema = z.object({ kind: z.enum(['Vietnamese text', 'Private survey']) }).strict();
const shareSchema = z.object({ recipient: z.string().max(30) }).strict();
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export function createDemoApp({ db, storageKey, origins = ['http://127.0.0.1:5174', 'http://localhost:5174'] }) {
  if (!Buffer.isBuffer(storageKey) || storageKey.length !== 32) throw new Error('Demo storage needs its own local key.');
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store').set('X-ConsentVault-Mode', 'demo');
    const host = req.get('host') || '';
    const hostAllowed = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    if (!loopback(req.socket.remoteAddress) || !hostAllowed || (req.get('origin') && !origins.includes(req.get('origin')))) {
      return res.status(403).json({ error: 'Demo is restricted to the local machine and demo origin.' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '4kb', strict: true }));
  app.get('/api/config', (_req, res) => res.json({ mode: 'demo', configured: false, banner: DEMO_BANNER }));
  app.get('/api/health', (_req, res) => res.json({ service: 'ConsentVault', mode: 'demo', tideNetwork: false }));
  const audit = (actor, action, outcome, record = null, reason = '') => db.prepare(
    'INSERT INTO demo_audit(actor,action,outcome,record_id,reason,created) VALUES(?,?,?,?,?,?)'
  ).run(actor, action, outcome, record, reason, stamp());
  const deny = (req, res, action, record, reason, status = 403) => {
    audit(req.actor?.id || 'unknown', action, 'denied', record, reason);
    return res.status(status).json({ error: reason });
  };
  app.use('/api/demo', (req, res, next) => {
    if (req.get('X-ConsentVault-Demo') !== 'local-simulation') return res.status(403).json({ error: 'An explicit demo request is required.' });
    req.actor = identities.find(identity => identity.id === req.get('X-Demo-Identity'));
    if (!req.actor) return deny(req, res, 'identity.denied', null, 'Choose one of the six synthetic demo identities.', 401);
    next();
  });
  const record = id => db.prepare('SELECT * FROM demo_records WHERE id=?').get(id);
  const approvals = id => db.prepare('SELECT admin FROM demo_approvals WHERE request_id=? ORDER BY admin').all(id).map(row => row.admin);
  function readable(row, actor) {
    if (row.owner === actor.id && actor.role === 'contributor') return true;
    if (actor.role !== 'researcher') return false;
    const grant = db.prepare("SELECT * FROM demo_requests WHERE record_id=? AND recipient=? AND status='active'").get(row.id, actor.id);
    return !!grant && grant.consent_by === row.owner && approvals(grant.id).filter(id => identities.some(i => i.id === id && i.role === 'admin')).length >= 2;
  }
  function view(row, actor) {
    return { id: row.id, owner: row.owner, kind: row.kind, created: row.created, canOpen: readable(row, actor),
      recipients: db.prepare("SELECT recipient FROM demo_requests WHERE record_id=? AND status='active'").all(row.id).filter(g => readable(row, identities.find(i => i.id === g.recipient))).map(g => g.recipient) };
  }
  // Local AES-GCM is only storage hygiene for synthetic demo data. It is NOT Tide E2EE:
  // this demo server has the complete key and sees plaintext; live uses src/tide-policy.mjs.
  function seal(text, id) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', storageKey, iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  function unseal(row) {
    const envelope = JSON.parse(row.sealed), decipher = createDecipheriv('aes-256-gcm', storageKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(row.id)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
  }
  app.get('/api/demo/identities', (_req, res) => res.json(identities));
  app.post('/api/demo/identity', (req, res) => {
    audit(req.actor.id, 'identity.selected', 'allowed', null, 'Synthetic identity selected; not Tide authentication.');
    res.json(req.actor);
  });
  app.post('/api/demo/records', (req, res) => {
    if (req.actor.role !== 'contributor') return deny(req, res, 'record.create_denied', null, 'Only the contributor can create a synthetic contribution.');
    const parsed = kindSchema.safeParse(req.body);
    if (!parsed.success) return deny(req, res, 'record.create_denied', null, 'Choose a synthetic record type; arbitrary content is not accepted.', 400);
    const id = randomUUID(), kind = parsed.data.kind;
    db.prepare('INSERT INTO demo_records VALUES(?,?,?,?,?)').run(id, req.actor.id, kind, seal(samples[kind], id), stamp());
    audit(req.actor.id, 'record.created', 'allowed', id, 'Synthetic sample stored locally; Tide encryption is simulated.');
    res.status(201).json(view(record(id), req.actor));
  });
  app.get('/api/demo/records', (req, res) => {
    if (!['owned', 'shared', 'catalog'].includes(req.query.scope)) return res.status(400).json({ error: 'Unknown collection.' });
    const rows = db.prepare('SELECT * FROM demo_records ORDER BY created,id').all();
    // The catalog deliberately exposes ONLY synthetic metadata to demonstrate real denied reads.
    const visible = req.query.scope === 'catalog' ? rows : rows.filter(r => req.query.scope === 'owned' ? r.owner === req.actor.id : r.owner !== req.actor.id && readable(r, req.actor));
    res.json(visible.map(r => view(r, req.actor)));
  });
  app.post('/api/demo/records/:id/open', (req, res) => {
    const row = record(req.params.id);
    if (!row) return deny(req, res, 'record.read_denied', null, 'Record does not exist.', 404);
    if (!readable(row, req.actor)) return deny(req, res, 'record.read_denied', row.id, 'Access denied: no owner consent with two distinct admin approvals for this identity and record.');
    const content = unseal(row);
    audit(req.actor.id, 'record.opened', 'allowed', row.id, row.owner === req.actor.id ? 'Owner access.' : 'Named recipient and record match; two distinct demo admins approved.');
    res.json({ id: row.id, content, simulated: true });
  });
  app.post('/api/demo/records/:id/requests', (req, res) => {
    const row = record(req.params.id);
    if (!row) return deny(req, res, 'share.denied', null, 'Record does not exist.', 404);
    if (req.actor.id !== row.owner || req.actor.role !== 'contributor') return deny(req, res, 'share.denied', row.id, 'Self-grant denied: only the record owner may request a reader.');
    const parsed = shareSchema.safeParse(req.body), recipient = parsed.success && identities.find(i => i.id === parsed.data.recipient && i.role === 'researcher');
    if (!recipient) return deny(req, res, 'share.denied', row.id, 'Choose a named demo researcher; roles and policies cannot be supplied by the client.', 400);
    if (db.prepare('SELECT 1 FROM demo_requests WHERE record_id=? AND recipient=?').get(row.id, recipient.id)) return deny(req, res, 'share.duplicate_denied', row.id, 'A request already exists for this record and recipient.', 409);
    const id = randomUUID();
    db.prepare('INSERT INTO demo_requests VALUES(?,?,?,?,?,?)').run(id, row.id, recipient.id, req.actor.id, 'pending', stamp());
    audit(req.actor.id, 'consent.requested', 'pending', row.id, `Owner requested read-only access for ${recipient.name}; 0/2 demo approvals.`);
    res.status(201).json({ id, status: 'pending', approvals: [], threshold: 2 });
  });
  app.get('/api/demo/requests', (req, res) => {
    const rows = db.prepare('SELECT q.*,r.kind FROM demo_requests q JOIN demo_records r ON r.id=q.record_id ORDER BY q.created,q.id').all();
    res.json(rows.map(q => ({ id: q.id, recordId: q.record_id, kind: q.kind, recipient: q.recipient,
      recipientName: identities.find(i => i.id === q.recipient).name, consentBy: q.consent_by, status: q.status, approvals: approvals(q.id), threshold: 2 })));
  });
  app.post('/api/demo/requests/:id/approve', (req, res) => {
    const q = db.prepare('SELECT * FROM demo_requests WHERE id=?').get(req.params.id);
    if (!q) return deny(req, res, 'approval.denied', null, 'Request does not exist.', 404);
    if (req.actor.role !== 'admin' || q.recipient === req.actor.id || q.consent_by === req.actor.id) return deny(req, res, 'approval.denied', q.record_id, 'An independent demo administrator is required.');
    if (req.body && Object.keys(req.body).length) return deny(req, res, 'approval.denied', q.record_id, 'The approver is the selected server-side demo identity, not request data.', 400);
    if (approvals(q.id).includes(req.actor.id)) return deny(req, res, 'approval.duplicate_denied', q.record_id, 'This admin already approved. A different admin is required.', 409);
    if (q.status !== 'pending' || record(q.record_id).owner !== q.consent_by) return deny(req, res, 'approval.denied', q.record_id, 'An immutable owner consent request is required.', 409);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO demo_approvals VALUES(?,?,?)').run(q.id, req.actor.id, stamp());
      const count = approvals(q.id).length, status = count >= 2 ? 'active' : 'pending';
      db.prepare('UPDATE demo_requests SET status=? WHERE id=?').run(status, q.id);
      audit(req.actor.id, status === 'active' ? 'grant.activated' : 'approval.recorded', status === 'active' ? 'allowed' : 'pending', q.record_id, `${count}/2 distinct demo admin approvals; ${status}. Not a Tide signature.`);
      db.exec('COMMIT');
      res.json({ id: q.id, status, approvals: approvals(q.id), threshold: 2 });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.get('/api/demo/audit', (_req, res) => res.json(db.prepare('SELECT * FROM demo_audit ORDER BY id DESC LIMIT 200').all().map(e => ({ ...e, actorName: identities.find(i => i.id === e.actor)?.name || 'Unknown' }))));
  app.post('/api/demo/reset', (req, res) => {
    if (req.body?.confirmation !== 'RESET_SYNTHETIC_DEMO') return res.status(400).json({ error: 'Explicit demo reset confirmation required.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM demo_approvals; DELETE FROM demo_requests; DELETE FROM demo_records; DELETE FROM demo_audit;');
      audit(req.actor.id, 'demo.reset', 'allowed', null, 'Only synthetic demo tables reset; live data is untouched.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ reset: true });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Operation unavailable in demo server.' }));
  app.use((error, req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    audit(req.actor?.id || 'unknown', 'request.failed', 'denied', null, 'Invalid or unsuccessful operation; content omitted.');
    res.status(status).json({ error: status === 500 ? 'Demo operation failed.' : 'Invalid demo request.' });
  });
  return app;
}
