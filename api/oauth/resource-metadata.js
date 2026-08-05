// OAuth Protected Resource Metadata (RFC 9728).
// Served at /.well-known/oauth-protected-resource via vercel.json rewrite.
import { requestOrigin } from '../_lib/config.js';

export default function handler(req, res) {
  const origin = requestOrigin(req);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    resource_name: 'Master Dashboard',
  });
}
