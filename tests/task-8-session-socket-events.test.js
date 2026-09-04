/**
 * Task 8: Socket.IO Events for Session Lifecycle
 * 
 * Tests that SessionService emits real-time events when:
 * 1. A new dining session is created (session:created)
 * 2. A dining session is ended (session:ended)
 * 
 * Events are emitted to branch staff with ORDER_VIEW and ORDER_MANAGE permissions
 */

const mongoose = require('mongoose');

// Mock Socket.IO BEFORE importing SessionService
const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn()
};

jest.mock('../src/infrastructure/websocket/socket-server', () => ({
  getIo: () => mockIo
}));

// Now import SessionService (after mock is set up)
const { SessionService } = require('../src/modules/sessions/service/SessionService');
const DiningSession = require('../models/DiningSession');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Order = require('../models/orderModel');

describe('Task 8: Session Socket.IO Events', () => {
  let merchant, branch, table, staffUser;
  
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test-sessions-sockets', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });
  
  afterAll(async () => {
    await mongoose.connection.close();
  });
  
  beforeEach(async () => {
    // Clear collections
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await Order.deleteMany({});
    
    // Clear mock calls
    mockIo.to.mockClear();
    mockIo.emit.mockClear();
    
    // Create test data
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant',
      email: 'test@restaurant.com',
      phone: '+251911000000',
      address: { city: 'Addis Ababa', country: 'Ethiopia' },
      businessType: 'restaurant',
      supportedPaymentMethods: ['cash']
    });
    
    branch = await Branch.create({
      name: 'Main Branch',
      merchant: merchant._id,
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.0192],
        city: 'Addis Ababa'
      },
      address: { city: 'Addis Ababa', country: 'Ethiopia' },
      phone: '+251911000001',
      isActive: true
    });
    
    table = await Table.create({
      tableNumber: 'T-101',
      capacity: 4,
      section: 'Main Hall',
      merchant: merchant._id,
      branch: branch._id,
      qrCode: 'QR-T101',
      status: 'available',
      isActive: true
    });
    
    staffUser = { _id: new mongoose.Types.ObjectId() }; // Mock staff user
  });
  
  describe('session:created event', () => {
    test('should emit session:created when QR customer creates session', async () => {
      // Act: Create session via QR flow (no createdBy)
      const result = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Assert: Session created
      expect(result.isNew).toBe(true);
      expect(result.session).toBeDefined();
      
      // Assert: Socket.IO called
      expect(mockIo.to).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalled();
      
      // Find session:created event
      const sessionCreatedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:created'
      );
      
      expect(sessionCreatedCalls.length).toBeGreaterThan(0);
      
      const eventData = sessionCreatedCalls[0][1];
      expect(eventData).toMatchObject({
        sessionId: result.session._id.toString(),
        tableId: table._id.toString(),
        tableNumber: 'T-101',
        branchId: branch._id.toString(),
        source: 'qr',
        createdBy: null
      });
      expect(eventData.startedAt).toBeDefined();
      
      // Assert: Emitted to correct rooms
      const toCalls = mockIo.to.mock.calls.map(call => call[0]);
      expect(toCalls).toContain(`branch:${branch._id}:perm:ORDER_VIEW`);
      expect(toCalls).toContain(`branch:${branch._id}:perm:ORDER_MANAGE`);
    });
    
    test('should emit session:created when staff creates session', async () => {
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
      
      // Act: Create session via staff flow
      const result = await SessionService.getOrCreateActiveSession({
        tableId: table._id,
        createdBy: staffUser._id
      });
      
      // Assert: Session created
      expect(result.isNew).toBe(true);
      
      // Find session:created event
      const sessionCreatedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:created'
      );
      
      expect(sessionCreatedCalls.length).toBeGreaterThan(0);
      
      const eventData = sessionCreatedCalls[0][1];
      expect(eventData).toMatchObject({
        sessionId: result.session._id.toString(),
        tableId: table._id.toString(),
        tableNumber: 'T-101',
        branchId: branch._id.toString(),
        source: 'staff',
        createdBy: staffUser._id.toString()
      });
    });
    
    test('should NOT emit session:created when reusing existing session', async () => {
      // Arrange: Create initial session
      await SessionService.getOrCreateActiveSession({ tableId: table._id });
      
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
      
      // Act: Reuse session (second customer scans same QR)
      const result = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Assert: Session reused (not created)
      expect(result.isNew).toBe(false);
      
      // Assert: No session:created event emitted
      const sessionCreatedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:created'
      );
      
      expect(sessionCreatedCalls.length).toBe(0);
    });
  });
  
  describe('session:ended event', () => {
    test('should emit session:ended when table is closed', async () => {
      // Arrange: Create session and place order
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Create a paid order
      const order = await Order.create({
        orderNumber: 'ORD-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Test Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
      
      // Act: End session
      const endedSession = await SessionService.endSession({
        sessionId: session._id,
        closedBy: staffUser._id,
        force: false
      });
      
      // Assert: Session ended
      expect(endedSession.status).toBe('ended');
      expect(endedSession.endedAt).toBeDefined();
      
      // Assert: Socket.IO called
      expect(mockIo.to).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalled();
      
      // Find session:ended event
      const sessionEndedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:ended'
      );
      
      expect(sessionEndedCalls.length).toBeGreaterThan(0);
      
      const eventData = sessionEndedCalls[0][1];
      expect(eventData).toMatchObject({
        sessionId: session._id.toString(),
        tableId: table._id.toString(),
        branchId: branch._id.toString(),
        closedBy: staffUser._id.toString(),
        forced: false
      });
      expect(eventData.endedAt).toBeDefined();
      expect(eventData.duration).toBeDefined();
      expect(eventData.summary).toMatchObject({
        orderCount: 1,
        totalAmount: 100,
        paidOrders: 1,
        unpaidOrders: 0
      });
      
      // Assert: Emitted to correct rooms
      const toCalls = mockIo.to.mock.calls.map(call => call[0]);
      expect(toCalls).toContain(`branch:${branch._id}:perm:ORDER_VIEW`);
      expect(toCalls).toContain(`branch:${branch._id}:perm:ORDER_MANAGE`);
    });
    
    test('should include forced flag in session:ended event', async () => {
      // Arrange: Create session with unpaid order
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      await Order.create({
        orderNumber: 'ORD-002',
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Test Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
      
      // Act: Force close session despite unpaid order
      await SessionService.endSession({
        sessionId: session._id,
        closedBy: staffUser._id,
        force: true
      });
      
      // Find session:ended event
      const sessionEndedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:ended'
      );
      
      const eventData = sessionEndedCalls[0][1];
      expect(eventData.forced).toBe(true);
      expect(eventData.summary.unpaidOrders).toBe(1);
    });
    
    test('should emit session:ended with multiple orders summary', async () => {
      // Arrange: Create session with multiple orders
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Create 3 paid orders
      await Order.create([
        {
          orderNumber: 'ORD-003',
          merchant: merchant._id,
          branch: branch._id,
          table: table._id,
          session: session._id,
          orderType: 'dine_in',
          source: 'qr',
          customerName: 'Customer A',
          items: [{ 
            menuItem: new mongoose.Types.ObjectId(), 
            name: 'Test Item',
            quantity: 1, 
            unitPrice: 50, 
            totalPrice: 50 
          }],
          subtotal: 50,
          totalAmount: 50,
          status: 'completed',
          paymentStatus: 'paid'
        },
        {
          orderNumber: 'ORD-004',
          merchant: merchant._id,
          branch: branch._id,
          table: table._id,
          session: session._id,
          orderType: 'dine_in',
          source: 'staff',
          customerName: 'Customer B',
          items: [{ 
            menuItem: new mongoose.Types.ObjectId(), 
            name: 'Test Item',
            quantity: 2, 
            unitPrice: 50, 
            totalPrice: 100 
          }],
          subtotal: 100,
          totalAmount: 100,
          status: 'completed',
          paymentStatus: 'paid'
        },
        {
          orderNumber: 'ORD-005',
          merchant: merchant._id,
          branch: branch._id,
          table: table._id,
          session: session._id,
          orderType: 'dine_in',
          source: 'qr',
          customerName: 'Customer C',
          items: [{ 
            menuItem: new mongoose.Types.ObjectId(), 
            name: 'Test Item',
            quantity: 3, 
            unitPrice: 50, 
            totalPrice: 150 
          }],
          subtotal: 150,
          totalAmount: 150,
          status: 'completed',
          paymentStatus: 'paid'
        }
      ]);
      
      mockIo.to.mockClear();
      mockIo.emit.mockClear();
      
      // Act: End session
      await SessionService.endSession({
        sessionId: session._id,
        closedBy: staffUser._id,
        force: false
      });
      
      // Find session:ended event
      const sessionEndedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'session:ended'
      );
      
      const eventData = sessionEndedCalls[0][1];
      expect(eventData.summary).toMatchObject({
        orderCount: 3,
        totalAmount: 300, // 50 + 100 + 150
        paidOrders: 3,
        unpaidOrders: 0
      });
    });
  });
  
  describe('Socket.IO emission resilience', () => {
    test('should not fail session creation if socket emission fails', async () => {
      // Arrange: Mock socket.io to throw error
      mockIo.emit.mockImplementationOnce(() => {
        throw new Error('Socket.IO not connected');
      });
      
      // Act: Create session
      const result = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Assert: Session still created successfully
      expect(result.isNew).toBe(true);
      expect(result.session).toBeDefined();
      
      // Verify session exists in database
      const dbSession = await DiningSession.findById(result.session._id);
      expect(dbSession).toBeDefined();
      expect(dbSession.status).toBe('active');
    });
    
    test('should not fail session ending if socket emission fails', async () => {
      // Arrange: Create session
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Mock socket.io to throw error
      mockIo.emit.mockImplementationOnce(() => {
        throw new Error('Socket.IO disconnected');
      });
      
      // Act: End session
      const endedSession = await SessionService.endSession({
        sessionId: session._id,
        closedBy: staffUser._id,
        force: false
      });
      
      // Assert: Session still ended successfully
      expect(endedSession.status).toBe('ended');
      expect(endedSession.endedAt).toBeDefined();
      
      // Verify session ended in database
      const dbSession = await DiningSession.findById(session._id);
      expect(dbSession.status).toBe('ended');
    });
  });
});
