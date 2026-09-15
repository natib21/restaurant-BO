/**
 * @file tests/reports-export-format-validation.test.js
 * @description Test that export endpoint rejects unsupported formats (xlsx, pdf) at validation time
 */

const { z } = require('zod');
const { exportJobRequestSchema } = require('../src/modules/reports/validators/report.validators');

describe('Reports: Export Format Validation', () => {
  test('CSV format is accepted', () => {
    console.log('\n🧪 TEST 1: CSV format is accepted');

    const validRequest = {
      reportType: 'sales',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      format: 'csv',
    };

    console.log(`  Validating export request with format: csv`);

    const result = exportJobRequestSchema.safeParse(validRequest);

    console.log(`  Validation result: ${result.success ? 'PASS' : 'FAIL'}`);

    expect(result.success).toBe(true);
    expect(result.data.format).toBe('csv');

    console.log(`  ✅ CSV format correctly accepted`);
  });

  test('XLSX format is rejected at validation time with 400-level error', () => {
    console.log('\n🧪 TEST 2: XLSX format rejected at validation time');

    const invalidRequest = {
      reportType: 'sales',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      format: 'xlsx',  // ❌ Not supported
    };

    console.log(`  Validating export request with format: xlsx`);

    const result = exportJobRequestSchema.safeParse(invalidRequest);

    console.log(`  Validation result: ${result.success ? 'PASS' : 'FAIL'}`);
    if (!result.success) {
      console.log(`  Error message: ${result.error.errors[0].message}`);
    }

    expect(result.success).toBe(false);
    expect(result.error.errors[0].code).toBe('invalid_enum_value');
    expect(result.error.errors[0].message).toContain('csv');
    expect(result.error.errors[0].message).toContain('not yet supported');

    console.log(`  ✅ XLSX correctly rejected with validation error`);
  });

  test('PDF format is rejected at validation time with 400-level error', () => {
    console.log('\n🧪 TEST 3: PDF format rejected at validation time');

    const invalidRequest = {
      reportType: 'sales',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      format: 'pdf',  // ❌ Not supported
    };

    console.log(`  Validating export request with format: pdf`);

    const result = exportJobRequestSchema.safeParse(invalidRequest);

    console.log(`  Validation result: ${result.success ? 'PASS' : 'FAIL'}`);
    if (!result.success) {
      console.log(`  Error message: ${result.error.errors[0].message}`);
    }

    expect(result.success).toBe(false);
    expect(result.error.errors[0].code).toBe('invalid_enum_value');
    expect(result.error.errors[0].message).toContain('csv');
    expect(result.error.errors[0].message).toContain('not yet supported');

    console.log(`  ✅ PDF correctly rejected with validation error`);
  });

  test('Missing format defaults to CSV', () => {
    console.log('\n🧪 TEST 4: Missing format defaults to CSV');

    const requestWithoutFormat = {
      reportType: 'sales',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      // format omitted
    };

    console.log(`  Validating export request without format field`);

    const result = exportJobRequestSchema.safeParse(requestWithoutFormat);

    console.log(`  Validation result: ${result.success ? 'PASS' : 'FAIL'}`);
    console.log(`  Default format applied: ${result.data?.format || 'none'}`);

    expect(result.success).toBe(true);
    expect(result.data.format).toBe('csv');

    console.log(`  ✅ Default CSV format correctly applied`);
  });

  test('Validation error contains helpful message about unsupported formats', () => {
    console.log('\n🧪 TEST 5: Error message mentions unsupported formats');

    const invalidRequest = {
      reportType: 'profitability',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      format: 'xlsx',
    };

    console.log(`  Validating XLSX format request`);

    const result = exportJobRequestSchema.safeParse(invalidRequest);

    const errorMessage = result.error.errors[0].message;
    console.log(`  Error message: "${errorMessage}"`);

    expect(errorMessage).toContain('xlsx');
    expect(errorMessage).toContain('pdf');
    expect(errorMessage).toContain('not yet supported');

    console.log(`  ✅ Error message is clear about unsupported formats`);
  });
});
