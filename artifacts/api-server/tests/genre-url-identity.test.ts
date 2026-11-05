import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES, generateLanguageUrls, getLanguageFromPath } from '@workspace/seo-shared/seo-config';
import { normalizeUrlForLanguage, reverseTranslateUrl, setDatabaseUrlTranslations, translateUrl, URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

afterEach(() => setDatabaseUrlTranslations(new Map()));

test('French chanson is an opaque genre identity, not the song application route', () => {
  assert.equal(reverseTranslateUrl('/genres/chanson', 'fr'), '/genres/chanson');
  assert.deepEqual(getLanguageFromPath('/fr/genres/chanson'), { language: 'fr', cleanPath: '/genres/chanson' });
  assert.equal(translateUrl('/genres/song', 'fr'), '/genres/song');
  assert.deepEqual(normalizeUrlForLanguage('/fr/genres/chanson', 'fr'), {
    normalized: '/fr/genres/chanson', needsRedirect: false,
  });
});

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: genre slugs agree across routing, canonical and hreflang builders`, () => {
    const route = URL_TRANSLATIONS[language]?.genres || 'genres';
    for (const slug of ['chanson', 'song', 'profile', 'station', 'genres', 'artist', 'album', 'song-radio', 'classical']) {
      const english = `/genres/${slug}`;
      const local = `/${route}/${slug}`;
      assert.equal(translateUrl(english + '?page=2#radio', language), local + '?page=2#radio');
      assert.equal(reverseTranslateUrl(local + '?page=2#radio', language), english + '?page=2#radio');
      assert.deepEqual(getLanguageFromPath(`/${language}${local}`), { language, cleanPath: english });
      assert.equal(buildLocalizedUrl(english, language, undefined, new Map()), encodeURI(`/${language}${local}`));
      const alternates = generateLanguageUrls(english, 'https://themegaradio.com', language);
      assert.ok(alternates.length);
      for (const alternate of alternates) assert.ok(alternate.url.endsWith(`/${slug}`), alternate.url);
    }
  });
}

test('custom genre route names do not translate genre identifiers', () => {
  const map = new Map([['fr:genres', 'styles-radio'], ['fr:song', 'chanson'], ['tr:genres', 'muzik-turleri']]);
  setDatabaseUrlTranslations(map);
  assert.equal(translateUrl('/genres/song', 'fr'), '/styles-radio/song');
  assert.equal(reverseTranslateUrl('/styles-radio/chanson', 'fr'), '/genres/chanson');
  assert.equal(reverseTranslateUrl('/genres/chanson', 'fr'), '/genres/chanson');
  assert.equal(buildLocalizedUrl('/genres/song', 'fr', undefined, map), '/fr/styles-radio/song');
  assert.deepEqual(normalizeUrlForLanguage('/fr/muzik-turleri/chanson', 'fr'), {
    normalized: '/fr/styles-radio/chanson', needsRedirect: true,
  });
});

test('genre identity protection retains safe single decoding and rejects manufactured boundaries', () => {
  assert.equal(reverseTranslateUrl('/genres/%63hanson', 'fr'), '/genres/chanson');
  for (const slug of ['radio%2Fone', 'radio%3Fone', '%2E', '%2E%2E', '%00one', '%E0%A4%A']) {
    assert.equal(reverseTranslateUrl(`/genres/${slug}`, 'fr'), `/genres/${slug}`);
  }
  assert.equal(translateUrl('/profile/settings', 'tr'), '/profil/ayarlar');
  assert.equal(reverseTranslateUrl('/profil/ayarlar', 'tr'), '/profile/settings');
});
