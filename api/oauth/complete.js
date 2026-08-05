// Mints the OAuth authorization code after the login page obtains a Supabase
// session. Validates the session server-side, then seals the session tokens +
// PKCE challenge into a short-lived code and returns the Claude redirect URL.
import {
  decodeClientId,
  isAllowedRedirect,
  getUserId,
} from '../_lib/config.js';
import { seal } from '../_lib/seal.js';

const CODE_TTL_SECONDS = 120;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const b = req.body || {};
  const registered = decodeClientId(b.client_id);
  if (
    !registered ||
    !registered.includes(b.redirect_uri) ||
    !isAllowedRedirect(b.redirect_uri) ||
    !b.code_challenge ||
    !b.access_token ||
    !b.refresh_token
  ) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing or invalid authorization parameters.',
    });
  }

  // Only a real, live Supabase session may be exchanged for a code.
  const userId = await getUserId(b.access_token);
  if (!userId) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Sign-in session is invalid or expired — try again.',
    });
  }

  const code = seal(
    {
      a: b.access_token,
      r: b.refresh_token,
      c: b.code_challenge,
      u: b.redirect_uri,
    },
    CODE_TTL_SECONDS
  );

  const url = new URL(b.redirect_uri);
  url.searchParams.set('code', code);
  if (b.state) url.searchParams.set('state', b.state);
  res.status(200).json({ redirect_to: url.toString() });
}
