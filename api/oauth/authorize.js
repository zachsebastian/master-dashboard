// OAuth authorization endpoint — serves the sign-in page.
// The user signs in with their dashboard account (password or magic link);
// the page then POSTs the Supabase session to /api/oauth/complete, which
// mints the authorization code and redirects back to Claude.
import {
  decodeClientId,
  isAllowedRedirect,
  requestOrigin,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../_lib/config.js';

const B64URL = /^[A-Za-z0-9_-]{20,}$/;

export default function handler(req, res) {
  const q = req.query || {};
  const registered = decodeClientId(q.client_id);

  if (q.response_type !== 'code') {
    return res.status(400).send('unsupported response_type — expected "code"');
  }
  if (!registered || !registered.includes(q.redirect_uri) || !isAllowedRedirect(q.redirect_uri)) {
    return res.status(400).send('redirect_uri is not registered for this client');
  }
  if (!B64URL.test(q.code_challenge || '') || q.code_challenge_method !== 'S256') {
    return res.status(400).send('PKCE (S256 code_challenge) is required');
  }

  const params = {
    client_id: q.client_id,
    redirect_uri: q.redirect_uri,
    state: q.state || '',
    code_challenge: q.code_challenge,
    authorize_url: `${requestOrigin(req)}${req.url.split('#')[0]}`,
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(page(params));
}

function page(params) {
  const cfg = JSON.stringify({ ...params, supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_ANON_KEY })
    .replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Master Dashboard</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #f4f5f7; color: #1a1d21;
  }
  @media (prefers-color-scheme: dark) { body { background: #16181d; color: #e8eaed; } }
  .card {
    width: min(400px, 92vw); padding: 2rem; border-radius: 14px;
    background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.08);
  }
  @media (prefers-color-scheme: dark) { .card { background: #1f2229; box-shadow: 0 8px 30px rgba(0,0,0,.4); } }
  h1 { font-size: 1.15rem; margin-bottom: .35rem; }
  p.sub { font-size: .85rem; opacity: .7; margin-bottom: 1.4rem; }
  label { display: block; font-size: .8rem; font-weight: 600; margin: .9rem 0 .3rem; }
  input {
    width: 100%; padding: .6rem .7rem; border-radius: 8px; font-size: .95rem;
    border: 1px solid rgba(128,128,128,.35); background: transparent; color: inherit;
  }
  button {
    width: 100%; margin-top: 1.1rem; padding: .65rem; border: 0; border-radius: 8px;
    font-size: .95rem; font-weight: 600; cursor: pointer; background: #4a9fd4; color: #fff;
  }
  button.secondary { background: transparent; color: #4a9fd4; margin-top: .5rem; }
  button:disabled { opacity: .55; cursor: default; }
  .msg { margin-top: .9rem; font-size: .85rem; min-height: 1.2em; }
  .msg.err { color: #e05c4b; }
  .msg.ok { color: #4caf73; }
</style>
</head>
<body>
<div class="card">
  <h1>Connect Master Dashboard</h1>
  <p class="sub">Sign in with your dashboard account to let Claude access your data.</p>
  <form id="form">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required>
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password">
    <button id="signin" type="submit">Sign in</button>
    <button id="magic" type="button" class="secondary">Email me a magic link instead</button>
  </form>
  <div id="msg" class="msg"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script>
const CFG = ${cfg};
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const msg = document.getElementById('msg');
const show = (text, cls) => { msg.textContent = text; msg.className = 'msg ' + (cls || ''); };

async function complete(session) {
  show('Signed in — connecting to Claude…', 'ok');
  const res = await fetch('/api/oauth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      client_id: CFG.client_id,
      redirect_uri: CFG.redirect_uri,
      state: CFG.state,
      code_challenge: CFG.code_challenge,
    }),
  });
  const data = await res.json();
  if (!res.ok) return show(data.error_description || 'Could not complete sign-in.', 'err');
  window.location.href = data.redirect_to;
}

// Magic-link return: Supabase puts the session in the URL hash.
(function () {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const access = h.get('access_token');
  const refresh = h.get('refresh_token');
  if (access && refresh) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    complete({ access_token: access, refresh_token: refresh });
  }
})();

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!password) return show('Enter your password, or use the magic link button.', 'err');
  e.submitter && (e.submitter.disabled = true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  e.submitter && (e.submitter.disabled = false);
  if (error) return show(error.message, 'err');
  complete(data.session);
});

document.getElementById('magic').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return show('Enter your email first.', 'err');
  const btn = document.getElementById('magic');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: CFG.authorize_url, shouldCreateUser: false },
  });
  btn.disabled = false;
  if (error) return show(error.message, 'err');
  show('Magic link sent — open it on this device to finish connecting.', 'ok');
});
</script>
</body>
</html>`;
}
