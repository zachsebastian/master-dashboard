# Master Dashboard — Rebuild Brief

## Goal
Refactor the current single `index.html` monolith into a proper multi-file
project structure with clean separation of concerns. The app should feel
like a real SaaS product, not a prototype.

---

## Live Production
- **URL**: https://master-dashboard-lyart.vercel.app
- **Repo**: `/Users/zach/Documents/GitHub/Local Projects - WIP/master-dashboard/`
- **Deployed via**: Vercel CLI (static site, no framework, no build step)
- **Vercel scope**: `zachsebastians-projects`
- **Deploy command**: `VERCEL_TOKEN=<your-token> ~/.npm-global/bin/vercel --prod --scope zachsebastians-projects --yes`

---

## Supabase
- **Project ID**: `gfxfedfxmipbgcvtpesx`
- **URL**: `https://gfxfedfxmipbgcvtpesx.supabase.co`
- **Anon key**: `sb_publishable_oauR1DwB9y9bldVhSDpFHQ_rRDNO0FX`
- **Auth**: Email + password (no magic links for regular users)
- **Admin auth**: `app_metadata.is_admin = true` set via Supabase dashboard

### Database Tables
```
profiles
  user_id       uuid PK (references auth.users.id)
  email         text
  first_name    text
  last_name     text
  is_admin      boolean default false
  updated_at    timestamptz

user_preferences
  user_id       uuid PK
  theme         text ('light' | 'dark')
  updated_at    timestamptz

user_modules
  user_id       uuid
  module        text ('projects' | 'metrics')
  (composite PK or unique constraint on user_id + module)
```

### RLS Policies (profiles)
- SELECT: own row OR is_admin = true in JWT app_metadata
- INSERT: own row only
- UPDATE: own row only

---

## Current File Structure
```
master-dashboard/
  index.html              ← main dashboard (monolith, ~700 lines)
  projects/
    index.html            ← Project Tracker app (~1750 lines)
  metrics/
    index.html            ← Metrics Dashboard app (~2900 lines)
  supabase/
    functions/
      impersonate/
        index.ts          ← Edge function: generates magic link OTP for impersonation
```

---

## Features Already Built (must survive the rebuild)

### Authentication
- Email + password sign in
- On first login (or missing name): blocking profile-completion screen
  (first name + last name required, stored in Supabase profiles table)
- Theme preference (light/dark) persisted to Supabase

### Main Dashboard (`index.html`)
- Topbar: brand name, user's full name, Admin button (admin only), Sign out
- Greeting: "Hey, [First Name]." 
- Module cards: SVG icon tile (color-coded per module) + name + description
  - Project Tracker: blue tile, clipboard-checkmark SVG icon
  - Metrics Dashboard: green tile, bar chart SVG icon
- Only shows modules the user has been granted access to
- If no modules: "No modules assigned. Contact your administrator."

### Admin Page (full-page view, toggled by "Admin" button in topbar)
- Accessible only to admin users
- Two sections:
  1. **Administrators** — read-only list, name + email + "You"/"Admin" badge
     No module toggles. No "Log in as."
  2. **Users** — module toggle badges (click to enable/disable) + "Log in as" button
     Toggling only affects `user_modules` table visibility — never deletes data.
     Admin cannot toggle their own modules.
- "← Dashboard" back button returns to main view

### Impersonation
- Admin clicks "Log in as [user]" → calls Supabase Edge Function `impersonate`
  which generates a magic link OTP for the target user
- Uses `verifyOtp({ token_hash, type: 'magiclink' })` to sign in as that user
- Admin session tokens stored in `sessionStorage` as `adminSession`
- Orange banner shown at top: "Viewing as [email] ← Return to my account"
- Banner persists when navigating into modules (fixed position, z-index 999)
- "Return to my account": calls `sb.auth.setSession()` with stored tokens,
  calls `onSignedIn()` directly — no page reload needed
- `_impersonating` flag blocks `onAuthStateChange` during session swaps

### Impersonation Banner on Module Pages
- Both `projects/index.html` and `metrics/index.html` have the banner
- Fixed position top, z-index 999
- `body.has-banner` class adds `padding-top: 38px` and shifts topbar sticky
  anchor to `top: 38px` so nothing overlaps
- "Return to my account" on module pages: restores admin session + `window.location.href = '/'`

---

## Design System (CSS Variables)
```css
/* Light mode */
--bg: #f5f4f0
--surface: #ffffff
--surface-2: #f0efe9
--surface-3: #e5e4dd
--border: rgba(0,0,0,0.07)
--border-md: rgba(0,0,0,0.12)
--text: #111111
--text-2: #555555
--text-3: #999999
--blue: #1d6fa8
--blue-bg: #e9f1fb
--green: #2a7d46
--green-bg: #e6f3ec
--red: #c0392b
--red-bg: #fbeae8
--r-sm: 6px
--r-lg: 14px

/* Dark mode overrides exist for all of the above */
```

---

## Key Technical Decisions / Gotchas
1. **`verifyOtp` for impersonation** must use `{ token_hash, type: 'magiclink' }` —
   NOT `{ token, type: 'email' }` (the latter expects raw OTP code, not hash)
2. **`_impersonating` flag** must block `onAuthStateChange` during all session swaps
   (both impersonate() and returnToAdmin()) to prevent race conditions
3. **Banner DOM order matters** on main dashboard: banner must come AFTER the topbar
   div in HTML or the sticky topbar will cover it
4. **`location.reload()` after setSession()** has a race condition with Supabase
   localStorage writes — use `onSignedIn(data.user)` directly instead
5. **Module toggling** only inserts/deletes rows in `user_modules` —
   underlying project/metrics data is completely untouched
6. **is_admin** is synced to profiles table on every admin login so the admin
   page can filter admins vs users without needing service role access

---

## What the Rebuild Should Achieve
The user wants to move away from a single monolithic `index.html` to a proper
project structure. Goals:
- Clean file/folder separation (JS, CSS, HTML separate)
- Shared components/utilities (auth, theme, impersonation banner) not duplicated
  across three files
- Maintainable codebase that can grow as more modules are added
- Same visual design and all existing features preserved exactly
- No framework required (keep it vanilla or lightweight) — user preference is
  to avoid over-engineering
- Still deployable as a static site on Vercel (no build step, or a simple one)

---

## User Preferences
- Does not want to be asked about optional design decisions — make the call
- Stop and ask before any Supabase SQL migrations (user runs those manually)
- Always commit + deploy after completing a feature
- Vercel deploy command is listed above
- User's email: zach@realwired.com
