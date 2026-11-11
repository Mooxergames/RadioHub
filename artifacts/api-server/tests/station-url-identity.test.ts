import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import {
  normalizeUrlForLanguage, reverseTranslateUrl, setDatabaseUrlTranslations,
  translateUrl, URL_TRANSLATIONS,
} from '@workspace/seo-shared/url-translations';
import { decodePublicSeoPath } from '../src/seo/public-route-matchers';

afterEach(() => setDatabaseUrlTranslations(new Map()));

const identities = ['profil', 'profile', 'discover', 'station', 'sta', 'station-xyz',
  'normal-fm', '0123456789abcdef01234567', 'radyo-\u00e7a\u011fr\u0131'];
const suffix = '?utm_source=a%26b&next=/profile#stations';

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: exact station identity survives translation, reversal and cross-language normalization`, () => {
    for (const key of ['station', 'stations']) {
      const route = URL_TRANSLATIONS[language]?.[key] || key;
      // Some locales share singular/plural; either English route represents
      // the same identity. A-Z ownership remains the renderer's responsibility.
      const englishKey = reverseTranslateUrl(`/${route}/normal-fm`, language).split('/')[1];
      for (const identity of identities) {
        const english = `/${key}/${identity}${suffix}`;
        const localized = `/${route}/${identity}${suffix}`;
        assert.equal(translateUrl(english, language), localized);
        assert.equal(reverseTranslateUrl(localized, language), `/${englishKey}/${identity}${suffix}`);
        assert.deepEqual(normalizeUrlForLanguage(`/${language}${localized}`, language), {
          normalized: `/${language}${localized}`, needsRedirect: false,
        });
        const wrongRoute = language === 'tr' ? 'sender' : 'istasyon';
        assert.deepEqual(normalizeUrlForLanguage(`/${language}/${wrongRoute}/${identity}${suffix}`, language), {
          normalized: `/${language}/${URL_TRANSLATIONS[language]?.station || 'station'}/${identity}${suffix}`,
          needsRedirect: true,
        });
      }
    }
  });

  test(`${language}: station directory roots and A-Z keys keep their structural routes`, () => {
    const route = URL_TRANSLATIONS[language]?.stations || 'stations';
    assert.equal(translateUrl('/stations', language), `/${route}`);
    for (const key of ['a', '0-9']) {
      assert.equal(translateUrl(`/stations/${key}`, language), `/${route}/${key}`);
      assert.match(reverseTranslateUrl(`/${route}/${key}`, language), new RegExp(`^/stations?/${key}$`));
    }
  });
}

test('custom station route overrides take precedence without translating opaque identities', () => {
  setDatabaseUrlTranslations(new Map([
    ['tr:station', 'radyo-kanali'], ['tr:stations', 'tum-kanallar'], ['tr:profile', 'profil'],
    ['tr:discover', 'kesif'], ['de:station', 'radiosender'],
  ]));
  assert.equal(translateUrl(`/station/profil${suffix}`, 'tr'), `/radyo-kanali/profil${suffix}`);
  assert.equal(reverseTranslateUrl(`/radyo-kanali/profil${suffix}`, 'tr'), `/station/profil${suffix}`);
  assert.equal(reverseTranslateUrl('/istasyon/profil', 'tr'), '/station/profil', 'static legacy route still works');
  assert.deepEqual(normalizeUrlForLanguage(`/de/radyo-kanali/discover${suffix}`, 'de'), {
    normalized: `/de/radiosender/discover${suffix}`, needsRedirect: true,
  });
  assert.deepEqual(normalizeUrlForLanguage('/tr/radyo-kanali/profil', 'tr'), {
    normalized: '/tr/radyo-kanali/profil', needsRedirect: false,
  });
  assert.equal(translateUrl('/stations/profil', 'tr'), '/tum-kanallar/profil');
});

test('single-pass station decoding preserves Unicode without manufacturing route boundaries', () => {
  for (const identity of ['radyo-\u00e7a\u011fr\u0131', '\u0440\u0430\u0434\u0438\u043e']) {
    const encoded = encodeURIComponent(identity);
    assert.equal(translateUrl(`/station/${encoded}`, 'tr'), `/istasyon/${encoded}`);
    assert.equal(reverseTranslateUrl(`/istasyon/${encoded}`, 'tr'), `/station/${identity}`);
    assert.deepEqual(normalizeUrlForLanguage(`/tr/istasyon/${encoded}`, 'tr'), {
      normalized: `/tr/istasyon/${identity}`, needsRedirect: false,
    });
  }
  for (const identity of ['radio%2Fone', 'radio%5Cone', 'radio%3Fone', 'radio%23one',
    '%00one', '%7Fone', '%2E', '%2E%2E', '%E0%A4%A']) {
    assert.equal(reverseTranslateUrl(`/istasyon/${identity}`, 'tr'), `/station/${identity}`);
    assert.equal(normalizeUrlForLanguage(`/tr/station/${identity}`, 'tr').normalized, `/tr/istasyon/${identity}`);
  }
  for (const identity of ['radio%2Fone', 'radio%5Cone', 'radio%3Fone', 'radio%23one', '%00one', '%7Fone', '%E0%A4%A']) {
    assert.equal(decodePublicSeoPath(`/tr/istasyon/${identity}`), null, 'public rejection must not be weakened');
  }
  assert.equal(reverseTranslateUrl('/istasyon/%2570rofil', 'tr'), '/station/%70rofil');
  assert.equal(reverseTranslateUrl('/istasyon/radio%252Fone', 'tr'), '/station/radio%2Fone');
});

test('identity protection does not generalize to account, country, region or extra-deep station routes', () => {
  assert.equal(translateUrl('/profile/settings', 'tr'), '/profil/ayarlar');
  assert.equal(reverseTranslateUrl('/profil/ayarlar', 'tr'), '/profile/settings');
  assert.equal(translateUrl('/regions/europe/germany/stations', 'tr'), '/bolgeler/europe/germany/istasyonlar');
  assert.equal(translateUrl('/country/germany/stations', 'tr'), '/country/germany/istasyonlar');
  assert.equal(translateUrl('/profile/station/discover', 'tr'), '/profil/istasyon/ke\u015ffet');
  assert.equal(translateUrl('/station/discover/settings', 'tr'), '/istasyon/ke\u015ffet/ayarlar');
  assert.equal(translateUrl(`/blog/profile${suffix}`, 'tr'), `/blog/profile${suffix}`);
  assert.equal(reverseTranslateUrl(`/blog/profil${suffix}`, 'tr'), `/blog/profil${suffix}`);
});
