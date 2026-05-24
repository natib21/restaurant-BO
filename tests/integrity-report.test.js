const { createIssue, buildReport, capIssues } = require('../src/modules/integrity/integrity-report');
const { auditFileStructure } = require('../src/modules/integrity/auditors/file-structure.auditor');

describe('integrity-report', () => {
  it('builds summary counts', () => {
    const report = buildReport([
      createIssue({
        module: 'test',
        type: 'missing',
        severity: 'critical',
        message: 'a',
      }),
      createIssue({
        module: 'test',
        type: 'mismatch',
        severity: 'warning',
        message: 'b',
      }),
    ]);

    expect(report.summary.critical).toBe(1);
    expect(report.summary.warning).toBe(1);
    expect(report.issues).toHaveLength(2);
    expect(report.timestamp).toBeDefined();
  });

  it('caps issue lists', () => {
    const issues = Array.from({ length: 5 }, (_, i) =>
      createIssue({ module: 'm', type: 'missing', severity: 'warning', message: String(i) })
    );
    const capped = capIssues(issues, 3);
    expect(capped.length).toBe(4);
  });
});

describe('auditFileStructure', () => {
  it('passes when core modules exist', () => {
    const issues = auditFileStructure();
    const missingCritical = issues.filter(
      i => i.severity === 'critical' && i.type === 'missing'
    );
    expect(missingCritical).toHaveLength(0);
  });
});
