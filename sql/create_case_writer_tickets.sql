-- Case Writer: submitted tickets
create table if not exists case_writer_tickets (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users not null,
  template_id   uuid        references case_writer_templates(id) on delete set null,
  template_name text        not null default '',
  title         text        not null default '',
  content_html  text        not null default '',
  field_values  jsonb       not null default '{}',
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table case_writer_tickets enable row level security;

create policy "Users manage own submitted tickets"
  on case_writer_tickets for all
  using (auth.uid() = user_id);
