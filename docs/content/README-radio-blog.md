# MegaRadio radio guides: editorial and developer handoff

The original 10 topics keep their 14 complete language editions (140 article URLs). An additional 48 market-specific articles are published only in their actual language editions: 188 article URLs plus 14 language-specific indexes, or 202 editorial sitemap entries. This includes the original 40 market guides and eight independently researched trend guides. The market publication contract is in `2026-10-market-blog-contract.md`.

## Contents and locations

The research brief and keyword/intent map are in `2026-09-radio-blog-brief.md`. These are directional demand clusters, **not verified current worldwide search-volume rankings**. No paid keyword service or AI batch job was started.

Full editable texts: `lib/seo-shared/src/blog/locales/{en,de,tr,fr,es,pt,it,ru,ar,he,zh,ja,ko,hi}.json`.
Each article includes a unique title, meta description, primary/secondary keyword brief, introduction, four substantial sections, practical checklist, two answered questions, localized internal links and descriptive illustration alt text. UI labels and disclosure are localized too. AI-assisted authorship is disclosed; no human expert review, test results or station rankings are fabricated.

The additional texts live in `lib/seo-shared/src/blog/market/{locale}.json` as separate arrays. Each has at least three answered questions, article-specific primary sources and contextual links to existing guides. `market-manifest.ts` owns the actual locale, target market, dates and existing illustration mapping. These are distinct local listening problems, not forty articles multiplied across fourteen languages. Keyword research separates observed Bing three-month impressions from unverified Google monthly search volumes; neither proves ranking potential for every long-tail query.

Public routes on deployment:

- `/{locale}/blog` — guide index
- `/{locale}/blog/{stable-article-id}` — complete localized article
- `/sitemap-blog.xml` — 188 articles + 14 indexes; also linked from the main sitemap index and robots.txt

Core article IDs stay constant across their translated editions. Market article IDs have only their explicitly published locale. The locale prefix is authoritative; country/preference cookies do not replace article language. Unsupported locales, invalid IDs and unavailable editions return a 404 instead of a duplicate English article or blog index. Explicitly changing language may instead open the selected language's blog index when the article has no equivalent edition.

## SEO and rendering

- Shared escaped semantic HTML renderer for both server and React; one H1, structured sections, visible FAQ, table of contents, related guides and listening-page links.
- Self-canonical per actual edition. Core articles retain 14 reciprocal hreflang links plus English x-default; market articles advertise only their published equivalent editions, with no invented English fallback. Query parameters do not create new canonical articles.
- Localized BlogPosting, BreadcrumbList and collection-page schema. Schema headline, description, language, illustration caption and dates match visible content.
- Visible, specific FAQs remain useful reader content; Google discontinued FAQ rich results in May 2026. No FAQPage schema, AI citation promise or fake ratings are added. Google decides whether to index, rank or show enhanced results.
- Edition-specific versioned dates change only on substantive editorial changes, not each catalog sync. The trend batch preserves all 180 previous editions and advances only the eight new article dates and their de/fr/en index dates. Reconcile the first publication date if release is delayed to another date.
- Localized React and SSR homepage footer discovery links; standalone editorial sitemap does not wait for station DB or translation job readiness.
- SPA navigation retains the existing global player; table-of-contents, modified-click and external-link browser behavior is preserved.

## Performance and images

Blog component and core/market JSON are lazy, per locale. The homepage/player bundle does not include article bodies. Server rendering uses versioned content without a PostgreSQL query or OpenAI call. Public API/station descriptions are unchanged.

10 original vector illustrations, each with 640×336 and 1200×630 WebP variants. The 20 WebP files total about 191 KB. Full-size images are at `/images/blog/{imageId}-1200.webp`; market IDs map to an existing illustration rather than implying a new file or broadcaster photograph. Each article has truthful native-language alt text, explicit dimensions and responsive srcset. Hero loads eagerly; related/index artwork is lazy. SVG sources and a deterministic build script are included; no hotlinked/licensing-uncertain stock images.

Regenerate images from the repository root:

```powershell
node artifacts/api-server/scripts/build-blog-images.mjs
```

Local database-free visual preview (run from `artifacts/api-server`):

```powershell
node --import ./node_modules/tsx/dist/loader.mjs scripts/preview-radio-blog.ts
```

Then visit `http://127.0.0.1:4179/tr/blog`. The local preview is deliberately noindex and is not production. Stop the preview process after use.

## Editing and release checks

1. Edit the affected core or market locale JSON files, retaining stable IDs and factual meaning. Publish only the editions listed in the shared manifest. Do not pad word counts or add unsupported app features, health claims or arbitrary “best station” rankings.
2. Update illustration alt text when artwork changes. Keep prose out of illustrations so one original asset can serve all languages.
3. Update only the affected edition's metadata when its content substantively changes; retain first publication dates. Do not bump the original core `BLOG_UPDATED` merely to publish a new market article. `BLOG_REVISION` is a content identifier, not automatic cache invalidation. Update `/blog.css` version if its layout changes and version image filenames when replacing artwork.
4. Run `blog-seo.test.ts`, `seo-sitemap-routes.smoke.test.ts` and `blog-page.test.tsx`, then server/frontend production builds.
5. After a normal deployment, check `/tr/blog`, `/de/blog/radio-data-usage`, `/ar/blog`, `/sitemap-blog.xml`, main sitemap inclusion and representative image HTTP responses. Use Search Console/Rich Results Test on the actual published URLs only; local schema tests are not Google approval.

Google references: [Article](https://developers.google.com/search/docs/appearance/structured-data/article), [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [images](https://developers.google.com/search/docs/appearance/google-images), [people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

## Historical Local Verification — 25 September 2026

- **258 backend tests passed** across blog SEO (including all 140 real renderer entries), sitemap HTTP/XML/ETag/robots smoke tests, existing localized static pages and station transient-recovery behavior.
- **60 frontend tests passed** across the new blog (14 locale render cases, SPA/player-element preservation, native link behavior and unsupported locales), footer language links, existing routing and profile/station breadcrumbs.
- `seo-shared` TypeScript build, API TypeScript check and frontend TypeScript check: passed.
- Production builds: Vite frontend, `src/index-web.ts`, `src/index-api.ts`: passed. Vite retained existing third-party sourcemap/large-chunk warnings; no build failure.
- Production manifest inspection: **14 locale JSON chunks; zero article-body chunks in the initial entry's static dependency graph**.
- Real local browser preview: German article on desktop/390px mobile, Arabic RTL on mobile and Turkish 10-card index. No horizontal overflow observed; native-language prose, headings and illustration displayed.
- Source/body contracts cover 140 localized descriptions/alt texts, 560 sections, 280 FAQ pairs and 420 listening-page links. All 154 sitemap URLs are unique, with reciprocal alternatives; 140 image entries are included.
- **At that September preparation stage only:** no commit, GitHub push, production deployment or Google submission had been performed. This historical record does not describe the later market-article release. Production HTTP/Google Rich Results validation remains a post-deployment check, not something local tests can certify. Existing unrelated audit-document edits were preserved.
