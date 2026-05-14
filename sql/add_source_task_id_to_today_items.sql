-- Link today_items back to the specific project task they were pulled from
alter table today_items add column if not exists source_task_id text;
