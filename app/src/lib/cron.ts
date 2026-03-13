import cron from 'node-cron';
import { scrapeAll } from '@/lib/scraper';
import { checkAndSendNotifications } from '@/lib/push';
import db from '@/lib/db';

const globalForCron = globalThis as typeof globalThis & {
  __snowman_cron_initialized?: boolean;
};

export function startCronJobs(): void {
  if (globalForCron.__snowman_cron_initialized) {
    console.log('[cron] Already initialized, skipping');
    return;
  }

  console.log('[cron] Starting cron jobs...');

  // Scrape every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[cron] Running scheduled scrape...');
    try {
      await scrapeAll();
      console.log('[cron] Scheduled scrape completed');
    } catch (error) {
      console.error('[cron] Scheduled scrape failed:', error);
    }
  });

  // Check notifications every minute
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndSendNotifications();
    } catch (error) {
      console.error('[cron] Notification check failed:', error);
    }
  });

  // Cleanup old data daily at 3:00 AM JST
  cron.schedule('0 3 * * *', () => {
    console.log('[cron] Running daily cleanup...');
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const cutoff = threeMonthsAgo.toISOString();

      // Delete old appearances (cascade will handle appearance_members)
      const result = db
        .prepare('DELETE FROM appearances WHERE start_at < ?')
        .run(cutoff);

      console.log(`[cron] Cleaned up ${result.changes} old appearance(s)`);

      // Also clean up old scrape logs (keep 3 months)
      const logResult = db
        .prepare('DELETE FROM scrape_logs WHERE executed_at < ?')
        .run(cutoff);

      console.log(`[cron] Cleaned up ${logResult.changes} old scrape log(s)`);
    } catch (error) {
      console.error('[cron] Daily cleanup failed:', error);
    }
  });

  globalForCron.__snowman_cron_initialized = true;
  console.log('[cron] All cron jobs started');
}
