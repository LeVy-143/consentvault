// Based on @tideorg/mcp@1.9.33 templates/relationship-attestation/relationship.ts.
import { Models } from '@tideorg/js';
import { PolicySignRequest } from 'heimdall-tide';
import { buildPolicy, b64, unb64, inspectPolicy } from '../shared/relationship.mjs';
export async function signRecordPolicy(IAMService, request, config) {
  const token = await IAMService.getToken();
  if (!token) throw new Error('Sign in with a Tide administrator account.');
  // Admin reads/approvals use their own browser, token and DPoP proof. No service-account proxy.
  const base = config['auth-server-url'].replace(/\/$/, '');
  const response = await IAMService.secureFetch(`${base}/admin/realms/${encodeURIComponent(config.realm)}/iga/role-policies/name/tide-realm-admin`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Cannot read the realm admin policy with this identity.');
  const result = await response.json();
  if (typeof result.policy !== 'string') throw new Error('The realm has no signed admin policy.');
  const adminPolicy = inspectPolicy(result.policy);
  if (!adminPolicy.signature?.length || Number(adminPolicy.params.threshold) < 2 || !Number.isFinite(Number(adminPolicy.params.threshold))) throw new Error('A signed multi-admin policy with threshold at least 2 is required. Configure and regenerate the policy in the Tide console.');
  const policy = buildPolicy({ vendorId: config.vendorId, ...request });
  const tc = IAMService._tc;
  if (!tc) throw new Error('TideCloak has not initialized.');
  const signRequest = PolicySignRequest.New(policy);
  signRequest.setCustomExpiry(604800);
  const initialized = await tc.createTideRequest(signRequest.encode());
  const id = Models.BaseTideRequest.decode(initialized).getUniqueId();
  const [approval] = await tc.requestTideOperatorApproval([{ id, request: initialized }]);
  if (!approval || approval.status !== 'approved') throw new Error(`Tide approval is ${approval?.status || 'unavailable'}. No policy was stored.`);
  const approved = Models.BaseTideRequest.decode(approval.request);
  approved.addPolicy(unb64(result.policy));
  const signatures = await tc.executeSignRequest(approved.encode(), true);
  if (!signatures?.[0]) throw new Error('Tide returned no policy signature.');
  policy.signature = signatures[0];
  return { policy: b64(policy.toBytes()), adminPolicy: result.policy };
}
export async function encryptForRecord(IAMService, plaintext, record) {
  if (!record.policy) throw new Error('Wait for the signed owner policy.');
  const [out] = await IAMService.doEncrypt([{ data: plaintext, tags: [record.id] }], unb64(record.policy));
  if (!(typeof out === 'string' || out instanceof Uint8Array)) throw new Error('Tide did not return ciphertext. Nothing was saved.');
  return typeof out === 'string' ? out : b64(out);
}
export async function decryptForRecord(IAMService, record) {
  if (!record.policy || !record.ciphertext) throw new Error('This record has no active read policy.');
  const [out] = await IAMService.doDecrypt([{ encrypted: record.ciphertext, tags: [record.id] }], unb64(record.policy));
  if (!(typeof out === 'string' || out instanceof Uint8Array)) throw new Error('Tide did not return plaintext.');
  return typeof out === 'string' ? out : new TextDecoder().decode(out);
}
