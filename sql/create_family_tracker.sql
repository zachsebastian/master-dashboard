-- Family Tracker: life-admin dashboard. Per-user, RLS own-rows.
-- Applied 2026-09-16 via MCP migration `create_family_tracker`.

CREATE TABLE fam_tasks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text        NOT NULL,
  category   text        NOT NULL DEFAULT 'other' CHECK (category IN ('kids','pets','health','home','errands','admin','other')),
  person     text,
  due_date   date,
  notes      text,
  completed  boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fam_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own fam_tasks" ON fam_tasks
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX fam_tasks_user_idx ON fam_tasks (user_id);

CREATE TABLE fam_topics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text        NOT NULL,
  with_whom  text,
  resolved   boolean     NOT NULL DEFAULT false,
  outcome    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fam_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own fam_topics" ON fam_topics
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX fam_topics_user_idx ON fam_topics (user_id);

CREATE TABLE fam_shopping (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item       text        NOT NULL,
  store      text        NOT NULL DEFAULT 'any' CHECK (store IN ('any','kroger','aldi','target','costco','amazon','other')),
  category   text        NOT NULL DEFAULT 'grocery' CHECK (category IN ('grocery','pantry','baby','pet','household','other')),
  note       text,
  purchased  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fam_shopping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own fam_shopping" ON fam_shopping
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX fam_shopping_user_idx ON fam_shopping (user_id);

CREATE TABLE fam_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  event_date date,
  event_time text,
  logistics  text,
  cost       numeric,
  status     text        NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','invited','deciding','confirmed','declined','done')),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fam_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own fam_events" ON fam_events
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX fam_events_user_idx ON fam_events (user_id);

CREATE TABLE fam_renewals (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL DEFAULT 'other' CHECK (category IN ('license','subscription','medication','pet','other')),
  due_date   date        NOT NULL,
  frequency  text        NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','monthly','quarterly','annual')),
  notes      text,
  completed  boolean     NOT NULL DEFAULT false,
  last_done  date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fam_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own fam_renewals" ON fam_renewals
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX fam_renewals_user_idx ON fam_renewals (user_id);
