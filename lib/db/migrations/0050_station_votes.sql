-- Imported totals remain intact. Only newly accepted local votes increment them.
CREATE TABLE station_votes (
  station_id text NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id,user_id)
);
CREATE INDEX station_votes_user_idx ON station_votes(user_id);
-- Ratings historically added one vote. Preserve that identity without adding again.
INSERT INTO station_votes(station_id,user_id,created_at)
SELECT station_id,user_id,min(created_at) FROM station_ratings
WHERE user_id IS NOT NULL GROUP BY station_id,user_id ON CONFLICT DO NOTHING;
