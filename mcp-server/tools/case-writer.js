// Case Writer tools — ticket metadata only; authoring stays in the app.
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

const FIELDS =
  'id, title, template_name, jira_ticket, priority, completed, submitted_at';

export const tools = [
  {
    name: 'tickets_list',
    description:
      'List submitted Case Writer tickets (title, template, Jira ref, priority, completed). prioritized_only limits to tickets with a priority set. Pass include_content=true to also get the full HTML content.',
    schema: {
      completed: z.boolean().optional(),
      prioritized_only: z.boolean().optional(),
      include_content: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      const fields = args.include_content ? `${FIELDS}, content_html, field_values` : FIELDS;
      let q = sb
        .from('case_writer_tickets')
        .select(fields)
        .eq('user_id', uid)
        .order('submitted_at', { ascending: false });
      if (args.completed !== undefined) q = q.eq('completed', args.completed);
      if (args.prioritized_only) q = q.not('priority', 'is', null);
      return unwrap(await q, 'Listing tickets');
    },
  },
  {
    name: 'ticket_save',
    description:
      'Update a Case Writer ticket’s metadata: title, Jira ticket reference, priority (integer, lower = higher priority, null clears), or completed.',
    schema: {
      id: z.string().uuid(),
      title: z.string().optional(),
      jira_ticket: z.string().optional(),
      priority: z.number().int().nullable().optional(),
      completed: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      const patch = {};
      for (const k of ['title', 'jira_ticket', 'priority', 'completed']) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (!Object.keys(patch).length) throw new Error('Nothing to update.');
      const rows = unwrap(
        await sb
          .from('case_writer_tickets')
          .update(patch)
          .eq('user_id', uid)
          .eq('id', args.id)
          .select(FIELDS),
        'Updating ticket'
      );
      if (!rows.length) throw new Error(`No ticket with id '${args.id}'. Use tickets_list to see ids.`);
      return rows[0];
    },
  },
];
