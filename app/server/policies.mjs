import { inspectPolicy, rolesFor } from '../.generated/relationship.mjs';
// Matches the SDK's Policy.DataToVerify and the pack's Ed25519 attestation verification pattern.
// A successful check binds the signed policy to the immutable owner-requested grant.
export async function verifyRelationshipPolicy(encoded, expected, config) {
  try {
    const p = inspectPolicy(encoded);
    if (p.version !== p.latestVersion || p.contractId !== 'RelationshipAttestation:1' || p.keyId !== config.vendorId || !p.implicit || !p.private || p.expiry !== expected.expiry || p.expiry <= Date.now() / 1000 || p.signature?.length !== 64) return false;
    if (JSON.stringify(p.modelIds) !== JSON.stringify(['PolicyEnabledEncryption:1','PolicyEnabledDecryption:1'])) return false;
    const params = p.params;
    if (Object.keys(params).length !== 4 || params.subjectType !== 'User' || params.subjectId !== expected.tideUserKey || params.assignmentId !== expected.recordId || params.roles !== JSON.stringify(rolesFor(expected.access))) return false;
    for (const jwk of config.jwk.keys) {
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || jwk.d) continue;
      const key = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
      if (await crypto.subtle.verify({ name: 'Ed25519' }, key, p.signature, p.dataToVerify)) return true;
    }
  } catch { /* Invalid bytes never become an approved grant. No raw policy/error logging. */ }
  return false;
}
export async function verifyAdminQuorumPolicy(encoded, config) {
  try {
    const p = inspectPolicy(encoded);
    if (p.keyId !== config.vendorId || p.contractId !== 'GenericResourceAccessThresholdRole:1' || !p.modelIds.includes('Policy:1') || p.params.role !== 'tide-realm-admin' || p.params.resource !== 'realm-management' || !Number.isFinite(Number(p.params.threshold)) || Number(p.params.threshold) < 2 || p.signature?.length !== 64 || (p.expiry !== null && p.expiry <= Date.now()/1000)) return false;
    for (const jwk of config.jwk.keys) {
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || jwk.d) continue;
      const key = await crypto.subtle.importKey('jwk', { kty:'OKP', crv:'Ed25519', x:jwk.x }, { name:'Ed25519' }, false, ['verify']);
      if (await crypto.subtle.verify({name:'Ed25519'}, key, p.signature, p.dataToVerify)) return true;
    }
  } catch { }
  return false;
}
