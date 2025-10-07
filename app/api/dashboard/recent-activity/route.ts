import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, desc } from "drizzle-orm";
import { contact, payment, pledge } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5");

    // Recent payments
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
      .where(eq(payment.paymentStatus, "completed"))
      .orderBy(desc(payment.paymentDate))
      .limit(limit);

    // Recent pledges
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
