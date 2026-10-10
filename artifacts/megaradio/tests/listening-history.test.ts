import { describe, expect, it, vi } from 'vitest';
import { ListeningClock, ListeningOutbox, type ListeningBatch } from '../src/lib/listening-history';

const batch = (id = 'record-0000000001', userId = 'alice'): ListeningBatch => ({ recordId: id, userId,
  stationId: 'one', stationName: 'One', listenDuration: 30 });
function setup() {
  let now = 0, id = 0;
  const audio = { currentTime: 0 };
  const records: ListeningBatch[] = [];
  const clock = new ListeningClock(audio, record => records.push(record), () => now, () => `record-${++id}`);
  clock.setUser('alice'); clock.setStation({ _id: 'one', name: 'One' });
  const advance = (seconds: number, progress = seconds) => { now += seconds * 1000; audio.currentTime += progress; };
  return { audio, clock, records, advance };
}
describe('real playback duration', () => {
  it('excludes initial loading, buffering and pauses; flushes each second only once', () => {
    const { clock, records, advance } = setup();
    advance(40, 0); clock.flush(); expect(records).toHaveLength(0);
    clock.start(); advance(30); clock.flush(); clock.flush();
    advance(7); clock.suspend(); advance(60, 0); clock.flush();
    clock.start(); advance(12); clock.suspend();
    expect(records.map(r => r.listenDuration)).toEqual([30, 7, 12]);
  });
  it('attributes pre-switch audio to the old station and starts the new station only when playing', () => {
    const { clock, records, advance, audio } = setup();
    clock.start(); advance(10); clock.setStation({ _id: 'two', name: 'Two' });
    audio.currentTime = 0; advance(8, 0); clock.flush(); clock.start(); advance(6); clock.suspend();
    expect(records.map(r => [r.stationId, r.listenDuration])).toEqual([['one', 10], ['two', 6]]);
  });
  it('handles delayed background samples and visibility/pagehide flushes without duplication', () => {
    const { clock, records, advance } = setup();
    clock.start(); advance(8); clock.flush(); advance(180); clock.sample(); clock.flush(); clock.suspend();
    expect(records.map(r => r.listenDuration)).toEqual([8, 180]);
  });
  it('rejects media-clock jumps on reconnect and does not bill silent stalled time', () => {
    const { clock, records, advance, audio } = setup();
    clock.start(); advance(4); clock.sample(); advance(30, 0); clock.flush();
    audio.currentTime = 0; clock.sample(); advance(6); clock.flush();
    advance(1, 1000); clock.sample(); advance(2); clock.flush();
    expect(records.map(r => r.listenDuration)).toEqual([4, 6, 2]);
  });
  it('preserves fractional seconds across flushes and timing jitter', () => {
    const { clock, records, advance } = setup();
    clock.start(); advance(0.2, 0.25); clock.sample(); advance(0.3, 0.25); clock.sample();
    advance(0.9); clock.flush(); advance(0.6); clock.flush();
    expect(records.reduce((sum, r) => sum + r.listenDuration, 0)).toBe(2);
  });
  it('never assigns guest or previous-account listening to the newly logged-in user', () => {
    const { clock, records, advance } = setup();
    clock.setUser(null); clock.start(); advance(20); clock.setUser('alice'); advance(5);
    clock.setUser('bob'); advance(8); clock.flush();
    expect(records.map(r => [r.userId, r.listenDuration])).toEqual([['alice', 5], ['bob', 8]]);
  });
});
describe('account-bound durable outbox', () => {
  const memory = () => {
    const entries = new Map<string, string>();
    return { get length() { return entries.size; }, key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); } };
  };
  it('retries a lost response after reload with exactly the same record ID', async () => {
    const storage = memory(), saved = vi.fn();
    const failure = vi.fn(async () => { throw new Error('Lost response after server committed'); });
    const queue = new ListeningOutbox(storage, () => 'alice', failure, saved);
    queue.enqueue(batch()); await queue.flush();
    const success = vi.fn(async () => ({ totalListeningTime: 12 }));
    const restored = new ListeningOutbox(storage, () => 'alice', success, saved);
    await restored.flush(); await restored.flush();
    expect(success).toHaveBeenCalledOnce(); expect(success).toHaveBeenCalledWith(batch());
    expect(saved).toHaveBeenCalledOnce(); expect(storage.length).toBe(0);
  });
  it('does not send old-account records under a new login or update its profile from a late response', async () => {
    let owner = 'alice', resolve!: (value: { totalListeningTime: number }) => void;
    const send = vi.fn(() => new Promise<{ totalListeningTime: number }>(done => { resolve = done; }));
    const saved = vi.fn(), queue = new ListeningOutbox(memory(), () => owner, send, saved);
    queue.enqueue(batch()); queue.enqueue(batch('record-0000000002'));
    const pending = queue.flush(); owner = 'bob'; resolve({ totalListeningTime: 8 }); await pending;
    expect(send).toHaveBeenCalledOnce(); expect(saved).not.toHaveBeenCalled();
    await queue.flush(); expect(send).toHaveBeenCalledOnce();
  });
  it('serializes simultaneous flushes and retains failed/unconfirmed batches', async () => {
    let resolve!: (value: { totalListeningTime: number }) => void;
    const send = vi.fn(() => new Promise<{ totalListeningTime: number }>(done => { resolve = done; }));
    const storage = memory(), queue = new ListeningOutbox(storage, () => 'alice', send, vi.fn());
    queue.enqueue(batch()); const first = queue.flush(); await queue.flush();
    expect(send).toHaveBeenCalledOnce(); resolve({ totalListeningTime: NaN }); await first;
    expect(storage.length).toBe(1);
  });
  it('separate tabs cannot overwrite pending batches in persistent storage', async () => {
    const storage = memory(), send = vi.fn(async (_batch: ListeningBatch) => ({ totalListeningTime: 1 }));
    const first = new ListeningOutbox(storage, () => 'alice', send, vi.fn());
    const second = new ListeningOutbox(storage, () => 'alice', send, vi.fn());
    first.enqueue(batch()); second.enqueue(batch('record-0000000002'));
    expect(storage.length).toBe(2);
    await first.flush(); expect(storage.length).toBe(1);
    const reopened = new ListeningOutbox(storage, () => 'alice', send, vi.fn());
    await reopened.flush(); expect(storage.length).toBe(0);
    expect(send.mock.calls.map(([b]) => b.recordId)).toEqual(['record-0000000001', 'record-0000000002']);
  });
  it('does not retry an acknowledged write from an older API that omits the total', async () => {
    const storage = memory(), send = vi.fn(async () => ({})), saved = vi.fn();
    const queue = new ListeningOutbox(storage, () => 'alice', send, saved);
    queue.enqueue(batch()); await queue.flush(); await queue.flush();
    expect(send).toHaveBeenCalledOnce(); expect(storage.length).toBe(0);
    expect(saved).not.toHaveBeenCalled();
  });
});
