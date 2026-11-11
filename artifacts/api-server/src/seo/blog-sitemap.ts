import {
  BLOG_LOCALES,
  blogIdsForLocale,
  blogAlternates,
  blogMetadata,
  blogIndexUpdated,
  blogImage,
  blogPath,
  BLOG_SITEMAP_UPDATED,
} from "@workspace/seo-shared/blog-manifest";
import { LEGACY_STATION_GUIDES, LEGACY_GUIDE_REVIEWED_AT } from '@workspace/seo-shared/legacy-station-guides';

export const EDITORIAL_SITEMAP_UPDATED = [BLOG_SITEMAP_UPDATED, LEGACY_GUIDE_REVIEWED_AT].sort().at(-1)!;

/** Editorial availability is independent of station DB and language quality gates. */
export function buildBlogSitemap(): string {
  const origin = "https://themegaradio.com";
  const urls = BLOG_LOCALES.flatMap((locale) =>
    [undefined, ...blogIdsForLocale(locale)].map((id) => {
      const alternates = blogAlternates(id).map(
        ({ hreflang, url }) =>
          `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}"/>`,
      ).join("");
      const updatedAt = id ? blogMetadata(id, locale).updatedAt : blogIndexUpdated(locale);
      return `<url><loc>${origin}${blogPath(locale, id)}</loc><lastmod>${updatedAt}</lastmod>${alternates}${id ? `<image:image><image:loc>${origin}${blogImage(id)}</image:loc></image:image>` : ""}</url>`;
    }),
  );
  urls.push(...LEGACY_STATION_GUIDES.map(guide => `<url><loc>${origin}${guide.path}</loc><lastmod>${LEGACY_GUIDE_REVIEWED_AT}</lastmod></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("\n")}</urlset>`;
}
