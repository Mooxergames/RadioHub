import { getKnownOgImageDimensions } from '@workspace/seo-shared/og-image-metadata';

/** Dimensions describe the current image only; never inherit the prior route's size. */
export function updateOgImageDimensions(image: string, origin: string) {
  const dimensions = getKnownOgImageDimensions(image, origin);
  for (const axis of ['width', 'height'] as const) {
    const property = `og:image:${axis}`;
    const existing = [...document.querySelectorAll<HTMLMetaElement>(`meta[property="${property}"]`)];
    if (!dimensions) {
      existing.forEach(meta => meta.remove());
      continue;
    }
    const meta = existing.shift() || document.createElement('meta');
    meta.setAttribute('property', property);
    meta.content = String(dimensions[axis]);
    if (!meta.parentNode) document.head.appendChild(meta);
    existing.forEach(duplicate => duplicate.remove());
  }
}
