import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  BLOG_IDS,
  BLOG_LOCALES,
  BLOG_ARTICLE_IDS,
  BLOG_LABELS,
  MARKET_BLOG_MANIFEST,
  blogIdsForLocale,
  blogAvailable,
  blogAlternates,
  blogMetadata,
  blogIndexUpdated,
  blogLanguage,
  isCoreBlogId,
  isSafeBlogSource,
  blogImage,
  blogPath,
  parseBlogPath,
} from "@workspace/seo-shared/blog-manifest";
import {
  loadBlogContent,
  buildBlogSeo,
  buildBlogSchema,
  validateMarketArticles,
} from "@workspace/seo-shared/blog";
import {
  renderBlogHtml,
  blogExplorePath,
} from "@workspace/seo-shared/blog-html";
import { getLanguageFromPath } from "@workspace/seo-shared/seo-config";
import {
  generateOrganizationSchema,
  generateWebSiteSchema,
  generateDeveloperOrganizationSchema,
} from "@workspace/seo-shared/structured-data";
import {
  translateUrl,
  reverseTranslateUrl,
  normalizeUrlForLanguage,
} from "@workspace/seo-shared/url-translations";
import { buildLocalizedUrl } from "../src/seo/url-helpers";
import { buildBlogSitemap } from "../src/seo/blog-sitemap";

for (const locale of BLOG_LOCALES)
  test(`complete native blog content + SEO contract: ${locale}`, async () => {
    const content = await loadBlogContent(locale);
    assert.deepEqual(
      content.articles.slice(-10).map((a) => a.id),
      [...BLOG_IDS],
    );
    assert.deepEqual(
      content.articles.map((a) => a.id).sort(),
      blogIdsForLocale(locale).sort(),
    );
    assert.ok(
      content.articles
        .slice(0, -10)
        .every((article) => !isCoreBlogId(article.id)),
    );
    const indexSchema = buildBlogSchema({ locale, content }) as any[];
    assert.deepEqual(
      indexSchema[1].mainEntity.itemListElement.map((entry: any) => entry.url),
      content.articles.map(
        (article) => `https://themegaradio.com${blogPath(locale, article.id)}`,
      ),
    );
    assert.equal(
      Object.values(content.ui).filter(
        (v) => typeof v !== "string" || !v.trim(),
      ).length,
      0,
    );
    assert.equal(
      new Set(content.articles.map((a) => a.seoTitle)).size,
      content.articles.length,
    );
    assert.equal(
      new Set(content.articles.map((a) => a.description)).size,
      content.articles.length,
    );
    const english = locale === "en" ? null : await loadBlogContent("en");
    for (const article of content.articles) {
      const page = { locale, content, article };
      assert.ok(
        article.title.length >= 8 && article.seoTitle.length <= 70,
        article.id,
      );
      assert.ok(
        article.description.length >= 55 && article.description.length <= 175,
        `${article.id} description`,
      );
      assert.ok(
        article.imageAlt.length >=
          (!isCoreBlogId(article.id) && ["ja", "zh", "ko"].includes(locale)
            ? 8
            : 12),
      );
      assert.ok(
        article.sections.length >= 4 &&
          article.sections.every((s) => s.heading && s.paragraphs.length),
      );
      assert.ok(article.sections.some((s) => s.items && s.items.length >= 3));
      assert.ok(
        article.faq.length >= (isCoreBlogId(article.id) ? 2 : 3) &&
          article.links.length >= 3,
        article.id,
      );
      for (const link of article.links)
        assert.ok(
          blogExplorePath(link.route, locale),
          `${article.id}: ${link.route}`,
        );
      for (const id of article.relatedIds || [])
        assert.ok(blogAvailable(id, locale), `${article.id}: related ${id}`);
      const prose = [
        article.intro,
        ...article.sections.flatMap((s) => [
          ...s.paragraphs,
          ...(s.items || []),
        ]),
        ...article.faq.flatMap((f) => [f.question, f.answer]),
      ].join(" ");
      assert.ok(
        prose.length >= (["ja", "zh", "ko"].includes(locale) ? 700 : 1400),
        `${article.id} substantive prose`,
      );
      if (english)
        assert.notEqual(
          article.intro,
          english.articles.find((a) => a.id === article.id)?.intro,
        );
      const seo = buildBlogSeo(page);
      assert.equal(
        seo.canonical,
        `https://themegaradio.com${blogPath(locale, article.id)}`,
      );
      assert.deepEqual(seo.hreflangs, blogAlternates(article.id));
      assert.equal(
        seo.hreflangs?.find(
          (h) => h.hreflang === blogLanguage(locale, article.id),
        )?.url,
        seo.canonical,
      );
      assert.equal(seo.noIndex, false);
      assert.equal(seo.ogType, "article");
      const schema = buildBlogSchema(page) as any[];
      assert.equal(schema[1]["@type"], "BlogPosting");
      assert.equal(schema[1].inLanguage, blogLanguage(locale, article.id));
      assert.equal(schema[1].headline, article.title);
      assert.equal(schema[1].description, article.description);
      assert.equal(schema[1].image.caption, article.imageAlt);
      const metadata = blogMetadata(article.id);
      assert.equal(schema[1].datePublished, metadata.publishedAt);
      assert.equal(schema[1].dateModified, metadata.updatedAt);
      assert.ok(Object.isFrozen(metadata));
      assert.equal(schema[1].image.url, seo.ogImage);
      assert.ok(!schema.some((node) => node["@type"] === "FAQPage"));
      assert.equal(
        metadata.publishedAt.slice(0, 10),
        isCoreBlogId(article.id) ? "2026-09-25" : "2026-10-27",
      );
      if (!isCoreBlogId(article.id) && article.market)
        assert.equal(article.market, MARKET_BLOG_MANIFEST[article.id].market);
      if (article.imageId) assert.equal(article.imageId, metadata.imageId);
      if (!isCoreBlogId(article.id))
        assert.equal(
          seo.ogLocale,
          `${locale}_${MARKET_BLOG_MANIFEST[article.id].market}`,
        );
      else if (["en", "de", "pt", "zh"].includes(locale))
        assert.equal(
          seo.ogLocale,
          { en: "en_US", de: "de_DE", pt: "pt_PT", zh: "zh_CN" }[
            locale as "en" | "de" | "pt" | "zh"
          ],
        );
      const html = renderBlogHtml(page);
      assert.ok(html.includes(`lang="${blogLanguage(locale, article.id)}"`));
      assert.ok(html.includes(`datetime="${metadata.updatedAt}"`));
      const escaped = (s: string) =>
        s.replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c]!,
        );
      for (const faq of article.faq) {
        assert.ok(
          html.includes(
            `<h3>${escaped(faq.question)}</h3><p>${escaped(faq.answer)}</p>`,
          ),
          article.id,
        );
      }
      for (const source of article.sources || []) {
        assert.ok(isSafeBlogSource(source.url));
        assert.ok(html.includes(`href="${escaped(source.url)}"`));
        assert.ok(html.includes(escaped(source.name)));
      }
      assert.equal((html.match(/<h1>/g) || []).length, 1);
      assert.equal(
        (html.match(/<section id="section-/g) || []).length,
        article.sections.length,
      );
      assert.ok(
        html.includes(`dir="${["ar", "he"].includes(locale) ? "rtl" : "ltr"}"`),
      );
      assert.ok(
        html.includes('fetchpriority="high"') && html.includes("srcset="),
      );
      const path = blogPath(locale, article.id);
      const clean = `/blog/${article.id}`;
      assert.equal(getLanguageFromPath(path).language, locale);
      assert.equal(translateUrl(clean, locale), clean);
      assert.equal(reverseTranslateUrl(clean, locale), clean);
      assert.equal(normalizeUrlForLanguage(path, locale).normalized, path);
      assert.equal(
        buildLocalizedUrl(
          clean,
          locale,
          undefined,
          new Map([[`${locale}:blog`, "do-not-translate"]]),
        ),
        path,
      );
    }
    assert.equal(
      (
        renderBlogHtml({ locale, content }).match(
          /class="radio-journal-card"/g,
        ) || []
      ).length,
      content.articles.length,
    );
  });

test("invalid or unsupported editorial routes never silently become the blog index", () => {
  for (const path of [
    "/de/blog/missing",
    "/en/blog/radio-data-usage/extra",
    "/nl/blog",
    "/en/blog/%3Cscript%3E",
  ])
    assert.equal(parseBlogPath(path), null);
});

test("editorial sitemap preserves 140 editions and lists only actual market editions", () => {
  const xml = buildBlogSitemap();
  assert.equal(XMLValidator.validate(xml), true);
  const entries = new XMLParser({ ignoreAttributes: false }).parse(xml).urlset
    .url;
  const expected = 154 + Object.keys(MARKET_BLOG_MANIFEST).length;
  assert.equal(entries.length, expected);
  assert.equal(new Set(entries.map((entry: any) => entry.loc)).size, expected);
  let images = 0;
  for (const entry of entries) {
    const route = parseBlogPath(new URL(entry.loc).pathname)!;
    const alternates = [entry["xhtml:link"]].flat();
    assert.deepEqual(
      alternates.map((alt: any) => ({
        hreflang: alt["@_hreflang"],
        url: alt["@_href"],
      })),
      blogAlternates(route.id).map(({ hreflang, url }) => ({ hreflang, url })),
    );
    assert.equal(
      entry.lastmod,
      route.id
        ? blogMetadata(route.id).updatedAt
        : blogIndexUpdated(route.locale),
    );
    assert.ok(alternates.some((alt: any) => alt["@_href"] === entry.loc));
    assert.ok(parseBlogPath(new URL(entry.loc).pathname));
    if (entry["image:image"]) {
      images++;
      assert.match(entry["image:image"]["image:loc"], /-1200.webp$/);
    }
  }
  assert.equal(images, 140 + Object.keys(MARKET_BLOG_MANIFEST).length);
});

test("every unavailable market/locale combination is rejected, without English fallbacks", () => {
  assert.equal(Object.keys(MARKET_BLOG_MANIFEST).length, 40);
  assert.equal(
    BLOG_LOCALES.reduce(
      (sum, locale) => sum + blogIdsForLocale(locale).length,
      0,
    ),
    180,
  );
  for (const [id, edition] of Object.entries(MARKET_BLOG_MANIFEST)) {
    for (const locale of BLOG_LOCALES) {
      const route = parseBlogPath(`/${locale}/blog/${id}`);
      assert.equal(!!route, locale === edition.locale, `${locale}/${id}`);
    }
  }
});

test("topic images exist, have explicit correct dimensions, and stay lightweight", async () => {
  for (const id of BLOG_ARTICLE_IDS)
    for (const width of [640, 1200] as const) {
      const file = new URL(
        `../../megaradio/public${blogImage(id, width)}`,
        import.meta.url,
      );
      const data = await readFile(file);
      const metadata = await sharp(data).metadata();
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, width === 640 ? 336 : 630);
      assert.ok((await stat(file)).size < 45_000, id);
    }
});

test("unsafe sources, duplicate editions and unregistered content cannot enter the catalog", async () => {
  const core = (await loadBlogContent("en")).articles[0];
  const article = {
    ...core,
    id: "kral-fm-canli-dinle-sorunlari" as const,
    sources: [{ name: "Reference", url: "https://example.org/reference" }],
  };
  assert.doesNotThrow(() => validateMarketArticles("tr", [article]));
  for (const invalid of [
    null,
    {},
    42,
    "article",
    [null],
    [42],
    [[]],
    [{ id: article.id }],
    [{ ...article, sections: [null] }],
    [{ ...article, faq: [{ question: "Question", answer: "" }] }],
    [{ ...article, links: [{ route: "home" }] }],
    [{ ...article, relatedIds: ["missing"] }],
    [{ ...article, sources: [{ name: "Reference", url: null }] }],
  ])
    assert.throws(() => validateMarketArticles("tr", invalid));
  assert.throws(() => validateMarketArticles("en", [article]));
  assert.throws(() => validateMarketArticles("tr", [article, article]));
  for (const url of [
    "javascript:alert(1)",
    "http://example.org",
    "//example.org",
    "https://u:p@example.org",
    "https://example.org/\npath",
    "https:\\example.org",
  ]) {
    assert.equal(isSafeBlogSource(url), false);
    assert.throws(() =>
      validateMarketArticles("tr", [
        { ...article, sources: [{ name: "Unsafe", url }] },
      ]),
    );
  }
  for (const route of [
    "genre:../admin",
    "genre:%2fadmin",
    "blog:missing",
    "station:other",
    "//example.org",
    "https://example.org",
    "regions/../admin",
  ])
    assert.equal(blogExplorePath(route as any, "tr"), null);
  assert.equal(
    blogExplorePath("blog:radio-data-usage", "tr"),
    "/tr/blog/radio-data-usage",
  );
  assert.equal(
    blogExplorePath("blog:kral-fm-canli-dinle-sorunlari", "en"),
    null,
  );
  assert.equal(
    blogExplorePath("station:kral-fm", "tr"),
    "/tr/istasyon/kral-fm",
  );
});

test("untrusted text cannot become executable editorial HTML", async () => {
  const content = structuredClone(await loadBlogContent("en"));
  content.articles[0].title = "<img src=x onerror=alert(1)>";
  content.articles[0].imageAlt = '" onload="alert(1)';
  const html = renderBlogHtml({
    locale: "en",
    content,
    article: content.articles[0],
  });
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes('alt="" onload='));
});

// Real renderer entrypoint: every article works without station DB access,
// regardless of preference cookies, and returns the same visible/schema text.
let omitCoreArticle = false;
let failBlogLoad = false;
mock.module("@workspace/seo-shared/blog", {
  namedExports: {
    loadBlogContent: async (locale: (typeof BLOG_LOCALES)[number]) => {
      if (failBlogLoad)
        throw new Error("Editorial chunk temporarily unavailable");
      const content = await loadBlogContent(locale);
      return omitCoreArticle
        ? {
            ...content,
            articles: content.articles.filter(
              (a) => a.id !== "radio-data-usage",
            ),
          }
        : content;
    },
    buildBlogSeo,
    buildBlogSchema,
  },
});
mock.module("../src/data/postgres-localization-store", {
  namedExports: {
    pgLocalization: () => {
      throw new Error("Blog must not need DB");
    },
  },
});
mock.module("../src/data/postgres-content-store", {
  namedExports: { pgSeoMetadata: async () => null },
});
mock.module("../src/performance-cache", {
  namedExports: {
    performanceCache: { getPageData: () => null, getStats: () => ({}) },
    PerformanceCache: class {},
    deepFreeze: <T>(v: T) => v,
  },
});
test("SSR entrypoint renders every actual edition and rejects absent editions", async () => {
  const { SeoRenderer } = await import("../src/seo-renderer");
  const renderer = new SeoRenderer();
  for (const locale of BLOG_LOCALES)
    for (const id of blogIdsForLocale(locale)) {
      const result = await renderer.renderStaticPage(
        blogPath(locale, id),
        "https://themegaradio.com",
        locale === "en" ? "tr" : "en",
      );
      assert.equal(result.language, blogLanguage(locale, id));
      assert.equal(result.pageData.pageType, "blog");
      const html = renderer.generateHtmlBody({
        pageType: "blog",
        language: locale,
        translations: {},
        additionalData: result.pageData.additionalData,
      });
      const head = renderer.generateHtmlHead(
        result.seoTags,
        result.language,
        {},
        result.cleanPath,
        undefined,
        undefined,
        result.pageData,
      );
      assert.ok(html.includes("<h1>"));
      assert.ok(head.includes("BlogPosting"));
      assert.ok(head.includes("/blog.css"));
      assert.ok(!head.includes('themegaradio.com/zh-Hant-HK/'));
      const structured = renderer.generateStructuredData(
        result.seoTags,
        result.language,
        {},
        result.cleanPath,
        undefined,
        undefined,
        result.pageData.additionalData,
      );
      assert.deepEqual(structured.global, [
        generateWebSiteSchema("themegaradio.com", locale, {}),
        generateOrganizationSchema("themegaradio.com", locale, {}),
        generateDeveloperOrganizationSchema(locale),
      ]);
      assert.equal(
        result.seoTags?.canonical,
        `https://themegaradio.com/${locale}/blog/${id}`,
      );
      assert.equal(result.pageData.notFound, false);
    }
  const missing = await renderer.renderStaticPage("/de/blog/missing");
  assert.equal(missing.pageData.httpNotFound, true);
  assert.equal(missing.seoTags.noIndex, true);
  for (const [id, edition] of Object.entries(MARKET_BLOG_MANIFEST)) {
    for (const locale of BLOG_LOCALES.filter(
      (locale) => locale !== edition.locale,
    )) {
      const absent = await renderer.renderStaticPage(`/${locale}/blog/${id}`);
      assert.equal(absent.pageData.httpNotFound, true);
      assert.equal(absent.seoTags.canonical, undefined);
      assert.deepEqual(absent.seoTags.hreflangs, []);
    }
  }
  omitCoreArticle = true;
  try {
    const absent = await renderer.renderStaticPage("/tr/blog/radio-data-usage");
    assert.equal(
      absent.pageData.httpNotFound,
      true,
      "content absence is guarded independently of route parsing",
    );
    assert.equal(absent.seoTags.noIndex, true);
  } finally {
    omitCoreArticle = false;
  }
  failBlogLoad = true;
  try {
    await assert.rejects(
      renderer.renderStaticPage("/en/blog/radio-data-usage"),
      /Editorial chunk temporarily unavailable/,
    );
  } finally {
    failBlogLoad = false;
  }
  for (const locale of BLOG_LOCALES) {
    const html = renderer.generateHtmlBody({
      pageType: "home",
      language: locale,
      translations: {},
      additionalData: {},
    });
    assert.ok(
      html.includes(`href="/${locale}/blog">${BLOG_LABELS[locale]}</a>`),
    );
  }
});
