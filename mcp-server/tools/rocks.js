// Rocks tools (rocks table) — company/team/individual goal hierarchy.
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';
import { shortId } from '../lib/projects-blob.js';

const FIELDS =
  'id, name, level, parent_id, sort_order, archived, best_result, worst_result, success_criteria, resources';

export const tools = [
  {
    name: 'rocks_list',
    description:
      'List the rock hierarchy (company → team → individual goals) as a tree. Excludes archived rocks unless include_archived=true.',
    schema: { include_archived: z.boolean().optional() },
    handler: async (args, { sb, uid }) => {
      let q = sb.from('rocks').select(FIELDS).eq('user_id', uid).order('sort_order');
      if (!args.include_archived) q = q.eq('archived', false);
      const rocks = unwrap(await q, 'Listing rocks');
      const byId = new Map(rocks.map((r) => [r.id, { ...r, children: [] }]));
      const roots = [];
      for (const r of byId.values()) {
        if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(r);
        else roots.push(r);
      }
      return roots;
    },
  },
  {
    name: 'rock_save',
    description:
      'Create a rock (omit id; name and level required) or update one (pass id). Set archived=true to archive instead of deleting.',
    schema: {
      id: z.string().optional(),
      name: z.string().optional(),
      level: z.enum(['company', 'team', 'individual']).optional(),
      parent_id: z.string().nullable().optional(),
      best_result: z.string().optional(),
      worst_result: z.string().optional(),
      success_criteria: z.string().optional(),
      resources: z.string().optional(),
      archived: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.name || !args.level) {
          throw new Error('name and level are required when creating a rock.');
        }
        return unwrap(
          await sb
            .from('rocks')
            .insert({
              id: shortId(),
              user_id: uid,
              name: args.name,
              level: args.level,
              parent_id: args.parent_id ?? null,
              best_result: args.best_result ?? null,
              worst_result: args.worst_result ?? null,
              success_criteria: args.success_criteria ?? null,
              resources: args.resources ?? null,
            })
            .select(FIELDS)
            .single(),
          'Creating rock'
        );
      }
      const patch = { updated_at: new Date().toISOString() };
      for (const k of [
        'name', 'level', 'parent_id', 'best_result', 'worst_result',
        'success_criteria', 'resources', 'archived',
      ]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const rows = unwrap(
        await sb.from('rocks').update(patch).eq('user_id', uid).eq('id', args.id).select(FIELDS),
        'Updating rock'
      );
      if (!rows.length) throw new Error(`No rock with id '${args.id}'. Use rocks_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'rock_delete',
    description:
      'Delete a rock. Refuses if other rocks have it as parent — re-parent or delete children first (or archive instead via rock_save).',
    schema: { id: z.string() },
    handler: async (args, { sb, uid }) => {
      const children = unwrap(
        await sb.from('rocks').select('id, name').eq('user_id', uid).eq('parent_id', args.id),
        'Checking children'
      );
      if (children.length) {
        throw new Error(
          `Rock '${args.id}' has ${children.length} child rock(s): ${children
            .map((c) => c.name)
            .join(', ')}. Re-parent or delete them first.`
        );
      }
      unwrap(
        await sb.from('rocks').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting rock'
      );
      return { deleted: args.id };
    },
  },
];
