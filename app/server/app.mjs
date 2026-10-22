import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveDpopAuthRequest } from '@tidecloak/js/dpop-server';
import { authenticate } from './auth.mjs';
import { adapterStatus, publicConfig } from './config.mjs';
import { verifyRelationshipPolicy, verifyAdminQuorumPolicy } from './policies.mjs';
const kindSchema = z.object({ kind: z.enum(['Vietnamese text','Private survey']) }).strict();
const recipientSchema = z.object({ recipient: z.string().min(1).max(200) }).strict();
const blob = z.string().min(32).max(60000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const ciphertextSchema = z.object({ ciphertext: blob }).strict();
const policySchema = z.object({ policy: blob, adminPolicy: blob }).strict();
const now = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now()/1000);
export function createApp({ db, getConfig, origin = 'http://localhost:5173', distPath }) {
  const app = express(); app.disable('x-powered-by');
  app.get('/silent-check-sso.html', (_req,res) => {
    const html=readFileSync(new URL('../public/silent-check-sso.html',import.meta.url),'utf8');
    const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if(!script)return res.sendStatus(500);
    const hash=createHash('sha256').update(script).digest('base64');
    res.set('Content-Security-Policy',`default-src 'none'; script-src 'sha256-${hash}'`).type('html').send(html);
  });
  app.use((req,res,next) => {
    const c = getConfig();
    const match = resolveDpopAuthRequest({ pathname: new URL(req.originalUrl, origin).pathname, expectedIssuer: c ? `${c['auth-server-url'].replace(/\/+$/,'')}/realms/${c.realm}` : undefined, expectedClient: c?.resource, method: req.method });
    if (!match) return next();
    res.status(match.status).set(match.headers).send(match.body);
  });
  app.use(helmet({ frameguard: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], frameSrc: ["'self'", '*'], connectSrc: ["'self'", 'https:', 'http://localhost:8080'], imgSrc: ["'self'", 'data:', 'https:'], fontSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
  } } }));
  app.use('/api', (req,res,next) => { res.set('Cache-Control','no-store'); if (!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== origin) return res.status(403).json({error:'Origin is not allowed.'}); next(); });
  app.use('/api', rateLimit({ windowMs:60000, limit:240, standardHeaders:'draft-8', legacyHeaders:false }));
  app.use(express.json({limit:'80kb',strict:true}));
  app.get('/api/health', (_req,res) => res.json({ service:'ConsentVault', database:'available', identityConfigured:adapterStatus(getConfig(),origin).ready }));
  app.get('/api/config', (_req,res) => { const c=getConfig(), status=adapterStatus(c,origin); res.json({ configured:status.ready, encryptionConfigured:status.ready, missing:status.missing, ...(status.ready ? {config:publicConfig(c,origin)} : {}) }); });
  app.use('/api', authenticate(getConfig,db,origin));
  const member = sub => db.prepare('SELECT * FROM members WHERE sub=?').get(sub);
  const audit = (sub,action,id=null) => db.prepare('INSERT INTO audit(actor,action,record_id,created) VALUES(?,?,?,?)').run(sub,action,id,now());
  const role = name => (req,res,next) => req.actor.roles.includes(name) ? next() : res.status(403).json({error:`The ${name} role is required.`});
  const owned = (req,res) => { const r=db.prepare('SELECT * FROM records WHERE id=? AND owner=?').get(req.params.id,req.actor.sub); if(!r)res.status(404).json({error:'Record not available.'}); return r; };
  const activePolicy = (id,sub) => db.prepare("SELECT * FROM policy_requests WHERE record_id=? AND recipient=? AND status='signed' AND expiry>? ORDER BY created DESC LIMIT 1").get(id,sub,seconds());
  const requestView = row => ({ id:row.id, recordId:row.record_id, recipient:row.recipient, tideUserKey:member(row.recipient).tide_key, recipientName:member(row.recipient).name, owner:row.requested_by, access:row.access, expiry:row.expiry, status:row.status, kind:db.prepare('SELECT kind FROM records WHERE id=?').get(row.record_id).kind });
  const hydrate = (r,sub) => { const p=activePolicy(r.id,sub); return { id:r.id, owner:r.owner, ownerName:member(r.owner).name, kind:r.kind, ciphertext:r.ciphertext, created:r.created, policy:p?.policy??null, expiry:p?.expiry??null,
    recipients:r.owner===sub ? db.prepare("SELECT DISTINCT m.sub,m.name FROM policy_requests p JOIN members m ON m.sub=p.recipient WHERE p.record_id=? AND p.recipient<>? AND p.status='signed' AND p.expiry>?").all(r.id,sub,seconds()) : [] }; };
  function addRequest(r,recipient,access) { const id=randomUUID(), expiry=seconds()+3600;
    db.prepare("UPDATE policy_requests SET status='expired' WHERE record_id=? AND recipient=? AND status='pending' AND expiry<=?").run(r.id,recipient,seconds());
    if(db.prepare("SELECT 1 FROM policy_requests WHERE record_id=? AND recipient=? AND (status='pending' OR (status='signed' AND expiry>?))").get(r.id,recipient,seconds())) return null;
    db.prepare('INSERT INTO policy_requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,r.id,recipient,access,expiry,r.owner,'pending',null,null,now());
    return db.prepare('SELECT * FROM policy_requests WHERE id=?').get(id);
  }
  app.get('/api/me',(req,res)=>res.json(req.actor));
  app.post('/api/members',(req,res)=>{
    if(req.body && Object.keys(req.body).length) return res.status(400).json({error:'Identity comes only from the verified Tide token.'});
    const previous=member(req.actor.sub);
    if(previous && previous.tide_key!==req.actor.tideUserKey) return res.status(409).json({error:'Tide identity key changed. Automatic key replacement is disabled.'});
    if(!previous) db.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(req.actor.sub,req.actor.tideUserKey,req.actor.name,Number(req.actor.roles.includes('researcher')),now());
    res.json({registered:true});
  });
  app.get('/api/recipients',role('contributor'),(req,res)=>res.json(db.prepare('SELECT sub,name,tide_key AS tideUserKey FROM members WHERE researcher=1 AND sub<>? ORDER BY name').all(req.actor.sub)));
  app.post('/api/records',role('contributor'),(req,res)=>{
    const parsed=kindSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'Only non-sensitive record type metadata is accepted here.'});
    if(!member(req.actor.sub)||!req.actor.roles.includes('_tide_encryptor'))return res.status(403).json({error:'Register your Tide identity and obtain the encryption role.'});
    const id=randomUUID(); db.exec('BEGIN IMMEDIATE');
    try{db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(id,req.actor.sub,parsed.data.kind,null,now()); addRequest({id,owner:req.actor.sub},req.actor.sub,'read-write');audit(req.actor.sub,'record.reserved',id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.status(201).json({id});
  });
  app.get('/api/records',(req,res)=>{
    const scope=req.query.scope; if(!['owned','shared'].includes(scope))return res.status(400).json({error:'Scope must be owned or shared.'});
    if(!req.actor.roles.includes(scope==='owned'?'contributor':'researcher'))return res.status(403).json({error:'This identity cannot access that collection.'});
    const rows=scope==='owned'?db.prepare('SELECT * FROM records WHERE owner=? ORDER BY created DESC').all(req.actor.sub):db.prepare("SELECT DISTINCT r.* FROM records r JOIN policy_requests p ON p.record_id=r.id WHERE p.recipient=? AND p.status='signed' AND p.expiry>? AND r.ciphertext IS NOT NULL ORDER BY r.created DESC").all(req.actor.sub,seconds());
    res.json(rows.map(r=>hydrate(r,req.actor.sub)));
  });
  app.get('/api/records/:id',(req,res)=>{
    const r=db.prepare('SELECT * FROM records WHERE id=?').get(req.params.id);
    const own=r?.owner===req.actor.sub&&req.actor.roles.includes('contributor');
    const shared=r&&req.actor.roles.includes('researcher')&&activePolicy(r.id,req.actor.sub)&&req.actor.roles.includes('_tide_decryptor');
    if(!own&&!shared){audit(req.actor.sub,'record.read_denied');return res.status(404).json({error:'Record not available.'});}
    audit(req.actor.sub,'record.fetched',r.id);res.json(hydrate(r,req.actor.sub));
  });
  app.put('/api/records/:id/ciphertext',role('contributor'),(req,res)=>{
    const r=owned(req,res);if(!r)return;
    if(r.ciphertext)return res.status(409).json({error:'Record content is immutable.'});
    const p=activePolicy(r.id,req.actor.sub);if(!p||p.access!=='read-write'||!req.actor.roles.includes('_tide_encryptor'))return res.status(403).json({error:'An active Tide write policy for this record is required.'});
    const parsed=ciphertextSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Only Tide ciphertext is accepted; never send plaintext.'});
    db.prepare('UPDATE records SET ciphertext=? WHERE id=? AND ciphertext IS NULL').run(parsed.data.ciphertext,r.id);audit(req.actor.sub,'record.encrypted_saved',r.id);res.json({saved:true});
  });
  app.post('/api/records/:id/requests',role('contributor'),(req,res)=>{
    const r=owned(req,res);if(!r)return;
    const parsed=recipientSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Choose one registered recipient.'});
    const target=member(parsed.data.recipient),self=parsed.data.recipient===req.actor.sub;
    if(!target||(!self&&!target.researcher))return res.status(400).json({error:'Recipient must be a registered researcher.'});
    if(!self&&!r.ciphertext)return res.status(409).json({error:'Encrypt your contribution before requesting a reader policy.'});
    const row=addRequest(r,target.sub,self?'read-write':'read');if(!row)return res.status(409).json({error:'An active policy or pending request already exists.'});
    audit(req.actor.sub,'policy.requested',r.id);res.status(201).json(requestView(row));
  });
  app.get('/api/policy-requests',(req,res)=>{
    const rows=req.actor.isRealmAdmin?db.prepare("SELECT * FROM policy_requests WHERE status='pending' AND expiry>? ORDER BY created").all(seconds()):db.prepare('SELECT * FROM policy_requests WHERE requested_by=? ORDER BY created DESC').all(req.actor.sub);
    res.json(rows.map(requestView));
  });
  app.post('/api/policy-requests/:id/policy',async(req,res)=>{
    if(!req.actor.isRealmAdmin)return res.status(403).json({error:'A Tide realm administrator is required.'});
    const row=db.prepare('SELECT * FROM policy_requests WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'Policy request not available.'});
    if(row.recipient===req.actor.sub){audit(req.actor.sub,'policy.self_grant_denied',row.record_id);return res.status(403).json({error:'An administrator cannot approve their own access.'});}
    if(row.status!=='pending'||row.expiry<=seconds())return res.status(409).json({error:'Policy request is no longer pending.'});
    const parsed=policySchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'A serialized signed Tide policy is required.'});
    const expected={recordId:row.record_id,tideUserKey:member(row.recipient).tide_key,access:row.access,expiry:row.expiry};
    if(!await verifyRelationshipPolicy(parsed.data.policy,expected,getConfig()) || !await verifyAdminQuorumPolicy(parsed.data.adminPolicy,getConfig()))return res.status(400).json({error:'Policy binding, network signature or signed admin threshold is invalid.'});
    db.prepare("UPDATE policy_requests SET status='signed',policy=?,signed_by=? WHERE id=? AND status='pending'").run(parsed.data.policy,req.actor.sub,row.id);audit(req.actor.sub,'policy.signature_verified',row.record_id);res.json({stored:true});
  });
  app.get('/api/governance',(req,res)=>res.json({tideQuorumVerified:false,status:'Live multi-admin quorum check still required',policy:'Owner consent is recorded by the API. Relationship policies are signed in the Tide enclave under the realm admin policy. Operators have no data override.',audit:db.prepare('SELECT id,action,record_id,created FROM audit WHERE actor=? ORDER BY id DESC LIMIT 30').all(req.actor.sub)}));
  app.post('/api/governance/self-grant',(req,res)=>{audit(req.actor.sub,'governance.self_grant_denied');res.status(403).json({error:'Self-grant denied. A record owner must request access and an independent Tide admin must provide a valid network-signed policy.'});});
  app.use('/api',(_req,res)=>res.status(404).json({error:'API operation not available.'}));
  if(distPath){app.use(express.static(distPath,{index:false}));app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:distPath}));}
  app.use((error,_req,res,_next)=>{const status=error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;res.status(status).json({error:status===500?'Operation could not be completed.':'Invalid request body.'});});
  return app;
}
