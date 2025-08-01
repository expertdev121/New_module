import z from "zod";

export const studentRoleSchema = z
  .object({
    contactId: z.number().positive(),
    year: z.string().default("2024-2025"),
    program: z.enum(["LH", "LLC", "ML", "Kollel", "Madrich"]),
    track: z.enum(["Alef", "Bet", "Gimmel", "Dalet", "Heh",  "March Draft",
      "August Draft",
      "Room & Board",
      "Other Draft",]),
    trackDetail: z
      .enum(["Full Year", "Fall", "Spring", "Until Pesach"])
      .optional(),
    status: z.enum([
      "Student",
      "Active Soldier",
      "Staff",
      "Withdrew",
      "Transferred Out",
      "Left Early",
      "Asked to Leave",
    ]),
    machzor: z.enum(["10.5", "10", "9.5", "9", "8.5", "8"]).optional(),
    startDate: z.string().datetime().optional().or(z.date().optional()),
    endDate: z.string().datetime().optional().or(z.date().optional()),
    isActive: z.boolean().default(true),
    additionalNotes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return end > start;
      }
      return true;
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    }
  );
