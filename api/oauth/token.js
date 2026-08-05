// OAuth token endpoint. The Supabase session IS the credential:
// access_token = Supabase JWT (RLS-scoped), refresh_token = sealed Supabase
// refresh token. Refresh grant rotates the session through GoTrue.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../_lib/config.js';
import { seal, open, sha256base64url } from '../_lib/seal.js';

const ACCESS_TTL_SECONDS = 3300; // Supabase JWTs live 1h; advertise slightly less
const REFRESH_TTL_SECONDS = 90 * 24 * 3600;

const err = (res, status, error, description) =>
  res.status(status).json({ error, error_description: description });

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'invalid_request', 'POST only');
  const b = req.body || {};

  if (b.grant_type === 'authorization_code') {
    const payload = open(b.code);
    if (!payload) return err(res, 400, 'invalid_grant', 'Code is invalid or expired.');
    if (!b.code_verifier || sha256base64url(b.code_verifier) !== payload.c) {
      return err(res, 400, 'invalid_grant', 'PKCE verification failed.');
    }
    if (b.redirect_uri && b.redirect_uri !== payload.u) {
      return err(res, 400, 'invalid_grant', 'redirect_uri mismatch.');
    }
    return res.status(200).json({
      access_token: payload.a,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: seal({ r: payload.r }, REFRESH_TTL_SECONDS),
      scope: 'dashboard',
    });
  }

  if (b.grant_type === 'refresh_token') {
    const payload = open(b.refresh_token);
    if (!payload) {
      return err(res, 400, 'invalid_grant', 'Refresh token is invalid or expired — reconnect.');
    }
    const upstream = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: payload.r }),
    });
    if (!upstream.ok) {
      return err(res, 400, 'invalid_grant', 'Session could not be refreshed — reconnect.');
    }
    const session = await upstream.json();
    return res.status(200).json({
      access_token: session.access_token,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: seal({ r: session.refresh_token }, REFRESH_TTL_SECONDS),
      scope: 'dashboard',
    });
  }

  return err(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
