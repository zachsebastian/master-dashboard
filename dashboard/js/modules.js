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
    async fetchStats(sb, userId) {
      const mode  = localStorage.getItem('digestWeekMode') || 'rolling';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let startStr, endStr, rangeLabel;

      if (mode === 'custom') {
        startStr   = localStorage.getItem('digestCustomStart');
        endStr     = localStorage.getItem('digestCustomEnd');
        if (startStr && endStr) {
          const s = new Date(startStr + 'T00:00:00');
          const e = new Date(endStr   + 'T00:00:00');
          rangeLabel = `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
        } else {
          startStr = new Date(today.getTime() - 6 * 86400000).toISOString().split('T')[0];
          endStr   = today.toISOString().split('T')[0];
          rangeLabel = '7d';
        }
      } else if (mode === 'sun') {
        const s = new Date(today); s.setDate(today.getDate() - today.getDay());
        const e = new Date(s);     e.setDate(s.getDate() + 6);
        startStr   = s.toISOString().split('T')[0];
        endStr     = e.toISOString().split('T')[0];
        rangeLabel = 'Sun–Sat';
      } else {
        startStr   = new Date(today.getTime() - 6 * 86400000).toISOString().split('T')[0];
        endStr     = today.toISOString().split('T')[0];
        rangeLabel = '7d';
      }

      const { data: blob } = await sb.from('dashboards').select('data').eq('user_id', userId).maybeSingle();
      const projects   = blob?.data?.projects || [];
      const active     = projects.filter(p => p.status !== 'complete' && p.status !== 'archived').length;
      const allEntries = projects.flatMap(p => (p.entries || []).map(e => ({ ...e, projectName: p.name })));
      const recent     = allEntries.filter(e => e.date && e.date >= startStr && e.date <= endStr).length;

      const buckets = new Array(12).fill(0);
      allEntries.forEach(e => {
        if (!e.date) return;
        const w = Math.floor((Date.now() - new Date(e.date).getTime()) / 604800000);
        if (w >= 0 && w < 12) buckets[11 - w]++;
      });
      const sorted = allEntries.filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));

      return {
        primary:   { value: active, label: 'Active' },
        secondary: { value: recent, label: `Updates · ${rangeLabel}` },
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
    desc: 'Monitor your key business metrics, link them to rocks, and visualize trends over time.',
    href: '/metrics/',
    table: 'metrics',

    computeStats(data) {
      const metrics = (data && data.metrics) || [];
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
        secondary: { value: allEntries.length, label: 'Entries' },
        spark: buckets.some(b => b > 0) ? buckets : null,
        latestEntries: sorted.slice(0, 6).map(e => ({
          when: e.periodEnd || e.periodStart, target: e.metricName,
          note: e.period ? `logged for ${e.period}` : 'logged metric',
        })),
        summaryFragment: visible === 0 ? 'No metrics yet'
          : `${visible} metric${visible === 1 ? '' : 's'}`,
      };
    },
  },
  {
    id: 'today',
    name: 'Today List',
    type: 'dashboard',
    iconBg: 'var(--green-bg)',
    iconColor: 'var(--green)',
    accentVar: '--green',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    desc: 'Set 3–5 priorities for the day. Auto-pulled from your projects. Resets daily.',
    href: '/today/',

    async fetchStats(sb, userId) {
      const _d = new Date();
      const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
      const { data: items } = await sb.from('today_items')
        .select('id, completed, on_hold')
        .eq('user_id', userId)
        .eq('item_date', today);
      const all = items || [];
      const completed = all.filter(i => i.completed).length;
      const total = all.filter(i => !i.on_hold).length;
      return {
        primary:   { value: `${completed}/${total}`, label: 'Done Today' },
        secondary: null,
        spark: null,
        latestEntries: [],
        summaryFragment: total === 0 ? 'No priorities set' : `${completed} of ${total} done today`,
      };
    },
  },
  {
    id: 'digest',
    name: 'Weekly Digest',
    type: 'launchpad',
    iconBg: 'var(--blue-bg)',
    iconColor: 'var(--blue)',
    accentVar: '--blue',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>`,
    desc: 'Auto-generated summary of the past 7 days across all your modules.',
    href: '/digest/',

    async fetchStats(sb, userId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Mirror the mode the user has selected inside the digest module
      const mode = localStorage.getItem('digestWeekMode') || 'rolling';
      let startStr, endStr, weekLabel;

      if (mode === 'custom') {
        startStr  = localStorage.getItem('digestCustomStart');
        endStr    = localStorage.getItem('digestCustomEnd');
        if (startStr && endStr) {
          const s = new Date(startStr + 'T00:00:00');
          const e = new Date(endStr   + 'T00:00:00');
          weekLabel = `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
        } else {
          // Fallback if custom was set but dates are missing
          startStr  = new Date(today.getTime() - 6 * 86400000).toISOString().split('T')[0];
          endStr    = today.toISOString().split('T')[0];
          weekLabel = 'Rolling 7d';
        }
      } else if (mode === 'sun') {
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        const end   = new Date(start); end.setDate(start.getDate() + 6);
        startStr  = start.toISOString().split('T')[0];
        endStr    = end.toISOString().split('T')[0];
        weekLabel = 'Sun–Sat';
      } else {
        const start = new Date(today.getTime() - 6 * 86400000);
        const end   = new Date(today);
        startStr  = start.toISOString().split('T')[0];
        endStr    = end.toISOString().split('T')[0];
        weekLabel = 'Rolling 7d';
      }

      // Count project task completions within the range
      const [dashRows, manualItems, caseTickets] = await Promise.all([
        sb.from('dashboards').select('data').eq('user_id', userId),
        sb.from('today_items')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('source', 'manual')
          .eq('completed', true)
          .gte('item_date', startStr)
          .lte('item_date', endStr),
        sb.from('case_writer_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('submitted_at', startStr + 'T00:00:00')
          .lte('submitted_at', endStr   + 'T23:59:59'),
      ]);

      let completions = 0;
      for (const row of (dashRows.data || [])) {
        for (const project of (row.data?.projects || [])) {
          for (const task of (project.tasks || [])) {
            if (!task.completedInEntry) continue;
            const entry = (project.entries || []).find(e => e.id === task.completedInEntry);
            if (entry && entry.date >= startStr && entry.date <= endStr) completions++;
          }
        }
      }
      completions += manualItems.count || 0;
      completions += caseTickets.count || 0;

      return {
        primary:   { value: completions, label: 'Completions' },
        secondary: null,
        weekLabel,
        spark: null,
        latestEntries: [],
        summaryFragment: `${completions} completion${completions === 1 ? '' : 's'} this week`,
      };
    },
  },
  {
    id: 'wins-log',
    name: 'Wins Log',
    type: 'launchpad',
    iconBg: 'rgba(224,160,48,0.14)',
    iconColor: 'var(--orange, #e0a030)',
    accentVar: '--orange',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`,
    desc: 'Track your wins and accomplishments. AI-powered scanning surfaces highlights from your activity.',
    href: '/wins-log/',

    async fetchStats(sb, userId) {
      const [winsRes, pendingRes] = await Promise.all([
        sb.from('wins')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        sb.from('win_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending'),
      ]);
      const totalWins = winsRes.count || 0;
      const pending   = pendingRes.count || 0;
      return {
        primary:      { value: totalWins, label: totalWins === 1 ? 'Win' : 'Wins' },
        secondary:    pending > 0 ? { value: pending, label: 'Suggestions' } : null,
        spark:        null,
        latestEntries: [],
        summaryFragment: totalWins === 0
          ? 'No wins logged yet'
          : `${totalWins} win${totalWins === 1 ? '' : 's'} logged`,
      };
    },
  },
  {
    id: 'scratchpad',
    name: 'Scratchpad',
    type: 'launchpad',
    iconBg: 'var(--surface-2)',
    iconColor: 'var(--text-2)',
    accentVar: '--text',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    desc: 'Frictionless place to dump thoughts, ideas, and notes throughout the day.',
    href: '/scratchpad/',

    async fetchStats(sb, userId) {
      const [unreviewedRes, totalRes] = await Promise.all([
        sb.from('scratch_notes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('reviewed', false),
        sb.from('scratch_notes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      const unreviewed = unreviewedRes.count || 0;
      return {
        primary:      { value: unreviewed, label: 'Unreviewed' },
        secondary:    null,
        spark:        null,
        quickCapture: true,
        latestEntries: [],
        summaryFragment: unreviewed > 0 ? `${unreviewed} unreviewed note${unreviewed === 1 ? '' : 's'}` : 'All notes reviewed',
      };
    },
  },
  {
    id: 'case-writer',
    name: 'Case Writer',
    type: 'launchpad',
    iconBg: 'var(--surface-2)',
    iconColor: 'var(--text-2)',
    accentVar: '--text',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    desc: 'Fill out structured ticket templates and copy formatted output.',
    href: '/case-writer/',

    async fetchStats(sb, userId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mode = localStorage.getItem('digestWeekMode') || 'rolling';
      let startStr, endStr, weekLabel;

      if (mode === 'custom') {
        startStr  = localStorage.getItem('digestCustomStart');
        endStr    = localStorage.getItem('digestCustomEnd');
        if (startStr && endStr) {
          const s = new Date(startStr + 'T00:00:00');
          const e = new Date(endStr   + 'T00:00:00');
          weekLabel = `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
        } else {
          startStr  = new Date(today.getTime() - 6 * 86400000).toISOString().split('T')[0];
          endStr    = today.toISOString().split('T')[0];
          weekLabel = 'Rolling 7d';
        }
      } else if (mode === 'sun') {
        const s = new Date(today); s.setDate(today.getDate() - today.getDay());
        const e = new Date(s);     e.setDate(s.getDate() + 6);
        startStr  = s.toISOString().split('T')[0];
        endStr    = e.toISOString().split('T')[0];
        weekLabel = 'Sun–Sat';
      } else {
        startStr  = new Date(today.getTime() - 6 * 86400000).toISOString().split('T')[0];
        endStr    = today.toISOString().split('T')[0];
        weekLabel = 'Rolling 7d';
      }

      const { count } = await sb
        .from('case_writer_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('submitted_at', startStr + 'T00:00:00')
        .lte('submitted_at', endStr   + 'T23:59:59');
      const n = count || 0;
      return {
        primary:      { value: n, label: n === 1 ? 'Ticket' : 'Tickets' },
        secondary:    null,
        weekLabel,
        spark:        null,
        quickCapture: false,
        latestEntries: [],
        summaryFragment: `${n} ticket${n === 1 ? '' : 's'} submitted`,
      };
    },
  },
  {
    id: 'product-ideas',
    name: 'Product Ideas',
    type: 'launchpad',
    iconBg: 'var(--teal-bg)',
    iconColor: 'var(--teal)',
    accentVar: '--teal',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.18 4.48-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.18 13.48 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>`,
    desc: 'Document improvement ideas across the products you work with.',
    href: '/product-ideas/',

    async fetchStats(sb, userId) {
      const [productsRes, allIdeasRes, latestRes] = await Promise.all([
        sb.from('pi_products').select('id, name').eq('user_id', userId),
        sb.from('pi_ideas').select('id, status').eq('user_id', userId),
        sb.from('pi_ideas').select('id, title, product_id').eq('user_id', userId)
          .order('created_at', { ascending: false }).limit(3),
      ]);
      const products  = productsRes.data  || [];
      const allIdeas  = allIdeasRes.data  || [];
      const latest    = latestRes.data    || [];
      const total     = allIdeas.length;
      const submitted = allIdeas.filter(i => i.status === 'submitted').length;
      const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));
      return {
        primary:       { value: total, label: total === 1 ? 'Idea' : 'Ideas' },
        secondary:     { value: submitted, label: 'Submitted' },
        spark:         null,
        latestEntries: latest.map(i => ({ when: null, target: i.title, note: productMap[i.product_id] || '' })),
        summaryFragment: `${total} idea${total === 1 ? '' : 's'} across ${products.length} product${products.length === 1 ? '' : 's'}`,
      };
    },
  },
  {
    id: 'rock-management',
    name: 'Rock Management',
    type: 'launchpad',
    iconBg: 'var(--amber-bg)',
    iconColor: 'var(--amber)',
    accentVar: '--amber',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/></svg>`,
    desc: 'Define company, team, and individual rocks. Projects and metrics attach to them.',
    href: '/rock-management/',

    async fetchStats(sb, userId) {
      const { data } = await sb.from('rocks').select('id, level, archived').eq('user_id', userId);
      const rocks   = (data || []).filter(r => !r.archived);
      const total   = rocks.length;
      const company = rocks.filter(r => r.level === 'company').length;
      const team    = rocks.filter(r => r.level === 'team').length;
      return {
        primary:       { value: total, label: total === 1 ? 'Rock' : 'Rocks' },
        secondary:     { value: team, label: 'Team' },
        spark:         null,
        latestEntries: [],
        summaryFragment: total === 0
          ? 'No rocks defined yet'
          : `${company} company · ${team} team rock${team === 1 ? '' : 's'}`,
      };
    },
  },
];

// ── Drag state ──
let _modDragId       = null;
let _modDragEl       = null;
let _modDropDone     = false;
let _modSwapCooldown = false;
let _modInDashZone   = false; // prevents launchpad card from oscillating in dashboard territory

// ── Render cache (for re-rendering phantoms after drag) ──
let _lastModRows = [];
let _lastStats   = {};

// ── Phantom quotes (rotate daily) ──
const _PHANTOM_QUOTES = [
  { q: 'You have power over your mind, not outside events. Realize this, and you will find strength.', a: 'Marcus Aurelius' },
  { q: 'He who is not a good servant will not be a good master.', a: 'Plato' },
  { q: 'Waste no more time arguing about what a good man should be. Be one.', a: 'Marcus Aurelius' },
  { q: 'The happiness of your life depends upon the quality of your thoughts.', a: 'Marcus Aurelius' },
  { q: 'It is not the man who has too little, but the man who craves more, that is poor.', a: 'Seneca' },
  { q: 'Begin at once to live, and count each separate day as a separate life.', a: 'Seneca' },
  { q: 'He suffers more than necessary, who suffers before it is necessary.', a: 'Seneca' },
  { q: 'The first rule is to keep an untroubled spirit. The second is to look things in the face and know them for what they are.', a: 'Marcus Aurelius' },
  { q: 'Make the best use of what is in your power, and take the rest as it happens.', a: 'Epictetus' },
  { q: 'Nothing is miserable unless you think it so; and on the other hand, nothing brings happiness unless you are content with it.', a: 'Boethius' },
  { q: 'Do not indulge in dreams of what you do not have, but count the blessings you actually possess.', a: 'Marcus Aurelius' },
  { q: 'Whenever you are about to find fault with someone, ask yourself: what fault of mine most nearly resembles the one I am about to criticize?', a: 'Marcus Aurelius' },
  { q: 'If it is not right, do not do it; if it is not true, do not say it.', a: 'Marcus Aurelius' },
  { q: 'In your actions, don\'t procrastinate. In your conversations, don\'t confuse. In your thoughts, don\'t wander.', a: 'Marcus Aurelius' },
  { q: 'Wealth consists not in having great possessions, but in having few wants.', a: 'Epictetus' },
  { q: 'Be tolerant with others and strict with yourself.', a: 'Marcus Aurelius' },
  { q: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', a: 'Marcus Aurelius' },
  { q: 'We suffer more in imagination than in reality.', a: 'Seneca' },
  { q: 'The soul that sees beauty may sometimes walk alone.', a: 'Johann Wolfgang von Goethe' },
  { q: 'Your task is not to seek for love, but merely to seek and find all the barriers within yourself that you have built against it.', a: 'Rumi' },
  { q: 'Out beyond ideas of wrongdoing and rightdoing, there is a field. I\'ll meet you there.', a: 'Rumi' },
  { q: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', a: 'Rumi' },
  { q: 'Do not feel lonely. The entire universe is inside you.', a: 'Rumi' },
  { q: 'Silence is the language of God; all else is poor translation.', a: 'Rumi' },
  { q: 'The quieter you become, the more you are able to hear.', a: 'Ram Dass' },
  { q: 'Be here now.', a: 'Ram Dass' },
  { q: 'The present moment always will have been.', a: 'Eckhart Tolle' },
  { q: 'Realize deeply that the present moment is all you ever have.', a: 'Eckhart Tolle' },
  { q: 'What you think, you become. What you feel, you attract. What you imagine, you create.', a: 'Buddha' },
  { q: 'Peace comes from within. Do not seek it without.', a: 'Buddha' },
  { q: 'Three things cannot be long hidden: the sun, the moon, and the truth.', a: 'Buddha' },
  { q: 'You yourself, as much as anybody in the entire universe, deserve your love and affection.', a: 'Buddha' },
  { q: 'The man who moves a mountain begins by carrying away small stones.', a: 'Confucius' },
  { q: 'To know what you know and what you do not know — that is true knowledge.', a: 'Confucius' },
  { q: 'Knowing yourself is the beginning of all wisdom.', a: 'Aristotle' },
  { q: 'No man ever steps in the same river twice, for it\'s not the same river and he\'s not the same man.', a: 'Heraclitus' },
  { q: 'The only way out is through.', a: 'Robert Frost' },
  { q: 'Not all those who wander are lost.', a: 'J.R.R. Tolkien' },
  { q: 'In the middle of difficulty lies opportunity.', a: 'Albert Einstein' },
  { q: 'The mind is its own place, and in itself can make a heaven of hell, a hell of heaven.', a: 'John Milton' },
  { q: 'Between stimulus and response there is a space. In that space is our power to choose.', a: 'Viktor Frankl' },
  { q: 'Those who have a \'why\' to live can bear with almost any \'how\'.', a: 'Viktor Frankl' },
  { q: 'To live is to suffer; to survive is to find some meaning in the suffering.', a: 'Friedrich Nietzsche' },
  { q: 'What does not kill me makes me stronger.', a: 'Friedrich Nietzsche' },
  { q: 'In oneself lies the whole world, and if you know how to look and learn, the door is there and the key is in your hand.', a: 'Jiddu Krishnamurti' },
  { q: 'It is no measure of health to be well adjusted to a profoundly sick society.', a: 'Jiddu Krishnamurti' },
  { q: 'The object of life is not to be on the side of the majority, but to escape finding oneself in the ranks of the insane.', a: 'Marcus Aurelius' },
  { q: 'Rivers know this: there is no hurry. We shall get there some day.', a: 'A.A. Milne' },
  { q: 'Almost everything will work again if you unplug it for a few minutes — including you.', a: 'Anne Lamott' },
  { q: 'You are the sky. Everything else is just the weather.', a: 'Pema Chödrön' },
];

// ── Liked quotes state ──
let _likedQuotesSet = new Set();
let _likedQuotesArr = [];

async function loadLikedQuotes(userId) {
  const { data, error } = await sb.from('liked_quotes')
    .select('quote, author, liked_at')
    .eq('user_id', userId)
    .order('liked_at', { ascending: false });
  if (error) { console.error('loadLikedQuotes:', error); return; }
  _likedQuotesArr = data || [];
  _likedQuotesSet = new Set(_likedQuotesArr.map(r => r.quote));
}

async function toggleLikeQuote(btn) {
  const q = btn.dataset.q;
  const a = btn.dataset.a;
  const label = btn.querySelector('.phantom-save-label');

  if (_likedQuotesSet.has(q)) {
    _likedQuotesSet.delete(q);
    _likedQuotesArr = _likedQuotesArr.filter(lq => lq.quote !== q);
    btn.classList.remove('saved');
    if (label) label.textContent = 'Save';
    btn.title = 'Save this quote';
    await sb.from('liked_quotes').delete().eq('user_id', currentUser.id).eq('quote', q);
  } else {
    _likedQuotesSet.add(q);
    const row = { quote: q, author: a, liked_at: new Date().toISOString() };
    _likedQuotesArr.unshift(row);
    btn.classList.add('saved');
    if (label) label.textContent = 'Saved';
    btn.title = 'Quote saved';
    await sb.from('liked_quotes').upsert(
      { user_id: currentUser.id, quote: q, author: a },
      { onConflict: 'user_id,quote' }
    );
  }

  // Update the "View saved" counter without a full re-render
  const actionsEl = btn.closest('.phantom-actions');
  if (actionsEl) {
    let viewBtn = actionsEl.querySelector('.phantom-saved-link');
    if (_likedQuotesArr.length > 0) {
      if (!viewBtn) {
        viewBtn = document.createElement('button');
        viewBtn.className = 'phantom-saved-link';
        viewBtn.addEventListener('click', openLikedQuotesModal);
        actionsEl.appendChild(viewBtn);
      }
      viewBtn.textContent = 'View saved';
    } else if (viewBtn) {
      viewBtn.remove();
    }
  }
}

function openLikedQuotesModal() {
  if (document.getElementById('lq-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'lq-overlay';
  overlay.className = 'lq-overlay';

  const rows = _likedQuotesArr.length
    ? _likedQuotesArr.map((r, i) => `
        <div class="lq-row">
          <div class="lq-row-text">
            <div class="lq-row-quote">“${escHtml(r.quote)}”</div>
            <div class="lq-row-author">— ${escHtml(r.author)}</div>
          </div>
          <button class="lq-remove-btn" data-index="${i}" title="Remove">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>`).join('')
    : '<div class="lq-empty">No saved quotes yet.</div>';

  overlay.innerHTML = `
    <div class="lq-modal" role="dialog" aria-modal="true" aria-label="Saved quotes">
      <div class="lq-header">
        <span class="lq-title">Saved Quotes</span>
        <button class="sc-close" onclick="document.getElementById('lq-overlay').remove()" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="lq-body" id="lq-body">${rows}</div>
    </div>`;

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });

  // Remove button handler
  overlay.addEventListener('click', async e => {
    const btn = e.target.closest('.lq-remove-btn');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const removed = _likedQuotesArr[idx];
    if (!removed) return;
    _likedQuotesSet.delete(removed.quote);
    _likedQuotesArr.splice(idx, 1);
    await sb.from('liked_quotes').delete().eq('user_id', currentUser.id).eq('quote', removed.quote);
    // Refresh modal body
    const body = document.getElementById('lq-body');
    if (body) body.innerHTML = _likedQuotesArr.length
      ? _likedQuotesArr.map((r, i) => `
          <div class="lq-row">
            <div class="lq-row-text">
              <div class="lq-row-quote">“${escHtml(r.quote)}”</div>
              <div class="lq-row-author">— ${escHtml(r.author)}</div>
            </div>
            <button class="lq-remove-btn" data-index="${i}" title="Remove">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>`).join('')
      : '<div class="lq-empty">No saved quotes yet.</div>';
    // Sync the save button on the card if visible
    const cardBtn = document.querySelector('.phantom-save-btn');
    if (cardBtn && cardBtn.dataset.q === removed.quote) {
      cardBtn.classList.remove('saved');
      const lbl = cardBtn.querySelector('.phantom-save-label');
      if (lbl) lbl.textContent = 'Save';
    }
    // Sync "View saved" link count
    const viewLink = document.querySelector('.phantom-saved-link');
    if (viewLink) {
      if (_likedQuotesArr.length > 0) viewLink.textContent = 'View saved';
      else viewLink.remove();
    }
  });

  document.body.appendChild(overlay);
}

let _pickedQuote = null;
function _phantomHtml() {
  if (!_pickedQuote) _pickedQuote = _PHANTOM_QUOTES[Math.floor(Math.random() * _PHANTOM_QUOTES.length)];
  const { q, a } = _pickedQuote;
  const isSaved = _likedQuotesSet.has(q);
  return `<div class="module-card module-card--phantom" data-phantom="true" aria-hidden="true">
    <div class="phantom-eyebrow">Today's thought</div>
    <div class="phantom-quote">"${escHtml(q)}"</div>
    <div class="phantom-author">— ${escHtml(a)}</div>
    <div class="phantom-actions">
      <button class="phantom-save-btn${isSaved ? ' saved' : ''}"
              data-q="${escHtml(q)}" data-a="${escHtml(a)}"
              onclick="toggleLikeQuote(this)"
              title="${isSaved ? 'Quote saved' : 'Save this quote'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="phantom-save-label">${isSaved ? 'Saved' : 'Save'}</span>
      </button>
      ${_likedQuotesArr.length > 0 ? `<button class="phantom-saved-link" onclick="openLikedQuotesModal()">View saved</button>` : ''}
    </div>
  </div>`;
}

// ── Rendering ──
// All modules go into a single flex-wrap container in sort_order.
// Launchpad rows have width:100% so they always occupy their own line.
// Consecutive dashboard cards share a row via flex:1 1 440px + max-width:50%.
// After any odd-length run of dashboard cards, a phantom card fills the empty slot.
function renderModules(modRows, statsByModule) {
  _lastModRows = modRows;
  _lastStats   = statsByModule || {};

  const orderMap = {};
  modRows.forEach(r => { orderMap[r.module] = r.sort_order ?? 999; });
  const allowed = new Set(modRows.map(r => r.module));

  const outer = document.getElementById('module-outer');
  const empty = document.getElementById('empty-state');
  const enabled = ALL_MODULES
    .filter(m => allowed.has(m.id))
    .sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));

  if (enabled.length === 0) {
    if (outer) outer.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Build render list: inject phantom cards after odd-length dashboard runs
  const renderItems = [];
  let ri = 0;
  while (ri < enabled.length) {
    const m = enabled[ri];
    if (m.type !== 'launchpad') {
      let runEnd = ri;
      while (runEnd + 1 < enabled.length && enabled[runEnd + 1].type !== 'launchpad') runEnd++;
      for (let k = ri; k <= runEnd; k++) renderItems.push(enabled[k]);
      if ((runEnd - ri + 1) % 2 === 1) renderItems.push(null); // null = phantom
      ri = runEnd + 1;
    } else {
      renderItems.push(m);
      ri++;
    }
  }

  let dashIdx = 0;

  if (outer) {
    outer.innerHTML = renderItems.map(m => {
      if (m === null) return _phantomHtml(); // phantom slot
      if (m.type === 'launchpad') {
        // ── Launchpad row ──
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
            ${stats.primary   ? `<div class="launchpad-row-stat"><div class="launchpad-row-stat-value">${escHtml(String(stats.primary.value))}</div><div class="launchpad-row-stat-label">${escHtml(stats.primary.label)}</div></div>` : ''}
            ${stats.secondary ? `<div class="launchpad-row-stat"><div class="launchpad-row-stat-value">${escHtml(String(stats.secondary.value))}</div><div class="launchpad-row-stat-label">${escHtml(stats.secondary.label)}</div></div>` : ''}
          </div>` : '';
        return `
          <a class="launchpad-row" href="${m.href}" data-module-id="${m.id}" data-module-type="launchpad" data-accent="${m.id}"
             draggable="true" ondragstart="onModuleDragStart(event)" ondragover="onModuleDragOver(event)"
             ondrop="onModuleDrop(event)" ondragend="onModuleDragEnd(event)">
            <div class="launchpad-row-icon">${m.icon}</div>
            <div class="launchpad-row-body">
              <div class="launchpad-row-name">${m.name}</div>
              <div class="launchpad-row-desc">${escHtml(m.desc)}${stats.weekLabel ? ` <span class="launchpad-week-label">${escHtml(stats.weekLabel)}</span>` : ''}</div>
            </div>
            ${stats.quickCapture ? `<div class="launchpad-quick-access"><div class="qa-icon" role="button" tabindex="0" title="New note" onclick="event.stopPropagation();event.preventDefault();openScratchpadCapture()" onkeydown="if(event.key==='Enter'){event.stopPropagation();event.preventDefault();openScratchpadCapture()}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg><span class="qa-icon-label">New note</span></div></div>` : (quickHtml || '<div></div>')}
            ${statsHtml}
            <div class="launchpad-row-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
          </a>`;
      } else {
        // ── Dashboard card ──
        const stats = (statsByModule && statsByModule[m.id]) || {};
        const num   = String(++dashIdx).padStart(2, '0');
        const statsHtml = `
          <div class="module-stats">
            ${stats.primary   ? `<div class="module-stat"><div class="module-stat-value">${escHtml(String(stats.primary.value))}</div><div class="module-stat-label">${escHtml(stats.primary.label)}</div></div>` : ''}
            ${stats.secondary ? `<div class="module-stat"><div class="module-stat-value">${escHtml(String(stats.secondary.value))}</div><div class="module-stat-label">${escHtml(stats.secondary.label)}</div></div>` : ''}
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
      }
    }).join('');
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
  if (_modDragEl.parentElement !== e.currentTarget.parentElement) return;

  const dragType   = _modDragEl.dataset.moduleType;
  const targetType = e.currentTarget.dataset.moduleType;

  // ── Launchpad dragged over dashboard territory ──
  // Position at the group boundary (before first / after last consecutive dashboard card)
  // then freeze — prevents the oscillation boop from flexbox reflow.
  if (dragType === 'launchpad' && targetType === 'dashboard') {
    if (_modInDashZone) return; // already positioned, don't oscillate

    const container = _modDragEl.parentElement;
    // Exclude phantom cards from index calculations
    const siblings = [...container.children].filter(el => !el.dataset.phantom);
    const dragIdx  = siblings.indexOf(_modDragEl);
    const targetIdx = siblings.indexOf(e.currentTarget);

    let insertEl;
    if (dragIdx > targetIdx) {
      // Dragging upward → place before the first card in the group
      let first = e.currentTarget;
      while (first.previousElementSibling && first.previousElementSibling.dataset.moduleType === 'dashboard') {
        first = first.previousElementSibling;
      }
      insertEl = first;
    } else {
      // Dragging downward → place after the last card in the group
      let last = e.currentTarget;
      while (last.nextElementSibling && last.nextElementSibling.dataset.moduleType === 'dashboard') {
        last = last.nextElementSibling;
      }
      insertEl = last.nextSibling; // null = append to end
    }

    if (_modDragEl.nextSibling === insertEl) { _modInDashZone = true; return; }

    const firstRects = new Map();
    siblings.forEach(el => { if (el !== _modDragEl) firstRects.set(el, el.getBoundingClientRect()); });
    container.insertBefore(_modDragEl, insertEl);
    _modInDashZone   = true;
    _modSwapCooldown = true;
    setTimeout(() => { _modSwapCooldown = false; }, 200);
    _flipAnimate(firstRects);
    return;
  }

  // Hovering over a launchpad card resets the dash-zone lock
  if (dragType === 'launchpad' && targetType === 'launchpad') {
    _modInDashZone = false;
  }

  // ── Standard swap (same type, or dashboard over launchpad) ──
  const container = _modDragEl.parentElement;
  const siblings  = [...container.children].filter(el => !el.dataset.phantom);
  const dragIdx   = siblings.indexOf(_modDragEl);
  const targetIdx = siblings.indexOf(e.currentTarget);
  if (dragIdx === -1 || targetIdx === -1) return;

  const insertBefore = dragIdx < targetIdx ? e.currentTarget.nextSibling : e.currentTarget;
  if (_modDragEl.nextSibling === insertBefore) return;

  const firstRects = new Map();
  siblings.forEach(el => { if (el !== _modDragEl) firstRects.set(el, el.getBoundingClientRect()); });
  container.insertBefore(_modDragEl, insertBefore);
  _modSwapCooldown = true;
  setTimeout(() => { _modSwapCooldown = false; }, 200);
  _flipAnimate(firstRects);
}

function _flipAnimate(firstRects) {
  firstRects.forEach((rect, el) => {
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
  _modInDashZone = false;
  if (!_modDropDone) _commitModuleOrder();
  _modDragId       = null;
  _modDragEl       = null;
  _modDropDone     = false;
  _modSwapCooldown = false;
}

function _updateCardNumbers() {
  let i = 0;
  document.querySelectorAll('#module-outer .module-card').forEach(card => {
    const num = card.querySelector('.module-card-num');
    if (num) num.textContent = String(++i).padStart(2, '0');
  });
}

async function _commitModuleOrder() {
  if (!currentUser) return;
  const items = [...document.querySelectorAll('#module-outer > [data-module-id]')];

  // Build updated modRows with new sort_orders, then re-render (fixes phantom positions)
  const newOrderMap = {};
  items.forEach((el, i) => { newOrderMap[el.dataset.moduleId] = i; });
  const updatedRows = _lastModRows.map(r => ({
    ...r,
    sort_order: newOrderMap[r.module] ?? r.sort_order,
  }));
  renderModules(updatedRows, _lastStats);

  // Persist to DB — single upsert instead of N individual updates
  await sb.from('user_modules').upsert(
    items.map((el, i) => ({ user_id: currentUser.id, module: el.dataset.moduleId, sort_order: i })),
    { onConflict: 'user_id,module' }
  );
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
