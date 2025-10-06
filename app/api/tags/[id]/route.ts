import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { tag } from "@/lib/db/schema";
import { updateTagSchema } from "@/lib/form-schemas/tag";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tagId = parseInt(id);
    if (isNaN(tagId)) {
      return NextResponse.json(
        { error: "Invalid tag ID" },
        { status: 400 }
      );
    }

    const result = await db
      .select()
      .from(tag)
      .where(eq(tag.id, tagId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ tag: result[0] });
  } catch (error) {
    console.error("Error fetching tag:", error);
    return ErrorHandler.handle(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tagId = parseInt(id);
    if (isNaN(tagId)) {
      return NextResponse.json(
        { error: "Invalid tag ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateTagSchema.parse(body);

    // Check if tag exists
    const existingTag = await db
      .select()
      .from(tag)
      .where(eq(tag.id, tagId))
      .limit(1);

    if (existingTag.length === 0) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 }
      );
    }

    // Check for duplicate name if name is being updated
    if (validatedData.name) {
      const duplicateTag = await db
        .select()
        .from(tag)
        .where(
          and(
            eq(tag.name, validatedData.name),
            eq(tag.isActive, true)
          )
        )
        .limit(1);

      if (duplicateTag.length > 0 && duplicateTag[0].id !== tagId) {
        return NextResponse.json(
          {
            error: "Duplicate tag",
            message: `Tag with name '${validatedData.name}' already exists`,
          },
          { status: 409 }
        );
      }
    }

    const result = await db
      .update(tag)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(tag.id, tagId))
      .returning();

    return NextResponse.json(
      {
        message: "Tag updated successfully",
        tag: result[0],
      },
      { status: 200 }
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tagId = parseInt(id);
    if (isNaN(tagId)) {
      return NextResponse.json(
        { error: "Invalid tag ID" },
        { status: 400 }
      );
    }

    // Check if tag exists
    const existingTag = await db
      .select()
      .from(tag)
      .where(eq(tag.id, tagId))
      .limit(1);

    if (existingTag.length === 0) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 }
      );
    }

    const result = await db
      .delete(tag)
      .where(eq(tag.id, tagId))
      .returning();

    return NextResponse.json(
      {
        message: "Tag deleted permanently",
        deletedTag: result[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting tag:", error);
    return ErrorHandler.handle(error);
  }
}