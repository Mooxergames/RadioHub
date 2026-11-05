# Safe station duplicate maintenance

## Admin workflow

In **Stations → Duplicates**, choose **Preview all candidate groups**. This scans
the entire catalogue, not the currently displayed page or search filters. Review
the eligible count and skipped reasons, then confirm **Merge eligible groups**.
The dedicated Duplicate Management page uses the same workflow.

Names/countries alone identify candidates, not proof of identical broadcasts.
Bulk merges require exact normalized identity, compatible country/city/state,
and a shared actual HTTP(S) stream endpoint. Query strings and protocols remain
significant. Ambiguous/changed/oversized groups stay separate for manual review.
This is an identity check, not a fresh live stream availability test.

## Reviewed manual merges

Both duplicate screens preview a selected primary and donor records before a
manual merge. **Keep Primary** retains the selected station, not necessarily the
highest-voted record. The primary must be indexable and have no existing redirect.
Names or streams that fail the automatic identity policy require a separate
explicit broadcast-identity confirmation; this does not relax automatic merging.

`POST /api/admin/stations/merge-preview` is admin-only and read-only. It accepts
2-50 distinct current catalog IDs and optional supported string field changes.
`POST /api/admin/stations/merge` requires the returned fingerprint, `confirm: true`,
and `confirmIdentityOverride: true` when indicated by the preview. Missing members
or identity/URL/manual-flag/visibility changes invalidate the review under row
locks with HTTP 409 before any writes. Hot votes/play counters do not invalidate
a preview and totals are recomputed from current locked records. The fingerprint
is optimistic concurrency control, not a signed authorization ticket.

Manual merges are synchronous. A lost response must not be blindly replayed:
refresh the records and obtain a new preview. The UI blocks duplicate submissions
and aborts stalled requests after 20 seconds. Manual transactions have a 2-second
statement timeout and 200-ms lock wait; automatic worker limits are unchanged.
Successful commit feedback and mutation locks do not wait for list refreshes;
the dedicated screen also bounds candidate reads and ignores superseded responses.

Post-commit cache errors do not turn a successful merge into HTTP 500. The response
includes the actual `deletedCount` and `cacheInvalidated`, which reports bounded
local cache-adapter attempts only, not an acknowledgement from every replica or
proof that a concurrent loader cannot refill an older entry. No CDN purge occurs.

## Deletion Is Not Merging

The dedicated duplicate screen removes a newly selected primary from deletion
selections and excludes all current primary IDs defensively. Group and global
deletion use a frozen selection and explicit confirmation; group deletion does
not include selected records from other groups. A changed primary invalidates
that confirmation. An uncertain response requires a fresh candidate scan.

Deleting records does **not** consolidate favorites, history or URL aliases.
Use a reviewed merge for verified duplicate broadcasts. A merge archive retains
original donor data but is not a complete one-click undo operation. Frequency
redirect previews display skipped-cluster counts and reasons even with zero
eligible clusters; neither redirects nor merges guarantee search indexing.

## Automatic operation

- PostgreSQL migrations `0030` and `0031` run through normal deployment startup.
- No additional required Railway variable or separate service.
- First automatic run is due 24 hours after the control row is created; daily
  thereafter. At most 100 stricter (shared raw URL) candidate groups per day.
- A persistent cursor rotates through candidates so skipped groups cannot
  permanently block later names.
- One API worker processes at most 10 groups per 15-second cycle across replicas.
  Soft cycle budget: 750 ms; statement timeout: 600 ms; lock wait: 50 ms.
  Busy event loop/pool yields. No stream requests, translation/AI calls or extra
  paid services. This still consumes a small amount of existing database/CPU.
- `DUPLICATE_MERGE_ENABLED=false` disables the worker and new bulk jobs;
  `BACKGROUND_JOBS_ENABLED=false` also disables it. Development is disabled.
- Repeated timeouts defer that group for review; a later daily run can reassess it.

## Preservation and recovery

Jobs, frozen preview member IDs and progress live in PostgreSQL. Closing the page
does not cancel a queued operation. Restarted workers resume committed progress.
Each group's merge and checkpoint commit together, with safe revalidation under
station row locks. A completed preview can only create one apply job.

The survivor retains protected/manual values. Missing translation fields are
filled, while conflicting donor content and full original records are archived
per losing station. Favorite, rating, playback and recommendation references are
transferred; conflicting reviews remain in the archive. Old slugs redirect to
the survivor in the requested language, and saved IDs/UUIDs resolve to it in
public APIs. Administrative update/delete targets are not silently redirected.

Merged provider UUIDs are excluded from reimport; the shared survivor stream URL
is **not** blacklisted. Explicit administrative URL bans retain their scope.
Public detail/list/similarity caches are invalidated after committed merge cycles.

Inspect `/api/admin/auto-merge-status` and `/api/admin/merge-jobs/:jobId` through
an authenticated admin session. These responses and the panel distinguish
completed, skipped and failed work; do not equate a candidate count with a count
of records that can safely be merged.

## Console fix shipped alongside this feature

The API serves packaged public fonts, manifest, favicon and Partytown files with
correct content types; missing files return honest 404s, never the SPA HTML.
Admin HTML omits public-only preload/runtime tags. Production debug logging and
credential-bearing auth diagnostics are removed; real warnings/errors remain.
Expired description jobs stop polling. Dead external logo sources can still
return 404s and fall back to placeholders. Browser-extension `contentscript.js`
warnings are not suppressed by this application.
