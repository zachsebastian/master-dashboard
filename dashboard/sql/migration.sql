-- Add sort_order to user_modules so users can reorder their dashboard cards
alter table user_modules add column if not exists sort_order integer not null default 0;
