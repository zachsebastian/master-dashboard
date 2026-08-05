// Read-only reference tools: Metrics blob and Data Inventory.
import { unwrap } from '../lib/supabase.js';

export const tools = [
  {
    name: 'metrics_get',
    description:
      'Read the Metrics module data (read-only): metric series with dated entries and values. The blob is app-owned, so there is no write tool.',
    schema: {},
    handler: async (_args, { sb, uid }) => {
      const dashRows = unwrap(
        await sb.from('dashboards').select('data').eq('user_id', uid),
        'Loading dashboards'
      );
      let metrics = [];
      for (const row of dashRows || []) {
        if (Array.isArray(row.data?.metrics)) metrics = metrics.concat(row.data.metrics);
      }
      const tableRows = unwrap(
        await sb.from('metrics').select('data, updated_at').eq('user_id', uid),
        'Loading metrics table'
      );
      for (const row of tableRows || []) {
        const d = row.data;
        if (Array.isArray(d?.metrics)) metrics = metrics.concat(d.metrics);
        else if (Array.isArray(d)) metrics = metrics.concat(d);
      }
      return metrics;
    },
  },
  {
    name: 'data_inventory_list',
    description:
      'Read the Data Inventory (read-only): a table-by-table description of what the app stores and why. Useful for understanding the data model.',
    schema: {},
    handler: async (_args, { sb }) => {
      return unwrap(
        await sb.from('data_inventory').select('table_name, contents, why_stored').order('table_name'),
        'Listing data inventory'
      );
    },
  },
];
