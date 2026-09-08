const { z } = require('zod');

/**
 * Valid channel names - MUST match Order.source enum exactly
 */
const VALID_CHANNELS = ['waiter', 'web', 'qr', 'admin', 'telegram'];

/**
 * Channel configuration schema
 */
const channelConfigSchema = z.object({
  requiresReview: z.boolean(),
  reviewerRole: z.enum(['waiter', 'support']).nullable(),
});

/**
 * Custom refinement to validate requiresReview + reviewerRole combination
 */
const channelConfigWithValidation = channelConfigSchema.refine(
  (data) => {
    // If requiresReview is true, reviewerRole must not be null
    if (data.requiresReview === true && data.reviewerRole === null) {
      return false;
    }
    return true;
  },
  {
    message: 'reviewerRole cannot be null when requiresReview is true',
  }
);

/**
 * PUT /api/v1/order-flow-config
 * Update channels configuration
 */
const updateOrderFlowConfigSchema = z
  .object({
    channels: z
      .record(channelConfigWithValidation)
      .refine(
        (channels) => {
          // All keys must be valid channel names
          const invalidKeys = Object.keys(channels).filter(
            (key) => !VALID_CHANNELS.includes(key)
          );
          return invalidKeys.length === 0;
        },
        (channels) => {
          const invalidKeys = Object.keys(channels).filter(
            (key) => !VALID_CHANNELS.includes(key)
          );
          return {
            message: `Invalid channel key(s): ${invalidKeys.join(', ')}. Valid channels are: ${VALID_CHANNELS.join(', ')}`,
          };
        }
      )
      .refine(
        (channels) => {
          // At least one channel must be provided
          return Object.keys(channels).length > 0;
        },
        {
          message: 'At least one channel configuration must be provided',
        }
      ),
  })
  .strict(); // Reject unknown top-level keys

module.exports = {
  updateOrderFlowConfigSchema,
  VALID_CHANNELS,
};
