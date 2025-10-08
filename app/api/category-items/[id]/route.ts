import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categoryItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { categoryItemSchema, categoryItemUpdateSchema } from "@/lib/form-schemas/category-item";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id);

  if (isNaN(itemId)) {
    return NextResponse.json({ error: "Invalid category item ID" }, { status: 400 });
  }

  try {
    const item = await db
      .select()
      .from(categoryItem)
      .where(eq(categoryItem.id, itemId))
      .limit(1);

    if (item.length === 0) {
      return NextResponse.json({ error: "Category item not found" }, { status: 404 });
    }

    return NextResponse.json(item[0]);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch category item" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id);

  if (isNaN(itemId)) {
    return NextResponse.json({ error: "Invalid category item ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validatedData = categoryItemUpdateSchema.parse(body);

    const result = await db
      .update(categoryItem)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(categoryItem.id, itemId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Category item not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Category item updated successfully", item: result[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return ErrorHandler.handle(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id);

  if (isNaN(itemId)) {
    return NextResponse.json({ error: "Invalid category item ID" }, { status: 400 });
  }

  try {
    const result = await db
      .delete(categoryItem)
      .where(eq(categoryItem.id, itemId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Category item not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Category item deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to delete category item" },
      { status: 500 }
    );
  }
}
