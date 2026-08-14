import { logger } from './logger';

let activeJob: string | null = null;
let activeGeneration = 0;
let activeStartedAt = 0;
const waitQueue: Array<() => void> = [];

export type SkippedDbJob = { skipped: true; reason: string };

export type DbJobLockOptions = {
  skipIfBusy?: boolean;
  /** Cap how long we wait for another job. Defaults to unlimited. */
  maxWaitMs?: number;
  /** Steal a lock that has been held longer than this. Default 40 minutes. */
  staleLockMs?: number;
};

const DEFAULT_STALE_LOCK_MS = 40 * 60 * 1000;

export function getActiveDbJob(): string | null {
  return activeJob;
}

function releaseWaiter(): void {
  const next = waitQueue.shift();
  if (next) next();
}

function waitForDbJob(): Promise<void> {
  return new Promise((resolve) => {
    waitQueue.push(resolve);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stealStaleLock = (staleLockMs: number): boolean => {
  if (!activeJob || !activeStartedAt) return false;
  const heldMs = Date.now() - activeStartedAt;
  if (heldMs < staleLockMs) return false;
  logger.error('Stealing stale db job lock', { activeJob, heldMs });
  activeJob = null;
  activeStartedAt = 0;
  activeGeneration += 1;
  releaseWaiter();
  return true;
};

/**
 * Serialize heavy SQLite batch jobs so only one BEGIN TRANSACTION runs at a time.
 * Prevents "cannot start a transaction within a transaction" crashes when crons overlap.
 */
export async function withDbJobLock<T>(
  jobName: string,
  fn: () => Promise<T>,
  options?: DbJobLockOptions
): Promise<T | SkippedDbJob> {
  const staleLockMs = options?.staleLockMs ?? DEFAULT_STALE_LOCK_MS;

  if (activeJob) {
    stealStaleLock(staleLockMs);
  }

  if (activeJob) {
    if (options?.skipIfBusy) {
      const reason = `${activeJob} already running`;
      logger.warn(`Skipping ${jobName}: ${reason}`);
      return { skipped: true, reason };
    }

    logger.info(`${jobName} waiting for ${activeJob} to finish...`);
    const deadline =
      options?.maxWaitMs != null && Number.isFinite(options.maxWaitMs)
        ? Date.now() + Math.max(0, options.maxWaitMs)
        : Number.POSITIVE_INFINITY;
    while (activeJob) {
      stealStaleLock(staleLockMs);
      if (!activeJob) break;
      if (Date.now() >= deadline) {
        const reason = `timed out waiting for ${activeJob}`;
        logger.warn(`Skipping ${jobName}: ${reason}`);
        return { skipped: true, reason };
      }
      await Promise.race([waitForDbJob(), sleep(1000)]);
    }
  }

  const myGeneration = activeGeneration + 1;
  activeGeneration = myGeneration;
  activeJob = jobName;
  activeStartedAt = Date.now();
  try {
    return await fn();
  } finally {
    if (activeGeneration === myGeneration) {
      activeJob = null;
      activeStartedAt = 0;
      releaseWaiter();
    }
  }
}

export function isSkippedDbJob<T>(result: T | SkippedDbJob): result is SkippedDbJob {
  return typeof result === 'object' && result !== null && 'skipped' in result && (result as SkippedDbJob).skipped === true;
}
