import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categoryGroup, category, categoryItem, NewCategoryGroup } from "@/lib/db/schema";
import { eq, or, ilike, and } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { categoryGroupSchema } from "@/lib/form-schemas/category-group";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(categoryGroup.name, `%${search}%`),
          ilike(category.name, `%${search}%`),
          ilike(categoryItem.name, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const groups = await db
      .select({
        id: categoryGroup.id,
        name: categoryGroup.name,
        categoryId: categoryGroup.categoryId,
        categoryName: category.name,
        categoryItemId: categoryGroup.categoryItemId,
        categoryItemName: categoryItem.name,
        createdAt: categoryGroup.createdAt,
        updatedAt: categoryGroup.updatedAt,
      })
      .from(categoryGroup)
      .leftJoin(category, eq(categoryGroup.categoryId, category.id))
      .leftJoin(categoryItem, eq(categoryGroup.categoryItemId, categoryItem.id))
      .where(whereClause)
      .orderBy(categoryGroup.name);

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error fetching category groups:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch category groups",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = categoryGroupSchema.parse(body);

    const existingGroup = await db
      .select()
      .from(categoryGroup)
      .where(
        and(
          eq(categoryGroup.name, validatedData.name),
          eq(categoryGroup.categoryId, validatedData.categoryId),
          eq(categoryGroup.categoryItemId, validatedData.categoryItemId)
        )
      )
      .limit(1);

    if (existingGroup.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate category group",
          message: `Category group with name '${validatedData.name}' already exists for this category and item combination`,
        },
        { status: 409 }
      );
    }

    const newGroup: NewCategoryGroup = {
      ...validatedData,
    };

    const result = await db.insert(categoryGroup).values(newGroup).returning();

    return NextResponse.json(
      {
        message: "Category group created successfully",
        group: result[0],
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
