-- Feedback Log: private, self-contained feedback/grievances about people, teams,
-- or entities. Never surfaced in the digest or today list. Per-user, RLS own-rows.
CREATE TABLE feedback_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject    text        NOT NULL,                      -- free text: person/team/entity
  note       text        NOT NULL DEFAULT '',
  sentiment  text        NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative')),
  entry_date date        NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feedback_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own feedback_entries" ON feedback_entries
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX feedback_entries_user_idx ON feedback_entries (user_id);

-- One editable AI summary per target (person/group), regenerable over time.
CREATE TABLE feedback_summaries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target       text        NOT NULL,
  summary      text        NOT NULL DEFAULT '',
  generated_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target)
);
ALTER TABLE feedback_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own feedback_summaries" ON feedback_summaries
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
