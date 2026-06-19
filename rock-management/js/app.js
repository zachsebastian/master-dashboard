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
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }

  setCurrentUser(session.user);
  await initImpersonationBanner();

  const { data: prefs } = await sb.from('user_preferences')
    .select('theme')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const theme = prefs?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  initModuleHeader({ name: 'Rock', subtitle: 'Management' });

  await loadAll();
  collapseAll();
  render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
