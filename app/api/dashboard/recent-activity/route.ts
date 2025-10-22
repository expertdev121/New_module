import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, desc, and, gte, lt, lte, SQL } from "drizzle-orm";
import { contact, payment, pledge, user } from "@/lib/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5");
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

    let paymentWhereCondition: SQL<unknown> = eq(payment.paymentStatus, "completed");
    let pledgeWhereCondition: SQL<unknown> | undefined = undefined;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      paymentWhereCondition = and(
        eq(payment.paymentStatus, "completed"),
        gte(payment.paymentDate, start.toISOString().split('T')[0]),
        lte(payment.paymentDate, end.toISOString().split('T')[0])
      ) as SQL<unknown>;
      pledgeWhereCondition = and(
        gte(pledge.pledgeDate, start.toISOString().split('T')[0]),
        lte(pledge.pledgeDate, end.toISOString().split('T')[0])
      );
    }

    // Recent payments (filter by admin's location)
    const recentPayments = await db
      .select({
        type: sql<string>`'payment'`,
        contactName: sql<string>`COALESCE(CONCAT(${contact.firstName}, ' ', ${contact.lastName}), 'Unknown')`,
        amount: payment.amountUsd,
        date: payment.paymentDate,
        method: payment.paymentMethod,
        id: payment.id,
      })
      .from(payment)
      .leftJoin(pledge, eq(payment.pledgeId, pledge.id))
      .leftJoin(contact, sql`COALESCE(${payment.payerContactId}, ${pledge.contactId}) = ${contact.id}`)
      .where(and(
        paymentWhereCondition,
        eq(contact.locationId, adminLocationId)
      ))
      .orderBy(desc(payment.paymentDate))
      .limit(limit);

    // Recent pledges (filter by admin's location)
    const recentPledges = await db
      .select({
        type: sql<string>`'pledge'`,
        contactName: sql<string>`CONCAT(${contact.firstName}, ' ', ${contact.lastName})`,
        amount: pledge.originalAmountUsd,
        date: pledge.pledgeDate,
        method: sql<string>`'New Pledge'`,
        id: pledge.id,
      })
      .from(pledge)
      .innerJoin(contact, eq(pledge.contactId, contact.id))
      .where(and(
        pledgeWhereCondition || sql`1=1`,
        eq(contact.locationId, adminLocationId)
      ))
      .orderBy(desc(pledge.pledgeDate))
      .limit(limit);

    // Combine and sort by date
    const combined = [...recentPayments, ...recentPledges]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return NextResponse.json(combined);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent activity" },
      { status: 500 }
    );
  }
}
