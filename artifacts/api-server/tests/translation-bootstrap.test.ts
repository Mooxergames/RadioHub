import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {renderTranslationBootstrap} from '../src/seo/translation-bootstrap';
import { FAQ_PAGE_TRANSLATION_KEYS } from '@workspace/seo-shared/faq-schema';
test('production SSR sends current-language hero/header strings without the full dictionary or executable content',()=>{
 const html=renderTranslationBootstrap('de',{hero_worlds_best_radio:'Deutsches Radio',nav_add_your_station:'Sender hinzufügen',
 hero_search_placeholder:'</script><script>bad</script>',not_critical:'excluded'});
 assert.equal((html.match(/<script/g)||[]).length,1);assert.ok(!html.includes('excluded'));
 const context={window:{}} as any;vm.runInNewContext(html.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''),context);
 assert.equal(context.window.__INITIAL_LANGUAGE__,'de');
 assert.equal(context.window.__INITIAL_TRANSLATIONS__.hero_worlds_best_radio,'Deutsches Radio');
 assert.equal(context.window.__INITIAL_TRANSLATIONS__.hero_search_placeholder,'</script><script>bad</script>');
 assert.equal(context.window.__PRELOADED__,true);
});

test('FAQ snapshots every FAQ key only on the FAQ page, with shared footer labels on all pages', () => {
 const dictionary = Object.fromEntries(FAQ_PAGE_TRANSLATION_KEYS.map(key => [key, `${key}: </script> & " custom`]));
 for (const pageType of ['faq', 'home', 'station']) {
  const html = renderTranslationBootstrap('tr', {...dictionary, private_copy: 'DO NOT INCLUDE'}, pageType);
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.ok(!html.includes('DO NOT INCLUDE'));
  const context = {window: {}} as any;
  vm.runInNewContext(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''), context);
  const actual = context.window.__INITIAL_TRANSLATIONS__;
  assert.equal(actual.footer_faq, dictionary.footer_faq);
  for (const key of FAQ_PAGE_TRANSLATION_KEYS.filter(key => !['nav_faq','footer_faq'].includes(key))) {
   assert.equal(actual[key], pageType === 'faq' ? dictionary[key] : undefined);
  }
 }
});
