/**
 * Run one deal-watcher cycle by hand.
 *
 *   npm run deal-watch                 # one real cycle (emails new deals)
 *   npm run deal-watch -- --dry-run    # score and print, no email
 *   npm run deal-watch -- --test-email # just send a test email to DEAL_ALERT_EMAIL
 *
 * The first real run only records where "now" is for each search, so it will
 * usually find nothing; run it again a few minutes later.
 */
import { env } from '../config/env';
import { initializeDatabase } from '../db/database';
import { sendEmail, isEmailConfigured } from '../services/emailService';
import { runDealWatchCycle } from '../services/dealWatcher';
import { formatDealAlertEmail } from '../services/dealWatchRules';

async function main() {
  const args = new Set(process.argv.slice(2));
  const to = (process.env.DEAL_ALERT_EMAIL || env.email.user || '').trim();

  if (args.has('--test-email')) {
    if (!isEmailConfigured() || !to) {
      console.error('SMTP_* or DEAL_ALERT_EMAIL is not set in backend/.env');
      process.exit(1);
    }
    const ok = await sendEmail({
      to,
      subject: 'TCGTracker deal watcher: test email',
      text: 'If you can read this, deal alerts will reach this inbox.\n\n— TCGTracker',
    });
    console.log(ok ? `Test email sent to ${to}` : 'Test email failed; see backend logs');
    process.exit(ok ? 0 : 1);
  }

  await initializeDatabase();
  const dryRun = args.has('--dry-run');
  const result = await runDealWatchCycle({ dryRun });
  console.log(JSON.stringify(result.games, null, 2));
  if (result.skipped) console.log('Skipped:', result.skipped);
  if (result.alerts.length) {
    console.log('\n' + formatDealAlertEmail(result.alerts, { appUrl: env.appUrl }).text);
  } else {
    console.log('\nNo new listings cleared the alert bar this cycle.');
  }
  console.log(dryRun ? '\n(dry run: nothing emailed)' : result.emailed ? '\nEmailed.' : '');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
