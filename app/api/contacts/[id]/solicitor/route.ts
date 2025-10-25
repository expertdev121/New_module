import { db } from "@/lib/db";
import { solicitor, contact, user } from "@/lib/db/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  if (isNaN(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

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

    const contactExists = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.id, contactId))
      .limit(1);

    if (contactExists.length === 0) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get solicitor data for this contact
    const whereCondition = isAdmin && currentUser.locationId
      ? and(
          eq(solicitor.contactId, contactId),
          eq(solicitor.locationId, currentUser.locationId),
          isNotNull(solicitor.locationId)
        )
      : eq(solicitor.contactId, contactId);

    const solicitorData = await db
      .select({
        id: solicitor.id,
        contactId: solicitor.contactId,
        solicitorCode: solicitor.solicitorCode,
        status: solicitor.status,
        commissionRate: solicitor.commissionRate,
        hireDate: solicitor.hireDate,
        terminationDate: solicitor.terminationDate,
        notes: solicitor.notes,
        createdAt: solicitor.createdAt,
        updatedAt: solicitor.updatedAt,
        // Contact information
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
      })
      .from(solicitor)
      .leftJoin(contact, eq(solicitor.contactId, contact.id))
      .where(whereCondition)
      .limit(1);

    if (solicitorData.length === 0) {
      return NextResponse.json(
        { error: "Contact is not a solicitor" },
        { status: 404 }
      );
    }

    return NextResponse.json({ solicitor: solicitorData[0] });
  } catch (error) {
    console.error("Error fetching solicitor:", error);
    return NextResponse.json(
      { error: "Failed to fetch solicitor" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  if (isNaN(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

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
    const {
      solicitorCode,
      status = "active",
      commissionRate,
      hireDate,
      terminationDate,
      notes,
    } = body;

    // Validate required fields
    if (status && !["active", "inactive", "suspended"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be active, inactive, or suspended" },
        { status: 400 }
      );
    }

    if (
      commissionRate !== undefined &&
      (commissionRate < 0 || commissionRate > 100)
    ) {
      return NextResponse.json(
        { error: "Commission rate must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Check if contact exists
    const contactExists = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.id, contactId))
      .limit(1);

    if (contactExists.length === 0) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Check if contact is already a solicitor
    const existingSolicitor = await db
      .select({ id: solicitor.id })
      .from(solicitor)
      .where(eq(solicitor.contactId, contactId))
      .limit(1);

    if (existingSolicitor.length > 0) {
      return NextResponse.json(
        { error: "Contact is already a solicitor" },
        { status: 409 }
      );
    }

    // Check if solicitorCode is unique (if provided)
    if (solicitorCode) {
      const existingCode = await db
        .select({ id: solicitor.id })
        .from(solicitor)
        .where(eq(solicitor.solicitorCode, solicitorCode))
        .limit(1);

      if (existingCode.length > 0) {
        return NextResponse.json(
          { error: "Solicitor code already exists" },
          { status: 409 }
        );
      }
    }

    // Create new solicitor
    const newSolicitor = await db
      .insert(solicitor)
      .values({
        contactId,
        solicitorCode: solicitorCode || null,
        status,
        commissionRate: commissionRate ? commissionRate.toString() : null,
        hireDate: hireDate || null,
        terminationDate: terminationDate || null,
        notes: notes || null,
        locationId: isAdmin ? currentUser.locationId : null,
      })
      .returning({
        id: solicitor.id,
        contactId: solicitor.contactId,
        solicitorCode: solicitor.solicitorCode,
        status: solicitor.status,
        commissionRate: solicitor.commissionRate,
        hireDate: solicitor.hireDate,
        terminationDate: solicitor.terminationDate,
        notes: solicitor.notes,
        createdAt: solicitor.createdAt,
        updatedAt: solicitor.updatedAt,
      });

    // Get the complete solicitor data with contact information
    const solicitorWithContact = await db
      .select({
        id: solicitor.id,
        contactId: solicitor.contactId,
        solicitorCode: solicitor.solicitorCode,
        status: solicitor.status,
        commissionRate: solicitor.commissionRate,
        hireDate: solicitor.hireDate,
        terminationDate: solicitor.terminationDate,
        notes: solicitor.notes,
        createdAt: solicitor.createdAt,
        updatedAt: solicitor.updatedAt,
        // Contact information
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
      })
      .from(solicitor)
      .leftJoin(contact, eq(solicitor.contactId, contact.id))
      .where(eq(solicitor.id, newSolicitor[0].id))
      .limit(1);

    return NextResponse.json(
      {
        message: "Solicitor created successfully",
        solicitor: solicitorWithContact[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating solicitor:", error);
    return NextResponse.json(
      { error: "Failed to create solicitor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  if (isNaN(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

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
    const {
      solicitorCode,
      status,
      commissionRate,
      hireDate,
      terminationDate,
      notes,
    } = body;

    // Validate fields
    if (status && !["active", "inactive", "suspended"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be active, inactive, or suspended" },
        { status: 400 }
      );
    }

    if (
      commissionRate !== undefined &&
      (commissionRate < 0 || commissionRate > 100)
    ) {
      return NextResponse.json(
        { error: "Commission rate must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Check if solicitor exists for this contact
    const whereCondition = isAdmin && currentUser.locationId
      ? and(
          eq(solicitor.contactId, contactId),
          eq(solicitor.locationId, currentUser.locationId),
          isNotNull(solicitor.locationId)
        )
      : eq(solicitor.contactId, contactId);

    const existingSolicitor = await db
      .select({ id: solicitor.id })
      .from(solicitor)
      .where(whereCondition)
      .limit(1);

    if (existingSolicitor.length === 0) {
      return NextResponse.json(
        { error: "Solicitor not found for this contact" },
        { status: 404 }
      );
    }

    // Check if solicitorCode is unique (if provided and different)
    if (solicitorCode) {
      const existingCode = await db
        .select({ id: solicitor.id, contactId: solicitor.contactId })
        .from(solicitor)
        .where(eq(solicitor.solicitorCode, solicitorCode))
        .limit(1);

      if (existingCode.length > 0 && existingCode[0].contactId !== contactId) {
        return NextResponse.json(
          { error: "Solicitor code already exists" },
          { status: 409 }
        );
      }
    }

    // Update solicitor
    const updatedSolicitor = await db
      .update(solicitor)
      .set({
        solicitorCode: solicitorCode !== undefined ? solicitorCode : undefined,
        status: status !== undefined ? status : undefined,
        commissionRate:
          commissionRate !== undefined ? commissionRate.toString() : undefined,
        hireDate: hireDate !== undefined ? hireDate : undefined,
        terminationDate:
          terminationDate !== undefined ? terminationDate : undefined,
        notes: notes !== undefined ? notes : undefined,
        updatedAt: new Date(),
      })
      .where(eq(solicitor.contactId, contactId))
      .returning({
        id: solicitor.id,
        contactId: solicitor.contactId,
        solicitorCode: solicitor.solicitorCode,
        status: solicitor.status,
        commissionRate: solicitor.commissionRate,
        hireDate: solicitor.hireDate,
        terminationDate: solicitor.terminationDate,
        notes: solicitor.notes,
        createdAt: solicitor.createdAt,
        updatedAt: solicitor.updatedAt,
      });

    // Get the complete solicitor data with contact information
    const solicitorWithContact = await db
      .select({
        id: solicitor.id,
        contactId: solicitor.contactId,
        solicitorCode: solicitor.solicitorCode,
        status: solicitor.status,
        commissionRate: solicitor.commissionRate,
        hireDate: solicitor.hireDate,
        terminationDate: solicitor.terminationDate,
        notes: solicitor.notes,
        createdAt: solicitor.createdAt,
        updatedAt: solicitor.updatedAt,
        // Contact information
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
      })
      .from(solicitor)
      .leftJoin(contact, eq(solicitor.contactId, contact.id))
      .where(eq(solicitor.id, updatedSolicitor[0].id))
      .limit(1);

    return NextResponse.json({
      message: "Solicitor updated successfully",
      solicitor: solicitorWithContact[0],
    });
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
  const contactId = parseInt(id, 10);

  if (isNaN(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

  try {
    // Check if solicitor exists for this contact
    const existingSolicitor = await db
      .select({ id: solicitor.id })
      .from(solicitor)
      .where(eq(solicitor.contactId, contactId))
      .limit(1);

    if (existingSolicitor.length === 0) {
      return NextResponse.json(
        { error: "Solicitor not found for this contact" },
        { status: 404 }
      );
    }

    // Delete solicitor (this will cascade delete bonus rules and calculations)
    await db.delete(solicitor).where(eq(solicitor.contactId, contactId));

    return NextResponse.json({
      message: "Solicitor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting solicitor:", error);
    return NextResponse.json(
      { error: "Failed to delete solicitor" },
      { status: 500 }
    );
  }
}
