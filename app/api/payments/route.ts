import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations, installmentSchedule, paymentPlan, solicitor, exchangeRate, currencyConversionLog, currencyEnum } from "@/lib/db/schema";
import { sql, eq, and, or, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import type { NewPaymentAllocation, NewCurrencyConversionLog } from "@/lib/db/schema";

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
  "goods_and_services", "matching_funds", "money_order", "p2p", "pending","bank_transfer",
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
  "pending", "completed", "failed", "cancelled", "refunded", "processing", "expected"
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

const allocationCreateSchema = z.object({
  pledgeId: z.number().positive(),
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
  
  paymentPlanId: z.number().positive().optional().nullable(),
  installmentScheduleId: z.number().positive().optional().nullable(),
  
  isThirdPartyPayment: z.boolean().optional(),
  payerContactId: z.number().positive().optional().nullable(),
  
  pledgeId: z.preprocess((val) => {
    if (val === 0 || val === "0") return null;
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? parseInt(val, 10) : val;
  }, z.number().positive().nullable()).optional(),
  
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationCreateSchema).optional(),
  
  autoAdjustAllocations: z.boolean().optional(),
  redistributionMethod: z.enum(["proportional", "equal", "custom"]).optional(),
})
.superRefine((data, ctx) => {
  const hasAllocations = data.allocations && data.allocations.length > 0;
  const hasPledgeId = data.pledgeId !== null && data.pledgeId !== undefined && data.pledgeId > 0;
  
  const isSplit = data.isSplitPayment === true || (hasAllocations && !hasPledgeId);

  if (isSplit) {
    if (!hasAllocations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Split payments must have allocations array with at least one allocation",
        path: ["allocations"],
      });
    }
  } else {
    if (hasAllocations && !hasPledgeId) {
      return;
    }
    
    if (!hasPledgeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Regular payments must have a valid pledgeId",
        path: ["pledgeId"],
      });
    }
    
    if (hasAllocations && hasPledgeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Regular payments should not have allocations array",
        path: ["allocations"],
      });
    }
  }

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

// Enhanced currency conversion helper
// Enhanced currency conversion helper
async function getExchangeRate(fromCurrency: string, toCurrency: string, date: string): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  // 1. Try to find the most recent direct rate on or before the given date
  const directRate = await db
    .select()
    .from(exchangeRate)
    .where(
      and(
        eq(exchangeRate.baseCurrency, fromCurrency as (typeof currencyEnum.enumValues)[number]),
        eq(exchangeRate.targetCurrency, toCurrency as (typeof currencyEnum.enumValues)[number]),
        lte(exchangeRate.date, date)
      )
    )
    .orderBy(desc(exchangeRate.date))
    .limit(1);

  if (directRate.length > 0) {
    return parseFloat(directRate[0].rate);
  }

  // 2. If not found, try the most recent inverse rate
  const inverseRate = await db
    .select()
    .from(exchangeRate)
    .where(
      and(
        eq(exchangeRate.baseCurrency, toCurrency as (typeof currencyEnum.enumValues)[number]),
        eq(exchangeRate.targetCurrency, fromCurrency as (typeof currencyEnum.enumValues)[number]),
        lte(exchangeRate.date, date)
      )
    )
    .orderBy(desc(exchangeRate.date))
    .limit(1);

  if (inverseRate.length > 0) {
    return 1 / parseFloat(inverseRate[0].rate);
  }

  // 3. If still not found, try to convert through USD as a fallback
  if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
    console.warn(`No direct rate for ${fromCurrency}->${toCurrency}. Trying via USD.`);
    const fromToUsdRate = await getExchangeRate(fromCurrency, 'USD', date);
    const usdToToRate = await getExchangeRate('USD', toCurrency, date);
    if (fromToUsdRate && usdToToRate) {
      return fromToUsdRate * usdToToRate;
    }
  }

  // 4. If all else fails, throw an error.
  throw new AppError(`Exchange rate not found for ${fromCurrency} to ${toCurrency} on or before ${date}`, 400);
}

// Enhanced currency conversion with logging
async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  paymentId?: number,
  conversionType: string = 'general'
): Promise<{ convertedAmount: number; exchangeRate: number }> {
  const rate = await getExchangeRate(fromCurrency, toCurrency, date);
  const convertedAmount = amount * rate;
  
  // Log conversion if paymentId is provided
  if (paymentId) {
    try {
      const logEntry: NewCurrencyConversionLog = {
        paymentId,
        fromCurrency: fromCurrency as (typeof currencyEnum.enumValues)[number],
        toCurrency: toCurrency as (typeof currencyEnum.enumValues)[number],
        fromAmount: amount.toFixed(2),
        toAmount: convertedAmount.toFixed(2),
        exchangeRate: rate.toFixed(4),
        conversionDate: date,
        conversionType,
        createdAt: new Date(),
      };
      
      await db.insert(currencyConversionLog).values(logEntry);
    } catch (error) {
      console.error('Error logging currency conversion:', error);
    }
  }
  
  return { convertedAmount, exchangeRate: rate };
}

// Helper functions
async function updatePaymentPlanTotals(paymentPlanId: number) {
  // Get payment plan details first
  const paymentPlanResult = await db
    .select({
      totalPlannedAmount: paymentPlan.totalPlannedAmount,
      currency: paymentPlan.currency,
    })
    .from(paymentPlan)
    .where(eq(paymentPlan.id, paymentPlanId))
    .limit(1);

  if (paymentPlanResult.length === 0) return;

  const planData = paymentPlanResult[0];
  const planCurrency = planData.currency;
  
  // Get payments for this plan
  const payments = await db
    .select({
      amount: payment.amount,
      currency: payment.currency,
      amountInPlanCurrency: payment.amountInPlanCurrency,
      paymentStatus: payment.paymentStatus,
      paymentDate: payment.paymentDate,
    })
    .from(payment)
    .where(and(
      eq(payment.paymentPlanId, paymentPlanId),
      or(
        eq(payment.paymentStatus, "completed"),
        eq(payment.paymentStatus, "processing")
      )
    ));

  let totalPaid = 0;
  let totalPaidUsd = 0;
  const installmentsPaid = payments.length;

  for (const p of payments) {
    // Use existing plan currency conversion or calculate new one
    if (p.amountInPlanCurrency) {
      totalPaid += parseFloat(p.amountInPlanCurrency);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        planCurrency,
        p.paymentDate,
        undefined,
        'plan_total_update'
      );
      totalPaid += convertedAmount;
    }
    
    // Calculate USD amount for reporting
    if (p.currency === 'USD') {
      totalPaidUsd += parseFloat(p.amount);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        'USD',
        p.paymentDate,
        undefined,
        'usd_reporting'
      );
      totalPaidUsd += convertedAmount;
    }
  }

  const totalPlanned = parseFloat(planData.totalPlannedAmount);
  const remainingAmount = Math.max(0, totalPlanned - totalPaid);
  
  // Convert to USD for reporting
  const { convertedAmount: totalPaidUsdFinal } = await convertCurrency(
    totalPaid,
    planCurrency,
    'USD',
    new Date().toISOString().split('T')[0],
    undefined,
    'plan_reporting'
  );
  
  const { convertedAmount: remainingAmountUsd } = await convertCurrency(
    remainingAmount,
    planCurrency,
    'USD',
    new Date().toISOString().split('T')[0],
    undefined,
    'plan_reporting'
  );

  await db
    .update(paymentPlan)
    .set({
      totalPaid: totalPaid.toFixed(2),
      totalPaidUsd: totalPaidUsdFinal.toFixed(2),
      installmentsPaid,
      remainingAmount: remainingAmount.toFixed(2),
      remainingAmountUsd: remainingAmountUsd.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(paymentPlan.id, paymentPlanId));
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
  // Get pledge details first
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

  // Get all completed/processing payments for this pledge (direct payments)
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

  // Get payments from allocations (for split payments)
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

  // Calculate totals from direct payments
  for (const p of payments) {
    // Use existing pledge currency conversion or calculate new one
    if (p.amountInPledgeCurrency) {
      totalPaidInPledgeCurrency += parseFloat(p.amountInPledgeCurrency);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        pledgeCurrency,
        p.paymentDate,
        undefined,
        'pledge_total_update'
      );
      totalPaidInPledgeCurrency += convertedAmount;
    }

    // Calculate USD amount
    if (p.amountUsd) {
      totalPaidUsd += parseFloat(p.amountUsd);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(p.amount),
        p.currency,
        'USD',
        p.paymentDate,
        undefined,
        'usd_reporting'
      );
      totalPaidUsd += convertedAmount;
    }
  }

  // Calculate totals from allocated payments (split payments)
  for (const a of allocatedPayments) {
    // Use existing pledge currency conversion or calculate new one
    if (a.allocatedAmountInPledgeCurrency) {
      totalPaidInPledgeCurrency += parseFloat(a.allocatedAmountInPledgeCurrency);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(a.allocatedAmount),
        a.currency,
        pledgeCurrency,
        a.paymentDate,
        undefined,
        'pledge_total_update'
      );
      totalPaidInPledgeCurrency += convertedAmount;
    }

    // Calculate USD amount
    if (a.allocatedAmountUsd) {
      totalPaidUsd += parseFloat(a.allocatedAmountUsd);
    } else {
      const { convertedAmount } = await convertCurrency(
        parseFloat(a.allocatedAmount),
        a.currency,
        'USD',
        a.paymentDate,
        undefined,
        'usd_reporting'
      );
      totalPaidUsd += convertedAmount;
    }
  }

  // Calculate remaining balance
  const originalAmount = parseFloat(currentPledge.originalAmount);
  const balance = Math.max(0, originalAmount - totalPaidInPledgeCurrency);
  
  const originalAmountUsd = currentPledge.originalAmountUsd ? parseFloat(currentPledge.originalAmountUsd) : null;
  const balanceUsd = originalAmountUsd ? Math.max(0, originalAmountUsd - totalPaidUsd) : null;

  // Update the pledge
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

export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof paymentCreateSchema>;

  try {
    const body = await request.json();
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
    const receivedDate = validatedData.receivedDate ?? null;
    const checkDate = validatedData.checkDate ?? null;

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
      
      paymentPlanId: validatedData.paymentPlanId || null,
      installmentScheduleId: validatedData.installmentScheduleId || null,
      
      isThirdPartyPayment: validatedData.isThirdPartyPayment ?? false,
      payerContactId: validatedData.payerContactId || null,
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };

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
      
      if (!validatedData.allocations || validatedData.allocations.length === 0) {
        throw new AppError("Split payment must have allocations", 400);
      }
      
      // Validate all pledges exist and get their details
      const pledgeIds = validatedData.allocations.map((alloc) => alloc.pledgeId);
      const existingPledges = await db
        .select({ 
          id: pledge.id,
          currency: pledge.currency,
          exchangeRate: pledge.exchangeRate 
        })
        .from(pledge)
        .where(sql`${pledge.id} IN (${sql.join(pledgeIds.map(id => sql`${id}`), sql`, `)})`);

      if (existingPledges.length !== pledgeIds.length) {
        const foundIds = existingPledges.map(p => p.id);
        const missingIds = pledgeIds.filter(id => !foundIds.includes(id));
        throw new AppError(`Pledges not found: ${missingIds.join(", ")}`, 404);
      }

      // Create pledge lookup for currency conversions
      const pledgeMap = new Map(existingPledges.map(p => [p.id, p]));

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

      // Calculate all currency conversions for the main payment
      const amountUsd = await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        'USD',
        paymentDate,
        undefined,
        'usd_reporting'
      );

      // Calculate payment plan currency conversion if applicable
      let amountInPlanCurrency: string | null = null;
      let planCurrencyExchangeRate: string | null = null;

      if (validatedData.paymentPlanId) {
        const paymentPlanResult = await db
          .select({ currency: paymentPlan.currency })
          .from(paymentPlan)
          .where(eq(paymentPlan.id, validatedData.paymentPlanId))
          .limit(1);
        
        if (paymentPlanResult.length > 0) {
          const planCurrency = paymentPlanResult[0].currency;
          const planConversion = await convertCurrency(
            validatedData.amount,
            validatedData.currency,
            planCurrency,
            paymentDate,
            undefined,
            'plan'
          );
          
          amountInPlanCurrency = planConversion.convertedAmount.toFixed(2);
          planCurrencyExchangeRate = planConversion.exchangeRate.toFixed(4);
        }
      }

      // Insert split payment record (no pledgeId for split payments)
      const splitPaymentData = {
        ...commonPaymentData,
        pledgeId: null, // Split payments don't have a main pledgeId
        amount: validatedData.amount.toFixed(2),
        amountUsd: amountUsd.convertedAmount.toFixed(2),
        amountInPledgeCurrency: null, // Not applicable for split payments
        pledgeCurrencyExchangeRate: null,
        amountInPlanCurrency,
        planCurrencyExchangeRate,
      };
      
      const [createdPayment] = await db.insert(payment).values(splitPaymentData).returning();
      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      // Log currency conversions for the main payment
      await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        'USD',
        paymentDate,
        createdPayment.id,
        'usd_reporting'
      );

      if (amountInPlanCurrency) {
        await convertCurrency(
          validatedData.amount,
          validatedData.currency,
          validatedData.currency, // Plan currency, but we need the actual plan currency here
          paymentDate,
          createdPayment.id,
          'plan'
        );
      }

      // Insert allocations with proper currency conversions
      const createdAllocations = [];
      for (const allocation of validatedData.allocations) {
        const pledgeInfo = pledgeMap.get(allocation.pledgeId);
        if (!pledgeInfo) continue;

        // Calculate USD conversion for allocation
        let allocatedAmountUsd: string;
        const allocationCurrency = allocation.currency ?? validatedData.currency;
        
        if (allocationCurrency === 'USD') {
          allocatedAmountUsd = allocation.allocatedAmount.toFixed(2);
        } else {
          const rate = typeof allocation.exchangeRate === 'number'
            ? allocation.exchangeRate
            : validatedData.exchangeRate;
          allocatedAmountUsd = (allocation.allocatedAmount * rate).toFixed(2);
        }

        // Calculate pledge currency conversion for allocation
        let allocatedAmountInPledgeCurrency: string | null = null;
        if (allocationCurrency === pledgeInfo.currency) {
          allocatedAmountInPledgeCurrency = allocation.allocatedAmount.toFixed(2);
        } else {
          const pledgeConversion = await convertCurrency(
            allocation.allocatedAmount,
            allocationCurrency,
            pledgeInfo.currency,
            paymentDate,
            createdPayment.id,
            'pledge'
          );
          allocatedAmountInPledgeCurrency = pledgeConversion.convertedAmount.toFixed(2);
        }

        const allocationToInsert: NewPaymentAllocation = {
          paymentId: createdPayment.id,
          pledgeId: allocation.pledgeId,
          payerContactId: validatedData.payerContactId || null,
          allocatedAmount: allocation.allocatedAmount.toFixed(2),
          allocatedAmountUsd: allocatedAmountUsd,
          allocatedAmountInPledgeCurrency: allocatedAmountInPledgeCurrency,
          currency: allocationCurrency,
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

      // Calculate all currency conversions
      const amountUsd = await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        'USD',
        paymentDate,
        undefined,
        'usd_reporting'
      );

      const amountInPledgeCurrency = await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        pledgeData.currency,
        paymentDate,
        undefined,
        'pledge'
      );

      let amountInPlanCurrency: { convertedAmount: number; exchangeRate: number } | null = null;
      let planCurrency: string | null = null;

      // Handle payment plan currency conversion if applicable
      if (validatedData.paymentPlanId) {
        const paymentPlanResult = await db
          .select({ currency: paymentPlan.currency })
          .from(paymentPlan)
          .where(eq(paymentPlan.id, validatedData.paymentPlanId))
          .limit(1);
        
        if (paymentPlanResult.length > 0) {
          planCurrency = paymentPlanResult[0].currency;
          amountInPlanCurrency = await convertCurrency(
            validatedData.amount,
            validatedData.currency,
            planCurrency,
            paymentDate,
            undefined,
            'plan'
          );
        }
      }

      const newPaymentData = {
        ...commonPaymentData,
        pledgeId: validatedData.pledgeId!,
        amount: validatedData.amount.toFixed(2),
        
        // USD conversions
        amountUsd: amountUsd.convertedAmount.toFixed(2),
        exchangeRate: amountUsd.exchangeRate.toFixed(4),
        
        // Pledge currency conversions
        amountInPledgeCurrency: amountInPledgeCurrency.convertedAmount.toFixed(2),
        pledgeCurrencyExchangeRate: amountInPledgeCurrency.exchangeRate.toFixed(4),
        
        // Plan currency conversions (if applicable)
        amountInPlanCurrency: amountInPlanCurrency ? amountInPlanCurrency.convertedAmount.toFixed(2) : null,
        planCurrencyExchangeRate: amountInPlanCurrency ? amountInPlanCurrency.exchangeRate.toFixed(4) : null,
      };

      const [createdPayment] = await db.insert(payment).values(newPaymentData).returning();
      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      // Log currency conversions
      await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        'USD',
        paymentDate,
        createdPayment.id,
        'usd_reporting'
      );

      await convertCurrency(
        validatedData.amount,
        validatedData.currency,
        pledgeData.currency,
        paymentDate,
        createdPayment.id,
        'pledge'
      );

      if (amountInPlanCurrency && planCurrency) {
        await convertCurrency(
          validatedData.amount,
          validatedData.currency,
          planCurrency,
          paymentDate,
          createdPayment.id,
          'plan'
        );
      }

      // Update installment schedule if applicable
      if (validatedData.installmentScheduleId && validatedData.paymentStatus) {
        await updateInstallmentScheduleStatus(
          validatedData.installmentScheduleId,
          validatedData.paymentStatus,
          validatedData.receivedDate || validatedData.paymentDate
        );

        // Update installment schedule with USD amounts if needed
        const installmentResult = await db
          .select({ 
            currency: installmentSchedule.currency,
            installmentAmountUsd: installmentSchedule.installmentAmountUsd 
          })
          .from(installmentSchedule)
          .where(eq(installmentSchedule.id, validatedData.installmentScheduleId))
          .limit(1);

        if (installmentResult.length > 0 && !installmentResult[0].installmentAmountUsd) {
          const installmentData = installmentResult[0];
          // We'd need the installment amount to convert it, but it's not available in this context
          // This would typically be handled during installment schedule creation
        }
      }

      // Update payment plan totals if applicable
      if (validatedData.paymentPlanId) {
        await updatePaymentPlanTotals(validatedData.paymentPlanId);
      }

      // Update pledge totals
      await updatePledgeTotals(validatedData.pledgeId!);

      return NextResponse.json(
        {
          message: "Payment created successfully",
          payment: {
            ...createdPayment,
            isSplitPayment: false,
            allocationCount: 0,
            pledgeDescription: pledgeData.description,
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

// Updated GET method with enhanced multi-currency support
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
        conditions.push(eq(payment.payerContactId, contactId));
      } else if (showPaymentsReceived === true && showPaymentsMade === false) {
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
        
        // Enhanced multi-currency fields
        amountUsd: payment.amountUsd,
        amountInPledgeCurrency: payment.amountInPledgeCurrency,
        pledgeCurrencyExchangeRate: payment.pledgeCurrencyExchangeRate,
        amountInPlanCurrency: payment.amountInPlanCurrency,
        planCurrencyExchangeRate: payment.planCurrencyExchangeRate,
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
        
        // Enhanced pledge information
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
        
        // Contact information
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
        
        // Payment plan currency info
        paymentPlanCurrency: sql<string>`(
          CASE 
            WHEN ${payment.paymentPlanId} IS NOT NULL THEN 
              (SELECT currency FROM ${paymentPlan} WHERE id = ${payment.paymentPlanId})
            ELSE NULL
          END
        )`.as("paymentPlanCurrency"),
        
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

    // Enhanced allocation fetching with multi-currency support
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
              
              // Enhanced multi-currency allocation fields
              allocatedAmountUsd: paymentAllocations.allocatedAmountUsd,
              allocatedAmountInPledgeCurrency: paymentAllocations.allocatedAmountInPledgeCurrency,
              
              receiptNumber: paymentAllocations.receiptNumber,
              receiptType: paymentAllocations.receiptType,
              receiptIssued: paymentAllocations.receiptIssued,
              notes: paymentAllocations.notes,
              payerContactId: paymentAllocations.payerContactId,
              
              pledgeDescription: sql<string>`(
                SELECT description FROM ${pledge} WHERE id = ${paymentAllocations.pledgeId}
              )`.as("pledgeDescription"),
              pledgeOwnerName: sql<string>`(
                SELECT CONCAT(c.first_name, ' ', c.last_name)
                FROM ${pledge} p
                JOIN contact c ON p.contact_id = c.id
                WHERE p.id = ${paymentAllocations.pledgeId}
              )`.as("pledgeOwnerName"),
              pledgeCurrency: sql<string>`(
                SELECT currency FROM ${pledge} WHERE id = ${paymentAllocations.pledgeId}
              )`.as("pledgeCurrency"),
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