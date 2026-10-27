import type { IncomingMessage, ServerResponse } from 'node:http';

export function publicImageProxyHeaders(
  upstream: Pick<IncomingMessage, 'statusCode' | 'headers'>,
  req: Pick<IncomingMessage, 'method' | 'url' | 'headers'> & { originalUrl?: string },
  res: Pick<ServerResponse, 'removeHeader'>,
) {
  const pathname = (req.originalUrl || req.url || '').split('?', 1)[0];
  if (!['GET', 'HEAD'].includes(req.method || '') || !pathname.startsWith('/api/image/')) return;
  const status = upstream.statusCode || 0;
  const contentType = String(upstream.headers['content-type'] || '');
  const image = /^image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon|vnd\.microsoft\.icon)(?:;|$)/i.test(contentType);
  // Express strips MIME from 304s. Only the image handler's successful binary
  // response retains identity encoding, public caching and Vary: Accept.
  const revalidatedImage = status === 304 && !!req.headers['if-none-match'] && !!upstream.headers.etag && (
    image || (!contentType && upstream.headers['content-encoding'] === 'identity'
      && /\bpublic\b/i.test(String(upstream.headers['cache-control'] || ''))
      && /(?:^|,)\s*Accept\s*(?:,|$)/i.test(String(upstream.headers.vary || '')))
  );
  if ((status >= 200 && status < 300 && image) || revalidatedImage) {
    delete upstream.headers['x-robots-tag'];
    res.removeHeader('X-Robots-Tag');
  }
}
