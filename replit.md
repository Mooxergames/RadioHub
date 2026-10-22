# MegaRadio pnpm Workspace

## Current architecture

The application uses PostgreSQL exclusively. Node.js 24 and pnpm 11.28.1
build the Express 5 API and React 19.1/Vite frontend.

- `artifacts/api-server`: API, server-rendered SEO, jobs, SSE and WebSockets.
- `artifacts/megaradio`: Wouter, TanStack Query and Tailwind frontend.
- `lib/db`: PostgreSQL table definitions and SQL migrations.
- `lib/db-shared`: shared TypeScript and Zod contracts, safe for browser imports.
- `lib/seo-shared`: localized paths, SEO templates and structured-data helpers.

The retired application snapshot and offline database importer are no longer
distributed. Keep historical SQL migrations, payment provenance and public IDs
unchanged. Existing PostgreSQL data is authoritative.

## Running and verification

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/megaradio run test
PORT=22507 BASE_PATH=/ pnpm --filter @workspace/megaradio run build
PORT=22507 BASE_PATH=/ pnpm --filter @workspace/megaradio run dev
```

Configure `DATABASE_URL` for a deliberate development database. Production
credentials must not be used by local tests. Native integration tests require
an explicitly disposable `PG_TEST_DATABASE_URL`. API/web startup uses the
guarded PostgreSQL schema installer. Do not modify applied migration checksums
or clear existing write-authority and initialization evidence.

## Persistence and security

All catalog, account, session, billing, translation and operational writes use
the native stores in `artifacts/api-server/src/data`. Use parameterized SQL
and transactions. Preserve stable public text IDs and canonical station URLs.
Leader locks use the dedicated coordination pool and writes must remain on
the connection that owns the lock.

Redis is an optional cache; object storage holds media, not the application
database. Login audit events persist in the PostgreSQL `auth_event_logs`
table. Never log passwords, tokens or full JWTs. Account remediation uses
authenticated administration endpoints, not retired cleanup scripts.

## Caching and SEO

Keep lazy cache filling and single-flight coalescing for hot reads. Do not add
large eager boot warmups or restore cache-flush/forced-GC cycles tied to
ordinary RSS fluctuations. Respect the current memory limits in `index-api.ts`.

Reuse valid stale data for transient read failures. Real missing pages retain
404/410; unavailable pages and sitemaps without valid data return retryable
503/no-store. Never hide an outage behind a successful empty sitemap.

Station health, vote and synchronization writes are not editorial changes.
Do not publish their timestamps as sitemap `lastmod` or `Last-Modified`.
Retain body-derived ETags and 304 behavior. Existing language sitemap routes
remain active; the two 10-URL English pilots are separate measurement cohorts.
A discovered URL is not proof of Google indexing.

## Frontend and routing

Preserve the lazy player, background audio, authentication, favorites,
localization and accessibility. Express 5 uses `/*path` wildcards and
`{:param}` optional parameters. Shared SEO cache loaders remain in
`artifacts/api-server/src/seo/load-database-mappings.ts`.

## Performance optimization landmines (DO NOT touch without re-reading this)

The following retrofits were investigated on 2026-05-12 and intentionally
**NOT** done because the risk-vs-benefit math is bad for this app:

- **`vite-plugin-pwa`**: `artifacts/megaradio/public/sw.js` is hand-tuned for
  iOS Safari background audio survival (the `KEEP_ALIVE` message channel
  driven by `src/hooks/useGlobalPlayer.tsx`), custom push-notification JSON
  payload handling, three notification action handlers (`play` / `favorite`
  / `explore`) that postMessage the running clients, and background sync to
  `/api/user/sync`. None of these are easy to express in Workbox without
  custom code, and the only real gain (precaching of hashed bundles) is
  already provided by the immutable `Cache-Control` we set on `/assets/*`
  + the existing cache-first fetch handler in `sw.js`. Migration would put
  the app's CORE feature (radio streaming on iOS Safari with the screen
  off) at risk for a marginal precaching win — DO NOT do it. If you
  absolutely must, only `injectManifest` mode wrapping the existing
  `sw.js` is acceptable; `generateSW` would silently drop the custom
  handlers above.
- **Custom `rollupOptions.output.manualChunks()`**: PARTIALLY IN USE as of
  2026-05-12. The ARRAY form (`manualChunks: { icons: ['lucide-react'] }`)
  is still forbidden — it bypasses tree-shaking and ballooned the icon
  chunk to 6 MB raw. The FUNCTION form (`manualChunks(id) { if
  (id.includes('lucide-react/dist/esm/icons/')) return 'icons-lucide' }`)
  IS now in `vite.config.ts` because it runs AFTER Rollup tree-shaking
  and only groups icons that are actually imported. This was added to
  cut PageSpeed mobile TBT (we previously shipped 50+ per-icon chunks
  of 2.5 KiB each that were eagerly modulepreloaded with the entry,
  costing 50+ HTTP round-trips on the critical chain). Do NOT extend
  the function to swallow general vendor packages — keep it scoped to
  confirmed-heavy split-victims like the lucide icon directory.
- **AdSense in Partytown**: AdSense (`pagead2.googlesyndication.com`) does
  NOT survive being moved into a Web Worker — it relies on synchronous DOM
  measuring, iframe creation, and anti-fraud signals that Partytown can't
  proxy. Microsoft Clarity and GA4 ARE moved to Partytown via
  `@builder.io/partytown` (see `vite.config.ts` + `index.html`); AdSense
  and the Google Cast SDK stay on the main thread.
