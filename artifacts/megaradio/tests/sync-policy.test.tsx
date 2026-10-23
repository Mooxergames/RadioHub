import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
import SyncStatus from '../src/pages/sync';
import { apiRequest } from '../src/lib/queryClient';

const clients: QueryClient[] = [];
function show(policy?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity,
    queryFn: async () => { throw new Error('Unavailable'); } } } });
  clients.push(client);
  client.setQueryData(['/api/sync/status'], { isRunning: false, lastFullSync: null, lastSyncLog: null });
  client.setQueryData(['/api/sync/logs'], []);
  if (policy !== undefined) client.setQueryData(['/api/admin/sync/policy'], { allowNewStations: policy });
  render(<QueryClientProvider client={client}><SyncStatus /></QueryClientProvider>);
  return client;
}
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.clearAllMocks(); });

describe('station intake policy', () => {
  it('shows the persisted existing-only mode without starting or stopping sync', () => {
    show(false);
    expect(screen.getByRole('switch', { name: 'New station intake' })).not.toBeChecked();
    expect(screen.getByText('Existing stations only')).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('does not flip the displayed setting when saving fails', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('503'));
    show(true);
    fireEvent.click(screen.getByRole('switch', { name: 'New station intake' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/admin/sync/policy', { body: { allowNewStations: false } }));
    expect(screen.getByRole('switch', { name: 'New station intake' })).toBeChecked();
  });
  it('disables mutation if the policy could not be loaded', async () => {
    show();
    expect(await screen.findByRole('button', { name: 'Retry sync policy' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'New station intake' })).toBeDisabled();
  });
});
