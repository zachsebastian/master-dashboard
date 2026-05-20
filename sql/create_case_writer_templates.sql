-- Case Writer: template storage
create table if not exists case_writer_templates (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users not null,
  name        text        not null,
  fields      jsonb       not null default '[]',
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table case_writer_templates enable row level security;

create policy "Users manage own case writer templates"
  on case_writer_templates for all
  using (auth.uid() = user_id);

-- Seed default templates for zach.sebastian@gmail.com
-- Run this block separately after creating the table.
do $$
declare _uid uuid;
begin
  select id into _uid from auth.users where email = 'zach.sebastian@gmail.com';
  if _uid is null then raise exception 'User not found'; end if;

  insert into case_writer_templates (user_id, name, fields, sort_order) values
  (
    _uid,
    'Bug Ticket',
    '[
      {"id":"bt_f1","label":"Name of Specific Client or System wide","type":"text"},
      {"id":"bt_f2","label":"Impact & Severity","type":"dropdown","options":["High","Medium","Low"]},
      {"id":"bt_f3","label":"Observed Behavior","type":"textarea"},
      {"id":"bt_f4","label":"Desired Behavior","type":"textarea"},
      {"id":"bt_f5","label":"Is there a work around","type":"text"},
      {"id":"bt_f6","label":"QA Successful Test Criteria","type":"numbered_list"},
      {"id":"bt_f7","label":"Related Zendesk #","type":"text"}
    ]'::jsonb,
    0
  ),
  (
    _uid,
    'Feature Enhancement',
    '[
      {"id":"fe_f1","label":"Summary","type":"textarea"},
      {"id":"fe_f2","label":"Problem Statement","type":"textarea"},
      {"id":"fe_f3","label":"Proposed Enhancement","type":"textarea"},
      {"id":"fe_f4","label":"Use Cases","type":"textarea"},
      {"id":"fe_f5","label":"Requested By","type":"text"}
    ]'::jsonb,
    1
  );
end $$;
