const { OrderService } = require('../src/modules/order/service/OrderService');
const MenuItem = require('../models/menuModel');
const Ingredient = require('../models/Ingredient');

describe('OrderService - COGS Calculation', () => {
  describe('calculateMenuItemCost', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('returns null when menu item has no recipe', async () => {
      const menuItem = {
        _id: 'menu-1',
        name: 'Simple Beverage',
        recipe: null,
      };

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      expect(unitCost).toBeNull();
    });

    test('returns null when menu item recipe has empty ingredients array', async () => {
      const menuItem = {
        _id: 'menu-2',
        name: 'Empty Recipe Item',
        recipe: {
          ingredients: [],
        },
      };

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      expect(unitCost).toBeNull();
    });

    test('calculates COGS correctly for single ingredient', async () => {
      const menuItem = {
        _id: 'menu-3',
        name: 'Simple Dish',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.5, // 0.5 kg
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 10.0, // $10 per kg
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      
      expect(unitCost).toBe(5.0); // 0.5 kg × $10/kg = $5
      expect(Ingredient.find).toHaveBeenCalledWith({
        _id: { $in: ['ing-1'] },
        isActive: true,
      });
    });

    test('calculates COGS correctly for multiple ingredients', async () => {
      const menuItem = {
        _id: 'menu-4',
        name: 'Complex Dish',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.3, // 0.3 kg
              unit: 'kg',
            },
            {
              ingredient: 'ing-2',
              quantity: 0.2, // 0.2 kg
              unit: 'kg',
            },
            {
              ingredient: 'ing-3',
              quantity: 100, // 100 ml
              unit: 'ml',
            },
          ],
        },
      };

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 20.0, // $20 per kg
          },
          {
            _id: 'ing-2',
            costPerUnit: 15.0, // $15 per kg
          },
          {
            _id: 'ing-3',
            costPerUnit: 0.05, // $0.05 per ml
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      
      // 0.3 kg × $20 = $6
      // 0.2 kg × $15 = $3
      // 100 ml × $0.05 = $5
      // Total = $14
      expect(unitCost).toBe(14.0);
    });

    test('returns null when any ingredient is missing costPerUnit', async () => {
      const menuItem = {
        _id: 'menu-5',
        name: 'Dish with Missing Cost',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.5,
              unit: 'kg',
            },
            {
              ingredient: 'ing-2',
              quantity: 0.3,
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 10.0,
          },
          {
            _id: 'ing-2',
            costPerUnit: null, // Missing cost
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      expect(unitCost).toBeNull();
    });

    test('returns null when ingredient is not found in database', async () => {
      const menuItem = {
        _id: 'menu-6',
        name: 'Dish with Missing Ingredient',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.5,
              unit: 'kg',
            },
            {
              ingredient: 'ing-2',
              quantity: 0.3,
              unit: 'kg',
            },
          ],
        },
      };

      // Only one ingredient returned (ing-2 is missing)
      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 10.0,
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      expect(unitCost).toBeNull();
    });

    test('returns null and logs error when database query fails', async () => {
      const menuItem = {
        _id: 'menu-7',
        name: 'Dish with DB Error',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.5,
              unit: 'kg',
            },
          ],
        },
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValueOnce(new Error('Database connection failed')),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      
      expect(unitCost).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error calculating menu item cost:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

    test('handles zero cost ingredients correctly', async () => {
      const menuItem = {
        _id: 'menu-8',
        name: 'Dish with Free Ingredient',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.5,
              unit: 'kg',
            },
            {
              ingredient: 'ing-2',
              quantity: 0.3,
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 10.0,
          },
          {
            _id: 'ing-2',
            costPerUnit: 0, // Free ingredient
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      
      // 0.5 kg × $10 = $5
      // 0.3 kg × $0 = $0
      // Total = $5
      expect(unitCost).toBe(5.0);
    });

    test('handles very small fractional quantities correctly', async () => {
      const menuItem = {
        _id: 'menu-9',
        name: 'Dish with Small Quantities',
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.001, // 1 gram
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 1000.0, // Expensive ingredient
          },
        ]),
      });

      const unitCost = await OrderService.calculateMenuItemCost(menuItem);
      
      // 0.001 kg × $1000 = $1
      expect(unitCost).toBe(1.0);
    });
  });

  describe('buildOrderItems - COGS Integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('includes unitCost in order items when recipe exists', async () => {
      const items = [
        {
          menuItemId: 'menu-1',
          quantity: 2,
        },
      ];

      const mockMenuItem = {
        _id: 'menu-1',
        name: 'Burger',
        price: 15.0,
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.2,
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(MenuItem, 'findOne').mockResolvedValueOnce(mockMenuItem);
      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 10.0,
          },
        ]),
      });

      // Mock MenuService methods
      const MenuService = require('../src/modules/menu');
      jest.spyOn(MenuService.MenuService, 'buildOrderableMenuFilter').mockReturnValue({});
      jest.spyOn(MenuService.MenuService, 'assertMenuItemOrderable').mockImplementation();

      const result = await OrderService.buildOrderItems(items, 'merchant-1');

      expect(result.orderItems).toHaveLength(1);
      expect(result.orderItems[0]).toMatchObject({
        menuItem: 'menu-1',
        name: 'Burger',
        quantity: 2,
        unitPrice: 15.0,
        totalPrice: 30.0,
      });
      // Verify unitCost is calculated and present
      expect(result.orderItems[0].unitCost).toBe(2.0); // 0.2 kg × $10 = $2
      expect(result.subtotal).toBe(30.0);
    });

    test('sets unitCost to null when menu item has no recipe', async () => {
      const items = [
        {
          menuItemId: 'menu-2',
          quantity: 1,
        },
      ];

      const mockMenuItem = {
        _id: 'menu-2',
        name: 'Simple Drink',
        price: 5.0,
        recipe: null,
      };

      jest.spyOn(MenuItem, 'findOne').mockResolvedValueOnce(mockMenuItem);

      // Mock MenuService methods
      const MenuService = require('../src/modules/menu');
      jest.spyOn(MenuService.MenuService, 'buildOrderableMenuFilter').mockReturnValue({});
      jest.spyOn(MenuService.MenuService, 'assertMenuItemOrderable').mockImplementation();

      const result = await OrderService.buildOrderItems(items, 'merchant-1');

      expect(result.orderItems).toHaveLength(1);
      expect(result.orderItems[0]).toMatchObject({
        menuItem: 'menu-2',
        name: 'Simple Drink',
        quantity: 1,
        unitPrice: 5.0,
        totalPrice: 5.0,
      });
      // Verify unitCost is null (no recipe)
      expect(result.orderItems[0].unitCost).toBeNull();
    });

    test('handles mixed items with and without recipes', async () => {
      const items = [
        {
          menuItemId: 'menu-1',
          quantity: 1,
        },
        {
          menuItemId: 'menu-2',
          quantity: 2,
        },
      ];

      const mockMenuItem1 = {
        _id: 'menu-1',
        name: 'Pasta',
        price: 12.0,
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.3,
              unit: 'kg',
            },
          ],
        },
      };

      const mockMenuItem2 = {
        _id: 'menu-2',
        name: 'Water',
        price: 2.0,
        recipe: null,
      };

      jest.spyOn(MenuItem, 'findOne')
        .mockResolvedValueOnce(mockMenuItem1)
        .mockResolvedValueOnce(mockMenuItem2);

      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValueOnce([
          {
            _id: 'ing-1',
            costPerUnit: 8.0,
          },
        ]),
      });

      // Mock MenuService methods
      const MenuService = require('../src/modules/menu');
      jest.spyOn(MenuService.MenuService, 'buildOrderableMenuFilter').mockReturnValue({});
      jest.spyOn(MenuService.MenuService, 'assertMenuItemOrderable').mockImplementation();

      const result = await OrderService.buildOrderItems(items, 'merchant-1');

      expect(result.orderItems).toHaveLength(2);
      
      // First item with recipe
      expect(result.orderItems[0].menuItem).toBe('menu-1');
      expect(result.orderItems[0].quantity).toBe(1);
      expect(result.orderItems[0].unitCost).toBe(2.4); // 0.3 kg × $8 = $2.4
      
      // Second item without recipe
      expect(result.orderItems[1].menuItem).toBe('menu-2');
      expect(result.orderItems[1].quantity).toBe(2);
      expect(result.orderItems[1].unitCost).toBeNull();

      expect(result.subtotal).toBe(16.0); // $12 + $4
    });

    test('continues with null unitCost when COGS calculation fails', async () => {
      const items = [
        {
          menuItemId: 'menu-1',
          quantity: 1,
        },
      ];

      const mockMenuItem = {
        _id: 'menu-1',
        name: 'Salad',
        price: 10.0,
        recipe: {
          ingredients: [
            {
              ingredient: 'ing-1',
              quantity: 0.2,
              unit: 'kg',
            },
          ],
        },
      };

      jest.spyOn(MenuItem, 'findOne').mockResolvedValueOnce(mockMenuItem);
      jest.spyOn(Ingredient, 'find').mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValueOnce(new Error('DB Error')),
      });

      // Mock console.error to suppress error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock MenuService methods
      const MenuService = require('../src/modules/menu');
      jest.spyOn(MenuService.MenuService, 'buildOrderableMenuFilter').mockReturnValue({});
      jest.spyOn(MenuService.MenuService, 'assertMenuItemOrderable').mockImplementation();

      const result = await OrderService.buildOrderItems(items, 'merchant-1');

      expect(result.orderItems).toHaveLength(1);
      expect(result.orderItems[0]).toMatchObject({
        menuItem: 'menu-1',
        quantity: 1,
        totalPrice: 10.0,
      });
      // Verify unitCost is null due to error
      expect(result.orderItems[0].unitCost).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });
});
