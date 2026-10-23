# Selected Description Repair

The separate selected workflow repairs missing or conclusively invalid fields
on reviewed excluded information pages. It does not expand the existing global
repair to historical exclusions, and it never changes a noindex decision.

## Scope and Payment Boundary

- Review accepts 1-100 distinct station IDs. It reads the complete catalog
  identity index, including indexable peers, redirects and retained aliases.
- Existing test-feed, provider-identity, country, manual and duplicate guards
  remain in force. Missing prose alone may be repaired; it never becomes
  evidence authorizing SEO recovery.
- The review returns exact selected IDs, blocked reasons, editable fields,
  protected locales and a bounded English source sample. It starts no model job.
- The explicit start action rechecks only the selected reviewed IDs. All 14
  station languages are fixed; country filters, locale subsets, offsets and
  global scopes are rejected. A matching active fill leader prevents overlap.
- A nominated English source authorizes exact-source-copy detection and an
  existing English pivot. This is a reviewer nomination, not a language detector
  or factual certification. Without it, Latin-script copies remain ambiguous.
- Metadata-only gaps can use retained localized prose without model calls.
  Valid text and locale extension fields are retained. Existing provider
  generation/translation validation, concurrency limits and cancellation apply.
- A missing source is generated only in a supported, unprotected selected
  target locale. An unsupported native language falls back to English or the
  next editable target before billing; protected source locales are never
  generated and then rejected by the native writer.

## Storage and Concurrency

Migration 0044 adds one nullable private `description_repair_journal` column.
It does not rewrite catalog rows or alter prior migrations. The first original
locale, its presence flag, acting administrator and job ID remain outside
public `stations.source` and `catalogShape`.

Every write compares the reviewed identity, complete manual flags and original
locale object inside PostgreSQL. It changes only that locale, the private
original journal and `updated_at`. Names, slugs, noindex, redirects, playback
health, list visibility, user references and captured source remain unchanged.
Short database lock/statement limits bound contention. Malformed journals,
changed identities and concurrent manual edits fail closed.

Global, locale and field-level manual protection blocks automatic replacement.
Unknown manual protection values are treated conservatively. Repeated repair
cannot replace the retained original. Uncertain job submissions are not
automatically retried; durable progress and completed fields remain readable.

## Publication

Content jobs do not clear noindex or submit indexing requests. Review saved
fields and translation checks after the job, then run a fresh explicit noindex
recovery review. Rebuild and verify the actual sitemap after those separate
eligible recoveries. None of these actions guarantees Google indexing.
