import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SeoHead } from "../src/components/seo/SeoHead";
import { buildBlogSeo, loadBlogContent } from "@workspace/seo-shared/blog";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

it("keeps article captions and dates aligned across SPA navigation and removes them on the index", async () => {
  const content = await loadBlogContent("tr");
  const article = content.articles.find(entry => entry.id === "radio-data-usage")!;
  const seoData = buildBlogSeo({ locale: "tr", content, article });
  const view = render(<SeoHead seoData={seoData} />);
  expect(document.querySelector('meta[property="og:image:alt"]')).toHaveAttribute("content", article.imageAlt);
  expect(document.querySelector('meta[name="twitter:image:alt"]')).toHaveAttribute("content", article.imageAlt);
  expect(document.querySelector('meta[property="article:modified_time"]')).toHaveAttribute("content", seoData.articleModifiedTime);
  const indexSeo = buildBlogSeo({ locale: "tr", content });
  view.rerender(<SeoHead seoData={indexSeo} />);
  expect(document.querySelectorAll('meta[property^="article:"]')).toHaveLength(0);
  expect(document.querySelector('meta[property="og:image:alt"]')).toHaveAttribute("content", indexSeo.ogImageAlt);
  view.rerender(<SeoHead seoData={{ title: "Other page", description: "Other page description" }} />);
  expect(document.querySelectorAll('meta[property="og:image:alt"], meta[name="twitter:image:alt"]')).toHaveLength(0);
});
