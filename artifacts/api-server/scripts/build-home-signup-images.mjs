import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../megaradio/public/images/signup-listener.png', import.meta.url));
for (const width of [420, 840, 1312]) {
  const destination = fileURLToPath(new URL(`../../megaradio/public/images/signup-listener-${width}w.webp`, import.meta.url));
  const result = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(destination);
  console.log(`${width}w: ${result.width}x${result.height}, ${result.size} bytes`);
}
