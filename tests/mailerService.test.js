/**
 * Test suite for Mailer Service
 * 
 * Tests the order receipt email functionality
 */

// Mock nodemailer BEFORE requiring any modules
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

// Mock logger to suppress test output
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const { sendOrderReceipt, sendOrderStatusUpdate } = require('../utils/mailerService');

describe('Mailer Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup mock transport
    mockSendMail.mockResolvedValue({
      messageId: 'test-message-id',
      accepted: ['test@example.com'],
    });

    mockCreateTransport.mockReturnValue({
      sendMail: mockSendMail,
    });

    // Set required environment variables
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USERNAME = 'test@test.com';
    process.env.EMAIL_PASSWORD = 'testpassword';
    process.env.EMAIL_FROM = 'Test Sender <sender@test.com>';
  });

  describe('sendOrderReceipt', () => {
    it('should send order receipt email with valid order data', async () => {
      const customerEmail = 'customer@example.com';
      const orderData = {
        orderNumber: 'ORD-12345',
        items: [
          {
            name: 'Pizza Margherita',
            quantity: 2,
            unitPrice: 12.99,
            total: 25.98,
          },
          {
            name: 'Coca Cola',
            quantity: 1,
            unitPrice: 2.50,
            total: 2.50,
          },
        ],
        subtotal: 28.48,
        taxAmount: 2.28,
        discountAmount: 0,
        deliveryFee: 3.50,
        totalAmount: 34.26,
        paymentMethod: 'Credit Card',
        timestamp: new Date('2024-01-15T12:30:00Z'),
        customerName: 'John Doe',
        merchantName: 'Mesob Foods',
        branchName: 'Downtown Branch',
      };

      const result = await sendOrderReceipt(customerEmail, orderData);

      // Verify nodemailer was called
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: '587',
        auth: {
          user: 'test@test.com',
          pass: 'testpassword',
        },
      });

      // Verify sendMail was called with correct parameters
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailOptions = mockSendMail.mock.calls[0][0];

      expect(emailOptions.to).toBe(customerEmail);
      expect(emailOptions.subject).toBe('Order Confirmation - ORD-12345');
      expect(emailOptions.html).toContain('ORD-12345');
      expect(emailOptions.html).toContain('Pizza Margherita');
      expect(emailOptions.html).toContain('$34.26');
      expect(emailOptions.text).toContain('ORD-12345');
      expect(emailOptions.text).toContain('Pizza Margherita');

      // Verify result
      expect(result.messageId).toBe('test-message-id');
    });

    it('should throw error when customer email is missing', async () => {
      const orderData = {
        orderNumber: 'ORD-12345',
        items: [],
        totalAmount: 100,
      };

      await expect(sendOrderReceipt('', orderData)).rejects.toThrow(
        'Customer email is required'
      );

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should throw error when order number is missing', async () => {
      const customerEmail = 'customer@example.com';
      const orderData = {
        items: [],
        totalAmount: 100,
      };

      await expect(sendOrderReceipt(customerEmail, orderData)).rejects.toThrow(
        'Order data with orderNumber is required'
      );

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should handle order with no discount or delivery fee', async () => {
      const customerEmail = 'customer@example.com';
      const orderData = {
        orderNumber: 'ORD-67890',
        items: [
          {
            name: 'Burger',
            quantity: 1,
            unitPrice: 8.99,
            total: 8.99,
          },
        ],
        subtotal: 8.99,
        taxAmount: 0.72,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 9.71,
        paymentMethod: 'Cash',
        timestamp: new Date(),
      };

      await sendOrderReceipt(customerEmail, orderData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailOptions = mockSendMail.mock.calls[0][0];

      expect(emailOptions.to).toBe(customerEmail);
      expect(emailOptions.subject).toBe('Order Confirmation - ORD-67890');
    });

    it('should handle email sending failure', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const customerEmail = 'customer@example.com';
      const orderData = {
        orderNumber: 'ORD-12345',
        items: [],
        totalAmount: 100,
        paymentMethod: 'Credit Card',
        timestamp: new Date(),
      };

      await expect(sendOrderReceipt(customerEmail, orderData)).rejects.toThrow(
        'SMTP connection failed'
      );
    });
  });

  describe('sendOrderStatusUpdate', () => {
    it('should send order status update email', async () => {
      const customerEmail = 'customer@example.com';
      const statusData = {
        orderNumber: 'ORD-12345',
        status: 'Ready',
        message: 'Your order is ready for pickup!',
      };

      const result = await sendOrderStatusUpdate(customerEmail, statusData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailOptions = mockSendMail.mock.calls[0][0];

      expect(emailOptions.to).toBe(customerEmail);
      expect(emailOptions.subject).toBe('Order ORD-12345 - Status Update');
      expect(emailOptions.html).toContain('ORD-12345');
      expect(emailOptions.html).toContain('Ready');
      expect(emailOptions.html).toContain('Your order is ready for pickup!');
      expect(emailOptions.text).toContain('ORD-12345');
      expect(emailOptions.text).toContain('Ready');

      expect(result.messageId).toBe('test-message-id');
    });

    it('should throw error when customer email is missing', async () => {
      const statusData = {
        orderNumber: 'ORD-12345',
        status: 'Ready',
      };

      await expect(sendOrderStatusUpdate('', statusData)).rejects.toThrow(
        'Customer email and order data are required'
      );
    });

    it('should throw error when order number is missing', async () => {
      const customerEmail = 'customer@example.com';
      const statusData = {
        status: 'Ready',
      };

      await expect(sendOrderStatusUpdate(customerEmail, statusData)).rejects.toThrow(
        'Customer email and order data are required'
      );
    });
  });
});
