import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, paymentPlan, installmentSchedule, solicitor, bonusCalculation, contact, exchangeRate } from "@/lib/db/schema";
import { ErrorHandler } from "@/lib/error-handler";
import { eq, desc, or, ilike, and, SQL, sql, inArray } from "drizzle-orm";
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
  pledgeId: z.number().positive(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  paymentStatus: PaymentStatusEnum.optional(),
});

// Enhanced allocation schema with better validation
const allocationUpdateSchema = z.object({
  id: z.number().optional(),
  pledgeId: z.number().positive(),
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
  return data.allocatedAmount !== undefined || data.amount !== undefined;
}, {
  message: "Either allocatedAmount or amount must be provided",
}).transform((data) => {
  return {
    ...data,
    allocatedAmount: data.allocatedAmount ?? data.amount!,
    amount: undefined,
  };
});

// Enhanced payment schema with comprehensive validation
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
  
  // Third-party payment fields
  payerContactId: z.number().positive("Payer contact ID must be positive").optional().nullable(),
  isThirdPartyPayment: z.boolean().optional(),
  thirdPartyContactId: z.number().positive("Third-party contact ID must be positive").optional().nullable(),
  
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationUpdateSchema).optional(),
  autoAdjustAllocations: z.boolean().optional(),
  redistributionMethod: z.enum(["proportional", "equal", "custom"]).optional(),
}).refine((data) => {
  // Validate split payment allocation totals
  if (data.isSplitPayment && data.allocations && data.allocations.length > 0 && data.amount) {
    const totalAllocated = data.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    const difference = Math.abs(totalAllocated - data.amount);
    return difference < 0.01;
  }
  return true;
}, {
  message: "Total allocation amount must equal the payment amount for split payments",
}).refine((data) => {
  // Third-party payment validation
  if (data.isThirdPartyPayment && !data.thirdPartyContactId) {
    return false;
  }
  return true;
}, {
  message: "Third-party contact must be selected for third-party payments",
  path: ["thirdPartyContactId"],
}).refine((data) => {
  // Payment plan + third-party conflict validation
  if (data.isThirdPartyPayment && data.paymentPlanId) {
    return false;
  }
  return true;
}, {
  message: "Third-party payments are not supported for payment plan payments",
  path: ["isThirdPartyPayment"],
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

type UpdatePaymentData = z.infer<typeof updatePaymentSchema>;

// Enhanced validation functions
async function validatePledgeOwnership(pledgeIds: number[], expectedContactId?: number | null): Promise<{ isValid: boolean; invalidPledges: number[]; contactMismatch: boolean }> {
  if (!expectedContactId) {
    return { isValid: true, invalidPledges: [], contactMismatch: false };
  }

  const pledgeOwnership = await db
    .select({
      id: pledge.id,
      contactId: pledge.contactId,
    })
    .from(pledge)
    .where(inArray(pledge.id, pledgeIds));

  const invalidPledges = pledgeIds.filter(id => !pledgeOwnership.find(p => p.id === id));
  const contactMismatch = pledgeOwnership.some(p => p.contactId !== expectedContactId);

  return {
    isValid: invalidPledges.length === 0 && !contactMismatch,
    invalidPledges,
    contactMismatch
  };
}

async function validateCurrencyConsistency(
  paymentCurrency: string,
  allocations: Array<{ pledgeId: number; currency?: string; allocatedAmount: number }>
): Promise<{ isValid: boolean; inconsistentAllocations: number[] }> {
  const inconsistentAllocations = allocations
    .filter(alloc => (alloc.currency || paymentCurrency) !== paymentCurrency)
    .map(alloc => alloc.pledgeId);

  return {
    isValid: inconsistentAllocations.length === 0,
    inconsistentAllocations
  };
}

async function validatePaymentPlanConstraints(paymentId: number, newData: UpdatePaymentData): Promise<{ isValid: boolean; reason?: string }> {
  const paymentPlanInfo = await db
    .select({
      id: payment.id,
      paymentPlanId: payment.paymentPlanId,
      installmentScheduleId: payment.installmentScheduleId,
    })
    .from(payment)
    .where(eq(payment.id, paymentId))
    .limit(1);

  if (paymentPlanInfo.length === 0) return { isValid: true };

  const hasPaymentPlan = paymentPlanInfo[0].paymentPlanId !== null;

  if (hasPaymentPlan) {
    // Prevent converting payment plan payments to third-party
    if (newData.isThirdPartyPayment) {
      return { 
        isValid: false, 
        reason: "Cannot convert payment plan payment to third-party payment" 
      };
    }

    // Prevent converting payment plan payments to split (unless already split)
    if (newData.isSplitPayment && !paymentPlanInfo[0].installmentScheduleId) {
      return { 
        isValid: false, 
        reason: "Cannot convert payment plan payment to split payment" 
      };
    }
  }

  return { isValid: true };
}

// Currency conversion helper functions
async function getExchangeRate(fromCurrency: string, toCurrency: string, date: string): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const directRate = await db
    .select()
    .from(exchangeRate)
    .where(
      and(
        eq(exchangeRate.baseCurrency, fromCurrency as "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR"),
        eq(exchangeRate.targetCurrency, toCurrency as "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR"),
        sql`${exchangeRate.date} <= ${date}`
      )
    )
    .orderBy(desc(exchangeRate.date))
    .limit(1);

  if (directRate.length > 0) {
    return parseFloat(directRate[0].rate);
  }

  const inverseRate = await db
    .select()
    .from(exchangeRate)
    .where(
      and(
        eq(exchangeRate.baseCurrency, toCurrency as "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR"),
        eq(exchangeRate.targetCurrency, fromCurrency as "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR"),
        sql`${exchangeRate.date} <= ${date}`
      )
    )
    .orderBy(desc(exchangeRate.date))
    .limit(1);

  if (inverseRate.length > 0) {
    return 1 / parseFloat(inverseRate[0].rate);
  }

  if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
    const fromToUsdRate = await getExchangeRate(fromCurrency, 'USD', date);
    const usdToToRate = await getExchangeRate('USD', toCurrency, date);
    if (fromToUsdRate && usdToToRate) {
      return fromToUsdRate * usdToToRate;
    }
  }

  throw new AppError(`Exchange rate not found for ${fromCurrency} to ${toCurrency} on or before ${date}`, 400);
}

async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<{ convertedAmount: number; exchangeRate: number }> {
  const rate = await getExchangeRate(fromCurrency, toCurrency, date);
  const convertedAmount = amount * rate;
  
  return { convertedAmount, exchangeRate: rate };
}

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
  const pledgeCurrency = currentPledge.currency;

  const payments = await db
    .select({
      amount: payment.amount,
      amountUsd: payment.amountUsd,
      amountInPledgeCurrency: payment.amountInPledgeCurrency,
      paymentStatus: payment.paymentStatus,
      currency: payment.currency,
      paymentDate: payment.paymentDate,
    })
    .from(payment)
    .where(and(
      eq(payment.pledgeId, pledgeId),
      or(
        eq(payment.paymentStatus, "completed"),
        eq(payment.paymentStatus, "processing")
      )
    ));

  const allocatedPayments = await db
    .select({
      allocatedAmount: paymentAllocations.allocatedAmount,
      allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
      allocatedAmountInPledgeCurrency: paymentAllocations.allocatedAmountInPledgeCurrency,
      currency: paymentAllocations.currency,
      paymentStatus: payment.paymentStatus,
      paymentDate: payment.paymentDate,
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

  let totalPaidInPledgeCurrency = 0;
  let totalPaidUsd = 0;

  for (const p of payments) {
    if (p.amountInPledgeCurrency) {
      totalPaidInPledgeCurrency += parseFloat(p.amountInPledgeCurrency);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        pledgeCurrency,
        p.paymentDate
      );
      totalPaidInPledgeCurrency += convertedAmount;
    }

    if (p.amountUsd) {
      totalPaidUsd += parseFloat(p.amountUsd);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        'USD',
        p.paymentDate
      );
      totalPaidUsd += convertedAmount;
    }
  }

  for (const a of allocatedPayments) {
    if (a.allocatedAmountInPledgeCurrency) {
      totalPaidInPledgeCurrency += parseFloat(a.allocatedAmountInPledgeCurrency);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(a.allocatedAmount),
        a.currency,
        pledgeCurrency,
        a.paymentDate
      );
      totalPaidInPledgeCurrency += convertedAmount;
    }

    if (a.allocatedAmountUsd) {
      totalPaidUsd += parseFloat(a.allocatedAmountUsd);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(a.allocatedAmount),
        a.currency,
        'USD',
        a.paymentDate
      );
      totalPaidUsd += convertedAmount;
    }
  }

  const originalAmount = parseFloat(currentPledge.originalAmount);
  const balance = Math.max(0, originalAmount - totalPaidInPledgeCurrency);
  
  const originalAmountUsd = currentPledge.originalAmountUsd ? parseFloat(currentPledge.originalAmountUsd) : null;
  const balanceUsd = originalAmountUsd ? Math.max(0, originalAmountUsd - totalPaidUsd) : null;

  await db
    .update(pledge)
    .set({
      totalPaid: totalPaidInPledgeCurrency.toFixed(2),
      balance: balance.toFixed(2),
      totalPaidUsd: totalPaidUsd > 0 ? totalPaidUsd.toFixed(2) : null,
      balanceUsd: balanceUsd !== null ? balanceUsd.toFixed(2) : null,
      updatedAt: new Date(),
    })
    .where(eq(pledge.id, pledgeId));
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
    
    // Enhanced validation: Check payment plan constraints
    const paymentPlanValidation = await validatePaymentPlanConstraints(paymentId, validatedData);
    if (!paymentPlanValidation.isValid) {
      throw new AppError(paymentPlanValidation.reason || "Payment plan constraint violation", 400);
    }
    
    // Get existing payment with comprehensive data
    const existingPayment = await db
      .select({
        id: payment.id,
        pledgeId: payment.pledgeId,
        paymentPlanId: payment.paymentPlanId,
        installmentScheduleId: payment.installmentScheduleId,
        amount: payment.amount,
        currency: payment.currency,
        paymentStatus: payment.paymentStatus,
        solicitorId: payment.solicitorId,
        bonusRuleId: payment.bonusRuleId,
        exchangeRate: payment.exchangeRate,
        paymentDate: payment.paymentDate,
        payerContactId: payment.payerContactId,
        isThirdPartyPayment: payment.isThirdPartyPayment,
        contactId: sql<number>`(
          SELECT contact_id FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("contactId"),
      })
      .from(payment)
      .leftJoin(pledge, eq(payment.pledgeId, pledge.id))
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
        currency: paymentAllocations.currency,
        installmentScheduleId: paymentAllocations.installmentScheduleId,
        payerContactId: paymentAllocations.payerContactId,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    const isCurrentlySplit = existingAllocations.length > 0;
    const willBeSplit = validatedData.isSplitPayment === true;

    // Enhanced validation for third-party split payments
    if (validatedData.isThirdPartyPayment && validatedData.isSplitPayment && validatedData.allocations) {
      const pledgeIds = validatedData.allocations.map(a => a.pledgeId);
      const ownershipValidation = await validatePledgeOwnership(pledgeIds, validatedData.thirdPartyContactId);
      
      if (!ownershipValidation.isValid) {
        if (ownershipValidation.invalidPledges.length > 0) {
          throw new AppError(
            "Invalid pledge IDs in allocations",
            400,
            { details: `Pledges with IDs ${ownershipValidation.invalidPledges.join(', ')} do not exist.` }
          );
        }
        if (ownershipValidation.contactMismatch) {
          throw new AppError(
            "Cross-contact allocation error",
            400,
            { details: "All allocations must be to pledges belonging to the selected third-party contact." }
          );
        }
      }
    }

    // Enhanced validation for regular third-party payments
    if (validatedData.isThirdPartyPayment && !validatedData.isSplitPayment && validatedData.pledgeId) {
      const ownershipValidation = await validatePledgeOwnership([validatedData.pledgeId], validatedData.thirdPartyContactId);
      
      if (!ownershipValidation.isValid) {
        throw new AppError(
          "Invalid pledge selection for third-party payment",
          400,
          { details: "The selected pledge must belong to the third-party contact." }
        );
      }
    }

    // Enhanced currency validation for split payments
    if (validatedData.isSplitPayment && validatedData.allocations) {
      const paymentCurrency = validatedData.currency || currentPayment.currency;
      const currencyValidation = await validateCurrencyConsistency(paymentCurrency, validatedData.allocations);
      
      if (!currencyValidation.isValid) {
        throw new AppError(
          "Currency consistency error",
          400,
          { details: `All allocations must use the payment currency (${paymentCurrency}). Inconsistent pledges: ${currencyValidation.inconsistentAllocations.join(', ')}` }
        );
      }
    }

    // Track pledges that need total updates
    const pledgesToUpdate = new Set<number>();
    
    if (currentPayment.pledgeId) {
      pledgesToUpdate.add(currentPayment.pledgeId);
    }
    
    existingAllocations.forEach(alloc => pledgesToUpdate.add(alloc.pledgeId));

    // Build the update data object with enhanced currency support
    const buildUpdateData = async (data: typeof validatedData) => {
      const { 
        paymentId: _, 
        allocations: __, 
        isSplitPayment: ___, 
        autoAdjustAllocations: ____, 
        redistributionMethod: _____, 
        thirdPartyContactId: ______, 
        ...dataToUpdate 
      } = data;
      
      const isThirdParty = data.isThirdPartyPayment && data.thirdPartyContactId;
      
      const baseUpdateData: Record<string, string | number | boolean | null | undefined | Date> = {
        ...dataToUpdate,
        isThirdPartyPayment: data.isThirdPartyPayment || false,
        payerContactId: isThirdParty ? data.thirdPartyContactId : null,
        updatedAt: new Date(),
      };

      const paymentDate = data.paymentDate || currentPayment.paymentDate;
      const newCurrency = data.currency || currentPayment.currency;
      const newAmount = data.amount || parseFloat(currentPayment.amount);

      if (data.amount || data.currency) {
        const usdConversion = await convertCurrency(newAmount, newCurrency, 'USD', paymentDate);
        baseUpdateData.amountUsd = usdConversion.convertedAmount.toFixed(2);
        baseUpdateData.exchangeRate = usdConversion.exchangeRate.toFixed(4);
      }

      if ((data.amount || data.currency) && (data.pledgeId || currentPayment.pledgeId)) {
        const targetPledgeId = data.pledgeId || currentPayment.pledgeId;
        if (targetPledgeId) {
          const pledgeData = await db
            .select({ currency: pledge.currency })
            .from(pledge)
            .where(eq(pledge.id, targetPledgeId))
            .limit(1);
          
          if (pledgeData.length > 0) {
            const pledgeCurrency = pledgeData[0].currency;
            const pledgeConversion = await convertCurrency(newAmount, newCurrency, pledgeCurrency, paymentDate);
            baseUpdateData.amountInPledgeCurrency = pledgeConversion.convertedAmount.toFixed(2);
            baseUpdateData.pledgeCurrencyExchangeRate = pledgeConversion.exchangeRate.toFixed(4);
          }
        }
      }

      if ((data.amount || data.currency) && (data.paymentPlanId || currentPayment.paymentPlanId)) {
        const targetPaymentPlanId = data.paymentPlanId || currentPayment.paymentPlanId;
        if (targetPaymentPlanId) {
          const planData = await db
            .select({ currency: paymentPlan.currency })
            .from(paymentPlan)
            .where(eq(paymentPlan.id, targetPaymentPlanId))
            .limit(1);
          
          if (planData.length > 0) {
            const planCurrency = planData[0].currency;
            const planConversion = await convertCurrency(newAmount, newCurrency, planCurrency, paymentDate);
            baseUpdateData.amountInPlanCurrency = planConversion.convertedAmount.toFixed(2);
            baseUpdateData.planCurrencyExchangeRate = planConversion.exchangeRate.toFixed(4);
          }
        }
      }

      ["amount", "bonusPercentage", "bonusAmount"].forEach((f) => {
        if (baseUpdateData[f] !== undefined && baseUpdateData[f] !== null) {
          baseUpdateData[f] = baseUpdateData[f].toString();
        }
      });

      return baseUpdateData;
    };

    // SCENARIO 1: Converting split payment to regular payment
    if (isCurrentlySplit && !willBeSplit) {
      console.log("Converting split payment to regular payment");
      
      const targetPledgeId = validatedData.pledgeId || currentPayment.pledgeId;
      if (!targetPledgeId) {
        throw new AppError("Target pledge ID is required when converting split payment to regular payment", 400);
      }

      // Enhanced validation for third-party payments
      if (validatedData.isThirdPartyPayment && validatedData.thirdPartyContactId) {
        const ownershipValidation = await validatePledgeOwnership([targetPledgeId], validatedData.thirdPartyContactId);
        if (!ownershipValidation.isValid) {
          throw new AppError("Target pledge must belong to the selected third-party contact", 400);
        }
      }

      const targetPledgeExists = await db
        .select({ id: pledge.id })
        .from(pledge)
        .where(eq(pledge.id, targetPledgeId))
        .limit(1);
      if (targetPledgeExists.length === 0) {
        throw new AppError(`Target pledge with ID ${targetPledgeId} does not exist`, 400);
      }

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

      await db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));

      const updateData = await buildUpdateData(validatedData);
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

      const pledgeMap = new Map();
      for (const allocation of validatedData.allocations) {
        if (!allocation.allocatedAmount || allocation.allocatedAmount <= 0) {
          throw new AppError(
            "Invalid allocation amount",
            400,
            { details: `Allocated amount must be positive. Found: ${allocation.allocatedAmount || 0} for pledge ${allocation.pledgeId}` }
          );
        }

        const pledgeExists = await db
          .select({ 
            id: pledge.id, 
            currency: pledge.currency,
            exchangeRate: pledge.exchangeRate,
            contactId: pledge.contactId
          })
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
        
        pledgeMap.set(allocation.pledgeId, pledgeExists[0]);
        pledgesToUpdate.add(allocation.pledgeId);
      }

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

      const updateData = await buildUpdateData(validatedData);
      updateData.pledgeId = null;
      updateData.installmentScheduleId = null;
      updateData.amountInPledgeCurrency = null;
      updateData.pledgeCurrencyExchangeRate = null;

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

      const paymentDate = validatedData.paymentDate || currentPayment.paymentDate;
      const paymentCurrency = validatedData.currency || currentPayment.currency;

      for (const alloc of validatedData.allocations) {
        const pledgeInfo = pledgeMap.get(alloc.pledgeId);
        const allocationCurrency = alloc.currency ?? paymentCurrency;

        const usdConversion = await convertCurrency(
          alloc.allocatedAmount,
          allocationCurrency,
          'USD',
          paymentDate
        );

        const pledgeConversion = await convertCurrency(
          alloc.allocatedAmount,
          allocationCurrency,
          pledgeInfo.currency,
          paymentDate
        );

        const allocationToInsert: NewPaymentAllocation = {
          paymentId: paymentId,
          pledgeId: alloc.pledgeId,
          allocatedAmount: alloc.allocatedAmount.toFixed(2),
          allocatedAmountUsd: usdConversion.convertedAmount.toFixed(2),
          allocatedAmountInPledgeCurrency: pledgeConversion.convertedAmount.toFixed(2),
          currency: allocationCurrency,
          installmentScheduleId: alloc.installmentScheduleId ?? null,
          receiptNumber: alloc.receiptNumber ?? null,
          receiptType: alloc.receiptType ?? null,
          receiptIssued: alloc.receiptIssued ?? false,
          notes: alloc.notes ?? null,
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

        const pledgeMap = new Map();
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
            .select({ 
              id: pledge.id, 
              currency: pledge.currency,
              exchangeRate: pledge.exchangeRate,
              contactId: pledge.contactId
            })
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
          
          pledgeMap.set(allocation.pledgeId, pledgeExists[0]);
          pledgesToUpdate.add(allocation.pledgeId);
        }

        const newAllocationIds = validatedData.allocations.filter(a => a.id).map(a => a.id!);
        const allocationsToDelete = existingAllocations.filter(
          existing => !newAllocationIds.includes(existing.id)
        );

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

        if (allocationsToDelete.length > 0) {
          for (const allocationToDelete of allocationsToDelete) {
            await db
              .delete(paymentAllocations)
              .where(eq(paymentAllocations.id, allocationToDelete.id));
          }
        }

        const updateData = await buildUpdateData(validatedData);
        updateData.amountInPledgeCurrency = null;
        updateData.pledgeCurrencyExchangeRate = null;
        
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));

        const paymentDate = validatedData.paymentDate || currentPayment.paymentDate;
        const paymentCurrency = validatedData.currency || currentPayment.currency;

        for (const allocation of validatedData.allocations) {
          const pledgeInfo = pledgeMap.get(allocation.pledgeId);
          const allocationCurrency = allocation.currency ?? paymentCurrency;

          const usdConversion = await convertCurrency(
            allocation.allocatedAmount,
            allocationCurrency,
            'USD',
            paymentDate
          );

          const pledgeConversion = await convertCurrency(
            allocation.allocatedAmount,
            allocationCurrency,
            pledgeInfo.currency,
            paymentDate
          );

          if (allocation.id) {
            const allocationUpdateData: Record<string, string | boolean | number | null | undefined | Date> = {
              pledgeId: allocation.pledgeId,
              allocatedAmount: allocation.allocatedAmount.toFixed(2),
              allocatedAmountUsd: usdConversion.convertedAmount.toFixed(2),
              allocatedAmountInPledgeCurrency: pledgeConversion.convertedAmount.toFixed(2),
              currency: allocationCurrency,
              notes: allocation.notes ?? null,
              installmentScheduleId: allocation.installmentScheduleId ?? null,
              payerContactId: validatedData.isThirdPartyPayment ? validatedData.thirdPartyContactId : null,
              updatedAt: new Date(),
            };

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
            const allocationToInsert: NewPaymentAllocation = {
              paymentId: paymentId,
              pledgeId: allocation.pledgeId,
              allocatedAmount: allocation.allocatedAmount.toFixed(2),
              allocatedAmountUsd: usdConversion.convertedAmount.toFixed(2),
              allocatedAmountInPledgeCurrency: pledgeConversion.convertedAmount.toFixed(2),
              currency: allocationCurrency,
              installmentScheduleId: allocation.installmentScheduleId ?? null,
              receiptNumber: allocation.receiptNumber ?? null,
              receiptType: allocation.receiptType ?? null,
              receiptIssued: allocation.receiptIssued ?? false,
              notes: allocation.notes ?? null,
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
        const updateData = await buildUpdateData(validatedData);
        updateData.amountInPledgeCurrency = null;
        updateData.pledgeCurrencyExchangeRate = null;
        
        await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
      }
    }
    
    // SCENARIO 4: Updating regular payment
    else {
      console.log("Updating regular payment");
      
      if (validatedData.pledgeId && validatedData.pledgeId !== pledgeId) {
        // Enhanced validation for third-party payments
        if (validatedData.isThirdPartyPayment && validatedData.thirdPartyContactId) {
          const ownershipValidation = await validatePledgeOwnership([validatedData.pledgeId], validatedData.thirdPartyContactId);
          if (!ownershipValidation.isValid) {
            throw new AppError("Selected pledge must belong to the third-party contact", 400);
          }
        }

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

      const updateData = await buildUpdateData(validatedData);
      updateData.pledgeId = validatedData.pledgeId || currentPayment.pledgeId;

      await db.update(payment).set(updateData).where(eq(payment.id, paymentId));
    }

    // Get updated payment for response
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
        pledgeCurrencyExchangeRate: payment.pledgeCurrencyExchangeRate,
        amountInPlanCurrency: payment.amountInPlanCurrency,
        planCurrencyExchangeRate: payment.planCurrencyExchangeRate,
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
          allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
          allocatedAmountInPledgeCurrency: paymentAllocations.allocatedAmountInPledgeCurrency,
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
        
        pledgeExchangeRate: pledge.exchangeRate,
        pledgeDescription: pledge.description,
        contactId: pledge.contactId,
        
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

    const existingAllocations = await db
      .select({
        id: paymentAllocations.id,
        pledgeId: paymentAllocations.pledgeId,
        allocatedAmount: paymentAllocations.allocatedAmount,
        installmentScheduleId: paymentAllocations.installmentScheduleId,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    const bonusCalculations = await db
      .select({ id: bonusCalculation.id })
      .from(bonusCalculation)
      .where(eq(bonusCalculation.paymentId, paymentId));

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

    if (existingAllocations.length > 0) {
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
    }

    if (bonusCalculations.length > 0) {
      await db
        .delete(bonusCalculation)
        .where(eq(bonusCalculation.paymentId, paymentId));
    }

    if (existingAllocations.length > 0) {
      await db
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));
    }

    await db
      .delete(payment)
      .where(eq(payment.id, paymentId));

    const deletionResult = {
      deletedPayment: currentPayment,
      allocations: existingAllocations,
      bonusCalculationsDeleted: bonusCalculations.length,
    };

    const { deletedPayment, allocations } = deletionResult;

    if (allocations.length > 0) {
      const uniquePledgeIds = [...new Set(allocations.map(a => a.pledgeId))];
      for (const pledgeId of uniquePledgeIds) {
        try {
          await updatePledgeTotals(pledgeId);
        } catch (error) {
          console.error(`Failed to update pledge ${pledgeId} totals:`, error);
        }
      }
    }

    if (deletedPayment.pledgeId && allocations.length === 0) {
      try {
        await updatePledgeTotals(deletedPayment.pledgeId);
      } catch (error) {
        console.error(`Failed to update pledge ${deletedPayment.pledgeId} totals:`, error);
      }
    }

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