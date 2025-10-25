import { db } from "@/lib/db";
import { contact, user } from "@/lib/db/schema";
import { sql, isNotNull, eq, and, SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get distinct locationIds from contacts, filtered by user's location if admin
    const userDetails = await db
      .select({ role: user.role, locationId: user.locationId })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (userDetails.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentUser = userDetails[0];
    const isAdmin = currentUser.role === "admin";

    const locationConditions: SQL<unknown>[] = [isNotNull(contact.locationId)];

    if (isAdmin && currentUser.locationId) {
      locationConditions.push(eq(contact.locationId, currentUser.locationId));
    }

    const query = db
      .select({
        locationId: sql<string>`DISTINCT ${contact.locationId}`.as("locationId"),
      })
      .from(contact)
      .where(and(...locationConditions));

    const locations = await query;

    // For now, use locationId as name since we don't have a locations table
    const formattedLocations = locations.map((loc) => ({
      id: loc.locationId,
      name: loc.locationId, // Could be enhanced to have proper names
    }));

    return NextResponse.json({ locations: formattedLocations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}
