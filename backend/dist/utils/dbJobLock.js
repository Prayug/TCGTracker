"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
function withDbJobLock(jobName, fn, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (activeJob) {
            if (options === null || options === void 0 ? void 0 : options.skipIfBusy) {
                const reason = `${activeJob} already running`;
                logger_1.logger.warn(`Skipping ${jobName}: ${reason}`);
                return { skipped: true, reason };
            }
            logger_1.logger.info(`${jobName} waiting for ${activeJob} to finish...`);
            while (activeJob) {
                yield waitForDbJob();
            }
        }
        activeJob = jobName;
        try {
            return yield fn();
        }
        finally {
            activeJob = null;
            releaseWaiter();
        }
    });
}
function isSkippedDbJob(result) {
    return typeof result === 'object' && result !== null && 'skipped' in result && result.skipped === true;
}
