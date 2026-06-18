# Rocks Hierarchy — Design Spec

**Date:** 2026-06-18
**Status:** Approved, building

## Problem

"Rocks" (quarterly objectives) currently live *inside the metrics module's JSON
blob* (`metrics.data.rocks` — a flat array of `{id, name}`, plus
`metrics.data.metricRocks` mapping each metric to one rock). They are flat (no
levels) and trapped in one module, so a project (which lives in the separate
`dashboards` blob) cannot reference them.

We need rocks to be a **shared, nested** entity that both projects and metrics
can point at, and to manage them in a dedicated place.

## Decisions (locked)

- **Levels:** `company`, `team`, `individual`. Build all three now.
- **Nesting:** strict + required. Company rocks are roots (`parent_id = null`).
  A team rock's parent must be a company rock. An individual rock's parent must
  be a team rock. No orphans below company level.
- **Rollup:** structural only — parents do **not** compute status from children.
- **Ownership:** personal (per-user). No org-wide sharing.
- **Storage:** normalized `rocks` table (one row per rock), matching the
  existing `pi_products`/`pi_ideas` pattern.
- **Project association:** a project links to **one team rock** (optional).
- **Metrics association:** a metric links to **one rock at any level**
  (optional).
- **Bubble display:** team rock **name only** (no company lineage in the pill).
- **Management home:** a new **Rock Management** module. The legacy "Manage
  Rocks" modal in metrics is removed; legacy rocks migrate into the new table.

## Data model

```sql
-- sql/create_rocks.sql
CREATE TABLE rocks (
  id         text        PRIMARY KEY,           -- preserves legacy ids; new rocks use a uuid string
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  level      text        NOT NULL CHECK (level IN ('company','team','individual')),
  parent_id  text        REFERENCES rocks(id) ON DELETE CASCADE,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own rocks" ON rocks
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX rocks_user_idx   ON rocks (user_id);
CREATE INDEX rocks_parent_idx ON rocks (parent_id);
```

`id` is `text` (not `uuid`) so legacy ids like `r1` survive the migration and
existing `metricRocks` references keep working. New rocks get
`crypto.randomUUID()`.

Level/parent integrity (e.g. a team's parent is actually a company rock) is
enforced in the app layer, not the DB — consistent with the rest of the codebase.

## Components

### Shared helper — `shared/js/rocks.js`
The single source of truth other modules use to read rocks.
- `loadRocks(sb, userId)` → array of rock rows.
- `buildRockTree(rocks)` → nested structure for editors/pickers.
- `rockById(rocks, id)` and `rockLineage(rocks, id)` → `[company, team, …]`.
- `teamRockOptionsHtml(rocks, selectedId)` → `<optgroup>` per company, team
  rocks as options (for the **project** picker).
- `anyRockOptionsHtml(rocks, selectedId)` → all levels, indented/grouped (for
  the **metrics** picker).
- `rockBubbleHtml(rocks, id)` → the read-only team-name pill, or '' if none.

### Rock Management module — `/rock-management/`
Files mirror `product-ideas/`: `index.html`, `css/rock-management.css`,
`js/state.js`, `js/render.js`, `js/app.js`. Uses `shared/js/banner.js` +
`shared/js/module-header.js` like other modules.

UI: a hierarchical editor. Company rocks as top-level rows; expand to team
rocks; expand to individual rocks. Per row: rename (inline), delete (cascades to
children via DB), add-child. Adding a team/individual rock requires a parent
(creation flows from the parent row, so the parent is implicit). Reparenting via
a "move" control (choose a new valid parent one level up). All writes go
straight to the `rocks` table.

Registered in `ALL_MODULES` (`dashboard/js/modules.js`) with `fetchStats`
returning counts per level. Granted to users through the existing admin module
toggles (a `user_modules` row — no migration needed).

### Project association
- Project gains optional `rockId` (string → `rocks.id`, must be a team rock) in
  the `dashboards` blob.
- The project editor (projects module) shows one dropdown built from
  `teamRockOptionsHtml`.
- `rockBubbleHtml` renders the read-only team-name pill wherever a project is
  listed/shown. Projects module loads rocks once on init to resolve names.

### Metrics association
- Replace legacy in-blob rocks with the shared store. The metric rock dropdown
  uses `anyRockOptionsHtml`. `state.metricRocks[metricId] = rockId` is retained
  (ids preserved through migration).
- Remove the "Manage Rocks" modal, `saveRocks`, `addRockRow`, `renderRocksModal`,
  and the 🪨 Rocks toolbar button from the metrics module.

### Weekly Digest
Completed project tasks group under their project's rock (team-name header),
with an **Uncategorized** bucket for projects that have no rock. Built on the
existing projects-with-`completedTasks` data the digest already loads; the
digest additionally loads rocks to resolve names.

## Migration of legacy rocks (runtime, one-time per user)
1. On Rock Management load (and lazily wherever rocks are first needed), if the
   user has rows in `rocks`, do nothing.
2. Otherwise, read the user's `metrics` blob. For each entry in
   `metrics.data.rocks`, insert a row into `rocks` with the **same id**,
   `level = 'company'`, `parent_id = null`.
3. After a successful copy, remove `rocks` from the metrics blob on its next
   save (keep `metricRocks` — its ids still resolve).

Idempotent: guarded by "does this user already have rocks rows".

## PWA / caching
Add the new module's files to `sw.js` `PRECACHE` and bump the cache version.
Add `/rock-management/` to `manifest.json` if module pages are listed there.

## Out of scope (future)
- Org-wide sharing / teams / membership.
- Rock status, progress, target dates, quarters.
- Computed rollups.
- Individual-rock references from projects/metrics (model supports it; no UI
  consumer yet beyond management).
