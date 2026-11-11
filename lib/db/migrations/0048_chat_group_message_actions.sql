ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS hidden_for text[] NOT NULL DEFAULT '{}';
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS chat_group_messages_pin_idx ON chat_group_messages(group_id,pinned_at DESC) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_group_messages_reply_idx ON chat_group_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
