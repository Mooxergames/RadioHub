import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { INDEXING_PILOT } from '../../artifacts/api-server/src/seo/indexing-pilot.ts';

const require = createRequire(new URL('../../artifacts/megaradio/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const afterRelease = process.argv.includes('--after-release');
const origin = 'https://themegaradio.com';
const hubs = { AT: '/en/regions/europe/austria', TR: '/en/regions/asia/turkey' };
const links = {};
for (const [country, path] of Object.entries(hubs)) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Country hub ${path}: ${response.status}`);
  const dom = new JSDOM(await response.text(), { url: origin + path });
  links[country] = [...dom.window.document.querySelectorAll('a[href]')].map(a => a.href);
  dom.window.close();
}

// Record neither listener IDs nor temporary upstream advertising parameters.
function publicUrl(value) {
  const url = new URL(value);
  url.search = ''; url.hash = '';
  return url.href;
}

async function sampleStream(url, depth = 0) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
    || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(parsed.hostname)) throw new Error('Unexpected upstream URL');
  const response = await fetch(url, { headers: { Range: 'bytes=0-16383' }, signal: AbortSignal.timeout(10000) });
  const reader = response.body?.getReader();
  const sample = reader ? await reader.read() : {};
  await reader?.cancel();
  const bytes = sample.value?.length || 0;
  const text = new TextDecoder().decode(sample.value || new Uint8Array());
  const contentType = response.headers.get('content-type') || '';
  const result = { status: response.status, url: publicUrl(response.url), contentType, bytes };
  if (!response.ok || !bytes) return { ...result, ok: false };
  if (text.startsWith('#EXTM3U') && depth < 3) {
    const next = text.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    if (!next) return { ...result, ok: false };
    const child = await sampleStream(new URL(next.trim(), response.url).href, depth + 1);
    return { ...result, child, ok: child.ok };
  }
  const transportStream = /^video\/(mp2t|m2ts)/i.test(contentType) && sample.value?.[0] === 0x47;
  return { ...result, ok: /^audio\//i.test(contentType) || transportStream };
}

const rows = Array(INDEXING_PILOT.length);
let next = 0;
async function worker() {
  while (next < INDEXING_PILOT.length) {
    const index = next++;
    const profile = INDEXING_PILOT[index];
    const url = `${origin}/en/station/${profile.slug}`;
    const row = { id: profile.id, slug: profile.slug, countryCode: profile.countryCode, url,
      countryHub: origin + hubs[profile.countryCode], linkedFromHub: links[profile.countryCode].includes(url) };
    rows[index] = row;
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const dom = new JSDOM(await response.text(), { url });
      const doc = dom.window.document;
      row.page = { status: response.status, canonical: doc.querySelector('link[rel=canonical]')?.href,
        robots: doc.querySelector('meta[name=robots]')?.content,
        editorialPresent: doc.body.textContent.includes(profile.full.split('\n\n')[0]),
        officialHomepagePresent: [...doc.querySelectorAll('a[href]')].some(a => a.href === profile.homepage) };
      dom.window.close();
      const api = await fetch(`${origin}/api/station/${profile.slug}`, { signal: AbortSignal.timeout(15000) });
      if (!api.ok) throw new Error(`Detail API ${api.status}`);
      const station = await api.json();
      row.identityMatches = String(station._id) === profile.id && station.slug === profile.slug && station.countryCode === profile.countryCode;
      row.indexable = station.noIndex === false && station.isListVisible !== false && !station.redirectToSlug;
      row.apiEditorialPresent = station.descriptions?.en?.full === profile.full && station.descriptions?.en?.meta === profile.meta;
      row.stream = await sampleStream(station.urlResolved || station.url);
      row.ok = row.identityMatches && row.indexable && row.linkedFromHub && row.stream.ok
        && row.page.status === 200 && row.page.canonical === url && !/noindex|none/i.test(row.page.robots || '')
        && (!afterRelease || (row.page.editorialPresent && row.page.officialHomepagePresent && row.apiEditorialPresent));
    } catch (error) { row.error = error.message; row.ok = false; }
    console.log(JSON.stringify({ slug: profile.slug, ok: row.ok, linkedFromHub: row.linkedFromHub, error: row.error, streamOk: row.stream?.ok }));
  }
}
await Promise.all([worker(), worker()]);
const output = { checkedAt: new Date().toISOString(), afterRelease, concurrency: 2,
  summary: { count: rows.length, passed: rows.filter(row => row.ok).length }, rows };
const file = `2026-10-22-pilot-${afterRelease ? 'postrelease' : 'baseline'}.json`;
await writeFile(new URL(file, import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output.summary));
if (rows.some(row => !row.ok)) process.exitCode = 1;
