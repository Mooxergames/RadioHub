/**
 * Task #372: visible-content guard for the per-station RadioStation
 * JSON-LD that ships on /station/<slug> pages.
 *
 * Tasks #208 / #280 added this same guard for FAQPage, BreadcrumbList,
 * and ItemList. The remaining rich-snippet emission is the
 * `radioStationSchema` block in seo-renderer.ts (~line 1900). Google
 * flags structured data as deceptive when fields like `name`,
 * `description`, `broadcastDisplayName`, `genre`, and `areaServed`
 * drift from the visible page copy (e.g. AI-rewritten descriptions,
 * translated country names) — this test guarantees they appear
 * verbatim in the rendered station body.
 *
 * Coverage:
 *   1. Source-scan: the only RadioStation @type emission with a
 *      top-level `@id` (i.e. the per-station block, not the popular
 *      ItemList children) lives behind the `if (stationData)` guard.
 *   2. For each station fixture, the emitted RadioStation JSON-LD's
 *      visible fields (name, broadcastDisplayName, description,
 *      areaServed, genre) all appear verbatim in the rendered body.
 *
 * Runner: requires `--experimental-test-module-mocks`, which the
 * api-server `test` script already passes.
 */
import { test, mock, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Module mocks: mirror structured-data-visible-content.test.ts so SeoRenderer
// can be imported without booting Mongo / the perf cache.
// ---------------------------------------------------------------------------


mock.module(new URL('../src/performance-cache.ts', import.meta.url).href, {
  namedExports: {
    performanceCache: {
      getTranslations: () => null,
      setTranslations: () => {},
      getPageData: () => null,
      setPageData: () => {},
      getUrlTranslations: async () => new Map<string, string>(),
      getStats: () => ({ hits: 0, misses: 0 }),
    },
    PerformanceCache: class {},
    deepFreeze: <T,>(v: T) => v,
  },
});

// ---------------------------------------------------------------------------
// Module-load: only after mocks are in place.
// ---------------------------------------------------------------------------

let SeoRenderer: new () => {
  generateHtmlBody: (pageData: any) => string;
  generateHtmlHead: (
    seoTags: any,
    language?: string,
    translations?: Record<string, string>,
    cleanPath?: string,
    stationData?: any,
    urlTranslations?: Map<string, string>,
    additionalData?: any,
  ) => string;
};

before(async () => {
  const rendererMod = (await import('../src/seo-renderer.ts')) as {
    SeoRenderer: typeof SeoRenderer;
  };
  SeoRenderer = rendererMod.SeoRenderer;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function extractJsonLdBlocks(head: string): any[] {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
  const blocks: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to JSON.parse a JSON-LD block: ${(err as Error).message}\n---\n${raw.slice(0, 200)}`,
      );
    }
    for (const b of Array.isArray(parsed) ? parsed : [parsed]) blocks.push(b);
  }
  return blocks;
}

function extractRadioStationSchema(head: string): any {
  // 2026-07-03 refresh: the primary per-station entity switched from
  // RadioStation → RadioBroadcastService on 2026-05-12 (validators reject
  // BroadcastService-only fields on the LocalBusiness subtype); this suite
  // had rotted against the old shape while a broken module mock kept every
  // test dying at import time. The block keeps its `#radiostation` @id.
  return extractJsonLdBlocks(head).filter(
    (b) =>
      b &&
      b['@type'] === 'RadioBroadcastService' &&
      typeof b['@id'] === 'string' &&
      b['@id'].endsWith('#radiostation'),
  );
}

function extractLocalBusinessSchema(head: string): any {
  // Regression guard: catalogue geography cannot verify a LocalBusiness.
  return extractJsonLdBlocks(head).filter(
    (b) =>
      b &&
      b['@type'] === 'RadioStation' &&
      typeof b['@id'] === 'string' &&
      b['@id'].endsWith('#localbusiness'),
  );
}

const DOMAIN = 'https://themegaradio.com';

test('official station links use the homepage, never the audio stream, across locales', () => {
  const renderer = new SeoRenderer();
  for (const language of ['en', 'de', 'tr', 'ar']) {
    const stationData = { _id: 'website-test', slug: 'website-test', name: 'Website FM', url: 'https://stream.example.test/live.mp3', homepage: 'https://radio.example.test/?a=1&b=2' };
    const render = (homepage: any) => renderer.generateHtmlBody({
      pageType: 'station', language, translations: {}, seoTags: {},
      stationData: { ...stationData, homepage }, additionalData: {},
    });
    const body = render(stationData.homepage);
    assert.ok(body.includes('href="https://radio.example.test/?a=1&amp;b=2"'));
    assert.ok(!body.includes('href="https://stream.example.test/live.mp3"'));
    for (const bad of [undefined, '', '/relative', 'javascript:alert(1)', 'data:text/html,x', 'https://user:password@radio.example.test']) {
      const invalid = render(bad);
      assert.ok(!invalid.includes('href="https://stream.example.test/live.mp3"'));
      assert.ok(!invalid.includes('href="javascript:'));
      assert.ok(!invalid.includes('href="data:'));
      assert.ok(!invalid.includes('user:password@'));
    }
  }
});

// ===========================================================================
// 0. Source-scan guard: catch new RadioStation JSON-LD emissions outside
//    the known per-station block. Mirrors the FAQPage/BreadcrumbList scans.
// ===========================================================================

test('source-scan: per-station service is guarded and no unverified LocalBusiness companion is emitted', () => {
  const fileUrl = new URL('../src/seo-renderer.ts', import.meta.url);
  const src = readFileSync(fileURLToPath(fileUrl), 'utf8');

  // The service assignment must remain station-scoped. Ratings alone never
  // establish the physical business required by the removed companion.
  const scan = (name: string, typeLiteral: string) => {
    const declPattern = new RegExp(
      `(?<![A-Za-z0-9_])${name}\\s*=\\s*\\{[\\s\\S]{0,2000}?["']@type["']\\s*:\\s*["']${typeLiteral}["']`,
      'g',
    );
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = declPattern.exec(src)) !== null) {
      count += 1;
      const ctx = src.slice(Math.max(0, m.index - 20000), m.index);
      assert.ok(
        ctx.includes('if (stationData)'),
        `${name} declaration at offset ${m.index} is not guarded by ` +
          '`if (stationData)`. New per-station emissions must ' +
          'assert stationData is present and add visible-body coverage in this test — see Task #372.',
      );
    }
    assert.equal(
      count,
      1,
      `Expected exactly one ${name} declaration (@type ${typeLiteral}) in seo-renderer.ts, found ${count}. ` +
        'If the emission moved or new ones were added, update this scan and add visible-body coverage.',
    );
  };

  scan('radioStationSchema', 'RadioBroadcastService');
  assert.doesNotMatch(src, /["']@type["']\s*:\s*["']RadioStation["']/);
});

// ===========================================================================
// 1. RadioStation: every visible field in the JSON-LD must appear verbatim
//    in the rendered station body.
// ===========================================================================

interface StationCase {
  label: string;
  language: string;
  translations?: Record<string, string>;
  urlTranslations?: Map<string, string>;
  stationData: any;
}

const STATION_CASES: StationCase[] = [
  {
    label: 'station detail (en) — name + description + country + single genre tag',
    language: 'en',
    stationData: {
      _id: 's-en-1',
      name: 'Example FM',
      slug: 'example-fm',
      country: 'Germany',
      tags: 'pop',
      description: 'Listen to great music from Berlin.',
    },
  },
  {
    label: 'station detail (tr) — areaServed must use translated country name',
    language: 'tr',
    translations: {
      nav_home: 'Ana Sayfa',
      nav_stations: 'İstasyonlar',
      country: 'Ülke',
      genres: 'Türler',
      about_station: 'İstasyon Hakkında',
      station_information: 'İstasyon Bilgisi',
    },
    urlTranslations: new Map([
      ['tr:station', 'istasyon'],
      ['tr:stations', 'istasyon'],
    ]),
    stationData: {
      _id: 's-tr-1',
      name: 'Berlin Radyo',
      slug: 'berlin-radyo',
      country: 'Germany', // localized to "Almanya" for tr in body + JSON-LD
      tags: 'pop',
      description: 'Berlin\'den harika müzikler dinleyin.',
    },
  },
  {
    // Task #372 critical drift case: aiDescription is set to copy that is
    // NOT rendered anywhere in the visible body. The renderer must source
    // RadioStation.description from the SAME path the body uses
    // (descriptions[lang].full > description), NOT from aiDescription —
    // otherwise Google flags the schema as deceptive markup.
    label: 'station detail (en) — aiDescription must NOT bleed into RadioStation.description (drift guard)',
    language: 'en',
    stationData: {
      _id: 's-en-ai',
      name: 'Drift FM',
      slug: 'drift-fm',
      country: 'Spain',
      tags: 'rock',
      // aiDescription is intentionally different from `description` and
      // never rendered in the body. If the schema picks it up, the
      // visible-content assertions below will fail.
      aiDescription: 'AI-rewritten copy that the body never shows. Hidden marketing text.',
      description: 'Rock around the clock from Madrid.',
    },
  },
  {
    label: 'station detail (en) — per-language description (descriptions[en].full) used in body',
    language: 'en',
    stationData: {
      _id: 's-en-2',
      name: 'Jazz Live',
      slug: 'jazz-live',
      country: 'France',
      tags: 'jazz',
      // When descriptions[lang].full is set, the body renders it instead of
      // `description`. JSON-LD still falls back to `description` when
      // aiDescription is unset, so we keep both copies in sync to prove
      // the visible-content guard catches drift in either direction.
      description: 'Smooth jazz, twenty-four hours a day.',
      descriptions: {
        en: { full: 'Smooth jazz, twenty-four hours a day.' },
      },
    },
  },
];

for (const c of STATION_CASES) {
  test(`RadioStation: ${c.label} — every JSON-LD visible field appears verbatim in body`, () => {
    const renderer = new SeoRenderer();
    const language = c.language;
    const translations = c.translations ?? {};
    const urlTranslations = c.urlTranslations ?? new Map<string, string>();
    const stationData = c.stationData;
    const segment = urlTranslations.get(`${language}:station`) || 'station';
    const cleanPath = `/${segment}/${stationData.slug}`;
    const additionalData = { pageType: 'station' };
    const seoTags = {
      title: `${stationData.name} — Listen Live | Mega Radio`,
      description: 'd',
      canonical: `${DOMAIN}/${language}${cleanPath}`,
      domain: DOMAIN,
    };

    const head = renderer.generateHtmlHead(
      seoTags,
      language,
      translations,
      cleanPath,
      stationData,
      urlTranslations,
      additionalData,
    );
    const body = renderer.generateHtmlBody({
      pageType: 'station',
      language,
      translations,
      seoTags,
      stationData,
      additionalData,
      urlTranslations,
      cleanPath,
    });

    const matches = extractRadioStationSchema(head);
    assert.equal(
      matches.length,
      1,
      `${c.label}: expected exactly one per-station RadioStation JSON-LD block, found ${matches.length}`,
    );
    const schema = matches[0];

    // -- name ---------------------------------------------------------------
    assert.equal(typeof schema.name, 'string', `${c.label}: schema.name must be a string`);
    assert.ok(
      body.includes(escapeHtml(schema.name)),
      `${c.label}: RadioStation.name "${schema.name}" not found verbatim in rendered body. ` +
        'Google flags this exact mismatch as deceptive markup — see Task #372.',
    );

    // -- broadcastDisplayName ----------------------------------------------
    assert.equal(
      typeof schema.broadcastDisplayName,
      'string',
      `${c.label}: schema.broadcastDisplayName must be a string (required for RadioStation rich result)`,
    );
    assert.ok(
      body.includes(escapeHtml(schema.broadcastDisplayName)),
      `${c.label}: RadioStation.broadcastDisplayName "${schema.broadcastDisplayName}" not found verbatim in body.`,
    );

    // -- description (first sentence) --------------------------------------
    assert.equal(
      typeof schema.description,
      'string',
      `${c.label}: schema.description must be a string`,
    );
    const firstSentence =
      schema.description.match(/[^.!?]+[.!?]+/)?.[0]?.trim() ?? schema.description.trim();
    assert.ok(
      firstSentence.length > 0,
      `${c.label}: could not extract a first sentence from RadioStation.description`,
    );
    assert.ok(
      body.includes(escapeHtml(firstSentence)),
      `${c.label}: RadioStation.description first sentence "${firstSentence}" not found verbatim in body. ` +
        'AI-rewritten descriptions that diverge from visible copy are flagged by Google as deceptive markup — see Task #372.',
    );

    // -- areaServed (localized country) ------------------------------------
    assert.equal(
      typeof schema.areaServed,
      'string',
      `${c.label}: schema.areaServed must be a string (localized country name)`,
    );
    assert.ok(
      body.includes(escapeHtml(schema.areaServed)),
      `${c.label}: RadioStation.areaServed "${schema.areaServed}" not found verbatim in body. ` +
        'Translated country names must match the visible "Country: ..." line — see Task #372.',
    );

    // -- category (tags) ----------------------------------------------------
    // 2026-05-12: `genre` is not a valid Service property; tags ship as
    // Service-level `category` instead. Same visible-content contract: every
    // keyword must appear verbatim in the body's "Genres: ..." line.
    assert.ok(
      Array.isArray(schema.category) && schema.category.length > 0,
      `${c.label}: schema.category must be a non-empty array (got ${JSON.stringify(schema.category)})`,
    );
    for (const g of schema.category as string[]) {
      const trimmed = String(g).trim();
      if (!trimmed || trimmed === 'Music') continue; // "Music" is the empty-tags default, not body copy
      assert.ok(
        body.includes(escapeHtml(trimmed)),
        `${c.label}: category value "${trimmed}" not found verbatim in body. ` +
          'Genre tags in JSON-LD must match the visible "Genres: ..." line — see Task #372.',
      );
    }
  });
}

// ===========================================================================
// 1b. Real-rating companions (2026-07-03): with >=3 genuine listener ratings
//     the head must emit aggregateRating on the RadioBroadcastService and the
//     speakable WebPage; the body must show the rating line. Below the
//     threshold NONE of the rating markup may appear (fabricated-rating
//     regression guard).
// ===========================================================================

function renderStationPage(stationData: any) {
  const renderer = new SeoRenderer();
  const cleanPath = `/station/${stationData.slug}`;
  const seoTags = {
    title: `${stationData.name} — Listen Live | Mega Radio`,
    description: 'd',
    canonical: `${DOMAIN}/en${cleanPath}`,
    domain: DOMAIN,
  };
  const head = renderer.generateHtmlHead(
    seoTags, 'en', {}, cleanPath, stationData, new Map(), { pageType: 'station' },
  );
  const body = renderer.generateHtmlBody({
    pageType: 'station', language: 'en', translations: {}, seoTags,
    stationData, additionalData: { pageType: 'station' },
    urlTranslations: new Map(), cleanPath,
  });
  return { head, body };
}

test('station with >=3 real ratings preserves service ratings and visible rating line without a physical business claim', () => {
  const { head, body } = renderStationPage({
    _id: 's-rated', name: 'Rated FM', slug: 'rated-fm', country: 'Germany',
    countryCode: 'DE', tags: 'pop', description: 'Great music from Berlin.',
    averageRating: 4.25, totalRatings: 12,
  });

  const [service] = extractRadioStationSchema(head);
  assert.ok(service, 'RadioBroadcastService block missing');
  assert.equal(service.aggregateRating?.['@type'], 'AggregateRating');
  assert.equal(service.aggregateRating.ratingValue, 4.3); // rounded to 1 decimal
  assert.equal(service.aggregateRating.ratingCount, 12);

  const locals = extractLocalBusinessSchema(head);
  assert.equal(locals.length, 0, 'catalog country cannot verify a physical studio business');
  assert.equal(service.broadcaster.address, undefined);
  assert.equal(service.areaServed, 'Germany', 'service coverage remains available');

  // Google review-snippet policy: the aggregate rating must be VISIBLE.
  assert.ok(
    body.includes('★ 4.3 / 5 · 12'),
    'visible rating line "★ 4.3 / 5 · 12" missing from station body',
  );

  // Speakable WebPage companion targets selectors that exist in the body.
  const webpages = extractJsonLdBlocks(head).filter(
    (b) => b && b['@type'] === 'WebPage' && b.speakable,
  );
  assert.equal(webpages.length, 1, 'expected exactly one speakable WebPage block');
  for (const sel of webpages[0].speakable.cssSelector as string[]) {
    if (sel.startsWith('.')) {
      assert.ok(
        body.includes(`class="${sel.slice(1)}"`),
        `speakable cssSelector "${sel}" has no matching class in the rendered body`,
      );
    }
  }
});

test('station below the 3-rating threshold must NOT emit any rating markup', () => {
  const { head, body } = renderStationPage({
    _id: 's-unrated', name: 'Fresh FM', slug: 'fresh-fm', country: 'Germany',
    countryCode: 'DE', tags: 'pop', description: 'Great music from Berlin.',
    averageRating: 5, totalRatings: 2, votes: 4821, // votes must NEVER leak into stars
  });

  const [service] = extractRadioStationSchema(head);
  assert.ok(service, 'RadioBroadcastService block missing');
  assert.equal(service.aggregateRating, undefined, 'aggregateRating leaked below threshold');
  assert.equal(extractLocalBusinessSchema(head).length, 0, '#localbusiness block leaked below threshold');
  assert.ok(!body.includes('★'), 'visible rating line leaked below threshold');
});

// ===========================================================================
// 2. Negative control: pages without stationData must NOT emit a
//    per-station RadioStation block.
// ===========================================================================

test('non-station pages must NOT emit a per-station RadioStation JSON-LD block', () => {
  const renderer = new SeoRenderer();
  const head = renderer.generateHtmlHead(
    { title: 't', description: 'd', canonical: `${DOMAIN}/en/about`, domain: DOMAIN },
    'en',
    {},
    '/about',
    undefined, // no stationData
    new Map<string, string>(),
    { pageType: 'about' },
  );
  const matches = extractRadioStationSchema(head);
  assert.equal(
    matches.length,
    0,
    `non-station page emitted ${matches.length} per-station RadioStation block(s) — would be deceptive markup`,
  );
});
