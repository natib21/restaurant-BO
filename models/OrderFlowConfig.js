const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * OrderFlowConfig Model
 * 
 * Merchant-configurable order routing rules.
 * One document per merchant. Determines which orders require manual review
 * before being sent to the kitchen, based on order source.
 */

const channelConfigSchema = new Schema(
  {
    requiresReview: {
      type: Boolean,
      required: true,
    },
    reviewerRole: {
      type: String,
      enum: ['waiter', 'support', null],
      default: null,
    },
  },
  { _id: false }
);

const orderFlowConfigSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      unique: true,
      index: true,
    },
    channels: {
      waiter: {
        type: channelConfigSchema,
        default: () => ({
          requiresReview: false,
          reviewerRole: null,
        }),
      },
      web: {
        type: channelConfigSchema,
        default: () => ({
          requiresReview: true,
          reviewerRole: 'waiter',
        }),
      },
      admin: {
        type: channelConfigSchema,
        default: () => ({
          requiresReview: true,
          reviewerRole: 'support',
        }),
      },
      telegram: {
        type: channelConfigSchema,
        default: () => ({
          requiresReview: true,
          reviewerRole: 'support',
        }),
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Validate: if requiresReview is true, reviewerRole must not be null
orderFlowConfigSchema.pre('validate', function (next) {
  const channels = ['waiter', 'web', 'admin', 'telegram'];
  
  for (const channel of channels) {
    if (this.channels?.[channel]) {
      const config = this.channels[channel];
      
      if (config.requiresReview === true && config.reviewerRole === null) {
        return next(
          new Error(
            `Channel "${channel}": requiresReview is true but reviewerRole is null. ` +
            `Please specify a reviewerRole when requiresReview is true.`
          )
        );
      }
    }
  }
  
  next();
});

// Ensure unique index on merchant
orderFlowConfigSchema.index({ merchant: 1 }, { unique: true });

const OrderFlowConfig = mongoose.model('OrderFlowConfig', orderFlowConfigSchema);

module.exports = OrderFlowConfig;
