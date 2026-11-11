# Stored Noindex Inventory, 22 October 2026

## Scope and Evidence

The authenticated full-catalog CSV contains 66,382 station records. These are
station counts, not Google-indexed URL counts. One station can have multiple
localized URLs. The download parsed without CSV errors.

The initial 7,147 stored noindex flags fell to 7,144 after three explicitly
selected, journalled recoveries: Somoa, AH.FM and RMC Bluemoon. Their canonical
English URLs returned 200 with indexing permitted, appeared exactly once in
the English sitemaps, and received accepted Search Console indexing requests.
Acceptance does not mean Google has indexed them.

The subsequent 7,144-record inventory contains these mutually exclusive causes:

| Classification | Stations |
| --- | ---: |
| Legacy noindex without recorded provenance | 6,901 |
| Other owned automatic noindex | 225 |
| Existing redirects with noindex | 16 |
| Explicit manual noindex | 2 |

Historical April cleanup reports record 6,266 mark-noindex actions. This is
evidence of an earlier bulk cleanup, not proof that all current flags came
from that execution or that every flag is now incorrect.

4,900 records require additional review after excluding protected redirects
and manual decisions. Of these, 3,859 have complete full/meta presence in all
14 supported languages. Presence is not an editorial quality assessment or
proof of unique station identity.

## All-Excluded Duplicate Groups

Grouping the inventory by normalized station name and country found 237
all-excluded groups containing 533 records. Public batch responses resolved
all 533 records. The existing exact-name/country/shared-stream identity policy
accepted 19 groups, all NRJ stations. A shared name alone was not accepted.
This bounded review is not an exhaustive whole-catalog duplicate analysis.

Both provider sync and content cleanup could mark a duplicate without checking
whether its proposed canonical was itself indexable. This can perpetuate a
group in which every page is excluded. Require the unified indexability policy
for the target in both writers. Do not clear existing legacy flags implicitly.

## Guarded Repair

Extend the existing explicit preview/apply workflow to offer only the unsuffixed
canonical of a closed collision-counter group when:

- the canonical passes all existing provenance, manual, provider identity and
  complete-content guards;
- every peer remains noindex, nonredirecting, and unprotected by manual edits;
- exact names, countries and real shared endpoints pass the existing policy;
- known city/state metadata does not conflict;
- aliases, UUIDs, stream endpoints and slug families expose no outside peer;
- previewed peer evidence still matches under the existing bounded writer lock.

Keep every duplicate excluded and preserve all IDs, user references, articles,
audio endpoints, list visibility and health evidence. Record the selected
canonical's before state and duplicate IDs in the existing private journal.
No applied migration is modified, and no blanket noindex reset is introduced.

Read city evidence only for plausible closed groups. City is retained in source
JSON, not a native station column; decompressing the entire catalog's article
JSON during the writer lock would be unnecessary and unsafe.

Peer enumeration stops as soon as an oversized group is proven ineligible;
existence checks stop at the first peer. A 66,382-row synthetic worst-case slug
family reduced the local group scan from about 41 seconds to 38 milliseconds.
This is a CPU regression check, not a production database latency guarantee.

## Search Console Limits

The failed noindex cycle still contained 43 currently excluded URLs when checked.
The three recovered URLs were not those 43. Normal redirect exclusions are
expected for aliases whose destination is canonical. Do not report either
category as fixed just because other validations have started.

Six additional unsubmitted-URL categories were accepted for validation:
404, soft 404, alternate canonical, redirect error, duplicate without canonical,
and Google-selected different canonical. Existing ongoing validations were not
reset. These actions do not guarantee indexing or eliminate legitimate exclusions.
