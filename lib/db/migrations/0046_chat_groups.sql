CREATE TABLE IF NOT EXISTS chat_groups (
 id text PRIMARY KEY, name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
 avatar text, created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_group_members (
 group_id text NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
 status text NOT NULL DEFAULT 'invited' CHECK (status IN ('active','invited','left','declined')),
 joined_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS chat_group_members_user_idx ON chat_group_members(user_id,status);
CREATE TABLE IF NOT EXISTS chat_group_messages (
 id text PRIMARY KEY, group_id text NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 from_user_id text NOT NULL REFERENCES users(id), content text NOT NULL,
 message_type text NOT NULL DEFAULT 'text', image_url text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_group_messages_time_idx ON chat_group_messages(group_id,created_at,id);
