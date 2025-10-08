import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categoryItem, category, NewCategoryItem } from "@/lib/db/schema";
import { eq, or, ilike, and } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { categoryItemSchema } from "@/lib/form-schemas/category-item";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const query = db
      .select({
        id: categoryItem.id,
        name: categoryItem.name,
        occId: categoryItem.occId,
        categoryId: categoryItem.categoryId,
        categoryName: category.name,
        isActive: categoryItem.isActive,
        createdAt: categoryItem.createdAt,
        updatedAt: categoryItem.updatedAt,
      })
      .from(categoryItem)
      .leftJoin(category, eq(categoryItem.categoryId, category.id));

    const whereClause = search
      ? or(
          ilike(categoryItem.name, `%${search}%`),
          ilike(category.name, `%${search}%`)
        )
      : undefined;

    const items = await (whereClause
      ? query.where(whereClause).orderBy(categoryItem.name)
      : query.orderBy(categoryItem.name));

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching category items:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch category items",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = categoryItemSchema.parse(body);

    const existingItem = await db
      .select()
      .from(categoryItem)
      .where(
        and(eq(categoryItem.name, validatedData.name), eq(categoryItem.categoryId, validatedData.categoryId))
      )
      .limit(1);

    if (existingItem.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate category item",
          message: `Category item with name '${validatedData.name}' already exists in this category`,
        },
        { status: 409 }
      );
    }

    const newItem: NewCategoryItem = {
      ...validatedData,
    };

    const result = await db.insert(categoryItem).values(newItem).returning();

    return NextResponse.json(
      {
        message: "Category item created successfully",
        item: result[0],
      },
      { status: 201 }
    );
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
