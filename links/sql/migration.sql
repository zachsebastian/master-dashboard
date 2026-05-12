-- Links Home module migration
-- Run this in your Supabase SQL editor

-- Cards: top-level containers on the grid
create table if not exists link_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null default 'New Card',
  mode       text not null default 'list',    -- 'list' | 'icon-grid'
  col_span   int  not null default 1,
  row_span   int  not null default 1,
  sort_order int  not null default 0,
  created_at timestamptz default now()
);
alter table link_cards enable row level security;
create policy "Users manage own link_cards"
  on link_cards using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Groups: tabs/sub-cards within a card
create table if not exists link_groups (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid references link_cards(id) on delete cascade not null,
  user_id    uuid references auth.users not null,
  name       text not null default 'Links',
  sort_order int  not null default 0,
  created_at timestamptz default now()
);
alter table link_groups enable row level security;
create policy "Users manage own link_groups"
  on link_groups using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Items: individual bookmarks within a group
create table if not exists link_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references link_groups(id) on delete cascade not null,
  user_id    uuid references auth.users not null,
  name       text    not null default 'New Link',
  url        text    not null default 'https://',
  icon_url   text,
  show_label boolean not null default true,
  sort_order int     not null default 0,
  created_at timestamptz default now()
);
alter table link_items enable row level security;
create policy "Users manage own link_items"
  on link_items using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Icon library: reusable custom icons
create table if not exists link_icon_library (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null default '',
  icon_data  text not null,              -- base64 data URL
  created_at timestamptz default now()
);
alter table link_icon_library enable row level security;
create policy "Users manage own link_icon_library"
  on link_icon_library using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Click tracking: running tally of how often each link is used
alter table link_items add column if not exists click_count integer not null default 0;

-- RPC: atomic server-side increment (avoids stale local-state overwrites)
create or replace function increment_link_click(item_id uuid, uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update link_items
  set click_count = click_count + 1
  where id = item_id and user_id = uid;
$$;

-- Settings: per-user grid preferences
create table if not exists link_settings (
  user_id    uuid references auth.users primary key,
  grid_cols  int     not null default 4,
  zoom       numeric not null default 1.0,
  updated_at timestamptz default now()
);
alter table link_settings enable row level security;
create policy "Users manage own link_settings"
  on link_settings using (auth.uid() = user_id) with check (auth.uid() = user_id);
