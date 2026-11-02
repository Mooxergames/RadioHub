import {CRITICAL_TRANSLATION_KEYS} from '@workspace/seo-shared/critical-translation-keys';
import { FAQ_PAGE_TRANSLATION_KEYS, HOME_FAQ_TRANSLATION_KEYS } from '@workspace/seo-shared/faq-schema';

/** The production SSR template bypasses the legacy HTML middleware. Emit the
 * same current-language first-paint contract here; keep the full API refresh. */
export function renderTranslationBootstrap(language: string, translations: Record<string, string>, pageType?: string): string {
  const pageKeys = pageType === 'faq' ? FAQ_PAGE_TRANSLATION_KEYS : pageType === 'home' ? HOME_FAQ_TRANSLATION_KEYS : [];
  const keys = [...CRITICAL_TRANSLATION_KEYS, ...pageKeys];
  const critical = Object.fromEntries(keys.filter(key => typeof translations?.[key] === 'string')
    .map(key => [key,translations[key]]));
  const json = JSON.stringify(critical).replace(/</g,'\\u003c');
  const lang = JSON.stringify(language).replace(/</g,'\\u003c');
  return `<script id="initial-translations">window.__INITIAL_LANGUAGE__=${lang};window.__INITIAL_TRANSLATIONS__=${json};window.__PRELOADED__=true;</script>`;
}
