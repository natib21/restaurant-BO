const { z } = require('zod');

// ============================================================
// ZOD SCHEMAS FOR REPORT VALIDATION
// ============================================================

/**
 * Shared validation schema for report query parameters
 * Used across all report endpoints (sales, orders, products, etc.)
 * 
 * Requirements covered:
 * - 2.2: Shared Zod validation schemas
 * - 4.1: Date range handling with required ISO dates
 * - 4.4: Pagination with page/limit defaults
 * - 4.5: Format support for JSON/CSV
 */
const reportQuerySchema = z.object({
  // Required ISO date string for start of date range
  // Requirement 19.1: Missing dateFrom → "dateFrom is required"
  dateFrom: z.string({ 
    required_error: 'dateFrom is required' 
  }).datetime({ 
    message: 'dateFrom must be ISO 8601 format' 
  }).describe('Start date (ISO 8601 format)'),
  
  // Required ISO date string for end of date range
  // Requirement 19.2: Missing dateTo → "dateTo is required"
  dateTo: z.string({ 
    required_error: 'dateTo is required' 
  }).datetime({ 
    message: 'dateTo must be ISO 8601 format' 
  }).describe('End date (ISO 8601 format)'),
  
  // Optional ObjectId for filtering to specific branch
  branchId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid branch ID format')
    .optional()
    .describe('Optional branch ID to filter results'),
  
  // Time grouping bucket with day as default
  // Requirement 19.6: Invalid groupBy value
  groupBy: z.enum(['day', 'week', 'month'], {
    errorMap: () => ({ message: 'groupBy must be one of: day, week, month' })
  }).default('day').describe('Time grouping for breakdown data'),
  
  // Pagination: page number (min 1, default 1)
  page: z.coerce.number()
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(1)
    .describe('Page number for pagination'),
  
  // Pagination: items per page (min 1, max 100, default 50)
  limit: z.coerce.number()
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit cannot exceed 100')
    .default(50)
    .describe('Number of items per page'),
  
  // Output format selection
  // Requirement 19.7: Invalid format value (note: design shows csv/json but requirement mentions xlsx/pdf too)
  format: z.enum(['json', 'csv', 'xlsx', 'pdf'], {
    errorMap: () => ({ message: 'format must be one of: json, csv, xlsx, pdf' })
  }).default('json').describe('Response format')
}).refine(data => {
  // Requirement 19.3: Validate that dateFrom comes before dateTo
  const fromDate = new Date(data.dateFrom);
  const toDate = new Date(data.dateTo);
  return fromDate < toDate;
}, {
  message: 'dateFrom must be before dateTo',
  path: ['dateFrom']
});

/**
 * Validation schema for export job creation request body
 * Used for POST /api/v1/reports/exports
 * 
 * Requirements covered:
 * - 15.1: Export job creation with reportType, dates, format
 * - 15.2: Validation of export job parameters
 */
const exportJobRequestSchema = z.object({
  // Report type must be one of the 8 supported types
  reportType: z.enum([
    'sales',
    'orders',
    'products',
    'customers',
    'delivery',
    'profitability',
    'staff',
    'inventory'
  ], {
    errorMap: () => ({ 
      message: 'reportType must be one of: sales, orders, products, customers, delivery, profitability, staff, inventory' 
    })
  }).describe('Type of report to export'),
  
  // Required ISO date string for start of date range
  dateFrom: z.string({ 
    required_error: 'dateFrom is required' 
  }).datetime({ 
    message: 'dateFrom must be ISO 8601 format' 
  }).describe('Start date (ISO 8601 format)'),
  
  // Required ISO date string for end of date range
  dateTo: z.string({ 
    required_error: 'dateTo is required' 
  }).datetime({ 
    message: 'dateTo must be ISO 8601 format' 
  }).describe('End date (ISO 8601 format)'),
  
  // Optional ObjectId for filtering to specific branch
  branchId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid branch ID format')
    .optional()
    .describe('Optional branch ID to filter results'),
  
  // Export format (csv, xlsx, pdf)
  format: z.enum(['csv', 'xlsx', 'pdf'], {
    errorMap: () => ({ message: 'format must be one of: csv, xlsx, pdf' })
  }).default('csv').describe('Export file format')
}).refine(data => {
  // Validate that dateFrom comes before dateTo
  const fromDate = new Date(data.dateFrom);
  const toDate = new Date(data.dateTo);
  return fromDate < toDate;
}, {
  message: 'dateFrom must be before dateTo',
  path: ['dateFrom']
});

module.exports = {
  reportQuerySchema,
  exportJobRequestSchema
};
