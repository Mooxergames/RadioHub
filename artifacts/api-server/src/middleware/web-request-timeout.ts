import type { RequestHandler } from 'express';
import type { ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

export const WEB_API_PROXY_TIMEOUTS = { timeout: 60_000, proxyTimeout: 58_000 } as const;

export const webRequestTimeout: RequestHandler = (req, res, next) => {
  if (/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|map|json)$/i.test(req.path)) return next();
  const requestStartedAt = Date.now();
  // Completed requests no longer emit IncomingMessage's timeout event.
  // The API proxy can still extend this socket's inactivity limit to 60s.
  res.setTimeout(30_000, () => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    console.error(`Request timeout after ${Date.now() - requestStartedAt}ms (socket limit ${req.socket.timeout}ms): ${req.method} ${req.path}`);
    res.setHeader('Retry-After', '120');
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Service temporarily unavailable - retry shortly');
  });
  next();
};

export function sendWebApiProxyError(res: ServerResponse | Socket): void {
  if (!('writeHead' in res) || res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(502, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Retry-After': '120',
  });
  res.end(JSON.stringify({ error: 'Backend API unavailable' }));
}
