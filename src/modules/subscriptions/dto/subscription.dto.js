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
 * Starts subscription payment process via Kispay
 * 
 * Body:
 * {
 *   "plan": "pro",
 *   "durationMonths": 3,
 *   "phone": "+251911223344"  // optional, uses merchant phone if not provided
 * }
 */
exports.initiateSubscriptionSchema = z.object({
  plan: z.enum(['basic', 'pro', 'enterprise']),
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
 * Webhook Payload Schema (Kispay)
 * 
 * Kispay sends this on payment events
 */
exports.kispayWebhookSchema = z.object({
  event: z.string().optional(),
  eventType: z.string().optional(),
  status: z.string(),
  txn_ref: z.string(),
  orderId: z.string().optional(),
  amount: z.number(),
  currency: z.string().optional(),
});

/**
 * DTO: Subscription Response
 * 
 * Format returned to client
 */
exports.subscriptionResponseDTO = {
  _id: z.string(),
  merchant: z.string(),
  plan: z.enum(['basic', 'pro', 'enterprise']),
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
  plan: z.enum(['basic', 'pro', 'enterprise']),
  status: z.enum(['pending', 'active', 'past_due', 'canceled', 'expired']),
  endDate: z.coerce.date(),
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
 * Plan Pricing Configuration (internal)
 */
exports.planPricingConfig = {
  basic: 1,    // 1 ETB per month
  pro: 1,
  enterprise: 1,
};

/**
 * Feature Access Matrix
 * 
 * Defines which features are available in each plan
 */
exports.featureAccessMatrix = {
  basic: {
    tables: 5,
    menus: 1,
    staff: 3,
    inventory: false,
    analytics: false,
    advancedReporting: false,
  },
  pro: {
    tables: 20,
    menus: 5,
    staff: 10,
    inventory: true,
    analytics: true,
    advancedReporting: false,
  },
  enterprise: {
    tables: 'unlimited',
    menus: 'unlimited',
    staff: 'unlimited',
    inventory: true,
    analytics: true,
    advancedReporting: true,
    dedicatedSupport: true,
    customIntegrations: true,
  },
};
