import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { getKnownOgImageDimensions } from '@workspace/seo-shared/og-image-metadata';
import { BLOG_IDS } from '@workspace/seo-shared/blog-manifest';

const origin = 'https://themegaradio.com';

test('only same-origin known OG assets receive their exact measured dimensions', () => {
  for (const image of ['/images/logo-icon.webp', `${origin}/images/logo-icon.webp?v=1`]) {
    assert.deepEqual(getKnownOgImageDimensions(image, origin), { width: 194, height: 180 });
  }
  for (const image of ['/api/og-image', '/api/og-image/', `${origin}/api/og-image/fixture-fm`, '/api/og-image/%C5%9Feker-fm']) {
    assert.deepEqual(getKnownOgImageDimensions(image, origin), { width: 1200, height: 630 });
  }
  for (const image of [
    'https://external.example/images/logo-icon.webp', 'https://external.example/api/og-image',
    'https://external.example/api/og-image/fixture-fm', '//external.example/images/logo-icon.webp',
    'http://themegaradio.com/images/logo-icon.webp', 'https://themegaradio.com:8443/api/og-image',
    `${origin}/custom/logo-icon.webp`, '/custom/og-image', '/images/custom.webp',
    '/blog/images/radio.jpg', '/api/og-image/fixture/nested', '/api/og-image/%2f',
    '/api/og-image/%ZZ', '/api/og-image/%00', `${origin}/api/og-image-malicious`,
    'data:image/png;base64,AAAA', 'https://user:pass@themegaradio.com/images/logo-icon.webp',
  ]) {
    assert.equal(getKnownOgImageDimensions(image, origin), undefined, image);
  }
  assert.equal(getKnownOgImageDimensions('/api/og-image', 'not-an-origin'), undefined);
});

test('every manifest blog WebP has measured dimensions on this origin only', async () => {
  for (const id of BLOG_IDS) {
    for (const width of [640, 1200] as const) {
      const path = `/images/blog/${id}-${width}.webp`;
      const metadata = await sharp(new URL(`../../megaradio/public${path}`, import.meta.url).pathname).metadata();
      const dimensions = getKnownOgImageDimensions(path, origin);
      assert.deepEqual(dimensions, { width: metadata.width, height: metadata.height });
      assert.deepEqual(getKnownOgImageDimensions(origin + path + '?v=1', origin), dimensions);
      assert.equal(getKnownOgImageDimensions('https://external.example' + path, origin), undefined);
    }
  }
  assert.equal(getKnownOgImageDimensions('/images/blog/unreviewed-guide-1200.webp', origin), undefined);
});
