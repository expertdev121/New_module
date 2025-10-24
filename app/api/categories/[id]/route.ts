import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { category, categoryItem } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { categorySchema } from "@/lib/form-schemas/category";

type CategoryUpdateData = {
  updatedAt: Date;
  name?: string;
  description?: string;
  isActive?: boolean;
};

const categoryUpdateSchema = z.object({
  name: z.string().min(1, "Category name is required").optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const categoryId = parseInt(id);

  if (isNaN(categoryId)) {
    return Response.json({ error: "Invalid category ID" }, { status: 400 });
  }

  try {
    const items = await db
      .select({ name: categoryItem.name })
      .from(categoryItem)
      .where(eq(categoryItem.categoryId, categoryId))
      .orderBy(categoryItem.name);

    return Response.json(items.map(item => item.name)); // Return array of names
  } catch (error) {
    console.error("Database error:", error);
    return Response.json(
      { error: "Failed to fetch category items" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const categoryId = parseInt(id);

  if (isNaN(categoryId)) {
    return Response.json({ error: "Invalid category ID" }, { status: 400 });
  }

  try {
    // Get session without passing request
    const session = await getServerSession(authOptions);

    // Check if session exists and user is authenticated
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized - No session found" },
        { status: 401 }
      );
    }

    // Check if user has admin role
    const userRole = session.user.role;
    if (userRole !== "admin") {
      return Response.json(
        {
          error: "Forbidden: Admin access required",
          userRole: userRole
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = categoryUpdateSchema.parse(body);

    // Check for duplicate name if name is provided
    if (validatedData.name !== undefined) {
      const existingCategory = await db
        .select()
        .from(category)
        .where(
          and(
            eq(category.name, validatedData.name),
            eq(category.isActive, true),
            sql`${category.id} != ${categoryId}`
          )
        )
        .limit(1);

      if (existingCategory.length > 0) {
        return Response.json(
          {
            error: "Duplicate category",
            message: `Category with name '${validatedData.name}' already exists`,
          },
          { status: 409 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: CategoryUpdateData = { updatedAt: new Date() };
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;

    const result = await db
      .update(category)
      .set(updateData)
      .where(eq(category.id, categoryId))
      .returning();

    if (result.length === 0) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }

    return Response.json({ message: "Category updated successfully", category: result[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
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

    console.error("Database error:", error);
    return Response.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const categoryId = parseInt(id);

  if (isNaN(categoryId)) {
    return Response.json({ error: "Invalid category ID" }, { status: 400 });
  }

  try {
    const result = await db
      .delete(category)
      .where(eq(category.id, categoryId))
      .returning();

    if (result.length === 0) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }

    return Response.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
