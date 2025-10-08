import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categoryGroup } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { categoryGroupSchema } from "@/lib/form-schemas/category-group";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  if (isNaN(groupId)) {
    return NextResponse.json({ error: "Invalid category group ID" }, { status: 400 });
  }

  try {
    const group = await db
      .select()
      .from(categoryGroup)
      .where(eq(categoryGroup.id, groupId))
      .limit(1);

    if (group.length === 0) {
      return NextResponse.json({ error: "Category group not found" }, { status: 404 });
    }

    return NextResponse.json(group[0]);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch category group" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  if (isNaN(groupId)) {
    return NextResponse.json({ error: "Invalid category group ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validatedData = categoryGroupSchema.parse(body);

    const result = await db
      .update(categoryGroup)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(categoryGroup.id, groupId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Category group not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Category group updated successfully", group: result[0] });
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
  const groupId = parseInt(id);

  if (isNaN(groupId)) {
    return NextResponse.json({ error: "Invalid category group ID" }, { status: 400 });
  }

  try {
    const result = await db
      .delete(categoryGroup)
      .where(eq(categoryGroup.id, groupId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Category group not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Category group deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to delete category group" },
      { status: 500 }
    );
  }
}
