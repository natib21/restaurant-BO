const logger = require('../../../utils/logger');
const { SubscriptionService } = require('./services/subscription.service');

let timer = null;

function startSubscriptionScheduler() {
  if (process.env.SUBSCRIPTION_TRIAL_CRON_ENABLED !== 'true') {
    return null;
  }

  const intervalMs = Number(process.env.SUBSCRIPTION_TRIAL_CRON_INTERVAL_MS) || 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await SubscriptionService.expireOldSubscriptions();
      logger.info('subscriptions.cron.completed', { expiredCount: result.expired });
    } catch (error) {
      logger.error('subscriptions.cron.failed', { error: error.message });
    }
  };

  timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  logger.info('subscriptions.cron.started', { intervalMs });
  return { stop: () => clearInterval(timer) };
}

function stopSubscriptionScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startSubscriptionScheduler, stopSubscriptionScheduler };