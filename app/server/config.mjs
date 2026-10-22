export function adapterStatus(config, origin) {
  const missing = [];
  for (const field of ['realm','resource','auth-server-url','vendorId','homeOrkUrl']) if (!config?.[field]) missing.push(field);
  if (!config?.jwk?.keys?.some(k => k.kty === 'OKP' && k.crv === 'Ed25519' && k.x && !k.d)) missing.push('jwk (embedded Ed25519 public key)');
  if (!config?.[`client-origin-auth-${origin}`]) missing.push('client-origin-auth for this browser origin');
  return { ready: missing.length === 0, missing };
}
export function publicConfig(config, origin) {
  const fields = ['realm','resource','auth-server-url','vendorId','homeOrkUrl',`client-origin-auth-${origin}`];
  return { ...Object.fromEntries(Object.entries(config).filter(([k]) => fields.includes(k))),
    jwk: { keys: config.jwk.keys.map(k => Object.fromEntries(Object.entries(k).filter(([name]) => ['kty','crv','x','y','n','e','kid','use','alg'].includes(name)))) },
    useDPoP: { mode: 'strict', alg: 'ES256' }, redirectUri: `${origin}/auth/redirect` };
}
