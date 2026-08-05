# Master Dashboard MCP Server

A local MCP server that gives Claude read+write access to every module of the
Master Dashboard: Today List, Projects, Weekly Digest, Wins Log, Rocks, Links,
Product Ideas, Scratchpad, Case Writer, Feedback, plus read-only Metrics and
Data Inventory. 37 tools total.

It signs into Supabase **as you** (email + password), so Row Level Security
scopes everything to your data — exactly like the web app.

## Setup

```bash
cd mcp-server
npm install
```

### Claude Code

```bash
claude mcp add master-dashboard --scope user \
  -e DASH_EMAIL=you@example.com \
  -e DASH_PASSWORD=your-password \
  -- node "/Users/zach/Documents/Claude Code Projects/Local Projects/master-dashboard/mcp-server/index.js"
```

Or copy `.mcp.json.example` to the repo root as `.mcp.json` and fill in your
credentials (that file is gitignored — never commit credentials).

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "master-dashboard": {
      "command": "node",
      "args": ["/Users/zach/Documents/Claude Code Projects/Local Projects/master-dashboard/mcp-server/index.js"],
      "env": {
        "DASH_EMAIL": "you@example.com",
        "DASH_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config.

### Optional env vars

| Var | Default |
|---|---|
| `DASH_SUPABASE_URL` | the app's Supabase project URL |
| `DASH_SUPABASE_ANON_KEY` | the app's publishable anon key |

## Tools

Naming convention per module: `*_list` / `*_get` read, `*_save` creates
(omit `id`) or updates (pass `id`), `*_delete` removes.

| Module | Tools |
|---|---|
| Today List | `today_list`, `today_save`, `today_delete` |
| Projects | `projects_list`, `projects_get`, `project_save`, `project_delete`, `project_task_save`, `project_task_delete`, `project_entry_add` |
| Weekly Digest | `digest_get`, `reflection_save` |
| Wins Log | `wins_list`, `win_save`, `win_delete`, `win_candidate_review` |
| Rocks | `rocks_list`, `rock_save`, `rock_delete` |
| Links | `links_list`, `link_save`, `link_delete`, `link_group_save` |
| Product Ideas | `ideas_list`, `idea_save`, `idea_delete`, `product_save` |
| Scratchpad | `notes_list`, `note_save`, `note_delete` |
| Case Writer | `tickets_list`, `ticket_save` |
| Feedback | `feedback_list`, `feedback_save`, `feedback_delete` |
| Reference | `metrics_get`, `data_inventory_list` (read-only) |

Notable behaviors, matching the web app:

- Completing a project-linked Today item writes a "Completed via Today List"
  log entry into the project and marks the task complete; un-completing
  reverses it. Linking a manual item to a project creates a task in that
  project.
- The entire Projects module lives in one JSONB document
  (`dashboards.data`). Every project write re-reads the blob, applies a
  surgical patch, recalculates completion percentages the app's way, and
  writes back with an optimistic-concurrency check — a concurrent save from
  an open dashboard tab aborts the write instead of clobbering it.

## Testing

```bash
node test/protocol.js                 # no credentials needed
DASH_EMAIL=... DASH_PASSWORD=... npm test
```

The smoke test only writes `[MCP-TEST]`-marked records it creates and deletes
itself, and verifies the projects blob is otherwise untouched.

## Future: hosted / claude.ai

The tool layer (`tools/*.js`) is transport-agnostic — to expose this on
claude.ai, wrap the same tool modules in a Streamable HTTP transport behind
auth and deploy (e.g. on Vercel). Not built yet.
