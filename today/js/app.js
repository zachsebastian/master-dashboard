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
  await initImpersonationBanner();

  const [prefsRes, modulesRes] = await Promise.all([
    sb.from('user_preferences').select('theme').eq('user_id', session.user.id).maybeSingle(),
    sb.from('user_modules').select('module').eq('user_id', session.user.id),
  ]);
  const theme = prefsRes.data?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const userModules = new Set((modulesRes.data || []).map(r => r.module));

  initModuleHeader({
    name: 'Today',
    subtitle: 'Daily Priorities',
    leftActions: userModules.has('projects')
      ? `<button class="btn" onclick="window.location.href='/projects/'">Projects</button>`
      : '',
  });

  await loadTodayState();

  if (_resetNeeded) {
    // Render immediately — modal will be shown on top
    render();
  } else {
    await autoPullFromProjects();
    render();
  }

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
