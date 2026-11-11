import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import CacheManager from '../cache';

export interface CachedStationSitemapXml { xml: string; etag: string; byteLength: number }
interface PackedStationSitemapXml { encoding: 'gzip-base64-v1'; data: string; etag: string; byteLength: number }
export const STATION_SITEMAP_PACKED_SUFFIX = ':gzip-v1';
const SMALL_XML_BYTES = 256_000;
const MAX_XML_BYTES = 50 * 1024 * 1024;
const MAX_PACKED_CHARACTERS = 4 * 1024 * 1024 - 1024;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const inflight = new Map<string, Promise<CachedStationSitemapXml | null>>();
const writes = new Map<string, { etag: string; promise: Promise<void> }>();
const waiting: Array<() => void> = [];
let active = 0;
let activeWrites = 0;

// Keep large temporary inflate buffers bounded independently of stored bytes.
async function withDecodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await work(); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function getStationSitemapCacheStats() {
  return { active, pending: waiting.length, inflight: inflight.size };
}

export function getStationSitemapWriteStats() {
  return { active: activeWrites, inflight: writes.size };
}

function isXmlValue(value: unknown): value is CachedStationSitemapXml {
  const v = value as CachedStationSitemapXml | null;
  return !!v && typeof v === 'object' && typeof v.xml === 'string'
    && typeof v.etag === 'string' && Number.isSafeInteger(v.byteLength)
    && v.byteLength > 0
    && Buffer.byteLength(v.xml) === v.byteLength
    && `"${createHash('sha256').update(v.xml).digest('hex')}"` === v.etag;
}

async function readPacked(value: unknown): Promise<CachedStationSitemapXml | null> {
  const v = value as PackedStationSitemapXml | null;
  if (!v || typeof v !== 'object' || v.encoding !== 'gzip-base64-v1'
    || typeof v.data !== 'string' || !v.data.length || v.data.length > MAX_PACKED_CHARACTERS
    || v.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v.data)
    || typeof v.etag !== 'string' || !/^"[a-f0-9]{64}"$/.test(v.etag)
    || !Number.isSafeInteger(v.byteLength) || v.byteLength <= 0 || v.byteLength > MAX_XML_BYTES) return null;
  try {
    return await withDecodeSlot(async () => {
      const bytes = await gunzipAsync(Buffer.from(v.data, 'base64'), { maxOutputLength: MAX_XML_BYTES });
      if (bytes.length !== v.byteLength || `"${createHash('sha256').update(bytes).digest('hex')}"` !== v.etag) return null;
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { xml, etag: v.etag, byteLength: v.byteLength };
    });
  } catch { return null; }
}

/** The format suffix prevents an older deployment from treating gzip as XML. */
export async function readCachedStationSitemapXml(cacheKey: string): Promise<CachedStationSitemapXml | null> {
  const previous = inflight.get(cacheKey);
  if (previous) return previous;
  const read = (async () => {
    try {
      const packedKey = cacheKey + STATION_SITEMAP_PACKED_SUFFIX;
      const packed = await CacheManager.get<unknown>(packedKey);
      if (packed !== null) {
        const result = await readPacked(packed);
        if (result) return result;
        await CacheManager.del(packedKey);
      }
      const plain = await CacheManager.get<unknown>(cacheKey);
      return isXmlValue(plain) ? plain : null;
    } catch { return null; }
  })();
  inflight.set(cacheKey, read);
  try { return await read; }
  finally { if (inflight.get(cacheKey) === read) inflight.delete(cacheKey); }
}

async function writeStationSitemapXml(cacheKey: string, sitemap: CachedStationSitemapXml, ttl: number): Promise<void> {
  try {
    inflight.delete(cacheKey);
    await CacheManager.del(`${cacheKey}:validator`);
    await CacheManager.del(cacheKey);
    await CacheManager.del(cacheKey + STATION_SITEMAP_PACKED_SUFFIX);
    let packed: PackedStationSitemapXml | undefined;
    // Saturated writers use the existing plain/Redis path, never queue more
    // large gzip inputs or turn a ready XML response into an error.
    if (sitemap.byteLength > SMALL_XML_BYTES && sitemap.byteLength <= MAX_XML_BYTES && activeWrites < 2) {
      activeWrites++;
      try {
        const data = (await gzipAsync(sitemap.xml)).toString('base64');
        if (data.length <= MAX_PACKED_CHARACTERS) packed = {
          encoding: 'gzip-base64-v1', data, etag: sitemap.etag, byteLength: sitemap.byteLength,
        };
      } catch { /* Preserve the pre-existing plain/Redis cache path. */ }
      finally { activeWrites--; }
    }
    if (packed) {
      await CacheManager.set(cacheKey + STATION_SITEMAP_PACKED_SUFFIX, packed, { ttl });
    } else {
      await CacheManager.set(cacheKey, sitemap, { ttl });
    }
    await CacheManager.set(`${cacheKey}:validator`, { etag: sitemap.etag }, { ttl });
  } catch {
    // A cache failure must not discard the already-generated valid response.
  }
}

export async function storeStationSitemapXml(cacheKey: string, sitemap: CachedStationSitemapXml, ttl: number): Promise<void> {
  const previous = writes.get(cacheKey);
  if (previous?.etag === sitemap.etag) return previous.promise;
  const promise = (async () => {
    if (previous) await previous.promise;
    await writeStationSitemapXml(cacheKey, sitemap, ttl);
  })();
  writes.set(cacheKey, { etag: sitemap.etag, promise });
  try { await promise; }
  finally {
    if (writes.get(cacheKey)?.promise === promise) writes.delete(cacheKey);
  }
}
