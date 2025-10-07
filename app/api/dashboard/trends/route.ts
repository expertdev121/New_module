import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lt } from "drizzle-orm";
import { pledge, payment } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "6m";

    const now = new Date();
    const labels = [];
    const pledgesData = [];
    const paymentsData = [];

    if (period === "1m") {
      // Show last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const startDate = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const endDate = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const weekLabel = `Week ${4 - i}`;
        labels.push(weekLabel);

        // Pledges for this week
        const pledgeResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)` })
          .from(pledge)
          .where(and(
            gte(pledge.pledgeDate, startDateStr),
            lt(pledge.pledgeDate, endDateStr)
          ));

        // Payments for this week
        const paymentResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)` })
          .from(payment)
          .where(and(
            eq(payment.paymentStatus, "completed"),
            gte(payment.paymentDate, startDateStr),
            lt(payment.paymentDate, endDateStr)
          ));

        pledgesData.push(pledgeResult[0]?.total || 0);
        paymentsData.push(paymentResult[0]?.total || 0);
      }
    } else if (period === "all") {
      // Show yearly data for all time
      const currentYear = now.getFullYear();
      // Show last 5 years for "all"
      for (let i = 4; i >= 0; i--) {
        const year = currentYear - i;
        const startDate = new Date(year, 0, 1); // January 1st
        const endDate = new Date(year + 1, 0, 1); // January 1st of next year
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        labels.push(year.toString());

        // Pledges for this year
        const pledgeResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)` })
          .from(pledge)
          .where(and(
            gte(pledge.pledgeDate, startDateStr),
            lt(pledge.pledgeDate, endDateStr)
          ));

        // Payments for this year
        const paymentResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)` })
          .from(payment)
          .where(and(
            eq(payment.paymentStatus, "completed"),
            gte(payment.paymentDate, startDateStr),
            lt(payment.paymentDate, endDateStr)
          ));

        pledgesData.push(pledgeResult[0]?.total || 0);
        paymentsData.push(paymentResult[0]?.total || 0);
      }
    } else {
      // Show monthly data
      const months = period === "3m" ? 3 : period === "6m" ? 6 : period === "1y" ? 12 : 24;

      for (let i = months - 1; i >= 0; i--) {
        const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const monthName = startDate.toLocaleString('en-US', { month: 'short' });
        labels.push(monthName);

        // Pledges for this month
        const pledgeResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)` })
          .from(pledge)
          .where(and(
            gte(pledge.pledgeDate, startDateStr),
            lt(pledge.pledgeDate, endDateStr)
          ));

        // Payments for this month
        const paymentResult = await db
          .select({ total: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)` })
          .from(payment)
          .where(and(
            eq(payment.paymentStatus, "completed"),
            gte(payment.paymentDate, startDateStr),
            lt(payment.paymentDate, endDateStr)
          ));

        pledgesData.push(pledgeResult[0]?.total || 0);
        paymentsData.push(paymentResult[0]?.total || 0);
      }
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
