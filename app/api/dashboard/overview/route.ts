import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lt } from "drizzle-orm";
import { contact, pledge, payment, paymentPlan, installmentSchedule } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    // Total contacts
    const totalContactsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contact);
    const totalContacts = totalContactsResult[0]?.count || 0;

    // Contacts growth percentage (last 30 days vs previous 30 days)
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const currentPeriodContactsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contact)
      .where(gte(contact.createdAt, last30Days));
    const currentPeriodContacts = currentPeriodContactsResult[0]?.count || 0;

    const previousPeriodContactsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contact)
      .where(and(
        gte(contact.createdAt, previous30Days),
        lt(contact.createdAt, last30Days)
      ));
    const previousPeriodContacts = previousPeriodContactsResult[0]?.count || 0;

    const contactsGrowthPercentage = previousPeriodContacts > 0
      ? ((currentPeriodContacts - previousPeriodContacts) / previousPeriodContacts) * 100
      : 0;

    // Total pledges and amount
    const pledgesResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        avgSize: sql<number>`COALESCE(AVG(${pledge.originalAmountUsd}), 0)`,
      })
      .from(pledge);
    const totalPledges = pledgesResult[0]?.count || 0;
    const totalPledgeAmount = pledgesResult[0]?.totalAmount || 0;
    const avgPledgeSize = pledgesResult[0]?.avgSize || 0;

    // Total payments and amount (completed only)
    const paymentsResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)`,
        avgSize: sql<number>`COALESCE(AVG(${payment.amountUsd}), 0)`,
      })
      .from(payment)
      .where(eq(payment.paymentStatus, "completed"));
    const totalPayments = paymentsResult[0]?.count || 0;
    const totalPaymentAmount = paymentsResult[0]?.totalAmount || 0;
    const avgPaymentSize = paymentsResult[0]?.avgSize || 0;

    // Active plans
    const activePlansResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(paymentPlan)
      .where(eq(paymentPlan.planStatus, "active"));
    const activePlans = activePlansResult[0]?.count || 0;

    // Scheduled payments (pending installments)
    const scheduledPaymentsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(installmentSchedule)
      .where(eq(installmentSchedule.status, "pending"));
    const scheduledPayments = scheduledPaymentsResult[0]?.count || 0;

    // Unscheduled payments (completed payments not linked to installments)
    const unscheduledPaymentsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(payment)
      .where(and(
        eq(payment.paymentStatus, "completed"),
        sql`${payment.installmentScheduleId} IS NULL`
      ));
    const unscheduledPayments = unscheduledPaymentsResult[0]?.count || 0;

    // Third party payments
    const thirdPartyPaymentsResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(payment)
      .where(and(
        eq(payment.paymentStatus, "completed"),
        eq(payment.isThirdPartyPayment, true)
      ));
    const thirdPartyPayments = thirdPartyPaymentsResult[0]?.count || 0;

    // Collection rate
    const collectionRate = totalPledgeAmount > 0 ? (totalPaymentAmount / totalPledgeAmount) * 100 : 0;

    return NextResponse.json({
      totalContacts,
      contactsGrowthPercentage: Math.round(contactsGrowthPercentage * 100) / 100,
      totalPledges,
      totalPledgeAmount,
      totalPayments,
      totalPaymentAmount,
      activePlans,
      scheduledPayments,
      unscheduledPayments,
      thirdPartyPayments,
      collectionRate: Math.round(collectionRate * 100) / 100, // Round to 2 decimals
      avgPledgeSize: Math.round(avgPledgeSize * 100) / 100,
      avgPaymentSize: Math.round(avgPaymentSize * 100) / 100,
    });
  } catch (error) {
    console.error("Error fetching dashboard overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard overview" },
      { status: 500 }
    );
  }
}
