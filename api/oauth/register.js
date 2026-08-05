// Dynamic Client Registration (RFC 7591) — stateless: the client_id encodes
// the registered redirect URIs, which must be Claude callbacks (or localhost).
import { encodeClientId, isAllowedRedirect } from '../_lib/config.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = req.body || {};
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || !uris.every(isAllowedRedirect)) {
    return res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description:
        'redirect_uris must be Claude connector callbacks (claude.ai / claude.com) or localhost.',
    });
  }

  res.status(201).json({
    client_id: encodeClientId(uris),
    redirect_uris: uris,
    client_name: body.client_name || 'MCP client',
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
}
