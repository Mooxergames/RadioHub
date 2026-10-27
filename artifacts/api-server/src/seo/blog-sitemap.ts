import {
  BLOG_LOCALES,
  blogIdsForLocale,
  blogAlternates,
  blogMetadata,
  blogIndexUpdated,
  blogImage,
  blogPath,
} from "@workspace/seo-shared/blog-manifest";

/** Editorial availability is independent of station DB and language quality gates. */
export function buildBlogSitemap(): string {
  const origin = "https://themegaradio.com";
  const urls = BLOG_LOCALES.flatMap((locale) =>
    [undefined, ...blogIdsForLocale(locale)].map((id) => {
      const alternates = blogAlternates(id).map(
        ({ hreflang, url }) =>
          `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}"/>`,
      ).join("");
      const updatedAt = id ? blogMetadata(id).updatedAt : blogIndexUpdated(locale);
      return `<url><loc>${origin}${blogPath(locale, id)}</loc><lastmod>${updatedAt}</lastmod>${alternates}${id ? `<image:image><image:loc>${origin}${blogImage(id)}</image:loc></image:image>` : ""}</url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("\n")}</urlset>`;
}
