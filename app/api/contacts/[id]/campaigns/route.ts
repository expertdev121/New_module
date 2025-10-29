import { db } from "@/lib/db";
import { campaign, pledge, payment, user } from "@/lib/db/schema";
import { sql,SQL, eq, desc, and, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const offset = (page - 1) * limit;

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

    // Apply location-based filtering for admins
    let campaignWhereClause: SQL<unknown>;

    if (isAdmin && currentUser.locationId) {
      campaignWhereClause = and(
        eq(campaign.status, "active"),
        eq(campaign.locationId, currentUser.locationId)
      )!;
    } else if (isAdmin && !currentUser.locationId) {
      // If admin has no locationId, they see no campaigns
      campaignWhereClause = sql`FALSE`;
    } else {
      campaignWhereClause = eq(campaign.status, "active");
    }

    const [totalResult] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(campaign)
      .where(campaignWhereClause);

    const total = parseInt(totalResult?.total?.toString() || "0");

    const campaignsWithTotals = await db
      .select({
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignDescription: campaign.description,
        totalPledgedUsd: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        totalPaidUsd: sql<number>`COALESCE(SUM(${pledge.totalPaidUsd}), 0)`,
        currentBalanceUsd: sql<number>`COALESCE(SUM(${pledge.balanceUsd}), 0)`,
        pledgeCount: sql<number>`COUNT(${pledge.id})`,
        // Add scheduled calculation from payments without received_date
        scheduledUsd: sql<number>`COALESCE(
          (SELECT SUM(p_inner.amount_usd)
           FROM payment p_inner
           JOIN pledge pl_inner ON p_inner.pledge_id = pl_inner.id
           WHERE pl_inner.campaign_code = ${campaign.name}
           AND pl_inner.contact_id = ${contactId}
           AND p_inner.received_date IS NULL
          AND p_inner.payment_status IN ('pending', 'processing', 'expected')
          ), 0
        )`.as("scheduledUsd"),
      })
      .from(campaign)
      .leftJoin(pledge, and(eq(campaign.name, pledge.campaignCode), eq(pledge.contactId, contactId)))
      .where(campaignWhereClause)
      .groupBy(campaign.id, campaign.name, campaign.description)
      .orderBy(campaign.name)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      campaigns: campaignsWithTotals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}
