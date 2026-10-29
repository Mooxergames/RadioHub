import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES, getLanguageFromPath, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { getExplicitLanguageFromPath, getPreferredLanguageCookie, getSupportedLanguage } from '@workspace/seo-shared/language-preference';

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: active preference accepts base and regional tags`, () => {
    assert.equal(getSupportedLanguage(language), language);
    assert.equal(getSupportedLanguage(` ${language.toUpperCase()}-AT `), language);
    assert.equal(getPreferredLanguageCookie(`other=1; preferredLanguage=${language}; trailing=2`), language);
  });
}

for (const { code } of SEO_LANGUAGES.filter(language => language.enabled
  && !(ACTIVE_SITEMAP_LANGUAGES as readonly string[]).includes(language.code))) {
  test(`${code}: inactive preferences do not narrow explicit legacy URL parsing`, () => {
    assert.equal(getSupportedLanguage(code), undefined);
    assert.equal(getSupportedLanguage(`${code}-ZA`), undefined);
    assert.equal(getPreferredLanguageCookie(`preferredLanguage=${code}`), undefined);
    assert.equal(getExplicitLanguageFromPath(`/${code.toUpperCase()}/station/example`), code);
    assert.equal(getLanguageFromPath(`/${code}/station/example`).language, code);
  });
}

test('preference parsing preserves regional tags and rejects malformed values/cookies', () => {
  assert.equal(getSupportedLanguage('zh-Hans'), 'zh');
  assert.equal(getSupportedLanguage('de-AT'), 'de');
  assert.equal(getPreferredLanguageCookie('preferredLanguage=%64%65%2DAT'), 'de');
  for (const value of [undefined, null, 14, {}, '', 'zz', 'de_AT', 'de--AT', 'de;q=0.9', '/de', 'de/']) {
    assert.equal(getSupportedLanguage(value), undefined);
  }
  for (const cookie of ['notpreferredLanguage=de', 'preferredLanguage', 'preferredLanguage=%E0%A4%A', 'preferredLanguage=zz']) {
    assert.equal(getPreferredLanguageCookie(cookie), undefined);
  }
  assert.equal(getExplicitLanguageFromPath('/amazing/station/example'), undefined);
  assert.equal(getExplicitLanguageFromPath('/zz/station/example'), undefined);
});
