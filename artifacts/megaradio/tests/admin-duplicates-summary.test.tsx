import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminDuplicates from '../src/pages/admin/duplicates';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/stations/admin-duplicate-merge-panel', () => ({ default: () => <div /> }));
vi.mock('@/lib/queryClient', () => ({ apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({
  total: 2, totalStations: 66369,
  duplicates: [3, 2].map((count, index) => ({ _id: { name: `Station ${index}`, country: 'Austria' }, count,
    stations: Array.from({ length: count }, (_, member) => ({ _id: `${index}-${member}`, name: `Station ${index}`, country: 'Austria',
      url: 'https://example.invalid/live', votes: 0, playbackSuccessCount: 0, lastCheckOk: true })) })),
}) })) }));

describe('duplicate candidate summary', () => {
  it('distinguishes groups, station records and surplus records, and selects only surplus IDs', async () => {
    render(<AdminDuplicates />);
    fireEvent.click(screen.getByRole('button', { name: 'Detect candidates for manual review' }));
    const summary = await screen.findByText(/candidate groups containing/);
    expect(summary).toHaveTextContent('Found 2 candidate groups containing 5 station records');
    expect(screen.getByText(/3 extra records to review/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-select-all-duplicates'));
    expect(screen.getByTestId('button-delete-selected-global')).toHaveTextContent('(3)');
  });
});
