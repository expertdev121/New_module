import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { payment, pledge, contact, user } from "@/lib/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const locationId = searchParams.get("locationId");

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

    let whereConditions = [eq(contact.locationId, adminLocationId)];

    if (startDate && endDate) {
      whereConditions.push(gte(payment.paymentDate, startDate));
      whereConditions.push(lte(payment.paymentDate, endDate));
    }

    if (locationId) {
      whereConditions.push(eq(contact.locationId, locationId));
    }

    // Get campaign summaries
    const campaignsData = await db
      .select({
        name: pledge.campaignCode,
        amount: sql<number>`sum(${payment.amountUsd})`,
        donations: sql<number>`count(${payment.id})`,
        location: sql<string>`'N/A'`, // Placeholder since location table doesn't exist
      })
      .from(payment)
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(and(...whereConditions))
      .groupBy(pledge.campaignCode)
      .having(sql`${pledge.campaignCode} is not null`)
      .orderBy(sql`sum(${payment.amountUsd}) desc`);

    // Calculate totals
    const totalCampaigns = campaignsData.length;
    const totalRaised = campaignsData.reduce((sum, campaign) => sum + (campaign.amount || 0), 0);
    const averageDonation = totalCampaigns > 0 ? totalRaised / totalCampaigns : 0;
    const topCampaign = campaignsData.length > 0 ? {
      name: campaignsData[0].name,
      amount: campaignsData[0].amount || 0,
    } : { name: 'N/A', amount: 0 };

    // Get detailed payments for each campaign
    const detailedData = await db
      .select({
        campaignCode: pledge.campaignCode,
        contactName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`,
        paymentAmount: payment.amountUsd,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
      })
      .from(payment)
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(and(...whereConditions, sql`${pledge.campaignCode} is not null`))
      .orderBy(pledge.campaignCode, payment.paymentDate);

    return NextResponse.json({
      totalCampaigns,
      totalRaised,
      averageDonation,
      topCampaign,
      campaigns: campaignsData,
      details: detailedData,
    });
  } catch (error) {
    console.error("Error fetching campaigns data:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns data" },
      { status: 500 }
    );
  }
}
