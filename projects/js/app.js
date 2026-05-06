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
  updateThemeUI();
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

function updateThemeUI() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('theme-label').textContent = isDark ? 'Dark' : 'Light';
}

// ── Import / Export ──
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'project_dashboard.json';
  a.click();
}
function importClick() { document.getElementById('import-file').click(); }
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      state = JSON.parse(ev.target.result);
      saveState(); render();
    } catch (err) { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}
function clearAll() {
  if (!confirm('Clear all data and reset to sample projects?')) return;
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState(); render();
}

// ── Dropdown ──
function toggleMenu() {
  const m = document.getElementById('dropdown-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeMenu() { document.getElementById('dropdown-menu').style.display = 'none'; }
document.addEventListener('click', e => {
  const wrap = document.getElementById('menu-wrap');
  if (wrap && !wrap.contains(e.target)) closeMenu();
});

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

  const { data: prefs } = await sb.from('user_preferences')
    .select('theme').eq('user_id', session.user.id).maybeSingle();
  const theme = prefs?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeUI();

  await loadStateFromSupabase();
  document.getElementById('app-wrap').style.display = 'grid';
  render();
  setTimeout(initSidebarResize, 0);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

boot();
