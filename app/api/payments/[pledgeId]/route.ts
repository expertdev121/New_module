import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, paymentPlan, installmentSchedule, solicitor } from "@/lib/db/schema";
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

const allocationUpdateSchema = z.object({
  id: z.number().optional(),
  pledgeId: z.number().positive(),
  allocatedAmount: z.number().positive(),
  notes: z.string().optional().nullable(),
  installmentScheduleId: z.number().optional().nullable(),
  currency: z.enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"]).optional(),
  exchangeRate: z.number().positive().optional(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(["invoice", "confirmation", "receipt", "other"]).optional().nullable(),
  receiptIssued: z.boolean().optional(),
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
  
  // Third-party payment fields from your schema
  payerContactId: z.number().positive("Payer contact ID must be positive").optional().nullable(),
  isThirdPartyPayment: z.boolean().optional(),
  
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
    const { searchParams } = new URL(request.url);
    const queryParams = QueryParamsSchema.parse({
      pledgeId: parseInt(id, 10),
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "10", 10),
      search: searchParams.get("search") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
    });

    const { pledgeId, page, limit, search, paymentStatus } = queryParams;

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
        
        // Computed fields
        isSplitPayment: sql<boolean>`(
          SELECT COUNT(*) > 0 FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("isSplitPayment"),
        allocationCount: sql<number>`(
          SELECT COUNT(*) FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("allocationCount"),
        solicitorName: sql<string>`(
          SELECT CONCAT(first_name, ' ', last_name) 
          FROM ${solicitor} 
          WHERE id = ${payment.solicitorId}
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

          return { ...paymentItem, allocations };
        }
        return paymentItem;
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
    const paymentId = parseInt(pledgeId);

    if (isNaN(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    // Get payment before deleting
    const existingPayment = await db
      .select()
      .from(payment)
      .where(eq(payment.id, paymentId))
      .limit(1);

    if (existingPayment.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const currentPayment = existingPayment[0];

    // Get allocations if it's a split payment
    const existingAllocations = await db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    // Delete payment
    await db.delete(payment).where(eq(payment.id, paymentId));

    // Update related pledge totals
    if (existingAllocations.length > 0) {
      // Split payment: update each unique pledge in allocations
      const uniquePledgeIds = [
        ...new Set(existingAllocations.map(a => a.pledgeId))
      ];
      for (const pledgeId of uniquePledgeIds) {
        await updatePledgeTotals(pledgeId);
      }
    } else if (currentPayment.pledgeId) {
      // Regular payment: update its single pledge
      await updatePledgeTotals(currentPayment.pledgeId);
    }

    // Update payment plan totals if applicable
    if (currentPayment.paymentPlanId) {
      await updatePaymentPlanTotals(currentPayment.paymentPlanId);
    }

    // Update installment schedule status if applicable
    if (currentPayment.installmentScheduleId) {
      await updateInstallmentScheduleStatus(
        currentPayment.installmentScheduleId,
        "pending", // Because deleting means it's unpaid now
        null
      );
    }

    return NextResponse.json({
      message: "Payment deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting payment:", error);
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
    const pledgeId = parseInt(rawPledgeId);

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
    const existingPayment = await db.select().from(payment).where(eq(payment.id, paymentId)).limit(1);

    if (existingPayment.length === 0) {
      throw new AppError("Payment not found.", 404);
    }
    const currentPayment = existingPayment[0];

    if (validatedData.isSplitPayment) {
      const existingAllocations = await db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

      if (existingAllocations.length === 0) {
        // Converting to split payment
        if (!Array.isArray(validatedData.allocations) || validatedData.allocations.length === 0) {
          throw new AppError(
            "Allocations must be provided when converting to split payment.",
            400
          );
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
        }

        // Filter out form-only fields and update payment
        const { 
          paymentId: _, 
          allocations: __, 
          isSplitPayment: ___, 
          autoAdjustAllocations: ____, 
          redistributionMethod: _____, 
          ...dataToUpdate 
        } = validatedData;
        
        const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
          ...dataToUpdate,
          updatedAt: new Date(),
        };
        
        // Convert numeric fields to strings for database storage
        ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
          (f) => {
            if (updateData[f] !== undefined && updateData[f] !== null)
              updateData[f] = updateData[f].toString();
          }
        );

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
      } else {
        // Updating existing split payment
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
          }

          // Update payment
          const { 
            paymentId: _, 
            allocations: __, 
            isSplitPayment: ___, 
            autoAdjustAllocations: ____, 
            redistributionMethod: _____, 
            ...dataToUpdate 
          } = validatedData;
          
          const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
            ...dataToUpdate,
            updatedAt: new Date(),
          };

          ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
            (f) => {
              if (updateData[f] !== undefined && updateData[f] !== null)
                updateData[f] = updateData[f].toString();
            }
          );

          await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

          // Update existing allocations
          for (const allocation of validatedData.allocations) {
            if (!allocation?.id) continue;

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

            const allocationUpdateData: Record<string, string | boolean | number | null | undefined | Date> = {
              pledgeId: allocation.pledgeId,
              allocatedAmount: allocation.allocatedAmount.toString(),
              allocatedAmountUsd,
              notes: allocation.notes ?? null,
              installmentScheduleId: allocation.installmentScheduleId ?? null,
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
          const { 
            paymentId: _, 
            allocations: __, 
            isSplitPayment: ___, 
            autoAdjustAllocations: ____, 
            redistributionMethod: _____, 
            ...dataToUpdate 
          } = validatedData;
          
          const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
            ...dataToUpdate,
            updatedAt: new Date(),
          };

          ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
            (f) => {
              if (updateData[f] !== undefined && updateData[f] !== null)
                updateData[f] = updateData[f].toString();
            }
          );

          await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
        }
      }
    } else {
      // Regular (non-split) payment update
      const existingAllocations = await db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));
      
      if (existingAllocations.length > 0) {
        throw new AppError(
          "Cannot update split payment as regular payment",
          400,
          {
            details: `This payment has ${existingAllocations.length} allocations and must be updated as a split payment.`,
            allocationCount: existingAllocations.length,
          }
        );
      }

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
      }

      const { 
        paymentId: _, 
        allocations: __, 
        isSplitPayment: ___, 
        autoAdjustAllocations: ____, 
        redistributionMethod: _____, 
        ...dataToUpdate 
      } = validatedData;
      
      const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
        ...dataToUpdate,
        pledgeId: validatedData.pledgeId || currentPayment.pledgeId,
        updatedAt: new Date(),
      };

      ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
        (f) => {
          if (updateData[f] !== undefined && updateData[f] !== null)
            updateData[f] = updateData[f].toString();
        }
      );

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
    }

    // Get updated payment
    const updatedPaymentRows = await db
      .select()
      .from(payment)
      .where(eq(payment.id, validatedData.paymentId))
      .limit(1);

    if (updatedPaymentRows.length === 0) {
      throw new AppError("Failed to fetch updated payment", 500);
    }
    const updatedPayment = updatedPaymentRows[0];

    // Update related entities
    if (updatedPayment.paymentPlanId) {
      await updatePaymentPlanTotals(updatedPayment.paymentPlanId);
    }

    if (updatedPayment.installmentScheduleId && validatedData.paymentStatus) {
      await updateInstallmentScheduleStatus(
        updatedPayment.installmentScheduleId,
        validatedData.paymentStatus,
        validatedData.receivedDate || validatedData.paymentDate
      );
    }

    // Update pledge totals for the main pledge
    if (updatedPayment.pledgeId) {
      await updatePledgeTotals(updatedPayment.pledgeId);
    }

    // Update pledge totals for any allocated pledges (in case of split payments)
    if (validatedData.isSplitPayment && validatedData.allocations) {
      const uniquePledgeIds = [...new Set(validatedData.allocations.map(a => a.pledgeId))];
      for (const pledgeId of uniquePledgeIds) {
        if (pledgeId !== updatedPayment.pledgeId) {
          await updatePledgeTotals(pledgeId);
        }
      }
    }

    // If the payment was moved from one pledge to another, update the old pledge too
    if (validatedData.pledgeId && validatedData.pledgeId !== currentPayment.pledgeId && currentPayment.pledgeId) {
      await updatePledgeTotals(currentPayment.pledgeId);
    }

    // Get allocations for response
   let allocations: AllocationResponse[] | null = null;
    if (validatedData.isSplitPayment) {
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
      message: `${validatedData.isSplitPayment ? "Split payment" : "Payment"} updated successfully`,
      payment: {
        ...updatedPayment,
        allocations,
        isSplitPayment: validatedData.isSplitPayment ?? false,
        allocationCount: allocations?.length ?? 0,
        pledgeDescription,
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
