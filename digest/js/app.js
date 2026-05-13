// ── Theme ──
async function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
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

  const { data: prefs } = await sb.from('user_preferences')
    .select('theme').eq('user_id', session.user.id).maybeSingle();
  const theme = prefs?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const { data: modRows } = await sb.from('user_modules')
    .select('module').eq('user_id', session.user.id);
  const userModules = new Set((modRows || []).map(r => r.module));

  initModuleHeader({
    name: 'Weekly Digest',
    subtitle: 'Review',
    leftActions: [
      userModules.has('links')      ? `<a class="btn" href="/links/">Links</a>`          : '',
      userModules.has('projects')   ? `<a class="btn" href="/projects/">Projects</a>`   : '',
      userModules.has('metrics')    ? `<a class="btn" href="/metrics/">Metrics</a>`     : '',
      userModules.has('today')      ? `<a class="btn" href="/today/">Today</a>`          : '',
      userModules.has('scratchpad') ? `<a class="btn" href="/scratchpad/">Scratch</a>`  : '',
    ].join(''),
  });

  await Promise.all([loadDigestData(), loadReflection()]);
  render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
