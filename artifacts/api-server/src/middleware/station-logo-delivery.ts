import type { RequestHandler, Response as ExpressResponse } from 'express';
import sharp from 'sharp';
import { getPublicStationLogoKey, STATION_LOGOS_S3_BASE_URL } from '@workspace/seo-shared/station-logo-url';

const MAX_BYTES = 2 * 1024 * 1024;
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff' };
const CONDITIONAL_HEADERS = ['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since'];
const BYTE_RANGE_SYNTAX = /^bytes=(?:\d+-\d*|-\d+)(?:\s*,\s*(?:\d+-\d*|-\d+))*$/i;
const HTTP_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function sendError(res: ExpressResponse, status: number, total?: number) {
  res.removeHeader('Expires');
  res.removeHeader('Content-Length');
  res.set({ ...SECURITY_HEADERS, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow' });
  if (status === 503) res.set('Retry-After', '120');
  if (status === 405) res.set('Allow', 'GET, HEAD');
  if (total !== undefined) res.set('Content-Range', `bytes */${total}`);
  res.status(status).type('text/plain').send(status === 404 ? 'Logo not found' : 'Logo unavailable');
}

function rangeIsCurrent(value: string | undefined, headers: Headers): boolean {
  if (value === undefined) return true;
  if (value.startsWith('W/')) return false;
  if (value.startsWith('"')) return value === headers.get('etag');
  const lastModified = headers.get('last-modified');
  const requested = Date.parse(value);
  return !!lastModified && HTTP_DATE.test(value) && Number.isFinite(requested)
    && new Date(requested).toUTCString() === value
    && requested === Date.parse(lastModified);
}

interface Options {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  deadlineMs?: number;
  maxConcurrent?: number;
  imageDecoder?: typeof sharp;
}

export function createStationLogoDelivery(options: Options = {}): RequestHandler {
  const base = options.baseUrl || STATION_LOGOS_S3_BASE_URL;
  // Server configuration, never request input. Raw checks precede URL parsing.
  const validBase = /^https:\/\/[a-z0-9][a-z0-9.-]*\.s3\.[a-z0-9-]+\.amazonaws\.com\/station-logos\/?$/.test(base)
    && !/[\\%?#\u0000-\u0020\u007f]/.test(base) && !base.includes('..');
  const origin = validBase ? new URL(base).origin : null;
  const fetchImage = options.fetch || globalThis.fetch;
  const decodeImage = options.imageDecoder || sharp;
  const deadlineMs = options.deadlineMs ?? 30_000;
  const maxConcurrent = options.maxConcurrent ?? 16;
  let active = 0;

  return async (req, res, next) => {
    const rawPath = req.originalUrl.split('?', 1)[0];
    const key = getPublicStationLogoKey(rawPath);
    if (!key) {
      if (/[\\%#\u0000-\u0020\u007f]/.test(rawPath) || rawPath.includes('..')
        || /\/logo-(?:48|96|256)\.webp$/.test(rawPath)) return sendError(res, 404);
      return next();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405);
    if (!origin || active >= maxConcurrent) return sendError(res, 503);
    active++;
    const controller = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => {
      controller.abort();
      // Respond on time even if native work is queued. Its slot stays occupied
      // until the real promise settles and finally completes cleanup.
      if (!res.destroyed && !res.headersSent) sendError(res, 503);
    }, deadlineMs);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', disconnect);
    let upstream: globalThis.Response | undefined;
    let decoder: ReturnType<typeof sharp> | undefined;
    try {
      const headers = new Headers();
      for (const name of CONDITIONAL_HEADERS) {
        const value = req.get(name);
        if (value && value.length > 2048) return sendError(res, 431);
        if (value) headers.set(name, value);
      }
      // Fetch one complete version. Express's range parser slices those exact
      // validated bytes, so stale If-Range can never inherit S3's ignored header.
      upstream = await fetchImage(`${origin}/${key}`, {
        method: req.method, redirect: 'manual', signal: controller.signal, headers,
      });
      controller.signal.throwIfAborted();
      if (upstream.status === 404 || upstream.status === 412) return sendError(res, upstream.status);
      if (upstream.status !== 200 && upstream.status !== 304) return sendError(res, 503);
      const copyHeaders = () => {
        res.removeHeader('Expires');
        res.removeHeader('X-Robots-Tag');
        res.set(SECURITY_HEADERS);
        const cache = upstream!.headers.get('cache-control');
        res.set('Cache-Control', cache && /\bpublic\b/i.test(cache) && !/\b(?:private|no-store|no-cache)\b/i.test(cache)
          ? cache : cache ? 'no-store' : 'public, max-age=86400');
        for (const name of ['etag', 'last-modified']) {
          const value = upstream!.headers.get(name);
          if (value) res.set(name, value);
        }
      };
      if (upstream.status === 304) {
        if (!headers.has('if-none-match') && !headers.has('if-modified-since')) return sendError(res, 503);
        copyHeaders();
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Length');
        res.status(304).end();
        return;
      }
      const encoding = upstream.headers.get('content-encoding');
      const declaredLength = Number(upstream.headers.get('content-length'));
      if (!/^image\/webp(?:;|$)/i.test(upstream.headers.get('content-type') || '')
        || (encoding && encoding !== 'identity') || declaredLength > MAX_BYTES) return sendError(res, 503);
      if (req.method === 'HEAD') {
        copyHeaders();
        res.set({ 'Content-Type': 'image/webp', 'Accept-Ranges': 'bytes' });
        if (Number.isSafeInteger(declaredLength) && declaredLength > 0) res.set('Content-Length', String(declaredLength));
        res.status(200).end();
        return;
      }
      const reader = upstream.body?.getReader();
      if (!reader) return sendError(res, 503);
      const chunks: Buffer[] = [];
      let length = 0;
      try {
        for (;;) {
          const part = await reader.read();
          controller.signal.throwIfAborted();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > MAX_BYTES) throw new Error('Logo size limit');
          chunks.push(Buffer.from(part.value));
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = Buffer.concat(chunks, length);
      const remainingSeconds = Math.floor((deadlineMs - (Date.now() - started)) / 1000);
      if (!length || remainingSeconds < 1) return sendError(res, 503);
      const image = decoder = decodeImage(bytes, { limitInputPixels: 1024 * 1024, animated: true }).timeout({ seconds: remainingSeconds });
      const metadata = await image.metadata();
      controller.signal.throwIfAborted();
      if (metadata.format !== 'webp' || (metadata.pages || 1) !== 1) return sendError(res, 503);
      const decodeSeconds = Math.floor((deadlineMs - (Date.now() - started)) / 1000);
      if (decodeSeconds < 1) return sendError(res, 503);
      // Decode inside the concurrency slot, but return the unmodified file.
      await image.timeout({ seconds: decodeSeconds }).raw().toBuffer();
      controller.signal.throwIfAborted();
      let body = bytes;
      let range: { start: number; end: number } | undefined;
      if (BYTE_RANGE_SYNTAX.test(req.get('range') || '') && rangeIsCurrent(req.get('if-range'), upstream.headers)) {
        const ranges = req.range(length, { combine: true });
        if (ranges === -1) return sendError(res, 416, length);
        if (Array.isArray(ranges) && ranges.type.toLowerCase() === 'bytes' && ranges.length === 1) range = ranges[0];
      }
      copyHeaders();
      res.set({ 'Content-Type': 'image/webp', 'Accept-Ranges': 'bytes' });
      if (range) {
        body = bytes.subarray(range.start, range.end + 1);
        res.set('Content-Range', `bytes ${range.start}-${range.end}/${length}`);
      }
      res.status(range ? 206 : 200).send(body);
    } catch {
      if (!res.destroyed && !res.headersSent) sendError(res, 503);
    } finally {
      decoder?.destroy();
      controller.abort();
      try { if (upstream?.body && !upstream.body.locked) await upstream.body.cancel(); } catch {}
      clearTimeout(timer);
      res.removeListener('close', disconnect);
      active--;
    }
  };
}
