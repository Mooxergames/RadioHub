import { AsyncLocalStorage } from 'node:async_hooks';

export const publicStationDeadlineContext = new AsyncLocalStorage<{ expiresAt: number }>();
export const getPublicStationDeadline = (): number => publicStationDeadlineContext.getStore()?.expiresAt ?? Infinity;
export function limitPublicStationDeadline(expiresAt: number): void {
  const context = publicStationDeadlineContext.getStore();
  if (context && Number.isFinite(expiresAt)) context.expiresAt = Math.min(context.expiresAt, expiresAt);
}
export function withPublicStationDeadline<T>(loader: () => Promise<T>): Promise<T> {
  return publicStationDeadlineContext.getStore() ? loader() : publicStationDeadlineContext.run({ expiresAt: Infinity }, loader);
}

/** Carry freshness to callers after the async render context has ended. */
export function capturePublicStationDeadline<T>(loader: () => Promise<T>): Promise<{ value: T; expiresAt: number }> {
  return withPublicStationDeadline(async () => {
    const value = await loader();
    return { value, expiresAt: getPublicStationDeadline() };
  });
}
