const { z } = require('zod');

const CATEGORY_VALUES = [
  'food_quality',
  'service',
  'cleanliness',
  'ambiance',
  'delivery_time',
  'value_for_money',
  'other',
];

const CHANNEL_VALUES = ['app', 'qr_table', 'telegram', 'facebook', 'google', 'walk_in', 'other'];

const STATUS_VALUES = ['pending', 'reviewed', 'responded', 'resolved', 'flagged'];

exports.createFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  categories: z.array(z.enum(CATEGORY_VALUES)).optional(),
  channel: z.enum(CHANNEL_VALUES).optional().default('app'),
  order: z.string().trim().optional(),
  images: z.array(z.string().trim().max(1000)).optional(),
  isPublic: z.boolean().optional(),
});

exports.updateFeedbackResponseSchema = z
  .object({
    status: z.enum(STATUS_VALUES).optional(),
    responseText: z.string().trim().max(1000).optional(),
    isPublic: z.boolean().optional(),
    flaggedReason: z.string().trim().max(500).optional(),
  })
  .refine(
    value =>
      value.status !== undefined ||
      value.responseText !== undefined ||
      value.isPublic !== undefined ||
      value.flaggedReason !== undefined,
    {
      message: 'At least one response field must be provided',
    }
  );

exports.feedbackQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  branchId: z.string().trim().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
