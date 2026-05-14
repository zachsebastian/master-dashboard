create table if not exists ai_summary_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  week_start    date not null,
  summary       text not null,
  generated_at  timestamptz default now()
);

create index if not exists ai_summary_history_user_week
  on ai_summary_history(user_id, week_start, generated_at desc);

alter table ai_summary_history enable row level security;

drop policy if exists "Users manage own ai_summary_history" on ai_summary_history;
create policy "Users manage own ai_summary_history"
  on ai_summary_history for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
