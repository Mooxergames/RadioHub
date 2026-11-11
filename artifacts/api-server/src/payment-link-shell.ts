import type { RequestHandler } from 'express';

interface PaymentAssets { scripts: string; styles: string; preloads: string }
const PRIVATE_PAYMENT_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
};

export const paymentLinkPrivacy: RequestHandler = (req, res, next) => {
  if (/^\/pay\/?$/.test(req.path)) res.set(PRIVATE_PAYMENT_HEADERS);
  next();
};

function localBuildTags(html: string, tag: 'script' | 'link'): string {
  const tags: string[] = Array.from(html.matchAll(tag === 'script' ? /<script\b[^>]*>\s*<\/script>/gi : /<link\b[^>]*>/gi), match => match[0]);
  return tags.filter(value => {
    const path = value.match(/\b(?:src|href)="([^"]+)"/i)?.[1];
    return path && /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path);
  }).join('\n');
}

/** Payment links must not inherit public-page advertising/analytics bootstraps. */
export function createPaymentLinkShellHandler(loadAssets: () => PaymentAssets): RequestHandler {
  return (_req, res) => {
    res.set(PRIVATE_PAYMENT_HEADERS);
    const assets = loadAssets();
    const scripts = localBuildTags(assets.scripts, 'script');
    if (!scripts) return void res.status(503).set('Retry-After', '30').type('text/plain').send('Payment page unavailable');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="megaradio-payment-shell" content="isolated"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Payment details | MegaRadio</title><link rel="icon" href="/favicon.ico">${localBuildTags(assets.styles, 'link')}${localBuildTags(assets.preloads, 'link')}</head><body><div id="root"></div>${scripts}</body></html>`);
  };
}
