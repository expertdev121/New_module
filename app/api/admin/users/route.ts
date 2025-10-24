import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    // Get session without passing request
    const session = await getServerSession(authOptions);
    
    // DEBUG: Log the entire session
    console.log("=== SESSION DEBUG ===");
    console.log("Session exists:", !!session);
    console.log("Session:", session);
    
    // Check if session exists and user is authenticated
    if (!session || !session.user) {
      console.log("No session or user found");
      return NextResponse.json(
        { error: "Unauthorized - No session found" }, 
        { status: 401 }
      );
    }

    // Check if user has admin role
    const userRole = session.user.role;
    console.log("User role:", userRole);
    console.log("User email:", session.user.email);
    
    if (userRole !== "admin") {
      console.log("User is not admin");
      return NextResponse.json(
        { 
          error: "Forbidden: Admin access required",
          userRole: userRole 
        }, 
        { status: 403 }
      );
    }

    console.log("User authenticated as admin - fetching users");

    // Get the admin's location ID
    const adminLocationId = session.user.locationId;
    console.log("Admin location ID:", adminLocationId);

    const users = await db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(and(eq(user.role, "user"), eq(user.locationId, adminLocationId))) // Filter by role "user" and admin's location ID
      .orderBy(user.createdAt);

    console.log(`Successfully fetched ${users.length} users`);
    
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error in GET /api/admin/users:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  }
}