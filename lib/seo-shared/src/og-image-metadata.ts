import { BLOG_IDS } from './blog/types';

/** Only assets with a verified size on this origin may advertise dimensions. */
export function getKnownOgImageDimensions(image: string, origin: string): { width: number; height: number } | undefined {
  try {
    const base = new URL(origin);
    const url = new URL(image, base.origin);
    if (!['http:', 'https:'].includes(base.protocol) || url.origin !== base.origin || url.username || url.password) return undefined;
    if (url.pathname === '/images/logo-icon.webp') return { width: 194, height: 180 };
    for (const id of BLOG_IDS) {
      if (url.pathname === `/images/blog/${id}-1200.webp`) return { width: 1200, height: 630 };
      if (url.pathname === `/images/blog/${id}-640.webp`) return { width: 640, height: 336 };
    }
    if (url.pathname === '/api/og-image' || url.pathname === '/api/og-image/') return { width: 1200, height: 630 };
    const match = url.pathname.match(/^\/api\/og-image\/([^/]+)\/?$/);
    if (match) {
      const slug = decodeURIComponent(match[1]);
      if (slug && !/[\s/\\?#\u0000-\u001f\u007f-\u009f]/u.test(slug)) return { width: 1200, height: 630 };
    }
  } catch { /* Unknown or malformed URLs have no proven dimensions. */ }
  return undefined;
}
