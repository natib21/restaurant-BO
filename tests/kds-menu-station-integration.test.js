/**
 * KDS Menu-Station Integration Tests
 * 
 * Tests the complete flow of menu items → kitchen stations → ticket creation
 */

const mongoose = require('mongoose');
const Order = require('../models/orderModel');
const Menu = require('../models/menuModel');
const KitchenStation = require('../models/KitchenStation');
const KitchenTicket = require('../models/KitchenTicket');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');

describe('KDS Menu-Station Integration', () => {
  let merchant, branch, mainStation, barStation;
  let burger, fries, salad, coke, water;

  beforeAll(async () => {
    // Create merchant and branch
    merchant = await Merchant.create({
      name: 'Test Restaurant',
      email: 'test@restaurant.com',
      phone: '1234567890',
    });

    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      address: '123 Test St',
      city: 'Test City',
    });

    // Create kitchen stations
    mainStation = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      code: 'MAIN',
      name: 'Main Kitchen',
      description: 'Main kitchen prep area',
      isActive: true,
      displayOrder: 1,
    });

    barStation = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      code: 'BAR',
      name: 'Bar Station',
      description: 'Drinks preparation',
      isActive: true,
      displayOrder: 2,
    });

    // Create menu items
    burger = await Menu.create({
      merchant: merchant._id,
      name: 'Cheeseburger',
      category: 'main-course',
      type: 'food',
      price: 10.99,
      kitchenStation: mainStation._id, // ← Assigned to MAIN
      available: true,
    });

    fries = await Menu.create({
      merchant: merchant._id,
      name: 'French Fries',
      category: 'sides',
      type: 'food',
      price: 3.99,
      kitchenStation: mainStation._id, // ← Assigned to MAIN
      available: true,
    });

    salad = await Menu.create({
      merchant: merchant._id,
      name: 'Caesar Salad',
      category: 'salads',
      type: 'food',
      price: 7.99,
      kitchenStation: mainStation._id, // ← Assigned to MAIN
      available: true,
    });

    coke = await Menu.create({
      merchant: merchant._id,
      name: 'Coke',
      category: 'drinks',
      type: 'drink',
      price: 2.99,
      kitchenStation: null, // ← No station (bottled drink)
      available: true,
    });

    water = await Menu.create({
      merchant: merchant._id,
      name: 'Bottled Water',
      category: 'drinks',
      type: 'drink',
      price: 1.99,
      kitchenStation: null, // ← No station
      available: true,
    });
  });

  afterAll(async () => {
    // Cleanup
    await Order.deleteMany({});
    await KitchenTicket.deleteMany({});
    await Menu.deleteMany({});
    await KitchenStation.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
  });

  afterEach(async () => {
    // Clean between tests
    await Order.deleteMany({});
    await KitchenTicket.deleteMany({});
  });

  // ============================================================================
  // TEST 1: Single Station - Kitchen Items Only
  // ============================================================================
  describe('Test 1: Single station with kitchen items', () => {
    it('should create 1 ticket with 3 items (burger, fries, salad), exclude Coke', async () => {
      // Create order
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-001',
        orderType: 'dine-in',
        status: 'preparing',
        items: [
          {
            menuItem: burger._id,
            name: 'Cheeseburger',
            price: 10.99,
            quantity: 1,
          },
          {
            menuItem: fries._id,
            name: 'French Fries',
            price: 3.99,
            quantity: 1,
          },
          {
            menuItem: salad._id,
            name: 'Caesar Salad',
            price: 7.99,
            quantity: 1,
          },
          {
            menuItem: coke._id,
            name: 'Coke',
            price: 2.99,
            quantity: 1,
          },
        ],
        subTotal: 25.96,
        total: 25.96,
      });

      // Create tickets
      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      // Assertions
      expect(tickets).toHaveLength(1);

      const ticket = tickets[0];
      expect(ticket.station.toString()).toBe(mainStation._id.toString());
      expect(ticket.items).toHaveLength(3); // burger, fries, salad
      expect(ticket.ticketNumber).toMatch(/MAIN-\d+/);
      expect(ticket.status).toBe('pending');

      // Verify item names
      const itemNames = ticket.items.map(item => item.menuItemName);
      expect(itemNames).toContain('Cheeseburger');
      expect(itemNames).toContain('French Fries');
      expect(itemNames).toContain('Caesar Salad');
      expect(itemNames).not.toContain('Coke'); // ← Excluded
    });
  });

  // ============================================================================
  // TEST 2: No Kitchen Items (All Drinks)
  // ============================================================================
  describe('Test 2: No kitchen items', () => {
    it('should create 0 tickets when order contains only drinks without stations', async () => {
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-002',
        orderType: 'dine-in',
        status: 'preparing',
        items: [
          {
            menuItem: coke._id,
            name: 'Coke',
            price: 2.99,
            quantity: 2,
          },
          {
            menuItem: water._id,
            name: 'Bottled Water',
            price: 1.99,
            quantity: 1,
          },
        ],
        subTotal: 7.97,
        total: 7.97,
      });

      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      expect(tickets).toHaveLength(0);
    });
  });

  // ============================================================================
  // TEST 3: Multiple Stations
  // ============================================================================
  describe('Test 3: Multiple stations', () => {
    let cocktail;

    beforeAll(async () => {
      // Create a menu item assigned to BAR station
      cocktail = await Menu.create({
        merchant: merchant._id,
        name: 'Mojito',
        category: 'cocktails',
        type: 'drink',
        price: 8.99,
        kitchenStation: barStation._id, // ← Assigned to BAR
        available: true,
      });
    });

    it('should create 2 tickets (MAIN and BAR)', async () => {
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-003',
        orderType: 'dine-in',
        status: 'preparing',
        items: [
          {
            menuItem: burger._id,
            name: 'Cheeseburger',
            price: 10.99,
            quantity: 1,
          },
          {
            menuItem: cocktail._id,
            name: 'Mojito',
            price: 8.99,
            quantity: 1,
          },
        ],
        subTotal: 19.98,
        total: 19.98,
      });

      const tickets = await KitchenTicketService.createTicketsForOrder(order._id);

      expect(tickets).toHaveLength(2);

      // Find MAIN ticket
      const mainTicket = tickets.find(t => t.station.toString() === mainStation._id.toString());
      expect(mainTicket).toBeDefined();
      expect(mainTicket.items).toHaveLength(1);
      expect(mainTicket.items[0].menuItemName).toBe('Cheeseburger');

      // Find BAR ticket
      const barTicket = tickets.find(t => t.station.toString() === barStation._id.toString());
      expect(barTicket).toBeDefined();
      expect(barTicket.items).toHaveLength(1);
      expect(barTicket.items[0].menuItemName).toBe('Mojito');
    });
  });

  // ============================================================================
  // TEST 4: Station Assignment Validation
  // ============================================================================
  describe('Test 4: Station assignment validation', () => {
    it('should reject invalid station assignment (different branch)', async () => {
      // Create another branch
      const otherBranch = await Branch.create({
        merchant: merchant._id,
        name: 'Other Branch',
        address: '456 Other St',
        city: 'Other City',
      });

      // Create station in other branch
      const otherStation = await KitchenStation.create({
        merchant: merchant._id,
        branch: otherBranch._id,
        code: 'OTHER',
        name: 'Other Station',
        isActive: true,
        displayOrder: 1,
      });

      // Try to assign menu item (in main branch) to station (in other branch)
      await expect(
        KitchenTicketService.assignMenuItemStation(
          burger._id,
          otherStation._id,
          merchant._id,
          branch._id // ← menu item's branch
        )
      ).rejects.toThrow('Kitchen station not found or does not belong to your branch');

      // Cleanup
      await KitchenStation.deleteOne({ _id: otherStation._id });
      await Branch.deleteOne({ _id: otherBranch._id });
    });

    it('should reject inactive station assignment', async () => {
      // Create inactive station
      const inactiveStation = await KitchenStation.create({
        merchant: merchant._id,
        branch: branch._id,
        code: 'INACTIVE',
        name: 'Inactive Station',
        isActive: false,
        displayOrder: 99,
      });

      await expect(
        KitchenTicketService.assignMenuItemStation(
          burger._id,
          inactiveStation._id,
          merchant._id,
          branch._id
        )
      ).rejects.toThrow('Cannot assign an inactive station to a menu item');

      // Cleanup
      await KitchenStation.deleteOne({ _id: inactiveStation._id });
    });

    it('should allow removing station assignment (set to null)', async () => {
      const result = await KitchenTicketService.assignMenuItemStation(
        burger._id,
        null,
        merchant._id,
        branch._id
      );

      expect(result.message).toBe('Kitchen station removed from menu item');
      expect(result.menuItem.kitchenStation).toBeNull();

      // Verify in database
      const updatedBurger = await Menu.findById(burger._id);
      expect(updatedBurger.kitchenStation).toBeNull();

      // Restore for other tests
      burger.kitchenStation = mainStation._id;
      await burger.save();
    });
  });

  // ============================================================================
  // TEST 5: Ticket Number Auto-Increment
  // ============================================================================
  describe('Test 5: Ticket number auto-increment', () => {
    it('should generate unique ticket numbers per station per day', async () => {
      // Create 3 orders
      const order1 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-004',
        orderType: 'dine-in',
        status: 'preparing',
        items: [{ menuItem: burger._id, name: 'Burger', price: 10.99, quantity: 1 }],
        subTotal: 10.99,
        total: 10.99,
      });

      const order2 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-005',
        orderType: 'dine-in',
        status: 'preparing',
        items: [{ menuItem: fries._id, name: 'Fries', price: 3.99, quantity: 1 }],
        subTotal: 3.99,
        total: 3.99,
      });

      const order3 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: 'ORD-TEST-006',
        orderType: 'dine-in',
        status: 'preparing',
        items: [{ menuItem: salad._id, name: 'Salad', price: 7.99, quantity: 1 }],
        subTotal: 7.99,
        total: 7.99,
      });

      const tickets1 = await KitchenTicketService.createTicketsForOrder(order1._id);
      const tickets2 = await KitchenTicketService.createTicketsForOrder(order2._id);
      const tickets3 = await KitchenTicketService.createTicketsForOrder(order3._id);

      // All should be MAIN station tickets
      expect(tickets1[0].ticketNumber).toMatch(/MAIN-\d+/);
      expect(tickets2[0].ticketNumber).toMatch(/MAIN-\d+/);
      expect(tickets3[0].ticketNumber).toMatch(/MAIN-\d+/);

      // Extract sequence numbers
      const seq1 = parseInt(tickets1[0].ticketNumber.split('-')[1]);
      const seq2 = parseInt(tickets2[0].ticketNumber.split('-')[1]);
      const seq3 = parseInt(tickets3[0].ticketNumber.split('-')[1]);

      // Should increment
      expect(seq2).toBe(seq1 + 1);
      expect(seq3).toBe(seq2 + 1);
    });
  });
});
