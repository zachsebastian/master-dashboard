// Connector endpoint tests — no credentials needed. Exercises the OAuth
// metadata/registration/authorize/token handlers and the MCP endpoint's
// auth gate using mock req/res objects.
process.env.MCP_SECRET = 'test-secret-for-connector-tests';

import { createHash, randomBytes } from 'node:crypto';
import metadata from '../../api/oauth/metadata.js';
import resourceMetadata from '../../api/oauth/resource-metadata.js';
import register from '../../api/oauth/register.js';
import authorize from '../../api/oauth/authorize.js';
import token from '../../api/oauth/token.js';
import mcp from '../../api/mcp.js';
import { seal } from '../../api/_lib/seal.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    listeners: {},
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; return res; },
    json(o) { res.body = o; return res; },
    send(s) { res.body = s; return res; },
    end(s) { res.body = s ?? res.body; return res; },
    on(ev, fn) { res.listeners[ev] = fn; return res; },
  };
  return res;
}
const mockReq = (over = {}) => ({
  method: 'GET',
  url: '/',
  headers: { host: 'example.vercel.app', 'x-forwarded-proto': 'https' },
  query: {},
  body: undefined,
  ...over,
});

let passed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    console.error(`FAIL  ${label}: ${err.message}`);
    process.exitCode = 1;
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const ORIGIN = 'https://example.vercel.app';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

await check('authorization-server metadata', async () => {
  const res = mockRes();
  metadata(mockReq(), res);
  assert(res.body.issuer === ORIGIN, `bad issuer ${res.body.issuer}`);
  assert(res.body.authorization_endpoint === `${ORIGIN}/api/oauth/authorize`);
  assert(res.body.code_challenge_methods_supported.includes('S256'));
});

await check('protected-resource metadata', async () => {
  const res = mockRes();
  resourceMetadata(mockReq(), res);
  assert(res.body.resource === `${ORIGIN}/api/mcp`);
  assert(res.body.authorization_servers.includes(ORIGIN));
});

let clientId;
await check('register accepts Claude callback', async () => {
  const res = mockRes();
  register(mockReq({ method: 'POST', body: { redirect_uris: [CALLBACK] } }), res);
  assert(res.statusCode === 201, `status ${res.statusCode}`);
  clientId = res.body.client_id;
  assert(clientId, 'no client_id');
});

await check('register rejects unknown redirect', async () => {
  const res = mockRes();
  register(mockReq({ method: 'POST', body: { redirect_uris: ['https://evil.example/cb'] } }), res);
  assert(res.statusCode === 400, `status ${res.statusCode}`);
});

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

await check('authorize serves login page for valid request', async () => {
  const res = mockRes();
  authorize(
    mockReq({
      url: `/api/oauth/authorize?response_type=code`,
      query: {
        response_type: 'code', client_id: clientId, redirect_uri: CALLBACK,
        state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256',
      },
    }),
    res
  );
  assert(res.statusCode === 200, `status ${res.statusCode}`);
  assert(String(res.body).includes('Connect Master Dashboard'), 'no login page');
  assert(String(res.body).includes(challenge), 'challenge not embedded');
});

await check('authorize rejects unregistered redirect_uri', async () => {
  const res = mockRes();
  authorize(
    mockReq({
      query: {
        response_type: 'code', client_id: clientId,
        redirect_uri: 'https://evil.example/cb',
        code_challenge: challenge, code_challenge_method: 'S256',
      },
    }),
    res
  );
  assert(res.statusCode === 400, `status ${res.statusCode}`);
});

await check('token exchanges a valid code (PKCE ok)', async () => {
  const code = seal({ a: 'sb-access', r: 'sb-refresh', c: challenge, u: CALLBACK }, 60);
  const res = mockRes();
  await token(
    mockReq({
      method: 'POST',
      body: {
        grant_type: 'authorization_code', code,
        code_verifier: verifier, redirect_uri: CALLBACK,
      },
    }),
    res
  );
  assert(res.statusCode === 200, `status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert(res.body.access_token === 'sb-access');
  assert(res.body.refresh_token, 'no refresh token');
});

await check('token rejects wrong PKCE verifier', async () => {
  const code = seal({ a: 'sb-access', r: 'sb-refresh', c: challenge, u: CALLBACK }, 60);
  const res = mockRes();
  await token(
    mockReq({
      method: 'POST',
      body: { grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier-aaaa' },
    }),
    res
  );
  assert(res.statusCode === 400, `status ${res.statusCode}`);
});

await check('token rejects expired code', async () => {
  const code = seal({ a: 'x', r: 'y', c: challenge, u: CALLBACK }, -1);
  const res = mockRes();
  await token(
    mockReq({ method: 'POST', body: { grant_type: 'authorization_code', code, code_verifier: verifier } }),
    res
  );
  assert(res.statusCode === 400, `status ${res.statusCode}`);
});

await check('mcp endpoint 401s without a token', async () => {
  const res = mockRes();
  await mcp(mockReq({ method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }), res);
  assert(res.statusCode === 401, `status ${res.statusCode}`);
  assert(
    String(res.headers['www-authenticate']).includes('oauth-protected-resource'),
    'missing WWW-Authenticate resource_metadata'
  );
});

await check('mcp endpoint 405s non-POST', async () => {
  const res = mockRes();
  await mcp(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 405, `status ${res.statusCode}`);
});

console.log(`\n${passed} connector checks passed${process.exitCode ? ' (with failures)' : ''}.`);
process.exit(process.exitCode || 0);
