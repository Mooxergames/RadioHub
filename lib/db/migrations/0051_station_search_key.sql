-- Versioned immutable fold: matches stationSearchKey in station-search.ts.
-- Names stay unchanged; only matching ignores accents, spacing and punctuation.
CREATE FUNCTION station_search_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(replace(replace(translate(lower(normalize(COALESCE(value,''),NFKD)),
        'ıøłđ','iold'),'ß','ss'),'æ','ae'),'œ','oe'),
      U&'[\0300-\036f]','','g'),
    '[^[:alnum:]]','','g')
$$;
