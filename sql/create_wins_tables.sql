-- ── Wins Log Tables ──
-- Run this in your Supabase SQL editor.
-- After running, add the module to user_modules:
--   insert into user_modules (user_id, module, sort_order)
--   values ('<your-user-id>', 'wins-log', 99);

-- ── wins ── confirmed/logged wins
create table if not exists wins (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  summary     text        not null default '',
  category    text        not null default 'Delivery',  -- Customer Impact | Process Improvement | Delivery | Relationship
  source      text        not null default 'Manual',    -- Projects | Metrics | Today List | Case Writer | Manual
  source_ref  text,                                     -- optional: e.g. "Zions - May report"
  win_date    date        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table wins enable row level security;

create policy "Users can manage their own wins"
  on wins for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists wins_user_date_idx on wins (user_id, win_date desc);

-- ── win_candidates ── AI-surfaced suggestions (pending / confirmed / dismissed)
create table if not exists win_candidates (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  summary      text        not null default '',
  category     text        not null default 'Delivery',
  source       text        not null default 'Manual',
  source_ref   text,
  win_date     date,
  status       text        not null default 'pending',  -- pending | confirmed | dismissed
  dismissed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table win_candidates enable row level security;

create policy "Users can manage their own win candidates"
  on win_candidates for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists win_candidates_user_status_idx on win_candidates (user_id, status, created_at desc);
