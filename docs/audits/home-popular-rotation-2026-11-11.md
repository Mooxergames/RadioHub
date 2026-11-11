# Home: popular recommendation rotation

- Ranking audit: PostgreSQL `/api/stations/popular` orders `is_featured DESC`, `show_in_global_popular DESC`, `votes DESC`, then `click_count DESC`. Country filtering happens before ranking. Clicks break vote ties; this is not a blended listening-time score.
- Mobile Home requests 20 instead of 12, using the existing country + limit query/disk cache. It renders four and advances a local country-specific deck once per focused visit. Global has its own deck. No new request or image prefetch is made by rotation.
- Twenty available results cover five visits before repeating; smaller catalogs use the available unique IDs. The deck cache is bounded to 32 scopes. A changed catalog resets its deck. Initial visit preserves API ranking.
- Pending first responses are selected after focus. Background refresh, player ticks and other renders do not change an already selected visit. Country changes hide the previous country's batch immediately.
- Tests: home-popular-rotation and home-query-performance pass, including 0 speculative requests before country hydration and 0 extra requests returning to a warm country. TypeScript diagnostics compared with the preceding Home performance baseline: no new diagnostics. No device FPS or live-server latency claim is made.

## Follow-up: restart and explicit refresh

Country/Global decks now persist through AsyncStorage (one local read per launch, serialized nonblocking writes). First-ever launch starts with the ranked first four; reopening continues the saved deck. Pull-to-refresh advances the visible four immediately from the cached pool while the existing refresh runs. Background data refresh still does not rotate cards. Restart continuity and country isolation tests pass; no new TypeScript diagnostics.

## Live Kral Pop priority check

Live public API and authenticated admin UI both confirmed KRAL POP `68a8c478bd66579311ab1760` had `isFeatured=true`, `showInGlobalPopular=true`, country `Unknown` (38 votes, 57 clicks). At the user's request both flags were disabled through the admin form. A subsequent direct station API read confirmed both false. No station deleted or country inferred. Home's rotation eligibility now rejects blank/Unknown country metadata even from existing disk/query cache; no network/logo probe was added. Eligibility tests cover missing values and real named countries.

## Global: four distinct countries

Home Global uses one cached, slim 80-candidate request and builds a 20-item country round-robin pool (API popularity order retained inside each bucket). This has a versioned query/disk key separate from ordinary popular lists. Rotation picks at most one station per normalized country, including aliases such as Iran/Islamic Republic Of Iran and Turkey/Türkiye; unavailable diversity is never filled with a duplicate country. Country-specific queries retain the same 20-item request and unrestricted local-country rotation. Existing persisted deck storage remains bounded.

Live mobile-preview API check: 80 candidates contain 18 distinct known countries after alias normalization. Tests exercise a 60-US-station skew, 30 successive diverse batches, aliases, sparse strict fallback, and exactly one initial Global request with zero additional warm-cache requests. No new TypeScript diagnostics.
