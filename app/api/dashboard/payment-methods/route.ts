import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq } from "drizzle-orm";
import { payment } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const methodStats = await db
      .select({
        method: payment.paymentMethod,
        totalAmount: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payment)
      .where(eq(payment.paymentStatus, "completed"))
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
