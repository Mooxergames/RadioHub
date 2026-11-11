import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StationPlaybackReportButton } from '../src/components/stations/station-playback-report';

const language = vi.hoisted(() => ({ value: 'de' }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ language: language.value, localeTranslations: {} }) }));
const station = { stationId: '68a8c483bd66579311ab2ffa', stationName: 'ORF Hitradio Ö3' };
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Problem melden' }));
beforeEach(() => { language.value = 'de'; vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('never submits on mount and sends one minimal report after a deliberate click', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<StationPlaybackReportButton {...station} />);
  expect(fetch).not.toHaveBeenCalled();
  submit();
  fireEvent.click(screen.getByRole('button', { name: 'Wird gesendet' }));
  expect(fetch).toHaveBeenCalledTimes(1);
  const [path, options] = vi.mocked(fetch).mock.calls[0];
  expect(path).toBe('/api/stations/report-error');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(String(options?.body))).toEqual({ ...station,
    errorType: 'USER_REPORTED_PLAYBACK', errorMessage: 'Listener reported a playback connection failure.' });
  expect(screen.getByRole('button', { name: 'Wird gesendet' })).toBeDisabled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await act(async () => { resolve(Response.json({ success: true, errorId: 'saved-report' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Meldung gespeichert');
  expect(screen.getByRole('button', { name: 'Meldung gespeichert' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([400, 403, 429, 500, 503])('does not claim success after HTTP %s and permits a manual retry', async status => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('Unavailable', { status }))
    .mockResolvedValueOnce(Response.json({ success: true, errorId: 'retry-saved' }));
  render(<StationPlaybackReportButton {...station} />); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('konnte nicht bestätigt werden');
  expect(fetch).toHaveBeenCalledTimes(1);
  submit();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Meldung gespeichert'));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([{}, { success: true }, { success: false, errorId: 'not-saved' }, { success: true, errorId: '' }, null])(
  'rejects unconfirmed success responses %j', async body => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));
    render(<StationPlaybackReportButton {...station} />); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('konnte nicht bestätigt werden');
    expect(screen.queryByText('Meldung gespeichert')).not.toBeInTheDocument();
  });

it('rejects non-JSON responses without exposing response contents', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('<html>private upstream message</html>'));
  render(<StationPlaybackReportButton {...station} />); submit();
  await screen.findByRole('alert');
  expect(document.body).not.toHaveTextContent('private upstream message');
});

it('fails honestly on a network error without automatically posting again', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('Network error'));
  render(<StationPlaybackReportButton {...station} />); submit();
  await screen.findByRole('alert');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('bounds waiting at ten seconds and re-enables manual submission', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  render(<StationPlaybackReportButton {...station} />); submit();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.getByRole('alert')).toHaveTextContent('konnte nicht bestätigt werden');
  expect(screen.getByRole('button', { name: 'Problem melden' })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('aborts on unmount and discards a late response from the previous station', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<StationPlaybackReportButton {...station} />); submit();
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.rerender(<StationPlaybackReportButton stationId="fm4" stationName="FM4" />);
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve(Response.json({ success: true, errorId: 'old-station' })); });
  expect(screen.getByRole('button', { name: 'Problem melden' })).toBeEnabled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('retains an English fallback outside the German pilot', () => {
  language.value = 'en';
  render(<StationPlaybackReportButton {...station} />);
  expect(screen.getByRole('button', { name: 'Report problem' })).toBeInTheDocument();
});
