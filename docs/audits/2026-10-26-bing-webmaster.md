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

## Actions and verification checkpoint

- With explicit user approval, archived and deleted only the November13,2025
  `Megaradio` scan report (10 pages; 0 errors/warnings; 7 H1 notices). Saved
  its summary, screenshot and all7 affected URLs locally.
- Started `MegaRadio Bing audit 2026-10-26`: website scope, maximum1000 pages,
  depth3,1 URL/second, no subdomain expansion and no robots bypass. Creation
  was verified as Queued. Completion must be checked separately.
- No sitemap was deleted, no arbitrary redirects removed, no station deleted,
  no security protection disabled, and no backlink campaign or disavow sent.
- Local focused verification:75 tests,76 tests (3 repeated),407 tests, all
  passing;555 distinct test cases across those runs. Backend typecheck and
  production bundle build passed before release preparation.
- At this checkpoint, source fixes still require PR CI/release and post-release
  HTTP verification. Do not describe them as live on the basis of local tests.

## Primary references

- [Bing Site Explorer](https://www.bing.com/webmasters/help/site-explorer-c680da37)
- [Bing Site Scan, including five-report retention](https://www.bing.com/webmasters/help/site-scan-623520c9)
- [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305)
- [Bing IndexNow reports](https://www.bing.com/webmasters/help/indexnow-0z209wby)
- [IndexNow FAQ, meaningful updates and removed URLs](https://www.indexnow.org/faq)
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a)
