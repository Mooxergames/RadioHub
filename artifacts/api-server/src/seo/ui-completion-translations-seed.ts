import source from './ui-completion-source.json';
import values from './ui-completion-values.json';
import hebrewExtra from './ui-completion-he-extra.json';
import { pgLocalization } from '../data/postgres-localization-store';
import { CacheManager } from '../cache';
import { performanceCache } from '../performance-cache';
import { logger } from '../utils/logger';

export const UI_COMPLETION_KEYS = [...source.keys, ...source.hebrewExtra];
export const UI_COMPLETION_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: Object.fromEntries(UI_COMPLETION_KEYS.map(row => [row.key, row.defaultValue])),
  ...Object.fromEntries(Object.entries(values).map(([language, translations]) => [language, { ...translations }])),
};
Object.assign(UI_COMPLETION_TRANSLATIONS.he, hebrewExtra);

export async function seedUiCompletionTranslations(): Promise<void> {
  const changed = await pgLocalization().seedTranslationBundle(
    UI_COMPLETION_KEYS, UI_COMPLETION_TRANSLATIONS, 'ui-completion', { bumpVersion: true },
  );
  if (changed) {
    await CacheManager.clearByPattern('translations');
    performanceCache.clearTranslations();
    logger.log(`seedUiCompletionTranslations: filled ${changed} missing translations`);
  }
}
