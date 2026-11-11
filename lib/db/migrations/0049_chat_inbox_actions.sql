-- Per-user inbox preferences; no other participant's messages are removed.
CREATE TABLE IF NOT EXISTS chat_inbox_state (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('direct','group')),
 target_id text NOT NULL,
 archived boolean NOT NULL DEFAULT false,
 muted boolean NOT NULL DEFAULT false,
 marked_unread boolean NOT NULL DEFAULT false,
 deleted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,kind,target_id)
);
ALTER TABLE chat_group_members ADD COLUMN IF NOT EXISTS left_at timestamptz;

-- Existing departures predate left_at; expose no history beyond their last read.
UPDATE chat_group_members SET left_at=GREATEST(read_at,joined_at) WHERE status='left' AND left_at IS NULL;
