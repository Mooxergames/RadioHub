import type {
  BlogLocaleContent,
  BlogLocale,
  BlogArticle,
  BlogId,
} from "./types";
import {
  blogAlternates,
  blogAvailable,
  blogMetadata,
  blogLanguage,
  isCoreBlogId,
  isSafeBlogSource,
  BLOG_LABELS,
  blogPath,
  blogImage,
} from "./manifest";
import type { SeoMetaTags } from "../seo-config";
export type { BlogArticle, BlogLocaleContent } from "./types";

// Explicit per-locale imports keep core and market article bodies out of the
// player / homepage JavaScript bundle.
const loaders = {
  en: () => import("./locales/en.json"),
  de: () => import("./locales/de.json"),
  tr: () => import("./locales/tr.json"),
  fr: () => import("./locales/fr.json"),
  es: () => import("./locales/es.json"),
  pt: () => import("./locales/pt.json"),
  it: () => import("./locales/it.json"),
  ru: () => import("./locales/ru.json"),
  ar: () => import("./locales/ar.json"),
  he: () => import("./locales/he.json"),
  zh: () => import("./locales/zh.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  hi: () => import("./locales/hi.json"),
};
const marketLoaders = {
  en: () => import("./market/en.json"),
  de: () => import("./market/de.json"),
  tr: () => import("./market/tr.json"),
  fr: () => import("./market/fr.json"),
  es: () => import("./market/es.json"),
  pt: () => import("./market/pt.json"),
  it: () => import("./market/it.json"),
  ru: () => import("./market/ru.json"),
  ar: () => import("./market/ar.json"),
  he: () => import("./market/he.json"),
  zh: () => import("./market/zh.json"),
  ja: () => import("./market/ja.json"),
  ko: () => import("./market/ko.json"),
  hi: () => import("./market/hi.json"),
};
const text = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text);

export function validateMarketArticles(
  locale: BlogLocale,
  articles: unknown,
): asserts articles is BlogArticle[] {
  if (!Array.isArray(articles))
    throw new Error(`Invalid blog array: ${locale}`);
  const seen = new Set<string>();
  for (const article of articles) {
    if (
      !object(article) ||
      !text(article.id) ||
      !blogAvailable(article.id, locale) ||
      isCoreBlogId(article.id) ||
      seen.has(article.id)
    )
      throw new Error(`Invalid market blog edition: ${locale}`);
    seen.add(article.id);
    if (
      ![
        article.title,
        article.seoTitle,
        article.description,
        article.primaryKeyword,
        article.imageAlt,
        article.intro,
      ].every(text) ||
      !strings(article.secondaryKeywords) ||
      !Array.isArray(article.sections) ||
      !article.sections.length ||
      article.sections.some(
        (section) =>
          !object(section) ||
          !text(section.heading) ||
          !strings(section.paragraphs) ||
          !section.paragraphs.length ||
          (section.items !== undefined && !strings(section.items)),
      ) ||
      !Array.isArray(article.faq) ||
      !article.faq.length ||
      article.faq.some(
        (faq) => !object(faq) || !text(faq.question) || !text(faq.answer),
      ) ||
      !Array.isArray(article.links) ||
      !article.links.length ||
      article.links.some(
        (link) => !object(link) || !text(link.route) || !text(link.label),
      ) ||
      (article.relatedIds !== undefined &&
        (!strings(article.relatedIds) ||
          article.relatedIds.some((id) => !blogAvailable(id, locale)))) ||
      (article.market !== undefined && !text(article.market))
    )
      throw new Error(`Invalid blog content shape: ${locale}/${article.id}`);
    if (
      article.imageId !== undefined &&
      article.imageId !== blogMetadata(article.id).imageId
    )
      throw new Error(`Blog image mapping mismatch: ${locale}/${article.id}`);
    if (
      !Array.isArray(article.sources) ||
      !article.sources.length ||
      article.sources.some(
        (source) =>
          !source ||
          typeof source.name !== "string" ||
          !source.name.trim() ||
          typeof source.url !== "string" ||
          !isSafeBlogSource(source.url),
      )
    )
      throw new Error(`Invalid blog sources: ${locale}/${article.id}`);
  }
}
export async function loadBlogContent(
  locale: BlogLocale,
): Promise<BlogLocaleContent> {
  const [core, market] = await Promise.all([
    loaders[locale](),
    marketLoaders[locale](),
  ]);
  const content = core.default as BlogLocaleContent;
  const articles: unknown = market.default;
  validateMarketArticles(locale, articles);
  return { ...content, articles: [...articles, ...content.articles] };
}
export interface BlogPageData {
  locale: BlogLocale;
  content: BlogLocaleContent;
  article?: BlogArticle;
}
const origin = "https://themegaradio.com";
export function buildBlogSeo({
  locale,
  content,
  article,
}: BlogPageData): SeoMetaTags {
  const title = article?.seoTitle || `${BLOG_LABELS[locale]} | MegaRadio`;
  const description = article?.description || content.ui.description;
  const canonical = origin + blogPath(locale, article?.id);
  const image = origin + blogImage(article?.id || "listen-to-radio-online");
  const language = blogLanguage(locale, article?.id);
  const market =
    article && !isCoreBlogId(article.id) ? blogMetadata(article.id) : undefined;
  const ogLocales: Record<BlogLocale, string> = {
    en: "en_US",
    de: "de_DE",
    tr: "tr_TR",
    fr: "fr_FR",
    es: "es_ES",
    pt: "pt_PT",
    it: "it_IT",
    ru: "ru_RU",
    ar: "ar_AR",
    he: "he_IL",
    zh: "zh_CN",
    ja: "ja_JP",
    ko: "ko_KR",
    hi: "hi_IN",
  };
  return {
    title,
    description,
    canonical,
    language,
    domain: "themegaradio.com",
    robots: "index, follow, max-image-preview:large",
    noIndex: false,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonical,
    ogType: article ? "article" : "website",
    ogImage: image,
    ogLocale:
      market && "market" in market
        ? `${locale}_${market.market}`
        : ogLocales[locale],
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: image,
    hreflangs: blogAlternates(article?.id),
  };
}
export function blogBreadcrumbs({ locale, content, article }: BlogPageData) {
  return [
    { name: content.ui.home, path: `/${locale}` },
    { name: BLOG_LABELS[locale], path: blogPath(locale) },
    ...(article
      ? [{ name: article.title, path: blogPath(locale, article.id) }]
      : []),
  ];
}
export function buildBlogSchema(page: BlogPageData): object[] {
  const { locale, article, content } = page;
  const url = origin + blogPath(locale, article?.id);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: blogBreadcrumbs(page).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: origin + item.path,
    })),
  };
  if (!article)
    return [
      breadcrumb,
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: content.ui.title,
        description: content.ui.description,
        inLanguage: locale,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: content.articles.map((entry, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: entry.title,
            url: origin + blogPath(locale, entry.id),
          })),
        },
      },
    ];
  return [
    breadcrumb,
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: article.title,
      description: article.description,
      inLanguage: blogLanguage(locale, article.id),
      datePublished: blogMetadata(article.id).publishedAt,
      dateModified: blogMetadata(article.id).updatedAt,
      image: {
        "@type": "ImageObject",
        url: origin + blogImage(article.id),
        width: 1200,
        height: 630,
        caption: article.imageAlt,
      },
      author: {
        "@type": "Organization",
        name: content.ui.author,
        url: `${origin}/${locale}/blog`,
      },
      publisher: {
        "@type": "Organization",
        name: "MegaRadio",
        url: origin,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/favicon.png`,
          width: 64,
          height: 64,
        },
      },
      keywords: [article.primaryKeyword, ...article.secondaryKeywords],
    },
  ];
}
