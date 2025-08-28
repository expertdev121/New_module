import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, paymentPlan, installmentSchedule, solicitor, bonusCalculation, contact } from "@/lib/db/schema";
import { ErrorHandler } from "@/lib/error-handler";
import { eq, desc, or, ilike, and, SQL, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { NewPaymentAllocation } from "@/lib/db/schema";

class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Updated to match your database schema
const PaymentStatusEnum = z.enum([
  "pending",
  "completed", 
  "failed",
  "cancelled",
  "refunded",
  "processing"
]);

const QueryParamsSchema = z.object({
  pledgeId: z.number().positive(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  paymentStatus: PaymentStatusEnum.optional(),
});

// Updated schema to handle both field names with backward compatibility
const allocationUpdateSchema = z.object({
  id: z.number().optional(),
  pledgeId: z.number().positive(),
  // Support both field names for backward compatibility
  allocatedAmount: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  notes: z.string().optional().nullable(),
  installmentScheduleId: z.number().optional().nullable(),
  currency: z.enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"]).optional(),
  exchangeRate: z.number().positive().optional(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(["invoice", "confirmation", "receipt", "other"]).optional().nullable(),
  receiptIssued: z.boolean().optional(),
}).refine((data) => {
  // Ensure at least one amount field is provided
  return data.allocatedAmount !== undefined || data.amount !== undefined;
}, {
  message: "Either allocatedAmount or amount must be provided",
}).transform((data) => {
  // Normalize to use allocatedAmount consistently
  return {
    ...data,
    allocatedAmount: data.allocatedAmount ?? data.amount!,
    amount: undefined, // Remove amount after transformation
  };
});

const updatePaymentSchema = z.object({
  paymentId: z.number().positive("Payment ID is required and must be positive"),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"]).optional(),
  amountUsd: z.number().positive("Amount in USD must be positive").optional(),
  amountInPledgeCurrency: z.number().positive("Amount in pledge currency must be positive").optional(),
  exchangeRate: z.number().positive("Exchange rate must be positive").optional(),
  paymentDate: z.string().min(1, "Payment date is required").optional(),
  receivedDate: z.string().optional().nullable(),
  paymentMethod: z.enum([
    "ach", "bill_pay", "cash", "check", "credit", "credit_card", "expected",
    "goods_and_services", "matching_funds", "money_order", "p2p", "pending",
    "refund", "scholarship", "stock", "student_portion", "unknown", "wire", "xfer", "other"
  ]).optional(),
  methodDetail: z.string().optional().nullable(),
  paymentStatus: PaymentStatusEnum.optional(),
  account: z.string().optional().nullable(),
  checkDate: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(["invoice", "confirmation", "receipt", "other"]).optional().nullable(),
  receiptIssued: z.boolean().optional(),
  solicitorId: z.number().positive("Solicitor ID must be positive").optional().nullable(),
  bonusPercentage: z.number().min(0).max(100).optional().nullable(),
  bonusAmount: z.number().min(0).optional().nullable(),
  bonusRuleId: z.number().positive("Bonus rule ID must be positive").optional().nullable(),
  notes: z.string().optional().nullable(),
  pledgeId: z.number().positive("Pledge ID must be positive").optional().nullable(),
  paymentPlanId: z.number().positive("Payment plan ID must be positive").optional().nullable(),
  installmentScheduleId: z.number().positive("Installment schedule ID must be positive").optional().nullable(),
  
  // Third-party payment fields - Updated to match your form
  payerContactId: z.number().positive("Payer contact ID must be positive").optional().nullable(),
  isThirdPartyPayment: z.boolean().optional(),
  thirdPartyContactId: z.number().positive("Third-party contact ID must be positive").optional().nullable(),
  
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationUpdateSchema).optional(),
  // Form-only fields that won't be saved to database
  autoAdjustAllocations: z.boolean().optional(),
  redistributionMethod: z.enum(["proportional", "equal", "custom"]).optional(),
}).refine((data) => {
  if (data.isSplitPayment && data.allocations && data.allocations.length > 0 && data.amount) {
    const totalAllocated = data.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    const difference = Math.abs(totalAllocated - data.amount);
    return difference < 0.01;
  }
  return true;
}, {
  message: "Total allocation amount must equal the payment amount for split payments",
}).refine((data) => {
  // Third-party payment validation - Updated to match form logic
  if (data.isThirdPartyPayment && !data.thirdPartyContactId) {
    return false;
  }
  return true;
}, {
  message: "Third-party contact must be selected for third-party payments",
  path: ["thirdPartyContactId"],
});

type AllocationResponse = {
  id: number;
  pledgeId: number;
  allocatedAmount: number;
  notes: string | null;
  currency: string | null;
  installmentScheduleId: number | null;
  receiptNumber: string | null;
  receiptType: string | null;
  receiptIssued: boolean | null;
  createdAt: Date;
  updatedAt: string | null;
};

async function updatePaymentPlanTotals(paymentPlanId: number) {
  const payments = await db
    .select({
      amount: payment.amount,
      paymentStatus: payment.paymentStatus,
    })
    .from(payment)
    .where(and(
      eq(payment.paymentPlanId, paymentPlanId),
      or(
        eq(payment.paymentStatus, "completed"),
        eq(payment.paymentStatus, "processing")
      )
    ));

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const installmentsPaid = payments.length;

  const paymentPlanResult = await db
    .select({
      totalPlannedAmount: paymentPlan.totalPlannedAmount,
    })
    .from(paymentPlan)
    .where(eq(paymentPlan.id, paymentPlanId))
    .limit(1);

  if (paymentPlanResult.length > 0) {
    const totalPlanned = parseFloat(paymentPlanResult[0].totalPlannedAmount);
    const remainingAmount = Math.max(0, totalPlanned - totalPaid);

    await db
      .update(paymentPlan)
      .set({
        totalPaid: totalPaid.toString(),
        installmentsPaid,
        remainingAmount: remainingAmount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(paymentPlan.id, paymentPlanId));
  }
}

async function updateInstallmentScheduleStatus(installmentScheduleId: number, paymentStatus: string, paidDate?: string | null) {
  let status: "pending" | "paid" | "overdue" | "cancelled" = "pending";

  if (paymentStatus === "completed" || paymentStatus === "processing") {
    status = "paid";
  } else if (paymentStatus === "cancelled" || paymentStatus === "failed") {
    status = "cancelled";
  }

  await db
    .update(installmentSchedule)
    .set({
      status,
      paidDate: status === "paid" && paidDate ? paidDate : null,
      updatedAt: new Date(),
    })
    .where(eq(installmentSchedule.id, installmentScheduleId));
}

async function updatePledgeTotals(pledgeId: number) {
  // Get all completed/processing payments for this pledge
  const payments = await db
    .select({
      amount: payment.amount,
      amountUsd: payment.amountUsd,
      amountInPledgeCurrency: payment.amountInPledgeCurrency,
      paymentStatus: payment.paymentStatus,
      currency: payment.currency,
    })
    .from(payment)
    .where(and(
      eq(payment.pledgeId, pledgeId),
      or(
        eq(payment.paymentStatus, "completed"),
        eq(payment.paymentStatus, "processing")
      )
    ));

  // Also get payments from allocations (for split payments)
  const allocatedPayments = await db
    .select({
      allocatedAmount: paymentAllocations.allocatedAmount,
      allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
      currency: paymentAllocations.currency,
      paymentStatus: payment.paymentStatus,
    })
    .from(paymentAllocations)
    .innerJoin(payment, eq(paymentAllocations.paymentId, payment.id))
    .where(and(
      eq(paymentAllocations.pledgeId, pledgeId),
      or(
        eq(payment.paymentStatus, "completed"),
        eq(payment.paymentStatus, "processing")
      )
    ));

  // Get the current pledge to check currency and original amounts
  const pledgeResult = await db
    .select({
      originalAmount: pledge.originalAmount,
      originalAmountUsd: pledge.originalAmountUsd,
      currency: pledge.currency,
      exchangeRate: pledge.exchangeRate,
    })
    .from(pledge)
    .where(eq(pledge.id, pledgeId))
    .limit(1);

  if (pledgeResult.length === 0) {
    throw new AppError("Pledge not found", 404);
  }

  const currentPledge = pledgeResult[0];
  
  // Calculate totals from direct payments (non-split payments)
  const directPaymentTotal = payments.reduce((sum, p) => {
    return sum + parseFloat(p.amount || "0");
  }, 0);

  const directPaymentTotalUsd = payments.reduce((sum, p) => {
    if (p.amountUsd) {
      return sum + parseFloat(p.amountUsd);
    } else if (p.amountInPledgeCurrency && currentPledge.exchangeRate) {
      return sum + (parseFloat(p.amountInPledgeCurrency) * parseFloat(currentPledge.exchangeRate));
    } else if (p.currency === 'USD') {
      return sum + parseFloat(p.amount || "0");
    } else if (currentPledge.exchangeRate) {
      return sum + (parseFloat(p.amount || "0") * parseFloat(currentPledge.exchangeRate));
    }
    return sum;
  }, 0);

  // Calculate totals from allocated payments (split payments)
  const allocatedTotal = allocatedPayments.reduce((sum, a) => {
    return sum + parseFloat(a.allocatedAmount || "0");
  }, 0);

  const allocatedTotalUsd = allocatedPayments.reduce((sum, a) => {
    if (a.allocatedAmountUsd) {
      return sum + parseFloat(a.allocatedAmountUsd);
    } else if (a.currency === 'USD') {
      return sum + parseFloat(a.allocatedAmount || "0");
    } else if (currentPledge.exchangeRate) {
      return sum + (parseFloat(a.allocatedAmount || "0") * parseFloat(currentPledge.exchangeRate));
    }
    return sum;
  }, 0);

  // Combine both totals
  const totalPaid = directPaymentTotal + allocatedTotal;
  const totalPaidUsd = directPaymentTotalUsd + allocatedTotalUsd;

  // Calculate remaining balance
  const originalAmount = parseFloat(currentPledge.originalAmount);
  const balance = Math.max(0, originalAmount - totalPaid);
  
  const originalAmountUsd = currentPledge.originalAmountUsd ? parseFloat(currentPledge.originalAmountUsd) : null;
  const balanceUsd = originalAmountUsd ? Math.max(0, originalAmountUsd - totalPaidUsd) : null;

  // Update the pledge
  await db
    .update(pledge)
    .set({
      totalPaid: totalPaid.toString(),
      balance: balance.toString(),
      totalPaidUsd: totalPaidUsd > 0 ? totalPaidUsd.toString() : null,
      balanceUsd: balanceUsd !== null ? balanceUsd.toString() : null,
      updatedAt: new Date(),
    })
    .where(eq(pledge.id, pledgeId));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pledgeId = parseInt(id, 10);
    
    if (isNaN(pledgeId) || pledgeId <= 0) {
      return NextResponse.json(
        { error: "Invalid pledge ID" }, 
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryParams = QueryParamsSchema.parse({
      pledgeId,
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "10", 10),
      search: searchParams.get("search") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
    });

    const { page, limit, search, paymentStatus } = queryParams;

    let query = db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        relationshipId: payment.relationshipId,
        
        // Third-party payment fields from your schema
        payerContactId: payment.payerContactId,
        isThirdPartyPayment: payment.isThirdPartyPayment,
        
        amount: payment.amount,
        currency: payment.currency,
        amountUsd: payment.amountUsd,
        amountInPledgeCurrency: payment.amountInPledgeCurrency,
        exchangeRate: payment.exchangeRate,
        paymentDate: payment.paymentDate,
        receivedDate: payment.receivedDate,
        paymentMethod: payment.paymentMethod,
        methodDetail: payment.methodDetail,
        paymentStatus: payment.paymentStatus,
        referenceNumber: payment.referenceNumber,
        checkNumber: payment.checkNumber,
        checkDate: payment.checkDate,
        account: payment.account,
        receiptNumber: payment.receiptNumber,
        receiptType: payment.receiptType,
        receiptIssued: payment.receiptIssued,
        solicitorId: payment.solicitorId,
        bonusPercentage: payment.bonusPercentage,
        bonusAmount: payment.bonusAmount,
        bonusRuleId: payment.bonusRuleId,
        notes: payment.notes,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        
        // Related data
        pledgeExchangeRate: pledge.exchangeRate,
        pledgeDescription: pledge.description,
        contactId: pledge.contactId,
        
        // Third-party contact information - Fixed SQL expression
        thirdPartyContactName: sql<string>`(
          SELECT CONCAT(first_name, ' ', last_name) 
          FROM ${contact} 
          WHERE id = ${payment.payerContactId}
        )`.as("thirdPartyContactName"),
        
        payerContactName: sql<string>`(
          SELECT CONCAT(first_name, ' ', last_name) 
          FROM ${contact} 
          WHERE id = (
            SELECT contact_id FROM ${pledge} WHERE id = ${payment.pledgeId}
          )
        )`.as("payerContactName"),
        
        // Computed fields
        isSplitPayment: sql<boolean>`(
          SELECT COUNT(*) > 0 FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("isSplitPayment"),
        allocationCount: sql<number>`(
          SELECT COUNT(*) FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("allocationCount"),
        solicitorName: sql<string>`(
          SELECT CONCAT(first_name, ' ', last_name) 
          FROM ${contact} c
          INNER JOIN ${solicitor} s ON c.id = s.contact_id
          WHERE s.id = ${payment.solicitorId}
        )`.as("solicitorName"),
      })
      .from(payment)
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
      .leftJoin(solicitor, eq(payment.solicitorId, solicitor.id))
      .where(eq(payment.pledgeId, pledgeId))
      .$dynamic();

    const conditions: SQL<unknown>[] = [];
    if (paymentStatus) {
      conditions.push(eq(payment.paymentStatus, paymentStatus));
    }

    if (search) {
      const searchConditions: SQL<unknown>[] = [];
      searchConditions.push(ilike(sql`COALESCE(${payment.notes}, '')`, `%${search}%`));
      searchConditions.push(ilike(sql`COALESCE(${payment.referenceNumber}, '')`, `%${search}%`));
      searchConditions.push(ilike(sql`COALESCE(${payment.checkNumber}, '')`, `%${search}%`));
      searchConditions.push(ilike(sql`COALESCE(${payment.receiptNumber}, '')`, `%${search}%`));
      conditions.push(or(...searchConditions)!);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const offset = (page - 1) * limit;
    query = query.limit(limit).offset(offset).orderBy(desc(payment.createdAt));

    const paymentsResult = await query;

    const paymentsWithAllocations = await Promise.all(
      paymentsResult.map(async (paymentItem) => {
        // Add third-party contact ID for form compatibility
        const enhancedPayment = {
          ...paymentItem,
          thirdPartyContactId: paymentItem.isThirdPartyPayment ? paymentItem.payerContactId : null,
        };

        if (paymentItem.isSplitPayment) {
          const allocationsRaw = await db
            .select({
              id: paymentAllocations.id,
              pledgeId: paymentAllocations.pledgeId,
              installmentScheduleId: paymentAllocations.installmentScheduleId,
              allocatedAmount: paymentAllocations.allocatedAmount,
              currency: paymentAllocations.currency,
              allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
              notes: paymentAllocations.notes,
              receiptNumber: paymentAllocations.receiptNumber,
              receiptType: paymentAllocations.receiptType,
              receiptIssued: paymentAllocations.receiptIssued,
              payerContactId: paymentAllocations.payerContactId,
              pledgeDescription: sql<string>`(
                SELECT description FROM ${pledge} WHERE id = ${paymentAllocations.pledgeId}
              )`.as("pledgeDescription"),
            })
            .from(paymentAllocations)
            .leftJoin(pledge, eq(paymentAllocations.pledgeId, pledge.id))
            .where(eq(paymentAllocations.paymentId, paymentItem.id));

          const allocations = allocationsRaw.map((alloc) => ({
            ...alloc,
            allocatedAmount:
              typeof alloc.allocatedAmount === "string" ? parseFloat(alloc.allocatedAmount) : alloc.allocatedAmount,
          }));

          return { ...enhancedPayment, allocations };
        }
        return enhancedPayment;
      })
    );

    return NextResponse.json(
      { payments: paymentsWithAllocations },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pledgeId: string }> }
) {
  try {
    const { pledgeId } = await params;
    const paymentId = parseInt(pledgeId, 10);

    if (isNaN(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    // Get payment with all related data before deleting
    const existingPayment = await db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        paymentDate: payment.paymentDate,
        solicitorId: payment.solicitorId,
      })
      .from(payment)
      .where(eq(payment.id, paymentId))
      .limit(1);

    if (existingPayment.length === 0) {
      throw new AppError("Payment not found", 404);
    }

    const currentPayment = existingPayment[0];

    // Get allocations if it's a split payment (before deletion)
    const existingAllocations = await db
      .select({
        id: paymentAllocations.id,
        pledgeId: paymentAllocations.pledgeId,
        allocatedAmount: paymentAllocations.allocatedAmount,
        installmentScheduleId: paymentAllocations.installmentScheduleId,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    // Get bonus calculations before deletion
    const bonusCalculations = await db
      .select({ id: bonusCalculation.id })
      .from(bonusCalculation)
      .where(eq(bonusCalculation.paymentId, paymentId));

    // 1. Clear any installment schedule references to this payment
    if (currentPayment.installmentScheduleId) {
      await db
        .update(installmentSchedule)
        .set({
          paymentId: null,
          status: "pending",
          paidDate: null,
          updatedAt: new Date(),
        })
        .where(eq(installmentSchedule.id, currentPayment.installmentScheduleId));
    }

    // 2. Clear any installment schedule references from allocations
    if (existingAllocations.length > 0) {
      const allocationInstallmentIds = existingAllocations
        .filter(a => a.installmentScheduleId)
        .map(a => a.installmentScheduleId!);

      if (allocationInstallmentIds.length > 0) {
        // Update each installment schedule individually to avoid complex array queries
        for (const installmentId of allocationInstallmentIds) {
          await db
            .update(installmentSchedule)
            .set({
              status: "pending",
              paidDate: null,
              updatedAt: new Date(),
            })
            .where(eq(installmentSchedule.id, installmentId));
        }
      }
    }

    // 3. Delete bonus calculations (if any)
    if (bonusCalculations.length > 0) {
      await db
        .delete(bonusCalculation)
        .where(eq(bonusCalculation.paymentId, paymentId));
    }

    // 4. Delete payment allocations explicitly (even though they should cascade)
    if (existingAllocations.length > 0) {
      await db
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));
    }

    // 5. Delete the payment itself
    await db
      .delete(payment)
      .where(eq(payment.id, paymentId));

    const deletionResult = {
      deletedPayment: currentPayment,
      allocations: existingAllocations,
      bonusCalculationsDeleted: bonusCalculations.length,
    };

    // After successful deletion, update all related totals
    const { deletedPayment, allocations } = deletionResult;

    // Update pledge totals for split payments
    if (allocations.length > 0) {
      const uniquePledgeIds = [...new Set(allocations.map(a => a.pledgeId))];
      for (const pledgeId of uniquePledgeIds) {
        try {
          await updatePledgeTotals(pledgeId);
        } catch (error) {
          console.error(`Failed to update pledge ${pledgeId} totals:`, error);
          // Continue with other updates even if one fails
        }
      }
    }

    // Update pledge totals for regular payment
    if (deletedPayment.pledgeId && allocations.length === 0) {
      try {
        await updatePledgeTotals(deletedPayment.pledgeId);
      } catch (error) {
        console.error(`Failed to update pledge ${deletedPayment.pledgeId} totals:`, error);
      }
    }

    // Update payment plan totals if applicable
    if (deletedPayment.paymentPlanId) {
      try {
        await updatePaymentPlanTotals(deletedPayment.paymentPlanId);
      } catch (error) {
        console.error(`Failed to update payment plan ${deletedPayment.paymentPlanId} totals:`, error);
      }
    }

    return NextResponse.json({
      message: "Payment deleted successfully",
      details: {
        paymentId: deletedPayment.id,
        amount: deletedPayment.amount,
        wasAllocated: allocations.length > 0,
        allocationsDeleted: allocations.length,
        bonusCalculationsDeleted: deletionResult.bonusCalculationsDeleted,
        pledgesUpdated: allocations.length > 0 
          ? [...new Set(allocations.map(a => a.pledgeId))] 
          : deletedPayment.pledgeId ? [deletedPayment.pledgeId] : [],
        paymentPlanUpdated: deletedPayment.paymentPlanId,
      }
    });

  } catch (error) {
    console.error("Error deleting payment:", error);
    
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    return ErrorHandler.handle(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pledgeId: string }> }
) {
  let validatedData: z.infer<typeof updatePaymentSchema>;
  try {
    const resolvedParams = await params;
    const rawPledgeId = resolvedParams.pledgeId;
    const pledgeId = parseInt(rawPledgeId, 10);

    if (isNaN(pledgeId) || pledgeId <= 0) {
      throw new AppError(
        "Invalid Pledge ID. Please ensure the Pledge ID is in the URL path (e.g., /api/payments/pledge/123).",
        400
      );
    }

    const body: unknown = await request.json();

    try {
      validatedData = updatePaymentSchema.parse(body);
    } catch (zodErr) {
      if (zodErr instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: zodErr.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
              received: issue.code === "invalid_type" ? `${issue.received}` : undefined,
              expected: issue.code === "invalid_type" ? `${issue.expected}` : undefined,
            })),
          },
          { status: 400 }
        );
      }
      throw zodErr;
    }

    const paymentId = validatedData.paymentId;
    
    // Get existing payment with comprehensive data including third-party fields
    const existingPayment = await db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        solicitorId: payment.solicitorId,
        bonusRuleId: payment.bonusRuleId,
        currency: payment.currency,
        exchangeRate: payment.exchangeRate,
        // Third-party fields
        payerContactId: payment.payerContactId,
        isThirdPartyPayment: payment.isThirdPartyPayment,
      })
      .from(payment)
      .where(eq(payment.id, paymentId))
      .limit(1);

    if (existingPayment.length === 0) {
      throw new AppError("Payment not found.", 404);
    }
    const currentPayment = existingPayment[0];

    // Get existing allocations
    const existingAllocations = await db
      .select({
        id: paymentAllocations.id,
        pledgeId: paymentAllocations.pledgeId,
        allocatedAmount: paymentAllocations.allocatedAmount,
        installmentScheduleId: paymentAllocations.installmentScheduleId,
        payerContactId: paymentAllocations.payerContactId,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    const isCurrentlySplit = existingAllocations.length > 0;
    const willBeSplit = validatedData.isSplitPayment === true;

    // Track pledges that need total updates
    const pledgesToUpdate = new Set<number>();
    
    // Always add the current main pledge
    if (currentPayment.pledgeId) {
      pledgesToUpdate.add(currentPayment.pledgeId);
    }
    
    // Add existing allocation pledges
    existingAllocations.forEach(alloc => pledgesToUpdate.add(alloc.pledgeId));

    // Build the update data object with third-party payment support
    const buildUpdateData = (data: typeof validatedData) => {
      const { 
        paymentId: _, 
        allocations: __, 
        isSplitPayment: ___, 
        autoAdjustAllocations: ____, 
        redistributionMethod: _____, 
        thirdPartyContactId: ______, // Remove from base update
        ...dataToUpdate 
      } = data;
      
      // Handle third-party payment logic
      const isThirdParty = data.isThirdPartyPayment && data.thirdPartyContactId;
      
      const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
        ...dataToUpdate,
        // Third-party payment fields
        isThirdPartyPayment: data.isThirdPartyPayment || false,
        payerContactId: isThirdParty ? data.thirdPartyContactId : null,
        updatedAt: new Date(),
      };

      // Convert numeric fields to strings
      ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
        (f) => {
          if (updateData[f] !== undefined && updateData[f] !== null)
            updateData[f] = updateData[f].toString();
        }
      );

      return updateData;
    };

    // SCENARIO 1: Converting split payment to regular payment
    if (isCurrentlySplit && !willBeSplit) {
      console.log("Converting split payment to regular payment");
      
      // Validate that we have a target pledgeId
      const targetPledgeId = validatedData.pledgeId || currentPayment.pledgeId;
      if (!targetPledgeId) {
        throw new AppError("Target pledge ID is required when converting split payment to regular payment", 400);
      }

      // Verify target pledge exists
      const targetPledgeExists = await db
        .select({ id: pledge.id })
        .from(pledge)
        .where(eq(pledge.id, targetPledgeId))
        .limit(1);
      if (targetPledgeExists.length === 0) {
        throw new AppError(`Target pledge with ID ${targetPledgeId} does not exist`, 400);
      }

      // Clear old installment schedule references from allocations
      const allocationInstallmentIds = existingAllocations
        .filter(a => a.installmentScheduleId)
        .map(a => a.installmentScheduleId!);

      if (allocationInstallmentIds.length > 0) {
        for (const installmentId of allocationInstallmentIds) {
          await db
            .update(installmentSchedule)
            .set({
              status: "pending",
              paidDate: null,
              updatedAt: new Date(),
            })
            .where(eq(installmentSchedule.id, installmentId));
        }
      }

      // Delete all existing allocations
      await db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));

      // Update the payment as regular payment
      const updateData = buildUpdateData(validatedData);
      updateData.pledgeId = targetPledgeId;

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

      pledgesToUpdate.add(targetPledgeId);
    }
    
    // SCENARIO 2: Converting regular payment to split payment
    else if (!isCurrentlySplit && willBeSplit) {
      console.log("Converting regular payment to split payment");
      
      if (!Array.isArray(validatedData.allocations) || validatedData.allocations.length === 0) {
        throw new AppError("Allocations must be provided when converting to split payment.", 400);
      }

      const totalAllocated = validatedData.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
      const paymentAmount = validatedData.amount ?? parseFloat(currentPayment.amount);
      
      if (Math.abs(totalAllocated - paymentAmount) > 0.01) {
        throw new AppError(
          "Invalid allocation amounts",
          400,
          {
            details: `Total allocated amount (${totalAllocated.toFixed(2)}) must equal payment amount (${paymentAmount.toFixed(2)}).`,
            totalAllocated,
            paymentAmount,
            difference: Math.abs(totalAllocated - paymentAmount),
          }
        );
      }

      // Validate all allocations
      for (const allocation of validatedData.allocations) {
        if (!allocation.allocatedAmount || allocation.allocatedAmount <= 0) {
          throw new AppError(
            "Invalid allocation amount",
            400,
            { details: `Allocated amount must be positive. Found: ${allocation.allocatedAmount || 0} for pledge ${allocation.pledgeId}` }
          );
        }

        const pledgeExists = await db
          .select({ id: pledge.id })
          .from(pledge)
          .where(eq(pledge.id, allocation.pledgeId))
          .limit(1);
        if (pledgeExists.length === 0) {
          throw new AppError(
            "Invalid pledge ID in allocation",
            400,
            { details: `Pledge with ID ${allocation.pledgeId} does not exist.` }
          );
        }
        
        pledgesToUpdate.add(allocation.pledgeId);
      }

      // Clear old installment schedule reference if exists
      if (currentPayment.installmentScheduleId) {
        await db
          .update(installmentSchedule)
          .set({
            status: "pending",
            paidDate: null,
            updatedAt: new Date(),
          })
          .where(eq(installmentSchedule.id, currentPayment.installmentScheduleId));
      }

      // Update payment (remove pledge assignment for split payments)
      const updateData = buildUpdateData(validatedData);
      updateData.pledgeId = null; // Split payments don't have a main pledgeId
      updateData.installmentScheduleId = null; // Clear installment reference

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

      // Create new allocations
      for (const alloc of validatedData.allocations) {
        let allocatedAmountUsd: string | null = null;

        if (alloc.currency === 'USD') {
          allocatedAmountUsd = alloc.allocatedAmount.toString();
        } else {
          const rate = typeof alloc.exchangeRate === 'number'
            ? alloc.exchangeRate
            : (typeof validatedData.exchangeRate === 'number' ? validatedData.exchangeRate : null);
          allocatedAmountUsd =
            rate !== null
              ? (alloc.allocatedAmount * rate).toFixed(2)
              : null;
        }

        const allocationToInsert: NewPaymentAllocation = {
          paymentId: paymentId,
          pledgeId: alloc.pledgeId,
          allocatedAmount: alloc.allocatedAmount.toString(),
          allocatedAmountUsd,
          currency: alloc.currency ?? validatedData.currency ?? currentPayment.currency,
          installmentScheduleId: alloc.installmentScheduleId ?? null,
          receiptNumber: alloc.receiptNumber ?? null,
          receiptType: alloc.receiptType ?? null,
          receiptIssued: alloc.receiptIssued ?? false,
          notes: alloc.notes ?? null,
          // Add third-party contact tracking for allocations
          payerContactId: validatedData.isThirdPartyPayment ? validatedData.thirdPartyContactId : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.insert(paymentAllocations).values(allocationToInsert);

        if (alloc.installmentScheduleId && validatedData.paymentStatus) {
          await updateInstallmentScheduleStatus(
            alloc.installmentScheduleId,
            validatedData.paymentStatus,
            validatedData.receivedDate || validatedData.paymentDate
          );
        }
      }
    }
    
    // SCENARIO 3: Updating existing split payment
    else if (isCurrentlySplit && willBeSplit) {
      console.log("Updating existing split payment");
      
      if (Array.isArray(validatedData.allocations) && validatedData.allocations.length > 0) {
        const totalAllocated = validatedData.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
        const paymentAmount = validatedData.amount ?? parseFloat(currentPayment.amount);

        if (Math.abs(totalAllocated - paymentAmount) > 0.01) {
          throw new AppError(
            "Invalid allocation amounts",
            400,
            {
              details: `Total allocated amount (${totalAllocated.toFixed(2)}) must equal payment amount (${paymentAmount.toFixed(2)}).`,
              totalAllocated,
              paymentAmount,
              difference: Math.abs(totalAllocated - paymentAmount),
            }
          );
        }

        // Validate allocations
        for (const allocation of validatedData.allocations) {
          if (allocation.id) {
            const existingAllocation = existingAllocations.find((existing) => existing.id === allocation.id);
            if (!existingAllocation) {
              throw new AppError(
                "Invalid allocation ID",
                400,
                { details: `Allocation with ID ${allocation.id} does not exist for this payment.` }
              );
            }
          }

          if (!allocation.allocatedAmount || allocation.allocatedAmount <= 0) {
            throw new AppError(
              "Invalid allocation amount",
              400,
              { details: `Allocated amount must be positive. Found: ${allocation.allocatedAmount || 0} for pledge ${allocation.pledgeId}` }
            );
          }

          const pledgeExists = await db
            .select({ id: pledge.id })
            .from(pledge)
            .where(eq(pledge.id, allocation.pledgeId))
            .limit(1);
          if (pledgeExists.length === 0) {
            throw new AppError(
              "Invalid pledge ID in allocation",
              400,
              { details: `Pledge with ID ${allocation.pledgeId} does not exist.` }
            );
          }
          
          pledgesToUpdate.add(allocation.pledgeId);
        }

        // Find allocations to delete (exist in DB but not in new data)
        const newAllocationIds = validatedData.allocations.filter(a => a.id).map(a => a.id!);
        const allocationsToDelete = existingAllocations.filter(
          existing => !newAllocationIds.includes(existing.id)
        );

        // Clear installment schedule references for allocations being deleted
        for (const allocation of allocationsToDelete) {
          if (allocation.installmentScheduleId) {
            await db
              .update(installmentSchedule)
              .set({
                status: "pending",
                paidDate: null,
                updatedAt: new Date(),
              })
              .where(eq(installmentSchedule.id, allocation.installmentScheduleId));
          }
        }

        // Delete removed allocations
        if (allocationsToDelete.length > 0) {
          for (const allocationToDelete of allocationsToDelete) {
            await db
              .delete(paymentAllocations)
              .where(eq(paymentAllocations.id, allocationToDelete.id));
          }
        }

        // Update payment
        const updateData = buildUpdateData(validatedData);
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

        // Process allocations (update existing, create new)
        for (const allocation of validatedData.allocations) {
          let allocatedAmountUsd: string | null = null;

          if (allocation.currency === 'USD') {
            allocatedAmountUsd = allocation.allocatedAmount.toString();
          } else {
            const rate = typeof allocation.exchangeRate === 'number'
              ? allocation.exchangeRate
              : (typeof validatedData.exchangeRate === 'number' ? validatedData.exchangeRate : null);

            allocatedAmountUsd =
              rate !== null
                ? (allocation.allocatedAmount * rate).toFixed(2)
                : null;
          }

          if (allocation.id) {
            // Update existing allocation
            const allocationUpdateData: Record<string, string | boolean | number | null | undefined | Date> = {
              pledgeId: allocation.pledgeId,
              allocatedAmount: allocation.allocatedAmount.toString(),
              allocatedAmountUsd,
              notes: allocation.notes ?? null,
              installmentScheduleId: allocation.installmentScheduleId ?? null,
              // Update third-party contact tracking
              payerContactId: validatedData.isThirdPartyPayment ? validatedData.thirdPartyContactId : null,
              updatedAt: new Date(),
            };

            if (allocation.currency || validatedData.currency) {
              allocationUpdateData.currency = allocation.currency ?? validatedData.currency;
            }
            if ("receiptNumber" in allocation) {
              allocationUpdateData.receiptNumber = allocation.receiptNumber ?? null;
            }
            if ("receiptType" in allocation) {
              allocationUpdateData.receiptType = allocation.receiptType ?? null;
            }
            if ("receiptIssued" in allocation) {
              allocationUpdateData.receiptIssued = allocation.receiptIssued ?? false;
            }

            await db
              .update(paymentAllocations)
              .set(allocationUpdateData)
              .where(eq(paymentAllocations.id, allocation.id));
          } else {
            // Create new allocation
            const allocationToInsert: NewPaymentAllocation = {
              paymentId: paymentId,
              pledgeId: allocation.pledgeId,
              allocatedAmount: allocation.allocatedAmount.toString(),
              allocatedAmountUsd,
              currency: allocation.currency ?? validatedData.currency ?? currentPayment.currency,
              installmentScheduleId: allocation.installmentScheduleId ?? null,
              receiptNumber: allocation.receiptNumber ?? null,
              receiptType: allocation.receiptType ?? null,
              receiptIssued: allocation.receiptIssued ?? false,
              notes: allocation.notes ?? null,
              // Add third-party contact tracking
              payerContactId: validatedData.isThirdPartyPayment ? validatedData.thirdPartyContactId : null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await db.insert(paymentAllocations).values(allocationToInsert);
          }

          if (allocation.installmentScheduleId && validatedData.paymentStatus) {
            await updateInstallmentScheduleStatus(
              allocation.installmentScheduleId,
              validatedData.paymentStatus,
              validatedData.receivedDate || validatedData.paymentDate
            );
          }
        }
      } else {
        // Update payment without changing allocations
        const updateData = buildUpdateData(validatedData);
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
      }
    }
    
    // SCENARIO 4: Updating regular payment
    else {
      console.log("Updating regular payment");
      
      if (validatedData.pledgeId && validatedData.pledgeId !== pledgeId) {
        const newPledgeExists = await db
          .select({ id: pledge.id })
          .from(pledge)
          .where(eq(pledge.id, validatedData.pledgeId))
          .limit(1);

        if (newPledgeExists.length === 0) {
          throw new AppError(
            "Invalid pledge ID",
            400,
            { details: `Pledge with ID ${validatedData.pledgeId} does not exist.` }
          );
        }
        
        pledgesToUpdate.add(validatedData.pledgeId);
      }

      const updateData = buildUpdateData(validatedData);
      updateData.pledgeId = validatedData.pledgeId || currentPayment.pledgeId;

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
    }

    // Get updated payment with third-party information for response - FIXED SELECT STATEMENT
    const updatedPaymentRows = await db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        relationshipId: payment.relationshipId,
        payerContactId: payment.payerContactId,
        isThirdPartyPayment: payment.isThirdPartyPayment,
        amount: payment.amount,
        currency: payment.currency,
        amountUsd: payment.amountUsd,
        amountInPledgeCurrency: payment.amountInPledgeCurrency,
        exchangeRate: payment.exchangeRate,
        paymentDate: payment.paymentDate,
        receivedDate: payment.receivedDate,
        paymentMethod: payment.paymentMethod,
        methodDetail: payment.methodDetail,
        paymentStatus: payment.paymentStatus,
        referenceNumber: payment.referenceNumber,
        checkNumber: payment.checkNumber,
        checkDate: payment.checkDate,
        account: payment.account,
        receiptNumber: payment.receiptNumber,
        receiptType: payment.receiptType,
        receiptIssued: payment.receiptIssued,
        solicitorId: payment.solicitorId,
        bonusPercentage: payment.bonusPercentage,
        bonusAmount: payment.bonusAmount,
        bonusRuleId: payment.bonusRuleId,
        notes: payment.notes,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        // Third-party contact name - Fixed SQL expression
        thirdPartyContactName: sql<string>`(
          SELECT CONCAT(first_name, ' ', last_name) 
          FROM ${contact} 
          WHERE id = ${payment.payerContactId}
        )`.as("thirdPartyContactName"),
      })
      .from(payment)
      .where(eq(payment.id, validatedData.paymentId))
      .limit(1);

    if (updatedPaymentRows.length === 0) {
      throw new AppError("Failed to fetch updated payment", 500);
    }
    const updatedPayment = updatedPaymentRows[0];

    // Update related entities
    if (updatedPayment.paymentPlanId) {
      try {
        await updatePaymentPlanTotals(updatedPayment.paymentPlanId);
      } catch (error) {
        console.error(`Failed to update payment plan ${updatedPayment.paymentPlanId}:`, error);
      }
    }

    if (updatedPayment.installmentScheduleId && validatedData.paymentStatus) {
      try {
        await updateInstallmentScheduleStatus(
          updatedPayment.installmentScheduleId,
          validatedData.paymentStatus,
          validatedData.receivedDate || validatedData.paymentDate
        );
      } catch (error) {
        console.error(`Failed to update installment schedule ${updatedPayment.installmentScheduleId}:`, error);
      }
    }

    // Update pledge totals for all affected pledges
    for (const pledgeId of pledgesToUpdate) {
      try {
        await updatePledgeTotals(pledgeId);
      } catch (error) {
        console.error(`Failed to update pledge ${pledgeId} totals:`, error);
      }
    }

    // Get allocations for response
    let allocations: AllocationResponse[] | null = null;
    const finalIsSplit = willBeSplit;
    if (finalIsSplit) {
      const rawAllocations = await db
        .select({
          id: paymentAllocations.id,
          pledgeId: paymentAllocations.pledgeId,
          allocatedAmount: paymentAllocations.allocatedAmount,
          notes: paymentAllocations.notes,
          currency: paymentAllocations.currency,
          installmentScheduleId: paymentAllocations.installmentScheduleId,
          receiptNumber: paymentAllocations.receiptNumber,
          receiptType: paymentAllocations.receiptType,
          receiptIssued: paymentAllocations.receiptIssued,
          createdAt: paymentAllocations.createdAt,
          updatedAt: paymentAllocations.updatedAt,
        })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, validatedData.paymentId));

      allocations = rawAllocations.map((alloc) => ({
        ...alloc,
        allocatedAmount:
          typeof alloc.allocatedAmount === "string" ? parseFloat(alloc.allocatedAmount) : alloc.allocatedAmount,
        updatedAt: alloc.updatedAt instanceof Date ? alloc.updatedAt.toISOString() : typeof alloc.updatedAt === "string" ? alloc.updatedAt : null,
      }));
    }

    // Get pledge description for response
    const pledgeDescription = updatedPayment.pledgeId ? 
      (await db.select({description: pledge.description})
        .from(pledge)
        .where(eq(pledge.id, updatedPayment.pledgeId))
        .limit(1))[0]?.description : null;

    return NextResponse.json({
      message: `${finalIsSplit ? "Split payment" : "Payment"} updated successfully`,
      payment: {
        ...updatedPayment,
        allocations,
        isSplitPayment: finalIsSplit,
        allocationCount: allocations?.length ?? 0,
        pledgeDescription,
        // Include third-party information in response for form compatibility
        isThirdPartyPayment: updatedPayment.isThirdPartyPayment,
        thirdPartyContactId: updatedPayment.payerContactId,
        thirdPartyContactName: updatedPayment.thirdPartyContactName,
      },
    });
    
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, ...(err.details ? { details: err.details } : {}) },
        { status: err.statusCode }
      );
    }
    return ErrorHandler.handle(err);
  }
}
