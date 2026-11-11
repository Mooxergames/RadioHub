import type { Express } from 'express';
import { buildLlmsTxtCoreBody, isLlmsLocale, LLMS_ORIGIN } from './llms-txt-content';

const registered = new WeakSet<Express>();
const discoveryRegistered = new WeakSet<Express>();

export function registerLlmsTxtRoutes(app: Express, options: { homeDiscovery?: boolean } = {}): void {
  if (options.homeDiscovery && !discoveryRegistered.has(app)) {
    discoveryRegistered.add(app);
    app.use((req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const locale = req.path.slice(1);
        if (req.path === '/' || isLlmsLocale(locale)) {
          const path = req.path === '/' ? '/llms.txt' : `/${locale}/llms.txt`;
          res.append('Link', `<${LLMS_ORIGIN}${path}>; rel="describedby"`);
        }
      }
      next();
    });
  }
  if (registered.has(app)) return;
  registered.add(app);
  app.use(async (req, res, next) => {
    // Claim only this document family before language redirects or HTML.
    let decodedPath = req.path;
    try { decodedPath = decodeURIComponent(req.path); } catch { /* Invalid guide spellings still get a real 404. */ }
    const documentPath = /(?:^|\/)llms?\.txt(?:\/|$)/i;
    if (!documentPath.test(req.path.replaceAll('\\', '/')) && !documentPath.test(decodedPath.replaceAll('\\', '/'))) return next();
    res.type('text/plain').setHeader('X-Content-Type-Options', 'nosniff');
    const match = /^\/(?:([a-z]{2})\/)?(llms?\.txt)$/.exec(req.path);
    if (!match || (match[1] && !isLlmsLocale(match[1]))) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).send('LLM guide not found.'); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Allow', 'GET, HEAD');
      res.status(405).send('Method not allowed.'); return;
    }
    const locale = match[1] && isLlmsLocale(match[1]) ? match[1] : 'en';
    const canonical = `${LLMS_ORIGIN}${match[1] ? `/${locale}` : ''}/llms.txt`;
    res.setHeader('Content-Language', locale);
    res.setHeader('Link', `<${canonical}>; rel="canonical"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (match[2] === 'llm.txt') {
      res.setHeader('Location', canonical);
      res.status(301).send(`Moved permanently: ${canonical}\n`); return;
    }
    try {
      const { buildLlmsTxtBody } = await import('./llms-txt-builder');
      res.status(200).send(await buildLlmsTxtBody(LLMS_ORIGIN, locale, !match[1]));
    } catch {
      // This pure fallback cannot query PostgreSQL or change language.
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).send(buildLlmsTxtCoreBody(locale));
    }
  });
}
