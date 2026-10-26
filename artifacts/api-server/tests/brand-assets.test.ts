import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import sharp from 'sharp';
import { serveStatic } from '../src/serve-static';

const publicDirectory = path.resolve(import.meta.dirname, '../../megaradio/public');
const expectedImages = [
  ['favicon.png', 64, 64, 'png'],
  ['apple-touch-icon.png', 180, 180, 'png'],
  ['header-logo-80w.webp', 80, 74, 'webp'],
  ['logo-icon.webp', 322, 299, 'webp'],
  ['images/logo-icon.webp', 194, 180, 'webp'],
] as const;
let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  // Model index-web's non-SEO classification before the static middleware.
  app.use((_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, follow');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  });
  serveStatic(app, publicDirectory);
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

for (const [filename, width, height, format] of expectedImages) {
  test(`existing brand image has correct MIME, dimensions and no inherited noindex: ${filename}`, async () => {
    const response = await fetch(`${baseUrl}/${filename}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), `image/${format}`);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(response.headers.get('cache-control'), filename === 'favicon.png'
      ? 'public, max-age=86400, must-revalidate' : 'public, max-age=31536000, immutable');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, await readFile(path.join(publicDirectory, filename)), 'never rewrites brand pixels');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
  });
}

test('conventional favicon is a real ICO with unchanged PNG pixels, including HEAD and old query strings', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${baseUrl}/favicon.ico?v=old`, { method, redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.match(response.headers.get('content-type') || '', /^image\/(?:vnd\.microsoft\.icon|x-icon)/);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, must-revalidate');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else {
      const ico = Buffer.from(await response.arrayBuffer());
      assert.equal(ico.readUInt16LE(0), 0);
      assert.equal(ico.readUInt16LE(2), 1);
      assert.equal(ico.readUInt16LE(4), 1);
      assert.equal(ico[6], 64);
      assert.equal(ico[7], 64);
      const offset = ico.readUInt32LE(18);
      const length = ico.readUInt32LE(14);
      assert.equal(offset + length, ico.length);
      assert.deepEqual(ico.subarray(offset), await readFile(path.join(publicDirectory, 'favicon.png')));
    }
  }
});

test('legacy SVG contains the same brand rather than a placeholder or external image', async () => {
  const response = await fetch(`${baseUrl}/favicon.svg`, { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^image\/svg\+xml/);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, must-revalidate');
  const svg = await response.text();
  const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/)?.[1];
  assert.ok(embedded);
  assert.deepEqual(Buffer.from(embedded, 'base64'), await readFile(path.join(publicDirectory, 'favicon.png')));
  assert.doesNotMatch(svg, /#FF3C00|<image[^>]+href="https?:/);
});

test('manifest and unrelated/missing static assets keep their existing robots policy', async () => {
  for (const pathname of ['/manifest.json', '/icons/google.svg', '/assets/missing-brand.png']) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, pathname.startsWith('/assets/') ? 404 : 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  }
});

for (const pathname of [
  '/images/hero-bg-430w.webp', '/images/about-frame.png',
  '/uploads/genres/discoverable/genre-dfd155a5-8ea0-47f6-8c09-d3ba856c4853.png',
]) {
  test(`public static image is indexable without changing pixels, validators or errors: ${pathname}`, async () => {
    const bytes = await readFile(path.join(publicDirectory, pathname));
    const initial = await fetch(baseUrl + pathname);
    const etag = initial.headers.get('etag');
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get('x-robots-tag'), null);
    assert.match(initial.headers.get('content-type') || '', /^image\//);
    assert.ok(etag);
    assert.deepEqual(Buffer.from(await initial.arrayBuffer()), bytes);
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(baseUrl + pathname, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal((await response.arrayBuffer()).byteLength, method === 'HEAD' ? 0 : bytes.length);
      const conditional = await fetch(baseUrl + pathname, { method,
        headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.headers.get('x-robots-tag'), null);
      assert.equal(conditional.headers.get('etag'), etag);
    }
    const partial = await fetch(baseUrl + pathname, { headers: { Range: 'bytes=0-7' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('x-robots-tag'), null);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(0, 8));
    for (const [headers, expected] of [[{ 'If-Match': '"not-the-image"' }, 412],
      [{ Range: `bytes=${bytes.length + 1}-` }, 416]] as const) {
      const failure = await fetch(baseUrl + pathname, { headers });
      assert.equal(failure.status, expected);
      assert.equal(failure.headers.get('x-robots-tag'), 'noindex, follow');
      await failure.arrayBuffer();
    }
  });
}

test('missing public images and private/account paths never gain the image exception', async () => {
  for (const pathname of ['/images/missing.png', '/uploads/genres/missing.png',
    '/uploads/private/missing.png', '/admin/missing.png']) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    await response.arrayBuffer();
  }
});

test('both site HTML templates declare the same real ICO and PNG with truthful dimensions', async () => {
  for (const filename of ['../../megaradio/index.html', '../src/index-web.ts']) {
    const source = await readFile(path.resolve(import.meta.dirname, filename), 'utf8');
    const icons = [...source.matchAll(/<link\b[^>]*rel="(icon|apple-touch-icon)"[^>]*>/g)];
    assert.equal(icons.length, 3);
    assert.match(source, /<link rel="icon" type="image\/vnd\.microsoft\.icon" sizes="64x64" href="\/favicon\.ico">/);
    for (const [tag] of icons) {
      const src = tag.match(/href="([^"]+)"/)?.[1];
      assert.ok(src?.startsWith('/'));
      const metadata = await sharp(path.join(publicDirectory, src === '/favicon.ico' ? 'favicon.png' : src!)).metadata();
      assert.equal(tag.match(/sizes="([^"]+)"/)?.[1], `${metadata.width}x${metadata.height}`);
    }
    assert.match(source, /<link rel="manifest" href="\/manifest\.json">/);
  }
});

test('Yandex ownership verification is in both server-rendered and SPA heads, preserving the existing owner', async () => {
  for (const filename of ['../../megaradio/index.html', '../src/index-web.ts']) {
    const source = await readFile(path.resolve(import.meta.dirname, filename), 'utf8');
    const head = source.match(/<head>([\s\S]*?)<\/head>/)?.[1];
    assert.ok(head, filename);
    const tokens = [...head.matchAll(/<meta name="yandex-verification" content="([^"]+)"\s*\/>/g)].map(match => match[1]);
    assert.deepEqual(tokens, ['2af3c8203c89a3d9', '57c83c6ab08ec3ba'], filename);
  }
});

test('manifest app/shortcut icons all reference existing images with truthful sizes', async () => {
  const manifest = JSON.parse(await readFile(path.join(publicDirectory, 'manifest.json'), 'utf8'));
  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap((shortcut: any) => shortcut.icons)]) {
    const metadata = await sharp(path.join(publicDirectory, icon.src)).metadata();
    assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
    if (icon.type) assert.equal(icon.type, `image/${metadata.format}`);
  }
});

test('popular-stations shortcut opens the existing home section, not an invented genre route', async () => {
  const manifest = JSON.parse(await readFile(path.join(publicDirectory, 'manifest.json'), 'utf8'));
  const popular = manifest.shortcuts.find((shortcut: any) => shortcut.name === 'Popular Stations');
  assert.equal(popular?.url, '/');
});

test('push defaults use existing brand PNG while explicit icon/badge overrides are preserved', async () => {
  const workerSource = await readFile(path.join(publicDirectory, 'sw.js'), 'utf8');
  const handlers: Record<string, (event: any) => void> = {};
  const notifications: any[] = [];
  vm.runInNewContext(workerSource, {
    URL, console: { log() {}, error() {} },
    self: {
      addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
      registration: { showNotification: async (title: string, options: any) => { notifications.push({ title, options }); } },
    },
  });
  for (const payload of [{}, { icon: '/custom-icon.png', badge: '/custom-badge.png' }]) {
    let done: Promise<unknown> | undefined;
    handlers.push({ data: { json: () => payload }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
  }
  assert.equal(notifications[0].options.icon, '/favicon.png');
  assert.equal(notifications[0].options.badge, '/favicon.png');
  assert.equal(notifications[1].options.icon, '/custom-icon.png');
  assert.equal(notifications[1].options.badge, '/custom-badge.png');
  const service = await readFile(path.resolve(import.meta.dirname, '../src/services/pushNotificationService.ts'), 'utf8');
  assert.doesNotMatch(service, /['"]\/favicon\.ico['"]/);
  assert.match(service, /icon: payload\.icon \|\| '\/favicon\.png'/);
  assert.match(service, /icon: stationData\.favicon \|\| '\/favicon\.png'/);
});
