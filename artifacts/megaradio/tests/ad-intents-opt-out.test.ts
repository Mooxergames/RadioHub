import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  document.body.classList.remove('google-anno-skip');
  document.querySelectorAll('script[src*="adsbygoogle.js"]').forEach(script => script.remove());
});
afterEach(() => {
  document.body.classList.remove('google-anno-skip', 'radio-theme');
  document.querySelectorAll('script[src*="adsbygoogle.js"]').forEach(script => script.remove());
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

it.each(['index.html', '../api-server/src/index-web.ts'])('opts out in the initial HTML body: %s', path => {
  const source = readFileSync(path, 'utf8');
  const body = source.match(/<body\b[^>]*>/)?.[0];
  expect(body).toBeTruthy();
  const parsed = new DOMParser().parseFromString(`${body}</body>`, 'text/html');
  expect(parsed.body.classList.contains('google-anno-skip')).toBe(true);
});

it('applies the opt-out before loading the ordinary ads SDK and preserves body classes', async () => {
  window.history.replaceState({}, '', '/de');
  document.body.classList.add('radio-theme');
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
    expect(document.body.classList.contains('google-anno-skip')).toBe(true);
    return append(node);
  });
  const { ensureAdSenseScript } = await import('../src/lib/adsense-runtime');
  const ready = ensureAdSenseScript();
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="adsbygoogle.js"]');
  expect(scripts).toHaveLength(1);
  scripts[0].dispatchEvent(new Event('load'));
  await expect(ready).resolves.toBe(true);
  expect(document.body.classList.contains('radio-theme')).toBe(true);
  await expect(ensureAdSenseScript()).resolves.toBe(true);
  expect(document.querySelectorAll('script[src*="adsbygoogle.js"]')).toHaveLength(1);
});

it('does not enable advertisements on a login page', async () => {
  window.history.replaceState({}, '', '/tr/login?returnTo=%2Ftr');
  const { ensureAdSenseScript } = await import('../src/lib/adsense-runtime');
  await expect(ensureAdSenseScript()).resolves.toBe(false);
  expect(document.body.classList.contains('google-anno-skip')).toBe(true);
  expect(document.querySelector('script[src*="adsbygoogle.js"]')).toBeNull();
});
