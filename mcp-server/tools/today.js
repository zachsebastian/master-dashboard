// Today List tools (today_items table).
// Completing / un-completing a project-linked item keeps the originating
// project task in sync in the dashboards blob, mirroring today/js/state.js.
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';
import { mutateBlob, findProject, shortId, todayDate } from '../lib/projects-blob.js';

const ITEM_FIELDS =
  'id, text, completed, on_hold, item_date, source, source_ref_id, source_ref_name, source_task_id, sort_order';

async function maxSortOrder(sb, uid, date) {
  const rows = unwrap(
    await sb
      .from('today_items')
      .select('sort_order')
      .eq('user_id', uid)
      .eq('item_date', date)
      .order('sort_order', { ascending: false })
      .limit(1),
    'Reading today items'
  );
  return rows.length ? rows[0].sort_order : -1;
}

// Sync the project blob when a project-linked item is completed/uncompleted.
async function syncProjectTask(sb, uid, item, completing) {
  await mutateBlob(sb, uid, (data) => {
    const project = (data.projects || []).find((p) => p.id === item.source_ref_id);
    if (!project) return;
    const task = item.source_task_id
      ? (project.tasks || []).find((t) => t.id === item.source_task_id)
      : (project.tasks || []).find((t) => t.text.trim() === item.text.trim());
    if (!task) return;

    if (completing) {
      if (task.completedInEntry) return;
      const entry = {
        id: shortId(),
        date: item.item_date || todayDate(),
        note: 'Completed via Today List',
        nextSteps: '',
        completion: 0,
        status: project.status || 'in-progress',
      };
      task.completedInEntry = entry.id;
      project.entries = [...(project.entries || []), entry];
    } else {
      if (!task.completedInEntry) return;
      const entryId = task.completedInEntry;
      task.completedInEntry = null;
      const idx = (project.entries || []).findIndex(
        (e) => e.id === entryId && e.note === 'Completed via Today List'
      );
      if (idx !== -1) project.entries.splice(idx, 1);
    }
  });
}

export const tools = [
  {
    name: 'today_list',
    description:
      "List Today List items. With no filters, returns today's items plus incomplete carry-overs from earlier days (what the app shows). Pass date filters to browse history.",
    schema: {
      date_from: z.string().optional().describe('YYYY-MM-DD inclusive'),
      date_to: z.string().optional().describe('YYYY-MM-DD inclusive'),
      completed: z.boolean().optional(),
      on_hold: z.boolean().optional(),
      limit: z.number().int().positive().max(500).optional().describe('default 200'),
    },
    handler: async (args, { sb, uid }) => {
      let q = sb
        .from('today_items')
        .select(ITEM_FIELDS)
        .eq('user_id', uid)
        .order('item_date', { ascending: false })
        .order('sort_order')
        .limit(args.limit ?? 200);
      if (args.date_from) q = q.gte('item_date', args.date_from);
      if (args.date_to) q = q.lte('item_date', args.date_to);
      if (!args.date_from && !args.date_to) {
        q = q.or(`item_date.eq.${todayDate()},completed.eq.false`);
      }
      if (args.completed !== undefined) q = q.eq('completed', args.completed);
      if (args.on_hold !== undefined) q = q.eq('on_hold', args.on_hold);
      return unwrap(await q, 'Listing today items');
    },
  },
  {
    name: 'today_save',
    description:
      'Create a Today List item (omit id) or update one (pass id). Setting completed=true/false also syncs any linked project task. Pass project_id to link a manual item to a project (creates a task in that project). For completed items, item_date acts as the completion date and can be edited.',
    schema: {
      id: z.string().uuid().optional(),
      text: z.string().optional(),
      item_date: z.string().optional().describe('YYYY-MM-DD, default today'),
      completed: z.boolean().optional(),
      on_hold: z.boolean().optional(),
      project_id: z
        .string()
        .optional()
        .describe('Project id from projects_list; links this item to the project'),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        // ── Create ──
        if (!args.text) throw new Error('text is required when creating an item.');
        const date = args.item_date || todayDate();
        const row = {
          user_id: uid,
          text: args.text.trim(),
          completed: args.completed ?? false,
          on_hold: args.on_hold ?? false,
          source: 'manual',
          source_ref_id: null,
          source_ref_name: null,
          source_task_id: null,
          item_date: date,
          sort_order: (await maxSortOrder(sb, uid, date)) + 1,
        };
        if (args.project_id) {
          const taskId = shortId();
          const projectName = await mutateBlob(sb, uid, (data) => {
            const project = findProject(data, args.project_id);
            if (!project.tasks) project.tasks = [];
            project.tasks.push({ id: taskId, text: row.text });
            return project.name;
          });
          row.source = 'project';
          row.source_ref_id = args.project_id;
          row.source_ref_name = projectName;
          row.source_task_id = taskId;
        }
        const item = unwrap(
          await sb.from('today_items').insert(row).select(ITEM_FIELDS).single(),
          'Creating today item'
        );
        if (item.completed && item.source === 'project') {
          await syncProjectTask(sb, uid, item, true);
        }
        return item;
      }

      // ── Update ──
      const existing = unwrap(
        await sb
          .from('today_items')
          .select(ITEM_FIELDS)
          .eq('user_id', uid)
          .eq('id', args.id)
          .maybeSingle(),
        'Loading today item'
      );
      if (!existing) {
        throw new Error(`No today item with id '${args.id}'. Use today_list to see ids.`);
      }

      const patch = {};
      if (args.text !== undefined) patch.text = args.text.trim();
      if (args.item_date !== undefined) patch.item_date = args.item_date;
      if (args.completed !== undefined) patch.completed = args.completed;
      if (args.on_hold !== undefined) patch.on_hold = args.on_hold;

      // Link an existing manual item to a project (app: associateItemWithProject)
      if (args.project_id && existing.source === 'manual') {
        const taskId = shortId();
        const projectName = await mutateBlob(sb, uid, (data) => {
          const project = findProject(data, args.project_id);
          if (!project.tasks) project.tasks = [];
          project.tasks.push({ id: taskId, text: patch.text ?? existing.text });
          return project.name;
        });
        patch.source = 'project';
        patch.source_ref_id = args.project_id;
        patch.source_ref_name = projectName;
        patch.source_task_id = taskId;
      }

      const item = unwrap(
        await sb
          .from('today_items')
          .update(patch)
          .eq('user_id', uid)
          .eq('id', args.id)
          .select(ITEM_FIELDS)
          .single(),
        'Updating today item'
      );

      // Keep the originating project task in sync
      if (item.source === 'project' && item.source_ref_id) {
        if (args.completed !== undefined && args.completed !== existing.completed) {
          await syncProjectTask(sb, uid, item, args.completed);
        }
        if (args.text !== undefined && patch.text !== existing.text) {
          await mutateBlob(sb, uid, (data) => {
            const project = (data.projects || []).find((p) => p.id === item.source_ref_id);
            const task = project && item.source_task_id
              ? (project.tasks || []).find((t) => t.id === item.source_task_id)
              : null;
            if (task) task.text = patch.text;
          });
        }
      }
      return item;
    },
  },
  {
    name: 'today_delete',
    description: 'Delete a Today List item by id. Does not touch any linked project task.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('today_items').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting today item'
      );
      return { deleted: args.id };
    },
  },
];
