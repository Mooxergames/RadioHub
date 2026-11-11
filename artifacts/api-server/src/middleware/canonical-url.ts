import type { RequestHandler } from 'express';
import { getRetiredLocaleFromPath } from '@workspace/seo-shared/seo-config';

// Shared by the production entry point and HTTP composition tests.
export const canonicalUrlMiddleware: RequestHandler = (req, res, next) => {
  // Skip in dev/preview and on health endpoints
  if (process.env.NODE_ENV === 'development' || req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
    return next();
  }
  if (req.path === '/health' || req.path === '/healthz') return next();

  const originalProtocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const originalHost = (req.get('host') || req.hostname).toLowerCase();
  const originalPath = req.path;

  let targetProtocol = originalProtocol;
  let targetHost = originalHost;
  let targetPath = originalPath;

  // 1. Enforce HTTPS after the development/localhost bypass above.
  if (originalProtocol === 'http') {
    targetProtocol = 'https';
  }

  // 2. www → non-www
  if (targetHost === 'www.themegaradio.com') {
    targetHost = 'themegaradio.com';
  }

  // 3. Strip trailing slash (except root, except files)
  if (targetPath.length > 1 && targetPath.endsWith('/') && !getRetiredLocaleFromPath(targetPath)) {
    const segs = targetPath.split('/');
    const lastSeg = segs[segs.length - 2];
    if (!lastSeg || !lastSeg.includes('.')) {
      targetPath = targetPath.slice(0, -1);
    }
  }

  // 4. Consolidate the legacy /pages/{privacy-policy,terms-and-conditions}
  //    duplicates onto the canonical clean URL. Both path shapes render the
  //    SAME component and each self-canonicals, so Google saw a duplicate-
  //    content pair with split link equity. Redirect the /pages/ form → the
  //    clean form (the one the sitemap advertises) so there is exactly one
  //    indexable legal URL. Preserves an optional /{lang} prefix.
  if (!getRetiredLocaleFromPath(targetPath)) targetPath = targetPath.replace(
    /^(\/[a-z]{2})?\/pages\/(privacy-policy|terms-and-conditions)$/,
    (_m, lang, slug) => `${lang || ''}/${slug}`,
  );

  const protocolChanged = targetProtocol !== originalProtocol;
  const hostChanged = targetHost !== originalHost;
  const pathChanged = targetPath !== originalPath;

  if (protocolChanged || hostChanged || pathChanged) {
    // Extract raw query from originalUrl. CRITICAL: do NOT compute it as
    // `req.url.slice(req.path.length)` — req.path is URL-decoded while
    // req.url is raw, so their lengths diverge for any path containing
    // percent-encoded characters. Using indexOf('?') on the raw originalUrl
    // is encoding-safe and preserves the query verbatim.
    const qIdx = req.originalUrl.indexOf('?');
    const query = qIdx >= 0 ? req.originalUrl.substring(qIdx) : '';
    // For protocol/host changes we must build absolute URL; otherwise
    // a relative path keeps the redirect cheap.
    const target = (protocolChanged || hostChanged)
      ? `${targetProtocol}://${targetHost}${targetPath}${query}`
      : `${targetPath}${query}`;
    return void res.redirect(301, target);
  }

  next();
};
