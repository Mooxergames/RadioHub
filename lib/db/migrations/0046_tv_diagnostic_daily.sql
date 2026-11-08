-- Opt-in TV event COUNTS only. No raw events, messages, stacks, URLs or identifiers.
CREATE TABLE IF NOT EXISTS tv_diagnostic_daily (
 day date NOT NULL DEFAULT current_date,
 platform text NOT NULL CHECK(platform IN ('tizen','webos')),
 app_version text NOT NULL CHECK(length(app_version)<=20),
 bundle_version text NOT NULL CHECK(length(bundle_version)<=64),
 event text NOT NULL CHECK(event IN ('startup_ready','startup_error','js_error','promise_error','react_error','catalog_error','playback_error','app_open','screen_view','playback_start','playback_pause')),
 code text NOT NULL CHECK(code IN ('startup_timeout','asset_load','syntax_error','type_error','reference_error','range_error','security_error','unknown_error','promise_rejected','render_error','http_error','network_error','request_timeout','media_aborted','media_network','media_decode','media_unsupported','playback_failed','none')),
 route text NOT NULL CHECK(route IN ('discover','search','radio-playing','settings','favorites','login','premium-upgrade','countries','genres','other')),
 module text NOT NULL CHECK(module IN ('main','audio','startup','vendor','api','unknown')),
 line_no integer NOT NULL DEFAULT 0 CHECK(line_no BETWEEN 0 AND 10000000),
 column_no integer NOT NULL DEFAULT 0 CHECK(column_no BETWEEN 0 AND 10000000),
 count integer NOT NULL DEFAULT 1 CHECK(count>0),
 PRIMARY KEY(day,platform,app_version,bundle_version,event,code,route,module,line_no,column_no)
);
CREATE INDEX IF NOT EXISTS tv_diagnostic_daily_day ON tv_diagnostic_daily(day DESC);
