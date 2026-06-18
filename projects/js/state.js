// ── Colors ──
const COLORS = [
  '#e05c4b','#4a9fd4','#4caf73','#a07ad4','#e08a3c',
  '#e06699','#5ab4b4','#b4a55a','#5a7ab4','#7ab45a',
];

// ── Default state ──
const DEFAULT_STATE = {
  projects: [
    {
      id: 'ute4l4a', name: 'Example Project', color: '#5ab4b4',
      status: 'in-progress', priority: 'medium', completion: 71,
      tags: ['Example Tag 1', 'Example Tag 2'], dueDate: '2026-05-28',
      description: 'This is an example project. Feel free to delete this project once you\'ve begun using this tool.',
      entries: [
        { id: 'sge74xc', date: '2026-03-24', completion: 29, status: 'in-progress', note: 'Finished first two tasks.', nextSteps: 'Please ensure you delete this project. You don\'t need to, but I recommend it...' },
        { id: 'm3ndosr', date: '2026-04-27', completion: 71, status: 'in-progress', note: 'Completed the next 3 tasks', nextSteps: 'Please ensure you delete this project. You don\'t need to, but I recommend it...' },
      ],
      blockers: ['Need to get approval from John Doe to be able to complete task 6.'],
      tasks: [
        { id: '4zeqozu', text: 'Example Task 1', completedInEntry: 'sge74xc' },
        { id: 'staujry', text: 'Example Task 2', completedInEntry: 'sge74xc' },
        { id: 'd6s6y0f', text: 'Example Task 3', completedInEntry: 'm3ndosr' },
        { id: 'dseljqj', text: 'Example Task 4', completedInEntry: 'm3ndosr' },
        { id: 'r928e80', text: 'Example Task 5', completedInEntry: 'm3ndosr' },
        { id: 'vfp2j75', text: 'Example Task 6', completedInEntry: null },
        { id: 'eu18ycx', text: 'Example Task 7', completedInEntry: null },
      ],
      nextSteps: 'Please ensure you delete this project. You don\'t need to, but I recommend it...',
      notes: 'Run wild!'
    },
  ],
  activeProject: 'ute4l4a',
  sidebarOpen: true,
  view: 'summary',
};

// ── Runtime state ──
let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let _currentUser = null;
let _saveTimer = null;
let _rocks = []; // shared rock hierarchy (read-only here), loaded on boot

// ── Completion helper ──
function calcCompletion(p) {
  const tasks = p.tasks || [];
  if (!tasks.length) return 0;
  return Math.round(tasks.filter(t => t.completedInEntry).length / tasks.length * 100);
}

// ── Supabase persistence ──
async function loadStateFromSupabase() {
  const { data, error } = await sb
    .from('dashboards')
    .select('data')
    .eq('user_id', _currentUser.id)
    .maybeSingle();

  if (error) { console.error('Load error:', error); return; }

  if (data) {
    state = data.data;
    // Always open to the summary dashboard, not the last-viewed project
    state.view          = 'summary';
    state.activeProject = null;
    // Recalculate completions from tasks on every load
    state.projects.forEach(p => {
      const tasks = p.tasks || [];
      if (!tasks.length) return;
      const sorted = [...(p.entries || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
      const entryIds = sorted.map(e => e.id);
      sorted.forEach((e, idx) => {
        const done = tasks.filter(t => t.completedInEntry && entryIds.indexOf(t.completedInEntry) <= idx).length;
        e.completion = Math.round(done / tasks.length * 100);
      });
      p.completion = calcCompletion(p);
    });
  } else {
    // First sign-in: seed with sample data
    await saveStateToSupabase();
  }
}

async function saveStateToSupabase() {
  if (!_currentUser) return;
  const { error } = await sb.from('dashboards').upsert(
    { user_id: _currentUser.id, data: state, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) console.error('Save error:', error);
}

function saveState() {
  const sw = document.getElementById('save-wrap');
  if (sw) {
    sw.classList.add('visible');
    clearTimeout(sw._t);
    sw._t = setTimeout(() => sw.classList.remove('visible'), 1800);
  }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveStateToSupabase, 800);
}
