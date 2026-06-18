-- Rocks: shared, nested quarterly objectives (company > team > individual).
-- Replaces the flat rocks that lived inside the metrics JSON blob.
-- id is text (not uuid) so legacy rock ids (e.g. 'r1') survive migration and
-- existing metricRocks references keep resolving. New rocks use a uuid string.
CREATE TABLE rocks (
  id         text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  level      text        NOT NULL CHECK (level IN ('company','team','individual')),
  parent_id  text        REFERENCES rocks(id) ON DELETE CASCADE,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own rocks" ON rocks
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX rocks_user_idx   ON rocks (user_id);
CREATE INDEX rocks_parent_idx ON rocks (parent_id);
