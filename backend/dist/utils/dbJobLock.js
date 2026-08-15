"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveDbJob = getActiveDbJob;
exports.withDbJobLock = withDbJobLock;
exports.isSkippedDbJob = isSkippedDbJob;
const logger_1 = require("./logger");
let activeJob = null;
let activeGeneration = 0;
let activeStartedAt = 0;
const waitQueue = [];
const DEFAULT_STALE_LOCK_MS = 40 * 60 * 1000;
function getActiveDbJob() {
    return activeJob;
}
function releaseWaiter() {
    const next = waitQueue.shift();
    if (next)
        next();
}
function waitForDbJob() {
    return new Promise((resolve) => {
        waitQueue.push(resolve);
    });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stealStaleLock = (staleLockMs) => {
    if (!activeJob || !activeStartedAt)
        return false;
    const heldMs = Date.now() - activeStartedAt;
    if (heldMs < staleLockMs)
        return false;
    logger_1.logger.error('Stealing stale db job lock', { activeJob, heldMs });
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
async function withDbJobLock(jobName, fn, options) {
    var _a;
    const staleLockMs = (_a = options === null || options === void 0 ? void 0 : options.staleLockMs) !== null && _a !== void 0 ? _a : DEFAULT_STALE_LOCK_MS;
    if (activeJob) {
        stealStaleLock(staleLockMs);
    }
    if (activeJob) {
        if (options === null || options === void 0 ? void 0 : options.skipIfBusy) {
            const reason = `${activeJob} already running`;
            logger_1.logger.warn(`Skipping ${jobName}: ${reason}`);
            return { skipped: true, reason };
        }
        logger_1.logger.info(`${jobName} waiting for ${activeJob} to finish...`);
        const deadline = (options === null || options === void 0 ? void 0 : options.maxWaitMs) != null && Number.isFinite(options.maxWaitMs)
            ? Date.now() + Math.max(0, options.maxWaitMs)
            : Number.POSITIVE_INFINITY;
        while (activeJob) {
            stealStaleLock(staleLockMs);
            if (!activeJob)
                break;
            if (Date.now() >= deadline) {
                const reason = `timed out waiting for ${activeJob}`;
                logger_1.logger.warn(`Skipping ${jobName}: ${reason}`);
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
    }
    finally {
        if (activeGeneration === myGeneration) {
            activeJob = null;
            activeStartedAt = 0;
            releaseWaiter();
        }
    }
}
function isSkippedDbJob(result) {
    return typeof result === 'object' && result !== null && 'skipped' in result && result.skipped === true;
}
