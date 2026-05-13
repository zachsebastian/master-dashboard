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

// ── Global keyboard shortcut: Cmd+/ or Ctrl+/ focuses textarea ──
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault();
    document.getElementById('scratch-textarea')?.focus();
  }
});

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
    name: 'Scratch',
    subtitle: 'Pad',
    leftActions: [
      userModules.has('links')    ? `<a class="btn" href="/links/">Links</a>`       : '',
      userModules.has('projects') ? `<a class="btn" href="/projects/">Projects</a>` : '',
      userModules.has('metrics')  ? `<a class="btn" href="/metrics/">Metrics</a>`   : '',
      userModules.has('today')    ? `<a class="btn" href="/today/">Today</a>`        : '',
      userModules.has('digest')   ? `<a class="btn" href="/digest/">Digest</a>`      : '',
    ].join('')
  });

  await loadNotes();
  render();

  // Auto-focus textarea if ?capture=1
  if (new URLSearchParams(window.location.search).get('capture') === '1') {
    setTimeout(() => document.getElementById('scratch-textarea')?.focus(), 50);
  }

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
