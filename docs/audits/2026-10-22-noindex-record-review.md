# Record-Level Noindex Review

## Reconciled Scope

The immutable inventory contains 7,144 excluded station IDs, not 7,144 articles
or Google-indexed URLs. A fresh anonymous batch read resolved all 7,144 original
IDs and 3,558 additional potential name/slug peers. Sixteen canonical NRJ pages
had already been restored; the remaining stored flag count was 7,128.

The earlier inventory recorded 6,901 unknown legacy exclusions, 225 owned
automatic exclusions, 16 redirects and 2 manual exclusions. The historical
cleanup CSV matches 3,343 current inventory IDs. This supports reviewing those
specific historical actions; it does not establish a cause for every old flag.

## Confirmed Policy Defect

The old standalone detector considered every MP3/AAC/DAB/bitrate suffix, and
every occurrence of Remix, Phonk or Nonstop Music, sufficient proof of junk.
Those labels describe delivery or programming, not station identity or content
quality. NRJ's own Hits Remix page and Radio Record's own station list confirm
that affected programming names can identify real radio channels:

- https://www.nrj.fr/webradios/mur-des-radios/nrj-hits-remix
- https://www.radiorecord.ru/

Remove these standalone heuristics while preserving actual test-feed, empty
identity, manual, redirect and numeric-slug exclusions. Unknown historical
flags are never cleared implicitly. Actual duplicates still need catalog
identity evidence, not just a codec suffix.

## Controlled Repair and Evidence

The existing explicit preview/apply path may retire an owned obsolete
format/genre rule only after the same complete-content, provider identity,
manual-protection and full-catalog peer checks. The private journal retains the
entire prior rule. Its owned provenance is retired only on explicit apply.
Playback health, list visibility, IDs, URLs and article text remain unchanged.

Stacked format suffixes and separator spelling are now included in conservative
peer detection. Very long names/slugs require identity review before recovery.
These are recovery guards, not a new automatic content-quality/noindex policy.

The authenticated CSV download includes every currently excluded record, even
beyond the 100 selectable-candidate limit. It separates recorded provenance
from the first current repair guard, provides bounded peer IDs/slugs/noindex
state, and labels peer lists as truncated when applicable. Exact-name and
primary-stream matches to currently eligible targets are separate evidence,
not permission to merge or redirect. No private actor/journal or raw stream URL
is exposed. Downloads are private, abort on interruption and never apply edits.

Reconcile this current export to the original 7,144 IDs using station IDs, not
possibly spreadsheet-escaped names or slugs. English page URLs are exported
explicitly. A public metadata subset is not a substitute for the authenticated
whole-catalog endpoint/alias/manual check.

Candidate pages use a stable station-ID cursor and fresh reviewed snapshots.
Reviewers can defer a translation/identity case and still reach later eligible
records without clearing its flag. Paging cannot authorize IDs outside the
current preview. CSV downloads use the app's authenticated transport and reject
truncated bodies instead of saving a misleading partial report.

## Limits

This does not assert that all remaining noindex flags are correct, that all
articles are editorially original, or that Google will index an eligible URL.
Missing descriptions, uncertain identities and manually protected decisions
must remain separately visible in the record-level report. Valid duplicates
must not be turned into thousands of competing canonical pages merely to make
the noindex counter reach zero.
