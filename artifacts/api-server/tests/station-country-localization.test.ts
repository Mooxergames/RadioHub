import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateLocalizedStationTitle, generateSeoTags, getLocalizedStationDescription,
  getNativeCountryName, getStationCountryName, getStationCountryQuery, getStationMetaDescription,
  ACTIVE_SITEMAP_LANGUAGES, CODE_TO_COUNTRY, COUNTRY_TO_CODE, ISO_3166_ALPHA2_CODES } from '@workspace/seo-shared/seo-config';
import { generateRadioStationSchema, getSchemaCountry } from '@workspace/seo-shared/structured-data';

const station = { name: 'KISS 98.1', slug: 'kiss-98-1', country: 'The United States Of America', countryCode: 'US' };

for (const [language, country, segment] of [['de', 'Vereinigte Staaten', 'sender'], ['tr', 'Amerika Birleşik Devletleri', 'istasyon']]) {
  test(`${language}: station titles and generated descriptions localize the ISO country without rewriting source or URLs`, () => {
    const before = structuredClone(station);
    const path = `/${language}/${segment}/${station.slug}`;
    const tags = generateSeoTags('station', language, {}, `/station/${station.slug}`, 'https://themegaradio.com', station, path, path);
    for (const title of [tags.title, tags.ogTitle, tags.twitterTitle]) {
      assert.ok(title?.includes(country));
      assert.ok(!title.includes(station.country));
    }
    assert.ok(getLocalizedStationDescription(station, language, {}).includes(country));
    assert.ok(getStationMetaDescription(station, language, {}).includes(country));
    assert.equal(tags.canonical, `https://themegaradio.com${path}`);
    assert.deepEqual(station, before);
  });
}

test('English source wording, invalid ISO fallbacks and stored editorial content stay unchanged', () => {
  assert.equal(getNativeCountryName(station.country, 'en', 'US'), station.country);
  assert.ok(generateLocalizedStationTitle(station, 'en', {}).includes(station.country));
  assert.equal(getNativeCountryName(station.country, 'de', ' us '), 'Vereinigte Staaten');
  for (const code of ['', 'USA', 'ZZ', 'XX', '12', null]) {
    assert.equal(getNativeCountryName('Germany', 'tr', code), 'Almanya');
  }
  const editorial = { ...station, descriptions: { de: { full: 'Freigegebener redaktioneller Text.', meta: 'Freigegebene Beschreibung.' } } };
  assert.equal(getLocalizedStationDescription(editorial, 'de', {}), editorial.descriptions.de.full);
  assert.equal(getStationMetaDescription(editorial, 'de', {}), editorial.descriptions.de.meta);
  assert.equal(generateLocalizedStationTitle(station, 'de', { 'radio_playing_page.title': 'Redaktioneller Titel' }), 'Redaktioneller Titel');
});

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: missing-country sentinels stay absent and a valid ISO restores localized country identity`, () => {
    for (const country of ['Unknown', ' unknown ', '', null, undefined, 42]) {
      for (const countryCode of ['', 'XX', 'ZZ', 'USA', null]) {
        const source = { name: 'Fixture Radio', tags: 'news', country, countryCode };
        assert.equal(getStationCountryName(source, language), '');
        assert.equal(getStationCountryQuery(source), '');
        assert.ok(!generateLocalizedStationTitle(source, language, {}).toLowerCase().includes('unknown'));
        assert.ok(!getLocalizedStationDescription(source, language, {}).toLowerCase().includes('unknown'));
        assert.ok(!getStationMetaDescription(source, language, {}).toLowerCase().includes('unknown'));
      }
      const source = { name: 'Fixture Radio', country, countryCode: ' gb ' };
      const expected = language === 'en' ? CODE_TO_COUNTRY.gb
        : new Intl.DisplayNames([language], { type: 'region' }).of('GB');
      assert.equal(getStationCountryName(source, language), expected);
      assert.equal(getStationCountryQuery(source), CODE_TO_COUNTRY.gb);
      assert.ok(generateLocalizedStationTitle(source, language, {}).includes(expected!));
      assert.ok(getLocalizedStationDescription(source, language, {}).includes(expected!));
      assert.ok(getStationMetaDescription(source, language, {}).includes(expected!));
    }
    const verbose = { country: CODE_TO_COUNTRY.gb, countryCode: 'GB' };
    assert.equal(getStationCountryName(verbose, language), getStationCountryName({ country: 'Unknown', countryCode: 'GB' }, language));
    assert.equal(getStationCountryName({ country: CODE_TO_COUNTRY.gb }, language), getStationCountryName(verbose, language));
  });
}

test('legacy valid country API identities and English wording stay stable', () => {
  for (const country of ['Austria', 'Germany', 'Turkey', 'Türkiye', 'United Kingdom', CODE_TO_COUNTRY.gb, station.country]) {
    assert.equal(getStationCountryQuery({ country }), country);
    assert.equal(getStationCountryName({ country }, 'en'), country);
  }
  assert.equal(getStationCountryQuery({ country: 'AT' }), 'Austria');
  assert.equal(getStationCountryQuery({ country: 'Unknown', countryCode: 'AT' }), 'Austria');
  assert.equal(getStationCountryQuery({ country: 'Unknown', countryCode: 'RS' }), 'Serbia');
  assert.equal(getStationCountryName({ country: 'Unknown', countryCode: 'RS' }, 'de'), 'Serbien');
  assert.equal(getStationCountryName({ country: 'Germany', countryCode: 'XX' }, 'tr'), 'Almanya');
});

const iranInternational = { _id: '68a8c475bd66579311ab0f07', name: 'Iran International',
  slug: 'iran-international', country: 'Iran', countryCode: 'ir', tags: 'news' };

test('all 249 assigned ISO countries are accepted; only XK is an explicit catalogue exception', () => {
  assert.equal(ISO_3166_ALPHA2_CODES.length, 249);
  assert.equal(new Set(ISO_3166_ALPHA2_CODES).size, 249);
  for (const code of [...ISO_3166_ALPHA2_CODES, 'XK']) {
    const station = { country: 'Unknown', countryCode: ` ${code.toLowerCase()} ` };
    assert.ok(getStationCountryQuery(station), code);
    for (const language of ACTIVE_SITEMAP_LANGUAGES) {
      assert.ok(getStationCountryName(station, language), `${code}:${language}`);
      assert.equal(getSchemaCountry(station, language)?.code, code, `${code}:${language}`);
    }
  }
  assert.equal(ISO_3166_ALPHA2_CODES.includes('XK'), false);
  assert.equal(getStationCountryQuery({ country: 'Unknown', countryCode: 'XK' }), 'Kosovo');
});

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: country query, display and schema share ISO and sentinel acceptance`, () => {
    for (const code of ['LT', 'TN', 'MC', 'SM']) {
      if (code === 'MC' || code === 'SM') {
        assert.equal(Object.hasOwn(CODE_TO_COUNTRY, code.toLowerCase()), false);
        assert.equal(Object.values(COUNTRY_TO_CODE).includes(code.toLowerCase()), false);
      }
      const expected = new Intl.DisplayNames([language], { type: 'region' }).of(code)!;
      const identity = CODE_TO_COUNTRY[code.toLowerCase()]
        || new Intl.DisplayNames(['en'], { type: 'region' }).of(code)!;
      for (const source of [{ country: 'Unknown', countryCode: ` ${code.toLowerCase()} ` }, { country: code }]) {
        assert.equal(getStationCountryQuery(source), identity);
        assert.equal(getStationCountryName(source, language), expected);
        assert.deepEqual(getSchemaCountry(source, language), { name: expected, code });
        assert.ok(generateLocalizedStationTitle({ ...source, name: 'Fixture' }, language, {}).includes(expected));
      }
    }
    for (const source of [
      { country: 'Worldwide' }, { country: ' worldwide ', countryCode: 'MC' },
      { country: 'Unknown' }, { country: 'ZZ' }, { country: 'XX' }, { country: 'QQ' },
      ...['XX', 'ZZ', 'USA', '12', 'QQ', 'XA', 'XB', 'EU', 'UN', 'SU', 'AN', 'CS', 'YU', 'BU', 'UK', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']
        .flatMap(countryCode => [{ country: 'Unknown', countryCode }, ...(/^[A-Z]{2}$/.test(countryCode) ? [{ country: countryCode }] : [])]),
    ]) {
      assert.equal(getStationCountryQuery(source), '');
      assert.equal(getStationCountryName(source, language), '');
      assert.equal(getSchemaCountry(source, language), undefined);
      assert.equal(generateLocalizedStationTitle({ ...source, name: 'Fixture' }, language, {}),
        generateLocalizedStationTitle({ name: 'Fixture' }, language, {}));
    }
  });

  test(`${language}: Iran International metadata uses a neutral country qualifier and preserves editorial titles`, () => {
    const before = structuredClone(iranInternational);
    const path = `/${language}/station/${iranInternational.slug}`;
    const country = getStationCountryName(iranInternational, language);
    const withoutCountry = generateLocalizedStationTitle({ name: iranInternational.name }, language, {});
    const expected = withoutCountry.replace(iranInternational.name, `${iranInternational.name} — ${country}`);
    const tags = generateSeoTags('station', language, { seo_from: 'ORIGIN_MUST_NOT_APPEAR' }, path,
      'https://themegaradio.com', iranInternational, path, path);
    for (const title of [tags.title, tags.ogTitle, tags.twitterTitle]) {
      assert.equal(title, expected);
      assert.doesNotMatch(title!, /from Iran|aus Iran|ORIGIN_MUST_NOT_APPEAR/i);
    }
    assert.ok(tags.keywords?.includes('Iran'));
    assert.equal(tags.canonical, `https://themegaradio.com${path}`);
    assert.equal(getStationCountryQuery(iranInternational), 'Iran');
    for (const custom of ['Editorial: Iran International', '{station_name} | Editorial {listen_live}']) {
      const translations = { 'radio_playing_page.title': custom, listen_live: 'LIVE' };
      const customTags = generateSeoTags('station', language, translations, path,
        'https://themegaradio.com', iranInternational, path, path);
      const title = custom.replace('{station_name}', iranInternational.name).replace('{listen_live}', 'LIVE');
      assert.equal(customTags.title, title);
      assert.equal(customTags.ogTitle, title);
      assert.equal(customTags.twitterTitle, title);
    }
    assert.deepEqual(iranInternational, before);
  });

  test(`${language}: missing-description fallbacks qualify catalogue country without inferring broadcast origin`, () => {
    const source = { ...iranInternational, descriptions: { [language]: { full: '', meta: '' } } };
    const before = structuredClone(source);
    const country = getStationCountryName(source, language);
    const translations = { broadcasting_from: 'UNSAFE_ORIGIN', seo_broadcasting_from: 'UNSAFE_ORIGIN' };
    const full = getLocalizedStationDescription(source, language, translations);
    const meta = getStationMetaDescription(source, language, translations);
    const fallbackSchema = generateRadioStationSchema(iranInternational, 'themegaradio.com', language);
    for (const description of [full, meta, fallbackSchema.description]) {
      assert.ok(description.includes(country));
      assert.doesNotMatch(description, /broadcasting from|from Iran|aus Iran|UNSAFE_ORIGIN/i);
      if (language !== 'en') assert.ok(description.includes(` — ${country}`));
    }
    assert.equal(fallbackSchema.areaServed['@type'], 'Country');
    assert.equal(fallbackSchema.broadcaster.address, undefined);
    assert.equal(fallbackSchema.broadcaster.location, undefined);
    const fromMeta = getStationMetaDescription(source, language, { from: 'UNSAFE_ORIGIN' });
    assert.ok(!fromMeta.includes(`UNSAFE_ORIGIN ${country}`));

    for (const country of ['Unknown', 'Worldwide', 'ZZ', 'QQ']) {
      const unknown = { ...iranInternational, country, countryCode: 'ZZ' };
      for (const description of [getLocalizedStationDescription(unknown, language, {}),
        getStationMetaDescription(unknown, language, {}),
        generateRadioStationSchema(unknown, 'themegaradio.com', language).description]) {
        assert.ok(!description.includes(country));
        assert.doesNotMatch(description, /broadcasting from/i);
      }
    }
    const editorial = { ...iranInternational, descriptions: { [language]: {
      full: 'Editorial broadcasting from Iran: preserve this full text.',
      meta: 'Editorial from Iran: preserve this meta text.',
    } } };
    assert.equal(getLocalizedStationDescription(editorial, language, {}), editorial.descriptions[language].full);
    assert.equal(getStationMetaDescription(editorial, language, {}), editorial.descriptions[language].meta);
    assert.equal(generateRadioStationSchema(editorial, 'themegaradio.com', language).description, editorial.descriptions[language].meta);
    assert.equal(generateRadioStationSchema(iranInternational, 'themegaradio.com', language, undefined, 'Explicit from Iran.').description, 'Explicit from Iran.');
    assert.equal(generateRadioStationSchema({ ...iranInternational, description: 'Source description from Iran.' },
      'themegaradio.com', language).description, 'Source description from Iran.');
    if (language !== 'en') {
      assert.equal(getStationMetaDescription(source, language, { default_station_about: 'Editorial {station_name} from Iran.' }),
        'Editorial Iran International from Iran.');
    }
    assert.deepEqual(source, before);
  });
}

test('English and German default titles qualify Iran without claiming an origin', () => {
  assert.equal(generateLocalizedStationTitle(iranInternational, 'en', {}), 'Iran International — Iran — Listen Live');
  assert.equal(generateLocalizedStationTitle(iranInternational, 'de', {}), 'Iran International — Iran — Live Hören');
});
