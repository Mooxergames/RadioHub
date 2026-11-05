import type { Server } from 'node:http';

export const WEB_SHUTDOWN_TIMEOUT_MS = 65_000;
export const WEB_DRAIN_TIMEOUT_MS = 60_000;

interface WebShutdownOptions {
  servers: Array<Pick<Server, 'close' | 'closeAllConnections'>>;
  onStart: (signal: string) => void;
  closeResources: () => Promise<void>;
  exitCode: () => number;
  exit?: (code: number) => void;
  timeoutMs?: number;
  drainMs?: number;
}

export function createWebShutdown({
  servers, onStart, closeResources, exitCode, exit = code => process.exit(code),
  timeoutMs = WEB_SHUTDOWN_TIMEOUT_MS, drainMs = WEB_DRAIN_TIMEOUT_MS,
}: WebShutdownOptions): (signal: string) => Promise<void> {
  let shutdown: Promise<void> | undefined;
  return signal => {
    if (shutdown) return shutdown;
    onStart(signal);
    shutdown = (async () => {
      let finished = false;
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (code: number) => {
        if (finished) return;
        finished = true;
        exit(code);
      };
      const hardDeadline = setTimeout(() => finish(1), timeoutMs);
      try {
        await Promise.race([
          Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
            server.close(error => {
              if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
              else resolve();
            });
          }))),
          new Promise<never>((_resolve, reject) => {
            drainTimer = setTimeout(() => {
              for (const server of servers) server.closeAllConnections();
              reject(new Error('Web request drain deadline exceeded'));
            }, drainMs);
          }),
        ]);
        clearTimeout(drainTimer);
        await closeResources();
        finish(exitCode());
      } catch {
        finish(1);
      } finally {
        clearTimeout(drainTimer);
        clearTimeout(hardDeadline);
      }
    })();
    return shutdown;
  };
}
