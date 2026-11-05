export const SITEMAP_STYLESHEET_INSTRUCTION = '<?xml-stylesheet type="text/css" href="/sitemap.css"?>';

/** Preserve sitemap bytes and namespaces; only the browser presentation changes. */
export function withSitemapStylesheet(xml: string): string {
  if (xml.includes(SITEMAP_STYLESHEET_INSTRUCTION)) return xml;
  const declaration = xml.match(/^(?:\uFEFF)?<\?xml\s[^?]*\?>/)?.[0];
  return declaration
    ? `${declaration}\n${SITEMAP_STYLESHEET_INSTRUCTION}${xml.slice(declaration.length)}`
    : `${SITEMAP_STYLESHEET_INSTRUCTION}\n${xml}`;
}

// CSS works with XML directly, without XSLT or JavaScript. Hidden extensions
// remain in the XML for crawlers; loc elements are selectable text, not links.
export const SITEMAP_STYLESHEET = `@namespace s url("http://www.sitemaps.org/schemas/sitemap/0.9");
@namespace xhtml url("http://www.w3.org/1999/xhtml");
@namespace image url("http://www.google.com/schemas/sitemap-image/1.1");

s|urlset, s|sitemapindex {
  display: block;
  max-width: 1100px;
  margin: 24px auto;
  padding: 0 16px;
  background: #fff;
  color: #202124;
  font: 14px/1.6 system-ui, sans-serif;
  letter-spacing: 0;
}
s|urlset::before, s|sitemapindex::before {
  display: block;
  padding: 0 0 16px;
  border-bottom: 2px solid #19754b;
  font-size: 24px;
  font-weight: 700;
  content: "XML Sitemap";
}
s|sitemapindex::before { content: "XML Sitemap Index"; }
s|url, s|sitemap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(10rem, 15rem);
  gap: 4px 16px;
  padding: 12px 8px;
  border-bottom: 1px solid #dadce0;
}
s|url:nth-child(even), s|sitemap:nth-child(even) { background: #f4f6f7; }
s|url > s|loc, s|sitemap > s|loc {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: text;
}
s|lastmod { display: block; overflow-wrap: anywhere; color: #50565d; }
s|changefreq, s|priority, xhtml|link, image|image { display: none; }
@media (max-width: 600px) {
  s|urlset, s|sitemapindex { margin: 12px auto; padding: 0 8px; }
  s|url, s|sitemap { grid-template-columns: minmax(0, 1fr); }
}
`;
