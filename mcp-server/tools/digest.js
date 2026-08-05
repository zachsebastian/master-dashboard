// Weekly Digest tools — digest_get mirrors digest/js/state.js loadDigestData.
import { z } from 'zod';
import { unwrap } from '../lib/supabase.js';

function defaultRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 6 * 86400000);
  const fmt = (d) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

export const tools = [
  {
    name: 'digest_get',
    description:
      'Compute the Weekly Digest for a date range (default: rolling last 7 days): completed manual today-items, project log entries with their completed tasks, metric changes, submitted Case Writer tickets, and the saved reflection for that week.',
    schema: {
      date_from: z.string().optional().describe('YYYY-MM-DD, default 6 days ago'),
      date_to: z.string().optional().describe('YYYY-MM-DD, default today'),
    },
    handler: async (args, { sb, uid }) => {
      const range = defaultRange();
      const start = args.date_from || range.start;
      const end = args.date_to || range.end;

      const todayItems = unwrap(
        await sb
          .from('today_items')
          .select('id, text, item_date, completed, source')
          .eq('user_id', uid)
          .eq('completed', true)
          .eq('source', 'manual')
          .gte('item_date', start)
          .lte('item_date', end)
          .order('item_date'),
        'Loading today items'
      );

      const dashRows = unwrap(
        await sb.from('dashboards').select('data').eq('user_id', uid),
        'Loading dashboards'
      );
      let allProjects = [];
      let allMetrics = [];
      for (const row of dashRows || []) {
        const blob = row.data || {};
        if (Array.isArray(blob.projects)) allProjects = allProjects.concat(blob.projects);
        if (Array.isArray(blob.metrics)) allMetrics = allMetrics.concat(blob.metrics);
      }

      const projects = allProjects
        .map((p) => {
          const allTasks = p.tasks || [];
          const entries = (p.entries || [])
            .filter((e) => e.date >= start && e.date <= end)
            .map((e) => ({
              date: e.date,
              note: e.note || '',
              nextSteps: e.nextSteps || '',
              completedTasks: allTasks
                .filter((t) => t.completedInEntry === e.id)
                .map((t) => t.text),
            }));
          if (!entries.length) return null;
          return {
            name: p.name,
            status: p.status,
            rockId: p.rockId || null,
            nextSteps: p.nextSteps || '',
            blockers: p.blockers || [],
            entries,
          };
        })
        .filter(Boolean);

      const metrics = allMetrics
        .map((m) => {
          const entries = (m.entries || []).filter((e) => e.date >= start && e.date <= end);
          if (!entries.length) return null;
          const prior = (m.entries || [])
            .filter((e) => e.date < start)
            .sort((a, b) => (a.date < b.date ? 1 : -1));
          return {
            name: m.name,
            entries,
            oldValue: prior.length ? prior[0].value : null,
            newValue: entries[entries.length - 1].value,
          };
        })
        .filter(Boolean);

      const caseTickets = unwrap(
        await sb
          .from('case_writer_tickets')
          .select('id, title, template_name, submitted_at, jira_ticket')
          .eq('user_id', uid)
          .gte('submitted_at', start + 'T00:00:00')
          .lte('submitted_at', end + 'T23:59:59')
          .order('submitted_at'),
        'Loading case tickets'
      );

      const reflection = unwrap(
        await sb
          .from('weekly_reflections')
          .select('week_start, wins, blockers, carry_forwards, ai_summary, ai_generated_at')
          .eq('user_id', uid)
          .eq('week_start', start)
          .maybeSingle(),
        'Loading reflection'
      );

      return {
        range: { start, end },
        todayItems,
        projects,
        metrics,
        caseTickets,
        reflection: reflection || null,
      };
    },
  },
  {
    name: 'reflection_save',
    description:
      "Save the weekly reflection (wins / blockers / carry-forwards) for a week. week_start must match the digest range start date. Only provided fields change; the AI summary is never touched.",
    schema: {
      week_start: z.string().describe('YYYY-MM-DD'),
      wins: z.string().optional(),
      blockers: z.string().optional(),
      carry_forwards: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      const existing = unwrap(
        await sb
          .from('weekly_reflections')
          .select('id, wins, blockers, carry_forwards')
          .eq('user_id', uid)
          .eq('week_start', args.week_start)
          .maybeSingle(),
        'Loading reflection'
      );
      const row = {
        user_id: uid,
        week_start: args.week_start,
        wins: args.wins ?? existing?.wins ?? '',
        blockers: args.blockers ?? existing?.blockers ?? '',
        carry_forwards: args.carry_forwards ?? existing?.carry_forwards ?? '',
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        return unwrap(
          await sb
            .from('weekly_reflections')
            .update(row)
            .eq('id', existing.id)
            .select('week_start, wins, blockers, carry_forwards')
            .single(),
          'Saving reflection'
        );
      }
      return unwrap(
        await sb
          .from('weekly_reflections')
          .insert(row)
          .select('week_start, wins, blockers, carry_forwards')
          .single(),
        'Saving reflection'
      );
    },
  },
];
