import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, and, gte, lt, lte, SQL } from "drizzle-orm";
import { pledge } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let whereCondition: SQL<unknown> | undefined = undefined;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      whereCondition = and(
        gte(pledge.pledgeDate, start.toISOString().split('T')[0]),
        lte(pledge.pledgeDate, end.toISOString().split('T')[0])
      );
    }

    // Fully paid: balanceUsd <= 0
    const fullyPaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .where(whereCondition ? and(whereCondition, sql`${pledge.balanceUsd} <= 0`) : sql`${pledge.balanceUsd} <= 0`);

    // Partially paid: totalPaidUsd > 0 AND balanceUsd > 0
    const partiallyPaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .where(whereCondition ? and(whereCondition, sql`${pledge.totalPaidUsd} > 0 AND ${pledge.balanceUsd} > 0`) : sql`${pledge.totalPaidUsd} > 0 AND ${pledge.balanceUsd} > 0`);

    // Unpaid: totalPaidUsd = 0 OR totalPaidUsd IS NULL
    const unpaidResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .where(whereCondition ? and(whereCondition, sql`${pledge.totalPaidUsd} = 0 OR ${pledge.totalPaidUsd} IS NULL`) : sql`${pledge.totalPaidUsd} = 0 OR ${pledge.totalPaidUsd} IS NULL`);

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
