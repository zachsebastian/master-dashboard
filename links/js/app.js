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

// ── Weather ──
async function fetchWeather() {
  try {
    const r = await fetch('https://wttr.in/?format=j1');
    if (!r.ok) return;
    const j = await r.json();
    const c = j.current_condition[0];
    _weather = {
      tempF:     Math.round(parseFloat(c.temp_F)),
      condition: c.weatherDesc[0].value,
      location:  j.nearest_area[0].areaName[0].value,
    };
  } catch { /* silently hide weather tile on failure */ }
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

  initModuleHeader({
    name: 'Links',
    subtitle: 'Home',
    leftActions: `
      <a class="btn" href="/projects/">Projects</a>
      <a class="btn" href="/metrics/">Metrics</a>
    `
  });

  await Promise.all([loadState(), fetchWeather()]);
  render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
