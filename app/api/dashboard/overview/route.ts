import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lt, lte, SQL } from "drizzle-orm";
import { contact, pledge, payment, paymentPlan, installmentSchedule } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "1m"; // Default to 1 month
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let contactsGrowthPercentage = 0;
    let totalContacts = 0;

    if (startDate && endDate) {
      // For custom dates, calculate total contacts and growth within the date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // Total contacts within the date range
      const totalContactsResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contact)
        .where(and(
          gte(contact.createdAt, start),
          lte(contact.createdAt, end)
        ));
      totalContacts = totalContactsResult[0]?.count || 0;

      // For custom dates, we can't easily calculate growth percentage, so set to 0
      contactsGrowthPercentage = 0;
    } else {
      // Calculate period in days
      const periodDays = period === "1m" ? 30 : period === "3m" ? 90 : period === "6m" ? 180 : period === "1y" ? 365 : 730; // all = 2 years

      // Total contacts
      const totalContactsResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contact);
      totalContacts = totalContactsResult[0]?.count || 0;

      // Contacts growth percentage (current period vs previous period)
      const now = new Date();
      const currentPeriodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const previousPeriodStart = new Date(now.getTime() - 2 * periodDays * 24 * 60 * 60 * 1000);
      const previousPeriodEnd = currentPeriodStart;

      const currentPeriodContactsResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contact)
        .where(gte(contact.createdAt, currentPeriodStart));
      const currentPeriodContacts = currentPeriodContactsResult[0]?.count || 0;

      const previousPeriodContactsResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contact)
        .where(and(
          gte(contact.createdAt, previousPeriodStart),
          lt(contact.createdAt, previousPeriodEnd)
        ));
      const previousPeriodContacts = previousPeriodContactsResult[0]?.count || 0;

      contactsGrowthPercentage = previousPeriodContacts > 0
        ? ((currentPeriodContacts - previousPeriodContacts) / previousPeriodContacts) * 100
        : 0;
    }

    let pledgeWhereCondition: SQL<unknown> = sql`1=1`;
    let paymentWhereCondition: SQL<unknown> = eq(payment.paymentStatus, "completed");

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      pledgeWhereCondition = and(
        gte(pledge.pledgeDate, start.toISOString().split('T')[0]),
        lte(pledge.pledgeDate, end.toISOString().split('T')[0])
      ) as SQL<unknown>;
      paymentWhereCondition = and(
        eq(payment.paymentStatus, "completed"),
        gte(payment.paymentDate, start.toISOString().split('T')[0]),
        lte(payment.paymentDate, end.toISOString().split('T')[0])
      )as SQL<unknown>;
    }

    // Total pledges and amount
    const pledgesResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        avgSize: sql<number>`COALESCE(AVG(${pledge.originalAmountUsd}), 0)`,
      })
      .from(pledge)
      .where(pledgeWhereCondition);
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
      .where(paymentWhereCondition);
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
