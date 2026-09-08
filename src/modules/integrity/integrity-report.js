/**
 * @typedef {'orphan_reference'|'mismatch'|'missing'|'invalid_state'} IntegrityIssueType
 * @typedef {'critical'|'warning'} IntegritySeverity
 */

/**
 * @typedef {Object} IntegrityIssue
 * @property {string} module
 * @property {IntegrityIssueType} type
 * @property {IntegritySeverity} severity
 * @property {string} entityId
 * @property {string} message
 * @property {string} suggestion
 * @property {string} production_best_practice
 */

/**
 * @typedef {Object} SystemIntegrityReport
 * @property {string} timestamp
 * @property {{ critical: number, warning: number }} summary
 * @property {IntegrityIssue[]} issues
 * @property {Object} [meta]
 */

const DEFAULT_ISSUE_CAP = Number(process.env.INTEGRITY_MAX_ISSUES_PER_AUDITOR) || 50;

/**
 * @param {Partial<IntegrityIssue> & Pick<IntegrityIssue, 'module'|'type'|'severity'|'message'>} input
 * @returns {IntegrityIssue}
 */
function createIssue(input) {
  return {
    module: input.module,
    type: input.type,
    severity: input.severity,
    entityId: input.entityId != null ? String(input.entityId) : '',
    message: input.message,
    suggestion: input.suggestion || '',
    production_best_practice: input.production_best_practice || '',
  };
}

/**
 * @param {IntegrityIssue[]} issues
 * @param {number} [cap]
 * @returns {IntegrityIssue[]}
 */
function capIssues(issues, cap = DEFAULT_ISSUE_CAP) {
  if (issues.length <= cap) return issues;
  return [
    ...issues.slice(0, cap),
    createIssue({
      module: 'integrity',
      type: 'invalid_state',
      severity: 'warning',
      message: `Audit truncated at ${cap} issues for this domain. Narrow merchantId or run targeted audit.`,
      suggestion: 'Increase INTEGRITY_MAX_ISSUES_PER_AUDITOR or fix highest-severity items first.',
      production_best_practice:
        'Production SaaS systems paginate integrity scans and store reports in object storage for historical trending.',
    }),
  ];
}

/**
 * @param {IntegrityIssue[]} issues
 * @param {Object} [meta]
 * @returns {SystemIntegrityReport}
 */
function buildReport(issues, meta = {}) {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;

  return {
    timestamp: new Date().toISOString(),
    summary: { critical, warning },
    issues,
    meta,
  };
}

module.exports = { createIssue, buildReport, capIssues, DEFAULT_ISSUE_CAP };
