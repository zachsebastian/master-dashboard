// ── State ──
let notes = [];
let _currentUser = null;
let _saveTimer = null;
let _enabledModuleIds = new Set(); // modules this user has access to

// ── Load which modules the user has enabled (for the module picker) ──
async function loadEnabledModules() {
  const { data } = await sb.from('user_modules').select('module').eq('user_id', _currentUser.id);
  _enabledModuleIds = new Set((data || []).map(r => r.module));
}

// ── Load ──
async function loadNotes() {
  const { data } = await sb.from('scratch_notes')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  notes = data || [];
}

// ── Add ──
async function addNote(text, module) {
  const { data: note, error } = await sb.from('scratch_notes').insert({
    user_id:  _currentUser.id,
    text:     text.trim(),
    pinned:   false,
    reviewed: false,
    module:   module || null,
  }).select().single();
  if (error || !note) return;
  notes.unshift(note);
  sortNotes();
}

// ── Delete ──
async function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  await sb.from('scratch_notes').delete().eq('id', id);
}

// ── Toggle pin ──
async function togglePin(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  sortNotes();
  await sb.from('scratch_notes').update({ pinned: note.pinned }).eq('id', id);
}

// ── Edit ──
async function editNote(id, text, module) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.text   = text.trim();
  note.module = module || null;
  await sb.from('scratch_notes').update({ text: note.text, module: note.module }).eq('id', id);
}

// ── Toggle reviewed ──
async function toggleReviewed(id, reviewedNote) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.reviewed = !note.reviewed;
  const update = { reviewed: note.reviewed };
  if (note.reviewed) {
    note.reviewed_note = reviewedNote || null;
    update.reviewed_note = note.reviewed_note;
  } else {
    // Clearing reviewed also clears the note
    note.reviewed_note = null;
    update.reviewed_note = null;
  }
  await sb.from('scratch_notes').update(update).eq('id', id);
}

// ── Sort: pinned first, then reverse chronological ──
function sortNotes() {
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// ── Timestamp formatting ──
function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  const noteDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const timeStr   = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (noteDay.getTime() === today.getTime())     return `Today at ${timeStr}`;
  if (noteDay.getTime() === yesterday.getTime()) return `Yesterday at ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${timeStr}`;
}
