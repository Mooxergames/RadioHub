# Bing / Yahoo favicon investigation

Checked on 2026-10-26. This investigation does not establish which favicon
Bing last fetched. A user-agent probe is not evidence from a verified Bing IP.

## Production Evidence Before Changes

- `/en` returns 200, `index, follow`, and server-rendered PNG/favicon and
  Apple touch icon links. No JavaScript is needed to discover those links.
- `/favicon.png` returns 200, `image/png`, the existing 64x64 MegaRadio mark,
  and no `X-Robots-Tag` exclusion. Its URL is not blocked in robots.txt.
- `/apple-touch-icon.png` returns 200, `image/png`, without a robots exclusion.
- `/favicon.ico` returns 301 to `/favicon.png`; a direct ICO file is absent.
  A redirect is not proof that Bing cannot use the icon, but avoiding this
  extra compatibility dependency is a justified improvement.
- `/favicon.svg` returns 200 with `noindex, follow`, but contains only a red
  square rather than the MegaRadio mark. Neither current HTML template links
  to this SVG, so there is no evidence it is the cause of the missing icon.
- Public PNG responses advertise a one-year cache lifetime; a changed SVG
  or old redirect may remain in downstream caches until revalidated/purged.
- `www` assets redirect to the canonical non-www hostname. These canonical
  host redirects are intentional and should not be removed.
- `api.themegaradio.com` has an intentional `noindex, nofollow` policy. The
  public HTML points to the main host, not to these API-host icon URLs.
- A direct Bing `site:themegaradio.com` lookup presented a human challenge.
  It was not completed or bypassed; the search-result icon was not verified.

## Scoped Fix

- Added `/favicon.ico` as a valid 64x64 ICO container with the existing PNG
  bytes embedded unchanged. No brand pixels were regenerated or resized.
- Replaced the legacy SVG placeholder with an SVG embedding the same PNG.
  `artifacts/megaradio/scripts/generate-favicons.mjs` reproduces both files
  from the existing PNG, without adding a package dependency.
- Both HTML templates explicitly declare ICO and PNG. PNG remains the last
  standard icon declaration; existing Apple and manifest links are retained.
- Web and API static mounts serve the ICO directly with image MIME rather
  than a redirect or successful HTML shell.
- On the public web host, ICO/SVG/PNG do not inherit the SPA noindex, and use
  a one-day revalidatable cache policy rather than a year-long asset policy.
  Other assets and private/admin/API indexing policies are unchanged.

## Validation

- 69 targeted tests passed: brand bytes, PNG dimensions, ICO directory and
  payload, SVG embedded bytes, GET/HEAD and legacy query strings, MIME,
  robots/cache headers, both HTML templates, manifest/notification icons,
  private admin assets, missing assets and HTML cache regression checks.
- Backend and frontend TypeScript checks passed.
- Production web bundle and frontend build passed. Built public output
  includes the ICO and corrected SVG.
- `git diff --check` passed. No dependency manifest/lockfile was changed.

## Remaining Work / Limits

These changes are local, not deployed or submitted to Bing. After release,
verify direct 200 responses and correct bytes on the canonical host. Purge
only the old `/favicon.ico` redirect and `/favicon.svg` at the CDN when
available; keep the stable icon URLs. Inspect the home page in Bing Webmaster
Tools and request a recrawl there. Do not add favicon files as standalone
HTML page entries to the XML sitemap, and do not remove valid host redirects.

The accessible PNG means a server-wide missing/blocked favicon is not
demonstrated. Bing's stored icon, previous crawl failures, refresh timing or
display choice remain possible explanations. Neither reindexing nor these
compatibility fixes guarantee an icon will be shown or a particular date.

## Primary References

- [Yahoo webmaster tools](https://help.yahoo.com/kb/webmaster-tools-yahoo-search-sln2213.html):
  Yahoo describes results from Slurp and Bing; a shared crawling dependency
  is possible, not proof of an identical favicon cache.
- [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305):
  indexed/live HTML, HTTP responses, crawl issues and recrawl requests.
- [Google favicon documentation](https://developers.google.com/search/docs/appearance/favicon-in-search):
  stable, crawlable brand icons and non-guaranteed appearance. This is Google
  guidance, not a claim of a mandatory Bing ICO or dimension requirement.
