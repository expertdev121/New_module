import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, and, gte, lt, lte, SQL, eq } from "drizzle-orm";
import { pledge, user, contact } from "@/lib/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

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

    let whereCondition: SQL<unknown> | undefined = undefined;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      whereCondition = and(
        gte(pledge.pledgeDate, start.toISOString().split('T')[0]),
        lte(pledge.pledgeDate, end.toISOString().split('T')[0])
      );
    }

    // Fully paid: originalAmountUsd - totalPaidUsd <= 0 (filter by admin's location)
    const fullyPaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(whereCondition ? and(whereCondition, sql`${pledge.originalAmountUsd} - ${pledge.totalPaidUsd} <= 0`, eq(contact.locationId, adminLocationId)) : and(sql`${pledge.originalAmountUsd} - ${pledge.totalPaidUsd} <= 0`, eq(contact.locationId, adminLocationId)));

    // Partially paid: totalPaidUsd > 0 AND originalAmountUsd - totalPaidUsd > 0 (filter by admin's location)
    const partiallyPaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(whereCondition ? and(whereCondition, sql`${pledge.totalPaidUsd} > 0 AND ${pledge.originalAmountUsd} - ${pledge.totalPaidUsd} > 0`, eq(contact.locationId, adminLocationId)) : and(sql`${pledge.totalPaidUsd} > 0 AND ${pledge.originalAmountUsd} - ${pledge.totalPaidUsd} > 0`, eq(contact.locationId, adminLocationId)));

    // Unpaid: totalPaidUsd = 0 OR totalPaidUsd IS NULL (filter by admin's location)
    const unpaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(whereCondition ? and(whereCondition, sql`${pledge.totalPaidUsd} = 0 OR ${pledge.totalPaidUsd} IS NULL`, eq(contact.locationId, adminLocationId)) : and(sql`${pledge.totalPaidUsd} = 0 OR ${pledge.totalPaidUsd} IS NULL`, eq(contact.locationId, adminLocationId)));

    const fullyPaid = fullyPaidResult[0]?.count || 0;
    const partiallyPaid = partiallyPaidResult[0]?.count || 0;
    const unpaid = unpaidResult[0]?.count || 0;

    return NextResponse.json({
      labels: ["Fully Paid", "Partially Paid", "Unpaid"],
      values: [fullyPaid, partiallyPaid, unpaid],
      percentages: [
        fullyPaid + partiallyPaid + unpaid > 0 ? (fullyPaid / (fullyPaid + partiallyPaid + unpaid)) * 100 : 0,
        fullyPaid + partiallyPaid + unpaid > 0 ? (partiallyPaid / (fullyPaid + partiallyPaid + unpaid)) * 100 : 0,
        fullyPaid + partiallyPaid + unpaid > 0 ? (unpaid / (fullyPaid + partiallyPaid + unpaid)) * 100 : 0,
      ].map(p => Math.round(p * 100) / 100),
    });
  } catch (error) {
    console.error("Error fetching pledge status:", error);
    return NextResponse.json(
      { error: "Failed to fetch pledge status" },
      { status: 500 }
    );
  }
}
