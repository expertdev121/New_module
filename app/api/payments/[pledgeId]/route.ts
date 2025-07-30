import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations } from "@/lib/db/schema";
import { ErrorHandler } from "@/lib/error-handler";
import { eq, desc, or, ilike, and, SQL, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const PaymentStatusEnum = z.enum([
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "processing",
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

  // Receipt fields made optional and nullable
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
  referenceNumber: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),

  // Receipt fields on payment made optional and nullable
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
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationUpdateSchema).optional(),
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

// --- GET handler ---
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
        pledgeExchangeRate: pledge.exchangeRate,
        isSplitPayment: sql<boolean>`(
          SELECT COUNT(*) > 0 FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("isSplitPayment"),
        allocationCount: sql<number>`(
          SELECT COUNT(*) FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("allocationCount"),
      })
      .from(payment)
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
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
            allocatedAmount: typeof alloc.allocatedAmount === "string" ? parseFloat(alloc.allocatedAmount) : alloc.allocatedAmount,
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

// --- PATCH handler ---
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
        throw new AppError(
          "This payment is not a split payment. No allocations found.",
          400,
          { details: "Cannot update as split payment when no allocations exist." }
        );
      }

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

        // Update payment excluding allocations and isSplitPayment
        const { paymentId: _, allocations: __, isSplitPayment: ___, ...dataToUpdate } = validatedData;
        const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
          ...dataToUpdate,
          pledgeId: null,
          updatedAt: new Date(),
        };
        ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
          (f) => { if (updateData[f] !== undefined && updateData[f] !== null) updateData[f] = updateData[f].toString(); }
        );
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

        // Update allocation records including receipt fields
        for (const allocation of validatedData.allocations) {
          if (!allocation?.id) continue;
          const allocationUpdateData: Record<string, string | boolean | null | undefined | Date> = {
            allocatedAmount: allocation.allocatedAmount.toString(),
            notes: allocation.notes ?? null,
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
        }
      } else {
        // Update payment only when no allocations updates sent
        const { paymentId: _, allocations: __, isSplitPayment: ___, ...dataToUpdate } = validatedData;
        const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
          ...dataToUpdate,
          pledgeId: null,
          updatedAt: new Date(),
        };
        ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
          (f) => { if (updateData[f] !== undefined && updateData[f] !== null) updateData[f] = updateData[f].toString(); }
        );
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
      }
    } else {
      // Regular payment update
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
        throw new AppError(
          "Pledge ID mismatch",
          400,
          { details: `Cannot change pledge association from ${pledgeId} to ${validatedData.pledgeId} in regular payment update.` }
        );
      }
      const { paymentId: _, allocations: __, isSplitPayment: ___, ...dataToUpdate } = validatedData;
      const updateData: Record<string, string | number | boolean | null | undefined | Date> = {
        ...dataToUpdate,
        pledgeId: null,
        updatedAt: new Date(),
      };
      ["amount", "amountUsd", "amountInPledgeCurrency", "exchangeRate", "bonusPercentage", "bonusAmount"].forEach(
        (f) => { if (updateData[f] !== undefined && updateData[f] !== null) updateData[f] = updateData[f].toString(); }
      );
      await db.update(payment).set(updateData).where(and(eq(payment.id, paymentId), eq(payment.pledgeId, pledgeId)));
    }

    // Fetch updated payment
    const updatedPaymentRows = await db
      .select()
      .from(payment)
      .where(eq(payment.id, validatedData.paymentId))
      .limit(1);

    if (updatedPaymentRows.length === 0) {
      throw new AppError("Failed to fetch updated payment", 500);
    }
    const updatedPayment = updatedPaymentRows[0];

    // Fetch allocations if split payment
    let allocations: (z.infer<typeof allocationUpdateSchema> & { updatedAt: string | null })[] | null = null;
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
        allocatedAmount: typeof alloc.allocatedAmount === "string" ? parseFloat(alloc.allocatedAmount) : alloc.allocatedAmount,
        updatedAt: alloc.updatedAt instanceof Date ? alloc.updatedAt.toISOString() : typeof alloc.updatedAt === "string" ? alloc.updatedAt : null,
      }));
    }

    return NextResponse.json({
      message: `${validatedData.isSplitPayment ? "Split payment" : "Payment"} updated successfully`,
      payment: {
        ...updatedPayment,
        allocations,
        isSplitPayment: validatedData.isSplitPayment ?? false,
        allocationCount: allocations?.length ?? 0,
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
