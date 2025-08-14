import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { categoryItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // ✅ await the Promise so type matches checker
  const categoryId = parseInt(id);

  if (isNaN(categoryId)) {
    return Response.json({ error: "Invalid category ID" }, { status: 400 });
  }

  try {
    const items = await db
      .select()
      .from(categoryItem)
      .where(eq(categoryItem.categoryId, categoryId))
      .orderBy(categoryItem.name);

    const itemNames = items.map(item => item.name);
    return Response.json(itemNames);
  } catch (error) {
    console.error("Database error:", error);
    return Response.json(
      { error: "Failed to fetch category items" },
      { status: 500 }
    );
  }
}
