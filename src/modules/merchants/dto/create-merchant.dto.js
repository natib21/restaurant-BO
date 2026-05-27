const { z } = require('zod');

const createMerchantSchema = z.object({
  body: z.object({
    businessName: z.string({ required_error: 'Business name is required' }).min(2).max(100),
    slug: z.string({ required_error: 'Slug is required' }).regex(/^[a-z0-9-]+$/i, 'Slug can only contain letters, numbers, and hyphens'),
    owner: z.object({
      fullName: z.string({ required_error: 'Owner full name is required' }),
      email: z.string({ required_error: 'Owner email is required' }).email(),
      phone: z.string({ required_error: 'Owner phone is required' }).regex(/^\+?251[79]\d{8}$/, 'Invalid Ethiopian phone number'),
      gender: z.enum(['Male', 'Female']),
    }).optional(), // making it optional because the old validator checked 'ownerName' which might have been a flat structure earlier
    ownerName: z.string().optional(), // Fallback for legacy
    phone: z.string().regex(/^\+?251[79]\d{8}$/, 'Invalid Ethiopian phone number').optional(),
    taxId: z.string().optional(),
    tinId: z.string().length(10, 'TIN number must be exactly 10 digits').optional(),
    location: z.object({
      address: z.string().optional(),
      city: z.string().optional(),
      coordinates: z.tuple([z.number(), z.number()]).optional(),
    }).optional(),
    sector: z.enum(['Cafe', 'Restaurant', 'Hotel', 'Food Truck', 'Ghost Kitchen', 'Bakery', 'Other']).optional(),
  }).passthrough() // allow other fields for now to avoid breaking existing clients
});

module.exports = {
  createMerchantSchema
};
