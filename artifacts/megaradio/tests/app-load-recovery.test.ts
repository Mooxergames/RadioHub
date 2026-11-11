import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const recovery = html.match(/<script\b[^>]*id="app-load-recovery"[^>]*>([\s\S]*?)<\/script>/)![1];
const retryKey = 'megaradio:asset-recovery';

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = 'en';
});

function page(options: { storage?: Map<string, string>; storageBlocked?: boolean; online?: boolean; language?: string; entry?: string; pathname?: string } = {}) {
  document.documentElement.lang = options.language || 'ar';
  document.body.innerHTML = '<main id="root"><div id="ssr-content"><h1>PSY Trance</h1></div></main>';
  const entry = document.createElement('script');
  entry.type = 'module';
  entry.setAttribute('src', options.entry || '/assets/index-current.js');
  document.body.appendChild(entry);
  const storage = options.storage || new Map<string, string>();
  const listeners: Record<string, (event: unknown) => void> = {};
  const reload = vi.fn();
  runInNewContext(recovery, {
    document, URL,
    navigator: { onLine: options.online !== false },
    window: {
      location: { origin: window.location.origin, pathname: options.pathname || '/ar/mahta/psy-trance', reload },
      sessionStorage: {
        getItem: (key: string) => {
          if (options.storageBlocked) throw new Error('SecurityError');
          return storage.get(key) ?? null;
        },
        setItem: (key: string, value: string) => { storage.set(key, value); },
      },
      addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; },
    },
  });
  const fail = (target: EventTarget = entry, type = 'error') => {
    const event = { target, preventDefault: vi.fn() };
    listeners[type](event);
    return event;
  };
  return { reload, storage, fail, entry };
}

it('does not touch readable content or reload while the app loads normally', () => {
  const { reload, storage } = page();
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
  expect(document.querySelector('#ssr-content h1')?.textContent).toBe('PSY Trance');
  expect(document.getElementById('app-load-error')).toBeNull();
  expect(html.indexOf('id="app-load-recovery"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
});

it('recovers an entry module or static dependency failure before main.tsx can run', () => {
  const { fail, reload, storage } = page();
  const event = fail();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(storage.get(retryKey)).toBe('/ar/mahta/psy-trance|/assets/index-current.js');
  fail();
  expect(reload).toHaveBeenCalledTimes(1);
});

it('stops retrying across a reload and offers a working localized manual action', () => {
  const first = page();
  first.fail();
  const second = page({ storage: first.storage });
  second.fail();
  expect(second.reload).not.toHaveBeenCalled();
  const panel = document.getElementById('app-load-error')!;
  expect(panel.getAttribute('role')).toBe('alert');
  const button = panel.querySelector('button')!;
  expect(button.textContent).toBe('إعادة التحميل');
  expect(document.querySelector('#ssr-content h1')?.textContent).toBe('PSY Trance');
  second.fail();
  expect(document.querySelectorAll('#app-load-error')).toHaveLength(1);
  button.click();
  expect(second.reload).toHaveBeenCalledTimes(1);
});

it('uses the same bounded recovery for later Vite chunk failures', () => {
  const first = page();
  first.fail(window, 'vite:preloadError');
  expect(first.reload).toHaveBeenCalledTimes(1);
  const second = page({ storage: first.storage });
  second.fail(window, 'vite:preloadError');
  expect(second.reload).not.toHaveBeenCalled();
  expect(document.getElementById('app-load-error')).not.toBeNull();
});

it.each(['image', 'stylesheet', 'modulepreload', 'external-module', 'runtime-error', 'development-module'])(
  'does not reload for an unrelated %s failure', kind => {
    const { fail, reload } = page();
    let target: EventTarget;
    if (kind === 'image') target = document.createElement('img');
    else if (kind === 'stylesheet' || kind === 'modulepreload') {
      const link = document.createElement('link'); link.rel = kind; link.href = '/assets/optional.js'; target = link;
    } else if (kind === 'runtime-error') target = window;
    else {
      const script = document.createElement('script'); script.type = 'module';
      script.src = kind === 'external-module' ? 'https://ads.invalid/advert.js' : '/src/main.tsx'; target = script;
    }
    fail(target);
    expect(reload).not.toHaveBeenCalled();
    expect(document.getElementById('app-load-error')).toBeNull();
  },
);

it.each(['storage-blocked', 'offline'])('keeps a usable manual retry when %s', kind => {
  const { fail, reload } = page({ storageBlocked: kind === 'storage-blocked', online: kind !== 'offline' });
  expect(() => fail()).not.toThrow();
  expect(reload).not.toHaveBeenCalled();
  expect(document.querySelector('#app-load-error button')).not.toBeNull();
});

it('allows one fresh attempt for a different deployed entry', () => {
  const first = page(); first.fail();
  const updated = page({ storage: first.storage, entry: '/assets/index-new-build.js' }); updated.fail();
  expect(updated.reload).toHaveBeenCalledTimes(1);
});

it.each(['en', 'de', 'tr', 'ar', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'hi', 'he', 'unknown'])(
  'shows a manual retry in the %s locale without losing station content', language => {
    const { fail } = page({ language, online: false }); fail();
    const button = document.querySelector('#app-load-error button');
    expect(button?.textContent?.length).toBeGreaterThan(0);
    if (language !== 'en' && language !== 'unknown') expect(button?.textContent).not.toBe('Reload');
    expect(document.getElementById('ssr-content')).not.toBeNull();
  },
);

it('copies the early recovery script into production SSR before build assets', () => {
  const source = readFileSync('../api-server/src/index-web.ts', 'utf8');
  expect(source).toContain('id="app-load-recovery"');
  expect(source.indexOf('${prodTags.recovery}')).toBeLessThan(source.indexOf('${prodTags.styles}'));
  expect(source.indexOf('${prodTags.recovery}')).toBeLessThan(source.indexOf('${prodTags.scripts'));
  expect(readFileSync('src/main.tsx', 'utf8')).not.toContain("window.addEventListener('vite:preloadError'");
});
