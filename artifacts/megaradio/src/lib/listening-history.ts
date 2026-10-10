export interface ListeningStation { _id: string; name: string; country?: string; genre?: string }
export interface ListeningBatch {
  recordId: string;
  userId: string;
  stationId: string;
  stationName: string;
  country?: string;
  genre?: string;
  listenDuration: number;
}

/** Measure media progress, not time spent with a loading/paused player open. */
export class ListeningClock {
  private userId: string | null = null;
  private station: ListeningStation | null = null;
  private playing = false;
  private position = 0;
  private sampledAt = 0;
  private credited = 0;
  private lastPosition = 0;
  private seconds = 0;
  constructor(
    private audio: Pick<HTMLAudioElement, 'currentTime'>,
    private enqueue: (batch: ListeningBatch) => void,
    private now = () => performance.now(),
    private uuid = () => crypto.randomUUID(),
  ) {}
  setUser(userId: string | null) {
    if (this.userId === userId) return;
    this.flush();
    this.seconds = 0;
    this.userId = userId;
    this.baseline();
  }
  setStation(station: ListeningStation | null) {
    this.suspend(); // Sample the old stream before src/currentTime is replaced.
    this.seconds = 0;
    this.station = station;
  }
  private baseline() {
    this.position = this.lastPosition = this.audio.currentTime;
    this.sampledAt = this.now();
    this.credited = 0;
  }
  start() { if (this.playing) return; this.baseline(); this.playing = true; }
  sample() {
    if (!this.playing) return;
    const position = this.audio.currentTime;
    const elapsed = Math.max(0, (this.now() - this.sampledAt) / 1000);
    const progress = position - this.position;
    // Live reconnects/seeks can jump the media clock. Delayed background events
    // may cover minutes, so don't impose a foreground heartbeat-length cap.
    if (!Number.isFinite(progress) || position < this.lastPosition || progress > elapsed + 2) {
      this.baseline();
      return;
    }
    const credit = Math.max(this.credited, Math.min(progress, elapsed));
    if (this.userId && this.station) this.seconds += credit - this.credited;
    this.credited = credit;
    this.lastPosition = position;
  }
  suspend() { this.flush(); this.playing = false; }
  flush() {
    this.sample();
    const seconds = Math.floor(this.seconds);
    if (!this.userId || !this.station || seconds < 1) return;
    this.seconds -= seconds;
    this.enqueue({ recordId: this.uuid(), userId: this.userId, stationId: this.station._id,
      stationName: this.station.name, country: this.station.country, genre: this.station.genre, listenDuration: seconds });
  }
}

const STORAGE_PREFIX = 'megaradio:listening-pending:v1:';
type Saved = { totalListeningTime?: number };
export class ListeningOutbox {
  private batches: ListeningBatch[] = [];
  private sending = false;
  constructor(
    private storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'> | undefined,
    private currentUser: () => string | null,
    private send: (batch: ListeningBatch) => Promise<Saved>,
    private saved: (batch: ListeningBatch, result: Saved) => void,
  ) {
    try {
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(STORAGE_PREFIX)) continue;
        try {
          const b = JSON.parse(storage.getItem(key) || 'null');
          if (b && typeof b.userId === 'string' && typeof b.stationId === 'string' && typeof b.stationName === 'string'
            && typeof b.recordId === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(b.recordId)
            && key === STORAGE_PREFIX + b.recordId && Number.isSafeInteger(b.listenDuration) && b.listenDuration > 0) {
            this.batches.push(b);
          }
        } catch { /* A corrupt entry must not block other pending records. */ }
      }
    } catch { /* Private-mode storage may be unavailable; retain an in-memory queue. */ }
  }
  enqueue(batch: ListeningBatch) {
    this.batches.push(batch);
    // One key per batch: concurrent tabs cannot overwrite one another's queue.
    // Persistent storage also survives closing an offline tab, unlike sessionStorage.
    try { this.storage?.setItem(STORAGE_PREFIX + batch.recordId, JSON.stringify(batch)); } catch { /* Keep memory copy. */ }
  }
  async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      for (;;) {
        const batch = this.batches.find(b => b.userId === this.currentUser());
        if (!batch) break;
        try {
          const result = await this.send(batch);
          if (result.totalListeningTime !== undefined && (!Number.isFinite(result.totalListeningTime) || result.totalListeningTime < 0)) break;
          this.batches = this.batches.filter(b => b.recordId !== batch.recordId);
          try { this.storage?.removeItem(STORAGE_PREFIX + batch.recordId); } catch { /* Server deduplicates replay. */ }
          // An older API can acknowledge the write without returning a total.
          // Do not retry an acknowledged write during a rolling deployment.
          if (this.currentUser() === batch.userId && result.totalListeningTime !== undefined) this.saved(batch, result);
        } catch { break; } // Next periodic/online event retries without inventing time.
      }
    } finally { this.sending = false; }
  }
}
