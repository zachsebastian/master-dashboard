// ── Constants ──
const COLORS = ['#e8e8e8','#4a9fd4','#4caf73','#d4893a','#d46a8a','#8b6f5c','#3ab89a','#9b7dd4'];
const COLORS_LIGHT = ['#1a1a1a','#1d6fa8','#2a7d46','#854f0b','#993556','#533c1d','#0f6e56','#533ab7'];
const COLOR_LABELS = ['Slate','Blue','Green','Amber','Rose','Brown','Teal','Purple'];

const SAMPLE_METRICS = [
  {
    id: 'm1', name: 'Support Tickets', color: '#4a9fd4', visible: true,
    fields: [
      { id: 'f1', name: 'Total Escalations', type: 'input' },
      { id: 'f2', name: 'Required Dev', type: 'input' },
      { id: 'f3', name: 'You Resolved', type: 'input' },
      { id: 'f4', name: 'CX Solvable', type: 'derived', formula: 'f1 - f2' },
      { id: 'f5', name: '% Resolved', type: 'derived', formula: 'round(f3/(f1-f2)*100)' }
    ],
    entries: [
      { id: 'e2', period: 'Mar 25 – Apr 24', periodStart: '2025-03-25', periodEnd: '2025-04-24', values: { f1: 83, f2: 42, f3: 32 } },
      { id: 'e1', period: 'Feb 23 – Mar 24', periodStart: '2025-02-23', periodEnd: '2025-03-24', values: { f1: 49, f2: 6, f3: 36 } }
    ]
  },
  {
    id: 'm2', name: 'Onboarding Videos', color: '#4caf73', visible: true,
    fields: [
      { id: 'f1', name: 'Videos Completed', type: 'input' },
      { id: 'f2', name: 'Total Videos', type: 'input' },
      { id: 'f3', name: '% Complete', type: 'derived', formula: 'round(f1/f2*100)' },
      { id: 'f4', name: 'Remaining', type: 'derived', formula: 'f2 - f1' }
    ],
    entries: [
      { id: 'e2', period: 'Mar 25 – Apr 24', periodStart: '2025-03-25', periodEnd: '2025-04-24', values: { f1: 14, f2: 14 } },
      { id: 'e1', period: 'Feb 23 – Mar 24', periodStart: '2025-02-23', periodEnd: '2025-03-24', values: { f1: 10, f2: 14 } }
    ]
  },
  {
    id: 'm3', name: 'AI Renewal Engine', color: '#9b7dd4', visible: true,
    type: 'task', fields: [], entries: [], tasks: []
  }
];

const SAMPLE_ROCKS = [
  { id: 'r1', name: 'Reduce support escalation rate' },
  { id: 'r2', name: 'Complete onboarding overhaul' },
  { id: 'r3', name: 'Improve team resolution speed' },
];

const initialState = {
  metrics: SAMPLE_METRICS,
  rocks: SAMPLE_ROCKS,
  metricRocks: {},
  metricEntryIndex: {},
  metricStatus: {},
  summarySidebarVisible: true,
  activeMetric: 'm1',
  view: 'summary',
  modal: null,
  presentationMode: false,
  darkMode: false
};

// ── Runtime state ──
let state = { ...initialState };
let modalData = {};
let _saveTimer = null;
let _unsaved = false;
let _saveStatus = 'saved';
let _currentUser = null;
let _appReady = false;
let _supabaseRowId = null;

// ── Supabase data layer ──
async function loadFromSupabase() {
  renderLoading('Loading your dashboard…');
  try {
    const { data, error } = await sb
      .from('metrics')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (data) {
      _supabaseRowId = data.id;
      state = { ...initialState, ...data.data };
    } else {
      state = { ...initialState };
    }
    applyTheme();
    _appReady = true;
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div class="loading-screen">
        <div style="color:var(--red);font-size:15px">⚠ Could not load data</div>
        <div style="font-size:13px;color:var(--text-3);max-width:360px;text-align:center">${e.message}</div>
        <button class="btn" onclick="loadFromSupabase()">Retry</button>
      </div>
    `;
  }
}

async function _doSave() {
  if (!_currentUser) return;
  _saveStatus = 'saving';
  updateSaveIndicator();
  try {
    const payload = { data: state };
    let result;
    if (_supabaseRowId) {
      result = await sb.from('metrics').update(payload).eq('id', _supabaseRowId).select().single();
    } else {
      result = await sb.from('metrics').insert({ ...payload, user_id: _currentUser.id }).select().single();
    }
    if (result.error) throw result.error;
    if (!_supabaseRowId && result.data) _supabaseRowId = result.data.id;
    _unsaved = false;
    _saveStatus = 'saved';
    updateSaveIndicator();
    flashSaved();
  } catch (e) {
    _saveStatus = 'error';
    updateSaveIndicator();
    console.error('Save error:', e);
  }
}

function save() {
  _unsaved = true;
  _saveStatus = 'saving';
  updateSaveIndicator();
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_doSave, 600);
}

function updateSaveIndicator() {
  const dot = document.getElementById('save-dot');
  const lbl = document.getElementById('save-label');
  if (!dot) return;
  if (_saveStatus === 'saved') {
    dot.style.background = 'var(--green)';
    if (lbl) lbl.textContent = 'Saved';
  } else if (_saveStatus === 'saving') {
    dot.style.background = 'var(--blue)';
    if (lbl) lbl.textContent = 'Saving…';
  } else {
    dot.style.background = 'var(--red)';
    if (lbl) lbl.textContent = 'Save failed';
  }
}

function flashSaved() {
  const wrap = document.getElementById('save-wrap');
  if (!wrap) return;
  wrap.classList.add('visible');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => wrap.classList.remove('visible'), 2200);
}
