import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign, createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint } from 'jose';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { buildPolicy, b64, inspectPolicy } from '../.generated/relationship.mjs';

// LOCAL fixtures: real Ed25519/ES256 signatures and SDK policy serialization.
// No ORK, live Tide sign/decrypt, or genuine Tide ciphertext is claimed by this suite.
const origin='http://localhost:5173';
test('DPoP, embedded Tide key, record consent and signed relationship policies',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'consentvault-policy-'));
 const root=await generateKeyPair('EdDSA'), attacker=await generateKeyPair('EdDSA');
 const rootJwk={...await exportJWK(root.publicKey),kid:'fixture-root',alg:'EdDSA',use:'sig'};
 const config={'auth-server-url':'https://fixture.invalid',realm:'consentvault',resource:'consentvault',vendorId:'fixture-vendor',homeOrkUrl:'https://fixture.invalid',jwk:{keys:[rootJwk]},[`client-origin-auth-${origin}`]:'explicit-fixture'};
 const roles={lan:['contributor','_tide_encryptor','_tide_decryptor'],an:['researcher','_tide_decryptor'],binh:['researcher','_tide_decryptor'],operator:['operator'],admin:['operator'],selfAdmin:['contributor','operator','_tide_encryptor','_tide_decryptor']};
 const identities={};
 for(const sub of Object.keys(roles)){const pair=await generateKeyPair('ES256');const jwk=await exportJWK(pair.publicKey);identities[sub]={...pair,jwk,jkt:await calculateJwkThumbprint(jwk)};}
 async function token(sub,changes={},issuer='https://fixture.invalid/realms/consentvault',key=root.privateKey){
  return new SignJWT({typ:'DPoP',sub,iss:issuer,aud:'consentvault',azp:'consentvault',exp:Math.floor(Date.now()/1000)+600,iat:Math.floor(Date.now()/1000),cnf:{jkt:identities[sub].jkt},name:sub,tideuserkey:`fixture-tide-key-${sub}`,realm_access:{roles:['_tide_enabled',...roles[sub]]},...(['admin','selfAdmin'].includes(sub)?{resource_access:{'realm-management':{roles:['tide-realm-admin']}}}:{}),...changes}).setProtectedHeader({alg:'EdDSA',kid:'fixture-root'}).sign(key);
 }
 const tokens=Object.fromEntries(await Promise.all(Object.keys(roles).map(async s=>[s,await token(s)])));
 async function proof(sub,access,path,method='GET',changes={},pair=identities[sub]){
  return new SignJWT({jti:crypto.randomUUID(),htm:method,htu:new URL(path,origin).origin+new URL(path,origin).pathname,iat:Math.floor(Date.now()/1000),ath:createHash('sha256').update(access).digest('base64url'),...changes}).setProtectedHeader({typ:'dpop+jwt',alg:'ES256',jwk:pair.jwk}).sign(pair.privateKey);
 }
 let db,server,base;
 async function start(){db=openStore(join(dir,'db.sqlite'));server=createApp({db,getConfig:()=>config,origin}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){await new Promise(r=>server.close(r));db.close();}
 async function request(sub,path,method='GET',body,options={}){
  const access=options.token||tokens[sub];const p=options.proof||await proof(sub,access,'/api'+path,method,options.proofChanges);
  const r=await fetch(base+'/api'+path,{method,headers:{Authorization:`${options.scheme||'DPoP'} ${access}`,...(!options.noProof?{DPoP:p}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...options.headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return{status:r.status,body:await r.json()};
 }
 function signedPolicy(requestRow,changes={}){
  const p=buildPolicy({vendorId:config.vendorId,...requestRow,...changes});p.signature=new Uint8Array(sign(null,p.dataToVerify,root.privateKey));return b64(p.toBytes());
 }
 function adminPolicy(threshold=2){
  const example=buildPolicy({vendorId:config.vendorId,tideUserKey:'fixture',recordId:'fixture',access:'read',expiry:Math.floor(Date.now()/1000)+3600});
  const p=new example.constructor({version:example.version,contractId:'GenericResourceAccessThresholdRole:1',modelId:['Policy:1'],keyId:config.vendorId,approvalType:0,executionType:0,params:new Map([['role','tide-realm-admin'],['resource','realm-management'],['threshold',threshold]])});
  p.signature=new Uint8Array(sign(null,p.dataToVerify,root.privateKey));return b64(p.toBytes());
 }
 await start();
 try{
  await t.test('requires a complete embedded adapter; never falls back to remote JWKS',async()=>{
   const keys=config.jwk;delete config.jwk;
   try{assert.equal((await request('lan','/me')).status,503);assert.equal((await(await fetch(base+'/api/config')).json()).configured,false);}finally{config.jwk=keys;}
  });
  await t.test('valid sender-bound token and proof are accepted',async()=>{assert.equal((await request('lan','/me')).status,200);});
  await t.test('missing proof, Bearer replay and unbound tokens are rejected',async()=>{
   assert.equal((await request('lan','/me','GET',undefined,{noProof:true})).status,401);
   assert.equal((await request('lan','/me','GET',undefined,{scheme:'Bearer'})).status,401);
   assert.equal((await request('lan','/me','GET',undefined,{token:await token('lan',{cnf:undefined})})).status,401);
  });
  await t.test('rejects forged JWT, wrong issuer/audience/client, expiry, ID token and future iat',async()=>{
   for(const changes of [{aud:'wrong'},{azp:'wrong'},{exp:0},{exp:undefined},{typ:'ID'},{iat:Math.floor(Date.now()/1000)+3600}])assert.equal((await request('lan','/me','GET',undefined,{token:await token('lan',changes)})).status,401);
   assert.equal((await request('lan','/me','GET',undefined,{token:await token('lan',{},'https://wrong.invalid')})).status,401);
   assert.equal((await request('lan','/me','GET',undefined,{token:await token('lan',{},undefined,attacker.privateKey)})).status,401);
  });
  await t.test('DPoP verifies key binding, ath, method, URL and time; query is excluded from htu',async()=>{
   const wrong=await proof('lan',tokens.lan,'/api/me','GET',{},identities.an);
   assert.equal((await request('lan','/me','GET',undefined,{proof:wrong})).status,401);
   for(const changes of [{ath:'wrong'},{htm:'POST'},{htu:origin+'/wrong'},{iat:0}])assert.equal((await request('lan','/me','GET',undefined,{proofChanges:changes})).status,401);
   assert.equal((await request('lan','/me?query=ignored')).status,200);
  });
  let replay;
  await t.test('replay proof is denied and its jti is persisted',async()=>{
   replay=await proof('lan',tokens.lan,'/api/me');assert.equal((await request('lan','/me','GET',undefined,{proof:replay})).status,200);assert.equal((await request('lan','/me','GET',undefined,{proof:replay})).status,401);
  });
  await t.test('member keys derive from verified Tide claims, not user input',async()=>{
   assert.equal((await request('lan','/members','POST',{tideUserKey:'someone-else'})).status,400);
   for(const sub of Object.keys(roles))assert.equal((await request(sub,'/members','POST')).status,200);
   assert.equal((await request('lan','/members','POST',undefined,{token:await token('lan',{tideuserkey:'changed-key'})})).status,409);
  });
  let r1,r2,ownerRequests;
  await t.test('reserve two metadata-only records; no write before a signed policy',async()=>{
   assert.equal((await request('lan','/records','POST',{kind:'Vietnamese text',plaintext:'PRIVATE_SENTINEL_NEVER_STORE'})).status,400);
   r1=(await request('lan','/records','POST',{kind:'Vietnamese text'})).body.id;r2=(await request('lan','/records','POST',{kind:'Private survey'})).body.id;assert.ok(r1&&r2);
   assert.equal((await request('lan',`/records/${r1}/ciphertext`,'PUT',{ciphertext:b64(new Uint8Array(80))})).status,403);
   ownerRequests=(await request('admin','/policy-requests')).body;assert.equal(ownerRequests.length,2);
  });
  await t.test('policy upload requires real admin role, network signature, recipient and record binding',async()=>{
   const row=ownerRequests.find(r=>r.recordId===r1),good=signedPolicy(row),m0=adminPolicy();
   assert.equal((await request('operator',`/policy-requests/${row.id}/policy`,'POST',{policy:good,adminPolicy:m0})).status,403);
   for(const changed of [{recordId:r2},{tideUserKey:'fixture-tide-key-binh'},{access:'read'},{expiry:row.expiry+60}])assert.equal((await request('admin',`/policy-requests/${row.id}/policy`,'POST',{policy:signedPolicy(row,changed),adminPolicy:m0})).status,400);
   assert.equal((await request('admin',`/policy-requests/${row.id}/policy`,'POST',{policy:good,adminPolicy:adminPolicy(1)})).status,400);
   const forged=inspectPolicy(good).policy;forged.signature=new Uint8Array(64);
   assert.equal((await request('admin',`/policy-requests/${row.id}/policy`,'POST',{policy:b64(forged.toBytes()),adminPolicy:m0})).status,400);
   for(const req of ownerRequests)assert.equal((await request('admin',`/policy-requests/${req.id}/policy`,'POST',{policy:signedPolicy(req),adminPolicy:m0})).status,200);
  });
  const opaque=b64(new TextEncoder().encode('OPAQUE_CIPHERTEXT_FIXTURE_NOT_A_LIVE_TIDE_RESULT_000000000'));
  await t.test('stores only opaque ciphertext and keeps record content immutable',async()=>{
   assert.equal((await request('lan',`/records/${r1}/ciphertext`,'PUT',{plaintext:'PRIVATE_SENTINEL_NEVER_STORE'})).status,400);
   for(const id of[r1,r2])assert.equal((await request('lan',`/records/${id}/ciphertext`,'PUT',{ciphertext:opaque})).status,200);
   assert.equal((await request('lan',`/records/${r1}/ciphertext`,'PUT',{ciphertext:opaque})).status,409);
  });
  let anRequest;
  await t.test('only Lan can request record 1 for An; operators and other contributors cannot',async()=>{
   assert.equal((await request('operator',`/records/${r1}/requests`,'POST',{recipient:'operator'})).status,403);
   assert.equal((await request('selfAdmin',`/records/${r1}/requests`,'POST',{recipient:'selfAdmin'})).status,404);
   assert.equal((await request('lan',`/records/${r1}/requests`,'POST',{recipient:'operator'})).status,400);
   const result=await request('lan',`/records/${r1}/requests`,'POST',{recipient:'an'});assert.equal(result.status,201);anRequest=result.body;assert.equal(anRequest.access,'read');
   assert.deepEqual((await request('an','/records?scope=shared')).body,[]);
   assert.equal((await request('admin',`/policy-requests/${anRequest.id}/policy`,'POST',{policy:signedPolicy(anRequest),adminPolicy:adminPolicy()})).status,200);
  });
  await t.test('An gets only record 1 and her User policy; no record 2 access',async()=>{
   const shared=await request('an','/records?scope=shared');assert.deepEqual(shared.body.map(r=>r.id),[r1]);
   const received=(await request('an',`/records/${r1}`)).body;const p=inspectPolicy(received.policy);
   assert.equal(p.params.subjectId,'fixture-tide-key-an');assert.equal(p.params.assignmentId,r1);assert.equal(p.params.roles,'["_tide_decryptor"]');
   assert.equal((await request('an',`/records/${r2}`)).status,404);
  });
  await t.test('Binh and operators cannot enumerate or fetch Lan records',async()=>{
   assert.deepEqual((await request('binh','/records?scope=shared')).body,[]);
   for(const sub of['binh','operator','admin'])for(const id of[r1,r2])assert.equal((await request(sub,`/records/${id}`)).status,404);
   assert.equal((await request('operator','/records?scope=owned')).status,403);
  });
  await t.test('admin self-grant is blocked; quorum is not falsely claimed',async()=>{
   const id=(await request('selfAdmin','/records','POST',{kind:'Private survey'})).body.id;
   const row=(await request('selfAdmin','/policy-requests')).body.find(r=>r.recordId===id);
   assert.equal((await request('selfAdmin',`/policy-requests/${row.id}/policy`,'POST',{policy:signedPolicy(row),adminPolicy:adminPolicy()})).status,403);
   assert.equal((await request('operator','/governance/self-grant','POST')).status,403);
   assert.equal((await request('operator','/governance')).body.tideQuorumVerified,false);
   assert.equal((await request('lan','/governance/self-grant','POST',undefined,{headers:{Origin:'https://evil.invalid'}})).status,403);
  });
  await t.test('restart preserves policies, ACL and replay protection',async()=>{
   await stop();await start();assert.equal((await request('an',`/records/${r1}`)).status,200);assert.equal((await request('an',`/records/${r2}`)).status,404);assert.equal((await request('lan','/me','GET',undefined,{proof:replay})).status,401);
  });
  await t.test('database, WAL and audit contain no contribution plaintext, token or private key',async()=>{
   const data=readdirSync(dir).map(n=>readFileSync(join(dir,n)).toString('utf8')).join('');
   const secret=(await exportJWK(root.privateKey)).d;
   for(const sentinel of['PRIVATE_SENTINEL_NEVER_STORE',tokens.lan,secret])assert.equal(data.includes(sentinel),false);
  });
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});

test('unconfigured instance exposes setup status but no authenticated data fallback',async()=>{
 const db=openStore(':memory:');const server=createApp({db,getConfig:()=>null}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;assert.equal((await(await fetch(base+'/api/config')).json()).configured,false);assert.equal((await fetch(base+'/api/me')).status,503);assert.equal((await fetch(base+'/api/health')).status,200);}finally{await new Promise(r=>server.close(r));db.close();}
});
