// Shared config for the hosted MCP connector endpoints.

export const SUPABASE_URL =
  process.env.DASH_SUPABASE_URL || 'https://gfxfedfxmipbgcvtpesx.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.DASH_SUPABASE_ANON_KEY ||
  'sb_publishable_oauR1DwB9y9bldVhSDpFHQ_rRDNO0FX';

// OAuth redirect targets we will send authorization codes to. Claude's MCP
// connector callbacks, plus localhost for MCP Inspector testing.
const REDIRECT_ALLOWLIST = [
  /^https:\/\/claude\.ai\//,
  /^https:\/\/claude\.com\//,
  /^https:\/\/www\.claude\.ai\//,
  /^https:\/\/www\.claude\.com\//,
  /^http:\/\/localhost(:\d+)?\//,
  /^http:\/\/127\.0\.0\.1(:\d+)?\//,
];

export function isAllowedRedirect(uri) {
  return typeof uri === 'string' && REDIRECT_ALLOWLIST.some((re) => re.test(uri));
}

// Origin of this deployment, derived from proxy headers.
export function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Stateless dynamic client registration: the client_id encodes the
// registered redirect URIs so /authorize can validate without storage.
export function encodeClientId(redirectUris) {
  return Buffer.from(JSON.stringify({ r: redirectUris })).toString('base64url');
}

export function decodeClientId(clientId) {
  try {
    const parsed = JSON.parse(Buffer.from(String(clientId), 'base64url').toString());
    return Array.isArray(parsed.r) ? parsed.r : null;
  } catch {
    return null;
  }
}

// Validate a Supabase access token and return the user id, or null.
export async function getUserId(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id || null;
}
