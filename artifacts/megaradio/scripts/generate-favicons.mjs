import { readFile, writeFile } from 'node:fs/promises';

const publicDirectory = new URL('../public/', import.meta.url);
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
