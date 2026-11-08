# O3 editorial pilot

Prepared on 2026-11-08. Local review only; no CMS writes or deployment.

## Scope

- Only station `68a8c483bd66579311ab2ffa`, slug `orf-hitradio-o3`, locale `de`.
- Existing stream, station identity, title/meta tags, canonical/hreflang,
  ratings and favourites remain unchanged. The playback engine is not replaced.
- Other stations and the other 13 supported locales keep their existing copy.
- A sourced Austrian-music section, a current official schedule link, three podcast descriptions,
  reception guidance and three station-specific questions replace generic filler.
- Initial HTML and React use the same editorial data. FAQ answers remain in the
  document inside native disclosures; no FAQ rich-result eligibility is claimed.
- A short, rewritten pilot summary stays by the player. Detailed editorial follows both
  the similar-station and country-station lists in React and initial HTML.
- The lower section does not repeat the station overview, decades or news/weather
  description from the upper summary; each section has a distinct subject.
- A short sourced history/studio section and two contextual category links address
  the agency's factual-content recommendations without a duplicate station overview.
- One shared fix also applies to other stations: the failed-playback overlay offers
  a real report action and explicit retry instead of a success toast with no request.

## Original wording and reader value

The 2026-11-08 revision rewrites the pilot prose around listener decisions rather
than reproducing source descriptions. It separates live listening from ORF replay,
explains the different podcast formats, gives a practical date/time route to
identify a previously heard song, and distinguishes internet delivery from UKW
reception. The Austrian-music section now includes sourced studio sessions and
the Donauinselfest stage instead of only a generic statement of support.

The short overview, initial HTML and broadcast-service schema use the same
pilot-only summary. The stored database description is not modified. Numerical
frequency facts and official names are intentionally preserved, not paraphrased.
No fixed word-count target, invented listening experience, human-review badge or
web-wide uniqueness guarantee is used. The text remains AI-assisted; an independent
German-language editorial review is still pending. Source verification is not a
claim of first-hand reporting or live reception testing.

## Sources

- Station identity/music/service: https://der.orf.at/unternehmen/programmangebote/radio/oe-drei/index.html
- Austrian music formats: https://der.orf.at/public-value/oesterreichische-musik100.html
- Current programme overview: https://oe3.orf.at/sendungen/
- Current podcast directory: https://sound.orf.at/podcast/oe3
- Full interviews: https://sound.orf.at/podcast/oe3/fruehstueck-bei-mir
- Pop interviews: https://sound.orf.at/podcast/oe3/oe3-pop-podcast
- Behind the scenes: https://sound.orf.at/podcast/oe3/off-records---der-oe3-wecker-podcast
- Launch date: https://science.orf.at/stories/3210395/
- Vienna studio move: https://oe3.orf.at/m/stories/3028942/
- Reception: https://oe3.orf.at/kontakt/stories/2994869
- Replay and song-information limitations: https://oe3.orf.at/kontakt/stories/faq/
- Frequency allocations: https://data.rtr.at/pages/open-data/m-freqbuch
- Frequency-book limitations: https://www.rtr.at/medien/service/frequenzbuecher/Frequenzbuch.de.html

No audience rankings, invented biographies, copied competitor paragraphs or
static programme times or fixed broadcast-presenter lists are included. The
programme section links to the ORF overview instead of mirroring a changing schedule.
The ORS frequency PDF was inaccessible. Instead, nine frequency allocations were
verified against the official KommAustria/RTR open data (see below). It does not invent live
track history: existing playback metadata is unchanged, and the official song
lookup is explained and linked. Replay availability is explicitly attributed to
the ORF, not offered as a MegaRadio feature.

## Frequency verification

Checked on 2026-11-08 against the public JSON download exposed by RTR:
https://data.rtr.at/api/v2/tables/m-freqbuch?sort=programm_typ,desc&size=10&lang=de&mediaType=json&unpaged=true&add-content-disposition=true

The response contained 2,264 records; exact filtering on `programm_typ` =
`Analoger Hörfunk` and `programm_liste` = `Ö3` yielded 264 allocations.
The visible dataset metadata reported 2026-11-08 03:12:03, publisher RTR-GmbH,
responsible party KommAustria, attribution `Quelle: KommAustria`, and license
`Freie Werke gemäß § 7 Urheberrechtsgesetz`.

| RTR station name | Transmitter | MHz |
| --- | --- | --- |
| WIEN 1 | Kahlenberg | 99.9 |
| S POELTEN | Jauerling | 89.4 |
| LINZ 1 | Lichtenberg | 88.8 |
| SALZBURG | Gaisberg | 99.0 |
| GRAZ 1 | Schöckl | 89.2 |
| KLAGENFURT 1 | Dobratsch | 90.4 |
| INNSBRUCK 1 | Patscherkofel | 88.5 |
| BREGENZ 1 | Pfänder | 89.6 |
| RECHNITZ | Hirschenstein | 87.9 |

Only display names and decimal formatting were normalized. The UI labels this
as a selection of allocations, not a full list or a reception/operating-status
guarantee. No live tuning, independent reception measurement, automatic refresh,
background task or runtime request to RTR is claimed or added. Recheck the source
before publication or future content revisions; dates must not change without
an actual source comparison. Text remains AI-assisted and has not received an
independent human editorial review.

## Preview

From `artifacts/api-server`, with Node 24 on PATH:

```sh
node --import tsx scripts/preview-oe3-editorial.ts
```

Open http://127.0.0.1:22541/de/sender/orf-hitradio-o3 .

The loopback-only server reads four public, unauthenticated snapshots at startup.
Subsequent API requests use memory fixtures. Only a bounded, same-origin simulated
playback-report POST is allowed, with results held in memory; other non-GET
requests are denied. No
production database, user sessions or background jobs are started. Advertising,
analytics, embedded frames and service workers are blocked by the preview CSP.
Local responses are noindex; this does not change production robots directives.

Before any future publication, recheck time-sensitive source facts and review
the content/layout with the owner. This pilot does not itself guarantee indexing.

## Full pilot follow-up, 2026-11-08

Current ORF Sound describes full "Fruehstueck bei mir" interviews, sometimes with
additional interview passages. This supersedes the older overview's excerpt-only
description. Each podcast now has a direct official listening link. No temporary
episode counts or static broadcast schedules are copied. The verified station
metadata lists German as the broadcast language. Genre information remains in
the upper summary instead of being repeated throughout the page.

The reporting button uses the existing `POST /api/stations/report-error` contract
and admin queue. It submits station ID/name and a generic playback failure only,
not stream tokens or listening history. The existing server still handles ordinary
request IP/user-agent information. Success requires `success: true` and a nonempty
report ID. HTTP failures, malformed responses and a ten-second timeout show an
unconfirmed state. No background report or automatic retry is added. Pending and
completed buttons reject repeated clicks, and navigation cancels the request.
Playback retry invokes play even if a failed player still reports itself as playing.
The error panel has mobile space and overflow handling for longer notices.

Preview-only test options (not registered in the production server):

- `?preview-stream=offline`: local 503 stream, with no production proxy fallback.
- `?preview-stream=offline&preview-report=fail`: also simulate report rejection.
- `?preview-muted=1`: mute media on play for a quiet real-stream test; no OS audio
  settings are changed.
- `/__preview/reports`: at most 20 memory-only simulated reports, cleared on restart.

## Verification and limits

184 focused frontend tests and 23 backend tests passed (207 total). The focused
suite covers exact station/locale scoping, server/React text and link
parity, report acknowledgement/failure/timeout/cancellation, layout, related links,
player controls, login, keyboard shortcuts and all 14 language switches. Backend
rendering checks cover the pilot summary in visible content and structured data.
Library/frontend typechecks and backend build passed after the last content edit;
the frontend build is also checked before handoff.

Browser checks cover 1440px desktop and 390px/320px responsive widths. No horizontal
page overflow or broken visible station images was observed. The 896px desktop
frequency table is centered. FAQ expansion and keyboard focus work. The real public
ORF stream advanced beyond 32 seconds while muted, stopped, then restarted and
advanced beyond 21 seconds. This is not a listening-quality or long-term uptime test.
The offline fixture verified retry, successful acknowledgement and failed reports;
a clipped mobile confirmation found during testing was fixed.

Initial local HTML returned 200 with one H1, podcast text/links, three FAQ disclosures
and nine frequency rows for ordinary and Googlebot-labelled requests. This is not
a real Google crawl; the local preview intentionally remains noindex.

Production persistence was not tested because no isolated `PG_TEST_DATABASE_URL`
was configured; production was deliberately not used. Physical iOS/Android and
Safari were not tested. External live metadata is blocked in this preview, so song
metadata updates are not verified. Independent German editorial review remains
pending; no human-review badge is shown.

## Agency comparison

Live read-only checks on 2026-11-08 found the German OE3 page returns 200, index/follow,
one station-name H1, self canonical and 14 language alternates plus x-default. Its
title already includes live-listening intent and its description is station-specific.
Those fields are not treated as proven errors or changed just to satisfy a checklist.
`RadioBroadcastService` describes an online radio service; `RadioStation` is a
`LocalBusiness` type. The existing service schema is retained, not replaced merely
because an agency named a different type. Internal Pop and Austria destinations
were both checked live: 200, indexable and self-canonical.

After owner review and a separately approved release, record the real URL Inspection
baseline (index status, selected canonical, last crawl) and recent impressions/clicks.
Review on days 7, 14, 28 and 45 without repeatedly requesting indexing. Keep other
stations/languages unchanged while measuring this German pilot. An observational
comparison is not proof that content alone caused an indexing change.

## Evidence Update v1.2: independent spot checks

The agency PDF dated 8 November 2026 has 11 pages. All text was read, with visual
inspection of its URL Inspection, source, station-page and Performance screenshots.
This is an evidence update, not a completed 129-file/30-URL audit: its own section 8
lists substantial checks as future deliverables.

| Report claim | Read-only verification on 2026-11-08 | Conclusion |
| --- | --- | --- |
| Four sampled stations can be fetched and are not noindex | WHP 580, 89.9 TheLight, Power92 FM and Kronehit each returned 200, index/follow, one H1 and a self canonical | Reproduced for these samples; not proof every page works |
| Sitemap index contains 129 files | `/sitemap.xml` returned 200, application/xml and parsed as a 129-entry index | Confirmed; not a missing sitemap |
| First English sitemap has about 23 language annotations | 10,000 entries parsed; 9,988 have 23 annotations. First entry has 14 unique targets, including `tr`/`tr-TR` pointing to the same URL | Annotation count is not a count of separate languages or duplicated pages |
| No referring sitemap for Power92 FM in URL Inspection | `/en/station/power92-fm` is present in the current first English sitemap | The historical GSC field does not establish absence from current sitemap |
| RadioStation block exists | All four current samples and OE3 use RadioBroadcastService | Report's type name does not match the current code; retain the appropriate service type |
| Iran International twins | Distinct IDs, same official homepage and identical resolved stream `https://radio.iraninternational.app/iintl_c` | Strong duplicate evidence; a separate managed merge candidate, not automatically deleted |
| RFI Afrique twins | Two records use `rfiafrique-64.mp3` and `rfiafrique-96k.mp3` from the same host | Likely bitrate variants of one service; retain variants during a verified merge |
| WALM format twins | OTR uses `/otr_opus` and official `/otr`; WALM2 uses `/walm2_opus` and official `/walm2` | Not established as duplicates; distinct service paths must not be merged by codec/name alone |
| Kronehit 0 clicks / 0 impressions | The PDF's Performance filter dialog remains open | Not a reliable page-specific baseline until the filter is applied and date range/export recorded |
| Canonical mismatch absent on four pages | Four declared canonicals visible; only two Google-selected canonical rows visible in the historical screenshots | Do not generalize Google's selection from the missing rows |

The index and first English sitemap both parsed successfully, but the remaining
128 referenced files were not exhaustively fetched. The first station file has
no lastmod entries; the index has one, for the blog. Missing lastmod is not a
parsing failure. Google ignores priority/changefreq; do not fake fresh modification
dates to encourage discovery. The MangoRadio English/Turkish sample returned 200,
self canonicals and reciprocal language links. This is a sample, not a completed
14-language reciprocity audit.

A default Python user-agent received 403 once, while the explicitly labelled owner
audit client fetched the same sitemap successfully. This observation is not proof
that verified Googlebot is blocked; its cause needs edge/security logs and genuine
Google crawl evidence before any protection is changed.

The PDF's 12 indexed pages and other totals are dated 23 October, not today's live
coverage counts. Its 99.35% refresh share covers a historical window and is not an
indexing quality score. Its 5xx/unknown-file-type percentages need denominator,
date and server-log correlation; they do not prove the sole cause. A third-party
tool crawling or submitting URLs also does not prove a subsequent Googlebot crawl.
No index submission, production merge, WAF change or database write was made as
part of these checks.

Reference guidance:
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://developers.google.com/search/docs/specialty/international/localized-versions
- https://schema.org/RadioBroadcastService
- https://schema.org/RadioStation

## Owner-approved release and footer follow-up (8 November 2026)

The owner approved publishing the German pilot. Other 13 locale descriptions,
canonical URLs and indexing directives remain unchanged; the expanded editorial
has not been translated into those locales.

The owner also reported blank scrolling after the footer. Two causes were
reproduced and corrected:
- A viewport-height body with horizontal overflow suppression created an inner
  vertical scroll container. On the 807px preview, scrolling that container to
  its footer still left 2,803px of outer-document scrolling. The body now grows
  naturally (`height: auto; min-height: 100%`).
- Footer padding reserved 144px for the mini-player even on station detail routes,
  where GlobalPlayer deliberately hides it. The footer now follows the same
  language-normalized route condition and retains clearance on catalog pages.

Browser checks at 320px, 390px, 807px and 1440px reached the actual footer boundary
with less than one pixel rounding difference and no additional blank document
area. Muted real-stream playback remained active (`readyState: 4`); station-page
footer padding was zero during playback. No production error report was sent.
The follow-up's 212 focused footer, navigation, playback and account tests,
frontend typecheck and frontend build passed. The first PR revision also passed
the complete GitHub PostgreSQL, test, typecheck and production-image workflow;
the final revision must pass again before merge.
