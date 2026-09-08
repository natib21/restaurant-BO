const logger = require('../../../utils/logger');
const { buildReport } = require('./integrity-report');
const { auditFileStructure } = require('./auditors/file-structure.auditor');
const { auditBranches } = require('./auditors/branch.auditor');
const { auditMenus } = require('./auditors/menu.auditor');
const { auditTables } = require('./auditors/table.auditor');
const { auditRoles } = require('./auditors/role.auditor');
const { auditNotifications } = require('./auditors/notification.auditor');
const { auditDataReferences } = require('./auditors/data-reference.auditor');

/**
 * Read-only cross-module integrity audit (no writes).
 *
 * @typedef {Object} AuditOptions
 * @property {string} [merchantId] - Scope audits to one tenant
 * @property {string[]} [domains] - Subset: structure|branch|menu|table|rbac|notifications|data
 */

class SystemIntegrityService {
  static async auditFileStructure() {
    return auditFileStructure();
  }

  static async auditBranches(options = {}) {
    return auditBranches(options);
  }

  static async auditMenus(options = {}) {
    return auditMenus(options);
  }

  static async auditTables(options = {}) {
    return auditTables(options);
  }

  static async auditRoles(options = {}) {
    return auditRoles(options);
  }

  static async auditNotifications(options = {}) {
    return auditNotifications(options);
  }

  static async auditDataReferences(options = {}) {
    return auditDataReferences(options);
  }

  /**
   * Run full or partial integrity scan.
   * @param {AuditOptions} [options]
   */
  static async runFullAudit(options = {}) {
    const { merchantId, domains } = options;
    const started = Date.now();
    const scope = { merchantId: merchantId || null };
    const allDomains = ['structure', 'branch', 'menu', 'table', 'rbac', 'notifications', 'data'];
    const selected = domains && domains.length > 0 ? domains.map(d => d.toLowerCase()) : allDomains;

    const run = async name => {
      switch (name) {
        case 'structure':
          return { domain: name, issues: await SystemIntegrityService.auditFileStructure() };
        case 'branch':
          return {
            domain: name,
            issues: await SystemIntegrityService.auditBranches({ merchantId }),
          };
        case 'menu':
          return { domain: name, issues: await SystemIntegrityService.auditMenus({ merchantId }) };
        case 'table':
          return { domain: name, issues: await SystemIntegrityService.auditTables({ merchantId }) };
        case 'rbac':
          return { domain: name, issues: await SystemIntegrityService.auditRoles({ merchantId }) };
        case 'notifications':
          return {
            domain: name,
            issues: await SystemIntegrityService.auditNotifications({ merchantId }),
          };
        case 'data':
          return {
            domain: name,
            issues: await SystemIntegrityService.auditDataReferences({ merchantId }),
          };
        default:
          return { domain: name, issues: [] };
      }
    };

    const results = await Promise.all(selected.map(run));
    const issues = results.flatMap(r => r.issues);
    const byDomain = Object.fromEntries(results.map(r => [r.domain, r.issues.length]));

    const report = buildReport(issues, {
      scope,
      durationMs: Date.now() - started,
      domains: byDomain,
    });

    logger.info('integrity.audit.completed', {
      merchantId: scope.merchantId,
      critical: report.summary.critical,
      warning: report.summary.warning,
      durationMs: report.meta.durationMs,
    });

    return report;
  }
}

module.exports = { SystemIntegrityService };
