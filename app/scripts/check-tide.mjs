import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterStatus } from '../server/config.mjs';
try {
 const config=JSON.parse(readFileSync(resolve(process.env.TIDECLOAK_CONFIG||'tidecloak.json'),'utf8'));
 const status=adapterStatus(config,process.env.APP_ORIGIN||'http://localhost:5173');
 if(!status.ready){console.error('INCOMPLETE: '+status.missing.join(', ')+'. Export the official Tide adapter; no remote JWKS fallback.');process.exitCode=2;}
 else{
  const issuer=`${config['auth-server-url'].replace(/\/+$/,'')}/realms/${config.realm}`;
  const r=await fetch(issuer+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error();const discovery=await r.json();
  if(discovery.issuer!==issuer||!discovery.dpop_signing_alg_values_supported?.includes('ES256'))throw new Error();
  console.log('PASS: embedded Ed25519 adapter fields, matching issuer and advertised ES256 DPoP.');
  console.log('Live login, policy signing, encryption/decryption and multi-admin refusal tests are still required.');
 }
}catch{console.error('FAIL: could not check the public adapter/identity discovery. Configuration values were not logged.');process.exitCode=1;}
