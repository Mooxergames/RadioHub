import { AsyncLocalStorage } from 'node:async_hooks';

type SeoReadDeadline = { expiresAt: number; signal?: AbortSignal };
const context = new AsyncLocalStorage<SeoReadDeadline>();

export const getSeoReadDeadline = (): SeoReadDeadline | undefined => context.getStore();

export function withSeoReadDeadline<T>(deadline: SeoReadDeadline, loader: () => Promise<T>): Promise<T> {
  return context.run(deadline, loader);
}
