import z from "zod";

export const tagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters"),
  description: z.string(),
  showOnPayment: z.boolean(),
  showOnPledge: z.boolean(),
  isActive: z.boolean(),
});

export const updateTagSchema = tagSchema.partial();
