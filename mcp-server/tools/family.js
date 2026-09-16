// Family Tracker tools — life admin: to-dos, discussion topics, shopping,
// events & plans, renewals/refills/deadlines.
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

const SECTIONS = {
  tasks:    { table: 'fam_tasks',    done: 'completed', fields: ['text', 'category', 'person', 'due_date', 'notes', 'completed'] },
  topics:   { table: 'fam_topics',   done: 'resolved',  fields: ['text', 'with_whom', 'resolved', 'outcome'] },
  shopping: { table: 'fam_shopping', done: 'purchased', fields: ['item', 'store', 'category', 'note', 'purchased'] },
  events:   { table: 'fam_events',   done: null,        fields: ['title', 'event_date', 'event_time', 'logistics', 'cost', 'status', 'notes'] },
  renewals: { table: 'fam_renewals', done: 'completed', fields: ['name', 'category', 'due_date', 'frequency', 'notes', 'completed'] },
};

const today = () => new Date().toISOString().slice(0, 10);

export const tools = [
  {
    name: 'family_overview',
    description:
      'Family Tracker status: overdue items, everything dated in the next N days (to-dos, events, renewals), open discussion topics, and shopping-list counts by store. Best first call for "what\'s going on with the family stuff?".',
    schema: {
      days_ahead: z.number().int().min(1).max(90).optional().describe('Horizon for upcoming items (default 14)'),
    },
    handler: async (args, { sb, uid }) => {
      const horizon = new Date(Date.now() + (args.days_ahead ?? 14) * 86400000).toISOString().slice(0, 10);
      const t = today();
      const [tasks, topics, shopping, events, renewals] = await Promise.all([
        sb.from('fam_tasks').select('id, text, category, person, due_date').eq('user_id', uid).eq('completed', false),
        sb.from('fam_topics').select('id, text, with_whom').eq('user_id', uid).eq('resolved', false),
        sb.from('fam_shopping').select('id, item, store, category').eq('user_id', uid).eq('purchased', false),
        sb.from('fam_events').select('id, title, event_date, event_time, logistics, cost, status').eq('user_id', uid).not('status', 'in', '("declined","done")'),
        sb.from('fam_renewals').select('id, name, category, due_date, frequency').eq('user_id', uid).eq('completed', false),
      ]).then(rs => rs.map((r, i) => unwrap(r, `Loading family section ${i}`)));

      const dated = [
        ...tasks.filter(x => x.due_date).map(x => ({ section: 'tasks', id: x.id, label: x.text, date: x.due_date, detail: x.person || x.category })),
        ...events.filter(x => x.event_date).map(x => ({ section: 'events', id: x.id, label: x.title, date: x.event_date, detail: [x.event_time, x.logistics].filter(Boolean).join(' · ') || x.status })),
        ...renewals.map(x => ({ section: 'renewals', id: x.id, label: x.name, date: x.due_date, detail: x.frequency })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      const byStore = {};
      shopping.forEach(s => { byStore[s.store] = (byStore[s.store] || 0) + 1; });

      return {
        overdue: dated.filter(i => i.date < t),
        upcoming: dated.filter(i => i.date >= t && i.date <= horizon),
        undated_open_tasks: tasks.filter(x => !x.due_date),
        open_discussion_topics: topics,
        shopping: { total_items: shopping.length, by_store: byStore },
        counts: { open_tasks: tasks.length, open_topics: topics.length, shopping_items: shopping.length, active_events: events.length, active_renewals: renewals.length },
      };
    },
  },
  {
    name: 'family_list',
    description:
      'List Family Tracker items in one section: tasks (life-admin to-dos), topics (things to bring up with someone), shopping, events (plans/invites with logistics + cost), or renewals (licensures, med refills, subscription deadlines). Returns ids for use with family_update / family_delete.',
    schema: {
      section: z.enum(['tasks', 'topics', 'shopping', 'events', 'renewals']),
      include_done: z.boolean().optional().describe('Include completed/resolved/purchased items (default false)'),
    },
    handler: async (args, { sb, uid }) => {
      const s = SECTIONS[args.section];
      let q = sb.from(s.table).select('*').eq('user_id', uid).order('created_at');
      if (!args.include_done && s.done) q = q.eq(s.done, false);
      if (!args.include_done && args.section === 'events') q = q.not('status', 'in', '("declined","done")');
      return unwrap(await q, `Listing family ${args.section}`);
    },
  },
  {
    name: 'family_task_add',
    description: 'Add a family/life-admin to-do (e.g. "Schedule dentist for the kids", "Refill inhaler"). Categories: kids, pets, health, home, errands, admin, other.',
    schema: {
      text: z.string().min(1),
      category: z.enum(['kids', 'pets', 'health', 'home', 'errands', 'admin', 'other']).optional(),
      person: z.string().optional().describe('Who it\'s about or who\'s handling it'),
      due_date: z.string().optional().describe('YYYY-MM-DD'),
      notes: z.string().optional(),
    },
    handler: async (args, { sb, uid }) =>
      unwrap(await sb.from('fam_tasks').insert({ user_id: uid, ...args }).select().single(), 'Adding task'),
  },
  {
    name: 'family_topic_add',
    description: 'Add a discussion topic — something to remember to bring up with someone before it\'s forgotten (e.g. "Ask Bri about Magic night on 10/7").',
    schema: {
      text: z.string().min(1),
      with_whom: z.string().optional().describe('Who to discuss it with, e.g. "Bri"'),
    },
    handler: async (args, { sb, uid }) =>
      unwrap(await sb.from('fam_topics').insert({ user_id: uid, ...args }).select().single(), 'Adding topic'),
  },
  {
    name: 'family_shopping_add',
    description:
      'Add one or more items to the family shopping list. Stores: any, kroger, aldi, target, costco, amazon, other. Categories: grocery, pantry, baby, pet, household, other.',
    schema: {
      items: z.array(z.object({
        item: z.string().min(1),
        store: z.enum(['any', 'kroger', 'aldi', 'target', 'costco', 'amazon', 'other']).optional(),
        category: z.enum(['grocery', 'pantry', 'baby', 'pet', 'household', 'other']).optional(),
        note: z.string().optional(),
      })).min(1),
    },
    handler: async (args, { sb, uid }) =>
      unwrap(
        await sb.from('fam_shopping').insert(args.items.map(i => ({ user_id: uid, ...i }))).select(),
        'Adding shopping items'
      ),
  },
  {
    name: 'family_event_add',
    description:
      'Add a family event or plan (game, invite, weekend plan) with optional date, time, logistics (who\'s taking whom), cost, and status (idea, invited, deciding, confirmed, declined, done).',
    schema: {
      title: z.string().min(1),
      event_date: z.string().optional().describe('YYYY-MM-DD'),
      event_time: z.string().optional().describe('Free text, e.g. "6:30 PM"'),
      logistics: z.string().optional(),
      cost: z.number().optional(),
      status: z.enum(['idea', 'invited', 'deciding', 'confirmed', 'declined', 'done']).optional(),
      notes: z.string().optional(),
    },
    handler: async (args, { sb, uid }) =>
      unwrap(await sb.from('fam_events').insert({ user_id: uid, ...args }).select().single(), 'Adding event'),
  },
  {
    name: 'family_renewal_add',
    description:
      'Track a renewal, refill, or deadline (licensure like COBA, pet meds, prescription refills, subscriptions to cancel by a date). Frequency once/monthly/quarterly/annual; recurring ones advance to the next due date when marked done.',
    schema: {
      name: z.string().min(1),
      due_date: z.string().describe('YYYY-MM-DD'),
      category: z.enum(['license', 'subscription', 'medication', 'pet', 'other']).optional(),
      frequency: z.enum(['once', 'monthly', 'quarterly', 'annual']).optional(),
      notes: z.string().optional(),
    },
    handler: async (args, { sb, uid }) =>
      unwrap(await sb.from('fam_renewals').insert({ user_id: uid, ...args }).select().single(), 'Adding renewal'),
  },
  {
    name: 'family_update',
    description:
      'Update a Family Tracker item by section + id. Pass only the fields to change — e.g. {completed: true} to check off a task, {resolved: true, outcome: "..."} for a topic, {purchased: true} for shopping, {status: "confirmed"} for an event, or edit text/dates/notes. Use family_renewal_done to complete renewals so recurring due dates advance.',
    schema: {
      section: z.enum(['tasks', 'topics', 'shopping', 'events', 'renewals']),
      id: z.string().uuid(),
      patch: z.record(z.any()).describe('Fields to change'),
    },
    handler: async (args, { sb, uid }) => {
      const s = SECTIONS[args.section];
      const patch = {};
      for (const k of s.fields) if (args.patch[k] !== undefined) patch[k] = args.patch[k];
      if (!Object.keys(patch).length) {
        throw new Error(`Nothing to update. Allowed fields for ${args.section}: ${s.fields.join(', ')}.`);
      }
      if (args.section === 'tasks' && patch.completed !== undefined) {
        patch.completed_at = patch.completed ? new Date().toISOString() : null;
      }
      const rows = unwrap(
        await sb.from(s.table).update(patch).eq('user_id', uid).eq('id', args.id).select(),
        'Updating item'
      );
      if (!rows.length) throw new Error(`No ${args.section} item with id '${args.id}'. Use family_list to see ids.`);
      return rows[0];
    },
  },
  {
    name: 'family_renewal_done',
    description:
      'Mark a renewal done. One-time renewals complete; recurring ones advance the due date by their frequency (monthly/quarterly/annual) and record last_done.',
    schema: { id: z.string().uuid() },
    handler: async (args, { sb, uid }) => {
      const rows = unwrap(
        await sb.from('fam_renewals').select('*').eq('user_id', uid).eq('id', args.id),
        'Loading renewal'
      );
      if (!rows.length) throw new Error(`No renewal with id '${args.id}'.`);
      const r = rows[0];
      let patch;
      if (r.frequency === 'once') {
        patch = { completed: true, last_done: today() };
      } else {
        const d = new Date(r.due_date + 'T00:00:00');
        d.setMonth(d.getMonth() + ({ monthly: 1, quarterly: 3, annual: 12 }[r.frequency] || 12));
        patch = {
          due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          last_done: today(),
        };
      }
      return unwrap(
        await sb.from('fam_renewals').update(patch).eq('user_id', uid).eq('id', args.id).select().single(),
        'Completing renewal'
      );
    },
  },
  {
    name: 'family_delete',
    description: 'Delete a Family Tracker item permanently by section + id.',
    schema: {
      section: z.enum(['tasks', 'topics', 'shopping', 'events', 'renewals']),
      id: z.string().uuid(),
    },
    handler: async (args, { sb, uid }) => {
      const s = SECTIONS[args.section];
      unwrap(await sb.from(s.table).delete().eq('user_id', uid).eq('id', args.id), 'Deleting item');
      return { deleted: args.id };
    },
  },
];
