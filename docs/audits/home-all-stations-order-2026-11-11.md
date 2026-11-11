# Home All Stations ordering audit — 2026-11-11

Read-only audit; no ranking or UI changes.

Active mobile Home calls useStations({limit:21,country:countryForApi}). Global parameters are removed by the shared API interceptor. Server default sort is votes descending, click_count descending for ties, then URL-shaped favicon and stable ID. Featured/admin global-popular flags do not affect this endpoint. No duration, recent trend or personal affinity ranking is used here. All Stations detail requests 60 per page with the same default votes order. Home always requests 21 even though its tablet renderer allows 25.

Public API observation: Global returned 21 / 64,569 stations, descending votes. Of those 21, ten belong to the USA and one has Unknown country. France returned 21 / 3,009, all France, descending votes. These are time-specific observations, not fixed counts.

Home useStations inherits LONG_CACHE: staleTime seven days, refetchOnMount true (only refetches stale data, not every mount), no focus revalidation. Server cache is five minutes. This can keep a ranking stale far longer than the catalog detail (30 seconds).

Suggested follow-up: preserve authoritative popularity order in the complete catalog; for the bounded Home global teaser, apply country diversity and exclude unknown country, with explicit popularity semantics. If using a larger candidate pool, fetch it once and reuse it; no per-logo or audio probes. Give Home rankings a shorter scoped freshness period without changing every useStations consumer. Confirm country discovery versus exact leaderboard intent before applying diversification.

## Implemented follow-up

Home now uses a dedicated `useHomeStationCatalog` / `homeStationCatalogOptions` query. Global fetches at most100 candidates, a country at most60, in a single votes-desc compact (`slim=1`) request. The phone displays21 cards, tablet25. A country keeps server popularity order; Global uses the existing canonical-country round-robin helper. Unknown countries, duplicate IDs and missing/application-placeholder logos are excluded. Displayed-image load errors remove that URL and refill from the existing pool; rejection memory is bounded to128 URLs. No image preflight, decoder, per-country fan-out or per-logo requests are added. Complete catalog/search unchanged.

Cache freshness5minutes, retention24hours for immediate stale display,30minutes in-memory GC. Persisted original save time is respected by React Query; stale cache revalidates on mount/focus. Country/global keys are isolated; failed refresh retains prior data. Normal pull-to-refresh retains its existing explicit refetch.

Live public API sample (single parallel measurement, not a performance guarantee): old21-item global response578806bytes/0.877s; compact100-item global148578bytes/0.477s; compact60-item France94833bytes/0.469s. The new global response contained20 distinct countries before filtering. About74% less global JSON despite the larger pool.

Validation: new Home catalog behavioral/cache test passed; existing home-query-performance and popular-rotation suites passed; no new TypeScript diagnostics against the existing baseline. User retains final review sign-off.

Visual QA also found a nonempty favicon with a failed archived logo import (Egypt, HTTP404). Home rejects failed imports without a local replacement, rather than treating the stale URL as a valid logo. Final mobile screenshot: output/home-all-stations/mobile-final.png.
