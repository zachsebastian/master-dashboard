// Feedback tools (feedback_entries table).
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';
import { todayDate } from '../lib/projects-blob.js';

const FIELDS = 'id, subject, note, sentiment, entry_date';

export const tools = [
  {
    name: 'feedback_list',
    description:
      'List feedback entries, newest first. Filter by sentiment or date range.',
    schema: {
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
      date_from: z.string().optional().describe('YYYY-MM-DD inclusive'),
      date_to: z.string().optional().describe('YYYY-MM-DD inclusive'),
    },
    handler: async (args, { sb, uid }) => {
      let q = sb
        .from('feedback_entries')
        .select(FIELDS)
        .eq('user_id', uid)
        .order('entry_date', { ascending: false });
      if (args.sentiment) q = q.eq('sentiment', args.sentiment);
      if (args.date_from) q = q.gte('entry_date', args.date_from);
      if (args.date_to) q = q.lte('entry_date', args.date_to);
      return unwrap(await q, 'Listing feedback');
    },
  },
  {
    name: 'feedback_save',
    description:
      'Record feedback (omit id; subject required) or update an entry (pass id).',
    schema: {
      id: z.string().uuid().optional(),
      subject: z.string().optional().describe('who or what the feedback is about'),
      note: z.string().optional(),
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
      entry_date: z.string().optional().describe('YYYY-MM-DD, default today'),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.subject) throw new Error('subject is required when creating feedback.');
        return unwrap(
          await sb
            .from('feedback_entries')
            .insert({
              user_id: uid,
              subject: args.subject,
              note: args.note ?? '',
              sentiment: args.sentiment ?? 'neutral',
              entry_date: args.entry_date || todayDate(),
            })
            .select(FIELDS)
            .single(),
          'Creating feedback'
        );
      }
      const patch = { updated_at: new Date().toISOString() };
      for (const k of ['subject', 'note', 'sentiment', 'entry_date']) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const rows = unwrap(
        await sb
          .from('feedback_entries')
          .update(patch)
          .eq('user_id', uid)
          .eq('id', args.id)
          .select(FIELDS),
        'Updating feedback'
      );
      if (!rows.length) throw new Error(`No feedback entry with id '${args.id}'.`);
      return rows[0];
    },
  },
  {
    name: 'feedback_delete',
    description: 'Delete a feedback entry by id.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('feedback_entries').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting feedback'
      );
      return { deleted: args.id };
    },
  },
];
