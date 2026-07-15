import { logger } from './logger';

let activeJob: string | null = null;
const waitQueue: Array<() => void> = [];

export type SkippedDbJob = { skipped: true; reason: string };

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

/**
 * Serialize heavy SQLite batch jobs so only one BEGIN TRANSACTION runs at a time.
 * Prevents "cannot start a transaction within a transaction" crashes when crons overlap.
 */
export async function withDbJobLock<T>(
  jobName: string,
  fn: () => Promise<T>,
  options?: { skipIfBusy?: boolean }
): Promise<T | SkippedDbJob> {
  if (activeJob) {
    if (options?.skipIfBusy) {
      const reason = `${activeJob} already running`;
      logger.warn(`Skipping ${jobName}: ${reason}`);
      return { skipped: true, reason };
    }

    logger.info(`${jobName} waiting for ${activeJob} to finish...`);
    while (activeJob) {
      await waitForDbJob();
    }
  }

  activeJob = jobName;
  try {
    return await fn();
  } finally {
    activeJob = null;
    releaseWaiter();
  }
}

export function isSkippedDbJob<T>(result: T | SkippedDbJob): result is SkippedDbJob {
  return typeof result === 'object' && result !== null && 'skipped' in result && (result as SkippedDbJob).skipped === true;
}
