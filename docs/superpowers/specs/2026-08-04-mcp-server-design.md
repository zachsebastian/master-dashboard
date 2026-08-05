# Master Dashboard MCP Server — Design

**Date:** 2026-08-04
**Status:** Approved (design), pending spec review

## Overview

A local Node.js MCP (Model Context Protocol) server that gives Claude read+write
access to every module of the Master Dashboard app through purpose-built tools.
It talks directly to the app's Supabase backend, authenticated as the user, so
Row Level Security scopes everything exactly as the web app does.

**Decisions made during brainstorming:**
- Scope: everything, read+write (full domain tool suite — one validated tool per operation)
- Clients: Claude Code + Claude Desktop via a local stdio server; architecture keeps a future hosted/claude.ai option open
- Auth: email + password sign-in as the user (no service-role key)

## Architecture

```
mcp-server/
  package.json          # deps: @modelcontextprotocol/sdk, @supabase/supabase-js
  index.js              # stdio bootstrap + tool registry
  lib/
    supabase.js         # client creation, sign-in, session refresh
    projects-blob.js    # safe read-modify-write helpers for dashboards.data
  tools/
    today.js
    projects.js
    digest.js
    wins.js
    rocks.js
    links.js
    ideas.js
    notes.js
    case-writer.js
    feedback.js
    metrics.js
    inventory.js
  test/
    smoke.js            # sign in, exercise every tool (see Testing)
  README.md             # setup for Claude Code and Claude Desktop
```

- Plain JavaScript (ESM), Node >= 18, no build step — matching the repo's ethos.
- `index.js` uses `McpServer` from `@modelcontextprotocol/sdk` over stdio.
  Each `tools/*.js` exports an array of tool definitions
  `{ name, description, inputSchema (zod), handler }`; `index.js` registers them all.
- Tool handlers receive an authenticated Supabase client and the user id.
- Tool results are compact JSON (`content: [{ type: 'text', text: JSON.stringify(...) }]`).

### Authentication

- Env vars: `DASH_EMAIL`, `DASH_PASSWORD` (plus optional `DASH_SUPABASE_URL`,
  `DASH_SUPABASE_ANON_KEY` overriding the defaults baked in from the app).
- On first tool call (lazy), `signInWithPassword`. The client is created with
  `auth: { persistSession: false, autoRefreshToken: true }`; if a request fails
  with 401/JWT-expired, re-login once and retry.
- Credentials live only in the MCP client config (Claude Code `.mcp.json` env
  block or Claude Desktop config). Never committed. `.mcp.json` uses
  `${DASH_EMAIL}`-style env expansion where supported; README documents both.

## Data model notes (from live schema)

- Most modules are normalized per-user tables with RLS:
  `today_items`, `weekly_reflections`, `ai_summary_history`, `wins`,
  `win_candidates`, `rocks`, `link_cards`/`link_groups`/`link_items`,
  `pi_products`/`pi_ideas`, `scratch_notes`, `case_writer_templates`/`tickets`,
  `feedback_entries`, `data_inventory` (global reference, PK `table_name`).
- **Projects is a JSONB blob**: `dashboards` (PK `user_id`) holds
  `data.projects[]` — each project has `id`, `name`, `color`, `status`
  (`in-progress` | `on-hold` | `completed`), `priority`, `completion`, `tags[]`,
  `dueDate`, `description`, `notes`, `nextSteps`, `rockId`, `blockers[]` (strings),
  `entries[]` (`{ id, date, completion, status, note, nextSteps }`), and
  `tasks[]` (`{ id, text, completedInEntry: entryId|null, completedDate? }`).
  Some users' rows also carry `data.metrics[]` (the Metrics module blob).
  IDs are short random strings (e.g. `'ute4l4a'`) — generate with the same
  base36 style.
- Completion is derived: `completion = round(tasks with completedInEntry / tasks * 100)`,
  and per-entry completion is recalculated from entry date order (mirror
  `projects/js/state.js` `loadStateFromSupabase`).

## Projects blob safety (`lib/projects-blob.js`)

Every project write is a surgical read-modify-write:

1. `SELECT data, updated_at FROM dashboards WHERE user_id = :uid`.
2. Apply the minimal mutation to the parsed blob (never replace whole blob from
   tool input; tools accept only scalar fields and patch them in).
3. Recalculate project/entry completion the same way the app does.
4. `UPDATE dashboards SET data = :new, updated_at = now() WHERE user_id = :uid
   AND updated_at = :read_updated_at` (optimistic concurrency).
5. If 0 rows updated (app wrote concurrently), re-fetch and retry once; if it
   fails again, return an error telling the user to retry.
6. Preserve unknown keys in the blob verbatim (`activeProject`, `view`,
   `sidebarOpen`, `metrics`, anything future).

## Tool catalog (37 tools)

Conventions: `*_list`/`*_get` read; `*_save` creates when `id` is omitted and
updates the given fields when `id` is present; `*_delete` removes by id.
All dates are `YYYY-MM-DD` strings. Every description tells Claude when to use
the tool and what it returns.

### Today List (`today_items`)
| Tool | Params | Notes |
|---|---|---|
| `today_list` | `date_from?`, `date_to?`, `completed?`, `on_hold?`, `limit?` | Defaults to today's items plus incomplete carry-overs (mirrors app view). Returns id, text, date, completed, on_hold, source, project link fields. |
| `today_save` | `id?`, `text?`, `item_date?`, `completed?`, `on_hold?`, `project_id?`, `project_name?` | Create manual item or patch fields. Setting `completed` stamps/uses `item_date` as the completion-date the app shows; linking a project sets `source_ref_id`/`source_ref_name`. |
| `today_delete` | `id` | |

### Projects (`dashboards.data.projects`)
| Tool | Params | Notes |
|---|---|---|
| `projects_list` | `status?` | Summaries: id, name, status, priority, completion, dueDate, tags, blocker count, task counts. |
| `projects_get` | `id` | Full project incl. tasks, entries, blockers, notes, nextSteps. |
| `project_save` | `id?`, `name?`, `status?`, `priority?`, `description?`, `notes?`, `next_steps?`, `due_date?`, `tags?`, `blockers?`, `rock_id?` | Create assigns id + next unused color. `blockers` replaces the string array when provided. |
| `project_delete` | `id` | |
| `project_task_save` | `project_id`, `task_id?`, `text?`, `completed_in_entry?`, `move_to_project_id?` | Completing a task links it to an entry id (or `null` to un-complete). |
| `project_task_delete` | `project_id`, `task_id` | |
| `project_entry_add` | `project_id`, `date?`, `note`, `next_steps?`, `status?`, `completed_task_ids?` | Adds a progress log entry; optionally marks tasks complete in it. Completion recalculated. |

### Weekly Digest
| Tool | Params | Notes |
|---|---|---|
| `digest_get` | `date_from?`, `date_to?` | Defaults to rolling last 7 days. Computes the same digest as the app: completed manual today-items, project entries in range (with their completed tasks, grouped rock info), metrics deltas, submitted Case Writer tickets, plus the week's reflection if any. Read-only aggregation. |
| `reflection_save` | `week_start`, `wins?`, `blockers?`, `carry_forwards?` | Upsert on (user, week_start). Does not touch `ai_summary`. |

### Wins Log (`wins`, `win_candidates`)
| Tool | Params | Notes |
|---|---|---|
| `wins_list` | `status?` (`wins` \| `pending` \| `dismissed` \| `all`) | |
| `win_save` | `id?`, `title?`, `summary?`, `category?`, `win_date?` | |
| `win_delete` | `id` | |
| `win_candidate_review` | `id`, `action` (`promote` \| `dismiss` \| `restore`) | Mirrors app behavior: promote inserts the candidate into `wins` and sets its status to `confirmed`; dismiss sets `dismissed` + `dismissed_at`; restore sets back to `pending`. |

### Rocks (`rocks`)
| Tool | Params | Notes |
|---|---|---|
| `rocks_list` | `include_archived?` | Returns the company → team → individual tree. |
| `rock_save` | `id?`, `name?`, `level?`, `parent_id?`, `best_result?`, `worst_result?`, `success_criteria?`, `resources?`, `archived?` | Text ids like the app generates. |
| `rock_delete` | `id` | Refuses if other rocks have it as `parent_id` (tell user to re-parent first). |

### Links (`link_cards`/`link_groups`/`link_items`)
| Tool | Params | Notes |
|---|---|---|
| `links_list` | — | Full tree: cards → groups → items (id, name, url, click_count). |
| `link_save` | `id?`, `group_id` (required on create), `name?`, `url?`, `show_label?` | |
| `link_delete` | `id` | |
| `link_group_save` | `id?`, `card_id` (required on create), `name?` | |

### Product Ideas (`pi_products`, `pi_ideas`)
| Tool | Params | Notes |
|---|---|---|
| `ideas_list` | `product_id?`, `status?`, `include_archived?` | Products with nested ideas. |
| `idea_save` | `id?`, `product_id?`, `title?`, `description?`, `source?`, `priority?`, `status?`, `jira_ticket?`, `dev_submitted?`, `archived?` | Enums validated against the DB check constraints. |
| `idea_delete` | `id` | |
| `product_save` | `id?`, `name?` | |

### Scratchpad (`scratch_notes`)
| Tool | Params | Notes |
|---|---|---|
| `notes_list` | `pinned?`, `reviewed?`, `module?` | |
| `note_save` | `id?`, `text?`, `pinned?`, `reviewed?`, `reviewed_note?`, `module?` | |
| `note_delete` | `id` | |

### Case Writer (`case_writer_tickets`, read-only templates)
| Tool | Params | Notes |
|---|---|---|
| `tickets_list` | `completed?`, `prioritized_only?` | Includes template name, jira_ticket, priority, submitted_at. Omits bulky `content_html` unless `include_content: true`. |
| `ticket_save` | `id`, `title?`, `jira_ticket?`, `completed?`, `priority?` | Metadata only — authoring stays in the app. |

### Feedback (`feedback_entries`)
| Tool | Params | Notes |
|---|---|---|
| `feedback_list` | `sentiment?`, `date_from?`, `date_to?` | |
| `feedback_save` | `id?`, `subject?`, `note?`, `sentiment?`, `entry_date?` | |
| `feedback_delete` | `id` | |

### Read-only reference
| Tool | Params | Notes |
|---|---|---|
| `metrics_get` | — | Returns the metrics blob(s) (from `dashboards.data.metrics` and/or the `metrics` table row). Read-only: the blob's shape is app-owned. |
| `data_inventory_list` | — | The table-by-table description of what's stored and why. |

## Out of scope (deliberate)

- Quotes, dashboard backgrounds, theme/preferences, icon library, link
  settings/layout (grid spans, zoom) — app-native visual concerns.
- Admin/user management, impersonation, profiles — should stay human-driven in
  the app.
- Case Writer draft/template authoring and AI summary generation — app workflows
  that depend on in-app editors and the user's stored Anthropic key.
- Metrics writes — single complex JSONB blob owned by the app; read-only here.

## Error handling

- Missing/wrong credentials → tool error with a clear "check DASH_EMAIL /
  DASH_PASSWORD in your MCP config" message.
- Unknown ids → error naming the id and the tool to list valid ones.
- Projects blob concurrency conflict → one automatic retry, then explicit error.
- Enum/param validation happens in zod schemas before any network call.
- All errors returned as MCP tool errors (`isError: true`), never thrown crashes;
  the server process stays alive.

## Testing

- `test/smoke.js` (run with `node --test` or plain node): signs in with env
  credentials, then:
  - runs every `*_list`/`*_get` tool and asserts well-formed output;
  - for each writable module, creates a clearly-marked record
    (`[MCP-TEST] ...`), updates it, and deletes it — never touching existing data;
  - for projects, creates a throwaway project, adds/completes a task, adds an
    entry, verifies completion math, then deletes the project and verifies the
    rest of the blob is byte-identical.
- Manual check with `npx @modelcontextprotocol/inspector` documented in README.

## Client setup (deliverables in README)

- **Claude Code:** project-level `.mcp.json` entry running
  `node mcp-server/index.js` with env placeholders; or a
  `claude mcp add master-dashboard --scope user -e DASH_EMAIL=... -e DASH_PASSWORD=... -- node <abs path>/mcp-server/index.js`
  one-liner.
- **Claude Desktop:** `claude_desktop_config.json` snippet with the same command
  and env block.
- Future (not built now): wrap the same `tools/*` modules in an HTTP transport
  and deploy to Vercel for claude.ai — the tool layer is transport-agnostic.

## Addendum (2026-08-04): Hosted custom connector

Built and deployed the remote-connector option the same day, per user request:

- Same 37 tools served over Streamable HTTP at
  `https://master-dashboard-lyart.vercel.app/api/mcp` (stateless, one
  transport per request), deployed as Vercel functions alongside the static
  app. Tool wiring extracted to `mcp-server/lib/registry.js`, shared by the
  stdio server and the HTTP endpoint.
- OAuth 2.1 in `/api/oauth/*`: RFC 8414 + RFC 9728 metadata (via vercel.json
  rewrites of `/.well-known/*`), stateless dynamic client registration
  (redirect URIs restricted to claude.ai/claude.com/localhost and encoded
  into the client_id), PKCE-required authorize and token endpoints.
- Stateless credentials: the Supabase session is the OAuth token pair — the
  access token is the user's RLS-scoped Supabase JWT; the refresh token and
  authorization codes are AES-256-GCM-sealed under the `MCP_SECRET` env var
  (set in Vercel, production + preview). No server-side storage.
- Sign-in page supports password and magic link; magic link requires
  allowlisting `/api/oauth/authorize` in Supabase Auth redirect URLs.
- Tests: `mcp-server/test/connector.js` covers metadata, registration
  allowlisting, authorize validation, PKCE success/failure/expiry, and the
  401 auth gate. Verified on a protected preview deployment, then promoted
  to production and re-verified on the live domain.
