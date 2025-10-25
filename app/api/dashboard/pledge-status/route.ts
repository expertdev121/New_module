import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, and, gte, lte, SQL, eq } from "drizzle-orm";
import { pledge, user, contact } from "@/lib/db/schema";
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

    const isSuperAdmin = session.user.role === "super_admin";

    let locationFilter: SQL<unknown> | undefined = undefined;

    // Only filter by location for regular admins, not super admins
    if (!isSuperAdmin) {
      // Get admin's locationId
      const userResult = await db
        .select({ locationId: user.locationId })
        .from(user)
        .where(eq(user.email, session.user.email))
        .limit(1);

      if (!userResult.length || !userResult[0].locationId) {
        return NextResponse.json({ error: "Admin location not found" }, { status: 400 });
      }

      locationFilter = eq(contact.locationId, userResult[0].locationId);
    }

    let whereCondition: SQL<unknown> | undefined = undefined;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      whereCondition = and(
        gte(pledge.pledgeDate, start.toISOString().split('T')[0]),
        lte(pledge.pledgeDate, end.toISOString().split('T')[0])
      );
    }

    // Build where conditions dynamically
    const buildWhereCondition = (statusCondition: SQL<unknown>) => {
      const conditions = [statusCondition];
      if (whereCondition) conditions.push(whereCondition);
      if (locationFilter) conditions.push(locationFilter);
      return and(...conditions);
    };

    console.log("Building queries with filters:", {
      hasWhereCondition: !!whereCondition,
      hasLocationFilter: !!locationFilter,
      isSuperAdmin
    });

    let fullyPaidResult, partiallyPaidResult, unpaidResult;

    try {
      // Fully paid: sum of completed payments >= originalAmountUsd
      console.log("Executing fully paid query...");
      fullyPaidResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pledge)
        .innerJoin(contact, eq(pledge.contactId, contact.id))
        .where(buildWhereCondition(sql`${pledge.originalAmountUsd} <= COALESCE((SELECT SUM(amount_usd) FROM payment WHERE payment.pledge_id = pledge.id AND payment.payment_status = 'completed'), 0)`));
      console.log("Fully paid result:", fullyPaidResult);
    } catch (error) {
      console.error("Error in fully paid query:", error);
      throw error;
    }

    try {
      // Partially paid: sum of completed payments > 0 AND < originalAmountUsd
      console.log("Executing partially paid query...");
      partiallyPaidResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pledge)
        .innerJoin(contact, eq(pledge.contactId, contact.id))
        .where(buildWhereCondition(sql`COALESCE((SELECT SUM(amount_usd) FROM payment WHERE payment.pledge_id = pledge.id AND payment.payment_status = 'completed'), 0) > 0 AND ${pledge.originalAmountUsd} > COALESCE((SELECT SUM(amount_usd) FROM payment WHERE payment.pledge_id = pledge.id AND payment.payment_status = 'completed'), 0)`));
      console.log("Partially paid result:", partiallyPaidResult);
    } catch (error) {
      console.error("Error in partially paid query:", error);
      throw error;
    }

    try {
      // Unpaid: sum of completed payments = 0
      console.log("Executing unpaid query...");
      unpaidResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pledge)
        .innerJoin(contact, eq(pledge.contactId, contact.id))
        .where(buildWhereCondition(sql`COALESCE((SELECT SUM(amount_usd) FROM payment WHERE payment.pledge_id = pledge.id AND payment.payment_status = 'completed'), 0) = 0`));
      console.log("Unpaid result:", unpaidResult);
    } catch (error) {
      console.error("Error in unpaid query:", error);
      throw error;
    }

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
