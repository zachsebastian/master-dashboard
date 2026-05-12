const ALL_MODULES = [
  {
    id: 'links',
    name: 'Links Home',
    iconBg: 'var(--purple-bg)',
    iconColor: 'var(--purple)',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    desc: 'Your personal browser home page. Organize bookmarks into cards, tabs, and icon grids.',
    href: '/links/',
  },
  {
    id: 'projects',
    name: 'Project Tracker',
    iconBg: 'var(--blue-bg)',
    iconColor: 'var(--blue)',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/><line x1="9" y1="9" x2="15" y2="9"/></svg>`,
    desc: 'Track projects, log updates, manage tasks, and monitor progress across all your initiatives.',
    href: '/projects/',
  },
  {
    id: 'metrics',
    name: 'Metrics Dashboard',
    iconBg: 'var(--green-bg)',
    iconColor: 'var(--green)',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/><line x1="2" y1="21" x2="22" y2="21"/></svg>`,
    desc: 'Monitor your key business metrics, track rocks, and visualize trends over time.',
    href: '/metrics/',
  },
];

function renderModules(allowed) {
  const grid = document.getElementById('module-grid');
  grid.innerHTML = ALL_MODULES
    .filter(m => allowed.has(m.id))
    .map(m => `
      <a class="module-card" href="${m.href}">
        <div class="module-icon" style="background:${m.iconBg};color:${m.iconColor}">${m.icon}</div>
        <div class="module-name">${m.name}</div>
        <div class="module-desc">${m.desc}</div>
        <div class="module-arrow">Open →</div>
      </a>`).join('');

  if (!grid.innerHTML) {
    grid.innerHTML = '<p style="color:var(--text-3);font-size:13px">No modules assigned. Contact your administrator.</p>';
  }
}
