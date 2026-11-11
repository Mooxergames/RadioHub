-- Retain chronological tombstones for everyone; personal hiding stays viewer-specific.
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS hidden_for text[] NOT NULL DEFAULT '{}';
