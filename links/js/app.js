// ── Scratchpad quick-capture modal ──
function openScratchpadCapture() {
  if (document.getElementById('scratch-capture-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'scratch-capture-overlay';
  overlay.className = 'sc-overlay';
  overlay.innerHTML = `
    <div class="sc-modal" role="dialog" aria-modal="true" aria-label="New note">
      <div class="sc-header">
        <span class="sc-title">New Note</span>
        <button class="sc-close" onclick="closeScratchpadCapture()" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <textarea id="sc-textarea" class="sc-textarea" placeholder="What's on your mind?" rows="5"></textarea>
      <div class="sc-footer">
        <span id="sc-status" class="sc-status"></span>
        <div class="sc-actions">
          <button class="btn" onclick="closeScratchpadCapture()">Cancel</button>
          <button class="btn btn-primary" id="sc-save-btn" onclick="saveScratchpadCapture()">Save Note</button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeScratchpadCapture(); });
  document.body.appendChild(overlay);

  const ta = document.getElementById('sc-textarea');
  ta.focus();
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeScratchpadCapture(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { saveScratchpadCapture(); }
  });
}

function closeScratchpadCapture() {
  const overlay = document.getElementById('scratch-capture-overlay');
  if (overlay) overlay.remove();
}

async function saveScratchpadCapture() {
  const ta     = document.getElementById('sc-textarea');
  const btn    = document.getElementById('sc-save-btn');
  const status = document.getElementById('sc-status');
  if (!ta) return;

  const text = ta.value.trim();
  if (!text) { ta.focus(); return; }
  if (!_currentUser) return;

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await sb.from('scratch_notes').insert({
    user_id:  _currentUser.id,
    text:     text,
    pinned:   false,
    reviewed: false,
  });

  if (error) {
    status.textContent = 'Failed to save. Try again.';
    status.style.color = 'var(--red)';
    btn.disabled = false;
    btn.textContent = 'Save Note';
    return;
  }

  status.textContent = '✓ Note saved';
  status.style.color = 'var(--green)';
  setTimeout(closeScratchpadCapture, 600);
}

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

  const { data: modRows } = await sb.from('user_modules')
    .select('module').eq('user_id', session.user.id);
  const userModules = new Set((modRows || []).map(r => r.module));

  initModuleHeader({
    name: 'Links',
    subtitle: 'Home',
    leftActions: [
      userModules.has('today')    ? `<button class="btn" onclick="window.location.href='/today/'">Today</button>`       : '',
      userModules.has('projects') ? `<button class="btn" onclick="window.location.href='/projects/'">Projects</button>` : '',
      userModules.has('metrics')  ? `<button class="btn" onclick="window.location.href='/metrics/'">Metrics</button>`  : '',
    ].join('')
  });

  const { data: profile } = await sb.from('profiles')
    .select('first_name').eq('user_id', session.user.id).maybeSingle();
  if (profile?.first_name?.trim()) _profileFirstName = profile.first_name.trim();

  await Promise.all([loadState(), fetchWeather()]);
  render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
