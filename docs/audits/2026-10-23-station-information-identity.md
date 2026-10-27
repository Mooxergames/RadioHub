# Retained Station Information Identity

## Scope

Continue review of the 2,237 station records left after the previous controlled
legacy-noindex repair. The fresh read-only evidence snapshot contains those
records and related endpoint/name/alias/explicit duplicate-target records. It is
an analysis subset, not permission to bypass the full-catalog live preview.

## Bounded Additional Evidence

- Delivery suffixes such as `(256Kbps AAC)` can differ on information pages
  sharing an exact primary HTTP endpoint. Programming names and channel
  numbers remain meaningful; known frequencies and location must agree.
- The same full registered homepage, normalized brand and positive country
  code can identify alternate delivery URLs for the same information page.
  Homepage path case, query strings and non-default ports remain significant.
  Aggregator/social homepages are not accepted as this evidence. Known city,
  state and frequency conflicts prevent consolidation.
- Mexican `XE...-AM` / `XH...-FM` identifiers may connect city/frequency writing
  variants only with the same primary HTTP URL, country and compatible known
  frequencies/HD services. Closed groups additionally need the same brand;
  a licence alone cannot establish which rebrand is current.
- Equivalent already-open targets may choose one stable canonical. Alternatives
  must also be mutually equivalent; transitive bridge matches remain rejected.

These are information-page decisions, not station merging, stream replacement,
country correction or content generation rules. IDs, audio URLs, translations,
favourites and metadata remain intact. No new noindex flags are set.

The Mexican regulator distinguishes broadcasting callsigns from programming
identity; retained historical programme names must not be treated as current:

- https://rpc.ift.org.mx/vrpc/pdfs/93815_250128234746_8620.pdf
- https://www.dof.gob.mx/2023/INE/CGext202307_07_ap_1.pdf

## Revalidation

The compact native identity projection includes homepage so a target homepage
change invalidates an old preview. City evidence covers every plausible target,
not only the initial winner. Apply retains the existing table lock, short
transaction deadline, snapshot fingerprint, atomic batches and durable receipts.
Manual exclusions, redirect chains, ambiguous licence/HD/frequency relations,
native slug collisions and external strong identity edges remain protected.

The private review CSV column is now named
`verified_information_page_copy_target_slugs`; a homepage-based decision must
not be mislabeled as proof of equal primary audio endpoints.

## Local Verification

- 34 focused recovery tests passed.
- Full API suite: 2,842 passed, 9 existing skips, zero failures, with local PG17.
- Web: 2,311 passed across 153 files.
- Library, API and web types passed; API and web builds passed.
- Native PostgreSQL test verifies city loading, stale homepage rejection and
  preservation of source audio URL, homepage, translations and target row.

Production deployment and each applied repair still require separate observed
receipts. These checks do not assert that the remaining records are all fixed
or that Google will index an eligible station.
