/** Loopback-only, read-only public snapshots; no DB, admin API or playback.
 * Node 24: PORT=22543 node --import tsx scripts/preview-reviewed-editorials.ts
 * PREVIEW_BUILT=1 serves the current index.html manifest entry without Vite client transforms.
 * PREVIEW_PATHS accepts a JSON array or comma-separated localized station paths. */
import express from 'express';
import compression from 'compression';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  getLanguageFromPath, getLocalizedStationDescription, getStationCountryIdentity,
  getStationCountryName, getStationCountryQuery, isActiveUiLanguage, isSafeStationDetailSlug,
} from '../../../lib/seo-shared/src/seo-config';
import { translateUrlSegment } from '../../../lib/seo-shared/src/url-translations';
import { getStationPageCopy, getStationRelatedHeading } from '../../../lib/seo-shared/src/station-page-copy';
import { renderStationBootstrap } from '../src/seo/station-bootstrap';

type Station = Record<string, any> & { _id: string; slug: string; name: string; country?: string; countryCode?: string };
type PreviewPage = { path: string; language: string; slug: string; station: Station; country: string };
const defaults = ['/de/sender/orf-hitradio-o3', '/de/sender/radio-eins', '/tr/istasyon/metro-fm', '/en/station/107-9-kbpi'];
const configured: unknown = process.env.PREVIEW_PATHS?.trim().startsWith('[')
  ? JSON.parse(process.env.PREVIEW_PATHS) : process.env.PREVIEW_PATHS?.split(',').map(path => path.trim()) || defaults;
if (!Array.isArray(configured) || !configured.length || configured.length > 128) {
  throw new Error('PREVIEW_PATHS must contain 1 to 128 exact station paths.');
}
const paths = [...new Set(configured as unknown[])].map(value => {
  if (typeof value !== 'string' || /[?#\\\s]/u.test(value)) throw new Error('Preview paths must be plain local pathnames.');
  const { language } = getLanguageFromPath(value);
  const parts = value.split('/');
  if (!isActiveUiLanguage(language) || parts.length !== 4 || parts[0] !== '' || parts[1] !== language
    || parts[2] !== translateUrlSegment('station', language) || !isSafeStationDetailSlug(parts[3])) {
    throw new Error(`Not a canonical localized station path: ${value}`);
  }
  return { path: value, language, slug: parts[3] };
});
const port = Number(process.env.PORT || 22543);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback preview PORT.');
const origin = 'https://themegaradio.com';
const localOrigin = `http://127.0.0.1:${port}`;
const built = process.env.PREVIEW_BUILT === '1';
const root = fileURLToPath(new URL('../../megaradio/', import.meta.url));
const builtRoot = join(root, 'dist/public');
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const editorialFile = fileURLToPath(new URL('../../../lib/seo-shared/src/station-editorial.ts', import.meta.url));
const editorialHtmlFile = fileURLToPath(new URL('../../../lib/seo-shared/src/station-editorial-html.ts', import.meta.url));
Object.assign(process.env, { PORT: String(port), BASE_PATH: '/', VITE_API_BASE_URL: '', VITE_STREAM_PROXY_URL: '', VITE_GTM_ENABLED: 'false' });
process.chdir(root);
const require = createRequire(new URL('../../megaradio/package.json', import.meta.url));
const { createServer: createViteServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { JSDOM } = require('jsdom');
type ManifestChunk = { file: string; isEntry?: boolean; css?: string[]; imports?: string[] };
async function readBuild() {
  const manifestPath = join(builtRoot, '.vite/manifest.json');
  const manifest: Record<string, ManifestChunk> = JSON.parse(await readFile(manifestPath, 'utf8'));
  const document = new JSDOM(await readFile(join(builtRoot, 'index.html'), 'utf8'));
  const entry = document.window.document.querySelector('script[type="module"][src]')?.getAttribute('src');
  const css = [...document.window.document.querySelectorAll('link[rel="stylesheet"][href]')].map((node: any) => node.getAttribute('href') as string);
  const preload = [...document.window.document.querySelectorAll('link[rel="modulepreload"][href]')].map((node: any) => node.getAttribute('href') as string);
  document.window.close();
  const asset = (path: string) => {
    if (!/^\/assets\/[\w.-]+\.(?:js|css)$/.test(path)) throw new Error(`Invalid built asset path: ${path}`);
    return path;
  };
  if (!entry || !manifest['index.html']?.isEntry || entry !== '/' + manifest['index.html'].file) {
    throw new Error('Build index.html and manifest entry do not match; wait for the final build.');
  }
  asset(entry); css.forEach(asset); preload.forEach(asset);
  const measure = async (key: string) => {
    const file = manifest[key]?.file;
    if (!file) throw new Error(`Build manifest is missing ${key}`);
    asset('/' + file);
    const bytes = await readFile(join(builtRoot, file));
    return { file: '/' + file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  };
  return { entry, css, preload, manifestModifiedAt: (await stat(manifestPath)).mtime.toISOString(),
    station: await measure('src/pages/stations/[id].tsx'), about: await measure('src/pages/about.tsx') };
}
if (built) await readBuild();

const snapshots = new Map<string, unknown>();
async function readPublic(path: string): Promise<any> {
  if (snapshots.has(path)) return snapshots.get(path);
  if (!/^\/api\/(?:station\/[^/?]+|translations\/[a-z]{2}|stations\/precomputed\?countryName=[^&]+&page=1&limit=60&slim=1)$/.test(path)) {
    throw new Error(`Outside the public snapshot allowlist: ${path}`);
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(origin + path, { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Public snapshot ${path}: ${response.status}`);
      const result = await response.json();
      snapshots.set(path, result);
      return result;
    } catch (error) {
      if (attempt >= 1) throw error;
      console.warn(`Retrying public preview snapshot: ${path}`);
    }
  }
}

const imageOrigins = new Set<string>();
function fixtureStation(row: Station): Station {
  const station = structuredClone(row);
  const image = (value: unknown) => {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, origin);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      imageOrigins.add(url.origin);
      return url.href;
    } catch { return ''; }
  };
  for (const key of ['favicon', 'localImagePath']) if (station[key]) station[key] = image(station[key]);
  if (station.logoAssets) for (const key of ['webp48', 'webp96', 'webp256']) {
    if (station.logoAssets[key]) station.logoAssets[key] = image(station.logoAssets[key]);
  }
  // Even an accidental player initialization cannot reach a production stream.
  station.url = station.urlResolved = `${localOrigin}/__preview/disabled-stream`;
  station.mergedUrls = [];
  return station;
}
const pages: PreviewPage[] = [];
const stations = new Map<string, Station>();
for (const route of paths) {
  const raw = await readPublic(`/api/station/${encodeURIComponent(route.slug)}`);
  if (typeof raw?._id !== 'string' || !raw.name || raw.slug !== route.slug) throw new Error(`Station identity mismatch: ${route.path}`);
  const station = fixtureStation(raw);
  stations.set(station._id, station);
  pages.push({ ...route, station, country: getStationCountryQuery(station) });
}
const translations = new Map<string, Record<string, string>>();
for (const language of new Set(['en', ...pages.map(page => page.language)])) {
  const dictionary = await readPublic(`/api/translations/${language}`);
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object') throw new Error(`Invalid translations: ${language}`);
  translations.set(language, dictionary);
}
const countries = new Map<string, { stations: Station[]; code?: string }>();
for (const page of pages) {
  if (!page.country || countries.has(page.country)) continue;
  const params = new URLSearchParams({ countryName: page.country, page: '1', limit: '60', slim: '1' });
  const related = await readPublic(`/api/stations/precomputed?${params}`);
  if (!Array.isArray(related?.data)) throw new Error(`Invalid related stations: ${page.country}`);
  const identity = getStationCountryIdentity(page.station);
  const rows = related.data.filter((row: Station) => row?._id && isSafeStationDetailSlug(row.slug)
    && (identity?.code ? getStationCountryIdentity(row)?.code === identity.code : getStationCountryQuery(row) === page.country)).map(fixtureStation);
  for (const station of rows) if (!stations.has(station._id)) stations.set(station._id, station);
  countries.set(page.country, { stations: rows, code: identity?.code });
}
const capturedAt = new Date().toISOString();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
// Keep production bundles byte-for-byte intact; guard only this local document.
const builtSafety = `<script>(function(){
  try { localStorage.setItem('megaradio:web-analytics-consent:v1', JSON.stringify({version:1,choice:'denied',updatedAt:Date.now()}));
    localStorage.removeItem('autoplayConsent'); localStorage.removeItem('backgroundPlayback'); } catch (_) {}
  try { Object.defineProperty(navigator,'globalPrivacyControl',{get:function(){return true;}}); } catch (_) {}
  for(var p=navigator;p;p=Object.getPrototypeOf(p)) { if(Object.prototype.hasOwnProperty.call(p,'serviceWorker')) { try { delete p.serviceWorker; } catch (_) {} } }
  navigator.sendBeacon=function(){return false;};
  HTMLMediaElement.prototype.play=function(){this.muted=true;this.pause();return Promise.reject(new DOMException('Playback disabled in local preview','NotAllowedError'));};
})();</script>`;
async function clientAssets() {
  if (!built) return { head: '', script: '<script type="module" src="/src/main.tsx"></script>' };
  const assets = await readBuild();
  return { head: assets.css.map(path => `<link rel="stylesheet" crossorigin href="${escape(path)}">`).join('')
    + assets.preload.map(path => `<link rel="modulepreload" crossorigin href="${escape(path)}">`).join(''),
    script: `${builtSafety}<script type="module" crossorigin src="${escape(assets.entry)}"></script>` };
}
const aboutMetadata = () => ({
  title: translations.get('en')?.about_mega_radio || 'About Mega Radio',
  description: translations.get('en')?.about_mega_radio_description || 'About Mega Radio.',
  canonical: `${localOrigin}/en/about`, robots: 'noindex, nofollow', noIndex: true, hreflangs: [],
});
const app = express();
app.disable('x-powered-by');
const http = createServer(app);
const pageForRequest = (req: express.Request) => {
  try {
    const referrer = new URL(req.get('referer') || '/', localOrigin);
    if (referrer.origin === localOrigin || referrer.origin === `http://localhost:${port}`) {
      return pages.find(page => page.path === referrer.pathname) || pages[0];
    }
  } catch { /* No trusted local route context. */ }
  return pages[0];
};
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'autoplay=(), camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${[...imageOrigins].join(' ')}; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}; media-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
  if (![new URL(localOrigin).host, `localhost:${port}`].includes(req.get('host') || '')) {
    res.status(403).json({ message: 'Loopback preview host only' }); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ message: 'Read-only local preview: writes are disabled' }); return;
  }
  next();
});
app.get('/__preview/disabled-stream', (_req, res) => res.status(503).end());
app.get(['/sw.js', '/service-worker.js'], (_req, res) => res.status(404).end());
app.use('/api', (req, res) => {
  const page = pageForRequest(req);
  const query = new URL(req.originalUrl, localOrigin).searchParams;
  if (req.path === '/auth/me') { res.status(401).json({ message: 'Local preview has no account session' }); return; }
  if (req.path.startsWith('/admin/') || req.path === '/admin') { res.status(403).json({ message: 'No admin API in this preview' }); return; }
  if (req.path === '/seo/page-data') {
    const url = new URL(query.get('url') || '/', localOrigin);
    if (url.origin === localOrigin && url.pathname === '/en/about') {
      res.json({ seoTags: aboutMetadata(), structuredData: { global: [], page: [] }, previewFixture: true }); return;
    }
    res.status(404).json({ message: 'SEO metadata outside the local fixture allowlist' }); return;
  }
  const stationMatch = /^\/station\/([^/]+)$/.exec(req.path);
  if (stationMatch) {
    const identity = decodeURIComponent(stationMatch[1]);
    const row = stations.get(identity) || [...stations.values()].find(station => station.slug === identity);
    res.status(row ? 200 : 404).json(row || { message: 'Outside the snapshot fixtures' }); return;
  }
  if (req.path === '/stations/precomputed') {
    const country = query.get('countryName');
    const pool = countries.get(!country || country === 'global' || country === 'all' ? page.country : country);
    if (!pool) { res.status(404).json({ message: 'Country outside the snapshot fixtures' }); return; }
    const limit = Math.max(1, Math.min(200, Number(query.get('limit')) || 30));
    const data = pool.stations.slice(0, limit);
    res.json({ data, pagination: { total: pool.stations.length, page: 1, totalPages: 1 }, previewFixture: true }); return;
  }
  const translationMatch = /^\/translations\/([a-z]{2})(?:\/critical)?$/.exec(req.path);
  if (translationMatch) {
    const dictionary = translations.get(translationMatch[1]);
    res.status(dictionary ? 200 : 404).json(dictionary || { message: 'Language outside the snapshot fixtures' }); return;
  }
  const ratingMatch = /^\/stations\/([^/]+)\/(user-rating|ratings)$/.exec(req.path);
  if (ratingMatch && stations.has(ratingMatch[1])) {
    const row = stations.get(ratingMatch[1])!;
    res.json(ratingMatch[2] === 'user-rating' ? { rating: null }
      : { stats: { averageRating: row.averageRating || 0, totalRatings: row.totalRatings || 0 } }); return;
  }
  if (req.path === '/location') {
    const countryCode = getStationCountryIdentity(page.station)?.code || '';
    res.json({ country: page.country, countryCode, location: { country: page.country, countryCode }, previewFixture: true }); return;
  }
  if (req.path === '/filters/countries') { res.json([...countries.keys()]); return; }
  if (req.path === '/countries') {
    res.json([...countries].map(([name, pool]) => ({ name, code: pool.code, stationCount: pool.stations.length }))); return;
  }
  if (['/advertisements', '/footer-social-media'].includes(req.path)) { res.json([]); return; }
  res.status(404).json({ message: 'GET endpoint outside the local fixture allowlist' });
});

// These replacements affect Vite's in-memory preview graph only, never source files.
const replacements: Record<string, string> = {
  'main.tsx': `import React from 'react'; import { createRoot } from 'react-dom/client';
    import App from '/src/App.tsx'; import '/src/index.css';
    createRoot(document.getElementById('root')).render(React.createElement(App));`,
  'components/PushNotificationBridge.tsx': 'export function PushNotificationBridge() { return null; }',
  'components/translation/TranslationPreloader.tsx': 'export function TranslationPreloader() { return null; }',
  'components/recommendations/RecommendationsPrefetcher.tsx': 'export function RecommendationsPrefetcher() { return null; }',
  'components/ad-carousel.tsx': 'export function AdCarousel() { return null; }',
  'components/ads/DeferredAdSenseUnit.tsx': 'export default function DeferredAdSenseUnit() { return null; }',
  'components/ads/AdSenseUnit.tsx': 'export default function AdSenseUnit() { return null; }',
  'hooks/use-analytics.tsx': 'export const useAnalytics = () => {};',
  'hooks/LazyGlobalPlayerProvider.tsx': `import React from 'react'; import { GlobalPlayerContext, shellDefaults } from './useGlobalPlayer.shell';
    export function LazyGlobalPlayerProvider({ children }) { return React.createElement(GlobalPlayerContext.Provider, { value: shellDefaults }, children); }`,
  'lib/backgroundAudio.ts': `export const initializeBackgroundPlayback = () => {};
    export const enableBackgroundPlayback = () => {}; export const disableBackgroundPlayback = () => {};
    export const isAutoplayAllowed = () => false; export const requestAutoplayPermission = async () => false;`,
};
const vite = await createViteServer({
  root, configFile: root + 'vite.config.ts', appType: 'custom',
  cacheDir: join(tmpdir(), `radiohub-reviewed-editorials-vite-${port}`),
  define: { 'import.meta.env.VITE_API_BASE_URL': '""', 'import.meta.env.VITE_STREAM_PROXY_URL': '""', 'import.meta.env.VITE_GTM_ENABLED': '"false"' },
  plugins: [{ name: 'read-only-editorial-preview', enforce: 'pre', transform(_source: string, id: string, options?: { ssr?: boolean }) {
    const filename = id.split('?')[0];
    if (options?.ssr && filename === root + 'src/hooks/useTranslation.ts') {
      return `const dictionary=${json(translations.get('en'))}; export function useTranslation(){return {language:'en',localeTranslations:dictionary,t:key=>dictionary[key]||key};}`;
    }
    if (options?.ssr && filename === root + 'src/components/SeoHead.tsx') return 'export function SeoHead(){return null;}';
    if (built) return null;
    return filename.startsWith(root + 'src/') ? replacements[filename.slice((root + 'src/').length)] ?? null : null;
  } }],
  server: { middlewareMode: true, host: '127.0.0.1', allowedHosts: ['127.0.0.1', 'localhost'],
    hmr: built ? false : { server: http, host: '127.0.0.1', port }, fs: { strict: true, allow: [workspace] } },
});
app.get('/__preview/status', async (_req, res, next) => {
  try {
    const { getStationEditorial } = await vite.ssrLoadModule(editorialFile);
    res.json({ capturedAt, readOnly: true, playback: false, mode: built ? 'built' : 'vite',
      build: built ? await readBuild() : null, controls: ['/en/about'], snapshotRequests: [...snapshots.keys()],
      pages: pages.map(page => ({ path: page.path, stationId: page.station._id, language: page.language,
        country: page.country, editorial: getStationEditorial(page.station, page.language, page.path)?.kind || 'baseline' })) });
  } catch (error) { next(error); }
});
app.get('/', (_req, res) => res.redirect(pages[0].path));
app.get('/en/about', async (req, res, next) => {
  try {
    const { About } = await vite.ssrLoadModule(root + 'src/pages/about.tsx');
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const assets = await clientAssets();
    const metadata = aboutMetadata();
    const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="robots" content="noindex,nofollow"><title>${escape(metadata.title)}</title><meta name="description" content="${escape(metadata.description)}">
      <link rel="canonical" data-managed="seo-head" href="${escape(metadata.canonical)}">${assets.head}</head>
      <body style="margin:0;background:#0e0e0e;color:#fff"><main id="root">${renderToStaticMarkup(React.createElement(About))}</main>
      <script>window.__INITIAL_LANGUAGE__='en';window.__INITIAL_TRANSLATIONS__=${json(translations.get('en'))};</script>${assets.script}</body></html>`;
    res.setHeader('Content-Language', 'en');
    res.type('html').send(built ? html : await vite.transformIndexHtml(req.originalUrl, html));
  } catch (error) { next(error); }
});
app.get(paths.map(route => route.path), async (req, res, next) => {
  try {
    const page = pages.find(page => page.path === req.path)!;
    const { station, language, path } = page;
    // Raw source modules are invalidated by Vite when Astra integrates the registry.
    const { getStationEditorial } = await vite.ssrLoadModule(editorialFile);
    const { renderStationEditorialHtml } = await vite.ssrLoadModule(editorialHtmlFile);
    const editorial = getStationEditorial(station, language, path);
    const dictionary = translations.get(language)!;
    const copy = getStationPageCopy(language, dictionary, station);
    const description = editorial?.summary || getLocalizedStationDescription(station, language, dictionary);
    const related = (countries.get(page.country)?.stations || []).filter(row => row._id !== station._id).slice(0, 12);
    const heading = getStationRelatedHeading(language, 'country', getStationCountryName(station, language), dictionary);
    const assets = await clientAssets();
    const initial = `<main data-preview-editorial="${editorial?.kind || 'baseline'}"><h1>${escape(station.name)}</h1>
      ${editorial ? `<p>${escape(description)}</p>` : `<section><h2>${escape(copy.about)}</h2><p>${escape(description)}</p></section>`}
      ${related.length ? `<section><h2>${escape(heading)}</h2><ul>${related.map(row => `<li><a href="/${language}/${translateUrlSegment('station', language)}/${escape(row.slug)}">${escape(row.name)}</a></li>`).join('')}</ul></section>` : ''}
      ${renderStationEditorialHtml(station, language, path)}</main>`;
    const html = `<!doctype html><html lang="${language}" dir="${['ar', 'he'].includes(language) ? 'rtl' : 'ltr'}"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
      <meta name="description" content="${escape(editorial?.metaDescription || description)}"><title>${escape(editorial?.title || station.name)} | MegaRadio Preview</title>
      <link rel="canonical" data-managed="seo-head" href="${escape(localOrigin + path)}">${assets.head}
      <link rel="icon" href="/favicon.svg"><style>body{margin:0;background:#0e0e0e;color:#fff}</style></head><body><div id="root">${initial}</div>
      ${renderStationBootstrap(station, language, page.slug)}<script>window.__INITIAL_LANGUAGE__=${json(language)};window.__INITIAL_TRANSLATIONS__=${json(dictionary)};</script>
      ${assets.script}</body></html>`;
    res.setHeader('Content-Language', language);
    res.type('html').send(built ? html : await vite.transformIndexHtml(req.originalUrl, html));
  } catch (error) { next(error); }
});
if (built) {
  for (const directory of ['assets', 'images', 'fonts', 'flags']) {
    app.use('/' + directory, compression(), express.static(join(builtRoot, directory), { index: false, redirect: false, fallthrough: true }));
  }
  const publicImages = express.static(builtRoot, { index: false, redirect: false });
  app.use((req, res, next) => {
    if (/^\/[\w.-]+\.(?:ico|svg|webp|png|jpe?g)$/.test(req.path)) publicImages(req, res, next);
    else next();
  });
} else app.use(vite.middlewares);
app.use((_req, res) => res.status(404).send('Outside the configured local preview paths'));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Reviewed editorial preview]', error);
  res.status(500).send('Local preview failed; check the preview process output.');
});
http.on('error', async error => { console.error(error); await vite.close(); process.exitCode = 1; });
http.listen(port, '127.0.0.1', () => {
  console.log(`Read-only reviewed editorial preview (${built ? 'built' : 'Vite'}): ${localOrigin}`);
  for (const page of pages) console.log(`${localOrigin}${page.path}`);
  console.log(`Unrelated control: ${localOrigin}/en/about`);
  console.log(`Fixture status: ${localOrigin}/__preview/status`);
});
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await vite.close();
  http.close(() => process.exit(0));
  http.closeAllConnections();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
