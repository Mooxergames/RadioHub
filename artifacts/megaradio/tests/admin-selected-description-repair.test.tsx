import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSelectedDescriptionRepair from '../src/components/stations/admin-selected-description-repair';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), started: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.request }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const id = '68a8c458bd66579311aac859', blocked = '68a8c458bd66579311aac8fd';
const row = (stationId = id, eligible = true) => ({ id: stationId, name: 'Fixture Radio',
  reason: eligible ? 'eligible-for-content-repair' : 'plausible-identity-peer', englishSample: 'Reviewed English source article.',
  changes: eligible ? [{ language: 'de', fields: ['full'] }] : [], protectedLanguages: ['ja'] });
function mount(busy = false) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <AdminSelectedDescriptionRepair busy={busy} onStarted={mocks.started} />
  </QueryClientProvider>);
}
function open(ids = id) {
  fireEvent.click(screen.getByRole('button', { name: 'Selected AI repair' }));
  fireEvent.change(screen.getByLabelText('Station IDs'), { target: { value: ids } });
}
async function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review selection' }));
  await screen.findByRole('table', { name: 'Selected content repair review' });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockImplementation(async (_method, path) => ({ json: async () => path.includes('review-selected')
    ? { rows: [row()] } : { success: true, jobId: 'scoped-job', total: 1 } }));
});

describe('selected all-language description repair', () => {
  it('does not request or start paid generation simply by opening the dialog', () => {
    mount(); open();
    expect(screen.getByRole('dialog')).toHaveTextContent('All 14 languages');
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start selected repair' })).toBeDisabled();
  });
  it('reviews the exact IDs first, then starts only eligible reviewed IDs with explicit credit consent', async () => {
    mocks.request.mockImplementation(async (_method, path) => ({ json: async () => path.includes('review-selected')
      ? { rows: [row(), row(blocked, false)] } : { success: true, jobId: 'scoped-job', total: 1 } }));
    mount(); open(`${id}\n${blocked}`); await review();
    expect(mocks.request).toHaveBeenNthCalledWith(1, 'POST', '/api/admin/stations/review-selected-description-repairs', {
      body: { selectedStationIds: [id, blocked], sourceLanguage: 'en' },
    });
    expect(screen.getByRole('button', { name: 'Start selected repair' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Use existing AI service credits/));
    fireEvent.click(screen.getByRole('button', { name: 'Start selected repair' }));
    await waitFor(() => expect(mocks.started).toHaveBeenCalledWith('scoped-job', 1));
    expect(mocks.request).toHaveBeenNthCalledWith(2, 'POST', '/api/admin/stations/repair-selected-descriptions', {
      body: { selectedStationIds: [id], sourceLanguage: 'en' },
    });
  });
  it('invalidates the review and consent when the IDs or source change', async () => {
    mount(); open(); await review(); fireEvent.click(screen.getByLabelText(/Use existing AI service credits/));
    fireEvent.change(screen.getByLabelText('Source text'), { target: { value: 'auto' } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start selected repair' })).toBeDisabled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('rejects empty, malformed or oversized selections before a review request', () => {
    mount(); open('not-an-id');
    expect(screen.getByRole('button', { name: 'Review selection' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Station IDs'), { target: { value: Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(24, '0')).join('\n') } });
    expect(screen.getByRole('button', { name: 'Review selection' })).toBeDisabled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rejects a mismatched review without offering a paid action', async () => {
    mocks.request.mockResolvedValue({ json: async () => ({ rows: [row(blocked)] }) });
    mount(); open(); fireEvent.click(screen.getByRole('button', { name: 'Review selection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('exact selection');
    expect(screen.getByRole('button', { name: 'Start selected repair' })).toBeDisabled();
  });
  it('never automatically retries an uncertain paid request or shows phantom progress', async () => {
    mount(); open(); await review();
    mocks.request.mockRejectedValue(new Error('Response lost; check progress'));
    fireEvent.click(screen.getByLabelText(/Use existing AI service credits/));
    fireEvent.click(screen.getByRole('button', { name: 'Start selected repair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.started).not.toHaveBeenCalled();
  });
  it('cannot overlap another running description job', () => {
    mount(true);
    expect(screen.getByRole('button', { name: 'Selected AI repair' })).toBeDisabled();
  });
  it('rejects malformed job acknowledgements instead of reporting success', async () => {
    mount(); open(); await review();
    mocks.request.mockResolvedValue({ json: async () => ({ success: true, total: 1 }) });
    fireEvent.click(screen.getByLabelText(/Use existing AI service credits/));
    fireEvent.click(screen.getByRole('button', { name: 'Start selected repair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid repair job');
    expect(mocks.started).not.toHaveBeenCalled();
  });
});
