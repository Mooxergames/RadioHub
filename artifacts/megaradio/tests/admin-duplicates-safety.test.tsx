import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminDuplicates from '../src/pages/admin/duplicates';
import { apiFetch } from '@/lib/queryClient';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/stations/admin-duplicate-merge-panel', () => ({ default: () => <div /> }));
vi.mock('@/lib/queryClient', () => ({ apiFetch: vi.fn() }));

const ids = [1, 2, 3, 4, 5].map(value => value.toString(16).padStart(24, '0'));
const groups = [
  { _id: { name: 'Review Radio', country: 'Austria' }, count: 3, stations: ids.slice(0, 3).map((_id, index) => ({
    _id, name: 'Review Radio', country: 'Austria', countryCode: 'AT', slug: `review-radio-${index}`,
    url: 'https://example.invalid/live', votes: 100 - index, lastCheckOk: true,
    favicon: 'https://example.invalid/logo.png', noIndex: false, redirectToSlug: null,
  })) },
  { _id: { name: 'Other Radio', country: 'Germany' }, count: 2, stations: ids.slice(3).map((_id, index) => ({
    _id, name: 'Other Radio', country: 'Germany', countryCode: 'DE', slug: `other-radio-${index}`,
    url: 'https://example.invalid/other', votes: 20 - index, lastCheckOk: true,
    favicon: 'https://example.invalid/logo.png', noIndex: false, redirectToSlug: null,
  })) },
];
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const requests = (path: string) => vi.mocked(apiFetch).mock.calls.filter(([url]) => url === path);
const requestBody = (path: string) => JSON.parse(String(requests(path).at(-1)![1]!.body));
const preview = (body: any, extra: Record<string, unknown> = {}) => {
  const stations = groups.flatMap(group => group.stations);
  return { primaryStationId: body.primaryStationId, duplicateStationIds: body.duplicateStationIds,
    primaryStation: stations.find(station => station._id === body.primaryStationId),
    duplicateStations: stations.filter(station => body.duplicateStationIds.includes(station._id)),
    fingerprint: 'a'.repeat(64), identity: { eligible: true, reason: 'Matching identity and endpoint' },
    requiresIdentityConfirmation: false, changes: {}, warnings: [], ...extra };
};
const defaultFetch = async (path: string, options?: RequestInit): Promise<Response> => {
  if (path === '/api/admin/stations/duplicates') return response({ total: groups.length, totalStations: 5, duplicates: groups });
  if (path === '/api/admin/stations/merge-preview') return response({ success: true, preview: preview(JSON.parse(String(options?.body))) });
  if (path === '/api/admin/stations/merge') return response({ success: true, deletedCount: 2, mergedStation: groups[0].stations[1], cacheInvalidated: true });
  if (path === '/api/admin/delete-stations') return response({ success: true, deletedCount: 1 });
  throw new Error(`Unexpected fixture request: ${path}`);
};
const customize = (path: string, handle: (options?: RequestInit) => Promise<Response>) => {
  vi.mocked(apiFetch).mockImplementation((url, options) => url === path ? handle(options) : defaultFetch(url, options));
};
beforeEach(() => { vi.mocked(apiFetch).mockReset().mockImplementation(defaultFetch); });
async function candidates() {
  render(<AdminDuplicates />);
  fireEvent.click(screen.getByRole('button', { name: 'Detect candidates for manual review' }));
  await screen.findByText(/candidate groups containing/);
}

describe('duplicate management action safety', () => {
  it('cancels group deletion without sending any writes', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getAllByTestId('button-delete-group-selected')[0]);
    fireEvent.click(screen.getByTestId('button-cancel-delete'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(requests('/api/admin/delete-stations')).toHaveLength(0);
  });

  it('excludes a newly chosen primary and requires confirmation before group deletion', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    expect(screen.queryByTestId(`checkbox-station-${ids[1]}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('button-delete-group-selected')[0]);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(requests('/api/admin/delete-stations')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('button-confirm-delete'));
    await waitFor(() => expect(requests('/api/admin/delete-stations')).toHaveLength(1));
    expect(requestBody('/api/admin/delete-stations').stationIds).toEqual([ids[2]]);
  });

  it('previews the selected primary before an explicitly confirmed manual merge', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(requests('/api/admin/stations/merge')).toHaveLength(0);
    expect(requestBody('/api/admin/stations/merge-preview')).toEqual({ primaryStationId: ids[1], duplicateStationIds: [ids[0], ids[2]] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm manual merge' }));
    await waitFor(() => expect(requests('/api/admin/stations/merge')).toHaveLength(1));
    expect(requestBody('/api/admin/stations/merge')).toMatchObject({ primaryStationId: ids[1], duplicateStationIds: [ids[0], ids[2]], expectedFingerprint: 'a'.repeat(64), confirm: true });
  });

  it('global deletion excludes every current primary, including changed primaries', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[4]}`));
    fireEvent.click(screen.getByTestId('button-delete-selected-global'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete 1 selected station(s)?');
    fireEvent.click(screen.getByTestId('button-confirm-delete'));
    await waitFor(() => expect(requests('/api/admin/delete-stations')).toHaveLength(1));
    expect(requestBody('/api/admin/delete-stations').stationIds).toEqual([ids[2]]);
  });

  it('does not replay a deletion after an uncertain network failure', async () => {
    customize('/api/admin/delete-stations', async () => { throw new Error('Connection reset'); });
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getAllByTestId('button-delete-group-selected')[0]);
    fireEvent.click(screen.getByTestId('button-confirm-delete'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByTestId('button-delete-selected-global')).not.toBeInTheDocument();
    expect(requests('/api/admin/delete-stations')).toHaveLength(1);
  });

  it('rejects a frozen deletion if one of its records becomes the primary', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getAllByTestId('button-delete-group-selected')[0]);
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    fireEvent.click(screen.getByTestId('button-confirm-delete'));
    expect(requests('/api/admin/delete-stations')).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('locks a deletion against repeated confirmation clicks', async () => {
    let resolve!: (value: Response) => void;
    customize('/api/admin/delete-stations', () => new Promise(done => { resolve = done; }));
    await candidates();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    fireEvent.click(screen.getAllByTestId('button-delete-group-selected')[0]);
    const confirm = screen.getByTestId('button-confirm-delete');
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(requests('/api/admin/delete-stations')).toHaveLength(1);
    expect(screen.getByTestId('button-cancel-delete')).toBeDisabled();
    resolve(response({ success: true, deletedCount: 2 }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('retains the chosen primary for Keep Primary and can close without merging', async () => {
    await candidates();
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep Primary' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(ids[1]);
    expect(requestBody('/api/admin/stations/merge-preview').primaryStationId).toBe(ids[1]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(requests('/api/admin/stations/merge')).toHaveLength(0);
  });

  it('requires explicit broadcast identity confirmation for differing identities', async () => {
    customize('/api/admin/stations/merge-preview', async options => response({ success: true, preview: preview(JSON.parse(String(options?.body)), {
      requiresIdentityConfirmation: true, identity: { eligible: false, reason: 'Different names need manual verification' },
      warnings: ['Verify the broadcaster and current stream.'],
    }) }));
    await candidates();
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm manual merge' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(requests('/api/admin/stations/merge')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I verified these records are the same broadcast' }));
    fireEvent.click(confirm);
    await waitFor(() => expect(requests('/api/admin/stations/merge')).toHaveLength(1));
    expect(requestBody('/api/admin/stations/merge').confirmIdentityOverride).toBe(true);
  });

  it('locks all destructive controls while a non-first primary preview is pending', async () => {
    let resolve!: (value: Response) => void;
    customize('/api/admin/stations/merge-preview', options => new Promise(done => {
      resolve = () => done(response({ success: true, preview: preview(JSON.parse(String(options?.body))) }));
    }));
    await candidates();
    fireEvent.click(screen.getByTestId(`radio-primary-${ids[1]}`));
    const merge = screen.getAllByTestId('button-merge-group')[0];
    fireEvent.click(merge);
    fireEvent.click(merge);
    expect(requests('/api/admin/stations/merge-preview')).toHaveLength(1);
    expect(screen.getAllByTestId('button-merge-group')[1]).toBeDisabled();
    expect(screen.getByTestId(`radio-primary-${ids[0]}`)).toBeDisabled();
    resolve(response({}));
    await screen.findByRole('alertdialog');
  });

  it('sends only one apply request even with repeated confirmation clicks', async () => {
    let resolve!: (value: Response) => void;
    customize('/api/admin/stations/merge', () => new Promise(done => { resolve = done; }));
    await candidates();
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm manual merge' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(requests('/api/admin/stations/merge')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
    resolve(response({ success: true, deletedCount: 2, mergedStation: groups[0].stations[0], cacheInvalidated: true }));
    await screen.findByText(/2 duplicate record\(s\) removed/);
  });

  it.each([409, 503])('invalidates a failed apply preview (HTTP %s), rather than replaying it', async status => {
    customize('/api/admin/stations/merge', async () => response({ error: 'Records changed or unavailable' }, status));
    await candidates();
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm manual merge' });
    fireEvent.click(confirm);
    await within(dialog).findByText(/Do not retry this preview/);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(requests('/api/admin/stations/merge')).toHaveLength(1);
  });

  it('treats a committed merge with cache refresh failure as completed', async () => {
    customize('/api/admin/stations/merge', async () => response({ success: true, deletedCount: 2, mergedStation: groups[0].stations[0], cacheInvalidated: false }));
    await candidates();
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm manual merge' }));
    await screen.findByText(/Merge completed. Some caches could not be refreshed immediately/);
    expect(screen.queryByText(/Do not retry this preview/)).not.toBeInTheDocument();
  });

  it('shows committed success immediately even when the candidate refresh stalls, then times the read out', async () => {
    await candidates();
    let refreshSignal: AbortSignal | undefined;
    customize('/api/admin/stations/duplicates', options => new Promise((_resolve, reject) => {
      refreshSignal = options?.signal as AbortSignal;
      refreshSignal.addEventListener('abort', () => reject(new DOMException('Read timed out', 'AbortError')), { once: true });
    }));
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    const dialog = await screen.findByRole('alertdialog');
    vi.useFakeTimers();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm manual merge' })); });
      expect(screen.getByText(/2 duplicate record\(s\) removed/)).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(20_001); });
      expect(refreshSignal?.aborted).toBe(true);
      expect(screen.getByRole('button', { name: 'Detect candidates for manual review' })).toBeEnabled();
      expect(screen.getByText(/2 duplicate record\(s\) removed/)).toBeInTheDocument();
    } finally { errors.mockRestore(); vi.useRealTimers(); }
  });

  it('rejects a malformed preview without exposing an apply action', async () => {
    customize('/api/admin/stations/merge-preview', async options => response({ success: true, preview: preview(JSON.parse(String(options?.body)), { fingerprint: 'invalid' }) }));
    await candidates();
    fireEvent.click(screen.getAllByTestId('button-merge-group')[0]);
    await waitFor(() => expect(screen.getAllByTestId('button-merge-group')[0]).not.toBeDisabled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(requests('/api/admin/stations/merge')).toHaveLength(0);
  });

  it('shows skipped frequency clusters even when none are safe to apply', async () => {
    customize('/api/admin/stations/dedup-frequency', async () => response({ confirm: false, clustersFound: 0, rowsRedirected: 0,
      message: 'No safe clusters', sampleClusters: [], skippedClusters: 2,
      sampleSkipped: [{ reason: 'Different broadcast endpoints' }, { reason: 'Primary is not indexable' }],
    }));
    render(<AdminDuplicates />);
    fireEvent.click(screen.getByTestId('button-freq-dryrun'));
    await screen.findByText('Different broadcast endpoints');
    expect(screen.getByText('Primary is not indexable')).toBeInTheDocument();
    expect(screen.getByTestId('button-freq-apply')).toBeDisabled();
  });

  it('aborts a stalled frequency preview and releases the shared action lock', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      customize('/api/admin/stations/dedup-frequency', options => new Promise((_resolve, reject) => {
        signal = options?.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new DOMException('Request timed out', 'AbortError')), { once: true });
      }));
      render(<AdminDuplicates />);
      const button = screen.getByTestId('button-freq-dryrun');
      fireEvent.click(button);
      expect(button).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(20_001); });
      expect(signal?.aborted).toBe(true);
      expect(button).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Detect candidates for manual review' })).toBeEnabled();
    } finally { vi.useRealTimers(); }
  });
});
