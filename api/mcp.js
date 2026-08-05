// Hosted MCP endpoint — Streamable HTTP, stateless (one transport per
// request). Bearer token is the user's Supabase JWT from the OAuth flow;
// a Supabase client created with that JWT keeps RLS scoping intact.
import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from '../mcp-server/lib/registry.js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getUserId,
  requestOrigin,
} from './_lib/config.js';

function unauthorized(req, res, description) {
  const meta = `${requestOrigin(req)}/.well-known/oauth-protected-resource`;
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${meta}", error="invalid_token", error_description="${description}"`
  );
  res.status(401).json({ error: 'invalid_token', error_description: description });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return unauthorized(req, res, 'Missing bearer token');

  const uid = await getUserId(token);
  if (!uid) return unauthorized(req, res, 'Token is invalid or expired');

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ctx = { sb, uid };

  const server = buildServer(async () => ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
