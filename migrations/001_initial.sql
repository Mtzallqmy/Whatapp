CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  role TEXT NOT NULL DEFAULT 'user',
  daily_limit INTEGER NOT NULL DEFAULT 100,
  monthly_limit INTEGER,
  can_chat BOOLEAN NOT NULL DEFAULT TRUE,
  can_search BOOLEAN NOT NULL DEFAULT TRUE,
  can_images BOOLEAN NOT NULL DEFAULT TRUE,
  can_files BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS monthly_limit INTEGER;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_chat BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_search BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_images BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_files BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS ai_providers (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ai',
  name TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint TEXT NOT NULL DEFAULT '••••',
  base_url TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS key_hint TEXT NOT NULL DEFAULT '••••';
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS base_url TEXT;
UPDATE ai_providers SET category = 'search' WHERE type IN ('tavily', 'serper', 'brave');

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  requests INTEGER NOT NULL DEFAULT 0,
  searches INTEGER NOT NULL DEFAULT 0,
  images INTEGER NOT NULL DEFAULT 0,
  files INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS files INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
CREATE INDEX IF NOT EXISTS idx_conversation_user_created ON conversation_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  images INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('unauthorized_behavior', '"ignore"'::jsonb),
  ('unauthorized_message', '"هذه خدمة خاصة. تواصل مع المسؤول إذا كنت تحتاج صلاحية الاستخدام."'::jsonb),
  ('model_routes', '{"chat":{"providerId":"","model":""},"advanced":{"providerId":"","model":""},"vision":{"providerId":"","model":""},"search":{"providerId":"","model":""},"image":{"providerId":"","model":""},"searchProviderId":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
