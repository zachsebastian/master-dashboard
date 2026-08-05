// Links tools (link_cards → link_groups → link_items).
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

const ITEM_FIELDS = 'id, group_id, name, url, show_label, sort_order, click_count';

async function nextSortOrder(sb, uid, table, col, parentId) {
  const rows = unwrap(
    await sb
      .from(table)
      .select('sort_order')
      .eq('user_id', uid)
      .eq(col, parentId)
      .order('sort_order', { ascending: false })
      .limit(1),
    `Reading ${table}`
  );
  return rows.length ? rows[0].sort_order + 1 : 0;
}

export const tools = [
  {
    name: 'links_list',
    description:
      'List the Links page as a tree: cards → groups → link items (name, url, click count). Use the ids here for link_save / link_group_save.',
    schema: {},
    handler: async (_args, { sb, uid }) => {
      const [cards, groups, items] = await Promise.all([
        sb.from('link_cards').select('id, name, mode, sort_order').eq('user_id', uid).order('sort_order'),
        sb.from('link_groups').select('id, card_id, name, sort_order').eq('user_id', uid).order('sort_order'),
        sb.from('link_items').select(ITEM_FIELDS).eq('user_id', uid).order('sort_order'),
      ]);
      const c = unwrap(cards, 'Listing cards');
      const g = unwrap(groups, 'Listing groups');
      const i = unwrap(items, 'Listing links');
      return c.map((card) => ({
        ...card,
        groups: g
          .filter((x) => x.card_id === card.id)
          .map((grp) => ({ ...grp, links: i.filter((l) => l.group_id === grp.id) })),
      }));
    },
  },
  {
    name: 'link_save',
    description:
      'Create a link (omit id; group_id, name, url required) or update one (pass id).',
    schema: {
      id: z.string().uuid().optional(),
      group_id: z.string().uuid().optional().describe('required on create; pass to move a link'),
      name: z.string().optional(),
      url: z.string().optional(),
      show_label: z.boolean().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.group_id || !args.name || !args.url) {
          throw new Error('group_id, name, and url are required when creating a link.');
        }
        return unwrap(
          await sb
            .from('link_items')
            .insert({
              user_id: uid,
              group_id: args.group_id,
              name: args.name,
              url: args.url,
              show_label: args.show_label ?? true,
              sort_order: await nextSortOrder(sb, uid, 'link_items', 'group_id', args.group_id),
            })
            .select(ITEM_FIELDS)
            .single(),
          'Creating link'
        );
      }
      const patch = {};
      if (args.group_id !== undefined) patch.group_id = args.group_id;
      if (args.name !== undefined) patch.name = args.name;
      if (args.url !== undefined) patch.url = args.url;
      if (args.show_label !== undefined) patch.show_label = args.show_label;
      const rows = unwrap(
        await sb.from('link_items').update(patch).eq('user_id', uid).eq('id', args.id).select(ITEM_FIELDS),
        'Updating link'
      );
      if (!rows.length) throw new Error(`No link with id '${args.id}'. Use links_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'link_delete',
    description: 'Delete a link item by id.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      unwrap(
        await sb.from('link_items').delete().eq('user_id', uid).eq('id', args.id),
        'Deleting link'
      );
      return { deleted: args.id };
    },
  },
  {
    name: 'link_group_save',
    description:
      'Create a link group on a card (omit id; card_id and name required) or rename one (pass id).',
    schema: {
      id: z.string().uuid().optional(),
      card_id: z.string().uuid().optional().describe('required on create'),
      name: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      if (!args.id) {
        if (!args.card_id || !args.name) {
          throw new Error('card_id and name are required when creating a group.');
        }
        return unwrap(
          await sb
            .from('link_groups')
            .insert({
              user_id: uid,
              card_id: args.card_id,
              name: args.name,
              sort_order: await nextSortOrder(sb, uid, 'link_groups', 'card_id', args.card_id),
            })
            .select('id, card_id, name, sort_order')
            .single(),
          'Creating group'
        );
      }
      const patch = {};
      if (args.name !== undefined) patch.name = args.name;
      const rows = unwrap(
        await sb
          .from('link_groups')
          .update(patch)
          .eq('user_id', uid)
          .eq('id', args.id)
          .select('id, card_id, name, sort_order'),
        'Updating group'
      );
      if (!rows.length) throw new Error(`No link group with id '${args.id}'.`);
      return rows[0];
    },
  },
];
