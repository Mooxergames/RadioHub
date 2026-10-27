import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadBlogContent } from "@workspace/seo-shared/blog";
import { blogExplorePath } from "@workspace/seo-shared/blog-html";
import {
  BLOG_LOCALES, MARKET_BLOG_MANIFEST, blogMetadata, blogIndexUpdated, blogAvailable,
  type BlogLocale, type BlogId,
} from "@workspace/seo-shared/blog-manifest";

const hash = (value: unknown) => {
  const encoded = JSON.stringify(value);
  assert.ok(encoded !== undefined);
  return createHash("sha256").update(encoded).digest("hex");
};
const published = "2026-10-27T07:46:55+01:00";
const topics = [
  ["de", "AT", "9-plaetze-9-schaetze-2026-radio-oesterreich"],
  ["de", "AT", "vignette-2027-oesterreich-verkehrsradio"],
  ["de", "AT", "vollmond-oktober-2026-radio-wissenschaft"],
  ["de", "DE", "ballon-dor-2026-radio-ergebnisse"],
  ["de", "DE", "dfb-pokal-2026-27-live-radio"],
  ["fr", "FR", "changement-heure-hiver-2026-radio-reveil"],
  ["en", "GB", "wind-up-radio-uk-emergency-kit"],
  ["en", "US", "world-series-2026-radio-audio"],
] as const;

test("all 180 previously published bodies, metadata and relative order stay unchanged", async () => {
  const baseline = JSON.parse(await readFile(new URL("./fixtures/blog-editions-before-trends.json", import.meta.url), "utf8")) as {
    editions: Array<[BlogLocale, BlogId, string]>;
    metadata: Array<[BlogId, string]>;
  };
  assert.equal(baseline.editions.length, 180);
  assert.equal(baseline.metadata.length, 50);
  for (const locale of BLOG_LOCALES) {
    const before = baseline.editions.filter(([language]) => language === locale);
    const content = await loadBlogContent(locale);
    const ids = new Set(before.map(([, id]) => id));
    assert.deepEqual(content.articles.filter(article => ids.has(article.id)).map(article => article.id), before.map(([, id]) => id));
    for (const [, id, expected] of before) {
      const article = content.articles.find(article => article.id === id);
      assert.ok(article, `${locale}/${id} removed`);
      assert.equal(hash(article), expected, `${locale}/${id} changed`);
    }
  }
  for (const [id, expected] of baseline.metadata) assert.equal(hash(blogMetadata(id)), expected, `${id} metadata changed`);
});

test("eight new native trend articles have fixed dates, substantive text and three visible FAQs", async () => {
  for (const [locale, market, id] of topics) {
    const content = await loadBlogContent(locale);
    const article = content.articles.find(article => article.id === id);
    assert.ok(article, id);
    assert.equal(article.faq.length, 3);
    assert.ok(article.description.length <= 160, `${id}: description exceeds the SSR limit`);
    assert.equal(blogMetadata(id).publishedAt, published);
    assert.equal(blogMetadata(id).updatedAt, published);
    assert.equal(MARKET_BLOG_MANIFEST[id].market, market);
    const prose = [article.intro, ...article.sections.flatMap(section => [...section.paragraphs, ...(section.items || [])]), ...article.faq.flatMap(faq => [faq.question, faq.answer])].join(" ");
    const words = [...new Intl.Segmenter(locale, { granularity: "word" }).segment(prose)].filter(part => part.isWordLike).length;
    assert.ok(words >= 600 && words <= 900, `${id}: ${words} words`);
    assert.ok(article.sources && article.sources.length >= 2 && article.sources.length <= 4, id);
    assert.ok(article.links.some(link => link.route.startsWith("station:")), id);
    for (const language of BLOG_LOCALES) assert.equal(blogAvailable(id, language), language === locale);
  }
  for (const locale of BLOG_LOCALES) assert.equal(blogIndexUpdated(locale), ["de", "fr", "en"].includes(locale) ? published : "2026-10-27T00:00:00+01:00");
});

test("editorial station routes accept only exact verified identities", () => {
  for (const [locale, slug, expected] of [
    ["de", "orf-radio-vorarlberg", "/de/sender/orf-radio-vorarlberg"],
    ["de", "orf-hitradio-o3", "/de/sender/orf-hitradio-o3"],
    ["de", "deutschlandfunk", "/de/sender/deutschlandfunk"],
    ["de", "wdr-2-rheinland", "/de/sender/wdr-2-rheinland"],
    ["fr", "france-inter", "/fr/station/france-inter"],
    ["en", "bbc-radio-4", "/en/station/bbc-radio-4"],
    ["en", "espn-radio", "/en/station/espn-radio"],
    ["tr", "kral-fm", "/tr/istasyon/kral-fm"],
  ] as const) assert.equal(blogExplorePath(`station:${slug}`, locale), expected);
  for (const route of ["station:", "station:other", "station:../admin", "station:%2fadmin", "station:bbc-radio-4/extra", "station:bbc-radio-4?x=1", "station:bbc-radio-4#play", "station://example.org", "station:bbc-radio-4-extra"]) {
    assert.equal(blogExplorePath(route as never, "en"), null, route);
  }
});
