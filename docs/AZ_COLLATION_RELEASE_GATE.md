# A-Z Collation Release Gate

Scope: source/test preparation only. This document does not authorize production
DDL, deployment or merging. Release separately from unrelated SEO changes.

## Required Order

1. Obtain owner approval for the index operation, including lock/wait budget and
   recovery plan. Migration `0045_station_az_slug_c_index.sql` uses ordinary
   `CREATE INDEX IF NOT EXISTS`, which can block writes while building. It is
   not an approved zero-downtime/concurrent production procedure. The existing
   concurrent-index executor is unchanged and does not support this index.
   Startup applies pending ordinary migrations automatically, so deploying
   this branch is not a code-only operation and must not precede that approval.
2. Build the additive `stations_az_slug_c_id_idx` on the actual serving `stations`
   table, before deploying the new A-Z reader. Do not drop the existing slug
   index, change uniqueness, modify applied migrations or rewrite station data.
3. Verify the index using structured `pg_catalog` metadata in the serving
   schema. A same-name index and a successful `IF NOT EXISTS` are insufficient.
   Require live/valid/ready, ordinary btree, exactly the native text keys
   `(slug COLLATE pg_catalog."C", id)`, built-in `pg_catalog.text_ops`, both keys
   ascending/nulls-last, id's native column collation, no expression, predicate
   or included columns. This is also the serving reader's per-read preflight.
4. After explicit release approval, deploy and check Z/digit anchors, pagination,
   A/M regression, localized canonical/hreflang and retryable failure handling.
   Every A-Z bucket now uses binary slug order; membership of individual pages
   can change for letters other than Z. No default-disabled flag hides the fix.

## Serving Behavior

`readAzStationPage` accepts only the 27 exact keys, positive safe-integer page
and page size 1..60. Its private read-only transaction sets statement_timeout
to 4000ms, holds an ACCESS SHARE table lock, verifies the index, counts, then
reads rows only for an existing page. Invalid input does not acquire a client;
huge/beyond-last pages never execute an OFFSET query. Missing, wrong or
interrupted-build indexes throw retryable `AZ_INDEX_NOT_READY` before any
binary range/count/rows query when detected by preflight. Requests never create
an index and contain no deliberate fallback to unindexed binary scans or the
old locale-dependent query.

There is no process-level preflight memo to outlive a pool/schema/index change.
The existing A-Z public cache still coalesces misses and expires within 60s;
errors are not cached as empty success and flow to existing HTTP503/no-store/
Retry-After handling. Already cached successes can remain until their original
deadline.

**P2 operational condition: preflight is not atomic with subsequent query
planning.** ACCESS SHARE does not prevent `DROP INDEX CONCURRENTLY` from
committing indisvalid=false after preflight. A subsequent count/rows statement
could then be planned without the index. This source preparation does not
provide an unconditional no-unindexed-scan guarantee under concurrent DDL.
Before any index alter/drop/rebuild/invalidation operation, **stop admission of
new A-Z serving reads and drain all in-flight A-Z reads/transactions**. Keep
admission stopped throughout maintenance; resume only after the matching index
has been rebuilt as needed and its structured definition/live/valid/ready state
has been verified. A separately owner-reviewed maintenance plan must enforce
this ordering. Merely rechecking the index or requesting a concurrent build is
not a substitute for stopping and draining reads. No heavier serving lock or
new operational tooling is introduced here.

Count and rows retain READ COMMITTED semantics, not a repeatable-read snapshot
across concurrent catalog writes. Deep valid OFFSET and count still cost work;
4s limits are per statement, not a guaranteed end-to-end latency or pool wait
bound. No planner settings force an index, and no sort-free plan is promised.
Shared visibility, nullable no_index and catalogShape remain in use. The existing
post-pagination junk filter/count mismatch is intentionally unchanged.

## Verification

Focused tests: `postgres-az-station-store.test.ts`,
`postgres-az-station-store.integration.test.ts`, `seo-az-reader.test.ts`.
Native tests use only explicit `PG_TEST_DATABASE_URL` on literal loopback and a
fresh random schema; accepted databases are the repository's `radiohub_test`
or dedicated `az_c_test` / `az_icu_test`. They never use DATABASE_URL as opt-in.
The repository fixture's locale/provider/version is recorded, not assumed.
Separate PostgreSQL17 C/libc and en-US/ICU runs provide collation regression
evidence; PostgreSQL17 is not a product-version restriction. Nullable no_index
DDL, interrupted concurrent-index construction and all fixture writes occur
only in the disposable test schema. No production operation is part of tests.
