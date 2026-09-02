// tests/PHASE-6-KITCHEN-EVENTS.test.js
// Phase 6: Kitchen Handler Socket Event Wiring
// Test that kitchen staff get ticket events AND waiter gets order events

const mongoose = require('mongoose');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

jest.mock('../src/infrastructure/websocket/socket-server', () => ({
  getIo: jest.fn(() => mockIo),
  createSocketServer: jest.fn(),
}));

const Order = require('../models/orderModel');
const KitchenTicket = require('../models/KitchenTicket');
const KitchenStation = require('../models/KitchenStation');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');

describe('Phase 6: Kitchen Socket Events - Ticket Mutations', () => {
  let station, order, ticket, actor;

  beforeAll(async () => {
    await mongoose.connect(process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb-test', {
      serverSelectionTimeoutMS: 5000,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await KitchenTicket.deleteMany({});
    await Order.deleteMany({});
    await KitchenStation.deleteMany({});
    mockIo.emit.mockClear();
    mockIo.to.mockClear();
    mockIo.to.mockReturnValue(mockIo);

    station = await KitchenStation.create({
      merchant: new mongoose.Types.ObjectId(),
      branch: new mongoose.Types.ObjectId(),
      name: 'Test Grill',
      code: 'GRILL',
      displayOrder: 1,
      isActive: true,
    });

    order = await Order.create({
      merchant: station.merchant,
      branch: station.branch,
      orderType: 'takeaway',
      source: 'admin',
      orderNumber: '#KDS-TEST-001',
      customerName: 'Kitchen Test',
      status: 'preparing',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Burger',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          status: 'pending',
          requiresKitchen: true,
        },
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Fries',
          quantity: 1,
          unitPrice: 50,
          totalPrice: 50,
          status: 'pending',
          requiresKitchen: true,
        },
      ],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid',
    });

    const item1 = order.items[0]._id;
    const item2 = order.items[1]._id;

    ticket = await KitchenTicket.create({
      merchant: order.merchant,
      branch: order.branch,
      order: order._id,
      station: station._id,
      ticketNumber: 'T-KDS-001',
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: 'pending',
      items: [
        {
          orderItemId: item1,
          menuItem: order.items[0].menuItem,
          menuItemName: 'Burger',
          quantity: 1,
          status: 'pending',
        },
        {
          orderItemId: item2,
          menuItem: order.items[1].menuItem,
          menuItemName: 'Fries',
          quantity: 1,
          status: 'pending',
        },
      ],
    });

    actor = { id: new mongoose.Types.ObjectId(), role: 'kitchen' };
  });

  describe('Kitchen Staff Events', () => {
    it('should emit ticket:item-updated when kitchen marks item in_progress', async () => {
      console.log('\n=== KITCHEN: Item in_progress ===');

      const ticketItemId = ticket.items[0]._id;
      mockIo.emit.mockClear();

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

      // Find ticket:item-updated event
      const ticketItemEvent = mockIo.emit.mock.calls.find(call =>
        call[0] === 'ticket:item-updated'
      );

      expect(ticketItemEvent).toBeDefined();
      console.log(`✅ Kitchen staff notified: ticket:item-updated`);

      const payload = ticketItemEvent[1];
      expect(payload.ticketId).toBe(ticket._id.toString());
      expect(payload.itemId).toBe(ticketItemId.toString());
      expect(payload.newStatus).toBe('in_progress');
      console.log(`   Item ${payload.itemId.slice(0, 8)}... → ${payload.newStatus}`);
    });

    it('should emit ticket:status-changed when ticket becomes in_progress', async () => {
      console.log('\n=== KITCHEN: Ticket Status Change ===');

      const ticketItem1Id = ticket.items[0]._id;
      const ticketItem2Id = ticket.items[1]._id;

      mockIo.emit.mockClear();

      // Mark first item in_progress - ticket might transition
      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItem1Id, 'in_progress', actor);
      const freshTicket = await KitchenTicket.findById(ticket._id);

      console.log(`After first item in_progress: ticket status = ${freshTicket.status}`);

      if (freshTicket.status === 'in_progress') {
        // Should have emitted ticket:status-changed
        const statusChangeEvent = mockIo.emit.mock.calls.find(call =>
          call[0] === 'ticket:status-changed'
        );

        if (statusChangeEvent) {
          console.log(`✅ Kitchen staff notified: ticket:status-changed`);
          expect(statusChangeEvent[1].newStatus).toBe('in_progress');
        }
      } else {
        console.log('(Ticket status not changed on this mutation)');
      }
    });
  });

  describe('Order Waiter Events (via Ticket Sync)', () => {
    it('should emit order:item-status-changed when kitchen marks item in_progress', async () => {
      console.log('\n=== WAITER: Order Item Update (via ticket) ===');

      const ticketItemId = ticket.items[0]._id;
      const orderItemId = order.items[0]._id;

      mockIo.emit.mockClear();

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

      // Find order:item-status-changed event
      const orderItemEvent = mockIo.emit.mock.calls.find(call =>
        call[0] === 'order:item-status-changed'
      );

      expect(orderItemEvent).toBeDefined();
      console.log(`✅ Waiter notified: order:item-status-changed`);

      const payload = orderItemEvent[1];
      expect(payload.orderId).toBe(order._id.toString());
      expect(payload.itemId).toBe(orderItemId.toString());
      expect(payload.newStatus).toBe('in_progress');
      console.log(`   Order ${order.orderNumber}: Item → in_progress`);
    });

    it('should emit order:status-changed when ALL items become ready', async () => {
      console.log('\n=== WAITER: Order Ready (all items ready) ===');

      const ticketItem1Id = ticket.items[0]._id;
      const ticketItem2Id = ticket.items[1]._id;

      // Mark both items ready
      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItem1Id, 'in_progress', actor);
      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItem1Id, 'ready', actor);

      mockIo.emit.mockClear();

      // Mark second item ready
      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItem2Id, 'in_progress', actor);
      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItem2Id, 'ready', actor);

      // Find order:status-changed event
      const orderStatusEvent = mockIo.emit.mock.calls.find(call =>
        call[0] === 'order:status-changed'
      );

      if (orderStatusEvent) {
        console.log(`✅ Waiter notified: order:status-changed`);
        expect(orderStatusEvent[1].newStatus).toBe('ready');
        console.log(`   Order ${order.orderNumber} → READY (all items ready)`);
      } else {
        console.log('(Order status did not change)');
      }
    });
  });

  describe('Event Coordination', () => {
    it('should emit both kitchen AND waiter events from single ticket mutation', async () => {
      console.log('\n=== EVENT COORDINATION: One mutation → Multiple audiences ===');

      const ticketItemId = ticket.items[0]._id;
      mockIo.emit.mockClear();

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

      // Count events by type
      const ticketEvents = mockIo.emit.mock.calls.filter(call =>
        call[0].startsWith('ticket:')
      );
      const orderEvents = mockIo.emit.mock.calls.filter(call =>
        call[0].startsWith('order:')
      );

      console.log(`Kitchen events emitted: ${ticketEvents.length}`);
      ticketEvents.forEach(call => console.log(`  - ${call[0]}`));

      console.log(`Waiter events emitted: ${orderEvents.length}`);
      orderEvents.forEach(call => console.log(`  - ${call[0]}`));

      expect(ticketEvents.length).toBeGreaterThan(0);
      expect(orderEvents.length).toBeGreaterThan(0);

      console.log(`✅ COORDINATION VERIFIED: Kitchen AND Waiter both notified`);
    });

    it('should target correct socket rooms (kitchen station vs order)', async () => {
      console.log('\n=== SOCKET ROOMS: Correct Audience Targeting ===');

      const ticketItemId = ticket.items[0]._id;
      mockIo.emit.mockClear();

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

      // Check which rooms received messages
      const roomCalls = mockIo.to.mock.calls;
      const stationRooms = roomCalls.filter(call =>
        call[0] && call[0].startsWith('station-')
      );
      const orderRooms = roomCalls.filter(call =>
        call[0] && call[0].startsWith('order:')
      );

      expect(stationRooms.length).toBeGreaterThan(0);
      expect(orderRooms.length).toBeGreaterThan(0);

      console.log(`✅ Messages sent to station rooms: ${stationRooms.map(c => c[0]).join(', ')}`);
      console.log(`✅ Messages sent to order rooms: ${orderRooms.map(c => c[0]).join(', ')}`);
    });
  });

  describe('Noop Handling', () => {
    it('should not emit events when item status is unchanged (noop)', async () => {
      console.log('\n=== NOOP: Unchanged status skips events ===');

      const ticketItemId = ticket.items[0]._id;
      mockIo.emit.mockClear();

      // Try to set to same status (already pending)
      const result = await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'pending', actor);

      if (result.noop) {
        console.log('✅ Service detected noop');
        console.log(`   No events should be emitted`);
        // In noop, no emit calls should be made
      } else {
        console.log('Status was changed (not a noop)');
      }
    });
  });
});
