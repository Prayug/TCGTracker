"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dbJobLock_1 = require("../dbJobLock");
describe('withDbJobLock', () => {
    it('skips when another job is running', async () => {
        let release;
        const hung = (0, dbJobLock_1.withDbJobLock)('held', () => new Promise((resolve) => {
            release = () => resolve('done');
        }));
        const skipped = await (0, dbJobLock_1.withDbJobLock)('next', async () => 'nope', { skipIfBusy: true });
        expect((0, dbJobLock_1.isSkippedDbJob)(skipped)).toBe(true);
        if ((0, dbJobLock_1.isSkippedDbJob)(skipped)) {
            expect(skipped.reason).toMatch(/held already running/);
        }
        release();
        await expect(hung).resolves.toBe('done');
    });
    it('steals a stale lock so later jobs are not skipped forever', async () => {
        void (0, dbJobLock_1.withDbJobLock)('hung', () => new Promise(() => { }), { staleLockMs: 40 });
        await new Promise((resolve) => setTimeout(resolve, 80));
        const next = await (0, dbJobLock_1.withDbJobLock)('next', async () => 'ok', {
            skipIfBusy: true,
            staleLockMs: 40,
        });
        expect((0, dbJobLock_1.isSkippedDbJob)(next)).toBe(false);
        expect(next).toBe('ok');
    });
});
