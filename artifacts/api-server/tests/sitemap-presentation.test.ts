import assert from 'node:assert/strict';
import { test } from 'node:test';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { SITEMAP_STYLESHEET_INSTRUCTION, withSitemapStylesheet } from '../src/seo/sitemap-presentation';

test('sitemap CSS instruction preserves all XML data and is idempotent', () => {
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://example.com/de/radio?a=1&amp;b=2</loc><lastmod>2026-01-01</lastmod><xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/radio"/><image:image><image:loc>https://example.com/logo.webp</image:loc><image:title>Radio &amp; Music</image:title></image:image></url></urlset>';
  const styled = withSitemapStylesheet(source);
  assert.equal(XMLValidator.validate(styled), true);
  assert.equal(styled.replace(`\n${SITEMAP_STYLESHEET_INSTRUCTION}`, ''), source);
  assert.equal(withSitemapStylesheet(styled), styled);
  assert.ok(styled.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n${SITEMAP_STYLESHEET_INSTRUCTION}\n`));
  const parser = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true, ignorePiTags: true });
  assert.deepEqual(parser.parse(styled), parser.parse(source));
});

test('sitemap presentation handles XML without a declaration or with a BOM', () => {
  for (const source of ['<urlset/>', '\uFEFF<?xml version="1.0"?><urlset/>']) {
    const styled = withSitemapStylesheet(source);
    assert.equal(XMLValidator.validate(styled), true);
    assert.equal(withSitemapStylesheet(styled), styled);
  }
});
