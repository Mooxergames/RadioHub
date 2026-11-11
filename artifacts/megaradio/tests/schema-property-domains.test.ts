import { describe, expect, it } from 'vitest';
import { generateRadioStationData } from '../src/utils/structured-data';
import { generateOrganizationSchema, generateRadioStationSchema } from '@workspace/seo-shared/structured-data';
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';

// Property domains checked against schema.org, 2026-09-07:
// RadioBroadcastService / category / isAccessibleForFree / additionalProperty /
// keywords / BroadcastFrequencySpecification / geo.
describe('radio service schema uses the applicable property domains', () => {
  it('shared generator localizes coverage without inferring a physical location or frequency', () => {
    const schema = generateRadioStationSchema({
      name: 'Test Radio', slug: 'test', country: 'Germany', countryCode: 'DE',
      tags: 'news, AM 1030', bitrate: 128, codec: 'MP3', geoLat: '48.2', geoLong: '16.4',
    }, 'themegaradio.com', 'de', '/de/sender/test', 'Deutsche Beschreibung');
    expect(schema.category).toEqual(['news', 'AM 1030']);
    expect(schema.areaServed).toEqual({ '@type': 'Country', name: 'Deutschland' });
    expect(schema.broadcaster.geo).toBeUndefined();
    expect(schema.broadcastAffiliateOf).toBeUndefined();
    expect(schema.broadcaster).not.toHaveProperty('location');
    expect(schema.broadcaster).not.toHaveProperty('address');
    expect(schema).not.toHaveProperty('broadcastFrequency');
    for (const key of ['keywords', 'area', 'additionalProperty', 'isAccessibleForFree']) expect(schema).not.toHaveProperty(key);
  });

  it('fallback client helper cannot fabricate stars from popularity counts', () => {
    const schema = generateRadioStationData({
      _id: 'test', name: 'Test Radio', tags: ['news'], votes: 100_000, clickCount: 500_000, country: 'Germany',
    }, 'https://themegaradio.com/en/station/test');
    expect(schema.category).toEqual(['news']);
    expect(schema.areaServed).toEqual({ '@type': 'Country', name: 'Germany' });
    for (const key of ['aggregateRating', 'keywords', 'area', 'additionalProperty', 'isAccessibleForFree', 'broadcastAffiliateOf']) expect(schema).not.toHaveProperty(key);
  });

  it('shared generators retain localized descriptions without inventing affiliation or social accounts in any SEO locale', () => {
    expect(SITEMAP_PRIORITY_LANGUAGES.universal14).toHaveLength(14);
    for (const language of SITEMAP_PRIORITY_LANGUAGES.universal14) {
      const description = `${language}: Localized description`;
      const organization = generateOrganizationSchema('themegaradio.com', language, { meta_description: description });
      expect(organization.name).toBe('Mega Radio');
      expect(organization.description).toBe(description);
      expect(organization).not.toHaveProperty('sameAs');
      const station = generateRadioStationSchema({ name: 'Independent Radio', tags: 'news' }, 'themegaradio.com', language,
        `/${language}/station/independent-radio`, description);
      expect(station.description).toBe(description);
      expect(station.broadcaster.name).toBe('Independent Radio');
      expect(station).not.toHaveProperty('broadcastAffiliateOf');
    }
  });
});
