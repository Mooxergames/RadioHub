import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { UiLanguageArchive } from '../src/components/admin/ui-language-archive';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), request: vi.fn(), toast: vi.fn() }));
vi.mock('../src/lib/queryClient', () => ({ apiFetch: mocks.fetch, apiRequest: mocks.request }));
vi.mock('../src/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const status = { checksum: 'a'.repeat(64), languages: [{ code: 'nl', name: 'Dutch' }], translations: 42, archives: [] };
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.fetch.mockImplementation(async (url: string) => Response.json(url.endsWith('/backup') ? { checksum: status.checksum, snapshot: {} } : status));
  mocks.request.mockResolvedValue(Response.json({ id: 'archive-id' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:backup') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });
const mount = () => render(<QueryClientProvider client={client}><UiLanguageArchive /></QueryClientProvider>);

it('requires a successful current backup before archival and posts only its checksum', async () => {
  mount();
  const archive = await screen.findByRole('button', { name: 'Archive unused languages' });
  expect(archive).toBeDisabled();
  expect(mocks.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
  await waitFor(() => expect(archive).toBeEnabled());
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  fireEvent.click(archive);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('POST', '/api/admin/ui-language-archives', { body: { checksum: status.checksum } }));
  await waitFor(() => expect(archive).toBeDisabled());
});

it('keeps removal disabled when backup fails and provides a restore action for archived records', async () => {
  mocks.fetch.mockImplementation(async (url: string) => url.endsWith('/backup') ? new Response('', { status: 503 }) : Response.json({ ...status,
    archives: [{ id: 'saved', checksum: status.checksum, created_at: '2026-11-08T00:00:00Z', restored_at: null, languages: 43, translations: 20000 }] }));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Backup failed' })));
  expect(screen.getByRole('button', { name: 'Archive unused languages' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Restore archive' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('POST', '/api/admin/ui-language-archives/saved/restore', { body: {} }));
});
