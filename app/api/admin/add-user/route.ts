import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, password, role } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check if user already exists
    const existingUsers = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUsers.length > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    await db.insert(user).values({
      email,
      passwordHash: hashedPassword,
      role,
    });

    return NextResponse.json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
