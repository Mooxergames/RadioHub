# MegaRadio Bing Webmaster audit, 2026-10-26

## Scope and evidence

Property: `https://themegaradio.com/`. The account initially selected a different
property; no data or settings from that property were changed or attributed to
MegaRadio. This is a point-in-time audit, not a guarantee of indexing.

Evidence is retained locally under the task artifact directory
`bing-webmaster-20261026/`: accessibility snapshots, public HTML, structured HTTP
probes, XML parsing results and screenshots. Private session data and credentials
are not committed. Bing report data and current live responses are distinguished.

## Report baseline

| Report | Observed result |
| --- | --- |
| Search Performance, July 26-October 25 | 719 clicks; 49.7K impressions |
| Site Explorer | Indexed 25,061; Error 0; Warning 232; Excluded 1,987 |
| Site Explorer, HTTP403/5xx filter | No data available |
| Sitemaps | 44 known; 0 errors; 0 warnings |
| Master sitemap, last Bing crawl October 24 | Success; 883.9K discovered |
| Recommendations | 0 high; 2 moderate; 4 low; 6 errors on 5 pages |
| Backlinks | 6 referring domains; 26 referring pages; 9 anchor texts |
| Block URLs | 0 active; 0 expiring; 0 expired |
| Copyright removals | No notices found |
| robots.txt Tester for `/en`, Bingbot | Allowed; 0 syntax errors/warnings |
| IndexNow Insights | 7.9M submitted, 79.3K crawled, 37K indexed events |
| IndexNow latest sample classification | 639 redirects; 343 indexed; 5 content-quality; 2 not crawled; 1 discovered/not indexed |

The sitemap dashboard's 2.8M discovered figure aggregates overlapping sitemap
entries, including the old sitemap alias and language indexes. It is not a count
of distinct stations. IndexNow submissions and indexed events are not a cohort
conversion rate or today's total index size. Its accessible chart caption has
placeholder January 2022 dates, whereas the underlying date table starts April
29, 2026. The latest submission source shown was Cloudflare, with 1.1K URLs in
the preceding hour. No evidence justifies attributing all submissions to the
application sync or disabling Cloudflare protections.

## Confirmed technical defects and fixes

### 1. Slashless locale matching creates indexable phantom homepages

Live `/sso` and `/foo` returned HTTP200, index/follow, homepage content, and
canonicals `/en/sso` and `/en/foo`. `/en/sso` correctly returned404. Bing had
indexed `/sso` after a September26 crawl.

Cause: several SSR dispatch regexes used an optional slash after a two-letter
locale prefix. `/sso` could match `ss` + the translated about segment `o`.
The renderer then classified the real, unmatched path as home. Genre matchers
also accepted arbitrary suffixes without a path separator.

Fix: extract and test the existing translated matchers, require complete locale
and route segments, and let invented URLs reach the existing uncached404
fallback. Preserve real translated routes, directories, station identities,
private SPA flows, API endpoints, and legitimate redirects.

### 2. Double-encoded localized routes lead to empty noindex shells

Bing's two not-crawled samples were:

- `/zh/%25E7%2594%25B5%25E5%258F%25B0/laikos-87-6`
- `/ja/%25E3%2582%25B9%25E3%2583%2586%25E3%2583%25BC%25E3%2582%25B7%25E3%2583%25A7%25E3%2583%25B3/hasya-katta-official`

Both redirected to a lowercase, still double-encoded route, then returned a
generic HTTP200/noindex SPA shell without a radio canonical.

Fix: on GET/HEAD with a recognized locale, recover at most three encoding
layers of the *known static route segment only*, apply existing canonical
mapping, and serialize once. Never repeatedly decode a station slug, encoded
separator, malformed sequence, unknown route, API body, or auth payload.
Preserve the raw query. Tests cover Chinese/Japanese/Korean double and triple
encoding, a fixed-point final destination, and unrelated input boundaries.

### 3. Public community directory falls through to a noindex shell

The completed Bing scan flags `/en/users` as missing an H1. Its current first
HTTP response is200/noindex without a canonical, while the SPA metadata says
index/follow. The community directory is public; its API already limits rows
to public, active profiles. Its exact root and localized counterparts were
missing from web SSR eligibility. The renderer's existing users body also
fell back to the home H1.

The approved correction adds only the exact users root to SSR and uses a
community H1. It does not expose users descendants, private profiles, session
data or protected routes. Rendering the current generic community introduction
does not by itself establish editorial quality.

### 4. Additional route boundary and directive consistency findings

Independent Astra Ultra review reproduced `/en/station%2Freal-fm` matching as
a station path but rendering indexable home content. Route matching must not
turn an encoded separator inside a segment into a new path boundary. The
approved patch decodes segments independently, rejects invalid separators and
uses configured language/country prefixes instead of arbitrary two-letter
prefixes. The SPA fallback requires the same boundary checks: an initial
regression test showed `/zz/about` otherwise still returned200. Normal login,
profile, TV and activation paths and query tokens remain covered by tests.
Encoded locale/bare-root prefixes are rejected rather than interpreted
differently by the matcher and renderer. SPA fallback now parses the raw path
once, with a static lookup only for unprefixed translated roots. Tests cover
double/triple encoded separators returning404/noindex/no-store for GET/HEAD.

The review also reproduced an administrator metadata override with
`noIndex:true` changing the boolean but leaving HTML robots and hreflang
indexable. The approved renderer correction resolves the final restrictions
after quality checks and custom metadata, before caching. A false override
must never reopen a page excluded by existing quality/private-page policy.
Recommendations remains personalized, robots-blocked and noindex; its SPA
metadata must agree. Removing its robots rule is not approved.

**Open follow-up, not fixed by the renderer patch:** published language-specific
administrator overrides are not consistently applied to sitemap membership.
A one-line station XML filter was explicitly rejected in review. A complete
follow-up must handle bounded batch reads, affected language alternates,
`x-default`, pilot sitemaps, manifest membership and cached XML/304 validators
together. The audit did not establish how many live published overrides exist.

## Warnings that are not blanket indexing blockers

### Removed station

The sole noindex recommendation is
`/es/estacion/93-5-eagle-radio-the-true-alternative`.
Bing's index snapshot last crawled October23 and recorded noindex. A fresh Bing
Live URL test and independent HTTP requests both confirm410 Gone/noindex. This
is an intentionally removed record; restoring it or stripping its directive
would be incorrect. No production catalogue data was deleted in this audit.

### Image ALT notices

The recommendation samples are `/en`, `/de`, `/es`, `/fr`. Current raw HTML
has 11 images per page, zero missing alt attributes, and one intentionally empty
decorative hero alt. Rendered `/en` had59 images, zero missing alt attributes;
empty alts belong to decorative assets, controls already named by their
containers, and redundant branding. Bing's index card reported1 instance;
its successful live test reported30 instances and still said the URL can be
indexed. Do not replace valid decorative empty alt with keyword-stuffed text
just to suppress a generic SEO notice. This is not a demonstrated index ban.

### Content quality and authority

All five sampled quality URLs currently return200, index/follow, a matching
canonical, station-specific headings and visible body content:

- `/he/tachana/coles-radio-western-australia-mp3`
- `/tr/istasyon/sveriges-radio-p2`
- `/tr/istasyon/gbc-uniiq-95-7-fm`
- `/en/station/hoppa-radio-1`
- `/en/station/95bfm-64kbps-aac`

Their last reported Bing crawls were October24. Hoppa's content is particularly
short and factual-template based; several others contain promotional, generic
AI-style paragraphs and separate bitrate/channel variants. These observations
are editorial risks, not proof of Bing's internal ranking rationale. Do not
fabricate schedules, hosts, frequencies, reputation, backlinks or longer copy.
Publisher-sourced, useful distinctions between genuine channels and technical
stream variants are the next quality work. The6-domain backlink footprint also
supports Bing's authority recommendation, but does not prove a penalty.

The discovered/not-indexed sample
`/en/station/katm-kat-country-103-3` also returns200/index with matching canonical.
An indexable response alone does not compel indexing.

## Sitemap and freshness checks

The live master references129 child files.45 representative files were fetched
and parsed: every14-language main and genre file, the first station chunk in
each language, both English pilot files, and blog. All45 returned200 XML.
They contain144,598 URL entries in total, not globally deduplicated stations;
each file's URL list was internally unique. No future lastmod was found.
Main, genre, pilot and station files omit synthetic per-URL lastmod. Blog's154
dated entries retain editorial dates. The master was byte-identical at both
checks. This verifies current sitemap stability; it does not measure Google's
or Bing's discovery/refresh percentages, nor prove all129 files or all station
URLs were individually crawled by this audit. All14 languages remain included,
not just the20 pilot radios.

ICO, SVG, PNG and IndexNow ownership text are publicly reachable. The ownership
file contains the expected public key. The favicon compatibility release was
already live before this audit; no icon appearance or cache-refresh deadline
can be guaranteed by a submission.

## Authenticated Google evidence, October26

These reports have different data dates. They must not be presented as a
post-release measurement of today's code or a comparison between index counts.

| Report/filter | Data date | Observed state |
| --- | --- | --- |
| Crawl statistics | October 21 | Approximately 98% refresh, 2% discovery; apex 71,803 requests, www 4 |
| All known pages | October 19 | 12 indexed; 506 noindex; 736 HTTP 404; 174 soft 404; 27 redirects; 1 HTTP 5xx; 12,501 crawled/not indexed; 198,859 discovered/not indexed |
| Submitted pages | October 19 | 3 indexed; 10 noindex; 1,518 crawled/not indexed; 198,859 discovered/not indexed |
| Non-submitted pages | October 19 | 9 indexed; 496 noindex; 10,983 crawled/not indexed; all 10 validation groups started |
| Manual actions and security issues | Read October26 | Both report no issues detected |

No Failed validation was visible across the three filters. All-known reasons
show either Started or Passed; all submitted nonzero groups and all10
non-submitted groups show Started. These are separate validation scopes.
The all-known discovered group's Passed label dates to November18,2025, not
this year's fixes. Existing validations were not restarted.

Host detail explicitly reports acceptable robots and DNS failures and a past
server-connection issue with acceptable recent behavior. The www/apex request
counts do not prove an SSL or hostname configuration defect. Refresh means
recrawling a known URL, not that98% of sitemap content was changed. No current
reduction in that percentage can be claimed from a report ending October21.

### Complete current check of the506 noindex examples

The downloaded Google export contains506 distinct source URLs. Between09:24
and09:31 UTC on October26, all were checked using1,000 GET requests including
redirects, at most two concurrently:

| Current outcome | Source URLs |
| --- | ---: |
| Direct 200, self-canonical, meta/header index/follow | 39 |
| 301 to 200, self-canonical, meta/header index/follow | 452 |
| Terminal 410/noindex | 15 |
| Remaining 200/noindex | 0 |
| 404, timeout, 5xx, 429 or unresolved redirect | 0 |

The source URLs collapse to211 distinct index-open canonical targets and six
410 targets. A successful final target does not make the redirecting source
URL separately indexable. The10 submitted noindex examples are all direct200,
self-canonical and index/follow today; their Google last crawls are
September13-19. The506 check is raw HTTP evidence, not a full JavaScript,
robots.txt or Google index-state verification. Full per-hop evidence is kept
locally in `51-noindex-current-results.json`.

The single Google5xx example is `/ar/station/psy-trance`, last crawled
September7, with validation started September16. A fresh GET now follows one
301 to `/ar/mahta/psy-trance`, then200 with matching canonical, index/follow and
H1 `PSY Trance`.

The first10 alphabetically presented discovered examples, all German station
URLs, also returned direct200/index/self-canonical with station H1s,2,581-3,483
main-text characters and12-24 internal main-content links. This is a narrow,
nonrandom sample, not proof that all198,859 URLs are equivalent or high quality.
Another62 public pages across14 languages and20 pilot radios passed current
HTTP/canonical/directive checks. Historical noindex counts are not a reason
to strip legitimate private-page or removed-content exclusions.

## FlixApp and unsupported causal claims

No active FlixApp URL or outbound link was found in the searched application
source or the69 public/control HTML responses checked. Five unused
`flixapp_tv` translation labels were removed locally at the user's request.
Historical audit documents are retained: the October22 Google links report
records44 incoming links from flixapp.net. Incoming discovery/referrer data is
not evidence of an outbound MegaRadio link and cannot be deleted from an
external site by editing this repository.

A Punjabi App Store URL or a localized Amharic path does not establish spam,
a penalty or the cause of non-indexing. A clean manual-actions report likewise
does not rule out algorithmic quality evaluation. Preserve accurate language
URLs and real301/404/410 responses; do not manufacture200 pages or redirect
unrelated deleted stations to the home page.

## Actions and verification checkpoint

- With explicit user approval, archived and deleted only the November13,2025
  `Megaradio` scan report (10 pages; 0 errors/warnings; 7 H1 notices). Saved
  its summary, screenshot and all7 affected URLs locally.
- Started `MegaRadio Bing audit 2026-10-26`: website scope, maximum1000 pages,
  depth3,1 URL/second, no subdomain expansion and no robots bypass. Creation
  was initially Queued. The later authenticated check confirms Completed,
  1,000 pages, one error, one warning and one notice. The error is intentional
  robots blocking on `/en/recommendations`; the ALT warning is `/en`; the
  missing-H1 notice is `/en/users`. Screenshot retained locally as
  `56-bing-scan-completed.png`. This is not an exhaustive site crawl.
- No sitemap was deleted, no arbitrary redirects removed, no station deleted,
  no security protection disabled, and no backlink campaign or disavow sent.
- Local focused verification:75 tests,76 tests (3 repeated),407 tests, all
  passing;555 distinct test cases across those runs. Backend typecheck and
  production bundle build passed before release preparation.
- Later combined patch verification on Node24.22.0: frontend153 test files,
  2,313 tests passed; backend19 selected files,672 cases with661 passed,
  11 native PostgreSQL cases skipped because the local integration database
  was not configured, zero failures. Shared-library, frontend and backend
  typechecks passed. Frontend, API and web-entry production bundles built.
  Native database integration still requires the new commit's CI; the earlier
  PR132 green checks apply only to its previous head.
- At this checkpoint, source fixes still require PR CI/release and post-release
  HTTP verification. Do not describe them as live on the basis of local tests.
- Domain investigations used GPT-6.1-Sol subagents for source behavior, live
  URLs and report interpretation. GPT-6-Astra with Ultra reasoning independently
  reviewed the evidence and approved the bounded renderer/route changes with
  conditions before implementation. The sitemap-override follow-up above is
  explicitly outside that approval. Final review of the11-file follow-up found
  no blocker and approved commit/push, with106 independent tests, backend
  typecheck and diff whitespace checks passing. Release remains conditional on
  the new commit's CI and post-release production verification.

## Primary references

- [Bing Site Explorer](https://www.bing.com/webmasters/help/site-explorer-c680da37)
- [Bing Site Scan, including five-report retention](https://www.bing.com/webmasters/help/site-scan-623520c9)
- [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305)
- [Bing IndexNow reports](https://www.bing.com/webmasters/help/indexnow-0z209wby)
- [IndexNow FAQ, meaningful updates and removed URLs](https://www.indexnow.org/faq)
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a)
- [Google crawl statistics and crawl purpose](https://support.google.com/webmasters/answer/9679690?hl=en)
- [Google page indexing report](https://support.google.com/webmasters/answer/7440203?hl=en)
- [Google URL inspection and referring pages](https://support.google.com/webmasters/answer/9012289?hl=en)
- [Google noindex behavior](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google HTTP response handling](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
