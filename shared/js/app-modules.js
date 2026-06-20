// ── Canonical module registry ──
// Single source of truth for module id → display name + href, for anywhere
// outside the dashboard that needs to reference modules (e.g. the scratchpad
// "point this note at a module" picker).
//
// WHEN YOU ADD A NEW MODULE: add it here too. Pickers filter this list by the
// modules a user actually has enabled (user_modules), so once it's listed here
// and granted to the user, it shows up automatically.
const APP_MODULES = [
  { id: 'projects',        name: 'Project Tracker',   href: '/projects/' },
  { id: 'metrics',         name: 'Metrics Dashboard', href: '/metrics/' },
  { id: 'rock-management', name: 'Rock Management',    href: '/rock-management/' },
  { id: 'feedback',        name: 'Feedback Log',       href: '/feedback/' },
  { id: 'product-ideas',   name: 'Product Ideas',      href: '/product-ideas/' },
  { id: 'today',           name: 'Today List',         href: '/today/' },
  { id: 'digest',          name: 'Weekly Digest',      href: '/digest/' },
  { id: 'wins-log',        name: 'Wins Log',           href: '/wins-log/' },
  { id: 'links',           name: 'Links Home',         href: '/links/' },
  { id: 'data-inventory',  name: 'Data Inventory',     href: '/data-inventory/' },
  { id: 'case-writer',     name: 'Case Writer',        href: '/case-writer/' },
  { id: 'scratchpad',      name: 'Scratchpad',         href: '/scratchpad/' },
];

function appModuleById(id) {
  return APP_MODULES.find(m => m.id === id) || null;
}
