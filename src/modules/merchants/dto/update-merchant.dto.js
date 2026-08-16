const { z } = require('zod');

const updateMerchantSchema = z.object({
  body: z
    .object({
      businessName: z.string().min(2).max(100).optional(),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/i)
        .optional(),
      owner: z
        .object({
          fullName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z
            .string()
            .regex(/^\+?251[79]\d{8}$/)
            .optional(),
          gender: z.enum(['Male', 'Female']).optional(),
        })
        .optional(),
      location: z
        .object({
          address: z.string().optional(),
          city: z.string().optional(),
          coordinates: z.tuple([z.number(), z.number()]).optional(),
        })
        .optional(),
      sector: z
        .enum(['Cafe', 'Restaurant', 'Hotel', 'Food Truck', 'Ghost Kitchen', 'Bakery', 'Other'])
        .optional(),
      cuisineType: z.array(z.string()).optional(),
      brandColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/i)
        .optional(),
      settings: z.any().optional(),
      status: z.enum(['pending', 'approved', 'suspended', 'inactive']).optional(),
    })
    .passthrough(),
});

module.exports = {
  updateMerchantSchema,
};
