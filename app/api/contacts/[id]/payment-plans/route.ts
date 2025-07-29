import { db } from "@/lib/db";
import { paymentPlan, pledge } from "@/lib/db/schema";
import { eq, desc, or, ilike, and, SQL, sql, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PlanStatusEnum = z.enum([
  "active",
  "completed",
  "cancelled",
  "paused",
  "overdue",
]);

const QueryParamsSchema = z.object({
  contactId: z.number().positive(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  planStatus: PlanStatusEnum.optional(),
});

type QueryParams = z.infer<typeof QueryParamsSchema>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const queryParams: QueryParams = QueryParamsSchema.parse({
      contactId: parseInt(id, 10),
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "10", 10),
      search: searchParams.get("search") || undefined,
      planStatus: searchParams.get("planStatus") || undefined,
    });

    const {
      contactId: contactIdNum,
      page,
      limit,
      search,
      planStatus,
    } = queryParams;

    // First, get all pledge IDs for this contact
    const pledges = await db
      .select({ id: pledge.id })
      .from(pledge)
      .where(eq(pledge.contactId, contactIdNum));

    if (pledges.length === 0) {
      return NextResponse.json({ paymentPlans: [] });
    }

    const pledgeIds = pledges.map((p) => p.id);

    // Build the payment plans query with proper join to get exchange rate and pledge details
    let query = db
      .select({
        id: paymentPlan.id,
        pledgeId: paymentPlan.pledgeId,
        planName: paymentPlan.planName,
        frequency: paymentPlan.frequency,
        totalPlannedAmount: paymentPlan.totalPlannedAmount,
        currency: paymentPlan.currency,
        installmentAmount: paymentPlan.installmentAmount,
        numberOfInstallments: paymentPlan.numberOfInstallments,
        startDate: paymentPlan.startDate,
        endDate: paymentPlan.endDate,
        nextPaymentDate: paymentPlan.nextPaymentDate,
        installmentsPaid: paymentPlan.installmentsPaid,
        totalPaid: paymentPlan.totalPaid,
        totalPaidUsd: paymentPlan.totalPaidUsd,
        remainingAmount: paymentPlan.remainingAmount,
        planStatus: paymentPlan.planStatus,
        autoRenew: paymentPlan.autoRenew,
        remindersSent: paymentPlan.remindersSent,
        lastReminderDate: paymentPlan.lastReminderDate,
        isActive: paymentPlan.isActive,
        notes: paymentPlan.notes,
        internalNotes: paymentPlan.internalNotes,
        createdAt: paymentPlan.createdAt,
        updatedAt: paymentPlan.updatedAt,
        exchangeRate: pledge.exchangeRate,
        pledgeExchangeRate: sql<string>`(
          SELECT exchange_rate FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeExchangeRate"),
        pledgeCurrency: sql<string>`(
          SELECT currency FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeCurrency"),
        originalAmountUsd: sql<string>`(
          SELECT original_amount_usd FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("originalAmountUsd"),
        originalAmount: sql<string>`(
          SELECT original_amount FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("originalAmount"),
        // ADD MISSING PLEDGE FIELDS
        pledgeDescription: sql<string>`(
          SELECT description FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeDescription"),
        pledgeDate: sql<string>`(
          SELECT pledge_date FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeDate"),
        pledgeNotes: sql<string>`(
          SELECT notes FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeNotes"),
      })
      .from(paymentPlan)
      .innerJoin(pledge, eq(paymentPlan.pledgeId, pledge.id))
      .where(inArray(paymentPlan.pledgeId, pledgeIds))
      .$dynamic();

    const conditions: SQL<unknown>[] = [];

    if (planStatus) {
      conditions.push(eq(paymentPlan.planStatus, planStatus));
    }

    if (search) {
      const searchConditions: SQL<unknown>[] = [];
      searchConditions.push(
        ilike(sql`COALESCE(${paymentPlan.planName}, '')`, `%${search}%`)
      );
      searchConditions.push(
        ilike(sql`COALESCE(${paymentPlan.notes}, '')`, `%${search}%`)
      );
      searchConditions.push(
        ilike(sql`COALESCE(${paymentPlan.internalNotes}, '')`, `%${search}%`)
      );
      // ADD SEARCH FOR PLEDGE DESCRIPTION
      searchConditions.push(
        ilike(sql`COALESCE((SELECT description FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}), '')`, `%${search}%`)
      );
      conditions.push(or(...searchConditions)!);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const offset = (page - 1) * limit;
    query = query
      .limit(limit)
      .offset(offset)
      .orderBy(desc(paymentPlan.createdAt));

    const paymentPlans = await query;

    return NextResponse.json({ paymentPlans });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch payment plans" },
      { status: 500 }
    );
  }
}
