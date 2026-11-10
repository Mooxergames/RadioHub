# Failed Indexing Follow-up: 10 November 2026

## Scope and Findings

All 179 URLs in the current failed "Crawled - currently not indexed"
validation sample were fetched again at 18:33-18:34 UTC. This is not an audit
of all 11,597 URLs in the issue, nor of its 11,418 pending URLs.

- 141 returned self-canonical 200 responses.
- 30 retired-language routes returned English representations whose canonical
  targets had the same station identity and main content.
- Eight historical routes used a single permanent redirect to the correct
  current station page. A correct redirect source is not an independent index
  target.
- No empty SSR main, unintended noindex or wrong-station canonical was found
  in this sample. All 1,020 JSON-LD blocks parsed.
- The current Google live test for the KBPI comparison page succeeded. Its
  historical index result still said crawled, currently not indexed. Current
  accessibility does not prove Google will index a page.

The description selector incorrectly treated any initial bracketed text as
an import marker. Two canonical pages in this sample lost their entire saved
English description: Free 99 and Def Leppard. A subsequent native read of the
sample's 134 surviving station IDs across 14 locales found two more affected
English descriptions: Double T 97.3 and Radio Couleur Chartreuse. This is a
confirmed defect, not proof of the sole site-wide indexing cause.

Publisher review rejected the old prose as-is. A separately guarded four-row
data correction is required before publishing the broader bracket-preserving
selector. Two stations have reviewed copies in all 14 supported locales; the
other two receive English-only corrections. Their IDs, streams and aliases
must remain unchanged. The latter corrections need per-locale manual flags
that survive provider sync.

## Cache Repair

The measured English station leaf is valid XML: 10,000 URLs and 31,108,898
uncompressed bytes, below Google's 50 MiB limit. Its existing JSON memory-cache
charge is 65,548,436 bytes, above the 8 MiB single-entry cap. Without Redis,
unconditional requests therefore cannot reuse this generated body.

The new station-leaf-only cache format uses asynchronous gzip/base64 under a
versioned key. The measured packed entry charges approximately 4,042,238 bytes
and fits the existing cap. HTTP XML, ETag, byte length, cache policy and sitemap
membership remain unchanged. The older plain/Redis path remains a fallback.
At most two compressions and two decompressions run at once in each process;
same-key work is coalesced. Corrupt entries are cache misses, not HTTP failures.

This removes confirmed avoidable regeneration. It does not establish a causal
link to historical 5xx responses, production RSS or Google's indexing choice.

## Release Order and Safety

1. Publish the bounded cache and catalog manual-locale protection with tests.
2. Recheck exact before-images, then apply the independently reviewed four-row
   data patch. The production preflight was rolled back; a separate read at
   19:13:41 UTC verified all four complete row hashes were unchanged.
3. Only then publish the description-selector correction.
4. Verify public HTML and request Google review for the corrected canonical
   pages. Report the actual validation result, not a promised indexing date.

Native PostgreSQL tests must cover dotted, locale and root set/unset writes,
preserve locked locale absence, allow other locales and explicit admin edits,
and prove protected-only writes produce no row update or counter changes.

Pre-release verification passed on Node 24: full API 5,454 passed, zero
failures, nine environment-specific skips; web 3,399 passed; shared/API/web
typechecks and both production builds passed. The independent review approved
the cache and writer release after these gates. Data commit remains conditional
on the deployed writer and the exact reviewed SQL hash
`19c38792d1fdbba88c58596f3198367a4afff03eaa9999869d73da42f168b219`.

## Eleven Remaining Gone URLs

All eleven historical 404-sample URLs still returned 410 in the fresh check.
They include a malformed concatenated genre path, two versions of a colorbar
test entry, a television service and ambiguous or unverified station identities.
No publisher-confirmed same-service replacement was established. They are not
repaired by this change. Do not manufacture a station, redirect to an unrelated
one or return a generic SEO article at an unrelated historical station URL.

## References

- https://developers.google.com/search/docs/crawling-indexing/301-redirects
- https://support.google.com/webmasters/answer/7440203?hl=tr
- Free 99 publisher profile: https://zeno.fm/radio/free99/
- Def Leppard provider profile: https://pcradio.app/radio/def-leppard-live-pcr-27q6knc/
- Double T publisher: https://lubbockradioadvertising.com/stations/
- Radio Couleur Chartreuse publisher: https://www.radiocc.fr/
