-- ── Today List ──
create table if not exists today_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  text            text not null,
  completed       boolean not null default false,
  source          text not null default 'manual',  -- 'manual' | 'project'
  source_ref_id   text,                             -- project id if source='project' (short string, not uuid)
  source_ref_name text,                             -- project name for display
  sort_order      int not null default 0,
  item_date       date not null default current_date,
  created_at      timestamptz default now()
);
alter table today_items enable row level security;
create policy "Users manage own today_items"
  on today_items using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Weekly Digest reflections ──
create table if not exists weekly_reflections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  week_start      date not null,
  wins            text,
  blockers        text,
  carry_forwards  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (user_id, week_start)
);
alter table weekly_reflections enable row level security;
create policy "Users manage own weekly_reflections"
  on weekly_reflections using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Scratchpad notes ──
create table if not exists scratch_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  text       text not null,
  pinned     boolean not null default false,
  reviewed   boolean not null default false,
  created_at timestamptz default now()
);
alter table scratch_notes enable row level security;
create policy "Users manage own scratch_notes"
  on scratch_notes using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Anthropic API key on profiles (for Weekly Digest AI summary) ──
alter table profiles add column if not exists anthropic_api_key text;
