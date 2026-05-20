-- Add Jira ticket number field to submitted tickets
alter table case_writer_tickets
  add column if not exists jira_ticket text not null default '';
