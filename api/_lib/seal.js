// Stateless token sealing: AES-256-GCM with a key derived from MCP_SECRET.
// Authorization codes and refresh tokens are sealed payloads — no database.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = process.env.MCP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('MCP_SECRET env var (16+ chars) is required on the server.');
  }
  return createHash('sha256').update(secret).digest();
}

export function seal(payload, ttlSeconds) {
  const body = JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

// Returns the payload, or null if invalid/expired.
export function open(token) {
  try {
    const raw = Buffer.from(String(token), 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const body = JSON.parse(
      Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    );
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

export function sha256base64url(input) {
  return createHash('sha256').update(input).digest('base64url');
}
