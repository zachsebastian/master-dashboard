// Shared tool registry — used by the local stdio server (index.js) and the
// hosted Streamable HTTP endpoint (api/mcp.js). Transport-agnostic.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { tools as today } from '../tools/today.js';
import { tools as projects } from '../tools/projects.js';
import { tools as digest } from '../tools/digest.js';
import { tools as wins } from '../tools/wins.js';
import { tools as rocks } from '../tools/rocks.js';
import { tools as links } from '../tools/links.js';
import { tools as ideas } from '../tools/ideas.js';
import { tools as notes } from '../tools/notes.js';
import { tools as caseWriter } from '../tools/case-writer.js';
import { tools as feedback } from '../tools/feedback.js';
import { tools as reference } from '../tools/reference.js';

export const ALL_TOOLS = [
  ...today, ...projects, ...digest, ...wins, ...rocks, ...links,
  ...ideas, ...notes, ...caseWriter, ...feedback, ...reference,
];

// getCtx: async () => ({ sb, uid }) — called per tool invocation.
// onAuthError (optional): async () => fresh ctx; the tool call is retried once.
export function buildServer(getCtx, { onAuthError } = {}) {
  const server = new McpServer({
    name: 'master-dashboard',
    version: '0.1.0',
  });

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (args) => {
        try {
          const ctx = await getCtx();
          let result;
          try {
            result = await tool.handler(args ?? {}, ctx);
          } catch (err) {
            if (!onAuthError) throw err;
            const fresh = await onAuthError(err);
            if (!fresh) throw err;
            result = await tool.handler(args ?? {}, fresh);
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(result ?? null, null, 1) }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: ${err.message}` }],
          };
        }
      }
    );
  }
  return server;
}
