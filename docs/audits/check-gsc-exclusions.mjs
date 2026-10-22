import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(new URL('../../artifacts/megaradio/package.json', import.meta.url));
const Papa = require('papaparse');
const { JSDOM } = require('jsdom');
const origin = 'https://themegaradio.com';
const hosts = new Set(['themegaradio.com', 'www.themegaradio.com']);
const tasks = new Map();
const inputs = [];
for (const input of process.argv.slice(2)) {
  const separator = input.indexOf('=');
  if (separator < 1) throw new Error('Expected category=/absolute/path.csv');
  const category = input.slice(0, separator), file = input.slice(separator + 1);
  const parsed = Papa.parse(await readFile(file, 'utf8'), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(JSON.stringify(parsed.errors));
  const rows = parsed.data.filter(row => typeof row.URL === 'string');
  if (!rows.length) throw new Error(`No URLs in ${file}`);
  for (const row of rows) {
    const url = new URL(row.URL);
    if (!hosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Refusing unexpected export URL');
    const task = tasks.get(url.href) || { url: url.href, categories: [], lastCrawls: {} };
    if (!task.categories.includes(category)) task.categories.push(category);
    task.lastCrawls[category] = row['Son tarama'] || null;
    tasks.set(url.href, task);
  }
  inputs.push({ category, file: path.basename(file), rows: rows.length });
}
if (!tasks.size) throw new Error('No export inputs');

async function body(response) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw new Error('Response exceeded the two-megabyte audit limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function probe(task) {
  let url = task.url;
  const chain = [], seen = new Set();
  for (let hop = 0; hop < 7; hop++) {
    if (seen.has(url)) return { ...task, chain, error: 'Redirect loop' };
    seen.add(url);
    const start = Date.now();
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MegaRadioPublicAudit/1.0)', 'Accept-Language': 'en',
    } });
    chain.push({ url, status: response.status, ttfbMs: Date.now() - start });
    const location = response.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      await response.body?.cancel();
      const target = new URL(location, url);
      if (!hosts.has(target.hostname) || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) return { ...task, chain, externalRedirect: target.origin };
      url = target.href;
      continue;
    }
    const result = { ...task, chain, finalUrl: url, status: response.status,
      xRobots: response.headers.get('x-robots-tag'), cacheControl: response.headers.get('cache-control') };
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel();
      return result;
    }
    const html = await body(response);
    const dom = new JSDOM(html, { url });
    try {
      const doc = dom.window.document;
      result.bytes = Buffer.byteLength(html);
      result.title = doc.title;
      result.lang = doc.documentElement.lang;
      result.canonicals = [...doc.querySelectorAll('link[rel=canonical]')].map(link => link.href);
      result.robots = [...doc.querySelectorAll('meta[name=robots]')].map(meta => meta.content);
      result.h1 = [...doc.querySelectorAll('h1')].map(node => node.textContent.trim());
      result.mainWords = (doc.querySelector('main')?.textContent.trim().match(/\S+/gu) || []).length;
      const bootstrap = doc.querySelector('#station-bootstrap[type="application/json"]');
      if (bootstrap) {
        const { station, language } = JSON.parse(bootstrap.textContent);
        const description = station.descriptions?.[language] || '';
        result.station = { id: String(station._id), slug: station.slug, name: station.name,
          visible: station.isListVisible, noIndex: station.noIndex, language,
          descriptionWords: (description.match(/\S+/gu) || []).length,
          descriptionSample: description.slice(0, 220) };
      }
      result.noindex = /noindex|none/i.test([result.xRobots, ...result.robots].join(' '));
    } finally { dom.window.close(); }
    return result;
  }
  return { ...task, chain, error: 'Redirect limit' };
}

const list = [...tasks.values()], rows = Array(list.length);
let next = 0;
async function worker() {
  while (next < list.length) {
    const index = next++, task = list[index];
    try { rows[index] = await probe(task); }
    catch (error) { rows[index] = { ...task, error: error.message }; }
    console.log(JSON.stringify({ index, total: list.length, categories: task.categories,
      status: rows[index].status, url: task.url, error: rows[index].error }));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
await Promise.all([worker(), worker()]);
const summary = {};
for (const row of rows) for (const category of row.categories) {
  const group = summary[category] ||= { count: 0, statuses: {}, redirects: 0, noindex: 0, errors: 0 };
  group.count++;
  group.statuses[row.status || 'error'] = (group.statuses[row.status || 'error'] || 0) + 1;
  if (row.chain?.length > 1) group.redirects++;
  if (row.noindex || /noindex|none/i.test(row.xRobots || '')) group.noindex++;
  if (row.error || row.externalRedirect) group.errors++;
}
const report = { checkedAt: new Date().toISOString(), concurrency: 2, inputs, summary,
  caveats: ['Anonymous public HTTP audit, not a real Googlebot fetch or an indexing verdict.',
    'Exports contain the examples supplied by Search Console, not necessarily every affected URL.',
    'A valid 301, intentional noindex, 404 or 410 is not automatically an implementation error.'], rows };
await writeFile(process.env.GSC_AUDIT_OUTPUT || new URL('2026-10-22-gsc-exclusion-recheck.json', import.meta.url), JSON.stringify(report) + '\n');
console.log(JSON.stringify({ summary }));
