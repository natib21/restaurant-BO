// tests/TICKET-CREATION-FIX.test.js
// Verify tickets are created even when menu items don't have kitchen stations assigned

const mongoose = require('mongoose');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const Order = require('../models/orderModel');
const KitchenTicket = require('../models/KitchenTicket');
const KitchenStation = require('../models/KitchenStation');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Category = require('../models/Category');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');

describe('Ticket Creation Fix - Menu Items Without Kitchen Stations', () => {
  let merchant, branch, station, category, order;

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
    await MenuItem.deleteMany({});
    await KitchenStation.deleteMany({});
    await Category.deleteMany({});

    merchant = new mongoose.Types.ObjectId();
    branch = new mongoose.Types.ObjectId();

    // Create kitchen station
    station = await KitchenStation.create({
      merchant,
      branch,
      name: 'Main Kitchen',
      code: 'MAIN',
      displayOrder: 1,
      isActive: true,
    });

    // Create category
    category = await Category.create({
      merchant,
      branch,
      name: { en: 'Main Dishes', am: 'ዋና ምግብ' },
      isActive: true,
    });
  });

  describe('Scenario 1: Menu Item WITHOUT Kitchen Station Assigned', () => {
    it('should create ticket with fallback to default station', async () => {
      console.log('\n=== SCENARIO 1: Menu Item WITHOUT Kitchen Station ===');

      // Create menu item WITHOUT kitchenStation assigned (null)
      const burger = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Burger', am: 'ብርገር' },
        type: 'food',
        price: 100,
        kitchenStation: null,  // ← NO STATION ASSIGNED
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      console.log(`Menu item created: ${burger.name.en}`);
      console.log(`Kitchen station: ${burger.kitchenStation || 'NONE'}`);

      // Create order with this item
      order = await Order.create({
        merchant,
        branch,
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#NOSTATION-001',
        customerName: 'Test',
        status: 'preparing',
        table: new mongoose.Types.ObjectId(),  // Required field
        items: [
          {
            menuItem: burger._id,
            name: burger.name.en,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
        ],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      console.log(`Order created: ${order.orderNumber}`);

      // Create tickets (this should NOT skip the item)
      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      console.log(`\n✅ Tickets created: ${tickets.length}`);

      expect(tickets.length).toBeGreaterThan(0);
      expect(tickets[0].station.toString()).toBe(station._id.toString());
      expect(tickets[0].items[0].menuItemName).toBe('Burger');

      console.log(`✅ Ticket ${tickets[0].ticketNumber} assigned to default station`);
      console.log(`✅ Burger item included in ticket`);
    });
  });

  describe('Scenario 2: Multiple Menu Items WITHOUT Stations', () => {
    it('should group all unassigned items into one fallback ticket', async () => {
      console.log('\n=== SCENARIO 2: Multiple Items WITHOUT Kitchen Stations ===');

      // Create multiple menu items without stations
      const burger = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Burger', am: 'ብርገር' },
        type: 'food',
        price: 100,
        kitchenStation: null,
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      const steak = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Steak', am: 'ስቴክ' },
        type: 'food',
        price: 150,
        kitchenStation: null,
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      order = await Order.create({
        merchant,
        branch,
        orderType: 'dine_in',
        source: 'admin',
        orderNumber: '#MULTI-NOSTATION',
        customerName: 'Test',
        status: 'preparing',
        table: new mongoose.Types.ObjectId(),
        items: [
          {
            menuItem: burger._id,
            name: burger.name.en,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
          {
            menuItem: steak._id,
            name: steak.name.en,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
            status: 'pending',
            requiresKitchen: true,
          },
        ],
        subtotal: 250,
        totalAmount: 250,
        paymentStatus: 'unpaid',
      });

      console.log(`Order created with 2 items (both without stations)`);

      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      console.log(`\n✅ Tickets created: ${tickets.length}`);
      expect(tickets.length).toBe(1);  // Should be 1 fallback ticket

      const ticket = tickets[0];
      console.log(`✅ Ticket ${ticket.ticketNumber} contains both items:`);
      ticket.items.forEach(item => {
        console.log(`   - ${item.menuItemName} (qty: ${item.quantity})`);
      });

      expect(ticket.items).toHaveLength(2);
      expect(ticket.items.map(i => i.menuItemName)).toContain('Burger');
      expect(ticket.items.map(i => i.menuItemName)).toContain('Steak');
    });
  });

  describe('Scenario 3: Mixed - Some Items With Stations, Some Without', () => {
    it('should create separate tickets for assigned stations + fallback for unassigned', async () => {
      console.log('\n=== SCENARIO 3: Mixed Items (Some With Stations, Some Without) ===');

      // Create second station
      const fryerStation = await KitchenStation.create({
        merchant,
        branch,
        name: 'Fryer',
        code: 'FRYER',
        displayOrder: 2,
        isActive: true,
      });

      // Create items: one WITH station, one WITHOUT
      const fries = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Fries', am: 'ድንች' },
        type: 'food',
        price: 30,
        kitchenStation: fryerStation._id,  // ← HAS STATION
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      const burger = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Burger', am: 'ብርገር' },
        type: 'food',
        price: 100,
        kitchenStation: null,  // ← NO STATION
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      order = await Order.create({
        merchant,
        branch,
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#MIXED-001',
        customerName: 'Test',
        status: 'preparing',
        table: new mongoose.Types.ObjectId(),
        items: [
          {
            menuItem: fries._id,
            name: fries.name.en,
            quantity: 1,
            unitPrice: 30,
            totalPrice: 30,
            status: 'pending',
            requiresKitchen: true,
          },
          {
            menuItem: burger._id,
            name: burger.name.en,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
        ],
        subtotal: 130,
        totalAmount: 130,
        paymentStatus: 'unpaid',
      });

      console.log(`Order created:`);
      console.log(`  - Fries (assigned to Fryer station)`);
      console.log(`  - Burger (NO station assigned)`);

      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      console.log(`\n✅ Tickets created: ${tickets.length}`);
      expect(tickets.length).toBe(2);  // One for Fryer, one fallback

      // Find which is which
      const fryerTicket = tickets.find(t => t.station.equals(fryerStation._id));
      const fallbackTicket = tickets.find(t => t.station.equals(station._id));

      expect(fryerTicket).toBeDefined();
      expect(fallbackTicket).toBeDefined();

      console.log(`✅ Ticket 1 (Fryer): ${fryerTicket.ticketNumber}`);
      console.log(`   Items: ${fryerTicket.items.map(i => i.menuItemName).join(', ')}`);
      expect(fryerTicket.items[0].menuItemName).toBe('Fries');

      console.log(`✅ Ticket 2 (Main - Fallback): ${fallbackTicket.ticketNumber}`);
      console.log(`   Items: ${fallbackTicket.items.map(i => i.menuItemName).join(', ')}`);
      expect(fallbackTicket.items[0].menuItemName).toBe('Burger');
    });
  });

  describe('Scenario 4: Item With requiresKitchen=false', () => {
    it('should skip items that do not require kitchen', async () => {
      console.log('\n=== SCENARIO 4: Non-Kitchen Items (beverages) ===');

      // Create menu item that doesn't require kitchen (beverage)
      const coffee = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Coffee', am: 'ቡና' },
        type: 'drink',
        price: 50,
        kitchenStation: null,
        requiresKitchen: false,  // ← NO KITCHEN NEEDED
        available: true,
        isActive: true,
      });

      order = await Order.create({
        merchant,
        branch,
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#BEVERAGE-001',
        customerName: 'Test',
        status: 'preparing',
        table: new mongoose.Types.ObjectId(),
        items: [
          {
            menuItem: coffee._id,
            name: coffee.name.en,
            quantity: 1,
            unitPrice: 50,
            totalPrice: 50,
            status: 'pending',
            requiresKitchen: false,
          },
        ],
        subtotal: 50,
        totalAmount: 50,
        paymentStatus: 'unpaid',
      });

      console.log(`Order created with Coffee (requiresKitchen=false)`);

      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      console.log(`\n✅ Tickets created: ${tickets.length}`);
      expect(tickets.length).toBe(0);  // No tickets for non-kitchen items
      console.log(`✅ Correctly skipped non-kitchen item (no ticket needed)`);
    });
  });

  describe('Error Handling: No Kitchen Stations At All', () => {
    it('should throw error if no stations exist in branch', async () => {
      console.log('\n=== ERROR HANDLING: No Kitchen Stations ===');

      // Delete all stations
      await KitchenStation.deleteMany({ branch });

      const burger = await MenuItem.create({
        merchant,
        categoryId: category._id,
        name: { en: 'Burger', am: 'ብርገር' },
        type: 'food',
        price: 100,
        kitchenStation: null,
        requiresKitchen: true,
        available: true,
        isActive: true,
      });

      order = await Order.create({
        merchant,
        branch,
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#NOSTATION-ERR',
        customerName: 'Test',
        status: 'preparing',
        table: new mongoose.Types.ObjectId(),
        items: [
          {
            menuItem: burger._id,
            name: burger.name.en,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
        ],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      console.log(`Order created, but NO kitchen stations exist`);

      try {
        await KitchenTicketService.createTicketsForOrder(order._id);
        throw new Error('Should have thrown error');
      } catch (err) {
        console.log(`\n✅ Error thrown as expected:`);
        console.log(`   "${err.message}"`);
        expect(err.message).toContain('No kitchen stations found');
      }
    });
  });
});
