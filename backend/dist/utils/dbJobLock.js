"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveDbJob = getActiveDbJob;
exports.withDbJobLock = withDbJobLock;
exports.isSkippedDbJob = isSkippedDbJob;
const logger_1 = require("./logger");
let activeJob = null;
const waitQueue = [];
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
/**
 * Serialize heavy SQLite batch jobs so only one BEGIN TRANSACTION runs at a time.
 * Prevents "cannot start a transaction within a transaction" crashes when crons overlap.
 */
async function withDbJobLock(jobName, fn, options) {
    if (activeJob) {
        if (options === null || options === void 0 ? void 0 : options.skipIfBusy) {
            const reason = `${activeJob} already running`;
            logger_1.logger.warn(`Skipping ${jobName}: ${reason}`);
            return { skipped: true, reason };
        }
        logger_1.logger.info(`${jobName} waiting for ${activeJob} to finish...`);
        while (activeJob) {
            await waitForDbJob();
        }
    }
    activeJob = jobName;
    try {
        return await fn();
    }
    finally {
        activeJob = null;
        releaseWaiter();
    }
}
function isSkippedDbJob(result) {
    return typeof result === 'object' && result !== null && 'skipped' in result && result.skipped === true;
}
