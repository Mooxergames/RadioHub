/** Read-only public snapshots, no database or authenticated production API.
 * Run with Node 24: node --import tsx scripts/preview-oe3-editorial.ts */
import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getStationEditorial } from '@workspace/seo-shared/station-editorial';
import { renderStationEditorialHtml } from '@workspace/seo-shared/station-editorial-html';
import { renderStationBootstrap } from '../src/seo/station-bootstrap';

const port = Number(process.env.PORT || 22541);
process.env.PORT = String(port);
process.env.BASE_PATH = '/';
process.env.VITE_API_BASE_URL = '';
process.env.VITE_STREAM_PROXY_URL = '';
const root = fileURLToPath(new URL('../../megaradio/', import.meta.url));
process.chdir(root);
const require = createRequire(new URL('../../megaradio/package.json', import.meta.url));
const { createServer: createViteServer } = await import(pathToFileURL(require.resolve('vite')).href);
const origin = 'https://themegaradio.com';
const readPublic = async (path: string) => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Public preview snapshot ${path}: ${response.status}`);
  return response.json();
};
const station = await readPublic('/api/station/orf-hitradio-o3');
const german = await readPublic('/api/translations/de');
const english = await readPublic('/api/translations/en');
const related = await readPublic('/api/stations/precomputed?countryName=Austria&page=1&limit=30&slim=1');
const absoluteImages = (row: any) => {
  const result = structuredClone(row);
  for (const key of ['favicon', 'localImagePath']) {
    if (typeof result[key] === 'string' && result[key].startsWith('/')) result[key] = origin + result[key];
  }
  if (result.logoAssets) for (const key of ['webp48', 'webp96', 'webp256']) {
    if (result.logoAssets[key]?.startsWith('/')) result.logoAssets[key] = origin + result.logoAssets[key];
  }
  return result;
};
const oe3 = absoluteImages(station);
const relatedStations = (related.data || []).map(absoluteImages);
const editorial = getStationEditorial(oe3, 'de');
if (!editorial) throw new Error('The public station does not match the approved Ö3 identity.');
const escape = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const app = express();
const http = createServer(app);
const localOrigin = `http://127.0.0.1:${port}`;
const reports: Record<string, unknown>[] = [];
const scenario = (req: express.Request) => {
  const url = new URL(req.get('referer') || req.originalUrl, localOrigin);
  return url.origin === localOrigin ? url.searchParams : new URLSearchParams();
};
const previewStation = (row: any, parameters: URLSearchParams) => row?._id === oe3._id && parameters.get('preview-stream') === 'offline'
  ? { ...row, url: `${localOrigin}/__preview/unavailable.mp3`, urlResolved: `${localOrigin}/__preview/unavailable.mp3` }
  : row;
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; media-src 'self' https: blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'self'");
  next();
});
// These fixtures run only in this loopback preview, never in the production server.
app.get('/__preview/unavailable.mp3', (_req, res) => res.status(503).end());
app.get('/__preview/reports', (_req, res) => res.json({ simulated: true, reports }));
app.post('/api/stations/report-error', express.json({ limit: '8kb' }), (req, res) => {
  if (req.get('origin') !== localOrigin) { res.status(403).end(); return; }
  if (scenario(req).get('preview-report') === 'fail') { res.status(503).json({ error: 'Simulated local failure' }); return; }
  if (req.body?.stationId !== oe3._id || req.body?.errorType !== 'USER_REPORTED_PLAYBACK') {
    res.status(400).json({ error: 'Outside this preview fixture' }); return;
  }
  const errorId = `local-preview-${Date.now()}-${reports.length}`;
  reports.push({ errorId, stationId: oe3._id, errorType: req.body.errorType });
  if (reports.length > 20) reports.shift();
  res.json({ success: true, errorId });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') { res.status(403).json({ message: 'Read-only local preview' }); return; }
  if (req.path.startsWith('/stream/')) { res.status(503).end(); return; }
  if (req.path.startsWith('/station/')) {
    const identity = req.path.slice('/station/'.length);
    const row = identity === oe3.slug || identity === oe3._id ? oe3
      : relatedStations.find((item: any) => item.slug === identity || item._id === identity);
    res.status(row ? 200 : 404).json(previewStation(row, scenario(req)) || { message: 'Outside this local preview' }); return;
  }
  if (req.path === '/stations/precomputed') { res.json({ data: relatedStations, pagination: { total: relatedStations.length, page: 1, totalPages: 1 } }); return; }
  if (req.path.startsWith('/translations/de')) { res.json(german); return; }
  if (req.path.startsWith('/translations/en')) { res.json(english); return; }
  if (req.path.endsWith('/user-rating')) { res.json({ rating: null }); return; }
  if (req.path.endsWith('/ratings')) { res.json({ stats: { averageRating: 0, totalRatings: 0 } }); return; }
  if (req.path === '/auth/me') { res.status(401).json({ message: 'Local preview has no account session' }); return; }
  if (req.path === '/location') { res.json({ country: 'Austria', countryCode: 'AT' }); return; }
  res.json([]);
});
const vite = await createViteServer({
  root, configFile: root + 'vite.config.ts', appType: 'custom',
  server: { middlewareMode: true, hmr: { server: http }, host: '127.0.0.1' },
});
app.use(vite.middlewares);
app.get('/', (_req, res) => res.redirect('/de/sender/orf-hitradio-o3'));
app.get('/de/sender/:slug', async (req, res, next) => {
  try {
    const row = req.params.slug === oe3.slug ? oe3 : relatedStations.find((item: any) => item.slug === req.params.slug);
    const current = previewStation(row, new URL(req.originalUrl, localOrigin).searchParams);
    if (!current) { res.status(404).send('Not included in this local preview'); return; }
    const content = getStationEditorial(current, 'de');
    const muteFixture = req.query['preview-muted'] === '1'
      ? `<script>document.addEventListener('play',function(event){if(event.target instanceof HTMLMediaElement)event.target.muted=true;},true);</script>` : '';
    const initial = content ? `<main><h1>${escape(current.name)}</h1><p>${escape(content.summary)}</p><section><h2>Weitere Radiosender aus Österreich</h2><ul>${relatedStations.filter((item: any) => item._id !== current._id).slice(0, 12).map((item: any) => `<li><a href="/de/sender/${escape(item.slug)}">${escape(item.name)}</a></li>`).join('')}</ul></section>${renderStationEditorialHtml(current, 'de')}</main>` : '';
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(current.name)} | MegaRadio Vorschau</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;background:#0e0e0e;color:#fff}</style></head><body><div id="root">${initial}</div>${renderStationBootstrap(current, 'de')}<script>window.__INITIAL_LANGUAGE__='de';window.__INITIAL_TRANSLATIONS__=${JSON.stringify(german).replace(/</g, '\\u003c')};</script>${muteFixture}<script type="module" src="/src/main.tsx"></script></body></html>`;
    res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
  } catch (error) { next(error); }
});
http.listen(port, '127.0.0.1', () => console.log(`Ö3 local preview: http://127.0.0.1:${port}/de/sender/orf-hitradio-o3`));
const stop = async () => { await vite.close(); http.close(() => process.exit(0)); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
