import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileConnections from '../src/pages/profile-connections';
import { connectionPage, profileConnectionsCopy } from '../src/lib/profile-connections';

const fixture = vi.hoisted(() => ({ user: { _id: 'viewer' }, toast: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ language: 'tr', localeTranslations: {} }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({ getLocalizedUrl: (path: string) => `/tr${path}` }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock('@/components/RouteBreadcrumbs', () => ({ RouteBreadcrumbs: () => null, useBreadcrumbLastItemName: () => {} }));
const person = (id: string) => ({ _id: id, slug: `listener-${id}`, fullName: `Listener ${id}`, followersCount: 12 });
const page = (direction: string, ids: string[], current = 1, pages = 1) => ({ [direction]: ids.map(id => ({ user: person(id) })), pagination: { page: current, limit: 20, total: pages === 1 ? ids.length : 21, pages } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); fixture.user = { _id: 'viewer' };
  sessionStorage.clear(); sessionStorage.setItem('_mrt_oat', 'fixture-only');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  fetchMock = vi.fn(async () => json(page('followers', ['one'])));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); client.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const mount = (direction: 'followers' | 'following' = 'followers') => render(<ProfileConnections direction={direction} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });

it('loads the own-account list with auth, links people by slug, and exposes separate tabs', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: 'Listener one' })).toBeVisible();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/user-engagement/connections/followers?page=1&limit=20');
  expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ credentials: 'include', headers: { Authorization: 'Bearer fixture-only' }, signal: expect.any(AbortSignal) }));
  expect(screen.getByRole('link', { name: /Listener one/ })).toHaveAttribute('href', '/tr/users/listener-one');
  expect(screen.getByRole('link', { name: 'Takipçiler', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Takip edilenler', exact: true })).toHaveAttribute('href', '/tr/profile/following');
});

it('appends the next page and resets pagination after removal so shifted results are not skipped', async () => {
  let removed = false;
  fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
    if (options.method === 'POST') { removed = true; return json({ success: true }); }
    return json(url.includes('page=2') ? page('followers', ['two'], 2, 2) : removed ? page('followers', ['two']) : page('followers', ['one'], 1, 2));
  });
  mount(); await screen.findByRole('heading', { name: 'Listener one' });
  fireEvent.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
  await screen.findByRole('heading', { name: 'Listener two' });
  const invalidation = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(screen.getByRole('button', { name: 'Kaldır: Listener one' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Listener one' })).toBeNull());
  await screen.findByRole('heading', { name: 'Listener two' });
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => url)).toEqual(['/api/user-engagement/remove-follower/one']);
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('page=2'))).toHaveLength(1);
  await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ['/api/auth/me'] }));
});

it('following uses unfollow, deduplicates pending requests and retains the row after a failure', async () => {
  const write = deferred();
  fetchMock.mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST' ? write.promise : json(page('following', ['one'])));
  mount('following'); await screen.findByRole('heading', { name: 'Listener one' });
  const button = screen.getByRole('button', { name: /Listener one/ });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => url)).toEqual(['/api/user-engagement/unfollow/one']);
  await act(async () => write.resolve(json({ error: 'unavailable' }, 500)));
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByRole('heading', { name: 'Listener one' })).toBeVisible();
  expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
});

it('shows a retryable request error rather than falsely reporting an empty list', async () => {
  fetchMock.mockResolvedValueOnce(json({ error: 'unavailable' }, 500));
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Dinleyiciler yüklenemedi');
  expect(screen.queryByText('Henüz takipçin yok.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
  await screen.findByRole('heading', { name: 'Listener one' });
});

it('shows localized empty lists and never carries another account or direction into the new screen', async () => {
  fetchMock.mockImplementation(async (url: string) => json(url.includes('/following') ? page('following', []) : page('followers', fixture.user._id === 'viewer' ? ['one'] : ['two'])));
  const view = mount(); await screen.findByRole('heading', { name: 'Listener one' });
  view.rerender(<ProfileConnections direction="following" />);
  expect(screen.queryByRole('heading', { name: 'Listener one' })).toBeNull();
  await screen.findByText('Henüz kimseyi takip etmiyorsun.');
  fixture.user = { _id: 'other' }; view.rerender(<ProfileConnections direction="followers" />);
  expect(screen.queryByRole('heading', { name: 'Listener one' })).toBeNull();
  await screen.findByRole('heading', { name: 'Listener two' });
});

it('a late removal response cannot toast or reset the next account', async () => {
  const write = deferred();
  fetchMock.mockImplementation(async (_url: string, options: RequestInit) => options.method === 'POST' ? write.promise : json(page('followers', fixture.user._id === 'viewer' ? ['one'] : ['two'])));
  const view = mount(); await screen.findByRole('heading', { name: 'Listener one' });
  fireEvent.click(screen.getByRole('button', { name: 'Kaldır: Listener one' }));
  fixture.user = { _id: 'other' }; view.rerender(<ProfileConnections direction="followers" />);
  await screen.findByRole('heading', { name: 'Listener two' });
  const invalidation = vi.spyOn(client, 'invalidateQueries');
  await act(async () => write.resolve(json({ success: true })));
  expect(screen.getByRole('heading', { name: 'Listener two' })).toBeVisible();
  expect(fixture.toast).not.toHaveBeenCalled(); expect(invalidation).not.toHaveBeenCalled();
});

it('rejects malformed pages and supplies copy for every supported language', () => {
  expect(() => connectionPage([], 'followers')).toThrow();
  expect(() => connectionPage(page('following', []), 'followers')).toThrow();
  expect(connectionPage(page('followers', []), 'followers').people).toEqual([]);
  for (const lang of ['tr', 'de', 'es', 'fr', 'pt', 'it', 'ru', 'ar', 'zh', 'ja', 'ko', 'hi', 'he']) {
    expect(profileConnectionsCopy(lang).emptyFollowers).not.toBe(profileConnectionsCopy('en').emptyFollowers);
  }
});
