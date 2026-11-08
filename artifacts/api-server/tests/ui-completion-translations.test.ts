import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import source from '../src/seo/ui-completion-source.json';
import values from '../src/seo/ui-completion-values.json';
import hebrewExtra from '../src/seo/ui-completion-he-extra.json';

const slots = (value: string) => (value.match(/\{[^}]+\}/g) || []).sort();
describe('reviewed UI completion bundle', () => {
  it('covers exactly the 14 public languages without changing unrelated locales', () => {
    assert.deepEqual(['en', ...Object.keys(values)].sort(), [...ACTIVE_SITEMAP_LANGUAGES].sort());
    assert.equal(source.keys.length, 103);
    assert.equal(source.hebrewExtra.length, 22);
    assert.equal(new Set([...source.keys, ...source.hebrewExtra].map(row => row.key)).size, 125);
  });
  for (const [language, translations] of Object.entries(values)) {
    it(`${language}: every missing key has text and preserves the source placeholders`, () => {
      assert.deepEqual(Object.keys(translations).sort(), source.keys.map(row => row.key).sort());
      for (const row of source.keys) {
        const value = (translations as Record<string, string>)[row.key];
        assert.ok(value.trim(), row.key);
        assert.notEqual(value, row.key);
        assert.deepEqual(slots(value), slots(row.defaultValue), row.key);
        assert.ok(!value.includes('${'), row.key);
      }
    });
  }
  it('completes the extra Hebrew FAQ and discovery keys without losing genre placeholders', () => {
    assert.deepEqual(Object.keys(hebrewExtra).sort(), source.hebrewExtra.map(row => row.key).sort());
    for (const row of source.hebrewExtra) {
      const value = (hebrewExtra as Record<string, string>)[row.key];
      assert.ok(value.trim());
      assert.deepEqual(slots(value), slots(row.defaultValue), row.key);
    }
  });
  it('registers the gap fill in required startup after the existing seeders', () => {
    const routes = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
    assert.ok(routes.includes('await seedUiCompletionTranslations();'));
    assert.ok(routes.indexOf('await seedUiCompletionTranslations();') > routes.indexOf('await Promise.all([seedSearchPageTranslations()'));
  });
});
