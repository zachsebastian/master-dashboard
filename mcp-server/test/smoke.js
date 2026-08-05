// Smoke test: signs in with DASH_EMAIL / DASH_PASSWORD and exercises the
// tool handlers directly. All reads run against live data; every write
// targets [MCP-TEST]-marked records the test creates and deletes itself.
// For projects, it verifies the rest of the blob survives byte-identical.
import { getContext } from '../lib/supabase.js';
import { readBlob } from '../lib/projects-blob.js';

import { tools as today } from '../tools/today.js';
import { tools as projects } from '../tools/projects.js';
import { tools as digest } from '../tools/digest.js';
import { tools as wins } from '../tools/wins.js';
import { tools as rocks } from '../tools/rocks.js';
import { tools as links } from '../tools/links.js';
import { tools as ideas } from '../tools/ideas.js';
import { tools as notes } from '../tools/notes.js';
import { tools as caseWriter } from '../tools/case-writer.js';
import { tools as feedback } from '../tools/feedback.js';
import { tools as reference } from '../tools/reference.js';

if (!process.env.DASH_EMAIL || !process.env.DASH_PASSWORD) {
  console.log('SKIP: smoke test needs DASH_EMAIL / DASH_PASSWORD in the environment.');
  process.exit(0);
}

const ALL = [
  ...today, ...projects, ...digest, ...wins, ...rocks, ...links,
  ...ideas, ...notes, ...caseWriter, ...feedback, ...reference,
];
const byName = Object.fromEntries(ALL.map((t) => [t.name, t]));
const call = async (name, args = {}) => byName[name].handler(args, ctx);

let passed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    console.error(`FAIL  ${label}: ${err.message}`);
    process.exitCode = 1;
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const ctx = await getContext();
console.log('Signed in.');

// ── Read-only tools against live data ──
await check('today_list', async () => assert(Array.isArray(await call('today_list'))));
await check('projects_list', async () => assert(Array.isArray(await call('projects_list'))));
await check('digest_get', async () => {
  const d = await call('digest_get');
  assert(d.range && Array.isArray(d.todayItems) && Array.isArray(d.projects));
});
await check('wins_list', async () => {
  const w = await call('wins_list', { status: 'all' });
  assert(Array.isArray(w.wins) && Array.isArray(w.candidates));
});
await check('rocks_list', async () => assert(Array.isArray(await call('rocks_list'))));
await check('links_list', async () => assert(Array.isArray(await call('links_list'))));
await check('ideas_list', async () => assert(Array.isArray(await call('ideas_list'))));
await check('notes_list', async () => assert(Array.isArray(await call('notes_list'))));
await check('tickets_list', async () => assert(Array.isArray(await call('tickets_list'))));
await check('feedback_list', async () => assert(Array.isArray(await call('feedback_list'))));
await check('metrics_get', async () => assert(Array.isArray(await call('metrics_get'))));
await check('data_inventory_list', async () =>
  assert(Array.isArray(await call('data_inventory_list'))));

// ── Today item lifecycle ──
await check('today item create/update/delete', async () => {
  const item = await call('today_save', { text: '[MCP-TEST] today item' });
  try {
    const updated = await call('today_save', { id: item.id, completed: true });
    assert(updated.completed === true, 'item did not complete');
  } finally {
    await call('today_delete', { id: item.id });
  }
});

// ── Project lifecycle + blob isolation ──
await check('project lifecycle preserves rest of blob', async () => {
  const before = JSON.stringify((await readBlob(ctx.sb, ctx.uid)).blob);
  const proj = await call('project_save', { name: '[MCP-TEST] project' });
  try {
    const task = await call('project_task_save', { project_id: proj.id, text: 'test task' });
    await call('project_task_save', {
      project_id: proj.id, task_id: task.id, completed_in_entry: 'today',
    });
    const full = await call('projects_get', { id: proj.id });
    assert(full.completion === 100, `expected 100% completion, got ${full.completion}`);
    assert(full.entries.length === 1, 'expected one auto-created entry');
    await call('project_entry_add', { project_id: proj.id, note: 'test entry' });
  } finally {
    await call('project_delete', { id: proj.id });
  }
  const after = JSON.stringify((await readBlob(ctx.sb, ctx.uid)).blob);
  assert(
    normalizeBlob(before) === normalizeBlob(after),
    'blob changed outside the test project'
  );
});
// The app rewrites view/activeProject on load; ignore those top-level keys.
function normalizeBlob(s) {
  const b = JSON.parse(s) || {};
  delete b.view;
  delete b.activeProject;
  return JSON.stringify(b);
}

// ── Win lifecycle ──
await check('win create/update/delete', async () => {
  const win = await call('win_save', { title: '[MCP-TEST] win' });
  try {
    const updated = await call('win_save', { id: win.id, summary: 'updated' });
    assert(updated.summary === 'updated');
  } finally {
    await call('win_delete', { id: win.id });
  }
});

// ── Rock lifecycle ──
await check('rock create/update/delete', async () => {
  const rock = await call('rock_save', { name: '[MCP-TEST] rock', level: 'individual' });
  try {
    const updated = await call('rock_save', { id: rock.id, archived: true });
    assert(updated.archived === true);
  } finally {
    await call('rock_delete', { id: rock.id });
  }
});

// ── Note lifecycle ──
await check('note create/update/delete', async () => {
  const note = await call('note_save', { text: '[MCP-TEST] note' });
  try {
    const updated = await call('note_save', { id: note.id, pinned: true });
    assert(updated.pinned === true);
  } finally {
    await call('note_delete', { id: note.id });
  }
});

// ── Feedback lifecycle ──
await check('feedback create/update/delete', async () => {
  const fb = await call('feedback_save', { subject: '[MCP-TEST] feedback' });
  try {
    const updated = await call('feedback_save', { id: fb.id, sentiment: 'positive' });
    assert(updated.sentiment === 'positive');
  } finally {
    await call('feedback_delete', { id: fb.id });
  }
});

// ── Product idea lifecycle (own product so nothing existing is touched) ──
await check('product + idea lifecycle', async () => {
  const product = await call('product_save', { name: '[MCP-TEST] product' });
  let ideaId = null;
  try {
    const idea = await call('idea_save', {
      product_id: product.id, title: '[MCP-TEST] idea',
    });
    ideaId = idea.id;
    const updated = await call('idea_save', { id: idea.id, priority: 'high' });
    assert(updated.priority === 'high');
  } finally {
    if (ideaId) await call('idea_delete', { id: ideaId });
    // pi_products has no delete tool by design; remove the test product directly.
    await ctx.sb.from('pi_products').delete().eq('user_id', ctx.uid).eq('id', product.id);
  }
});

// ── Reflection upsert (restores prior value) ──
await check('reflection_save round-trip', async () => {
  const week = '1999-01-04'; // far-past week: never shown in the app
  const saved = await call('reflection_save', {
    week_start: week, wins: '[MCP-TEST] wins',
  });
  assert(saved.wins === '[MCP-TEST] wins');
  await ctx.sb
    .from('weekly_reflections')
    .delete()
    .eq('user_id', ctx.uid)
    .eq('week_start', week);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}.`);
process.exit(process.exitCode || 0);
