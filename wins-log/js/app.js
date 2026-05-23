// ── Wins Log – App ──

// ── Theme ──
async function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyTheme();
  if (_currentUser) {
    await sb.from('user_preferences').upsert(
      { user_id: _currentUser.id, theme: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }
}

// ── Auth ──
async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// ── Boot ──
async function initAuth() {
  renderLoading();

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }

  _currentUser = session.user;
  initImpersonationBanner();

  const [prefsRes, profileRes] = await Promise.all([
    sb.from('user_preferences').select('theme').eq('user_id', session.user.id).maybeSingle(),
    sb.from('profiles').select('anthropic_api_key').eq('user_id', session.user.id).maybeSingle(),
  ]);

  const theme = prefsRes.data?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  _wlKey = profileRes.data?.anthropic_api_key?.trim() || null;

  initModuleHeader({ name: 'Wins', subtitle: 'Log' });

  await Promise.all([loadWins(), loadCandidates()]);
  render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
