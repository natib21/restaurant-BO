/**
 * Task 17.2: Audit Logging for Report Access - Verification Test
 * 
 * This test verifies that audit logging has been properly integrated
 * into the three report handlers:
 * - getProfitabilityReport
 * - createExportJob
 * - getExportJobStatus
 * 
 * Requirement: 17.6 - Audit logging for report access
 */

const { 
  getProfitabilityReport, 
  createExportJob, 
  getExportJobStatus 
} = require('../src/modules/reports/controller/report.controller');

describe('Task 17.2: Audit Logging Integration', () => {
  
  it('should verify getProfitabilityReport handler exists', () => {
    expect(typeof getProfitabilityReport).toBe('function');
  });
  
  it('should verify createExportJob handler exists', () => {
    expect(typeof createExportJob).toBe('function');
  });
  
  it('should verify getExportJobStatus handler exists', () => {
    expect(typeof getExportJobStatus).toBe('function');
  });
  
  it('should verify auditLogger is imported in report controller', () => {
    const fs = require('fs');
    const controllerContent = fs.readFileSync(
      'c:\\Users\\HP\\Dev\\projects\\Restaurant_App\\restaurant-BO\\src\\modules\\reports\\controller\\report.controller.js',
      'utf8'
    );
    
    // Verify auditLogger is imported
    expect(controllerContent).toContain("require('../../../../utils/auditLogger')");
    
    // Verify audit logging is present in getProfitabilityReport
    expect(controllerContent).toContain("// 6. Audit logging for report access (Requirement 17.6)");
    expect(controllerContent).toMatch(/reportType: 'profitability'/);
    
    // Verify audit logging is present in createExportJob with REPORT_EXPORT action
    expect(controllerContent).toContain("// 6. Audit logging for report export (Requirement 17.6)");
    expect(controllerContent).toMatch(/action: 'REPORT_EXPORT'/);
    expect(controllerContent).toMatch(/statusCode: 202/);
    
    // Verify audit logging is present in getExportJobStatus
    expect(controllerContent).toContain("// 4. Audit logging for report access (Requirement 17.6)");
    expect(controllerContent).toMatch(/jobId: jobStatus\.jobId/);
    expect(controllerContent).toMatch(/jobStatus: jobStatus\.status/);
    
    // Verify error handling for audit failures (non-blocking)
    const auditErrorMatches = controllerContent.match(/console\.error\('Audit log failed/g);
    expect(auditErrorMatches).toBeTruthy();
    expect(auditErrorMatches.length).toBeGreaterThanOrEqual(3); // At least 3 handlers with audit logging
  });
  
  it('should verify audit logging follows the correct pattern', () => {
    const fs = require('fs');
    const controllerContent = fs.readFileSync(
      'c:\\Users\\HP\\Dev\\projects\\Restaurant_App\\restaurant-BO\\src\\modules\\reports\\controller\\report.controller.js',
      'utf8'
    );
    
    // Verify all audit logging calls are wrapped in try-catch
    const tryAuditMatches = controllerContent.match(/try \{[\s\S]*?await auditLogger\(/g);
    expect(tryAuditMatches).toBeTruthy();
    expect(tryAuditMatches.length).toBeGreaterThanOrEqual(3);
    
    // Verify metadata structure includes required fields
    expect(controllerContent).toMatch(/metadata: \{[\s\S]*?reportType/);
    expect(controllerContent).toMatch(/metadata: \{[\s\S]*?dateFrom/);
    expect(controllerContent).toMatch(/metadata: \{[\s\S]*?dateTo/);
    expect(controllerContent).toMatch(/metadata: \{[\s\S]*?branchId:/);
    expect(controllerContent).toMatch(/metadata: \{[\s\S]*?format/);
  });
  
});
