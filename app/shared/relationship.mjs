// RelationshipAttestation:1, adapted from Tide Agent Pack 1.9.33's official template.
// No private content keys are generated, reconstructed or cached by ConsentVault.
import { Models } from '@tideorg/js';
export const CONTRACT = 'RelationshipAttestation:1';
export const MODEL_IDS = ['PolicyEnabledEncryption:1', 'PolicyEnabledDecryption:1'];
export const rolesFor = access => access === 'read-write' ? ['_tide_encryptor', '_tide_decryptor'] : ['_tide_decryptor'];
export function b64(bytes) { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); }
export function unb64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function buildPolicy({ vendorId, tideUserKey, recordId, access, expiry }) {
  if (!vendorId || !tideUserKey || !recordId || !['read','read-write'].includes(access) || !Number.isSafeInteger(expiry)) throw new Error('Incomplete relationship policy request.');
  return new Models.Policy({
    version: Models.Policy.latestVersion, contractId: CONTRACT, modelId: MODEL_IDS, keyId: vendorId,
    approvalType: Models.ApprovalType.IMPLICIT, executionType: Models.ExecutionType.PRIVATE,
    params: new Map([['subjectType','User'], ['subjectId', tideUserKey], ['assignmentId', recordId], ['roles', JSON.stringify(rolesFor(access))]]), expiry,
  });
}
export function inspectPolicy(encoded) {
  const p = Models.Policy.from(unb64(encoded));
  return { policy: p, version: p.version, latestVersion: Models.Policy.latestVersion, contractId: p.contractId, modelIds: p.modelIds, keyId: p.keyId,
    approvalType: p.approvalType, executionType: p.executionType,
    implicit: p.approvalType === Models.ApprovalType.IMPLICIT, private: p.executionType === Models.ExecutionType.PRIVATE,
    params: Object.fromEntries(p.params.entries), expiry: p.expiry === undefined ? null : Number(p.expiry),
    signature: p.signature, dataToVerify: p.dataToVerify };
}
