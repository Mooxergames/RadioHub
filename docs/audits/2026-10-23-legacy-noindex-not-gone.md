# Historical Noindex Is Not Removal Evidence

## Observed Failure

The full 2,237-address review returned 789 HTTP 410 responses before this repair.
The station renderer preserved a historical noindex information page only when
`lastCheckOk` was false. The same retained record with a positive or unknown
stream check could instead be marked junk and returned as permanently gone.

A stream-health result cannot establish that an information page was removed.
Unknown noindex provenance still requires identity review, but it must not be
silently promoted to permanent removal because audio worked.

## Bounded Repair

The information-page exception now applies independently of stream health.
The existing stored noindex remains unchanged, the page keeps noindex robots
and a self-canonical, and no hreflang variants are advertised. Neither sitemap
eligibility nor catalogue records, streams, translations or IDs are changed.

Explicit manual noindex decisions, retained redirects, numeric artefacts,
actual test feeds and empty identities retain their previous handling. A real
missing station stays 404; database read failures stay retryable. Persisted
aliases may lead to a retained historical information page but do not open it
for indexing. Historical repair destinations still require indexable targets.

## Verification Boundaries

Regression coverage exercises positive and unknown source health in all 14
locales, retained body text, robots, canonical and suppressed alternates, plus
persisted aliases and explicit manual exclusions. The number of live 410s
actually recovered must be measured after deployment, not inferred from the
789-address pre-release sample. This repair does not approve the outstanding
1,833 identity reviews or guarantee Google indexing.
