# Market blog technical contract

## Publication inventory

The original ten IDs keep their fourteen complete editions, URLs and September
25 publication/update timestamps. Forty additional IDs have exactly one edition
each, registered in `lib/seo-shared/src/blog/market-manifest.ts`. The resulting
inventory is 180 article URLs and 14 locale indexes, not 40 times 14 articles.
`BLOG_IDS` remains the ten bitmap/core IDs; `BLOG_ARTICLE_IDS` includes all fifty
IDs. Enumerate actual editions with `blogIdsForLocale`, never a Cartesian product.
`BLOG_SITEMAP_PATHS` has no external consumers and is not an availability matrix.

The manifest owns locale, market, existing bitmap `imageId`, `publishedAt`,
`updatedAt` and optional `languageTag`. Market content cannot override metadata.
New dates are October 27, 2026, with the Berlin UTC+01:00 offset. Preserve first
publication dates; change only the affected edition's update timestamp for a
substantive edit. The supplied publication date must be reconciled by the release
owner if actual publication is delayed. `BLOG_REVISION` is a content identifier,
not cache invalidation. The static sitemap snapshot changes with deployment.

## Writer files

Writers own `lib/seo-shared/src/blog/market/{locale}.json`. All fourteen explicit
lazy imports require files: en, es, fr, de, pt, it, ru, ar, zh, tr, ja, ko, hi, he.
Each JSON file is a top-level article array, not a `ui`/`articles` wrapper. Leave
core `locales/*.json` unchanged. Required fields are the existing `BlogArticle`
fields plus nonempty `sources: [{name, url}]` with absolute HTTPS URLs. New
articles have three visible FAQ pairs. Sources must support the particular
article; there is no global-source fallback for a market article.

Optional fields are `relatedIds: BlogId[]`, `market`, and `imageId` (an existing
core bitmap ID). The latter two are advisory; the manifest is authoritative.
Check every `imageAlt` against the actual mapped illustration, not a broadcaster
logo, screenshot or photograph that does not exist. If an advisory `imageId` is
provided, it must agree with the manifest before release.

Internal routes are `home`, `genres`, `regions`, `applications`, `search`, a safe
single `genre:<slug>`, `blog:<available-id>`, or the verified `station:kral-fm`.
No arbitrary path/URL, unverified station slug or `region:` route is accepted.
Related IDs and blog links must exist in the article's locale. English core IDs
remain the stable IDs in all languages. No external request is made by a loader.

## Rendering and discovery

The shared manifest determines routes, self-canonicals, alternates, menus,
related links and sitemap entries. Both SSR and React independently reject a
valid catalog ID whose article body is absent. Loading/import failures remain
retryable errors, not synthetic 404s. Direct unavailable URLs do not redirect.
An explicit language choice for an unavailable edition opens the destination
blog index without carrying the article's fragment or query.

Hong Kong editions retain `/zh/blog/{id}` URLs while their actual language tag
is `zh-Hant-HK`; HTML, BlogPosting, self-hreflang and SEO language agree, with
`og:locale` `zh_HK`. Existing core Chinese and the locale index remain `zh`.
Other market OG locales use the manifest market (`de_AT`, `pt_BR`, `en_GB`,
etc.); core OG defaults and non-Chinese hreflang language codes stay unchanged.
No English alternate or x-default is invented for a non-English market article.

Initial SSR owns the head. Existing `SeoPageWrapper` replaces it on navigation
and narrowly accepts blog 404 payloads, clearing canonical, alternates and old
page schema. Unrelated failures and 503 responses retain their existing policy.
Index cards are complete crawlable anchors; no pagination is introduced.
Market articles precede the older core guides in both cards and ItemList schema;
the relative order of the original ten guides remains unchanged.
Catalog sitemap safety, robots, station gates, private routes and DB stay intact.

FAQs are useful visible content. No FAQPage schema is added: Google discontinued
FAQ rich results on May 7, 2026 and removed the documentation on June 15. Neither
schema nor adding forty articles guarantees indexing, ranking or AI citations.
See [Google updates](https://developers.google.com/search/updates) and the
[AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## Release validation

Run catalog/blog SEO, sitemap smoke, blog page, head ownership and routing tests
under Node 24, then library/API/frontend typechecks and production builds. Check
all 194 URLs against actual content, all 520 unavailable market/locale pairs,
dates, sources, bitmap existence, FAQ text and schema/head parity. The content
owner reviews alt-text/image meaning and claim/source accuracy; automated URL
parity alone cannot prove either. Main owns authenticated GSC, live HTTP checks,
publication and release. This technical task does not commit, push or deploy.

Future scheduled publication needs one shared availability snapshot and explicit
invalidation of startup sitemap/HTML caches. Do not make only the route or only
the sitemap consult the wall clock. Removing content or changing links/images
may also require an explicit collection/sitemap revision timestamp rather than
only taking the maximum remaining article date.
