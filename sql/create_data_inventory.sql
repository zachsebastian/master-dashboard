-- ── Data Inventory ──
-- Run this in your Supabase SQL editor.

-- ── Table: stores human-readable descriptions of each DB table ──
create table if not exists data_inventory (
  table_name  text        primary key,
  contents    text        not null default '',
  why_stored  text        not null default '',
  updated_at  timestamptz not null default now()
);

alter table data_inventory enable row level security;

-- Any authenticated user can read (it's app documentation)
-- Only admins can write (enforced via UI + policy)
create policy "Authenticated users can read data inventory"
  on data_inventory for select
  using (auth.uid() is not null);

create policy "Admins can modify data inventory"
  on data_inventory for all
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where user_id = auth.uid() and is_admin = true
    )
  );

-- ── RPC: returns all public-schema tables with their columns ──
-- Uses security definer so it can read information_schema regardless of RLS.
create or replace function get_public_schema()
returns json
language sql
security definer
stable
as $$
  select coalesce(json_agg(t order by t.table_name), '[]'::json)
  from (
    select
      c.table_name,
      json_agg(
        json_build_object(
          'name',     c.column_name,
          'type',     c.data_type,
          'nullable', c.is_nullable = 'YES'
        )
        order by c.ordinal_position
      ) as columns
    from information_schema.columns c
    where c.table_schema = 'public'
    group by c.table_name
  ) t
$$;
