import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, installmentSchedule, paymentPlan, solicitor } from "@/lib/db/schema";
import { sql, eq, and, or } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
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

const paymentMethodValues = [
  "ach", "bill_pay", "cash", "check", "credit", "credit_card", "expected",
  "goods_and_services", "matching_funds", "money_order", "p2p", "pending",
  "refund", "scholarship", "stock", "student_portion", "unknown", "wire", "xfer", "other"
] as const;

const methodDetailValues = [
  "achisomoch", "authorize", "bank_of_america_charitable", "banquest", "banquest_cm",
  "benevity", "chai_charitable", "charityvest_inc", "cjp", "donors_fund", "earthport",
  "e_transfer", "facts", "fidelity", "fjc", "foundation", "goldman_sachs", "htc",
  "jcf", "jcf_san_diego", "jgive", "keshet", "masa", "masa_old", "matach",
  "matching_funds", "mizrachi_canada", "mizrachi_olami", "montrose", "morgan_stanley_gift",
  "ms", "mt", "ojc", "paypal", "pelecard", "schwab_charitable", "stripe", "tiaa",
  "touro", "uktoremet", "vanguard_charitable", "venmo", "vmm", "wise", "worldline",
  "yaadpay", "yaadpay_cm", "yourcause", "yu", "zelle"
] as const;

const supportedCurrencies = ["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"] as const;
const receiptTypeValues = ["invoice", "receipt", "confirmation", "other"] as const;
const paymentStatusValues = [
  "pending", "completed", "failed", "cancelled", "refunded", "processing"
] as const;

const querySchema = z.object({
  pledgeId: z.preprocess((val) => parseInt(String(val), 10), z.number().positive()).optional(),
  contactId: z.preprocess((val) => parseInt(String(val), 10), z.number().positive()).optional(),
  solicitorId: z.preprocess((val) => parseInt(String(val), 10), z.number().positive()).optional(),
  page: z.preprocess((val) => parseInt(String(val), 10), z.number().min(1).default(1)).optional(),
  limit: z.preprocess((val) => parseInt(String(val), 10), z.number().min(1).default(10)).optional(),
  search: z.string().optional(),
  paymentMethod: z.enum(paymentMethodValues).optional(),
  paymentStatus: z.enum(paymentStatusValues).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hasSolicitor: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  showPaymentsMade: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  showPaymentsReceived: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Updated allocation schema to match patch method - supports both 'amount' and 'allocatedAmount' fields
const allocationCreateSchema = z.object({
  pledgeId: z.number().positive(),
  // Support both field names for backward compatibility
  allocatedAmount: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  installmentScheduleId: z.number().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.enum(supportedCurrencies).optional(),
  exchangeRate: z.number().positive().optional(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(receiptTypeValues).optional().nullable(),
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

// FIXED: More flexible payment creation schema
const paymentCreateSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(supportedCurrencies),
  exchangeRate: z.number().positive(),
  paymentDate: z.string().refine((date) => !isNaN(new Date(date).getTime()), { message: "Invalid date format" }),
  receivedDate: z.string().refine((date) => !isNaN(new Date(date).getTime()), { message: "Invalid date format" }).optional().nullable(),
  checkDate: z.string().refine((date) => !isNaN(new Date(date).getTime()), { message: "Invalid date format" }).optional().nullable(),
  account: z.string().optional().nullable(),
  paymentMethod: z.enum(paymentMethodValues),
  methodDetail: z.enum(methodDetailValues).optional().nullable(),
  paymentStatus: z.enum(paymentStatusValues),
  referenceNumber: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(receiptTypeValues).optional().nullable(),
  receiptIssued: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  solicitorId: z.number().positive().optional().nullable(),
  bonusPercentage: z.number().min(0).max(100).optional().nullable(),
  bonusAmount: z.number().min(0).optional().nullable(),
  bonusRuleId: z.number().optional().nullable(),
  
  // Payment plan and installment fields
  paymentPlanId: z.number().positive().optional().nullable(),
  installmentScheduleId: z.number().positive().optional().nullable(),
  
  // Third-party payment fields
  isThirdPartyPayment: z.boolean().optional(),
  payerContactId: z.number().positive().optional().nullable(),
  
  // FIXED: More flexible pledgeId handling
  pledgeId: z.preprocess((val) => {
    // Convert 0 to null for split payments, but allow numbers through
    if (val === 0 || val === "0") return null;
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? parseInt(val, 10) : val;
  }, z.number().positive().nullable()).optional(),
  
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationCreateSchema).optional(),
  
  // Form-only fields that won't be saved to database
  autoAdjustAllocations: z.boolean().optional(),
  redistributionMethod: z.enum(["proportional", "equal", "custom"]).optional(),
})
// FIXED: More flexible and robust validation logic
.superRefine((data, ctx) => {
  const hasAllocations = data.allocations && data.allocations.length > 0;
  const hasPledgeId = data.pledgeId !== null && data.pledgeId !== undefined && data.pledgeId > 0;
  
  // IMPROVED: More intelligent split payment detection
  // If we have allocations but isSplitPayment is not explicitly true, treat it as a split payment
  // If we have allocations but no pledgeId, treat it as a split payment
  const isSplit = data.isSplitPayment === true || (hasAllocations && !hasPledgeId);

  console.log("Validation debug:", {
    isSplitPaymentFlag: data.isSplitPayment,
    isSplit,
    pledgeId: data.pledgeId,
    hasPledgeId,
    allocationsLength: data.allocations?.length || 0,
    hasAllocations
  });

  if (isSplit) {
    // For split payments: need allocations, pledgeId should be null/0
    if (!hasAllocations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Split payments must have allocations array with at least one allocation",
        path: ["allocations"],
      });
    }
    
    // Allow pledgeId to be null/0 for split payments - no error here
  } else {
    // FIXED: More flexible logic for detecting split payments
    // If we have allocations but isSplitPayment is not explicitly true,
    // treat it as a split payment
    if (hasAllocations && !hasPledgeId) {
      // This looks like a split payment even if isSplitPayment wasn't set
      console.log("Detected implicit split payment - allowing");
      return; // Allow this case
    }
    
    // For regular payments: need pledgeId, no allocations
    if (!hasPledgeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Regular payments must have a valid pledgeId",
        path: ["pledgeId"],
      });
    }
    
    // Only complain about allocations if we actually have a valid pledgeId
    // This prevents the double error when split payment validation fails
    if (hasAllocations && hasPledgeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Regular payments should not have allocations array",
        path: ["allocations"],
      });
    }
  }

  // Validate allocation totals if they exist
  if (hasAllocations && data.amount) {
    const totalAllocated = data.allocations!.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    const difference = Math.abs(totalAllocated - data.amount);
    if (difference > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total allocation amount must equal the payment amount for split payments",
        path: ["allocations"],
      });
    }
  }
});

// Helper functions
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

export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof paymentCreateSchema>;

  try {
    const body = await request.json();

    // Debug the incoming request
    console.log("Incoming request body:", JSON.stringify(body, null, 2));

    try {
      validatedData = paymentCreateSchema.parse(body);
    } catch (zodErr) {
      if (zodErr instanceof z.ZodError) {
        console.error("Validation error details:", JSON.stringify(zodErr.issues, null, 2));
        return NextResponse.json(
          {
            error: "Validation failed",
            details: zodErr.issues.map((issue) => ({
              field: issue.path.join(".") || "root",
              message: issue.message,
              received: issue.code === "invalid_type" ? String(issue.received) : undefined,
              expected: issue.code === "invalid_type" ? String(issue.expected) : undefined,
              code: issue.code,
            })),
          },
          { status: 400 }
        );
      }
      throw zodErr;
    }

    const paymentDate = validatedData.paymentDate;
    const receivedDate = validatedData.receivedDate || paymentDate;
    const checkDate = validatedData.checkDate || null;

    const commonPaymentData = {
      currency: validatedData.currency,
      exchangeRate: Number(validatedData.exchangeRate.toFixed(4)).toString(),
      paymentDate,
      receivedDate,
      checkDate,
      account: validatedData.account || null,
      methodDetail: validatedData.methodDetail || null,
      paymentMethod: validatedData.paymentMethod,
      paymentStatus: validatedData.paymentStatus,
      referenceNumber: validatedData.referenceNumber || null,
      checkNumber: validatedData.checkNumber || null,
      receiptNumber: validatedData.receiptNumber || null,
      receiptType: validatedData.receiptType || null,
      receiptIssued: validatedData.receiptIssued ?? false,
      solicitorId: validatedData.solicitorId || null,
      bonusPercentage: validatedData.bonusPercentage != null
        ? Number(validatedData.bonusPercentage.toFixed(2)).toString()
        : null,
      bonusAmount: validatedData.bonusAmount != null
        ? Number(validatedData.bonusAmount.toFixed(2)).toString()
        : null,
      bonusRuleId: validatedData.bonusRuleId || null,
      notes: validatedData.notes || null,
      
      // Payment plan and installment fields
      paymentPlanId: validatedData.paymentPlanId || null,
      installmentScheduleId: validatedData.installmentScheduleId || null,
      
      // Third-party payment fields
      isThirdPartyPayment: validatedData.isThirdPartyPayment ?? false,
      payerContactId: validatedData.payerContactId || null,
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // IMPROVED: More robust split payment detection
    const hasAllocations = validatedData.allocations && validatedData.allocations.length > 0;
    const hasPledgeId = validatedData.pledgeId && validatedData.pledgeId > 0;
    const isSplitPayment = validatedData.isSplitPayment === true || (hasAllocations && !hasPledgeId);

    console.log("Payment type detection:", {
      isSplitPaymentFlag: validatedData.isSplitPayment,
      hasAllocations,
      hasPledgeId,
      finalIsSplitPayment: isSplitPayment
    });

    // --- Split payment flow ---
    if (isSplitPayment && hasAllocations) {
      console.log("Creating split payment");
      
      // Type guard for allocations
      if (!validatedData.allocations || validatedData.allocations.length === 0) {
        throw new AppError("Split payment must have allocations", 400);
      }
      
      // Validate all pledges exist
      const pledgeIds = validatedData.allocations.map((alloc) => alloc.pledgeId);
      const existingPledges = await db
        .select({ id: pledge.id })
        .from(pledge)
        .where(sql`${pledge.id} IN (${sql.join(pledgeIds.map(id => sql`${id}`), sql`, `)})`);

      if (existingPledges.length !== pledgeIds.length) {
        const foundIds = existingPledges.map(p => p.id);
        const missingIds = pledgeIds.filter(id => !foundIds.includes(id));
        throw new AppError(`Pledges not found: ${missingIds.join(", ")}`, 404);
      }

      // Validate total allocated amounts equal payment amount
      const totalAllocated = validatedData.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
      if (Math.abs(totalAllocated - validatedData.amount) > 0.01) {
        throw new AppError(
          "Invalid allocation amounts",
          400,
          {
            details: `Total allocated amount (${totalAllocated.toFixed(2)}) must equal payment amount (${validatedData.amount.toFixed(2)}).`,
            totalAllocated,
            paymentAmount: validatedData.amount,
            difference: Math.abs(totalAllocated - validatedData.amount),
          }
        );
      }

      // Validate each allocation amount is positive
      for (const allocation of validatedData.allocations) {
        if (!allocation.allocatedAmount || allocation.allocatedAmount <= 0) {
          throw new AppError(
            "Invalid allocation amount",
            400,
            { details: `Allocated amount must be positive. Found: ${allocation.allocatedAmount || 0} for pledge ${allocation.pledgeId}` }
          );
        }
      }

      // Insert split payment record (no pledgeId for split payments)
      const amountUsd = validatedData.amount * validatedData.exchangeRate;
      const splitPaymentData = {
        ...commonPaymentData,
        pledgeId: null, // Split payments don't have a main pledgeId
        amount: validatedData.amount.toFixed(2).toString(),
        amountUsd: amountUsd.toFixed(2).toString(),
        amountInPledgeCurrency: null, // Not applicable for split payments
      };
      
      const [createdPayment] = await db.insert(payment).values(splitPaymentData).returning();
      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      // Insert allocations
      const createdAllocations = [];
      for (const allocation of validatedData.allocations) {
        let allocatedAmountUsd: string | null = null;

        if (allocation.currency === 'USD') {
          allocatedAmountUsd = allocation.allocatedAmount.toString();
        } else {
          const rate = typeof allocation.exchangeRate === 'number'
            ? allocation.exchangeRate
            : validatedData.exchangeRate;
          allocatedAmountUsd = (allocation.allocatedAmount * rate).toFixed(2);
        }

        const allocationToInsert: NewPaymentAllocation = {
          paymentId: createdPayment.id,
          pledgeId: allocation.pledgeId,
          allocatedAmount: allocation.allocatedAmount.toString(),
          allocatedAmountUsd,
          currency: allocation.currency ?? validatedData.currency,
          installmentScheduleId: allocation.installmentScheduleId ?? null,
          receiptNumber: allocation.receiptNumber ?? null,
          receiptType: allocation.receiptType ?? null,
          receiptIssued: allocation.receiptIssued ?? false,
          notes: allocation.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const [allocResult] = await db.insert(paymentAllocations).values(allocationToInsert).returning();
        createdAllocations.push(allocResult);

        // Update installment schedule if applicable
        if (allocation.installmentScheduleId && validatedData.paymentStatus) {
          await updateInstallmentScheduleStatus(
            allocation.installmentScheduleId,
            validatedData.paymentStatus,
            validatedData.receivedDate || validatedData.paymentDate
          );
        }

        // Update pledge totals
        await updatePledgeTotals(allocation.pledgeId);
      }

      // Update payment plan totals if applicable
      if (validatedData.paymentPlanId) {
        await updatePaymentPlanTotals(validatedData.paymentPlanId);
      }

      return NextResponse.json(
        {
          message: "Split payment created successfully",
          payment: {
            ...createdPayment,
            isSplitPayment: true,
            allocationCount: createdAllocations.length,
            allocations: createdAllocations,
          },
        },
        { status: 201 }
      );
    }
    
    // --- Single payment flow ---
    else if (hasPledgeId) {
      console.log("Creating regular payment");
      
      const currentPledge = await db
        .select()
        .from(pledge)
        .where(eq(pledge.id, validatedData.pledgeId!))
        .limit(1);

      if (currentPledge.length === 0) {
        throw new AppError("Pledge not found", 404);
      }

      const pledgeData = currentPledge[0];
      const amountUsd = validatedData.amount * validatedData.exchangeRate;
      const pledgeExchangeRate = parseFloat(pledgeData.exchangeRate || "1");

      const amountInPledgeCurrency =
        validatedData.currency === pledgeData.currency
          ? validatedData.amount
          : amountUsd / pledgeExchangeRate;

      const newPaymentData = {
        ...commonPaymentData,
        pledgeId: validatedData.pledgeId!,
        amount: validatedData.amount.toFixed(2).toString(),
        amountUsd: amountUsd.toFixed(2).toString(),
        amountInPledgeCurrency: amountInPledgeCurrency.toFixed(2).toString(),
      };

      const [createdPayment] = await db.insert(payment).values(newPaymentData).returning();
      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      // Update installment schedule if applicable
      if (validatedData.installmentScheduleId && validatedData.paymentStatus) {
        await updateInstallmentScheduleStatus(
          validatedData.installmentScheduleId,
          validatedData.paymentStatus,
          validatedData.receivedDate || validatedData.paymentDate
        );
      }

      // Update payment plan totals if applicable
      if (validatedData.paymentPlanId) {
        await updatePaymentPlanTotals(validatedData.paymentPlanId);
      }

      // Update pledge totals
      await updatePledgeTotals(validatedData.pledgeId!);

      // Get pledge description for response
      const pledgeDescription = pledgeData.description;

      return NextResponse.json(
        {
          message: "Payment created successfully",
          payment: {
            ...createdPayment,
            isSplitPayment: false,
            allocationCount: 0,
            pledgeDescription,
          },
        },
        { status: 201 }
      );
    }

    throw new AppError("Either pledgeId (for regular payment) or allocations array (for split payment) is required", 400);
    
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

// Keep the existing GET method unchanged
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    const parsedParams = querySchema.safeParse(params);

    if (!parsedParams.success) {
      throw new AppError(
        "Invalid query parameters",
        400,
        parsedParams.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const {
      pledgeId,
      contactId,
      solicitorId,
      page = 1,
      limit = 10,
      search,
      paymentMethod,
      paymentStatus,
      startDate,
      endDate,
      hasSolicitor,
      showPaymentsMade,
      showPaymentsReceived,
    } = parsedParams.data;

    const offset = (page - 1) * limit;
    const conditions = [];

    // Handle different contact-based queries with proper third-party payment filtering
    if (contactId) {
      if (showPaymentsMade === true && showPaymentsReceived === false) {
        // Show only payments made by this contact (as payer) - includes third-party payments they made
        conditions.push(eq(payment.payerContactId, contactId));
      } else if (showPaymentsReceived === true && showPaymentsMade === false) {
        // Show only NON-THIRD-PARTY payments received by this contact's pledges
        conditions.push(
          sql`(
            (${payment.pledgeId} IN (SELECT id FROM ${pledge} WHERE contact_id = ${contactId}) 
             AND (${payment.isThirdPartyPayment} = false OR ${payment.isThirdPartyPayment} IS NULL))
            OR 
            ${payment.id} IN (
              SELECT pa.payment_id FROM ${paymentAllocations} pa
              JOIN ${pledge} p ON pa.pledge_id = p.id
              WHERE p.contact_id = ${contactId}
            )
          )`
        );
      } else {
        // Show payments made by contact + NON-THIRD-PARTY payments to their pledges (default behavior)
        conditions.push(
          sql`(
            ${payment.payerContactId} = ${contactId} OR
            (${payment.pledgeId} IN (SELECT id FROM ${pledge} WHERE contact_id = ${contactId}) 
             AND (${payment.isThirdPartyPayment} = false OR ${payment.isThirdPartyPayment} IS NULL))
            OR 
            ${payment.id} IN (
              SELECT pa.payment_id FROM ${paymentAllocations} pa
              JOIN ${pledge} p ON pa.pledge_id = p.id
              WHERE p.contact_id = ${contactId}
            )
          )`
        );
      }
    }

    if (pledgeId) {
      conditions.push(
        sql`(${payment.pledgeId} = ${pledgeId} OR ${payment.id} IN (
          SELECT payment_id FROM ${paymentAllocations} WHERE pledge_id = ${pledgeId}
        ))`
      );
    }

    if (solicitorId) {
      conditions.push(eq(payment.solicitorId, solicitorId));
    }

    if (hasSolicitor !== undefined) {
      if (hasSolicitor) {
        conditions.push(sql`${payment.solicitorId} IS NOT NULL`);
      } else {
        conditions.push(sql`${payment.solicitorId} IS NULL`);
      }
    }

    if (search) {
      conditions.push(
        sql`${payment.referenceNumber} ILIKE ${"%" + search + "%"} OR ${payment.checkNumber
          } ILIKE ${"%" + search + "%"} OR ${payment.notes} ILIKE ${"%" + search + "%"
          } OR ${payment.receiptNumber} ILIKE ${"%" + search + "%"} OR ${payment.account} ILIKE ${"%" + search + "%"}`
      );
    }

    if (paymentMethod) {
      conditions.push(eq(payment.paymentMethod, paymentMethod));
    }

    if (paymentStatus) {
      conditions.push(eq(payment.paymentStatus, paymentStatus));
    }

    if (startDate) {
      conditions.push(sql`${payment.paymentDate} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${payment.paymentDate} <= ${endDate}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const paymentsQuery = db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        amount: payment.amount,
        currency: payment.currency,
        amountUsd: payment.amountUsd,
        amountInPledgeCurrency: payment.amountInPledgeCurrency,
        exchangeRate: payment.exchangeRate,
        paymentDate: payment.paymentDate,
        receivedDate: payment.receivedDate,
        checkDate: payment.checkDate,
        account: payment.account,
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
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        
        // Third-party payment fields
        isThirdPartyPayment: payment.isThirdPartyPayment,
        payerContactId: payment.payerContactId,
        
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        pledgeDescription: sql<string>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT description FROM ${pledge} WHERE id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("pledgeDescription"),
        pledgeOriginalAmount: sql<string>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT original_amount FROM ${pledge} WHERE id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("pledgeOriginalAmount"),
        pledgeOriginalCurrency: sql<string>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT currency FROM ${pledge} WHERE id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("pledgeOriginalCurrency"),
        pledgeExchangeRate: sql<string>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT exchange_rate FROM ${pledge} WHERE id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("pledgeExchangeRate"),
        contactId: sql<number>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT contact_id FROM ${pledge} WHERE id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("contactId"),
        
        // Contact information for pledge owner and payer
        pledgeOwnerName: sql<string>`(
          CASE 
            WHEN ${payment.pledgeId} IS NOT NULL THEN 
              (SELECT CONCAT(c.first_name, ' ', c.last_name)
               FROM ${pledge} p
               JOIN contact c ON p.contact_id = c.id
               WHERE p.id = ${payment.pledgeId})
            ELSE NULL
          END
        )`.as("pledgeOwnerName"),
        
        // Get payer contact name for third-party payments
        payerContactName: sql<string>`(
          CASE 
            WHEN ${payment.payerContactId} IS NOT NULL THEN 
              (SELECT CONCAT(c.first_name, ' ', c.last_name)
               FROM contact c 
               WHERE c.id = ${payment.payerContactId})
            ELSE NULL
          END
        )`.as("payerContactName"),
        
        solicitorName: sql<string>`(
          CASE 
            WHEN ${payment.solicitorId} IS NOT NULL THEN 
              (SELECT CONCAT(c.first_name, ' ', c.last_name)
               FROM ${solicitor} s
               JOIN contact c ON s.contact_id = c.id
               WHERE s.id = ${payment.solicitorId})
            ELSE NULL
          END
        )`.as("solicitorName"),
        isSplitPayment: sql<boolean>`(
          SELECT COUNT(*) > 0 FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("isSplitPayment"),
        allocationCount: sql<number>`(
          SELECT COUNT(*) FROM ${paymentAllocations} WHERE payment_id = ${payment.id}
        )`.as("allocationCount"),
      })
      .from(payment)
      .leftJoin(pledge, eq(payment.pledgeId, pledge.id))
      .where(whereClause)
      .orderBy(sql`${payment.paymentDate} DESC`)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(payment)
      .leftJoin(pledge, eq(payment.pledgeId, pledge.id))
      .where(whereClause);

    const [payments, totalCountResult] = await Promise.all([
      paymentsQuery.execute(),
      countQuery.execute(),
    ]);

    const paymentsWithAllocations = await Promise.all(
      payments.map(async (p) => {
        if (p.isSplitPayment) {
          const allocations = await db
            .select({
              id: paymentAllocations.id,
              pledgeId: paymentAllocations.pledgeId,
              installmentScheduleId: paymentAllocations.installmentScheduleId,
              allocatedAmount: paymentAllocations.allocatedAmount,
              currency: paymentAllocations.currency,
              allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
              receiptNumber: paymentAllocations.receiptNumber,
              receiptType: paymentAllocations.receiptType,
              receiptIssued: paymentAllocations.receiptIssued,
              notes: paymentAllocations.notes,
              pledgeDescription: sql<string>`(
                SELECT description FROM ${pledge} WHERE id = ${paymentAllocations.pledgeId}
              )`.as("pledgeDescription"),
              pledgeOwnerName: sql<string>`(
                SELECT CONCAT(c.first_name, ' ', c.last_name)
                FROM ${pledge} p
                JOIN contact c ON p.contact_id = c.id
                WHERE p.id = ${paymentAllocations.pledgeId}
              )`.as("pledgeOwnerName"),
            })
            .from(paymentAllocations)
            .leftJoin(pledge, eq(paymentAllocations.pledgeId, pledge.id))
            .where(eq(paymentAllocations.paymentId, p.id));

          return { ...p, allocations };
        }
        return p;
      })
    );

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    const response = {
      payments: paymentsWithAllocations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: parsedParams.data,
    };

    return NextResponse.json(response, {
      headers: {
        "X-Total-Count": response.pagination.totalCount.toString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, ...(err.details ? { details: err.details } : {}) },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      {
        error: "Failed to fetch payments",
        message: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
