// Safe read-modify-write access to the Projects JSONB blob in dashboards.data.
// The whole Projects module lives in one JSON document per user, so every
// write here fetches the current blob, applies a minimal mutation, recalcs
// completion the same way the app does, and writes back with an optimistic
// concurrency check on updated_at.
import { unwrap } from './supabase.js';

// Same id style the app generates ('ute4l4a', ...)
export function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

export function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Mirrors projects/js/state.js: per-entry and per-project completion are
// derived from tasks' completedInEntry pointers and entry date order.
export function recalcProject(p) {
  const tasks = p.tasks || [];
  const sorted = [...(p.entries || [])].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const entryIds = sorted.map((e) => e.id);
  if (tasks.length) {
    sorted.forEach((e, idx) => {
      const done = tasks.filter(
        (t) => t.completedInEntry && entryIds.indexOf(t.completedInEntry) <= idx
      ).length;
      e.completion = Math.round((done / tasks.length) * 100);
    });
  }
  p.completion = tasks.length
    ? Math.round(
        (tasks.filter((t) => t.completedInEntry).length / tasks.length) * 100
      )
    : 0;
}

export async function readBlob(sb, uid) {
  const row = unwrap(
    await sb
      .from('dashboards')
      .select('data, updated_at')
      .eq('user_id', uid)
      .maybeSingle(),
    'Loading projects'
  );
  return {
    blob: row?.data ?? null,
    updatedAt: row?.updated_at ?? null,
    exists: !!row,
  };
}

// Apply `mutate(blob)` to the current blob and persist it. `mutate` may
// return a value, which is passed through to the caller. Unknown keys in the
// blob (activeProject, view, sidebarOpen, metrics, ...) are preserved.
// Retries once on a concurrent write by the app, then gives up loudly.
export async function mutateBlob(sb, uid, mutate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { blob, updatedAt, exists } = await readBlob(sb, uid);
    const data = blob ?? { projects: [] };
    if (!Array.isArray(data.projects)) data.projects = [];

    const result = mutate(data);
    data.projects.forEach(recalcProject);

    const now = new Date().toISOString();
    if (!exists) {
      const { error } = await sb
        .from('dashboards')
        .insert({ user_id: uid, data, updated_at: now });
      if (!error) return result;
      throw new Error(`Saving projects: ${error.message}`);
    }

    let q = sb
      .from('dashboards')
      .update({ data, updated_at: now })
      .eq('user_id', uid);
    q = updatedAt === null ? q.is('updated_at', null) : q.eq('updated_at', updatedAt);
    const written = unwrap(await q.select('user_id'), 'Saving projects');
    if (written.length > 0) return result;
    // 0 rows updated → the app wrote concurrently; loop to re-read and retry.
  }
  throw new Error(
    'The projects data changed while saving (probably an open dashboard tab). Nothing was written — please retry.'
  );
}

export function findProject(data, id) {
  const p = (data.projects || []).find((x) => x.id === id);
  if (!p) {
    throw new Error(`No project with id '${id}'. Use projects_list to see valid ids.`);
  }
  return p;
}

export function findTask(project, taskId) {
  const t = (project.tasks || []).find((x) => x.id === taskId);
  if (!t) {
    throw new Error(
      `No task '${taskId}' in project '${project.name}'. Use projects_get to see task ids.`
    );
  }
  return t;
}
