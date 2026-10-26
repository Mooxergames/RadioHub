import { expect, it } from 'vitest';
import { ACTIVE_SITEMAP_LANGUAGES, generateLocalizedStationTitle, generateSeoTags,
  getLocalizedStationDescription, getStationMetaDescription,
  getStationCountryName, getStationCountryQuery } from '@workspace/seo-shared/seo-config';
import { getStationImageAlt } from '@workspace/seo-shared/station-image-alt';
import { generateRadioStationSchema, getSchemaCountry } from '@workspace/seo-shared/structured-data';

const fallback = (_key: string, text: string) => text;

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: alts omit unknown countries and use valid ISO-localized countries', language => {
  const name = "Radio $& $' FM";
  const noCountry = getStationImageAlt({ name, country: 'Unknown', countryCode: 'XX' }, language, fallback);
  expect(noCountry).toContain(name);
  expect(noCountry).not.toMatch(/unknown|XX/);
  const station = { name, country: 'Unknown', countryCode: 'GB' };
  const alt = getStationImageAlt(station, language, () => '{name}: {country}');
  expect(alt).toBe(`${name}: ${getStationCountryName(station, language)}`);
  expect(alt).not.toContain('Unknown');
  expect(getStationImageAlt(station, language, () => '{country}')).toContain(name);
  expect(getStationImageAlt(station, language, () => '${station.name}')).toContain(name);
});

it('selects the country-free template without leaking sentinels into placeholders', () => {
  const keys: string[] = [];
  const alt = getStationImageAlt({ name: 'Fixture', country: ' Unknown ', countryCode: 'ZZ' }, 'de', (key) => {
    keys.push(key);
    return '{name} {country} logo';
  });
  expect(keys).toEqual(['seo_station_logo_alt']);
  expect(alt).toBe('Fixture  logo');
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: country labels, alts, queries, schema and titles share country acceptance', language => {
  for (const code of ['LT', 'TN', 'MC', 'SM']) {
    const station = { name: 'Fixture', country: 'Unknown', countryCode: code };
    const localized = new Intl.DisplayNames([language], { type: 'region' }).of(code)!;
    const english = new Intl.DisplayNames(['en'], { type: 'region' }).of(code)!;
    expect(getStationCountryQuery(station)).toBe(english);
    expect(getStationCountryName(station, language)).toBe(localized);
    expect(getSchemaCountry(station, language)).toEqual({ name: localized, code });
    expect(getStationImageAlt(station, language, fallback)).toContain(localized);
    expect(generateLocalizedStationTitle(station, language, {})).toContain(` — ${localized} — `);
  }
  for (const source of [
    { country: 'Unknown' }, { country: 'Worldwide' }, { country: ' Worldwide ', countryCode: 'SM' },
    ...['XX', 'ZZ', 'QQ', 'USA', '12', 'XA', 'XB', 'EU', 'UN', 'SU', 'AN', 'CS', 'YU', 'BU', 'UK', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']
      .flatMap(countryCode => [{ country: 'Unknown', countryCode }, ...(/^[A-Z]{2}$/.test(countryCode) ? [{ country: countryCode }] : [])]),
  ]) {
    const station = { name: 'Fixture', ...source };
    expect(getStationCountryQuery(station)).toBe('');
    expect(getStationCountryName(station, language)).toBe('');
    expect(getSchemaCountry(station, language)).toBeUndefined();
    expect(getStationImageAlt(station, language, fallback)).toBe(getStationImageAlt({ name: 'Fixture' }, language, fallback));
    expect(generateLocalizedStationTitle(station, language, {})).toBe(generateLocalizedStationTitle({ name: 'Fixture' }, language, {}));
  }
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: Iran International metadata keeps the country keyword without an origin claim', language => {
  const station = { _id: '68a8c475bd66579311ab0f07', name: 'Iran International',
    slug: 'iran-international', country: 'Iran', countryCode: 'ir' };
  const before = structuredClone(station);
  const country = getStationCountryName(station, language);
  const path = `/${language}/station/${station.slug}`;
  const title = generateLocalizedStationTitle(station, language, {});
  expect(title.split(' — ').slice(0, 2)).toEqual([station.name, country]);
  const tags = generateSeoTags('station', language, { seo_from: 'ORIGIN_MUST_NOT_APPEAR' }, path,
    'https://themegaradio.com', station, path, path);
  expect([tags.title, tags.ogTitle, tags.twitterTitle]).toEqual([title, title, title]);
  expect(title).not.toMatch(/from Iran|aus Iran|ORIGIN_MUST_NOT_APPEAR/i);
  expect(tags.keywords).toContain('Iran');
  expect(tags.canonical).toBe(`https://themegaradio.com${path}`);
  expect(getStationCountryQuery(station)).toBe('Iran');
  const customTags = generateSeoTags('station', language, { 'radio_playing_page.title': 'Editorial Iran International' }, path,
    'https://themegaradio.com', station, path, path);
  expect([customTags.title, customTags.ogTitle, customTags.twitterTitle]).toEqual(Array(3).fill('Editorial Iran International'));
  expect(station).toEqual(before);
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: missing metadata descriptions and schema use neutral country qualifiers', language => {
  const station = { name: 'Iran International', country: 'Iran', countryCode: 'ir', tags: 'news' };
  const country = getStationCountryName(station, language);
  const translations = { broadcasting_from: 'UNSAFE_ORIGIN', seo_broadcasting_from: 'UNSAFE_ORIGIN' };
  const full = getLocalizedStationDescription(station, language, translations);
  const meta = getStationMetaDescription(station, language, translations);
  const schema = generateRadioStationSchema(station, 'themegaradio.com', language);
  for (const description of [full, meta, schema.description]) {
    expect(description).toContain(country);
    expect(description).not.toMatch(/broadcasting from|from Iran|aus Iran|UNSAFE_ORIGIN/i);
    if (language !== 'en') expect(description).toContain(` — ${country}`);
  }
  expect(schema.areaServed['@type']).toBe('Country');
  expect(schema.broadcaster.address).toBeUndefined();
  expect(schema.broadcaster.location).toBeUndefined();
  for (const country of ['Unknown', 'Worldwide', 'ZZ', 'QQ']) {
    const unknown = { ...station, country, countryCode: 'ZZ' };
    for (const description of [getLocalizedStationDescription(unknown, language, {}),
      getStationMetaDescription(unknown, language, {}),
      generateRadioStationSchema(unknown, 'themegaradio.com', language).description]) {
      expect(description).not.toContain(country);
      expect(description).not.toMatch(/broadcasting from/i);
    }
  }
  const editorial = { ...station, descriptions: { [language]: { full: 'Editorial broadcasting from Iran.', meta: 'Editorial from Iran.' } } };
  expect(getLocalizedStationDescription(editorial, language, {})).toBe(editorial.descriptions[language].full);
  expect(getStationMetaDescription(editorial, language, {})).toBe(editorial.descriptions[language].meta);
  expect(generateRadioStationSchema(editorial, 'themegaradio.com', language).description).toBe(editorial.descriptions[language].meta);
});
