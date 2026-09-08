const fs = require('fs');
const path = require('path');
const { createIssue, capIssues } = require('../integrity-report');
const {
  PROJECT_ROOT,
  REQUIRED_MODULE_PATHS,
  DEPRECATED_OR_DUPLICATE_PATHS,
} = require('../integrity.constants');

function auditFileStructure() {
  const issues = [];

  for (const rel of REQUIRED_MODULE_PATHS) {
    const abs = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(abs)) {
      issues.push(
        createIssue({
          module: 'structure',
          type: 'missing',
          severity: 'critical',
          entityId: rel,
          message: `Required module file is missing: ${rel}`,
          suggestion: 'Restore file from refactor branch or fix deployment artifact.',
          production_best_practice:
            'Use modular monolith boundaries with CI arch-unit tests (dependency-cruiser / custom lint) to fail builds when core modules are removed.',
        })
      );
    }
  }

  for (const { rel, reason } of DEPRECATED_OR_DUPLICATE_PATHS) {
    const abs = path.join(PROJECT_ROOT, rel);
    if (fs.existsSync(abs)) {
      issues.push(
        createIssue({
          module: 'structure',
          type: 'invalid_state',
          severity: 'warning',
          entityId: rel,
          message: `Legacy or duplicate module present: ${rel} — ${reason}`,
          suggestion: 'Remove after confirming no runtime imports remain.',
          production_best_practice:
            'Deprecate in phases: mark @deprecated, grep imports, delete in next major release with changelog.',
        })
      );
    }
  }

  const domainDirs = [
    'src/modules/orders',
    'src/modules/auth',
    'src/infrastructure/outbox',
    'controllers',
    'routes',
    'models',
  ];

  for (const rel of domainDirs) {
    const abs = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(abs)) {
      issues.push(
        createIssue({
          module: 'structure',
          type: 'missing',
          severity: 'warning',
          entityId: rel,
          message: `Expected domain directory missing: ${rel}`,
          suggestion: 'Verify refactor layout or restore directory.',
          production_best_practice:
            'Domain-driven folder layout (orders/, inventory/, branch/) keeps cross-cutting audits predictable.',
        })
      );
    }
  }

  return capIssues(issues);
}

module.exports = { auditFileStructure };
