import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
import { apiRequest } from '../src/lib/queryClient';
import { StationNoindexRecovery } from '../src/components/admin/StationNoindexRecovery';

const clients: QueryClient[] = [];
const preview = (count = 30) => ({ previewId: 'preview-1', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
  totalScanned: 62020, totalNoIndex: 13294, totalCandidates: count, candidateLimit: 100, reasonCounts: { 'manual-protection': 4 },
  candidates: Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, slug: `radio-${index}`, name: `Radio ${index}`, country: 'Germany', countryCode: 'DE',
    lastCheckOkTime: '2026-09-16T10:00:00Z' as string | null, completeLanguageCount: 14,
    evidence: { provenance: 'legacy', providerUuidPresent: true, recentProviderSuccess: true, providerLastCheckOk: true as boolean | null,
      recoveryBasis: 'complete-unique-information-page', identityPeers: 0 } })) });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><StationNoindexRecovery /></QueryClientProvider>);
}
async function scan() { fireEvent.click(screen.getByRole('button', { name: 'Onarım adaylarını incele' })); await screen.findByRole('checkbox', { name: 'Radio 0 onarım için seç' }); }
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('explicit legacy noindex recovery', () => {
  it('does not scan on mount or preselect candidates after a read-only preview', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(preview())));
    show(); expect(apiRequest).not.toHaveBeenCalled(); await scan();
    expect(screen.getByRole('button', { name: 'Tüm noindex kayıtlarını indir' })).toBeEnabled();
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/admin/seo-noindex-recovery/preview', { body: {} });
    expect(screen.getAllByRole('checkbox').every(checkbox => !(checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Seçilen 0 radyoyu onar' })).toBeDisabled();
  });
  it('can page past deferred candidates while discarding the old selection and never applying automatically', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ ...preview(2), nextCursor: 'id-1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...preview(1), previewId: 'preview-2' })));
    show(); await scan();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Radio 0 onarım için seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki adaylar' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('POST', '/api/admin/seo-noindex-recovery/preview', { body: { afterId: 'id-1' } }));
    expect(await screen.findByRole('checkbox', { name: 'Radio 0 onarım için seç' })).not.toBeChecked();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it('downloads every record through authenticated transport without starting a repair or selecting candidates', async () => {
    const NativeURL = URL;
    const createObjectURL = vi.fn(() => 'blob:test-review');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(apiRequest).mockResolvedValue(new Response('station_id,name\r\n"id-a","Radio A"\r\n', { headers: { 'Content-Type': 'text/csv' } }));
    const view = show(); fireEvent.click(screen.getByRole('button', { name: 'Tüm noindex kayıtlarını indir' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/admin/seo-noindex-recovery/review.csv', { signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-review');
  });
  it('does not save a failed or truncated record export or retry it automatically', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(apiRequest).mockResolvedValue({ blob: () => Promise.reject(new Error('download interrupted')) } as Response);
    show(); fireEvent.click(screen.getByRole('button', { name: 'Tüm noindex kayıtlarını indir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kayıt raporu indirilemedi');
    expect(click).not.toHaveBeenCalled(); expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('caps selection at 100 even for an oversized preview and never applies after cancelled confirmation', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(preview(101))));
    const nativeConfirm = vi.spyOn(window, 'confirm'); show(); await scan();
    fireEvent.click(screen.getByRole('button', { name: 'İlk 100 adayı seç' }));
    expect(screen.getAllByRole('checkbox').filter(checkbox => (checkbox as HTMLInputElement).checked)).toHaveLength(100);
    expect(screen.getByRole('checkbox', { name: 'Radio 100 onarım için seç' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Seçilen 100 radyoyu onar' }));
    expect(screen.getByRole('group', { name: 'Seçili radyo onarımını onayla' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('group', { name: 'Seçili radyo onarımını onayla' })).not.toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('shows offline, unknown and stale provider evidence without inventing a successful date', async () => {
    const data = preview(3);
    data.candidates[0].lastCheckOkTime = null;
    data.candidates[0].evidence.providerLastCheckOk = false;
    data.candidates[0].evidence.recentProviderSuccess = false;
    data.candidates[1].lastCheckOkTime = 'invalid-date';
    data.candidates[1].evidence.providerLastCheckOk = null;
    data.candidates[1].evidence.recentProviderSuccess = false;
    data.candidates[2].evidence.recentProviderSuccess = false;
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(data)));
    show(); await scan();
    const offline = screen.getByRole('row', { name: /Radio 0/ });
    expect(within(offline).getByText('Başarısız')).toBeVisible();
    expect(within(offline).getByText('Kayıt yok')).toBeVisible();
    expect(within(offline).getByText('Yakın tarihli başarı kaydı yok')).toBeVisible();
    expect(within(offline).getByText('İngilizce bilgi sayfası uygun')).toBeVisible();
    expect(within(offline).getByRole('checkbox')).toBeEnabled();
    const unknown = screen.getByRole('row', { name: /Radio 1/ });
    expect(within(unknown).getByText('Bilinmiyor')).toBeVisible();
    expect(within(unknown).getByText('Kayıt yok')).toBeVisible();
    const stale = screen.getByRole('row', { name: /Radio 2/ });
    expect(within(stale).getByText('Başarılı')).toBeVisible();
    expect(within(stale).getByText('Yakın tarihli başarı kaydı yok')).toBeVisible();
    expect(within(stale).getByText(new Date(data.candidates[2].lastCheckOkTime!).toLocaleString())).toBeVisible();
    expect(screen.queryByText(/Invalid Date|1970/)).not.toBeInTheDocument();
    expect(screen.getByText(/İngilizce tam açıklaması/)).toHaveTextContent('Bu işlem yayını yeniden başlatmaz, gizli radyoları listelerde görünür yapmaz.');
  });
  it('sends only the explicit selection, displays a verified receipt and requires a fresh preview', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify(preview()))).mockResolvedValueOnce(new Response(JSON.stringify({ restored: 1, restoredIds: ['id-0'], skipped: 0, skippedReasons: [] })));
    show(); await scan();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Radio 0 onarım için seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seçilen 1 radyoyu onar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Onarımı uygula' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/admin/seo-noindex-recovery/apply', { body: { previewId: 'preview-1', stationIds: ['id-0'] } }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 radyonun noindex işareti kaldırıldı');
    expect(screen.getByRole('checkbox', { name: 'Radio 0 onarım için seç' })).toBeDisabled();
  });
  it('distinguishes the canonical of excluded duplicates without selecting or changing its peers', async () => {
    const data = preview(1);
    Object.assign(data.candidates[0].evidence, { recoveryBasis: 'canonical-of-excluded-duplicates', identityPeers: 2 });
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(data)));
    show(); await scan();
    expect(screen.getByText('Asıl bilgi sayfası; 2 kopya kapalı kalır')).toBeVisible();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('does not automatically retry an ambiguous write and invalidates the stale preview', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify(preview()))).mockRejectedValueOnce(new Error('409 RECOVERY_STALE'));
    show(); await scan();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Radio 0 onarım için seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seçilen 1 radyoyu onar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Onarımı uygula' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Onarım doğrulanamadı');
    expect(screen.getByRole('button', { name: 'Seçilen 0 radyoyu onar' })).toBeDisabled();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it('requires explicit bulk confirmation and preserves confirmed progress when the next scan fails', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify(preview(2))))
      .mockResolvedValueOnce(new Response(JSON.stringify({ restored: 2, restoredIds: ['id-0', 'id-1'], skipped: 0 })))
      .mockRejectedValueOnce(new Error('Scan unavailable'));
    show(); await scan();
    fireEvent.click(screen.getByRole('button', { name: 'Tüm uygun adayları onar (2)' }));
    expect(screen.getByRole('group', { name: 'Toplu noindex onarımını onayla' })).toBeVisible();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Toplu onarımı başlat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scan unavailable');
    expect(screen.getByRole('status')).toHaveTextContent('2 radyo onarıldı');
    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('cancels the bulk confirmation without writing or selecting records', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify(preview(1))));
    show(); await scan();
    fireEvent.click(screen.getByRole('button', { name: 'Tüm uygun adayları onar (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('group', { name: 'Toplu noindex onarımını onayla' })).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
