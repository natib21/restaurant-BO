const { z } = require('zod');

const paperSizeSchema = z.union([
  z.enum(['a4', 'a5', 'letter', 'legal', 'tabloid']),
  z.object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    label: z.string().optional(),
  }).passthrough(),
]);

const colorSchema = z.object({
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional(),
  border: z.string().optional(),
}).passthrough();

const fontSchema = z.object({
  family: z.string().optional(),
  size: z.number().optional(),
  weight: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const itemSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  category: z.string().optional(),
  isPopular: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
}).passthrough();

const categorySchema = z.object({
  name: z.string().optional(),
  items: z.array(itemSchema).optional(),
}).passthrough();

const brandingSchema = z.object({
  name: z.string().optional(),
  logoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  accent: z.string().optional(),
}).passthrough();

const menuSettingsSchema = z.object({
  templateId: z.string().optional(),
  paperSize: paperSizeSchema.default('a4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  colors: colorSchema.optional(),
  fonts: z.object({
    heading: fontSchema.optional(),
    body: fontSchema.optional(),
    accent: fontSchema.optional(),
  }).passthrough().optional(),
  branding: brandingSchema.optional(),
  categories: z.array(categorySchema).optional(),
  items: z.array(itemSchema).optional(),
  qrCodeData: z.union([
    z.string(),
    z.object({ data: z.string().optional() }).passthrough(),
  ]).optional(),
  margins: z.object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

const menuRenderPdfSchema = z.object({
  settings: menuSettingsSchema.optional(),
  templateId: z.string().optional(),
  paperSize: paperSizeSchema.optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  colors: colorSchema.optional(),
  fonts: z.object({}).passthrough().optional(),
  branding: brandingSchema.optional(),
  categories: z.array(categorySchema).optional(),
  items: z.array(itemSchema).optional(),
  qrCodeData: z.union([
    z.string(),
    z.object({ data: z.string().optional() }).passthrough(),
  ]).optional(),
}).passthrough();

module.exports = {
  menuRenderPdfSchema,
  menuSettingsSchema,
  paperSizeSchema,
};
