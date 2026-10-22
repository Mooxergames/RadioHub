# English Austria/Turkey Indexing Pilot

Date: 2026-10-22. User authorized release after checks pass.

## Scope

- Retain the existing catalogue, locales, canonicals and necessary redirects.
- Stop advertising operational station writes as sitemap content updates.
- Correct SSR official-website anchors to use a validated homepage, not audio.
- Improve English copy for exactly 10 Austrian and 10 Turkish existing records.
- Share that copy between SSR metadata/body/hydration and the public detail API.
- Respect explicit administrator ownership of descriptions and homepage.
- Do not change station IDs, slugs, audio URLs, ratings, health or noindex policy.
- Make no production database writes or migrations for this editorial pilot.
- Retain the separately tested early module-load recovery from the Safari review.

The editorial layer is a small read-time projection with exact ID/slug/country
pins. Other locales are preserved. Explicit admin edits win over the reviewed
copy. Removing the projection rolls it back without rewriting stored articles.

## Cohorts

| Country | Existing English station slug |
| --- | --- |
| AT | `kronehit` |
| AT | `orf-radio-wien` |
| AT | `fm4-orf` |
| AT | `orf-hitradio-o3-hq` |
| AT | `o1-orf-hq` |
| AT | `orf-radio-niederosterreich-hq` |
| AT | `radio-vorarlberg` |
| AT | `orf-tirol-hq` |
| AT | `orf-radio-steiermark-hq` |
| AT | `orf-radio-karnten` |
| TR | `kral-fm` |
| TR | `virgin-radio-turkiye` |
| TR | `metro-fm` |
| TR | `power-pop` |
| TR | `ntv-radyo` |
| TR | `alem-fm` |
| TR | `a-haber` |
| TR | `radyo-fenomen` |
| TR | `radyo-seymen` |
| TR | `joy-turk-turkey` |

Reviewed English copy and its per-station primary-source URLs are in
`artifacts/api-server/src/seo/indexing-pilot.ts`. No unverified audience counts,
fixed programme times or claims of universally available playback were added.
HQ variants are explicitly identified as alternate-quality feeds, not different
editorial stations. No additional codec-duplicate pages were created.

## Discovery And Measurement

- `/sitemap-pilot-en-at.xml`: only surviving eligible reviewed AT identities.
- `/sitemap-pilot-en-tr.xml`: only surviving eligible reviewed TR identities.
- Both are referenced by the main and English sitemap indexes.
- Their small station reads are isolated from the main indexes: a failed pilot
  query returns uncached503 for that child, not an outage of the main index.
- Both files use body ETags and omit invented lastmod dates.
- Full existing station sitemaps stay available; this does not make Google
  forget previously discovered URLs or force it to redistribute crawl demand.

All 20 records passed the public pre-release check: direct200, self-canonical,
indexable, exact ID/slug/country, a direct anchor from the existing English
country hub, and sampled audio bytes. HLS streams were followed to an actual
media segment, not accepted just because a playlist returned200.

Evidence: `2026-10-22-pilot-baseline.json`. The repeatable bounded public checker
is `check-indexing-pilot.mjs`; `--after-release` additionally requires the new
copy and homepage in both SSR and the detail API. It retains no listener IDs or
temporary upstream advertising query parameters.

The complete GSC indexed-URL report dated October16 contains no pilot URL;
this is not a real-time0/20 indexing measurement. Direct URL inspections during
the October22 investigation reported the English Kronehit and KRAL FM URLs as
unknown. Existing German/Turkish variants had successful recorded crawls but
were not selected for indexing. A successful fetch is not an indexing decision.

## Validation

- Node24.22.0, used without changing the system Node or project lockfile.
- Shared-library, frontend and API TypeScript checks passed.
- Frontend: 146 test files, 2,228 tests passed.
- Backend: 151 focused tests across 10 relevant files passed, including 20 real
  SSR/detail-API delivery tests.
- The wider API suite was also run on the candidate and unchanged main under
  the same Node24 environment, without a configured test database. Candidate:
  2,466 tests, 2,341 passed, 95 failed, 6 cancelled, 24 skipped. Main: 2,410 tests,
  2,284 passed, 96 failed, 6 cancelled, 24 skipped. No new failing test labels
  were observed. These runs are not green and do not replace database-backed CI.
- GitHub's database-backed migration run failed: 604 tests, 581 passed,
  21 failed, 2 skipped. Its failing test/suite labels match the previous main
  run exactly. Migration application, idempotency and integration verification
  passed before that step. Failures include concurrent-index validation,
  migration/import contracts, runtime-state identity, profile fixtures and the
  existing SQL sitemap integration test. No existing safety check was disabled.
- Follow-up: PostgreSQL17.11 was started on loopback in a temporary directory,
  with an empty dedicated test database and no production connection. The SQL
  sitemap failure was a stale fixture: it created only English manifests while
  14 languages were qualified. Complete snapshots (empty for other locales)
  now satisfy the existing completeness gate; production behavior is unchanged.
  All 12 native sitemap/SSR/diagnostic tests pass locally, including a new test
  covering both 10-record pilot cohorts,304, and exclusion immediately after
  native visibility/noindex writes. This fixes one old test, not the other20
  migration failures; CI must still be rerun for the updated head.
- Production frontend and web-server bundles passed; API bundle checked before
  publication as well. Existing large frontend-chunk warnings remain.
- Diff whitespace checks passed.

## Release Status

- User saved the tested implementation as `305f5f09c` on `codex/design`.
- Final pilot/main-index failure isolation is in `dfddf25ed`.
- Both commits were pushed to `visiongoat/RadioHub` using the owner's signed-in
  GitHub Desktop session. The owner's original remote remains `origin`; the
  separate fork is retained as `fork`.
- Open review: https://github.com/visiongoat/RadioHub/pull/112
- Candidate CI: https://github.com/visiongoat/RadioHub/actions/runs/39794683912
- Prior main CI: https://github.com/visiongoat/RadioHub/actions/runs/38090036544
- Merge, deployment and public post-release verification have not happened.
  The original authorization was conditional on passing checks. The general
  database check remains red, so release is held pending repair or the user's
  explicit acceptance of those pre-existing failures. No live-success claim is
  made by the passing scoped checks.

After release, verify 20 public pages, both cohort XML files, conditional304,
the main/English indexes, a full station sitemap's removed false dates, and the
legacy Arabic PSY Trance redirect. Submit the two small files in Search Console
only after those public endpoints are verified. Record submission separately
from Google's later processing, crawling, indexing and index retention.

Use a 4-6 week observation window for those outcomes; it is not an indexing
deadline or guarantee. Do not expand the experiment just because a sitemap
submission or live URL test succeeds.
