import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBlogContent, buildBlogSeo, buildBlogSchema } from "@workspace/seo-shared/blog";
import { renderBlogHtml, blogExplorePath } from "@workspace/seo-shared/blog-html";
import { BLOG_LOCALES, BLOG_REVIEWED, blogMetadata, isCoreBlogId } from "@workspace/seo-shared/blog-manifest";

test("all 188 editions expose matching social image captions and article dates", async () => {
  let count = 0;
  for (const locale of BLOG_LOCALES) {
    const content = await loadBlogContent(locale);
    for (const article of content.articles) {
      const page = { locale, content, article };
      const seo = buildBlogSeo(page);
      const schema = buildBlogSchema(page) as any[];
      assert.equal(seo.ogImageAlt, article.imageAlt);
      assert.equal(seo.twitterImageAlt, article.imageAlt);
      assert.equal(seo.articlePublishedTime, schema[1].datePublished);
      assert.equal(seo.articleModifiedTime, schema[1].dateModified);
      count++;
    }
  }
  assert.equal(count, 188);
});

test("contextual links remain escaped, locale-correct and restricted to registered routes", async () => {
  for (const locale of ["tr", "de", "en"] as const) {
    const content = await loadBlogContent(locale);
    for (const article of content.articles) {
      const html = renderBlogHtml({ locale, content, article });
      if (isCoreBlogId(article.id)) assert.ok(article.sections.some(section => section.links?.some(link => link.route.startsWith("blog:"))));
      for (const section of article.sections) {
        for (const link of section.links || []) {
          const href = blogExplorePath(link.route, locale);
          assert.ok(href, `${locale}/${article.id}: ${link.route}`);
          assert.ok(html.includes(`href="${href}"`));
        }
      }
    }
    const article = structuredClone(content.articles.at(-1)!);
    article.sections[0].links = [
      { route: "station:../admin" as never, label: "invalid" },
      { route: "station:bbc-world-service", label: '<img src=x onerror="alert(1)">' },
    ];
    const html = renderBlogHtml({ locale, content, article });
    assert.ok(!html.includes('href="/admin"'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
  }
});

test("editorial dates advance only substantive editions and keep first publication dates", () => {
  assert.equal(blogMetadata("radio-data-usage", "tr").updatedAt, BLOG_REVIEWED);
  assert.equal(blogMetadata("radio-data-usage", "fr").updatedAt, "2026-09-25T00:00:00+02:00");
  assert.equal(blogMetadata("rock-radio-guide", "de").updatedAt, "2026-09-25T00:00:00+02:00");
  assert.equal(blogMetadata("radio-data-usage", "tr").publishedAt, "2026-09-25T00:00:00+02:00");
});

test("known dead source URLs are replaced with official working destinations", async () => {
  const german = await loadBlogContent("de");
  const japanese = await loadBlogContent("ja");
  assert.ok(german.articles.find(article => article.id === "vignette-2027-oesterreich-verkehrsradio")!.sources!.some(source => source.url === "https://oe3.orf.at/verkehr/"));
  assert.ok(japanese.articles.find(article => article.id === "late-night-radio-dates")!.sources!.some(source => source.url === "https://www.1242.com/timetable/"));
});
