import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authQueryOptions, type AuthQueryResponse } from '@/lib/auth-query';
import { apiFetch } from '@/lib/queryClient';
import { ListeningClock, ListeningOutbox, type ListeningStation } from '@/lib/listening-history';

export function useListeningHistory(audio: HTMLAudioElement | null) {
  const { data: auth } = useQuery(authQueryOptions);
  const queryClient = useQueryClient();
  const userId = auth?.authenticated ? auth.user?._id ?? null : null;
  const clock = useRef<ListeningClock | null>(null);
  const selected = useRef<ListeningStation | null>(null);
  const owner = useRef<string | null>(userId);
  const outbox = useRef<ListeningOutbox | null>(null);

  useEffect(() => {
    // Keep writes tied to the identity confirmed by the shared auth query.
    const currentUser = () => {
      const current = queryClient.getQueryData<AuthQueryResponse>(authQueryOptions.queryKey);
      return current?.authenticated ? current.user?._id ?? null : null;
    };
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Restricted browser storage. */ }
    const queue = new ListeningOutbox(storage, currentUser, async batch => {
      const response = await apiFetch('/api/listening/record', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch), keepalive: true, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Listening record: ${response.status}`);
      const result = await response.json();
      if (result.success !== true) throw new Error('Listening record was not confirmed');
      return result;
    }, (batch, result) => {
      if (result.totalListeningTime === undefined) return;
      const minutes = result.totalListeningTime;
      queryClient.setQueryData<AuthQueryResponse>(authQueryOptions.queryKey, current => {
        if (!current?.authenticated || current.user?._id !== batch.userId) return current;
        return { ...current, user: { ...current.user,
          totalListeningTime: Math.max(Number(current.user.totalListeningTime) || 0, minutes) } };
      });
    });
    outbox.current = queue;
    void queue.flush();
    return () => { outbox.current = null; };
  }, [queryClient]);

  useEffect(() => {
    clock.current?.setUser(userId);
    owner.current = userId;
    void outbox.current?.flush();
  }, [userId]);

  useEffect(() => {
    if (!audio) return;
    const queue = outbox.current!;
    const meter = new ListeningClock(audio, batch => queue.enqueue(batch));
    meter.setUser(owner.current);
    meter.setStation(selected.current);
    clock.current = meter;
    const start = () => meter.start();
    const sample = () => meter.sample();
    const flush = () => { meter.flush(); void queue.flush(); };
    const suspend = () => { meter.suspend(); void queue.flush(); };
    const visibility = () => { if (document.hidden) flush(); };
    audio.addEventListener('playing', start);
    audio.addEventListener('timeupdate', sample);
    const stops = ['pause', 'waiting', 'ended', 'error', 'emptied', 'seeking'] as const;
    stops.forEach(event => audio.addEventListener(event, suspend));
    const seeked = () => { if (!audio.paused && audio.readyState >= 3) start(); };
    audio.addEventListener('seeked', seeked);
    if (!audio.paused && audio.readyState >= 3) start();
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', seeked);
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(flush, 30_000);
    return () => {
      suspend();
      clock.current = null;
      clearInterval(timer);
      audio.removeEventListener('playing', start);
      audio.removeEventListener('timeupdate', sample);
      stops.forEach(event => audio.removeEventListener(event, suspend));
      audio.removeEventListener('seeked', seeked);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', seeked);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [audio]);

  const selectStation = useCallback((station: ListeningStation | null) => {
    clock.current?.setStation(station);
    selected.current = station;
    void outbox.current?.flush();
  }, []);
  // Flush synchronously before load()/src replacement can reset currentTime.
  const suspend = useCallback(() => { clock.current?.suspend(); void outbox.current?.flush(); }, []);
  return { selectStation, suspend };
}
