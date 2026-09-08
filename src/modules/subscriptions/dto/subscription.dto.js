/**
 * Subscriptions Module — Data Transfer Objects (DTOs) & Zod Schemas
 *
 * Validates:
 * - Subscription initialization (payment)
 * - Payment verification
 * - Webhook handlers
 * - Subscription queries
 */

const { z } = require('zod');

/**
 * Initiate Subscription Schema
 *
 * Starts feature-based subscription payment process via configured payment provider
 *
 * Body:
 * {
 *   "features": ["inventory", "analytics"],
 *   "durationMonths": 3,
 *   "phone": "+251911223344"  // optional, uses merchant phone if not provided
 * }
 */
exports.initiateSubscriptionSchema = z.object({
  features: z.array(z.string().min(1)).min(1),
  durationMonths: z.number().int().min(1).max(12).default(1),
  phone: z
    .string()
    .regex(/^\\+?[0-9]{1,15}$/)
    .optional(),
});

/**
 * Verify Subscription Schema
 *
 * Verify payment completion and activate subscription
 *
 * Body:
 * {
 *   "tx_ref": "tx-507f1f77bcf86cd799439011-1234567890"
 * }
 */
exports.verifySubscriptionSchema = z.object({
  tx_ref: z.string().min(5).max(100),
});

/**
 * DTO: Subscription Response
 *
 * Format returned to client
 */
exports.subscriptionResponseDTO = {
  _id: z.string(),
  merchant: z.string(),
  plan: z.string().optional(),
  features: z.array(z.string()).optional(),
  isTrial: z.boolean().optional(),
  trialStartDate: z.coerce.date().optional(),
  trialEndDate: z.coerce.date().optional(),
  status: z.enum(['pending', 'active', 'past_due', 'canceled', 'expired']),
  amount: z.number(),
  currency: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  verifiedAt: z.coerce.date().optional(),
  paymentProvider: z.string(),
  transactionReference: z.string(),
};

/**
 * DTO: Subscription Status Response
 */
exports.subscriptionStatusDTO = z.object({
  _id: z.string(),
  plan: z.string().optional(),
  features: z.array(z.string()).optional(),
  isTrial: z.boolean().optional(),
  status: z.enum(['pending', 'active', 'past_due', 'canceled', 'expired']),
  endDate: z.coerce.date().optional(),
  trialEndDate: z.coerce.date().optional(),
  isActive: z.boolean(),
  daysRemaining: z.number(),
});

/**
 * Get Subscription Status Query Schema
 */
exports.getSubscriptionStatusSchema = z.object({
  // No required params, just validates query string
});

/**
 * Feature Access Gate Query Schema
 *
 * Check if merchant has access to a feature
 */
exports.checkFeatureAccessSchema = z.object({
  feature: z.string().min(1).max(100),
});

/**
 * Feature Pricing Catalog
 *
 * Each feature is purchased à la carte.
 */
/**
 * Feature Pricing Catalog
 *
 * Keys MUST exactly match:
 * - Subscription.features enum (subscription.model.js)
 * - Merchant.features.optional (merchantModel.js)
 * - FEATURE_KEYS in the frontend (subscriptionQueries.ts)
 */
exports.featureCatalog = {
  orders: {
    pricePerMonth: 150,
    description: 'Order management — accept, track, and fulfill customer orders',
  },
  inventory: {
    pricePerMonth: 150,
    description: 'Inventory tracking, stock movement, and reorder management',
  },
  multiBranch: {
    pricePerMonth: 200,
    description: 'Manage multiple branches from a single account',
  },
  telegram: {
    pricePerMonth: 120,
    description: 'Telegram bot integration for orders and notifications',
  },
  sales: {
    pricePerMonth: 130,
    description: 'Sales tracking and point-of-sale reporting',
  },
  reports: {
    pricePerMonth: 120,
    description: 'Business analytics, dashboards, and performance reporting',
  },
  customerManagement: {
    pricePerMonth: 100,
    description: 'Customer profiles, loyalty, and order history',
  },
  deliveryManagement: {
    pricePerMonth: 150,
    description: 'Delivery dispatch and tracking',
  },
  paymentIntegration: {
    pricePerMonth: 180,
    description: 'Online payment gateway integration',
  },
  restaurantWebsite: {
    pricePerMonth: 200,
    description: 'Public-facing restaurant website / landing page',
  },
};

exports.trialFeatureSet = Object.keys(exports.featureCatalog);
exports.trialDurationMonths = 3;

// ============================================================
// Boot-time guard: featureCatalog must match Subscription.features enum
// ============================================================
(function assertCatalogMatchesSubscriptionEnum() {
  // Keep this list in sync with Subscription.features enum in the model —
  // there is intentionally no cross-file import here to avoid a require
  // cycle between the model and this dto file at boot time.
  const SUBSCRIPTION_FEATURE_ENUM = [
    'orders',
    'inventory',
    'multiBranch',
    'telegram',
    'sales',
    'reports',
    'customerManagement',
    'deliveryManagement',
    'paymentIntegration',
    'restaurantWebsite',
  ];

  const catalogKeys = Object.keys(exports.featureCatalog);
  const missingFromCatalog = SUBSCRIPTION_FEATURE_ENUM.filter(k => !catalogKeys.includes(k));
  const extraInCatalog = catalogKeys.filter(k => !SUBSCRIPTION_FEATURE_ENUM.includes(k));

  if (missingFromCatalog.length || extraInCatalog.length) {
    throw new Error(
      '[subscription.dto.js] featureCatalog has drifted from the Subscription model enum. ' +
        `Missing from catalog: [${missingFromCatalog.join(', ')}]. ` +
        `Not in enum: [${extraInCatalog.join(', ')}]. ` +
        'Fix featureCatalog (or the Subscription model enum) before starting the server.'
    );
  }
})();
