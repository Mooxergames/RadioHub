-- radiohub:concurrent-index
-- Build without blocking catalog writes; retain existing raw-name indexes.
CREATE INDEX CONCURRENTLY stations_name_fold_trgm_idx ON stations USING gin (station_search_key(name) gin_trgm_ops);
