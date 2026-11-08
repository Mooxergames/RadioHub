CREATE TABLE translation_language_archives (
  id text PRIMARY KEY,
  checksum text NOT NULL,
  snapshot jsonb NOT NULL,
  language_count integer NOT NULL,
  translation_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);
