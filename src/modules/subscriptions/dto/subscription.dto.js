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
  phone: z.string().regex(/^\\+?[0-9]{1,15}$/).optional(),
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
exports.featureCatalog = {
  inventory: {
    pricePerMonth: 150,
    description: 'Inventory tracking, stock movement, and reorder management',
  },
  analytics: {
    pricePerMonth: 120,
    description: 'Business analytics, dashboards, and performance reporting',
  },
  advancedReporting: {
    pricePerMonth: 180,
    description: 'Custom reports, exports, and advanced insights',
  },
  dedicatedSupport: {
    pricePerMonth: 220,
    description: 'Priority support, onboarding, and account assistance',
  },
  customIntegrations: {
    pricePerMonth: 300,
    description: 'Custom API/webhook integrations and system connections',
  },
};

exports.trialFeatureSet = Object.keys(exports.featureCatalog);
exports.trialDurationMonths = 3;
