import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Await params in Next.js 15
    const { id } = await params;
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const { status, role } = await request.json();

    if (status && !["active", "suspended"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (role && !["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const updateData: Partial<Pick<typeof user.$inferSelect, 'status' | 'role' | 'updatedAt'>> = {};
    if (status) updateData.status = status;
    if (role) updateData.role = role;
    updateData.updatedAt = new Date();

    await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, userId));

    return NextResponse.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Await params in Next.js 15
    const { id } = await params;
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // For now, just return success since we can't delete without isActive column
    return NextResponse.json({ message: "User deletion not implemented yet - run migration first" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}