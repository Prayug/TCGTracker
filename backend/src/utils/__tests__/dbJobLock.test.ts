import { isSkippedDbJob, withDbJobLock } from '../dbJobLock';

describe('withDbJobLock', () => {
  it('skips when another job is running', async () => {
    let release!: () => void;
    const hung = withDbJobLock(
      'held',
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('done');
        })
    );

    const skipped = await withDbJobLock('next', async () => 'nope', { skipIfBusy: true });
    expect(isSkippedDbJob(skipped)).toBe(true);
    if (isSkippedDbJob(skipped)) {
      expect(skipped.reason).toMatch(/held already running/);
    }

    release();
    await expect(hung).resolves.toBe('done');
  });

  it('steals a stale lock so later jobs are not skipped forever', async () => {
    void withDbJobLock('hung', () => new Promise(() => {}), { staleLockMs: 40 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const next = await withDbJobLock('next', async () => 'ok', {
      skipIfBusy: true,
      staleLockMs: 40,
    });
    expect(isSkippedDbJob(next)).toBe(false);
    expect(next).toBe('ok');
  });
});
