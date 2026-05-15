create table if not exists liked_quotes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  quote      text not null,
  author     text not null,
  liked_at   timestamptz not null default now(),
  unique (user_id, quote)
);

alter table liked_quotes enable row level security;

create policy "Users manage own liked quotes"
  on liked_quotes for all
  using (auth.uid() = user_id);
