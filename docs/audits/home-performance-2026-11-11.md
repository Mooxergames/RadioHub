# Home performance and loading audit

Scope: active mobile Home (`frontend/app/(tabs)/index.tsx`) and shared query/playback hooks it consumes. Layout and artwork were preserved.

## Findings and changes

- Removed Home's country-change effect that invalidated every cached country and then explicitly refetched four sections after 100ms. Country-dependent query keys now own refresh, preserving fresh country caches. This follows TanStack's query-key dependency model: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- Added optional enabled arguments to country queries. Home waits for stored country hydration instead of issuing speculative global requests. Pending local scope also displays skeletons rather than showing cached global cards briefly.
- Removed the unused community-favorites request from Home.
- Removed eager fetching of every displayed user's favorites. Pressing a user starts a targeted prefetch, sharing the destination profile's QueryClient request/cache.
- Removed redundant root-level station preloading; the mounted query owners already fetch and persist that data. Remote app-init behavior was not rewritten.
- Public profiles reuse their five-minute fresh memory cache on Home revisit.
- Popular query/disk keys include the requested limit. Station disk keys include the full request parameters, avoiding cross-screen limit/filter collisions.
- Pull-to-refresh uses current dependencies, guards concurrent pulls, skips authenticated history for guests, and resets in finally after settled requests.
- Home and useAudioPlayer subscribe to relevant player fields instead of the whole player store. Metadata/sleep-timer-only updates no longer independently trigger those subscriptions.
- Recent stations show the shared grid skeleton during initial local/server loading rather than flashing a false empty state. Existing station-image fallback, memory/disk image cache and artwork transitions are retained.
- Loading animations remain on the shared motion system; no independent per-card loop was added.

## Verification and limits

- QueryObserver regression: 0 requests before country restore, 4 for first country, 4 for a new country, 0 when revisiting a fresh country. These counts measure the four country-dependent query sections, not all Home network requests.
- Request-limit and disk-cache isolation verified; fresh profile list revisit does not refetch.
- Pointer-down favorites prefetch and immediate profile navigation share one request; warm press does not refetch.
- Shared loader, background/reduced-motion and actual web media toggle tests passed. Public-profile action wiring test passed without network mutations.
- Mobile TypeScript diagnostics remain at the pre-existing baseline; no new semantic errors.
- Browser Home top and lower sections inspected, with unchanged visual layout. Final review flags remain user-owned.
- No production-device FPS, heap or cold-start latency claim is made. The request/motion regressions were tested deterministically; native release performance still requires device profiling.
