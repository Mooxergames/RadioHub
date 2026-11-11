import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPublicStationLogoKey, normalizePublicStationLogoUrl, STATION_LOGOS_S3_BASE_URL } from '@workspace/seo-shared/station-logo-url';

const uuid = '12345678-1234-1234-1234-123456789abc';
for (const path of ['mangoradio_11ab228c/logo-256.webp', 'radio_12345678/logo-48.webp',
  `radio_12345678-${uuid}/logo-96.webp`, `_12345678/logo-256.webp`,
  `radio_12345678/variants/${uuid}/logo-48.webp`, `radio_12345678/variants/${uuid}/logo-96.webp`]) {
  test(`owned logo mapping preserves its exact existing object key: ${path}`, () => {
    const source = `${STATION_LOGOS_S3_BASE_URL}/${path}`;
    const own = `/station-logos/${path}`;
    assert.equal(normalizePublicStationLogoUrl(source), own);
    assert.equal(normalizePublicStationLogoUrl(own), own);
    assert.equal(getPublicStationLogoKey(own), own.slice(1));
  });
}

for (const source of [
  'https://logos.example/radio/logo-256.webp',
  'https://megaradio-station-logos.s3.eu-north-1.amazonaws.com.evil.invalid/station-logos/radio/logo-256.webp',
  STATION_LOGOS_S3_BASE_URL.replace('https://', 'https://user:password@') + '/radio/logo-256.webp',
  STATION_LOGOS_S3_BASE_URL.replace('.com/', '.com:443/') + '/radio/logo-256.webp',
  STATION_LOGOS_S3_BASE_URL.replace('https:', 'http:') + '/radio/logo-256.webp',
  `${STATION_LOGOS_S3_BASE_URL}/radio/logo-256.webp?`, `${STATION_LOGOS_S3_BASE_URL}/radio/logo-256.webp#`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/logo-256.webp?X-Amz-Signature=secret`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/original.svg`, `${STATION_LOGOS_S3_BASE_URL}/radio/original.png`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/logo-512.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/../other/logo-256.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio%2Fother/logo-256.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/%2e%2e/logo-256.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio\\other/logo-256.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/logo-256.webp\n`,
  `\t${STATION_LOGOS_S3_BASE_URL}/radio/logo-256.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/variants/not-a-uuid/logo-96.webp`,
  `${STATION_LOGOS_S3_BASE_URL}/radio/variants/${uuid}/logo-256.webp`,
  'https://api.themegaradio.com/station-logos/radio/logo-96.webp',
  '/station-images/legacy.webp', '/images/no-image.webp', 'logo-96.webp', '',
]) {
  test(`unmapped logo retains its original delivery behavior: ${JSON.stringify(source)}`, () => {
    assert.equal(normalizePublicStationLogoUrl(source), source);
  });
}

for (const path of ['/station-logos/radio%2Fother/logo-256.webp',
  '/station-logos/radio/../other/logo-256.webp', '/station-logos/radio\\other/logo-256.webp',
  '/station-logos/radio/logo-256.webp?', '/station-logos/radio/logo-256.webp#',
  '/station-logos/radio/logo-256.webp\u0000', '/station-logos/radio/variants/bad/logo-96.webp']) {
  test(`delivery rejects raw unsafe key before URL normalization: ${JSON.stringify(path)}`, () => {
    assert.equal(getPublicStationLogoKey(path), null);
  });
}
