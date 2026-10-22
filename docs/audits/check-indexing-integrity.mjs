import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(new URL('../../artifacts/megaradio/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const Papa = require('papaparse');
const origin = 'https://themegaradio.com';
const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const hash = text => createHash('sha256').update(text).digest('hex');
const fresh = JSON.parse(await readFile(new URL('2026-10-22-gsc-recent-crawled.json', import.meta.url), 'utf8'));
const oldInputs = process.argv.slice(2);
const inputSummaries = [];
const tasks = fresh.rows.map(row => ({ ...row, group: 'recent-crawled' }));
for (const file of oldInputs) {
  const parsed = Papa.parse(await readFile(file, 'utf8'), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors)}`);
  const rows = parsed.data.filter(row => typeof row.URL === 'string' && row.URL.startsWith(origin + '/'));
  const prefixes = {};
  for (const row of rows) {
    const prefix = new URL(row.URL).pathname.split('/')[1];
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }
  inputSummaries.push({ file: file.split('/').slice(-2).join('/'), count: rows.length, prefixes });
  // First record for each slug, then evenly spaced through the supplied list.
  const unique = [...new Map(rows.map(row => [new URL(row.URL).pathname.split('/').at(-1), row])).values()];
  for (let index = 0; index < Math.min(24, unique.length); index++) {
    const row = unique[Math.floor(index * unique.length / Math.min(24, unique.length))];
    tasks.push({ url: row.URL, lastCrawl: row['Son tarama'], group: file.includes('-11/') ? 'historic-404' : 'historic-crawled' });
  }
}
const edgePaths = [
  '/en/does-not-exist-indexing-audit-20261022', '/en/station/does-not-exist-indexing-audit-20261022',
  '/en/genres/does-not-exist-indexing-audit-20261022', '/en/regions/europe/does-not-exist-indexing-audit-20261022',
  '/en/regions/asia/austria', '/en/station/kronehit/extra', '/en/radios?page=0', '/en/radios?page=abc',
  '/en/radios?page=999999999', '/en/search?q=kronehit', '/en/station/kronehit?utm_source=indexing-audit',
  '/sitemap.xml', '/sitemap-index.xml', '/sitemap-main-en.xml', '/sitemap-genres-en.xml', '/robots.txt',
];
tasks.push(...edgePaths.map(path => ({ url: origin + path, group: 'edge' })));
tasks.push({ url: 'http://themegaradio.com/en/station/kronehit', group: 'host' });
tasks.push({ url: 'https://www.themegaradio.com/en/station/kronehit', group: 'host' });
for (const path of ['/en/station/kronehit', '/de/sender/kronehit', '/ar/mahta/psy-trance', '/en/regions/europe/austria']) {
  tasks.push({ url: origin + path, group: 'ua-browser' });
  tasks.push({ url: origin + path, group: 'ua-googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  tasks.push({ url: origin + path, group: 'cookie-language', cookie: 'preferredLanguage=tr', acceptLanguage: 'tr-TR,tr;q=0.9' });
}
const assetUrls = new Set();
const rows = Array(tasks.length);
let next = 0;
async function boundedBody(response, maxBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Response exceeded audit byte limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function probe(task) {
  let url = task.url;
  const chain = [];
  const headers = { 'User-Agent': task.ua || browserUa, 'Accept-Language': task.acceptLanguage || 'en-US,en;q=0.9' };
  if (task.cookie) headers.Cookie = task.cookie;
  for (let hop = 0; hop < 6; hop++) {
    const start = Date.now();
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    chain.push({ url, status: response.status, ttfbMs: Date.now() - start });
    const location = response.headers.get('location');
    if ([301,302,303,307,308].includes(response.status) && location) {
      await response.body?.cancel();
      const target = new URL(location, url);
      if (target.hostname !== 'themegaradio.com' && target.hostname !== 'www.themegaradio.com') return { chain, externalRedirect: target.origin };
      url = target.href;
      continue;
    }
    const body = await boundedBody(response);
    const result = { chain, finalUrl: new URL(url).href, status: response.status, contentType: response.headers.get('content-type'),
      xRobots: response.headers.get('x-robots-tag'), cacheControl: response.headers.get('cache-control'),
      vary: response.headers.get('vary'), bytes: Buffer.byteLength(body), bodyHash: hash(body) };
    if (!result.contentType?.includes('text/html')) {
      result.xmlUrls = (body.match(/<loc>/g) || []).length;
      if (url.endsWith('/robots.txt')) result.robotsBody = body;
      return result;
    }
    const dom = new JSDOM(body, { url });
    const doc = dom.window.document;
    result.lang = doc.documentElement.lang;
    result.title = doc.title;
    result.canonicals = [...doc.querySelectorAll('link[rel=canonical]')].map(link => link.href);
    result.robots = [...doc.querySelectorAll('meta[name=robots]')].map(meta => meta.content);
    result.h1 = [...doc.querySelectorAll('h1')].map(node => node.textContent.trim());
    result.hreflangs = [...doc.querySelectorAll('link[rel=alternate][hreflang]')].map(link => ({ lang: link.hreflang, url: link.href }));
    result.mainWords = (doc.querySelector('main')?.textContent.trim().match(/\S+/gu) || []).length;
    result.assets = [...doc.querySelectorAll('script[src],link[rel=stylesheet]')].map(node => node.src || node.href).filter(value => value.startsWith(origin + '/'));
    for (const asset of result.assets) assetUrls.add(asset);
    const bootstrap = doc.querySelector('#station-bootstrap[type="application/json"]');
    if (bootstrap) {
      const { station, language } = JSON.parse(bootstrap.textContent);
      const description = station.descriptions?.[language] || '';
      result.station = { id: station._id, name: station.name, slug: station.slug, countryCode: station.countryCode,
        descriptionWords: (description.match(/\S+/gu) || []).length, descriptionHash: hash(description),
        description, homepage: station.homepage, visible: station.isListVisible };
    }
    result.schemaErrors = [];
    result.schemaTypes = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.parse(script.textContent);
        for (const entity of value['@graph'] || (Array.isArray(value) ? value : [value])) result.schemaTypes.push(entity['@type']);
      } catch (error) { result.schemaErrors.push(error.message); }
    }
    result.internalLinkCount = [...doc.querySelectorAll('a[href]')].filter(a => a.origin === origin).length;
    dom.window.close();
    return result;
  }
  return { chain, error: 'Redirect limit reached' };
}
async function worker() {
  while (next < tasks.length) {
    const index = next++;
    const task = tasks[index];
    try { rows[index] = { ...task, ...await probe(task) }; }
    catch (error) { rows[index] = { ...task, error: error.message }; }
    console.log(JSON.stringify({ index, group: task.group, status: rows[index].status, hops: rows[index].chain?.length - 1, url: task.url, error: rows[index].error }));
  }
}
await Promise.all([worker(),worker()]);
const assets = [];
for (const url of assetUrls) {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-4095' }, signal: AbortSignal.timeout(15000) });
    const reader = response.body?.getReader();
    const sample = await reader?.read();
    await reader?.cancel();
    assets.push({ url, status: response.status, contentType: response.headers.get('content-type'), bytes: sample?.value?.length || 0 });
  } catch (error) { assets.push({ url, error: error.message }); }
}
const summary = {};
for (const row of rows) {
  const group = summary[row.group] ||= { count: 0, statuses: {}, redirected: 0, noindex: 0, errors: 0 };
  group.count++;
  group.statuses[row.status || 'error'] = (group.statuses[row.status || 'error'] || 0) + 1;
  if (row.chain?.length > 1) group.redirected++;
  if (/noindex|none/i.test([row.xRobots,...row.robots || []].join(' '))) group.noindex++;
  if (row.error) group.errors++;
}
const output = { checkedAt: new Date().toISOString(), concurrency: 2,
  caveats: ['HTTP source audit only; not a Google indexing verdict or a rendered browser test.',
    'User-Agent spoofing does not prove access from real Google IPs.', 'Recent examples are newest-first, not a random sample.'],
  inputSummaries, summary, assets, rows };
// Keep the complete machine trace compact; the companion audit is human-readable.
await writeFile(new URL('2026-10-22-indexing-integrity.json', import.meta.url), JSON.stringify(output)+'\n');
console.log(JSON.stringify({ summary, assets: assets.length }));
