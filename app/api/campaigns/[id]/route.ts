import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaign, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const updateCampaignSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "completed"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = parseInt(id);
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    // Get admin's locationId
    const userResult = await db
      .select({ locationId: user.locationId })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (!userResult.length || !userResult[0].locationId) {
      return NextResponse.json({ error: "Admin location not found" }, { status: 400 });
    }

    const adminLocationId = userResult[0].locationId;

    // Get campaign for admin's location
    const campaignResult = await db
      .select()
      .from(campaign)
      .where(and(eq(campaign.id, campaignId), eq(campaign.locationId, adminLocationId)))
      .limit(1);

    if (!campaignResult.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json(campaignResult[0]);
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = parseInt(id);
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = updateCampaignSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    // Get admin's locationId and userId
    const userResult = await db
      .select({ id: user.id, locationId: user.locationId })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (!userResult.length || !userResult[0].locationId) {
      return NextResponse.json({ error: "Admin location not found" }, { status: 400 });
    }

    const adminUserId = userResult[0].id;
    const adminLocationId = userResult[0].locationId;

    // Check if campaign exists and belongs to admin's location
    const existingCampaign = await db
      .select()
      .from(campaign)
      .where(and(eq(campaign.id, campaignId), eq(campaign.locationId, adminLocationId)))
      .limit(1);

    if (!existingCampaign.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Update campaign
    const updatedCampaign = await db
      .update(campaign)
      .set({
        ...updateData,
        updatedBy: adminUserId,
        updatedAt: new Date(),
      })
      .where(eq(campaign.id, campaignId))
      .returning();

    return NextResponse.json(updatedCampaign[0]);
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = parseInt(id);
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    // Get admin's locationId
    const userResult = await db
      .select({ locationId: user.locationId })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (!userResult.length || !userResult[0].locationId) {
      return NextResponse.json({ error: "Admin location not found" }, { status: 400 });
    }

    const adminLocationId = userResult[0].locationId;

    // Check if campaign exists and belongs to admin's location
    const existingCampaign = await db
      .select()
      .from(campaign)
      .where(and(eq(campaign.id, campaignId), eq(campaign.locationId, adminLocationId)))
      .limit(1);

    if (!existingCampaign.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Delete campaign
    await db
      .delete(campaign)
      .where(eq(campaign.id, campaignId));

    return NextResponse.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
