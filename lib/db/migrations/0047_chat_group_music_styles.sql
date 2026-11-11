ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}';
ALTER TABLE chat_groups ADD CONSTRAINT chat_groups_music_styles_check CHECK (
 cardinality(genres) <= 3 AND array_position(genres,NULL) IS NULL AND genres <@ ARRAY['pop','rock','jazz','electronic','classical','hip-hop','rnb','folk','turkish','world','ambient','latin']::text[]
);
