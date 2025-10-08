import z from "zod";

export const categoryGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  categoryId: z.number().int().min(1, "Category is required"),
  categoryItemId: z.number().int().min(1, "Category item is required"),
});
