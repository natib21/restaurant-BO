/**
 * Test: CBEBirr PDF Receipt Download and Storage
 * 
 * Verifies that CBEBirr provider correctly:
 * 1. Detects PDF responses
 * 2. Validates PDF format
 * 3. Stores PDF as FileAsset
 * 4. Creates verification record with proper status
 */

const mongoose = require('mongoose');
const CBEBirrProvider = require('../src/modules/payment-verification/service/providers/CBEBirrProvider');
const PaymentVerificationService = require('../src/modules/payment-verification/service/PaymentVerificationService');
const FileAsset = require('../models/FileAsset');
const Order = require('../models/Order');
const User = require('../models/User');
const { PaymentVerificationRepository } = require('../repositories');

describe('CBEBirr PDF Receipt Handling', () => {
  let merchant;
  let user;
  let order;
  
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST);
    
    // Create test merchant
    const Merchant = require('../models/Merchant');
    merchant = await Merchant.create({
      name: 'PDF Test Restaurant',
      email: 'pdf-test@example.com',
      phone: '251911000000',
    });
    
    // Create test user
    user = await User.create({
      email: 'pdf-tester@example.com',
      name: 'PDF Tester',
      role: 'cashier',
      merchant: merchant._id,
    });
    
    // Create test order
    order = await Order.create({
      merchant: merchant._id,
      orderNumber: 'ORD-PDF-001',
      totalAmount: 250.00,
      paymentStatus: 'pending',
      paymentMethod: 'cbebirr',
      status: 'confirmed',
      items: [],
    });
  });
  
  afterAll(async () => {
    await FileAsset.deleteMany({ merchant: merchant._id });
    await Order.deleteMany({ merchant: merchant._id });
    await PaymentVerificationRepository.deleteMany({ merchant: merchant._id });
    await User.deleteMany({ merchant: merchant._id });
    const Merchant = require('../models/Merchant');
    await Merchant.deleteMany({ _id: merchant._id });
    await mongoose.disconnect();
  });
  
  describe('BaseProvider PDF Detection', () => {
    it('should detect PDF from Content-Type header', async () => {
      const mockPdfBuffer = Buffer.from('%PDF-1.6\n%âăĎÓ\nMock PDF content');
      
      const mockHttpClient = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name) => {
            if (name === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => mockPdfBuffer.buffer,
      });
      
      const provider = new CBEBirrProvider({ httpClient: mockHttpClient });
      
      const result = await provider.fetchReceipt('https://cbepay1.cbe.com.et/aureceipt?TID=TEST123&PH=251911000000');
      
      expect(result.isPdf).toBe(true);
      expect(result.contentType).toContain('application/pdf');
      expect(Buffer.isBuffer(result.content)).toBe(true);
      expect(result.content.toString('utf-8', 0, 5)).toBe('%PDF-');
    });
    
    it('should validate PDF magic bytes', async () => {
      const fakePdfBuffer = Buffer.from('<!DOCTYPE html><html>Not a PDF</html>');
      
      const mockHttpClient = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name) => {
            if (name === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => fakePdfBuffer.buffer,
      });
      
      const provider = new CBEBirrProvider({ httpClient: mockHttpClient });
      
      await expect(
        provider.fetchReceipt('https://cbepay1.cbe.com.et/aureceipt?TID=TEST123&PH=251911000000')
      ).rejects.toThrow('PDF magic bytes');
    });
    
    it('should handle HTML responses (non-PDF)', async () => {
      const htmlContent = '<html><body>HTML Response</body></html>';
      
      const mockHttpClient = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name) => {
            if (name === 'content-type') return 'text/html';
            return null;
          },
        },
        text: async () => htmlContent,
      });
      
      const provider = new CBEBirrProvider({ httpClient: mockHttpClient });
      
      const result = await provider.fetchReceipt('https://some-provider.com/receipt');
      
      expect(result.isPdf).toBe(false);
      expect(result.contentType).toContain('text/html');
      expect(result.content).toBe(htmlContent);
    });
  });
  
  describe('CBEBirrProvider.verify()', () => {
    it('should return PDF buffer and set manual review status', async () => {
      const mockPdfBuffer = Buffer.from('%PDF-1.6\n%âăĎÓ\nMock CBEBirr Receipt PDF');
      
      const mockHttpClient = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name) => {
            if (name === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => mockPdfBuffer.buffer,
      });
      
      const provider = new CBEBirrProvider({ httpClient: mockHttpClient });
      
      const result = await provider.verify(
        { tid: 'DHT71MPGDI7', phone: '251923479921' },
        { orderAmount: 250.00 }
      );
      
      expect(result.reference).toBe('DHT71MPGDI7');
      expect(result.pdfDownloaded).toBe(true);
      expect(Buffer.isBuffer(result.pdfBuffer)).toBe(true);
      expect(result.parseQuality).toBe('pdf_manual_review_required');
      expect(result.verificationType).toBe('manual_entry_pdf_downloaded');
      expect(result.parsed.currency).toBe('ETB');
      expect(result.parsed.amount).toBe(null);
      expect(result.amountMatch).toBe(false);
    });
    
    it('should reject invalid TID format', async () => {
      const provider = new CBEBirrProvider();
      
      await expect(
        provider.verify(
          { tid: 'INVALID!@#', phone: '251923479921' },
          { orderAmount: 250.00 }
        )
      ).rejects.toThrow('Invalid CBE Birr transaction ID format');
    });
    
    it('should reject invalid phone format', async () => {
      const provider = new CBEBirrProvider();
      
      await expect(
        provider.verify(
          { tid: 'DHT71MPGDI7', phone: '0923479921' }, // Missing 251 prefix
          { orderAmount: 250.00 }
        )
      ).rejects.toThrow('Invalid phone number format');
    });
    
    it('should handle fetch failures gracefully', async () => {
      const mockHttpClient = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      
      const provider = new CBEBirrProvider({ httpClient: mockHttpClient });
      
      const result = await provider.verify(
        { tid: 'DHT71MPGDI7', phone: '251923479921' },
        { orderAmount: 250.00 }
      );
      
      expect(result.parseQuality).toBe('failed');
      expect(result.verificationType).toBe('manual_entry_lookup_failed');
      expect(result.lookupError).toBeTruthy();
      expect(result.pdfDownloaded).toBe(false);
    });
  });
  
  describe('PaymentVerificationService Integration', () => {
    it('should store PDF as FileAsset during manual verification', async () => {
      const mockPdfBuffer = Buffer.from('%PDF-1.6\n%âăĎÓ\nMock Receipt PDF for Integration Test');
      
      // Mock the provider
      const mockProvider = {
        getName: () => 'cbebirr',
        validateTransactionId: () => true,
        validatePhoneNumber: () => true,
        verify: jest.fn().mockResolvedValue({
          reference: 'DHT71MPGDI7',
          pdfDownloaded: true,
          pdfBuffer: mockPdfBuffer,
          parseQuality: 'pdf_manual_review_required',
          verificationType: 'manual_entry_pdf_downloaded',
          parsed: {
            amount: null,
            currency: 'ETB',
            status: 'UNKNOWN',
            fullRawText: '[PDF Receipt]',
          },
          amountMatch: false,
          accountMatch: null,
          metadata: {
            phone: '251923479921',
            pdfSize: mockPdfBuffer.length,
          },
        }),
      };
      
      // Inject mock provider
      const originalResolve = require('../src/modules/payment-verification/service/provider-resolver');
      const resolveProvider = jest.spyOn(originalResolve, 'resolveProvider')
        .mockReturnValue(mockProvider);
      
      // Call service
      const verification = await PaymentVerificationService.initiateManualVerification({
        merchantId: merchant._id,
        orderId: order._id,
        provider: 'cbebirr',
        receiptNumber: 'DHT71MPGDI7|251923479921', // Simulated combined input
        userId: user._id,
      });
      
      // Verify verification record
      expect(verification.status).toBe('pending_review');
      expect(verification.parseQuality).toBe('pdf_manual_review_required');
      expect(verification.pdfDownloaded).toBe(true);
      expect(verification.receiptFileRef).toBeDefined();
      
      // Verify FileAsset was created
      const fileAsset = await FileAsset.findById(verification.receiptFileRef);
      expect(fileAsset).toBeDefined();
      expect(fileAsset.mimeType).toBe('application/pdf');
      expect(fileAsset.purpose).toBe('receipt');
      expect(fileAsset.entityType).toBe('order_payment');
      expect(fileAsset.entityId.toString()).toBe(order._id.toString());
      expect(fileAsset.metadata.provider).toBe('cbebirr');
      expect(fileAsset.metadata.autoDownloaded).toBe(true);
      
      // Cleanup
      resolveProvider.mockRestore();
    });
    
    it('should handle manual verification even if PDF storage fails', async () => {
      const mockProvider = {
        getName: () => 'cbebirr',
        validateTransactionId: () => true,
        validatePhoneNumber: () => true,
        verify: jest.fn().mockResolvedValue({
          reference: 'DHT71MPGDI8',
          pdfDownloaded: false,
          pdfError: 'Storage failure',
          parseQuality: 'pdf_manual_review_required',
          verificationType: 'manual_entry_pdf_downloaded',
          parsed: {
            amount: null,
            currency: 'ETB',
            status: 'UNKNOWN',
          },
          amountMatch: false,
        }),
      };
      
      const originalResolve = require('../src/modules/payment-verification/service/provider-resolver');
      const resolveProvider = jest.spyOn(originalResolve, 'resolveProvider')
        .mockReturnValue(mockProvider);
      
      const verification = await PaymentVerificationService.initiateManualVerification({
        merchantId: merchant._id,
        orderId: order._id,
        provider: 'cbebirr',
        receiptNumber: 'DHT71MPGDI8|251923479921',
        userId: user._id,
      });
      
      expect(verification.status).toBe('pending_review');
      expect(verification.pdfDownloaded).toBe(false);
      expect(verification.receiptFileRef).toBeNull();
      
      resolveProvider.mockRestore();
    });
  });
  
  describe('QR-based Verification', () => {
    it('should handle QR scan with PDF download', async () => {
      const mockPdfBuffer = Buffer.from('%PDF-1.6\nQR Scan Test PDF');
      
      const mockProvider = {
        getName: () => 'cbebirr',
        verifyWithPDF: jest.fn().mockResolvedValue({
          reference: 'DHT71MPGDI9',
          pdfDownloaded: true,
          pdfBuffer: mockPdfBuffer,
          parseQuality: 'pdf_manual_review_required',
          verificationType: 'qr_scan_pdf_downloaded',
          parsed: {
            amount: null,
            currency: 'ETB',
            status: 'UNKNOWN',
          },
          amountMatch: false,
        }),
      };
      
      const originalResolve = require('../src/modules/payment-verification/service/provider-resolver');
      const resolveProvider = jest.spyOn(originalResolve, 'resolveProvider')
        .mockReturnValue(mockProvider);
      
      const qrPayload = 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI9&PH=251923479921';
      
      const verification = await PaymentVerificationService.initiateVerificationFromQR({
        merchantId: merchant._id,
        orderId: order._id,
        qrPayload,
        userId: user._id,
      });
      
      expect(verification.status).toBe('pending_review');
      expect(verification.parseQuality).toBe('pdf_manual_review_required');
      expect(verification.receiptFileRef).toBeDefined();
      
      const fileAsset = await FileAsset.findById(verification.receiptFileRef);
      expect(fileAsset.mimeType).toBe('application/pdf');
      
      resolveProvider.mockRestore();
    });
  });
});
