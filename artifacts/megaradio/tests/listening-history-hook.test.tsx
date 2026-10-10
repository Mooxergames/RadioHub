import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useListeningHistory } from '../src/hooks/useListeningHistory';
import { authQueryOptions } from '../src/lib/auth-query';

const send = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/queryClient', async original => ({ ...await original<any>(), apiFetch: (...args: any[]) => send(...args) }));
let client: QueryClient;
let audio: HTMLAudioElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  localStorage.clear(); sessionStorage.clear(); send.mockReset();
  send.mockResolvedValue({ ok: true, json: async () => ({ success: true, totalListeningTime: 1.5 }) });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(authQueryOptions.queryKey, { authenticated: true, user: { _id: 'alice', totalListeningTime: 1 } });
  audio = document.createElement('audio');
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
const mount = () => renderHook(() => useListeningHistory(audio), {
  wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
});
const event = (name: string) => audio.dispatchEvent(new Event(name));
it('records on the 30-second heartbeat, updates the shared profile, then flushes pause only once', async () => {
  const hook = mount();
  act(() => { hook.result.current.selectStation({ _id: 'one', name: 'One' }); event('play'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(send).not.toHaveBeenCalled(); // play intent is not audible playback.
  act(() => event('playing'));
  audio.currentTime = 30;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(send).toHaveBeenCalledOnce();
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({ userId: 'alice', stationId: 'one', listenDuration: 30 });
  expect(send.mock.calls[0][1].keepalive).toBe(true);
  expect((client.getQueryData<any>(authQueryOptions.queryKey)).user.totalListeningTime).toBe(1.5);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); audio.currentTime = 35; event('pause'); event('pause'); });
  expect(send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(send.mock.calls[1][1].body).listenDuration).toBe(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(send).toHaveBeenCalledTimes(2);
});
it('pagehide persists the last seconds, retries failures on online, and removes listeners on unmount', async () => {
  const hook = mount();
  act(() => { hook.result.current.selectStation({ _id: 'one', name: 'One' }); event('playing'); });
  send.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); audio.currentTime = 6; window.dispatchEvent(new Event('pagehide')); });
  const first = JSON.parse(send.mock.calls[0][1].body);
  await act(async () => { window.dispatchEvent(new Event('online')); });
  expect(JSON.parse(send.mock.calls[1][1].body)).toEqual(first);
  hook.unmount();
  await act(async () => { window.dispatchEvent(new Event('online')); event('playing'); await vi.advanceTimersByTimeAsync(60_000); });
  expect(send).toHaveBeenCalledTimes(2);
});
it('an inactive-tab cookie/account change cannot move queued listening into the new account', async () => {
  const hook = mount();
  act(() => { hook.result.current.selectStation({ _id: 'one', name: 'One' }); event('playing'); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000); audio.currentTime = 5;
    client.setQueryData(authQueryOptions.queryKey, { authenticated: true, user: { _id: 'bob', totalListeningTime: 0 } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(send).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); audio.currentTime = 9; hook.result.current.suspend(); });
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({ userId: 'bob', listenDuration: 4 });
});
