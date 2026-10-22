// Adapted from Tide Agent Pack 1.9.33 templates/dpop-verify/verifyDpop.ts (RFC 9449).
import { jwtVerify, importJWK, calculateJwkThumbprint, decodeProtectedHeader } from "jose";
class DpopError extends Error {
  constructor(message) {
    super(message);
    this.name = "DpopError";
  }
}
const IAT_SKEW_SECONDS = 300;
function requestHtu(req, trustForwardedHeaders = true) {
  const url = new URL(req.url);
  if (trustForwardedHeaders) {
    const host = req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto");
    if (host) {
      const h = host.split(",")[0].trim();
      const p = proto?.split(",")[0].trim() || url.protocol.replace(":", "");
      return `${p}://${h}${url.pathname}`;
    }
  }
  return `${url.origin}${url.pathname}`;
}
async function verifyDpop(req, accessToken, claims, opts = {}) {
  const jkt = claims.cnf?.jkt;
  if (!jkt) {
    throw new DpopError(
      "Access token has no cnf.jkt \u2014 it is not sender-constrained. Enable useDPoP on the client; accepting it here would make DPoP optional, which is the same as not having it."
    );
  }
  const authz = req.headers.get("authorization") ?? "";
  if (!/^DPoP /i.test(authz)) {
    throw new DpopError(
      "Sender-constrained token presented without the DPoP auth scheme. A cnf.jkt token sent as `Bearer` is a replay of a stolen token."
    );
  }
  const proof = req.headers.get("dpop");
  if (!proof) throw new DpopError("Missing DPoP proof header.");
  let header;
  try {
    header = decodeProtectedHeader(proof);
  } catch {
    throw new DpopError("DPoP proof is not a compact JWS.");
  }
  if (header.typ !== "dpop+jwt") throw new DpopError(`DPoP proof typ is '${header.typ}', expected 'dpop+jwt'.`);
  const jwk = header.jwk;
  if (!jwk || header.alg !== 'ES256' || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d) throw new DpopError('A public ES256 DPoP key is required.');
  let payload;
  try {
    const key = await importJWK(jwk, header.alg);
    ({ payload } = await jwtVerify(proof, key, { algorithms: ['ES256'] }));
  } catch (e) {
    throw new DpopError(`DPoP proof signature invalid: ${e instanceof Error ? e.message : String(e)}`);
  }
  const thumb = await calculateJwkThumbprint(jwk, "sha256");
  if (thumb !== jkt) {
    throw new DpopError("DPoP proof key does not match the token's cnf.jkt \u2014 token and proof come from different keys.");
  }
  const expectedAth = base64url(await sha256(accessToken));
  if (payload.ath !== expectedAth) {
    throw new DpopError("DPoP proof `ath` does not match the presented access token.");
  }
  if (typeof payload.htm !== "string" || payload.htm.toUpperCase() !== req.method.toUpperCase()) {
    throw new DpopError(`DPoP proof htm '${String(payload.htm)}' does not match ${req.method}.`);
  }
  const htu = requestHtu(req, opts.trustForwardedHeaders ?? true);
  if (payload.htu !== htu) {
    throw new DpopError(
      `DPoP proof htu '${String(payload.htu)}' does not match '${htu}'. Behind a proxy this is usually x-forwarded-host not being honoured, not an attack.`
    );
  }
  const skew = opts.iatSkewSeconds ?? IAT_SKEW_SECONDS;
  const iat = typeof payload.iat === "number" ? payload.iat : NaN;
  if (!Number.isFinite(iat) || Math.abs(Date.now() / 1e3 - iat) > skew) {
    throw new DpopError(`DPoP proof iat is outside the \xB1${skew}s window.`);
  }
  const jti = payload.jti;
  if (typeof jti !== "string" || !jti || jti.length > 200) throw new DpopError("DPoP proof has no valid jti.");
  const store = opts.jtiStore;
  if (!store) throw new DpopError('A persistent replay store is required.');
  if (!await store.claim(jti, Math.max(Date.now(), iat * 1000) + skew * 1e3)) {
    throw new DpopError("DPoP proof jti already used \u2014 replay.");
  }
}
async function sha256(s) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}
function base64url(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export {
  DpopError,
  requestHtu,
  verifyDpop
};
