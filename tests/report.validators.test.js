const { reportQuerySchema } = require('../src/modules/reports/validators/report.validators');

describe('Report Query Schema Validation', () => {
  describe('Valid inputs', () => {
    test('should accept valid query parameters with all fields', () => {
      const validInput = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        branchId: '507f1f77bcf86cd799439011',
        groupBy: 'day',
        page: 1,
        limit: 50,
        format: 'json'
      };

      const result = reportQuerySchema.parse(validInput);
      expect(result).toEqual(validInput);
    });

    test('should apply defaults for optional fields', () => {
      const minimalInput = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z'
      };

      const result = reportQuerySchema.parse(minimalInput);
      expect(result).toEqual({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        groupBy: 'day',
        page: 1,
        limit: 50,
        format: 'json'
      });
    });

    test('should coerce string numbers to integers for page and limit', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        page: '2',
        limit: '25'
      };

      const result = reportQuerySchema.parse(input);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
    });

    test('should accept CSV format', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        format: 'csv'
      };

      const result = reportQuerySchema.parse(input);
      expect(result.format).toBe('csv');
    });
  });

  describe('Invalid inputs - Requirement 19: Error Handling and Validation', () => {
    test('Req 19.1: should return "dateFrom is required" when dateFrom is missing', () => {
      const input = {
        dateTo: '2024-01-31T23:59:59.999Z'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('dateFrom is required');
      }
    });

    test('Req 19.2: should return "dateTo is required" when dateTo is missing', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('dateTo is required');
      }
    });

    test('should reject invalid ISO 8601 date format for dateFrom', () => {
      const input = {
        dateFrom: '2024-01-01',  // Not ISO datetime
        dateTo: '2024-01-31T23:59:59.999Z'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('dateFrom must be ISO 8601 format');
      }
    });

    test('should reject invalid ISO 8601 date format for dateTo', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31'  // Not ISO datetime
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('dateTo must be ISO 8601 format');
      }
    });

    test('Req 19.3: should return "dateFrom must be before dateTo" when dateFrom is after dateTo', () => {
      const input = {
        dateFrom: '2024-01-31T23:59:59.999Z',
        dateTo: '2024-01-01T00:00:00.000Z'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('dateFrom must be before dateTo');
      }
    });

    test('should reject invalid ObjectId for branchId', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        branchId: 'invalid-id'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('Invalid branch ID format');
      }
    });

    test('Req 19.6: should return "groupBy must be one of: day, week, month" when groupBy is invalid', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        groupBy: 'year'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('groupBy must be one of: day, week, month');
      }
    });

    test('should reject page less than 1', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        page: 0
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('page must be at least 1');
      }
    });

    test('should reject limit greater than 100', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        limit: 101
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('limit cannot exceed 100');
      }
    });

    test('Req 19.7: should return "format must be one of: json, csv, xlsx, pdf" when format is invalid', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        format: 'xml'
      };

      try {
        reportQuerySchema.parse(input);
        fail('Expected validation error');
      } catch (error) {
        expect(error.errors[0].message).toBe('format must be one of: json, csv, xlsx, pdf');
      }
    });
  });

  describe('Edge cases', () => {
    test('should handle same dateFrom and dateTo (boundary case)', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-01T00:00:00.000Z'
      };

      // This should fail because dateFrom must be BEFORE dateTo
      expect(() => reportQuerySchema.parse(input)).toThrow('dateFrom must be before dateTo');
    });

    test('should handle very small time difference', () => {
      const input = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-01T00:00:01.000Z'  // 1 second later
      };

      const result = reportQuerySchema.parse(input);
      expect(result.dateFrom).toBe('2024-01-01T00:00:00.000Z');
      expect(result.dateTo).toBe('2024-01-01T00:00:01.000Z');
    });
  });
});