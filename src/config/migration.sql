CREATE TABLE IF NOT EXISTS contacts (
  wa_id TEXT PRIMARY KEY,
  profile_name TEXT,
  stage TEXT,
  last_intent TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  wa_message_id TEXT PRIMARY KEY,              -- dedupe/idempotência forte
  wa_id TEXT NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  type TEXT NOT NULL,
  body TEXT,
  ts TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_status (
  id BIGSERIAL PRIMARY KEY,
  wa_message_id TEXT NOT NULL REFERENCES messages(wa_message_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  ts TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_state (
  wa_id TEXT PRIMARY KEY REFERENCES contacts(wa_id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);