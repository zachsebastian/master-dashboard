// ── Auth ──
async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// ── Theme ──
async function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyTheme();
  if (_currentUser) {
    await sb.from('user_preferences').upsert(
      { user_id: _currentUser.id, theme: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }
  if (state.view === 'detail') {
    const p = state.projects.find(x => x.id === state.activeProject);
    if (p && p.entries.length > 1) setTimeout(() => drawChart(p), 50);
  }
}

function clearAll() {
  if (!confirm('Clear all data and reset to sample projects?')) return;
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState(); render();
}

// ── Sidebar resize ──
function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX; startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newW = Math.min(480, Math.max(160, startW + (e.clientX - startX)));
      sidebar.style.width = newW + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Boot ──
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/'; return; }

  _currentUser = session.user;
  initImpersonationBanner();

  const [prefsRes, modulesRes] = await Promise.all([
    sb.from('user_preferences').select('theme').eq('user_id', session.user.id).maybeSingle(),
    sb.from('user_modules').select('module').eq('user_id', session.user.id),
  ]);
  const theme = prefsRes.data?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const userModules = new Set((modulesRes.data || []).map(r => r.module));

  initModuleHeader({
    name: 'Project',
    subtitle: 'Tracker',
    hasSidebar: true,
    tabs: true,
    leftActions: userModules.has('today')
      ? `<button class="btn" onclick="window.location.href='/today/'">Today</button>`
      : '',
  });
  applyTheme();

  await loadStateFromSupabase();
  _rocks = await loadRocks(_currentUser.id);

  // Deep-link: /projects/?project=<id> scrolls straight to that project
  const _deepProjectId = new URLSearchParams(window.location.search).get('project');
  if (_deepProjectId && state.projects.find(p => p.id === _deepProjectId)) {
    openDetail(_deepProjectId);
  }

  document.getElementById('app-wrap').style.display = 'flex';
  render();
  setTimeout(initSidebarResize, 0);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

boot();
