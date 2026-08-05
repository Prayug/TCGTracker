import { runAllCardsRefresh } from '../services/gradedRefreshService';

/**
 * Long-running full-catalog sweep, normally launched detached (nohup).
 * Walks every real-set card, skipping anything refreshed within the 12h TTL,
 * so it can be stopped and re-run at any time without duplicating work.
 */
(async () => {
  const started = Date.now();
  console.log(`FULL SWEEP START ${new Date().toISOString()}`);
  const result = await runAllCardsRefresh({
    delayMs: 600,
    logEvery: 100,
  });
  const elapsedMin = Math.round((Date.now() - started) / 60000);
  console.log(
    `FULL SWEEP DONE in ${elapsedMin}min`,
    JSON.stringify({
      attempted: result.attempted,
      saved: result.saved,
      notFound: result.notFound,
      failed: result.failed,
      directHits: result.directHits,
    })
  );
  process.exit(0);
})();
