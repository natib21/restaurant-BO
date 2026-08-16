const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const Customer = require('../../../../models/customerModule');
const Recipe = require('../../../../models/Recipe');
const Menu = require('../../../../models/menuModel');
const Ingredient = require('../../../../models/Ingredient');
const OrderIdempotency = require('../../../../models/OrderIdempotency');
const { createIssue, capIssues } = require('../integrity-report');
const { INTEGRITY_SAMPLE_LIMIT } = require('../integrity.constants');

function merchantFilter(merchantId) {
  return merchantId ? { merchant: new mongoose.Types.ObjectId(merchantId) } : {};
}

async function auditDataReferences({ merchantId } = {}) {
  const issues = [];
  const base = merchantFilter(merchantId);

  const ordersWithCustomer = await Order.find({
    ...base,
    customer: { $exists: true, $ne: null },
  })
    .select('_id orderNumber customer merchant branch')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const customerIds = [
    ...new Set(ordersWithCustomer.map(o => o.customer?.toString()).filter(Boolean)),
  ];
  const customers = await Customer.find({ _id: { $in: customerIds } })
    .select('_id merchant')
    .lean();
  const customerMap = new Map(customers.map(c => [c._id.toString(), c]));

  for (const order of ordersWithCustomer) {
    const cid = order.customer?.toString();
    const customer = customerMap.get(cid);
    if (!customer) {
      issues.push(
        createIssue({
          module: 'data',
          type: 'orphan_reference',
          severity: 'critical',
          entityId: order._id,
          message: `Order ${order.orderNumber} references missing customer ${cid}`,
          suggestion: 'Clear customer reference or restore customer record.',
          production_best_practice:
            'Soft-delete customers with retained id; block hard delete if orders exist.',
        })
      );
    } else if (merchantId && customer.merchant?.toString() !== order.merchant?.toString()) {
      issues.push(
        createIssue({
          module: 'data',
          type: 'mismatch',
          severity: 'critical',
          entityId: order._id,
          message: `Order ${order.orderNumber} customer belongs to different merchant`,
          suggestion: 'Fix tenant scoping on customer-order linkage.',
          production_best_practice:
            'Always scope queries with { merchant, branch }; never trust client-supplied merchant id alone.',
        })
      );
    }
  }

  const recipes = await Recipe.find(base)
    .select('_id menuItem merchant items')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const menuIds = [...new Set(recipes.map(r => r.menuItem?.toString()).filter(Boolean))];
  const menus = await Menu.find({ _id: { $in: menuIds } })
    .select('_id merchant')
    .lean();
  const menuMap = new Map(menus.map(m => [m._id.toString(), m]));

  for (const recipe of recipes) {
    const mid = recipe.menuItem?.toString();
    const menu = menuMap.get(mid);
    if (!menu) {
      issues.push(
        createIssue({
          module: 'data',
          type: 'orphan_reference',
          severity: 'critical',
          entityId: recipe._id,
          message: `Recipe references missing menu item ${mid}`,
          suggestion: 'Delete orphan recipe or restore menu item.',
          production_best_practice:
            'Cascade recipe archival when menu item is removed from published catalog.',
        })
      );
    }

    const ingredientIds = (recipe.items || []).map(i => i.ingredient?.toString()).filter(Boolean);
    if (ingredientIds.length > 0) {
      const count = await Ingredient.countDocuments({
        _id: { $in: ingredientIds },
        merchant: recipe.merchant,
      });
      if (count !== ingredientIds.length) {
        issues.push(
          createIssue({
            module: 'data',
            type: 'orphan_reference',
            severity: 'critical',
            entityId: recipe._id,
            message: 'Recipe contains ingredient reference(s) missing or wrong merchant',
            suggestion: 'Repair recipe BOM ingredient links.',
            production_best_practice:
              'Validate ingredient ids on recipe save inside same merchant transaction.',
          })
        );
      }
    }
  }

  const completedIdempotency = await OrderIdempotency.find({
    ...base,
    status: 'completed',
    order: { $exists: true, $ne: null },
  })
    .select('_id order idempotencyKey')
    .limit(100)
    .lean();

  for (const record of completedIdempotency) {
    const exists = await Order.exists({ _id: record.order, ...base });
    if (!exists) {
      issues.push(
        createIssue({
          module: 'data',
          type: 'orphan_reference',
          severity: 'warning',
          entityId: record._id,
          message: `Idempotency record points to missing order ${record.order}`,
          suggestion: 'TTL will expire record; safe to delete manually if needed.',
          production_best_practice:
            'Idempotency keys should reference order id only after commit; TTL retention 24h default.',
        })
      );
    }
  }

  return capIssues(issues);
}

module.exports = { auditDataReferences };
