import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lt, lte, SQL } from "drizzle-orm";
import { payment, user, pledge, contact } from "@/lib/db/schema";
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
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(and(
        whereCondition,
        eq(contact.locationId, adminLocationId)
      ))
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
