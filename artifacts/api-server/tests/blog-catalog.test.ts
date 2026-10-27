import { test } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import {
  BLOG_IDS,
  BLOG_LOCALES,
  BLOG_ARTICLE_IDS,
  MARKET_BLOG_MANIFEST,
  BLOG_SITEMAP_UPDATED,
  blogAlternates,
  blogAvailable,
  blogIdsForLocale,
  blogImage,
  blogLanguage,
  blogMetadata,
  parseBlogPath,
} from "@workspace/seo-shared/blog-manifest";
import { buildBlogSitemap } from "../src/seo/blog-sitemap";
import { getKnownOgImageDimensions } from "@workspace/seo-shared/og-image-metadata";

test("catalog retains the original 140 editions and adds exactly 40 sparse market editions", () => {
  assert.equal(BLOG_IDS.length, 10);
  assert.equal(BLOG_ARTICLE_IDS.length, 50);
  assert.equal(Object.keys(MARKET_BLOG_MANIFEST).length, 40);
  assert.equal(
    BLOG_LOCALES.reduce(
      (count, locale) => count + blogIdsForLocale(locale).length,
      0,
    ),
    180,
  );
  for (const id of BLOG_ARTICLE_IDS) {
    const metadata = blogMetadata(id);
    assert.ok(Object.isFrozen(metadata));
    assert.ok(
      Date.parse(metadata.publishedAt) <= Date.parse(metadata.updatedAt),
    );
    assert.ok((BLOG_IDS as readonly string[]).includes(metadata.imageId));
    assert.deepEqual(
      getKnownOgImageDimensions(blogImage(id), "https://themegaradio.com"),
      { width: 1200, height: 630 },
    );
    for (const locale of BLOG_LOCALES) {
      assert.equal(
        !!parseBlogPath(`/${locale}/blog/${id}`),
        blogAvailable(id, locale),
      );
    }
  }
  for (const locale of BLOG_LOCALES)
    for (const id of BLOG_IDS) {
      assert.deepEqual(parseBlogPath(`/${locale}/blog/${id}`), { locale, id });
      assert.equal(blogMetadata(id).publishedAt, "2026-09-25T00:00:00+02:00");
      assert.equal(blogMetadata(id).updatedAt, "2026-09-25T00:00:00+02:00");
      assert.equal(blogImage(id), `/images/blog/${id}-1200.webp`);
      assert.equal(blogImage(id, 640), `/images/blog/${id}-640.webp`);
    }
});

test("Hong Kong articles keep /zh URLs but use their genuine language tag; core Chinese is unchanged", () => {
  for (const id of [
    "rthk-catchup-dates",
    "cantonese-opera-radio-excerpts",
    "rthk-accessible-player",
  ] as const) {
    assert.equal(blogLanguage("zh", id), "zh-Hant-HK");
    assert.deepEqual(blogAlternates(id), [
      {
        lang: "zh-Hant-HK",
        hreflang: "zh-Hant-HK",
        url: `https://themegaradio.com/zh/blog/${id}`,
      },
    ]);
    assert.equal(MARKET_BLOG_MANIFEST[id].market, "HK");
  }
  assert.equal(blogLanguage("zh", "radio-data-usage"), "zh");
  assert.equal(blogAlternates("radio-data-usage").length, 15);
});

test("194 sitemap URLs have only real reciprocal alternates and stable per-edition dates", () => {
  const entries = new XMLParser({ ignoreAttributes: false }).parse(
    buildBlogSitemap(),
  ).urlset.url;
  assert.equal(entries.length, 194);
  const byUrl = new Map<string, any>(
    entries.map((entry: any) => [entry.loc, entry]),
  );
  assert.equal(byUrl.size, 194);
  assert.equal(BLOG_SITEMAP_UPDATED, "2026-10-27T00:00:00+01:00");
  for (const entry of entries) {
    const route = parseBlogPath(new URL(entry.loc).pathname)!;
    if (route.id) assert.equal(entry.lastmod, blogMetadata(route.id).updatedAt);
    for (const alternate of [entry["xhtml:link"]].flat()) {
      const target = byUrl.get(alternate["@_href"]);
      assert.ok(target, alternate["@_href"]);
      assert.ok(
        [target["xhtml:link"]]
          .flat()
          .some((back: any) => back["@_href"] === entry.loc),
      );
    }
  }
});
