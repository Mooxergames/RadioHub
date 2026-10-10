import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatMediaPicker } from '../src/components/chat-media-picker';
import { gifSlug, parseGifPage, resolveGif, searchGifs } from '../src/lib/chat-gifs';
import { getChatMediaCopy } from '../src/lib/chat-media-copy';

const item = (slug: string) => ({slug, title: slug, type: 'gif', file: {sm: {
  webp: {url: `https://static.klipy.com/${slug}.webp?delivery=unchanged`, width:220, height:220},
  jpg: {url: `https://static.klipy.com/${slug}.jpg`},
}}});
const payload = (slug: string, next = false) => ({result:true, data:{data:[item(slug)],has_next:next}});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { vi.stubEnv('VITE_KLIPY_API_KEY', 'public-test-key'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('keeps emoji usable without exposing an unconfigured GIF service', () => {
  vi.stubEnv('VITE_KLIPY_API_KEY', '');
  const onEmoji = vi.fn();
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<ChatMediaPicker language="tr" disabled={false} onGif={() => {}} onEmoji={onEmoji} onClose={() => {}} />);
  expect(screen.queryByRole('tab', { name: 'GIF' })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Emoji' }), { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('button', { name: '😀' }));
  expect(onEmoji).toHaveBeenCalledWith('😀');
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps signed media URLs and provider order, rejecting foreign hosts and invalid references', () => {
  expect(parseGifPage({result:true,data:{data:[item('b'),item('a')]}}).items.map(gif => gif.slug)).toEqual(['b','a']);
  expect(parseGifPage(payload('radio')).items[0].url).toContain('?delivery=unchanged');
  const bad = item('bad'); bad.file.sm.webp.url = 'https://tracker.example/image.gif';
  expect(() => parseGifPage({result:true,data:{data:[bad]}})).toThrow();
  expect(gifSlug('klipy:radio-123')).toBe('radio-123');
  for (const reference of ['https://static.klipy.com/a.gif','klipy:../secret','klipy:x?y=1','klipy:'+'x'.repeat(201)]) expect(gifSlug(reference)).toBe('');
});

it('sends GIF requests directly without user credentials and supports cancellation', async () => {
  const fetcher = vi.fn(async () => json(payload('radio'))); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  await searchGifs('günaydın', 2, 'tr', controller.signal);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  const parsed = new URL(url);
  expect(parsed.origin).toBe('https://api.klipy.com');
  expect(parsed.searchParams.get('q')).toBe('günaydın');
  expect(parsed.searchParams.get('page')).toBe('2');
  expect(parsed.searchParams.get('content_filter')).toBe('high');
  expect(options.credentials).toBe('omit'); expect(options.headers).toBeUndefined(); expect(options.signal).toBe(controller.signal);
});

it('loads only the GIF tab, searches, paginates, and previews without sending', async () => {
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    return json(payload(params.get('page') === '2' ? 'second' : params.get('q') || 'trending', params.get('page') !== '2'));
  });
  vi.stubGlobal('fetch', fetcher);
  const onGif = vi.fn(), onEmoji = vi.fn(), onClose = vi.fn();
  render(<ChatMediaPicker language="tr" disabled={false} onGif={onGif} onEmoji={onEmoji} onClose={onClose} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('tab',{name:'Emoji'}),{key:'ArrowRight'});
  expect(screen.getByRole('tab',{name:'GIF'})).toHaveFocus();
  await screen.findByRole('button',{name:'GIF önizleme: trending'});
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'radio'}});
  await screen.findByRole('button',{name:'GIF önizleme: radio'});
  expect(screen.queryByRole('button',{name:'GIF önizleme: trending'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Daha fazla göster'}));
  fireEvent.click(await screen.findByRole('button',{name:'GIF önizleme: second'}));
  expect(onGif).toHaveBeenCalledWith(expect.objectContaining({slug:'second',query:'radio'}));
  expect(onEmoji).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('searchbox'),{key:'Escape'}); expect(onClose).toHaveBeenCalledOnce();
});

it('ignores stale search responses and offers retry on provider failures', async () => {
  let finishOld: (value: Response) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get('q');
    if (q === 'old') return new Promise<Response>(resolve => { finishOld = resolve; });
    if (q === 'fail') return json({}, 429);
    return json(payload(q || 'trending'));
  }));
  render(<ChatMediaPicker language="tr" disabled={false} onGif={() => {}} onEmoji={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab',{name:'GIF'})); await screen.findByRole('button',{name:'GIF önizleme: trending'});
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'old'}});
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('q=old'),expect.anything()));
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'new'}});
  await screen.findByRole('button',{name:'GIF önizleme: new'});
  finishOld(json(payload('old')));
  expect(screen.queryByRole('button',{name:'GIF önizleme: old'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'fail'}});
  expect(await screen.findByRole('button',{name:'Tekrar dene'})).toBeEnabled();
});

it('has complete media copy in every supported language', () => {
  for (const language of ['tr','en','de','es','fr','it','pt','ru','nl','pl','ro','el','ar','zh','ja','ko','hi','he'])
    expect(Object.values(getChatMediaCopy(language)).every(value => !!value?.trim())).toBe(true);
});

it('resolves a search delivery slug when Items returns the canonical slug', async () => {
  const fetcher = vi.fn(async () => json(payload('on-air-radio'))); vi.stubGlobal('fetch',fetcher);
  expect((await resolveGif('klipy:on-air-radio--kB6ZL2BbD')).slug).toBe('on-air-radio');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('slugs=on-air-radio--kB6ZL2BbD'),expect.anything());
});
