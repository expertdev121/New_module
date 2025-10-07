// Set the environment variable directly
process.env.DATABASE_URL = 'postgresql://levhatora_final_owner:npg_FmBlvp78SNqZ@ep-delicate-smoke-a9zveme7-pooler.gwc.azure.neon.tech/levhatora_final?sslmode=require&channel_binding=require';

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

async function seed() {
  try {
    const hashedPassword = await bcrypt.hash("admin123", 10);

    await db.insert(user).values({
      email: "admin@example.com",
      passwordHash: hashedPassword,
      role: "admin",
    });

    console.log("Admin user seeded successfully");

    const userHashedPassword = await bcrypt.hash("  ", 10);

    await db.insert(user).values({
      email: "user@example.com",
      passwordHash: userHashedPassword,
      role: "user",
    });

    console.log("Regular user seeded successfully");
  } catch (error) {
    console.error("Error seeding users:", error);
  } finally {
    process.exit(0);
  }
}

seed();
