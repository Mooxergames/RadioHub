import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../api-server/package.json', import.meta.url));
const sharp = require('sharp');

const publicDirectory = new URL('../public/', import.meta.url);
const source = await readFile(new URL('logo-icon.webp', publicDirectory));
const metadata = await sharp(source).metadata();
if (metadata.width !== 322 || metadata.height !== 299) throw new Error('Brand source changed; review the favicon crop');

// Keep the existing pink tile and note; omit the large decorative glow used in the header.
const tile = await sharp(source)
  .extract({ left: 75, top: 66, width: 150, height: 150 })
  .composite([{ input: Buffer.from('<svg width="150" height="150"><rect width="150" height="150" rx="24" fill="white"/></svg>'), blend: 'dest-in' }])
  .png().toBuffer();
for (const [filename, size] of [['favicon.png', 64], ['apple-touch-icon.png', 180]]) {
  await sharp(tile).resize(size, size).png().toFile(new URL(filename, publicDirectory).pathname);
}
const png = await readFile(new URL('favicon.png', publicDirectory));
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Expected a PNG favicon');
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== height || width < 16 || width > 256) throw new Error('Expected a square favicon between 16 and 256 pixels');

// ICO supports a PNG payload: retain the existing brand pixels byte-for-byte.
const directory = Buffer.alloc(22);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(1, 4);
directory[6] = width === 256 ? 0 : width;
directory[7] = height === 256 ? 0 : height;
directory.writeUInt16LE(1, 10);
directory.writeUInt16LE(32, 12);
directory.writeUInt32LE(png.length, 14);
directory.writeUInt32LE(directory.length, 18);
await writeFile(new URL('favicon.ico', publicDirectory), Buffer.concat([directory, png]));
await writeFile(new URL('favicon.svg', publicDirectory),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
