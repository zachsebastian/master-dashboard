# Product Ideas Module — Design Spec
**Date:** 2026-06-12

## Purpose

A module for capturing improvement ideas across the products you work with. Not a Jira ticket writer and not a project tracker — a lightweight space to document "how can this product be better?" before ideas get formal enough to submit.

---

## Data Model

### `pi_products`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | references auth.users |
| `name` | text NOT NULL | product display name |
| `sort_order` | int NOT NULL DEFAULT 0 | user-defined order |
| `created_at` | timestamptz DEFAULT now() | |

RLS: users can only read/write their own rows.

### `pi_ideas`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | references auth.users |
| `product_id` | uuid FK | references pi_products(id) ON DELETE CASCADE |
| `title` | text NOT NULL | short one-liner |
| `description` | text | longer rationale/context |
| `source` | text NOT NULL DEFAULT 'self' | 'self' \| 'user_feedback' \| 'teammate' \| 'other' |
| `priority` | text NOT NULL DEFAULT 'medium' | 'low' \| 'medium' \| 'high' |
| `status` | text NOT NULL DEFAULT 'ideation' | 'ideation' \| 'scoping' \| 'submitted' |
| `sort_order` | int NOT NULL DEFAULT 0 | order within product |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

RLS: users can only read/write their own rows.

---

## Module Structure

```
product-ideas/
  index.html
  css/
    product-ideas.css
  js/
    app.js      — auth boot, toggleTheme, signOut, initModuleHeader
    state.js    — state vars, load/save functions, Supabase calls
    render.js   — all DOM rendering
```

Follows the same file layout as `case-writer/` and `today/`.

---

## Views

### Main view (default)
- Shared topbar via `initModuleHeader({ name: 'Product', subtitle: 'Ideas' })`
- Scrollable list of product accordion rows
- Global "Add idea" button (top-right) — opens the add modal with a product dropdown
- "Manage products" ghost button (top-right) — switches to Manage view

### Accordion rows
- Each product is one accordion row: chevron + name + idea count badge + per-product "Add" button
- Expanding reveals the ideas list for that product; multiple products can be open simultaneously (no forced single-expand behavior)
- Ideas display: title (flex-fill), source label, priority pill, status pill
- Clicking an idea row opens the Edit modal

### Add / Edit modal
Fields (in order):
1. **Title** — text input, required
2. **Description** — textarea, optional, min-height 80px
3. Bottom row (3 columns): **Source** select · **Priority** select · **Status** select

Modal header shows "New improvement idea" or "Edit idea" + the product name as a small tag beneath.
Footer: Cancel · Save idea (primary).

Delete is available in edit mode — a small text-only destructive button in the modal footer left side ("Delete idea"), no confirmation needed given the low stakes.

### Manage products view (view-swap, not modal)
Replaces the main view content (same pattern as Case Writer's template manager).
- List of products with Rename (inline edit on click) and Remove buttons
- Remove is blocked if the product has ideas — show a tooltip/note ("Remove ideas first")
- Add new product: text input + Add button at the bottom of the list
- "← Back" in the topbar left actions returns to the main view

---

## Dashboard card

Register as `product-ideas` in `dashboard/js/modules.js`:
- **Color accent:** Eucalyptus (`--eucalyptus` / `#5a7a6e`) — distinct from the green used by Project Tracker and the amber used by Today
- **Icon:** lightbulb SVG (line style, matches other module icons)
- **Stats:** total idea count (primary), submitted count (secondary)
- **Latest entries:** 3 most recent ideas — show title + product name as note

Must be added to the `ALL_MODULES` array and to the user's `user_modules` row in Supabase.

---

## Key behaviors

- **Empty state:** if no products exist yet, show a centered prompt ("Add your first product to get started") with an "Add product" button — skip the accordion entirely
- **Sorting:** products sort by `sort_order` then `created_at`; ideas within a product sort by `sort_order` then `created_at`
- **Source labels display:** `self` → "Self", `user_feedback` → "User feedback", `teammate` → "Teammate", `other` → "Other"
- **Status colors:** Ideation = sand/neutral · Scoping = eucalyptus · Submitted = deep-moss (done green)
- **Priority colors:** Low = sage/fern · Medium = amber · High = terracotta — matching existing design system pills

---

## SQL migration file

One file: `sql/create_product_ideas.sql` — creates both tables with RLS policies.
