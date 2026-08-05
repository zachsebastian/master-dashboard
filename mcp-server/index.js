#!/usr/bin/env node
// Master Dashboard MCP server — stdio transport.
// Registers every module's tools and wraps them with auth + error handling.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getContext, resetAuth, isAuthError } from './lib/supabase.js';

import { tools as today } from './tools/today.js';
import { tools as projects } from './tools/projects.js';
import { tools as digest } from './tools/digest.js';
import { tools as wins } from './tools/wins.js';
import { tools as rocks } from './tools/rocks.js';
import { tools as links } from './tools/links.js';
import { tools as ideas } from './tools/ideas.js';
import { tools as notes } from './tools/notes.js';
import { tools as caseWriter } from './tools/case-writer.js';
import { tools as feedback } from './tools/feedback.js';
import { tools as reference } from './tools/reference.js';

const ALL_TOOLS = [
  ...today, ...projects, ...digest, ...wins, ...rocks, ...links,
  ...ideas, ...notes, ...caseWriter, ...feedback, ...reference,
];

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
        let ctx = await getContext();
        let result;
        try {
          result = await tool.handler(args ?? {}, ctx);
        } catch (err) {
          // Session may have expired mid-flight: re-login once and retry.
          if (!isAuthError(err)) throw err;
          resetAuth();
          ctx = await getContext();
          result = await tool.handler(args ?? {}, ctx);
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`master-dashboard MCP server ready (${ALL_TOOLS.length} tools)`);
