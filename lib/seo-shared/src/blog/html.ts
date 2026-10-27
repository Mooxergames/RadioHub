import { translateUrl } from "../url-translations";
import { blogBreadcrumbs, type BlogPageData } from "./index";
import {
  BLOG_LABELS,
  blogLocales,
  blogLanguage,
  blogMetadata,
  blogIndexUpdated,
  blogAvailable,
  isCoreBlogId,
  isSafeBlogSource,
  BLOG_SOURCES,
  BLOG_RELATED,
  blogPath,
  blogImage,
} from "./manifest";
import type { BlogArticle, BlogLocale } from "./types";
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function blogExplorePath(
  route: BlogArticle["links"][number]["route"],
  locale: BlogLocale,
): string | null {
  if (route.startsWith("blog:")) {
    const id = route.slice(5);
    return blogAvailable(id, locale) ? blogPath(locale, id) : null;
  }
  if (route.startsWith("station:")) {
    return route === "station:kral-fm"
      ? `/${locale}${translateUrl("/station/kral-fm", locale)}`
      : null;
  }
  if (
    route.startsWith("genre:") &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.slice(6))
  )
    return null;
  if (
    !route.startsWith("genre:") &&
    !["home", "genres", "regions", "applications", "search"].includes(route)
  )
    return null;
  const path =
    route === "home"
      ? ""
      : route.startsWith("genre:")
        ? `/genres/${route.slice(6)}`
        : `/${route}`;
  return `/${locale}${path ? translateUrl(path, locale) : ""}`;
}
export function renderBlogHtml(page: BlogPageData): string {
  const { locale, content, article } = page;
  const { ui } = content;
  const updatedAt = article
    ? blogMetadata(article.id).updatedAt
    : blogIndexUpdated(locale);
  const sources =
    article?.sources ??
    (article && isCoreBlogId(article.id) ? BLOG_SOURCES : []);
  const relatedIds =
    article?.relatedIds ??
    (article && isCoreBlogId(article.id) ? BLOG_RELATED[article.id] : []);
  const related = relatedIds
    .filter((id) => id !== article?.id && blogAvailable(id, locale))
    .flatMap((id) => content.articles.filter((item) => item.id === id));
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(updatedAt));
  const cards = (articles: BlogArticle[]) =>
    `<div class="radio-journal-grid">${articles.map((entry, i) => `<a class="radio-journal-card" href="${blogPath(locale, entry.id)}"><img src="${blogImage(entry.id, 640)}" alt="${esc(entry.imageAlt)}" width="640" height="336" loading="${!article && i === 0 ? "eager" : "lazy"}" fetchpriority="${!article && i === 0 ? "high" : "auto"}" decoding="async"><div><${article ? "h3" : "h2"}>${esc(entry.title)}</${article ? "h3" : "h2"}><p>${esc(entry.description)}</p><span>${esc(ui.read)} <b aria-hidden="true">↗</b></span></div></a>`).join("")}</div>`;
  const breadcrumbs = `<nav aria-label="breadcrumb"><ol class="radio-journal-crumbs">${blogBreadcrumbs(
    page,
  )
    .map(
      (item, i, items) =>
        `<li>${i === items.length - 1 ? `<span aria-current="page">${esc(item.name)}</span>` : `<a href="${esc(item.path)}">${esc(item.name)}</a>`}</li>`,
    )
    .join("")}</ol></nav>`;
  const languages = `<nav class="radio-journal-languages" aria-label="${esc(ui.language)}">${blogLocales(
    article?.id,
  )
    .map(
      (lang) =>
        `<a href="${blogPath(lang, article?.id)}" lang="${blogLanguage(lang, article?.id)}" hreflang="${blogLanguage(lang, article?.id)}"${lang === locale ? ' aria-current="page"' : ""}>${esc(BLOG_LABELS[lang])}</a>`,
    )
    .join("")}</nav>`;
  const body = article
    ? `<article><header class="radio-journal-heading"><a class="radio-journal-eyebrow" href="${blogPath(locale)}">${esc(BLOG_LABELS[locale])}</a><h1>${esc(article.title)}</h1><p class="radio-journal-intro">${esc(article.intro)}</p><div class="radio-journal-byline"><span>${esc(ui.author)}</span><span>${esc(ui.updated)} <time datetime="${updatedAt}">${esc(date)}</time></span></div></header>
    <img class="radio-journal-hero" src="${blogImage(article.id)}" srcset="${blogImage(article.id, 640)} 640w, ${blogImage(article.id)} 1200w" sizes="(max-width: 760px) 100vw, 1100px" width="1200" height="630" alt="${esc(article.imageAlt)}" fetchpriority="high">
    <div class="radio-journal-layout"><aside class="radio-journal-toc"><h2>${esc(ui.contents)}</h2><ol>${article.sections.map((section, i) => `<li><a href="#section-${i + 1}">${esc(section.heading)}</a></li>`).join("")}</ol></aside><div class="radio-journal-prose">${article.sections.map((section, i) => `<section id="section-${i + 1}"><h2>${esc(section.heading)}</h2>${section.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${section.items?.length ? `<ul>${section.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}</section>`).join("")}
    <section><h2>${esc(ui.questions)}</h2>${article.faq.map((item) => `<h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p>`).join("")}</section>
    <section class="radio-journal-explore"><h2>${esc(ui.explore)}</h2>${article.links
      .map((link) => {
        const href = blogExplorePath(link.route, locale);
        return href
          ? `<a href="${esc(href)}">${esc(link.label)} <span aria-hidden="true">→</span></a>`
          : "";
      })
      .join("")}</section>
    <section class="radio-journal-notes"><h2>${esc(ui.sources)}</h2><ul>${sources
      .filter((source) => isSafeBlogSource(source.url))
      .map(
        (source) =>
          `<li><a href="${esc(source.url)}" rel="noopener" target="_blank">${esc(source.name)}</a></li>`,
      )
      .join(
        "",
      )}</ul><p>${esc(ui.editorialNote)}</p></section></div></div></article>${related.length ? `<section class="radio-journal-related"><h2>${esc(ui.related)}</h2>${cards(related)}</section>` : ""}`
    : `<header class="radio-journal-heading"><span class="radio-journal-eyebrow">MegaRadio</span><h1>${esc(ui.title)}</h1><p class="radio-journal-intro">${esc(ui.description)}</p></header>${cards(content.articles)}<p class="radio-journal-disclosure">${esc(ui.editorialNote)}</p>`;
  return `<main class="radio-journal" lang="${blogLanguage(locale, article?.id)}" dir="${locale === "ar" || locale === "he" ? "rtl" : "ltr"}">${breadcrumbs}${body}${languages}</main>`;
}
