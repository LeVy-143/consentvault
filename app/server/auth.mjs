import { createLocalJWKSet, jwtVerify } from 'jose';
import { verifyDpop } from './dpop.mjs';
import { replayStore } from './store.mjs';
import { adapterStatus } from './config.mjs';
export const APP_ROLES = ['contributor','researcher','operator'];
export function roleList(claims, resource) {
  const a = claims.realm_access?.roles, b = claims.resource_access?.[resource]?.roles;
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].filter(r => typeof r === 'string');
}
export function authenticate(getConfig, db, origin) {
  const resolvers = new WeakMap();
  return async (req, res, next) => {
    const config = getConfig();
    if (!adapterStatus(config, origin).ready) return res.status(503).json({ error: 'A complete Tide adapter with embedded JWKS is required. No generic OIDC fallback.' });
    const match = /^DPoP ([A-Za-z0-9_.-]+)$/i.exec(req.headers.authorization ?? '');
    if (!match || match[1].length > 16000 || typeof req.headers.dpop !== 'string' || req.headers.dpop.length > 16000) return res.status(401).json({ error: 'A Tide access token and valid DPoP proof are required.' });
    let claims;
    try {
      if (!resolvers.has(config)) resolvers.set(config, createLocalJWKSet(config.jwk));
      ({ payload: claims } = await jwtVerify(match[1], resolvers.get(config), {
        issuer: `${config['auth-server-url'].replace(/\/+$/, '')}/realms/${config.realm}`,
        audience: config.resource, algorithms: ['EdDSA'], requiredClaims: ['exp','iat','sub','azp','iss','aud'], clockTolerance: 0,
      }));
      if (!['DPoP','Bearer'].includes(claims.typ) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 200 || claims.azp !== config.resource || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() || !Number.isFinite(claims.iat) || claims.iat > Date.now()/1000+60) throw new Error('Invalid access token claims');
      await verifyDpop({ url: new URL(req.originalUrl, origin).href, method: req.method, headers: { get: name => req.get(name) ?? null } }, match[1], claims,
        { trustForwardedHeaders: false, jtiStore: replayStore(db, claims.cnf?.jkt ?? '') });
    } catch { return res.status(401).json({ error: 'Invalid Tide token or DPoP proof.' }); }
    const roles = roleList(claims, config.resource);
    const isRealmAdmin = Array.isArray(claims.resource_access?.['realm-management']?.roles) && claims.resource_access['realm-management'].roles.includes('tide-realm-admin');
    if (!roles.includes('_tide_enabled') || (!roles.some(r => APP_ROLES.includes(r)) && !isRealmAdmin)) return res.status(403).json({ error: 'A Tide-enabled ConsentVault identity is required.' });
    if (typeof claims.tideuserkey !== 'string' || !claims.tideuserkey || claims.tideuserkey.length > 512) return res.status(403).json({ error: 'Link a real Tide account before using ConsentVault.' });
    req.actor = { sub: claims.sub, name: String(claims.name || claims.preferred_username || claims.sub).slice(0,100), tideUserKey: claims.tideuserkey, roles, isRealmAdmin };
    next();
  };
}
