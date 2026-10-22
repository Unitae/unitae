import logger from '~/shared/infra/logger.server'

// server.js closes its HTTP server on SIGTERM and SIGINT, but the PostgreSQL pool, the
// Redis clients and the BullMQ queues keep the process alive, so it stopped only when the process
// manager (Docker's stop timeout, Kubernetes' grace period) killed it. Give requests already in
// flight this long to finish, then exit. The timer is unref'd: if everything closes sooner, the process
// exits sooner.
export const DRAIN_MS = 10_000

export function exitAfterDrain(signal: NodeJS.Signals, drainMs = DRAIN_MS): void {
  logger.info(`Received ${signal}, exiting in ${drainMs / 1000}s once requests in flight have finished`)
  setTimeout(() => process.exit(0), drainMs).unref()
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => exitAfterDrain(signal))
}
