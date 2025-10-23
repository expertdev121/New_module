import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, contact, type NewUser, type NewContact } from "@/lib/db/schema";
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

    // Get admin's locationId from database
    const adminUser = await db
      .select({ locationId: user.locationId })
      .from(user)
      .where(eq(user.id, parseInt(session.user.id)))
      .limit(1);

    const adminLocationId = adminUser.length > 0 ? adminUser[0].locationId : null;

    // Create user with the same locationId as the admin (only if admin has one)
    const userData: NewUser = {
      email,
      passwordHash: hashedPassword,
      role,
    };
    if (adminLocationId) {
      userData.locationId = adminLocationId;
    }

    const [newUser] = await db.insert(user).values(userData).returning({ id: user.id });

    // Create a contact record for the user with the same locationId as the admin
    // Derive firstName and lastName from email (e.g., john.doe@example.com -> John Doe)
    const emailParts = email.split('@')[0].split('.');
    const firstName = emailParts[0] ? emailParts[0].charAt(0).toUpperCase() + emailParts[0].slice(1) : '';
    const lastName = emailParts[1] ? emailParts[1].charAt(0).toUpperCase() + emailParts[1].slice(1) : emailParts[0] ? emailParts[0].charAt(0).toUpperCase() + emailParts[0].slice(1) : '';

    const contactData: NewContact = {
      firstName,
      lastName,
      email,
    };
    if (adminLocationId) {
      contactData.locationId = adminLocationId;
    }

    await db.insert(contact).values(contactData);

    return NextResponse.json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
