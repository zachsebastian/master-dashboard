// Supabase client + auth for the MCP server.
// Signs in as the dashboard user with email/password so RLS scopes all
// queries exactly like the web app.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.DASH_SUPABASE_URL || 'https://gfxfedfxmipbgcvtpesx.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.DASH_SUPABASE_ANON_KEY ||
  'sb_publishable_oauR1DwB9y9bldVhSDpFHQ_rRDNO0FX';

let _sb = null;
let _user = null;

async function signIn(sb) {
  const email = process.env.DASH_EMAIL;
  const password = process.env.DASH_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing credentials: set DASH_EMAIL and DASH_PASSWORD in the env block of your MCP config.'
    );
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Supabase sign-in failed: ${error.message}. Check DASH_EMAIL / DASH_PASSWORD in your MCP config.`
    );
  }
  return data.user;
}

// Lazy: first tool call signs in; later calls reuse the session.
export async function getContext() {
  if (!_sb) {
    _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
    });
  }
  if (!_user) _user = await signIn(_sb);
  return { sb: _sb, uid: _user.id };
}

export function resetAuth() {
  _user = null;
}

export function isAuthError(error) {
  const msg = String(error?.message || error || '');
  return /JWT|token|expired|401|not authenticated/i.test(msg);
}

// Unwrap a supabase-js response, throwing on error.
export function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
