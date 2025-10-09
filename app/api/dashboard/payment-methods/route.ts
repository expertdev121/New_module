import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lt, lte, SQL } from "drizzle-orm";
import { payment } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let whereCondition: SQL<unknown> | undefined = eq(payment.paymentStatus, "completed");

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      whereCondition = and(
        eq(payment.paymentStatus, "completed"),
        gte(payment.paymentDate, start.toISOString().split('T')[0]),
        lte(payment.paymentDate, end.toISOString().split('T')[0])
      );
    }

    const methodStats = await db
      .select({
        method: payment.paymentMethod,
        totalAmount: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payment)
      .where(whereCondition)
      .groupBy(payment.paymentMethod)
      .orderBy(sql`SUM(${payment.amountUsd}) DESC`);

    const labels = methodStats.map(stat => stat.method);
    const values = methodStats.map(stat => stat.totalAmount);
    const counts = methodStats.map(stat => stat.count);

    return NextResponse.json({
      labels,
      values,
      counts,
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment methods" },
      { status: 500 }
    );
  }
}
