// Scratchpad tools (scratch_notes table).
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

const FIELDS = 'id, text, pinned, reviewed, reviewed_note, module, created_at';

export const tools = [
  {
    name: 'notes_list',
    description:
      'List scratchpad notes, newest first. Filter by pinned, reviewed, or the module a note was captured from.',
    schema: {
      pinned: z.boolean().optional(),
      reviewed: z.boolean().optional(),
      module: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      let q = sb
        .from('scratch_notes')
        .select(FIELDS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (args.pinned !== undefined) q = q.eq('pinned', args.pinned);
      if (args.reviewed !== undefined) q = q.eq('reviewed', args.reviewed);
      if (args.module !== undefined) q = q.eq('module', args.module);
      return unwrap(await q, 'Listing notes');
    },
  },
  {
    name: 'note_save',
    description:
      'Create a scratchpad note (omit id; text required) or update one (pass id): edit text, pin/unpin, mark reviewed with an optional reviewed_note.',
    schema: {
      id: z.string().uuid().optional(),
      text: z.string().optional(),
      pinned: z.boolean().optional(),
      reviewed: z.boolean().optional(),
      reviewed_note: z.string().optional(),
      module: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.text) throw new Error('text is required when creating a note.');
        return unwrap(
          await sb
            .from('scratch_notes')
            .insert({
              user_id: uid,
              text: args.text,
              pinned: args.pinned ?? false,
              reviewed: args.reviewed ?? false,
              reviewed_note: args.reviewed_note ?? null,
              module: args.module ?? null,
            })
            .select(FIELDS)
            .single(),
          'Creating note'
        );
      }
      const patch = {};
      for (const k of ['text', 'pinned', 'reviewed', 'reviewed_note', 'module']) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const rows = unwrap(
        await sb.from('scratch_notes').update(patch).eq('user_id', uid).eq('id', args.id).select(FIELDS),
        'Updating note'
      );
      if (!rows.length) throw new Error(`No note with id '${args.id}'. Use notes_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'note_delete',
    description: 'Delete a scratchpad note by id.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('scratch_notes').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting note'
      );
      return { deleted: args.id };
    },
  },
];
