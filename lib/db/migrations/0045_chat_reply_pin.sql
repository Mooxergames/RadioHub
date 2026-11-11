ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
CREATE INDEX IF NOT EXISTS direct_messages_reply_idx ON direct_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
