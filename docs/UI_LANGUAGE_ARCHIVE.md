# UI language archive

The published UI cohort contains 14 languages. The historical `SEO_LANGUAGES`
catalog remains available for URL recognition; it is not the list of languages
that background translation generation or cache warmup should process.

## Back up and archive

In Admin > Translations > Language Management, download the unused-language
backup first. It includes original language/translation IDs and timestamps,
shared key definitions for reference, and a SHA-256 checksum. Then use
"Archive unused languages". If the data changed since the download, the server
rejects the request and requires a fresh backup.

The transaction stores a second durable copy in `translation_language_archives`
before removing inactive rows from `translation_languages` and `translations`.
Shared keys, the 14 retained dictionaries, station broadcast languages, station
descriptions, country mappings and `url_translations` are not changed.
The archive is never loaded by public translation requests or background jobs.
Admin history reads only counts; snapshot data is read only for download/restore.

## Restore

Use "Restore archive" on the same admin page. Restoration preserves the original
IDs and timestamps, rejects conflicts instead of overwriting changes, and is
atomic. Shared translation key IDs/names must still match the backup. Repeating
a completed restore is rejected. Downloaded backups remain available separately.

Restoration recovers the stored data; it does not automatically expand the
14-language publication cohort. A future language rollout should review the UI
cohort, sitemap/SEO readiness and content quality separately.

Migration 0047 only creates the archive table. Deploying the code does not
automatically remove any production language records.
