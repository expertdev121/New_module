import z from "zod";

export const categoryItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  occId: z.number().int().nullable().optional(),
  categoryId: z.number().int().min(1, "Category is required"),
  isActive: z.boolean().default(true),
});

export const categoryItemUpdateSchema = categoryItemSchema.partial();
