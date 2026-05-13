// ── State ──
let notes = [];
let _currentUser = null;
let _saveTimer = null;

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
async function addNote(text) {
  const { data: note, error } = await sb.from('scratch_notes').insert({
    user_id:  _currentUser.id,
    text:     text.trim(),
    pinned:   false,
    reviewed: false,
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

// ── Toggle reviewed ──
async function toggleReviewed(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.reviewed = !note.reviewed;
  await sb.from('scratch_notes').update({ reviewed: note.reviewed }).eq('id', id);
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
