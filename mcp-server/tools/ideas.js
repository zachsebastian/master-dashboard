// Product Ideas tools (pi_products, pi_ideas).
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

const IDEA_FIELDS =
  'id, product_id, title, description, source, priority, status, jira_ticket, dev_submitted, archived, sort_order';

export const tools = [
  {
    name: 'ideas_list',
    description:
      'List product ideas grouped by product. Filter by product_id or status; archived ideas excluded unless include_archived=true.',
    schema: {
      product_id: z.string().uuid().optional(),
      status: z.enum(['ideation', 'scoping', 'submitted']).optional(),
      include_archived: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      const products = unwrap(
        await sb.from('pi_products').select('id, name, sort_order').eq('user_id', uid).order('sort_order'),
        'Listing products'
      );
      let q = sb.from('pi_ideas').select(IDEA_FIELDS).eq('user_id', uid).order('sort_order');
      if (args.product_id) q = q.eq('product_id', args.product_id);
      if (args.status) q = q.eq('status', args.status);
      if (!args.include_archived) q = q.eq('archived', false);
      const ideas = unwrap(await q, 'Listing ideas');
      return products.map((p) => ({
        ...p,
        ideas: ideas.filter((i) => i.product_id === p.id),
      }));
    },
  },
  {
    name: 'idea_save',
    description:
      'Create a product idea (omit id; product_id and title required) or update one (pass id). Set archived=true to archive.',
    schema: {
      id: z.string().uuid().optional(),
      product_id: z.string().uuid().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      source: z.enum(['self', 'user_feedback', 'teammate', 'other']).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      status: z.enum(['ideation', 'scoping', 'submitted']).optional(),
      jira_ticket: z.string().optional(),
      dev_submitted: z.boolean().optional(),
      archived: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.product_id || !args.title) {
          throw new Error('product_id and title are required when creating an idea.');
        }
        return unwrap(
          await sb
            .from('pi_ideas')
            .insert({
              user_id: uid,
              product_id: args.product_id,
              title: args.title,
              description: args.description ?? null,
              source: args.source ?? 'self',
              priority: args.priority ?? 'medium',
              status: args.status ?? 'ideation',
            })
            .select(IDEA_FIELDS)
            .single(),
          'Creating idea'
        );
      }
      const patch = { updated_at: new Date().toISOString() };
      for (const k of [
        'product_id', 'title', 'description', 'source', 'priority',
        'status', 'jira_ticket', 'dev_submitted', 'archived',
      ]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const rows = unwrap(
        await sb.from('pi_ideas').update(patch).eq('user_id', uid).eq('id', args.id).select(IDEA_FIELDS),
        'Updating idea'
      );
      if (!rows.length) throw new Error(`No idea with id '${args.id}'. Use ideas_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'idea_delete',
    description: 'Permanently delete a product idea (consider archived=true via idea_save instead).',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('pi_ideas').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting idea'
      );
      return { deleted: args.id };
    },
  },
  {
    name: 'product_save',
    description: 'Create a product for grouping ideas (omit id) or rename one (pass id).',
    schema: {
      id: z.string().uuid().optional(),
      name: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.name) throw new Error('name is required when creating a product.');
        return unwrap(
          await sb
            .from('pi_products')
            .insert({ user_id: uid, name: args.name })
            .select('id, name')
            .single(),
          'Creating product'
        );
      }
      if (args.name === undefined) throw new Error('Nothing to update — pass name.');
      const rows = unwrap(
        await sb
          .from('pi_products')
          .update({ name: args.name })
          .eq('user_id', uid)
          .eq('id', args.id)
          .select('id, name'),
        'Updating product'
      );
      if (!rows.length) throw new Error(`No product with id '${args.id}'.`);
      return rows[0];
    },
  },
];
