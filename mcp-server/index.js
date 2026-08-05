#!/usr/bin/env node
// Master Dashboard MCP server — local stdio transport.
// Signs into Supabase with DASH_EMAIL / DASH_PASSWORD from the environment.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getContext, resetAuth, isAuthError } from './lib/supabase.js';
import { buildServer, ALL_TOOLS } from './lib/registry.js';

const server = buildServer(getContext, {
  // Session may have expired mid-flight: re-login once and retry.
  onAuthError: async (err) => {
    if (!isAuthError(err)) return null;
    resetAuth();
    return getContext();
  },
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`master-dashboard MCP server ready (${ALL_TOOLS.length} tools)`);
