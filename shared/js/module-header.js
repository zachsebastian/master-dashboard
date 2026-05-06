// ── Shared module topbar ──
// Called once after auth; renders the topbar and exposes update helpers.

function applyTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const track = document.getElementById('theme-track');
  const label = document.getElementById('theme-label');
  if (track) track.classList.toggle('on', isDark);
  if (label) label.textContent = isDark ? 'Dark' : 'Light';
}

function initModuleHeader(config) {
  // config: { name, subtitle, hasSidebar, tabs, leftActions }
  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="topbar-left">
        <div class="brand-wrap">
          <div class="brand-name">${config.name}${config.subtitle ? ` <span>${config.subtitle}</span>` : ''}</div>
          ${config.hasSidebar ? `<button class="sidebar-toggle-btn" id="sidebar-toggle-btn" onclick="toggleSidebar()">‹ Hide sidebar</button>` : ''}
        </div>
        ${config.leftActions || ''}
        <div id="save-wrap" class="save-wrap"><div id="save-dot" class="save-dot"></div></div>
      </div>
      ${config.tabs ? `
      <div class="view-tabs">
        <button class="view-tab active" id="tab-summary" onclick="setView('summary')">Summary</button>
        <button class="view-tab" id="tab-detail" onclick="setView('detail')">Detail</button>
      </div>` : ''}
      <div class="topbar-right">
        <div class="theme-toggle" onclick="toggleTheme()">
          <div class="theme-track" id="theme-track"><div class="theme-thumb"></div></div>
          <span id="theme-label">Light</span>
        </div>
        <a class="btn" href="/" style="text-decoration:none">← Home</a>
        <button class="btn" onclick="signOut()">Sign Out</button>
      </div>
    </div>
  `;
  applyTheme();
}

function setActiveTab(tabId) {
  ['summary', 'detail'].forEach(id => {
    const btn = document.getElementById('tab-' + id);
    if (btn) btn.classList.toggle('active', id === tabId);
  });
}

function updateSidebarBtn(visible) {
  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) btn.textContent = visible ? '‹ Hide sidebar' : '› Show sidebar';
}
