import type { Request, Response, NextFunction } from 'express';
import { isPublicTvAccessRequest } from './public-tv-access';

/**
 * Geo-Block Middleware
 *
 * Rejects blocked requests with an uncacheable HTTP 403. Destroying the
 * connection here makes reverse proxies report a false origin outage (502).
 *
 * Source of truth: Cloudflare's `cf-ipcountry` request header (ISO-3166-1 alpha-2).
 * Cloudflare sets this on every request that hits our origin.
 *
 * To change the blocklist, edit BLOCKED_COUNTRIES below or set the
 * `BLOCKED_COUNTRIES` env var (comma-separated, e.g. "SG,TH,RU").
 */

const DEFAULT_BLOCKED = ['SG', 'TH'];

const BLOCKED_COUNTRIES: Set<string> = new Set(
  (process.env.BLOCKED_COUNTRIES
    ? process.env.BLOCKED_COUNTRIES.split(',')
    : DEFAULT_BLOCKED
  )
    .map(c => c.trim().toUpperCase())
    .filter(c => /^[A-Z]{2}$/.test(c))
);

// Production hosts that MUST go through Cloudflare. If a request claims
// one of these Host headers but has no `cf-ipcountry`, it is a direct
// origin connection (CF bypass attempt) -- reject it.
const PROTECTED_HOSTS: Set<string> = new Set(
  (process.env.PROTECTED_HOSTS ||
    'themegaradio.com,www.themegaradio.com,api.themegaradio.com,stream.themegaradio.com'
  )
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
);

// CF bypass detection is OFF by default. Railway's internal health checks
// and our own self-watchdog hit the container directly (not through CF), so
// they have NO cf-ipcountry header. Enabling CF-only enforcement here would
// kill those requests, fail health checks, and cause 502 Bad Gateway.
// Only enable via env if origin IP is genuinely public AND health checks
// have been allowlisted by path/source-IP.
const ENFORCE_CF_ONLY = process.env.ENFORCE_CF_ONLY === 'true';

// Read-only health probes must reach their downstream readiness/liveness checks.
const HEALTH_PATHS = new Set([
  '/healthz', '/health', '/ready', '/readyz', '/live', '/livez', '/status', '/ping',
]);

const PUBLIC_ASSOCIATION_PATHS = new Set([
  '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association',
]);

// Private/loopback IPs are always trusted (Railway internal network, localhost).
function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return false;
  if (ip === '::1' || ip.startsWith('::ffff:127.') || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] || '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 ULA
  if (ip.startsWith('fe80:')) return true; // IPv6 link-local
  return false;
}

let blockedCount = 0;
let bypassCount = 0;
let lastLoggedAt = 0;

function rejectRequest(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.status(403).type('text/plain').send('Forbidden');
}

function maybeFlushLog(): void {
  const now = Date.now();
  if (now - lastLoggedAt > 60_000) {
    if (blockedCount > 0 || bypassCount > 0) {
      console.log(
        `GEO-BLOCK: ${blockedCount} blocked-country responses, ${bypassCount} CF-bypass responses in last window ` +
        `(blocked=${Array.from(BLOCKED_COUNTRIES).join(',')})`
      );
    }
    blockedCount = 0;
    bypassCount = 0;
    lastLoggedAt = now;
  }
}

// Existing crawler UA exceptions preserve cross-region access. These strings
// are spoofable and are not identity verification or an authentication bypass.
const SEARCH_BOT_BYPASS_RE = /\b(googlebot|google-inspectiontool|google-extended|bingbot|yandexbot|slurp|duckduckbot|baiduspider|applebot|applebot-extended|sogou|petalbot|seznambot|naverbot|facebookexternalhit|twitterbot|linkedinbot|gptbot|chatgpt-user|oai-searchbot|ccbot|anthropic-ai|claude-web|claudebot|bytespider|perplexitybot|perplexity-user|cohere-ai|meta-externalagent|amazonbot|duckassistbot|youbot|diffbot)\b/i;

export function geoBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cc = String(
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase();

  // Preserve the existing UA-based crawler exception; this is not bot verification.
  const ua = String(req.headers['user-agent'] || '');
  if (SEARCH_BOT_BYPASS_RE.test(ua)) {
    next();
    return;
  }

  const isRead = req.method === 'GET' || req.method === 'HEAD';
  const isHealth = isRead && HEALTH_PATHS.has(req.path);
  const isPublicAssociation = isRead && PUBLIC_ASSOCIATION_PATHS.has(req.path);

  // App-link verification is public metadata, not authenticated application data.
  if (BLOCKED_COUNTRIES.size > 0 && cc && BLOCKED_COUNTRIES.has(cc)
    && !isHealth && !isPublicAssociation
    && !isPublicTvAccessRequest(req.method, req.path)) {
    blockedCount++;
    maybeFlushLog();
    rejectRequest(res);
    return;
  }

  // 2. Optional CF bypass detection — OFF by default. When enabled, blocks
  //    requests to production hosts that arrive without cf-ipcountry.
  //    Always exempts: health-check paths, private/loopback source IPs
  //    (Railway internal network, container self-pings).
  if (ENFORCE_CF_ONLY && !cc) {
    const host = String(req.headers.host || '').toLowerCase().split(':')[0];
    const srcIp = (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const isInternal = isPrivateOrLoopback(srcIp);
    if (host && PROTECTED_HOSTS.has(host) && !isHealth && !isInternal) {
      bypassCount++;
      maybeFlushLog();
      rejectRequest(res);
      return;
    }
  }

  // Preserve the existing country variation hint. Denials must never be cached;
  // a CDN's actual cache-key policy is configured separately from this header.
  res.setHeader('Vary', appendVary(res.getHeader('Vary'), 'CF-IPCountry'));

  next();
}

function appendVary(existing: number | string | string[] | undefined, header: string): string {
  if (!existing) return header;
  const list = (Array.isArray(existing) ? existing.join(', ') : String(existing))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!list.some(h => h.toLowerCase() === header.toLowerCase())) list.push(header);
  return list.join(', ');
}

export function getBlockedCountries(): string[] {
  return Array.from(BLOCKED_COUNTRIES);
}

export function getProtectedHosts(): string[] {
  return Array.from(PROTECTED_HOSTS);
}
