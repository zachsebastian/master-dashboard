// ── Theme ──
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  localStorage.setItem('theme', state.darkMode ? 'dark' : 'light');
}

async function toggleTheme() {
  state.darkMode = !state.darkMode;
  applyTheme();
  if (_currentUser) {
    await sb.from('user_preferences').upsert(
      { user_id: _currentUser.id, theme: state.darkMode ? 'dark' : 'light', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }
  save();
  render();
}

// ── Auth ──
async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// ── Dataset menu ──
function toggleDatasetMenu() {
  const menu = document.getElementById('dataset-menu');
  if (!menu) return;
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!menu.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', _close);
        }
      });
    }, 0);
  }
}

// ── Export / Import ──
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `metrics-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.metrics) throw new Error('Invalid file');
        state = { ...initialState, ...data };
        applyTheme();
        save();
        render();
      } catch {
        alert('Could not read file. Make sure it is a valid Metrics Dashboard export.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function copyDataModal() {
  const json = JSON.stringify(state, null, 2);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);z-index:999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);border:1px solid var(--border-md);width:min(700px,94vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;animation:slide-up 0.15s ease;">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="font-size:16px;font-weight:700;letter-spacing:-0.3px;">Export Data</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;line-height:1.4;">Click <strong style="color:var(--text-2)">Copy all</strong>, paste into a text editor, and save as <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-size:11px;">.json</code></div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;margin-left:16px;">
          <button id="cdm-copy-btn" onclick="
            const ta = document.getElementById('cdm-textarea');
            ta.select();
            document.execCommand('copy');
            const btn = document.getElementById('cdm-copy-btn');
            btn.textContent = '✓ Copied!';
            btn.style.background = 'var(--green)';
            btn.style.borderColor = 'var(--green)';
            setTimeout(() => { btn.textContent = 'Copy all'; btn.style.background = ''; btn.style.borderColor = ''; }, 2000);
          " style="font-size:13px;font-weight:600;padding:7px 16px;border-radius:var(--r-sm);border:1px solid var(--border-md);background:var(--text);color:var(--bg);cursor:pointer;transition:background 0.15s;">Copy all</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="font-size:13px;font-weight:500;padding:7px 14px;border-radius:var(--r-sm);border:1px solid var(--border-md);background:var(--surface-2);color:var(--text);cursor:pointer;">Close</button>
        </div>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;">
        <div style="background:var(--surface-2);border-bottom:1px solid var(--border);padding:8px 16px;display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="display:flex;gap:5px;">
            <div style="width:10px;height:10px;border-radius:50%;background:#ff5f57;"></div>
            <div style="width:10px;height:10px;border-radius:50%;background:#febc2e;"></div>
            <div style="width:10px;height:10px;border-radius:50%;background:#28c840;"></div>
          </div>
          <span style="font-size:11px;color:var(--text-3);font-family:monospace;">metrics-backup.json</span>
        </div>
        <div style="position:relative;flex:1;overflow:hidden;">
          <textarea id="cdm-textarea" style="position:absolute;inset:0;width:100%;height:100%;margin:0;padding:16px 16px 16px 52px;font-family:'SF Mono','Fira Code','Cascadia Code',monospace;font-size:12px;line-height:1.6;background:var(--surface);color:var(--text);border:none;resize:none;outline:none;overflow-y:auto;box-sizing:border-box;" readonly>${json}</textarea>
          <div style="position:absolute;top:0;left:0;bottom:0;width:36px;background:var(--surface-2);border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:flex-end;padding:16px 6px 16px 0;box-sizing:border-box;overflow:hidden;pointer-events:none;">
            ${Array.from({length: Math.min(json.split('\n').length, 200)}, (_, i) =>
              `<div style="font-size:11px;line-height:1.6;color:var(--text-3);font-family:monospace;">${i+1}</div>`
            ).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => { const ta = document.getElementById('cdm-textarea'); if (ta) ta.select(); }, 50);
}

// ── Sidebar resize ──
let _sidebarWidth = 252;
function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  sidebar.style.width = _sidebarWidth + 'px';
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newW = Math.min(480, Math.max(160, startW + (e.clientX - startX)));
      sidebar.style.width = newW + 'px';
      _sidebarWidth = newW;
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
async function initAuth() {
  renderLoading('Connecting…');
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }

  _currentUser = session.user;
  initImpersonationBanner();

  const { data: prefs } = await sb.from('user_preferences').select('theme').eq('user_id', session.user.id).maybeSingle();
  const theme = prefs?.theme || localStorage.getItem('theme') || 'light';
  localStorage.setItem('theme', theme);
  state.darkMode = theme === 'dark';
  applyTheme();

  await loadFromSupabase();

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

initAuth();
