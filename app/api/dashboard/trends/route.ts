import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq,and } from "drizzle-orm";
import { pledge, payment } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6");

    // Generate last N months
    const now = new Date();
    const labels = [];
    const pledgesData = [];
    const paymentsData = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yearMonth = date.toISOString().slice(0, 7); // YYYY-MM
      const monthName = date.toLocaleString('en-US', { month: 'short' });
      labels.push(monthName);

      // Pledges for this month
      const pledgeResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)` })
        .from(pledge)
        .where(sql`DATE_TRUNC('month', ${pledge.pledgeDate}) = ${yearMonth}-01`);

      // Payments for this month
      const paymentResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)` })
        .from(payment)
        .where(and(
          eq(payment.paymentStatus, "completed"),
          sql`DATE_TRUNC('month', ${payment.paymentDate}) = ${yearMonth}-01`
        ));

      pledgesData.push(pledgeResult[0]?.total || 0);
      paymentsData.push(paymentResult[0]?.total || 0);
    }

    return NextResponse.json({
      labels,
      pledges: pledgesData,
      payments: paymentsData,
    });
  } catch (error) {
    console.error("Error fetching dashboard trends:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard trends" },
      { status: 500 }
    );
  }
}
