# Nightly Station URL Stability

## Finding

The daily 03:30 Europe/Berlin `ScheduledJunkCleanup` runs
`runJunkCleanup` across the entire station catalogue. The routine previously
recomputed every published station slug from its name, then chose the first
available collision suffix. Deleting another record could therefore make an
older URL available to an unrelated surviving station on the next nightly run.

This is independent of new-station intake, stream refreshes and the explicit
admin slug-generation job. Pausing new-station imports does not stop this job.

The 24 October 2026 run changed 207 existing canonical slugs relative to the
post-deletion catalogue snapshot. Seventeen URLs belonging to the approved
1,832 deleted records consequently started serving other surviving records.
The catalogue stayed at 64,537 records; none of the deleted IDs returned.

This is a confirmed source of unnecessary canonical churn and URL identity
changes, not proof that it explains every Google indexing decision.

## Fix

- Preserve every nonempty published station slug during routine cleanup.
- Continue filling genuinely missing slugs.
- Guard missing-slug writes with the observed slug value so a concurrent
  assignment cannot be overwritten.
- Keep the existing provenance-aware noindex policy and duplicate-identity
  checks unchanged.
- Explicit admin URL migrations remain separate from nightly maintenance.

## Live Data Repair

The 207 prior published paths were restored using the retained post-deletion
snapshot. Before execution, all 207 current values matched the expected
accidental replacements, the nightly worker was inactive, and no external
canonical conflicts existed.

The atomic repair changed only native `slug` and `source.slug`. Row locks and
a content hash comparison confirmed every other field stayed unchanged,
excluding the normal native update timestamp. Station IDs, aliases, streams,
descriptions, health and noindex flags were not changed by this repair.

After readback:

- Catalogue: 64,537 records.
- Restored published paths: 207.
- Approved deleted IDs still present: 0.
- Complete 1,832-URL GET reconciliation: 1,829 gone responses and three valid
  exceptions (two alphabetical directories and one verified legacy alias).
- Transient 503 responses from the initial scan cleared on individual retry.

The separate approved 132-alias cleanup and its 125 retained station records
have independent backups and verification receipts. Operational snapshots,
guarded SQL, hashes and per-URL timestamps are kept outside Git in the task's
local evidence directory; no production credentials are included here.

## Verification

Three new regression cases reproduced the old URL-reassignment behavior
before the fix. The focused suite then passed all 17 tests, including missing
URL assignment, concurrent assignment guards and unchanged health recovery.

The complete API suite passed 2,851 tests with nine existing skips and zero
failures against a disposable local PostgreSQL database. API TypeScript checks
and both API/web server builds passed. Production deployment and regenerated
sitemap readback must also be verified before closing the release.

Search Console validation requests remain asynchronous. A passing HTTP check,
eligible sitemap or submitted validation is not a guarantee of Google indexing.
