/**
 * @file src/modules/monitoring/alert.service.js
 * @description Alert notification service - sends alerts via email, Slack, SMS
 * 
 * Alert types:
 * - critical: System down, data loss, security breach
 * - high: High error rate, payment failures, slow performance
 * - medium: Low order volume, pending payments
 * - low: Info, warnings
 */

const logger = require('../../../utils/logger');

// Alert configuration
const ALERT_CHANNELS = {
  EMAIL: process.env.ALERT_EMAIL_ENABLED === 'true',
  SLACK: process.env.ALERT_SLACK_ENABLED === 'true',
  SMS: process.env.ALERT_SMS_ENABLED === 'true',
};

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Track recent alerts to prevent spam
const recentAlerts = new Map();

class AlertService {
  /**
   * Send an alert through configured channels
   * @param {Object} alert - Alert object
   * @param {string} alert.severity - critical|high|medium|low
   * @param {string} alert.type - Alert type identifier
   * @param {string} alert.message - Alert message
   * @param {Object} alert.details - Additional details
   * @param {string} merchantId - Merchant ID (optional)
   */
  static async sendAlert(alert, merchantId = null) {
    try {
      // Check cooldown (prevent duplicate alerts within cooldown period)
      const alertKey = `${merchantId}:${alert.type}`;
      const lastAlert = recentAlerts.get(alertKey);
      
      if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
        logger.debug('alert.cooldown', {
          type: alert.type,
          merchantId,
          cooldown_remaining_minutes: ((ALERT_COOLDOWN_MS - (Date.now() - lastAlert)) / 60000).toFixed(1),
        });
        return { sent: false, reason: 'cooldown' };
      }

      // Log alert
      logger[alert.severity === 'critical' ? 'error' : 'warn']('alert.triggered', {
        severity: alert.severity,
        type: alert.type,
        message: alert.message,
        merchantId,
        details: alert.details,
      });

      // Send through configured channels
      const results = await Promise.allSettled([
        ALERT_CHANNELS.EMAIL && this._sendEmailAlert(alert, merchantId),
        ALERT_CHANNELS.SLACK && this._sendSlackAlert(alert, merchantId),
        ALERT_CHANNELS.SMS && alert.severity === 'critical' && this._sendSMSAlert(alert, merchantId),
      ]);

      // Update last alert timestamp
      recentAlerts.set(alertKey, Date.now());

      // Clean up old alerts (every 100 alerts)
      if (recentAlerts.size > 100) {
        const cutoff = Date.now() - ALERT_COOLDOWN_MS;
        for (const [key, timestamp] of recentAlerts.entries()) {
          if (timestamp < cutoff) {
            recentAlerts.delete(key);
          }
        }
      }

      return {
        sent: true,
        channels: {
          email: results[0]?.status === 'fulfilled' && ALERT_CHANNELS.EMAIL,
          slack: results[1]?.status === 'fulfilled' && ALERT_CHANNELS.SLACK,
          sms: results[2]?.status === 'fulfilled' && ALERT_CHANNELS.SMS && alert.severity === 'critical',
        },
      };
    } catch (error) {
      logger.error('alert.send.failed', {
        error: error.message,
        alert: alert.type,
        merchantId,
      });
      return { sent: false, error: error.message };
    }
  }

  /**
   * Send email alert
   * @private
   */
  static async _sendEmailAlert(alert, merchantId) {
    try {
      // TODO: Integrate with your email service (SendGrid, SES, etc.)
      // For now, just log
      logger.info('alert.email.sent', {
        to: process.env.ALERT_EMAIL_RECIPIENT || 'admin@example.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.type}`,
        alert,
        merchantId,
      });

      // Example integration:
      /*
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.ALERT_EMAIL_FROM,
        to: process.env.ALERT_EMAIL_RECIPIENT,
        subject: `[${alert.severity.toUpperCase()}] ${alert.type}`,
        html: `
          <h2>Alert: ${alert.message}</h2>
          <p><strong>Severity:</strong> ${alert.severity}</p>
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Merchant:</strong> ${merchantId || 'N/A'}</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          ${alert.details ? `<pre>${JSON.stringify(alert.details, null, 2)}</pre>` : ''}
        `,
      });
      */

      return { success: true };
    } catch (error) {
      logger.error('alert.email.failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Send Slack alert
   * @private
   */
  static async _sendSlackAlert(alert, merchantId) {
    try {
      // TODO: Integrate with Slack webhook
      // For now, just log
      logger.info('alert.slack.sent', {
        webhook: process.env.SLACK_WEBHOOK_URL ? '***' : 'not_configured',
        alert,
        merchantId,
      });

      // Example integration:
      /*
      const axios = require('axios');
      
      const color = {
        critical: 'danger',
        high: 'warning',
        medium: '#ffaa00',
        low: 'good',
      }[alert.severity];

      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        attachments: [
          {
            color,
            title: `[${alert.severity.toUpperCase()}] ${alert.type}`,
            text: alert.message,
            fields: [
              {
                title: 'Merchant ID',
                value: merchantId || 'N/A',
                short: true,
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true,
              },
            ],
            ...(alert.details && {
              text: `${alert.message}\n\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``,
            }),
          },
        ],
      });
      */

      return { success: true };
    } catch (error) {
      logger.error('alert.slack.failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Send SMS alert (critical only)
   * @private
   */
  static async _sendSMSAlert(alert, merchantId) {
    try {
      // TODO: Integrate with SMS provider (Twilio, AWS SNS, etc.)
      // For now, just log
      logger.info('alert.sms.sent', {
        to: process.env.ALERT_SMS_RECIPIENT || 'not_configured',
        alert,
        merchantId,
      });

      // Example integration with Twilio:
      /*
      const twilio = require('twilio');
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      await client.messages.create({
        body: `[CRITICAL] ${alert.type}: ${alert.message}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.ALERT_SMS_RECIPIENT,
      });
      */

      return { success: true };
    } catch (error) {
      logger.error('alert.sms.failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check system health and send alerts if needed
   * @param {Object} metrics - System metrics from getMetrics()
   */
  static async checkSystemHealth(metrics) {
    const alerts = [];

    // High error rate
    if (parseFloat(metrics.errors.rate) > 5) {
      alerts.push({
        severity: 'high',
        type: 'high_error_rate',
        message: `Error rate is ${metrics.errors.rate} (threshold: 5%)`,
        details: metrics.errors,
      });
    }

    // Slow response time
    if (metrics.response_time_ms.p95 > 2000) {
      alerts.push({
        severity: 'medium',
        type: 'slow_response_time',
        message: `95th percentile response time is ${metrics.response_time_ms.p95}ms (threshold: 2000ms)`,
        details: metrics.response_time_ms,
      });
    }

    // High memory usage (if available)
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (heapUsedPercent > 90) {
        alerts.push({
          severity: 'high',
          type: 'high_memory_usage',
          message: `Heap usage is ${heapUsedPercent.toFixed(1)}% (threshold: 90%)`,
          details: {
            heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
            heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
          },
        });
      }
    }

    // Send all alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }

    return alerts;
  }
}

module.exports = AlertService;
