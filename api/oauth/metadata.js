// OAuth 2.1 Authorization Server Metadata (RFC 8414).
// Served at /.well-known/oauth-authorization-server via vercel.json rewrite.
import { requestOrigin } from '../_lib/config.js';

export default function handler(req, res) {
  const origin = requestOrigin(req);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['dashboard'],
  });
}
