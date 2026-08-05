// Wins Log tools (wins + win_candidates tables).
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';
import { todayDate } from '../lib/projects-blob.js';

const WIN_FIELDS = 'id, title, summary, category, source, source_ref, win_date';
const CAND_FIELDS =
  'id, title, summary, category, source, source_ref, win_date, status, dismissed_at';

export const tools = [
  {
    name: 'wins_list',
    description:
      "List Wins Log content. status: 'wins' (confirmed wins, default), 'pending' or 'dismissed' (AI-suggested candidates awaiting review), or 'all'.",
    schema: {
      status: z.enum(['wins', 'pending', 'dismissed', 'all']).optional(),
    },
    handler: async (args, { sb, uid }) => {
      const status = args.status || 'wins';
      const out = {};
      if (status === 'wins' || status === 'all') {
        out.wins = unwrap(
          await sb
            .from('wins')
            .select(WIN_FIELDS)
            .eq('user_id', uid)
            .order('win_date', { ascending: false }),
          'Listing wins'
        );
      }
      if (status !== 'wins') {
        let q = sb
          .from('win_candidates')
          .select(CAND_FIELDS)
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        if (status !== 'all') q = q.eq('status', status);
        out.candidates = unwrap(await q, 'Listing win candidates');
      }
      return out;
    },
  },
  {
    name: 'win_save',
    description: 'Create a win (omit id) or update one (pass id).',
    schema: {
      id: z.string().uuid().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      category: z.string().optional().describe('e.g. Delivery, Leadership, Process'),
      win_date: z.string().optional().describe('YYYY-MM-DD, default today on create'),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.title) throw new Error('title is required when creating a win.');
        return unwrap(
          await sb
            .from('wins')
            .insert({
              user_id: uid,
              title: args.title,
              summary: args.summary ?? '',
              category: args.category ?? 'Delivery',
              source: 'Manual',
              win_date: args.win_date || todayDate(),
            })
            .select(WIN_FIELDS)
            .single(),
          'Creating win'
        );
      }
      const patch = { updated_at: new Date().toISOString() };
      if (args.title !== undefined) patch.title = args.title;
      if (args.summary !== undefined) patch.summary = args.summary;
      if (args.category !== undefined) patch.category = args.category;
      if (args.win_date !== undefined) patch.win_date = args.win_date;
      const rows = unwrap(
        await sb
          .from('wins')
          .update(patch)
          .eq('user_id', uid)
          .eq('id', args.id)
          .select(WIN_FIELDS),
        'Updating win'
      );
      if (!rows.length) throw new Error(`No win with id '${args.id}'. Use wins_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'win_delete',
    description: 'Delete a win by id.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('wins').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting win'
      );
      return { deleted: args.id };
    },
  },
  {
    name: 'win_candidate_review',
    description:
      'Review an AI-suggested win candidate: promote (copies it into wins and marks it confirmed), dismiss, or restore a dismissed one back to pending.',
    schema: {
      id: z.string().uuid(),
      action: z.enum(['promote', 'dismiss', 'restore']),
    },
    handler: async (args, { sb, uid }) => {
      const cand = unwrap(
        await sb
          .from('win_candidates')
          .select(CAND_FIELDS)
          .eq('user_id', uid)
          .eq('id', args.id)
          .maybeSingle(),
        'Loading candidate'
      );
      if (!cand) {
        throw new Error(`No win candidate with id '${args.id}'. Use wins_list status=pending.`);
      }

      if (args.action === 'promote') {
        const win = unwrap(
          await sb
            .from('wins')
            .insert({
              user_id: uid,
              title: cand.title,
              summary: cand.summary,
              category: cand.category,
              source: cand.source,
              source_ref: cand.source_ref,
              win_date: cand.win_date || todayDate(),
            })
            .select(WIN_FIELDS)
            .single(),
          'Promoting candidate'
        );
        unwrap(
          await sb
            .from('win_candidates')
            .update({ status: 'confirmed' })
            .eq('user_id', uid)
            .eq('id', args.id),
          'Marking candidate confirmed'
        );
        return { promoted: win };
      }

      const patch =
        args.action === 'dismiss'
          ? { status: 'dismissed', dismissed_at: new Date().toISOString() }
          : { status: 'pending', dismissed_at: null };
      unwrap(
        await sb.from('win_candidates').update(patch).eq('user_id', uid).eq('id', args.id),
        'Updating candidate'
      );
      return { id: args.id, status: patch.status };
    },
  },
];
