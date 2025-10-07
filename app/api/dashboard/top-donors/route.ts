import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and } from "drizzle-orm";
import { contact, pledge, payment } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5");

    const topDonors = await db
      .select({
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        pledgesCount: sql<number>`COUNT(DISTINCT ${pledge.id})`,
        totalPledged: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        pledgeAmount: sql<number>`COALESCE(SUM(CASE WHEN ${payment.isThirdPartyPayment} = false AND ${payment.paymentStatus} = 'completed' THEN ${payment.amountUsd} ELSE 0 END), 0)`,
        thirdPartyAmount: sql<number>`COALESCE(SUM(CASE WHEN ${payment.isThirdPartyPayment} = true AND ${payment.paymentStatus} = 'completed' THEN ${payment.amountUsd} ELSE 0 END), 0)`,
      })
      .from(contact)
      .leftJoin(pledge, eq(pledge.contactId, contact.id))
      .leftJoin(payment, sql`(${payment.pledgeId} = ${pledge.id} AND ${payment.isThirdPartyPayment} = false) OR (${payment.payerContactId} = ${contact.id} AND ${payment.isThirdPartyPayment} = true)`)
      .groupBy(contact.id, contact.firstName, contact.lastName)
      .having(sql`COUNT(DISTINCT ${pledge.id}) > 0 OR COALESCE(SUM(CASE WHEN ${payment.isThirdPartyPayment} = true AND ${payment.paymentStatus} = 'completed' THEN ${payment.amountUsd} ELSE 0 END), 0) > 0`)
      .orderBy(sql`(COALESCE(SUM(CASE WHEN ${payment.isThirdPartyPayment} = false AND ${payment.paymentStatus} = 'completed' THEN ${payment.amountUsd} ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN ${payment.isThirdPartyPayment} = true AND ${payment.paymentStatus} = 'completed' THEN ${payment.amountUsd} ELSE 0 END), 0)) DESC`)
      .limit(limit);

    const donors = topDonors.map(donor => {
      const totalAmount = donor.pledgeAmount + donor.thirdPartyAmount;
      return {
        name: `${donor.firstName} ${donor.lastName}`,
        pledges: donor.pledgesCount,
        pledgeAmount: donor.pledgeAmount,
        thirdPartyAmount: donor.thirdPartyAmount,
        amount: totalAmount,
        pledgedAmount: donor.totalPledged,
        completion: donor.totalPledged > 0 ? (donor.pledgeAmount / donor.totalPledged) * 100 : 0,
      };
    });

    return NextResponse.json(donors);
  } catch (error) {
    console.error("Error fetching top donors:", error);
    return NextResponse.json(
      { error: "Failed to fetch top donors" },
      { status: 500 }
    );
  }
}
