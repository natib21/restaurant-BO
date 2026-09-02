/**
 * @file src/modules/monitoring/monitoring-scheduler.js
 * @description Background scheduler for monitoring and health checks
 * 
 * Runs periodic tasks:
 * - System health checks (every 5 minutes)
 * - Business metrics collection (every 10 minutes)
 * - Alert checks (every 15 minutes)
 */

const { getMetrics } = require('../../common/middleware/metrics.middleware');
const AlertService = require('./alert.service');
const BusinessMetricsService = require('./business-metrics.service');
const Merchant = require('../../../models/merchantModel');
const logger = require('../../../utils/logger');

class MonitoringScheduler {
  constructor() {
    this.intervals = {
      healthCheck: null,
      businessMetrics: null,
      alertCheck: null,
    };
    this.isRunning = false;
  }

  /**
   * Start all monitoring tasks
   */
  start() {
    if (this.isRunning) {
      logger.warn('monitoring.scheduler.already_running');
      return;
    }

    this.isRunning = true;
    logger.info('monitoring.scheduler.starting');

    // System health check - every 5 minutes
    this.intervals.healthCheck = setInterval(
      () => this._runHealthCheck(),
      5 * 60 * 1000
    );

    // Business metrics collection - every 10 minutes
    this.intervals.businessMetrics = setInterval(
      () => this._collectBusinessMetrics(),
      10 * 60 * 1000
    );

    // Alert check - every 15 minutes
    this.intervals.alertCheck = setInterval(
      () => this._runAlertCheck(),
      15 * 60 * 1000
    );

    // Run initial checks immediately
    this._runHealthCheck();
    this._collectBusinessMetrics();
    this._runAlertCheck();

    logger.info('monitoring.scheduler.started', {
      intervals: {
        health_check: '5m',
        business_metrics: '10m',
        alert_check: '15m',
      },
    });
  }

  /**
   * Stop all monitoring tasks
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('monitoring.scheduler.not_running');
      return;
    }

    logger.info('monitoring.scheduler.stopping');

    for (const [name, interval] of Object.entries(this.intervals)) {
      if (interval) {
        clearInterval(interval);
        this.intervals[name] = null;
      }
    }

    this.isRunning = false;
    logger.info('monitoring.scheduler.stopped');
  }

  /**
   * Run system health check
   * @private
   */
  async _runHealthCheck() {
    try {
      const metrics = getMetrics();
      
      logger.debug('monitoring.health_check.running', {
        requests_total: metrics.requests.total,
        error_rate: metrics.errors.rate,
        active_requests: metrics.active_requests,
      });

      // Check for critical issues
      await AlertService.checkSystemHealth(metrics);

    } catch (error) {
      logger.error('monitoring.health_check.failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Collect business metrics for all active merchants
   * @private
   */
  async _collectBusinessMetrics() {
    try {
      logger.debug('monitoring.business_metrics.collecting');

      // Get sample of active merchants (limit to avoid overload)
      const activeMerchants = await Merchant.find({ isActive: true })
        .limit(10)
        .select('_id businessName')
        .lean();

      for (const merchant of activeMerchants) {
        try {
          // Check for alerts
          const alerts = await BusinessMetricsService.getAlerts(merchant._id);
          
          if (alerts.alert_count > 0) {
            logger.info('monitoring.merchant_alerts', {
              merchantId: merchant._id,
              merchant_name: merchant.businessName,
              alert_count: alerts.alert_count,
              alerts: alerts.alerts,
            });

            // Send high/critical alerts
            for (const alert of alerts.alerts) {
              if (alert.severity === 'critical' || alert.severity === 'high') {
                await AlertService.sendAlert(alert, merchant._id);
              }
            }
          }
        } catch (error) {
          logger.error('monitoring.merchant_metrics.failed', {
            merchantId: merchant._id,
            error: error.message,
          });
        }
      }

      logger.debug('monitoring.business_metrics.collected', {
        merchants_checked: activeMerchants.length,
      });

    } catch (error) {
      logger.error('monitoring.business_metrics.failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Run alert checks
   * @private
   */
  async _runAlertCheck() {
    try {
      logger.debug('monitoring.alert_check.running');

      const metrics = getMetrics();

      // Check for critical system issues
      if (metrics.active_requests > 100) {
        await AlertService.sendAlert({
          severity: 'high',
          type: 'high_active_requests',
          message: `${metrics.active_requests} active requests (threshold: 100)`,
          details: { active_requests: metrics.active_requests },
        });
      }

      if (metrics.slow_requests.count > 20) {
        await AlertService.sendAlert({
          severity: 'medium',
          type: 'many_slow_requests',
          message: `${metrics.slow_requests.count} slow requests detected`,
          details: {
            count: metrics.slow_requests.count,
            threshold_ms: metrics.slow_requests.threshold_ms,
          },
        });
      }

    } catch (error) {
      logger.error('monitoring.alert_check.failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.isRunning,
      intervals: {
        health_check: this.intervals.healthCheck !== null,
        business_metrics: this.intervals.businessMetrics !== null,
        alert_check: this.intervals.alertCheck !== null,
      },
    };
  }
}

// Export singleton instance
const scheduler = new MonitoringScheduler();

module.exports = scheduler;
