import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, contact } from "@/lib/db/schema";
import { eq, desc, or, ilike, and, SQL, sql, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PaymentStatusEnum = z.enum([
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "processing",
  "expected"
]);

const QueryParamsSchema = z.object({
  contactId: z.number().positive(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  showPaymentsMade: z.boolean().optional(),
  showPaymentsReceived: z.boolean().optional(),
});

type QueryParams = z.infer<typeof QueryParamsSchema>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string }> }
) {
  const { id } = await params;
  const contactId = id ? parseInt(id, 10) : null;
  const { searchParams } = new URL(request.url);
  
  try {
    const queryParams: QueryParams = QueryParamsSchema.parse({
      contactId: contactId,
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "10", 10),
      search: searchParams.get("search") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
      showPaymentsMade: searchParams.get("showPaymentsMade") === "true",
      showPaymentsReceived: searchParams.get("showPaymentsReceived") === "true",
    });

    const {
      contactId: contactIdNum,
      page,
      limit,
      search,
      paymentStatus,
      showPaymentsMade,
      showPaymentsReceived,
    } = queryParams;

    // Get pledges owned by this contact
    const pledges = await db
      .select({ id: pledge.id })
      .from(pledge)
      .where(eq(pledge.contactId, contactIdNum));

    const pledgeIds = pledges.map((p) => p.id);

    let query = db
      .select({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        amountUsd: payment.amountUsd,
        paymentDate: payment.paymentDate,
        receivedDate: payment.receivedDate,
        paymentMethod: payment.paymentMethod,
        methodDetail: payment.methodDetail,
        paymentStatus: payment.paymentStatus,
        referenceNumber: payment.referenceNumber,
        checkNumber: payment.checkNumber,
        receiptNumber: payment.receiptNumber,
        receiptIssued: payment.receiptIssued,
        notes: payment.notes,
        paymentPlanId: payment.paymentPlanId,
        pledgeId: payment.pledgeId,
        
        // Third-party payment fields
        isThirdPartyPayment: payment.isThirdPartyPayment,
        payerContactId: payment.payerContactId,
        
        // Get payer contact name for third-party payments
        payerContactName: sql<string>`(
          CASE 
            WHEN ${payment.payerContactId} IS NOT NULL THEN 
              (SELECT CONCAT(first_name, ' ', last_name)
               FROM ${contact} 
               WHERE id = ${payment.payerContactId})
            ELSE NULL
          END
        )`.as("payerContactName"),
        
        // Check if it's a split payment
        isSplitPayment: sql<boolean>`(
          SELECT COUNT(*) > 0 FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("isSplitPayment"),
      })
      .from(payment)
      .$dynamic();

    // FIXED: Proper filtering logic for third-party payments
    const baseConditions: SQL<unknown>[] = [];

    if (showPaymentsMade === true && showPaymentsReceived === false) {
      // Show only payments made BY this contact (third-party payments they made)
      baseConditions.push(eq(payment.payerContactId, contactIdNum));
    } else if (showPaymentsReceived === true && showPaymentsMade === false) {
      // Show only direct payments to their own pledges (exclude third-party payments from others)
      if (pledgeIds.length > 0) {
        baseConditions.push(
          and(
            inArray(payment.pledgeId, pledgeIds),
            or(
              eq(payment.isThirdPartyPayment, false),
              sql`${payment.isThirdPartyPayment} IS NULL`
            )
          )!
        );
      } else {
        return NextResponse.json({ payments: [] });
      }
    } else {
      // Default: Show payments made by contact + direct payments to their pledges
      const conditions: SQL<unknown>[] = [];
      
      // Payments made by this contact (including third-party payments)
      conditions.push(eq(payment.payerContactId, contactIdNum));
      
      // Direct payments to this contact's pledges (excluding third-party payments from others)
      if (pledgeIds.length > 0) {
        conditions.push(
          and(
            inArray(payment.pledgeId, pledgeIds),
            or(
              eq(payment.isThirdPartyPayment, false),
              sql`${payment.isThirdPartyPayment} IS NULL`
            )
          )!
        );
      }
      
      if (conditions.length > 0) {
        baseConditions.push(or(...conditions)!);
      }
    }

    // Additional filters
    const additionalConditions: SQL<unknown>[] = [];

    if (paymentStatus) {
      additionalConditions.push(eq(payment.paymentStatus, paymentStatus));
    }

    if (search) {
      const searchConditions: SQL<unknown>[] = [];
      searchConditions.push(
        ilike(sql`COALESCE(${payment.notes}, '')`, `%${search}%`)
      );
      searchConditions.push(
        ilike(sql`COALESCE(${payment.referenceNumber}, '')`, `%${search}%`)
      );
      searchConditions.push(
        ilike(sql`COALESCE(${payment.checkNumber}, '')`, `%${search}%`)
      );
      searchConditions.push(
        ilike(sql`COALESCE(${payment.receiptNumber}, '')`, `%${search}%`)
      );
      additionalConditions.push(or(...searchConditions)!);
    }

    // Combine all conditions
    const allConditions = [...baseConditions, ...additionalConditions];
    if (allConditions.length > 0) {
      query = query.where(and(...allConditions));
    }

    const offset = (page - 1) * limit;
    query = query
      .limit(limit)
      .offset(offset)
      .orderBy(desc(payment.paymentDate));

    const payments = await query;

    return NextResponse.json(
      { payments },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}
