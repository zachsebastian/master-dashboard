-- Product ideas: products list
CREATE TABLE pi_products (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pi_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own pi_products" ON pi_products
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Product ideas: ideas list
CREATE TABLE pi_ideas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES pi_products(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  source      text        NOT NULL DEFAULT 'self'
              CHECK (source IN ('self','user_feedback','teammate','other')),
  priority    text        NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low','medium','high')),
  status      text        NOT NULL DEFAULT 'ideation'
              CHECK (status IN ('ideation','scoping','submitted')),
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pi_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own pi_ideas" ON pi_ideas
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
