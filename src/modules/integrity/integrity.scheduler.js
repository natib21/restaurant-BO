const logger = require('../../../utils/logger');
const { SystemIntegrityService } = require('./system-integrity.service');

let timer = null;

function startIntegrityScheduler() {
  if (process.env.INTEGRITY_CRON_ENABLED !== 'true') {
    return null;
  }

  const intervalMs = Number(process.env.INTEGRITY_CRON_INTERVAL_MS) || 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const report = await SystemIntegrityService.runFullAudit({});
      logger.info('integrity.cron.completed', {
        critical: report.summary.critical,
        warning: report.summary.warning,
      });
    } catch (error) {
      logger.error('integrity.cron.failed', { error: error.message });
    }
  };

  timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  logger.info('integrity.cron.started', { intervalMs });
  return { stop: () => clearInterval(timer) };
}

function stopIntegrityScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startIntegrityScheduler, stopIntegrityScheduler };
