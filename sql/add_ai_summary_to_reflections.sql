-- Add AI summary storage to weekly_reflections
alter table weekly_reflections add column if not exists ai_summary text;
alter table weekly_reflections add column if not exists ai_generated_at timestamptz;
