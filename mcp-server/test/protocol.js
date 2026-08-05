// Protocol test: spawns the server over stdio, performs the MCP handshake,
// and verifies all tools are registered with valid schemas. Needs no credentials.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const EXPECTED_TOOLS = 37;

const child = spawn(process.execPath, [join(root, 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), 10000);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  child.kill();
  process.exit(1);
}

const init = await request('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'protocol-test', version: '0.0.0' },
});
if (init.result?.serverInfo?.name !== 'master-dashboard') {
  fail(`unexpected serverInfo: ${JSON.stringify(init.result?.serverInfo)}`);
}
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await request('tools/list', {});
const tools = list.result?.tools || [];
if (tools.length !== EXPECTED_TOOLS) {
  fail(`expected ${EXPECTED_TOOLS} tools, got ${tools.length}: ${tools.map((t) => t.name).join(', ')}`);
}
for (const t of tools) {
  if (!t.description) fail(`tool ${t.name} has no description`);
  if (!t.inputSchema || t.inputSchema.type !== 'object') {
    fail(`tool ${t.name} has invalid inputSchema`);
  }
}

// Without credentials, a tool call must return a clean isError result, not crash.
const call = await request('tools/call', { name: 'today_list', arguments: {} });
const text = call.result?.content?.[0]?.text || '';
if (process.env.DASH_EMAIL && process.env.DASH_PASSWORD) {
  if (call.result?.isError) fail(`today_list errored with credentials set: ${text}`);
} else if (!call.result?.isError || !text.includes('DASH_EMAIL')) {
  fail(`expected missing-credentials error, got: ${JSON.stringify(call.result)}`);
}

console.log(`PASS: handshake ok, ${tools.length} tools registered, error handling ok`);
child.kill();
process.exit(0);
