const ALL_MODULES = [
  {
    id: 'links',
    name: 'Links Home',
    type: 'launchpad',
    iconBg: 'var(--purple-bg)',
    iconColor: 'var(--purple)',
    accentVar: '--purple',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    desc: 'Your personal browser home page. Organize bookmarks into cards, tabs, and icon grids.',
    href: '/links/',

    async fetchStats(sb, userId) {
      const [cRes, gRes, iRes, cntRes, topRes] = await Promise.all([
        sb.from('link_cards').select('id').eq('user_id', userId),
        sb.from('link_groups').select('id, name').eq('user_id', userId),
        sb.from('link_items').select('id, name, group_id').eq('user_id', userId).order('id', { ascending: false }).limit(5),
        sb.from('link_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        sb.from('link_items').select('id, name, url, icon_url, click_count').eq('user_id', userId).gt('click_count', 0).order('click_count', { ascending: false }).limit(3),
      ]);
      const cards  = cRes.data  || [];
      const groups = gRes.data  || [];
      const items  = iRes.data  || [];
      const total  = cntRes.count || 0;
      const groupName = (gid) => (groups.find(g => g.id === gid) || {}).name || 'Links';
      const quickAccess = (topRes.data || []).sort((a, b) => (b.click_count || 0) - (a.click_count || 0));
      return {
        primary:      { value: total, label: 'Links' },
        secondary:    { value: cards.length, label: 'Cards' },
        spark:        null,
        quickAccess,
        latestEntries: items.map(i => ({ when: null, target: i.name, note: `in ${groupName(i.group_id)}` })),
        summaryFragment: cards.length === 0 ? 'No links saved yet' : `${cards.length} link card${cards.length === 1 ? '' : 's'}`,
      };
    },
  },
  {
    id: 'projects',
    name: 'Project Tracker',
    type: 'dashboard',
    iconBg: 'var(--blue-bg)',
    iconColor: 'var(--blue)',
    accentVar: '--blue',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
    desc: 'Track projects, log updates, manage tasks, and monitor progress across all your initiatives.',
    href: '/projects/',
    table: 'dashboards',

    computeStats(data) {
      const projects = (data && data.projects) || [];
      const active = projects.filter(p => p.status !== 'complete' && p.status !== 'archived').length;
      const allEntries = projects.flatMap(p => (p.entries || []).map(e => ({ ...e, projectName: p.name })));
      const recent = allEntries.filter(e => {
        if (!e.date) return false;
        return (Date.now() - new Date(e.date).getTime()) / 86400000 <= 7;
      }).length;
      const buckets = new Array(12).fill(0);
      allEntries.forEach(e => {
        if (!e.date) return;
        const w = Math.floor((Date.now() - new Date(e.date).getTime()) / 604800000);
        if (w >= 0 && w < 12) buckets[11 - w]++;
      });
      const sorted = allEntries.filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));
      return {
        primary:   { value: active, label: 'Active' },
        secondary: { value: recent, label: 'Updates · 7d' },
        spark: buckets.some(b => b > 0) ? buckets : null,
        latestEntries: sorted.slice(0, 6).map(e => ({
          when: e.date, target: e.projectName,
          note: e.note || (e.status ? `marked ${e.status}` : 'logged update'),
        })),
        summaryFragment: projects.length === 0 ? 'No projects yet' : `${active} active project${active === 1 ? '' : 's'}`,
      };
    },
  },
  {
    id: 'metrics',
    name: 'Metrics Dashboard',
    type: 'dashboard',
    iconBg: 'var(--green-bg)',
    iconColor: 'var(--green)',
    accentVar: '--green',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/><line x1="2" y1="21" x2="22" y2="21"/></svg>`,
    desc: 'Monitor your key business metrics, track rocks, and visualize trends over time.',
    href: '/metrics/',
    table: 'metrics',

    computeStats(data) {
      const metrics = (data && data.metrics) || [];
      const rocks   = (data && data.rocks)   || [];
      const visible = metrics.filter(m => m.visible !== false).length;
      const allEntries = metrics.flatMap(m => (m.entries || []).map(e => ({ ...e, metricName: m.name })));
      const now = Date.now();
      const recent = allEntries.filter(e => {
        const d = e.periodEnd || e.periodStart;
        return d && (now - new Date(d).getTime()) / 86400000 <= 30;
      }).length;
      const buckets = new Array(12).fill(0);
      allEntries.forEach(e => {
        const d = e.periodEnd || e.periodStart;
        if (!d) return;
        const w = Math.floor((now - new Date(d).getTime()) / 604800000);
        if (w >= 0 && w < 12) buckets[11 - w]++;
      });
      const sorted = allEntries
        .filter(e => e.periodEnd || e.periodStart)
        .sort((a, b) => new Date(b.periodEnd || b.periodStart) - new Date(a.periodEnd || a.periodStart));
      return {
        primary:   { value: visible, label: 'Metrics' },
        secondary: { value: rocks.length, label: 'Rocks' },
        spark: buckets.some(b => b > 0) ? buckets : null,
        latestEntries: sorted.slice(0, 6).map(e => ({
          when: e.periodEnd || e.periodStart, target: e.metricName,
          note: e.period ? `logged for ${e.period}` : 'logged metric',
        })),
        summaryFragment: visible === 0 ? 'No metrics yet'
          : `${visible} metric${visible === 1 ? '' : 's'}${rocks.length ? `, ${rocks.length} rock${rocks.length === 1 ? '' : 's'}` : ''}`,
      };
    },
  },
];

// ── Drag state ──
let _modDragId       = null;
let _modDragEl       = null;
let _modDropDone     = false;
let _modSwapCooldown = false;

// ── Rendering ──
function renderModules(modRows, statsByModule) {
  const orderMap = {};
  modRows.forEach(r => { orderMap[r.module] = r.sort_order ?? 999; });
  const allowed = new Set(modRows.map(r => r.module));

  const grid         = document.getElementById('module-grid');
  const launchpadList = document.getElementById('launchpad-list');
  const empty        = document.getElementById('empty-state');
  const enabled      = ALL_MODULES
    .filter(m => allowed.has(m.id))
    .sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));

  if (enabled.length === 0) {
    if (grid) grid.innerHTML = '';
    if (launchpadList) launchpadList.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  const launchpads = enabled.filter(m => m.type === 'launchpad');
  const dashboards = enabled.filter(m => m.type !== 'launchpad');

  // Launchpad rows
  if (launchpadList) {
    launchpadList.innerHTML = launchpads.map(m => {
      const stats = (statsByModule && statsByModule[m.id]) || {};
      const qa = stats.quickAccess || [];
      const quickHtml = qa.length ? `
        <div class="launchpad-quick-access">
          ${qa.map(item => {
            const src = item.icon_url || _faviconSrc(item.url);
            const imgHtml = src
              ? `<img src="${escHtml(src)}" alt="" onerror="this.style.display='none'">`
              : `<span class="qa-icon-letter">${escHtml((item.name || '?')[0].toUpperCase())}</span>`;
            return `<div class="qa-icon" role="link" tabindex="0" onclick="event.stopPropagation();event.preventDefault();window.open('${escHtml(item.url)}','_blank','noopener,noreferrer')" onkeydown="if(event.key==='Enter'){event.stopPropagation();window.open('${escHtml(item.url)}','_blank','noopener,noreferrer')}">
              ${imgHtml}
              <span class="qa-icon-label">${escHtml(item.name)}</span>
            </div>`;
          }).join('')}
        </div>` : '';
      const statsHtml = (stats.primary || stats.secondary) ? `
        <div class="launchpad-row-stats">
          ${stats.primary   ? `<div><div class="launchpad-row-stat-value">${escHtml(String(stats.primary.value))}</div><div class="launchpad-row-stat-label">${escHtml(stats.primary.label)}</div></div>` : ''}
          ${stats.secondary ? `<div><div class="launchpad-row-stat-value">${escHtml(String(stats.secondary.value))}</div><div class="launchpad-row-stat-label">${escHtml(stats.secondary.label)}</div></div>` : ''}
        </div>` : '';
      return `
        <a class="launchpad-row" href="${m.href}" data-module-id="${m.id}" data-module-type="launchpad" data-accent="${m.id}"
           draggable="true" ondragstart="onModuleDragStart(event)" ondragover="onModuleDragOver(event)"
           ondrop="onModuleDrop(event)" ondragend="onModuleDragEnd(event)">
          <div class="launchpad-row-icon">${m.icon}</div>
          <div class="launchpad-row-body">
            <div class="launchpad-row-name">${m.name}</div>
            <div class="launchpad-row-desc">${m.desc}</div>
          </div>
          ${quickHtml}
          ${statsHtml}
          <div class="launchpad-row-arrow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </a>`;
    }).join('');
  }

  // Dashboard cards
  if (grid) {
    grid.innerHTML = dashboards.map((m, i) => {
      const stats = (statsByModule && statsByModule[m.id]) || {};
      const num   = String(i + 1).padStart(2, '0');
      const statsHtml = `
        <div class="module-stats">
          ${stats.primary   ? `<div><div class="module-stat-value">${escHtml(String(stats.primary.value))}</div><div class="module-stat-label">${escHtml(stats.primary.label)}</div></div>` : ''}
          ${stats.secondary ? `<div><div class="module-stat-value">${escHtml(String(stats.secondary.value))}</div><div class="module-stat-label">${escHtml(stats.secondary.label)}</div></div>` : ''}
        </div>`;
      const sparkHtml = stats.spark ? renderSparkline(stats.spark, m.accentVar) : '';
      return `
        <a class="module-card" href="${m.href}" data-module-id="${m.id}" data-module-type="dashboard" data-accent="${m.id}"
           draggable="true" ondragstart="onModuleDragStart(event)" ondragover="onModuleDragOver(event)"
           ondrop="onModuleDrop(event)" ondragend="onModuleDragEnd(event)">
          <div class="module-card-head">
            <div class="module-card-icon">${m.icon}</div>
            <div class="module-card-num">${num}</div>
          </div>
          <div class="module-name">${m.name}</div>
          <div class="module-desc">${m.desc}</div>
          <div class="module-foot">
            ${statsHtml}
            <div class="module-spark">${sparkHtml}</div>
          </div>
        </a>`;
    }).join('');
    if (!grid.innerHTML) grid.innerHTML = '';
  }
}

// ── Drag handlers ──
function onModuleDragStart(e) {
  _modDragId   = e.currentTarget.dataset.moduleId;
  _modDragEl   = e.currentTarget;
  _modDropDone = false;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onModuleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (_modSwapCooldown) return;
  const targetId = e.currentTarget.dataset.moduleId;
  if (!targetId || targetId === _modDragId || !_modDragEl) return;
  // Only allow reorder within the same container (launchpad stays launchpad, dashboard stays dashboard)
  if (_modDragEl.parentElement !== e.currentTarget.parentElement) return;
  const container = _modDragEl.parentElement;
  const siblings  = [...container.children];
  const dragIdx   = siblings.indexOf(_modDragEl);
  const targetIdx = siblings.indexOf(e.currentTarget);
  if (dragIdx === -1 || targetIdx === -1) return;

  const insertBefore = dragIdx < targetIdx ? e.currentTarget.nextSibling : e.currentTarget;
  if (_modDragEl.nextSibling === insertBefore) return; // already in position, skip

  // FLIP: record positions before move
  const first = new Map();
  siblings.forEach(el => { if (el !== _modDragEl) first.set(el, el.getBoundingClientRect()); });

  container.insertBefore(_modDragEl, insertBefore);

  // Cooldown prevents feedback loop while displaced cards animate back
  _modSwapCooldown = true;
  setTimeout(() => { _modSwapCooldown = false; }, 200);

  // Animate displaced elements from their old positions to their new ones
  first.forEach((rect, el) => {
    const newRect = el.getBoundingClientRect();
    const dx = rect.left - newRect.left;
    const dy = rect.top  - newRect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.style.transition = 'none';
    el.style.transform  = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform 0.2s ease';
      el.style.transform  = '';
    }));
  });
}

function onModuleDrop(e) {
  e.preventDefault();
  if (_modDropDone) return;
  _modDropDone = true;
  _commitModuleOrder();
}

function onModuleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  if (!_modDropDone) _commitModuleOrder();
  _modDragId       = null;
  _modDragEl       = null;
  _modDropDone     = false;
  _modSwapCooldown = false;
}

function _updateCardNumbers() {
  [...document.querySelectorAll('#module-grid .module-card')].forEach((card, i) => {
    const num = card.querySelector('.module-card-num');
    if (num) num.textContent = String(i + 1).padStart(2, '0');
  });
}

async function _commitModuleOrder() {
  _updateCardNumbers();
  if (!currentUser) return;
  const cards = [...document.querySelectorAll('#launchpad-list [data-module-id], #module-grid [data-module-id]')];
  await Promise.all(cards.map((c, i) =>
    sb.from('user_modules')
      .update({ sort_order: i })
      .eq('user_id', currentUser.id)
      .eq('module', c.dataset.moduleId)
  ));
}

// ── Sparkline ──
function renderSparkline(data, accentVar = '--text-2') {
  if (!data || !data.length) return '';
  const w = 110, h = 38, pad = 2;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const norm  = v => h - pad - ((v - min) / range) * (h - pad * 2);
  const pts   = data.map((v, i) => `${pad + i * stepX},${norm(v)}`).join(' ');
  const area  = `${pad},${h - pad} ${pts} ${pad + (data.length - 1) * stepX},${h - pad}`;
  const gid   = `g${accentVar.replace(/[^a-z0-9]/gi, '')}`;
  const color = `var(${accentVar})`;
  return `<svg width="${w}" height="${h}" style="display:block">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ── Activity strip ──
function renderActivityTicker(activity) {
  const strip = document.getElementById('activity-strip');
  if (!strip) return;
  if (!activity || activity.length === 0) { strip.style.display = 'none'; return; }
  strip.style.display = '';
  const itemHtml = activity.slice(0, 5).map(a => `
    <div class="activity-item">
      <div class="activity-dot" data-mod="${a.mod}"></div>
      <div class="activity-text"><strong>${escHtml(a.target || '')}</strong> · ${escHtml(a.note || '')} <span class="activity-when">· ${escHtml(a.when || '')}</span></div>
    </div>`).join('');
  document.getElementById('activity-items').innerHTML = itemHtml + itemHtml;
}

// ── Hero summary ──
function renderHeroSummary(firstName, summaryFragments) {
  const sub = document.getElementById('page-subtitle');
  if (!sub) return;
  if (!summaryFragments || summaryFragments.length === 0) {
    sub.textContent = 'Pick up where you left off.';
    return;
  }
  const text = summaryFragments.join(', ') + '.';
  sub.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

// ── Helpers ──
function _faviconSrc(url) {
  try {
    const domain = new URL(url).hostname;
    return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '';
  } catch { return ''; }
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function relativeTime(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)   return `${diffDay}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
