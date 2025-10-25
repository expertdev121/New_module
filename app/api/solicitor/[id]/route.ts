import { db } from "@/lib/db";
import { solicitor, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const solicitorId = parseInt(id, 10);

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details including locationId
    const userDetails = await db
      .select({
        role: user.role,
        locationId: user.locationId,
      })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (userDetails.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentUser = userDetails[0];
    const isAdmin = currentUser.role === "admin";

    const body = await request.json();

    // Build where conditions for update
    const whereConditions = [eq(solicitor.id, solicitorId)];

    // Add locationId filtering for admins
    if (isAdmin && currentUser.locationId) {
      whereConditions.push(eq(solicitor.locationId, currentUser.locationId));
    }

    const updatedSolicitor = await db
      .update(solicitor)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(...whereConditions))
      .returning();

    if (updatedSolicitor.length === 0) {
      return NextResponse.json(
        { error: "Solicitor not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ solicitor: updatedSolicitor[0] });
  } catch (error) {
    console.error("Error updating solicitor:", error);
    return NextResponse.json(
      { error: "Failed to update solicitor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const solicitorId = parseInt(id, 10);

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details including locationId
    const userDetails = await db
      .select({
        role: user.role,
        locationId: user.locationId,
      })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (userDetails.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentUser = userDetails[0];
    const isAdmin = currentUser.role === "admin";

    // Build where conditions for delete
    const whereConditions = [eq(solicitor.id, solicitorId)];

    // Add locationId filtering for admins
    if (isAdmin && currentUser.locationId) {
      whereConditions.push(eq(solicitor.locationId, currentUser.locationId));
    }

    const deletedSolicitor = await db
      .delete(solicitor)
      .where(and(...whereConditions))
      .returning();

    if (deletedSolicitor.length === 0) {
      return NextResponse.json(
        { error: "Solicitor not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Solicitor deleted successfully" });
  } catch (error) {
    console.error("Error deleting solicitor:", error);
    return NextResponse.json(
      { error: "Failed to delete solicitor" },
      { status: 500 }
    );
  }
}
