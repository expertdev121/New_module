/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import {
  paymentPlan,
  pledge,
  installmentSchedule,
  payment,
  relationships,
  currencyConversionLog,
  exchangeRate,
  type PaymentPlan,
  type NewCurrencyConversionLog
} from "@/lib/db/schema";
import { ErrorHandler } from "@/lib/error-handler";
import { eq, sql, and, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PlanStatusEnum = z.enum([
  "active",
  "completed",
  "cancelled",
  "paused",
  "overdue",
]);

const updatePaymentPlanSchema = z.object({
  pledgeId: z.number().positive().optional(),
  relationshipId: z.number().positive().optional(),
  planName: z.string().optional(),
  frequency: z
    .enum([
      "weekly",
      "monthly",
      "quarterly",
      "biannual",
      "annual",
      "one_time",
      "custom",
    ])
    .optional(),
  distributionType: z.enum(["fixed", "custom"]).optional(),
  totalPlannedAmount: z
    .number()
    .positive("Total planned amount must be positive")
    .optional(),
  currency: z
    .enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"])
    .optional(),
  totalPlannedAmountUsd: z
    .number()
    .positive("Total planned amount USD must be positive")
    .optional(),
  installmentAmount: z
    .number()
    .positive("Installment amount must be positive")
    .optional(),
  installmentAmountUsd: z
    .number()
    .positive("Installment amount USD must be positive")
    .optional(),
  numberOfInstallments: z
    .number()
    .int()
    .positive("Number of installments must be positive")
    .optional(),
  exchangeRate: z
    .number()
    .positive("Exchange rate must be positive")
    .optional(),
  startDate: z.string().min(1, "Start date is required").optional(),
  endDate: z.string().optional(),
  nextPaymentDate: z.string().optional(),
  remainingAmountUsd: z.number().optional(),
  currencyPriority: z.number().int().positive().optional(),
  autoRenew: z.boolean().optional(),
  planStatus: PlanStatusEnum.optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  customInstallments: z
    .array(
      z.object({
        installmentDate: z.string().min(1, "Installment date is required"),
        installmentAmount: z.number().positive("Installment amount must be positive"),
        currency: z.enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"]).optional(),
        installmentAmountUsd: z.number().optional(),
        status: z.enum(["pending", "paid", "overdue", "cancelled"]).optional(),
        paidDate: z.string().optional(),
        notes: z.string().optional(),
        paymentId: z.number().optional(),
      })
    )
    .optional(),
}).refine((data) => {
  if (data.distributionType === "fixed") {
    return (
      data.installmentAmount !== undefined && data.numberOfInstallments !== undefined
    );
  }
  if (data.distributionType === "custom") {
    return data.customInstallments && data.customInstallments.length > 0;
  }
  return true;
}, {
  message:
    "For 'fixed' distribution type, installmentAmount and numberOfInstallments are required. For 'custom' distribution type, customInstallments array is required.",
  path: ["distributionType"],
});

type UpdatePaymentPlanRequest = z.infer<typeof updatePaymentPlanSchema>;

/**
 * Get exchange rate from database or use provided rate
 */
async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  providedRate?: number | null,
  conversionDate?: string
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;
  if (providedRate) return providedRate;

  try {
    const targetDate = conversionDate || new Date().toISOString().split('T')[0];
    
    // Try to get exact date first
    let rateQuery = await db
      .select({ rate: exchangeRate.rate })
      .from(exchangeRate)
      .where(
        and(
          eq(exchangeRate.baseCurrency, fromCurrency as any),
          eq(exchangeRate.targetCurrency, toCurrency as any),
          eq(exchangeRate.date, targetDate)
        )
      )
      .limit(1);

    // If no exact date, get most recent rate
    if (!rateQuery.length) {
      rateQuery = await db
        .select({ rate: exchangeRate.rate })
        .from(exchangeRate)
        .where(
          and(
            eq(exchangeRate.baseCurrency, fromCurrency as any),
            eq(exchangeRate.targetCurrency, toCurrency as any),
            sql`${exchangeRate.date} <= ${targetDate}`
          )
        )
        .orderBy(desc(exchangeRate.date))
        .limit(1);
    }

    if (rateQuery.length) {
      return parseFloat(rateQuery[0].rate.toString());
    }

    // Try reverse rate (toCurrency to fromCurrency)
    rateQuery = await db
      .select({ rate: exchangeRate.rate })
      .from(exchangeRate)
      .where(
        and(
          eq(exchangeRate.baseCurrency, toCurrency as any),
          eq(exchangeRate.targetCurrency, fromCurrency as any),
          sql`${exchangeRate.date} <= ${targetDate}`
        )
      )
      .orderBy(desc(exchangeRate.date))
      .limit(1);

    if (rateQuery.length) {
      return 1 / parseFloat(rateQuery[0].rate.toString());
    }

    return null;
  } catch (error) {
    console.warn("Failed to get exchange rate from database:", error);
    return null;
  }
}

/**
 * Helper function to calculate multi-currency conversions
 */
async function calculateMultiCurrencyConversions(
  amount: number,
  paymentCurrency: string,
  pledgeCurrency: string,
  planCurrency: string,
  providedExchangeRate?: number | null,
  conversionDate?: string
) {
  const conversions = {
    amountUsd: null as number | null,
    amountInPledgeCurrency: amount,
    pledgeCurrencyExchangeRate: null as number | null,
    amountInPlanCurrency: amount,
    planCurrencyExchangeRate: null as number | null,
    usdExchangeRate: null as number | null,
  };

  // Calculate USD amount
  if (paymentCurrency === "USD") {
    conversions.amountUsd = amount;
    conversions.usdExchangeRate = 1;
  } else {
    const usdRate = await getExchangeRate(paymentCurrency, "USD", providedExchangeRate, conversionDate);
    if (usdRate) {
      conversions.amountUsd = amount * usdRate;
      conversions.usdExchangeRate = usdRate;
    }
  }

  // Calculate pledge currency amount
  if (paymentCurrency !== pledgeCurrency) {
    const pledgeRate = await getExchangeRate(paymentCurrency, pledgeCurrency, null, conversionDate);
    if (pledgeRate) {
      conversions.amountInPledgeCurrency = amount * pledgeRate;
      conversions.pledgeCurrencyExchangeRate = pledgeRate;
    } else if (conversions.amountUsd && pledgeCurrency !== "USD") {
      // Try USD as intermediate currency
      const usdToPledgeRate = await getExchangeRate("USD", pledgeCurrency, null, conversionDate);
      if (usdToPledgeRate) {
        conversions.amountInPledgeCurrency = conversions.amountUsd * usdToPledgeRate;
        conversions.pledgeCurrencyExchangeRate = (conversions.usdExchangeRate || 1) * usdToPledgeRate;
      }
    }
  } else {
    conversions.amountInPledgeCurrency = amount;
    conversions.pledgeCurrencyExchangeRate = 1;
  }

  // Calculate plan currency amount
  if (paymentCurrency !== planCurrency) {
    const planRate = await getExchangeRate(paymentCurrency, planCurrency, null, conversionDate);
    if (planRate) {
      conversions.amountInPlanCurrency = amount * planRate;
      conversions.planCurrencyExchangeRate = planRate;
    } else if (conversions.amountUsd && planCurrency !== "USD") {
      // Try USD as intermediate currency
      const usdToPlanRate = await getExchangeRate("USD", planCurrency, null, conversionDate);
      if (usdToPlanRate) {
        conversions.amountInPlanCurrency = conversions.amountUsd * usdToPlanRate;
        conversions.planCurrencyExchangeRate = (conversions.usdExchangeRate || 1) * usdToPlanRate;
      }
    }
  } else {
    conversions.amountInPlanCurrency = amount;
    conversions.planCurrencyExchangeRate = 1;
  }

  return conversions;
}

/**
 * Helper function to log currency conversions
 */
async function logCurrencyConversion(
  paymentId: number,
  fromCurrency: string,
  toCurrency: string,
  fromAmount: number,
  toAmount: number,
  exchangeRate: number,
  conversionType: string
): Promise<void> {
  if (fromCurrency === toCurrency || !toAmount) return;

  const conversionLog: NewCurrencyConversionLog = {
    paymentId,
    fromCurrency: fromCurrency as any,
    toCurrency: toCurrency as any,
    fromAmount: fromAmount.toFixed(2),
    toAmount: toAmount.toFixed(2),
    exchangeRate: exchangeRate.toFixed(4),
    conversionDate: new Date().toISOString().split('T')[0],
    conversionType,
  };

  try {
    await db.insert(currencyConversionLog).values(conversionLog);
  } catch (error) {
    console.warn("Failed to log currency conversion:", error);
  }
}

/**
 * Helper function to safely convert number to proper string format for database
 */
function safeNumericString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentPlanIdString } = await params;
    const paymentPlanId = parseInt(paymentPlanIdString, 10);

    if (isNaN(paymentPlanId) || paymentPlanId <= 0) {
      return NextResponse.json(
        { error: "Invalid Payment Plan ID provided in URL" },
        { status: 400 }
      );
    }

    const paymentPlanResult = await db
      .select({
        id: paymentPlan.id,
        planName: paymentPlan.planName,
        pledgeId: paymentPlan.pledgeId,
        relationshipId: paymentPlan.relationshipId,
        frequency: paymentPlan.frequency,
        distributionType: paymentPlan.distributionType,
        totalPlannedAmount: paymentPlan.totalPlannedAmount,
        currency: paymentPlan.currency,
        totalPlannedAmountUsd: paymentPlan.totalPlannedAmountUsd,
        installmentAmount: paymentPlan.installmentAmount,
        installmentAmountUsd: paymentPlan.installmentAmountUsd,
        numberOfInstallments: paymentPlan.numberOfInstallments,
        exchangeRate: paymentPlan.exchangeRate,
        startDate: paymentPlan.startDate,
        endDate: paymentPlan.endDate,
        nextPaymentDate: paymentPlan.nextPaymentDate,
        installmentsPaid: paymentPlan.installmentsPaid,
        totalPaid: paymentPlan.totalPaid,
        totalPaidUsd: paymentPlan.totalPaidUsd,
        remainingAmount: paymentPlan.remainingAmount,
        remainingAmountUsd: paymentPlan.remainingAmountUsd,
        planStatus: paymentPlan.planStatus,
        autoRenew: paymentPlan.autoRenew,
        remindersSent: paymentPlan.remindersSent,
        lastReminderDate: paymentPlan.lastReminderDate,
        currencyPriority: paymentPlan.currencyPriority,
        isActive: paymentPlan.isActive,
        notes: paymentPlan.notes,
        internalNotes: paymentPlan.internalNotes,
        createdAt: paymentPlan.createdAt,
        updatedAt: paymentPlan.updatedAt,

        // Pledge related - subqueries:
        pledgeOriginalAmount: sql<string>`(SELECT ${pledge.originalAmount} FROM ${pledge} WHERE ${pledge.id} = ${paymentPlan.pledgeId})`.as("pledgeOriginalAmount"),
        pledgeOriginalAmountUsd: sql<string>`(SELECT ${pledge.originalAmountUsd} FROM ${pledge} WHERE ${pledge.id} = ${paymentPlan.pledgeId})`.as("pledgeOriginalAmountUsd"),
        pledgeCurrency: sql<string>`(SELECT ${pledge.currency} FROM ${pledge} WHERE ${pledge.id} = ${paymentPlan.pledgeId})`.as("pledgeCurrency"),
        pledgeDescription: sql<string>`(SELECT ${pledge.description} FROM ${pledge} WHERE ${pledge.id} = ${paymentPlan.pledgeId})`.as("pledgeDescription"),
        pledgeExchangeRate: sql<string>`(SELECT ${pledge.exchangeRate} FROM ${pledge} WHERE ${pledge.id} = ${paymentPlan.pledgeId})`.as("pledgeExchangeRate"),
        pledgeContact: sql<string>`(SELECT CONCAT(c.first_name, ' ', c.last_name) FROM ${pledge} p JOIN contact c ON p.contact_id = c.id WHERE p.id = ${paymentPlan.pledgeId})`.as("pledgeContact"),
      })
      .from(paymentPlan)
      .where(eq(paymentPlan.id, paymentPlanId))
      .limit(1);

    if (!paymentPlanResult.length) {
      return NextResponse.json(
        { error: "Payment plan not found" },
        { status: 404 }
      );
    }

    const plan = paymentPlanResult[0];

    let customInstallments = undefined;
    if (plan.distributionType === "custom") {
      const installmentSchedules = await db
        .select({
          id: installmentSchedule.id,
          installmentDate: installmentSchedule.installmentDate,
          installmentAmount: installmentSchedule.installmentAmount,
          currency: installmentSchedule.currency,
          installmentAmountUsd: installmentSchedule.installmentAmountUsd,
          notes: installmentSchedule.notes,
          status: installmentSchedule.status,
          paidDate: installmentSchedule.paidDate,
        })
        .from(installmentSchedule)
        .where(eq(installmentSchedule.paymentPlanId, plan.id))
        .orderBy(installmentSchedule.installmentDate);

      customInstallments = installmentSchedules.map((schedule) => ({
        installmentDate: schedule.installmentDate,
        installmentAmount: Number.parseFloat(schedule.installmentAmount.toString()),
        currency: schedule.currency || plan.currency,
        installmentAmountUsd: schedule.installmentAmountUsd ? Number.parseFloat(schedule.installmentAmountUsd.toString()) : undefined,
        status: schedule.status || "pending",
        paidDate: schedule.paidDate,
        notes: schedule.notes || "",
        paymentId: undefined,
      }));
    }

    const responsePaymentPlan = {
      ...plan,
      customInstallments,
    };

    return NextResponse.json(
      { paymentPlan: responsePaymentPlan },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching payment plan:", error);
    return ErrorHandler.handle(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planIdString } = await params;
    const planId = parseInt(planIdString, 10);
    if (isNaN(planId) || planId <= 0) {
      return NextResponse.json(
        { error: "Invalid payment plan ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Parse and validate with Zod, return structured errors if fails
    let validatedData: UpdatePaymentPlanRequest;
    try {
      validatedData = updatePaymentPlanSchema.parse(body);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: zodError.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 }
        );
      }
      throw zodError;
    }

    // Fetch existing plan
    const [existingPlan] = await db
      .select()
      .from(paymentPlan)
      .where(eq(paymentPlan.id, planId))
      .limit(1);

    if (!existingPlan) {
      return NextResponse.json(
        { error: "Payment plan not found" },
        { status: 404 }
      );
    }

    // If pledgeId is provided, validate pledge exists
    if (validatedData.pledgeId !== undefined) {
      const pledgeExists = await db
        .select({
          id: pledge.id,
          currency: pledge.currency,
          exchangeRate: pledge.exchangeRate,
        })
        .from(pledge)
        .where(eq(pledge.id, validatedData.pledgeId))
        .limit(1);

      if (!pledgeExists.length) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "pledgeId",
              message: "Pledge not found with provided pledgeId",
            }],
          },
          { status: 400 }
        );
      }
    }

    // If relationshipId is provided, validate relationship exists
    if (validatedData.relationshipId !== undefined) {
      const relationshipExists = await db
        .select()
        .from(relationships)
        .where(eq(relationships.id, validatedData.relationshipId))
        .limit(1);

      if (!relationshipExists.length) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "relationshipId",
              message: "Relationship not found with provided relationshipId",
            }],
          },
          { status: 400 }
        );
      }
    }

    // Helper functions for currency precision
    const toCents = (amount: number) => Math.round(amount * 100);
    const fromCents = (cents: number) => Math.round(cents) / 100;

    // Validate custom installments
    if (validatedData.distributionType === "custom" && validatedData.customInstallments) {
      if (validatedData.customInstallments.length === 0) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "customInstallments",
              message: "Custom installments must be provided for 'custom' distribution type.",
            }],
          },
          { status: 400 }
        );
      }

      const totalCustomCents = validatedData.customInstallments.reduce(
        (sum, inst) => sum + toCents(inst.installmentAmount),
        0
      );
      const expectedCents = toCents(
        validatedData.totalPlannedAmount || Number.parseFloat(existingPlan.totalPlannedAmount.toString())
      );

      const difference = expectedCents - totalCustomCents;

      if (Math.abs(difference) > 2) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "totalPlannedAmount",
              message: `Sum of custom installments (${fromCents(totalCustomCents)}) must equal the total planned amount (${fromCents(expectedCents)}).`,
            }],
          },
          { status: 400 }
        );
      } else if (difference !== 0) {
        // Auto-adjust last installment amount
        const lastIndex = validatedData.customInstallments.length - 1;
        const lastCents = toCents(validatedData.customInstallments[lastIndex].installmentAmount);
        validatedData.customInstallments[lastIndex].installmentAmount = fromCents(lastCents + difference);
      }

      // Validate unique installment dates
      const dates = validatedData.customInstallments.map((inst) => inst.installmentDate);
      if (new Set(dates).size !== dates.length) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "customInstallments",
              message: "Installment dates must be unique.",
            }],
          },
          { status: 400 }
        );
      }
    }

    // Validate fixed distribution
    if (validatedData.distributionType === "fixed") {
      if (!validatedData.installmentAmount || !validatedData.numberOfInstallments) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{
              field: "installmentAmount/numberOfInstallments",
              message: "Installment amount and number of installments are required for 'fixed' distribution type.",
            }],
          },
          { status: 400 }
        );
      }

      const totalPlannedAmount = validatedData.totalPlannedAmount || Number.parseFloat(existingPlan.totalPlannedAmount.toString());
      const numberOfInstallments = validatedData.numberOfInstallments;

      const totalCents = toCents(totalPlannedAmount);
      const baseCentsPerInstallment = Math.floor(totalCents / numberOfInstallments);
      const remainderCents = totalCents % numberOfInstallments;

      const baseInstallmentAmount = fromCents(baseCentsPerInstallment);

      const providedInstallmentCents = toCents(validatedData.installmentAmount);
      const calculatedTotalCents = providedInstallmentCents * numberOfInstallments;

      if (Math.abs(calculatedTotalCents - totalCents) > 1) {
        if (remainderCents === 0) {
          validatedData.installmentAmount = baseInstallmentAmount;
        } else {
          // Convert to custom installments for handling remainder
          const customInstallments = [];
          const startDate = new Date(validatedData.startDate || existingPlan.startDate);
          const frequency = validatedData.frequency || existingPlan.frequency;

          for (let i = 0; i < numberOfInstallments; i++) {
            const installmentDate = new Date(startDate);

            switch (frequency) {
              case "weekly":
                installmentDate.setDate(startDate.getDate() + i * 7);
                break;
              case "monthly":
                installmentDate.setMonth(startDate.getMonth() + i);
                break;
              case "quarterly":
                installmentDate.setMonth(startDate.getMonth() + i * 3);
                break;
              case "biannual":
                installmentDate.setMonth(startDate.getMonth() + i * 6);
                break;
              case "annual":
                installmentDate.setFullYear(startDate.getFullYear() + i);
                break;
              default:
                installmentDate.setMonth(startDate.getMonth() + i);
            }

            let installmentCents = baseCentsPerInstallment;
            if (i < remainderCents) {
              installmentCents += 1;
            }

            customInstallments.push({
              installmentDate: installmentDate.toISOString().split("T")[0],
              installmentAmount: fromCents(installmentCents),
              notes: `Installment ${i + 1}`,
            });
          }

          validatedData.distributionType = "custom";
          validatedData.customInstallments = customInstallments;
          validatedData.installmentAmount = baseInstallmentAmount;
        }
      }
    }

    // Get pledge details for currency conversions
    const [currentPledge] = await db
      .select({
        currency: pledge.currency,
        exchangeRate: pledge.exchangeRate,
      })
      .from(pledge)
      .where(eq(pledge.id, validatedData.pledgeId || existingPlan.pledgeId))
      .limit(1);

    const pledgeCurrency = currentPledge?.currency || "USD";
    const pledgeExchangeRate = currentPledge?.exchangeRate ? parseFloat(currentPledge.exchangeRate.toString()) : null;

    // Calculate USD amounts using proper exchange rates for updated values
    let calculatedTotalUsd: string | null = null;
    let calculatedInstallmentUsd: string | null = null;
    let effectiveExchangeRate: string | null = null;

    if (validatedData.totalPlannedAmount && validatedData.currency) {
      if (validatedData.currency === "USD") {
        calculatedTotalUsd = validatedData.totalPlannedAmount.toFixed(2);
        effectiveExchangeRate = "1.0000";
      } else {
        const usdRate = await getExchangeRate(
          validatedData.currency,
          "USD",
          validatedData.exchangeRate,
          validatedData.startDate || existingPlan.startDate
        );
        if (usdRate) {
          calculatedTotalUsd = (validatedData.totalPlannedAmount * usdRate).toFixed(2);
          effectiveExchangeRate = usdRate.toFixed(4);
        }
      }
    }

    if (validatedData.installmentAmount && validatedData.currency) {
      if (validatedData.currency === "USD") {
        calculatedInstallmentUsd = validatedData.installmentAmount.toFixed(2);
      } else {
        const usdRate = await getExchangeRate(
          validatedData.currency,
          "USD",
          validatedData.exchangeRate,
          validatedData.startDate || existingPlan.startDate
        );
        if (usdRate) {
          calculatedInstallmentUsd = (validatedData.installmentAmount * usdRate).toFixed(2);
        }
      }
    }

    const dataToUpdate: Partial<PaymentPlan> = {
      updatedAt: new Date(),
      ...(validatedData.planName !== undefined && { planName: validatedData.planName }),
      ...(validatedData.frequency !== undefined && { frequency: validatedData.frequency }),
      ...(validatedData.distributionType !== undefined && { distributionType: validatedData.distributionType }),
      ...(validatedData.totalPlannedAmount !== undefined && { totalPlannedAmount: validatedData.totalPlannedAmount.toString() }),
      ...(validatedData.currency !== undefined && { currency: validatedData.currency }),
      ...(calculatedTotalUsd && { totalPlannedAmountUsd: calculatedTotalUsd }),
      ...(validatedData.totalPlannedAmountUsd !== undefined && !calculatedTotalUsd && { totalPlannedAmountUsd: validatedData.totalPlannedAmountUsd.toString() }),
      ...(validatedData.installmentAmount !== undefined && { installmentAmount: validatedData.installmentAmount.toString() }),
      ...(calculatedInstallmentUsd && { installmentAmountUsd: calculatedInstallmentUsd }),
      ...(validatedData.installmentAmountUsd !== undefined && !calculatedInstallmentUsd && { installmentAmountUsd: validatedData.installmentAmountUsd.toString() }),
      ...(validatedData.numberOfInstallments !== undefined && { numberOfInstallments: validatedData.numberOfInstallments }),
      ...(effectiveExchangeRate && { exchangeRate: effectiveExchangeRate }),
      ...(validatedData.exchangeRate !== undefined && !effectiveExchangeRate && { exchangeRate: validatedData.exchangeRate.toString() }),
      ...(validatedData.startDate !== undefined && { startDate: validatedData.startDate }),
      ...(validatedData.endDate !== undefined && { endDate: validatedData.endDate }),
      ...(validatedData.nextPaymentDate !== undefined && { nextPaymentDate: validatedData.nextPaymentDate }),
      ...(validatedData.remainingAmountUsd !== undefined && { remainingAmountUsd: validatedData.remainingAmountUsd.toString() }),
      ...(validatedData.currencyPriority !== undefined && { currencyPriority: validatedData.currencyPriority }),
      ...(validatedData.autoRenew !== undefined && { autoRenew: validatedData.autoRenew }),
      ...(validatedData.planStatus !== undefined && { planStatus: validatedData.planStatus }),
      ...(validatedData.notes !== undefined && { notes: validatedData.notes }),
      ...(validatedData.internalNotes !== undefined && { internalNotes: validatedData.internalNotes }),
      ...(validatedData.pledgeId !== undefined && { pledgeId: validatedData.pledgeId }),
      ...(validatedData.relationshipId !== undefined && { relationshipId: validatedData.relationshipId }),
    };

    // Handle installment schedule update with proper multi-currency support
    if (validatedData.distributionType !== undefined) {
      if (validatedData.distributionType === "custom") {
        if (validatedData.customInstallments) {
          // Remove old installments first
          await db.delete(installmentSchedule).where(eq(installmentSchedule.paymentPlanId, planId));

          // Insert new custom installments with proper currency conversions
          const installmentsToInsert = [];
          for (const inst of validatedData.customInstallments) {
            const instCurrency = inst.currency || validatedData.currency || existingPlan.currency;
            let instAmountUsd: string | null = null;

            if (instCurrency === "USD") {
              instAmountUsd = inst.installmentAmount.toFixed(2);
            } else if (inst.installmentAmountUsd) {
              instAmountUsd = inst.installmentAmountUsd.toFixed(2);
            } else {
              // Calculate USD amount for this installment
              const usdRate = await getExchangeRate(
                instCurrency,
                "USD",
                validatedData.exchangeRate,
                inst.installmentDate
              );
              if (usdRate) {
                instAmountUsd = (inst.installmentAmount * usdRate).toFixed(2);
              }
            }

            installmentsToInsert.push({
              paymentPlanId: planId,
              installmentDate: inst.installmentDate,
              installmentAmount: inst.installmentAmount.toString(),
              currency: instCurrency,
              installmentAmountUsd: instAmountUsd,
              notes: inst.notes || null,
              status: inst.status || "pending",
            });
          }

          await db.insert(installmentSchedule).values(installmentsToInsert);

          dataToUpdate.numberOfInstallments = validatedData.customInstallments.length;

          // Update total planned to exact sum of custom installments
          const exactTotal = fromCents(
            validatedData.customInstallments.reduce(
              (sum, inst) => sum + toCents(inst.installmentAmount),
              0,
            )
          );
          dataToUpdate.totalPlannedAmount = exactTotal.toString();

          // Calculate USD total
          if (validatedData.currency === "USD") {
            dataToUpdate.totalPlannedAmountUsd = exactTotal.toString();
          } else {
            const usdRate = await getExchangeRate(
              validatedData.currency || existingPlan.currency,
              "USD",
              validatedData.exchangeRate
            );
            if (usdRate) {
              dataToUpdate.totalPlannedAmountUsd = (exactTotal * usdRate).toString();
            }
          }
        }
      } else if (validatedData.distributionType === "fixed") {
        // Remove any custom installments if switching to fixed
        await db.delete(installmentSchedule).where(eq(installmentSchedule.paymentPlanId, planId));

        if (validatedData.installmentAmount && validatedData.numberOfInstallments) {
          const exactTotal = fromCents(
            toCents(validatedData.installmentAmount) * validatedData.numberOfInstallments
          );
          dataToUpdate.totalPlannedAmount = exactTotal.toString();

          // Calculate USD amounts
          if (validatedData.currency === "USD") {
            dataToUpdate.totalPlannedAmountUsd = exactTotal.toString();
            dataToUpdate.installmentAmountUsd = validatedData.installmentAmount.toString();
          } else {
            const usdRate = await getExchangeRate(
              validatedData.currency || existingPlan.currency,
              "USD",
              validatedData.exchangeRate
            );
            if (usdRate) {
              dataToUpdate.totalPlannedAmountUsd = (exactTotal * usdRate).toString();
              dataToUpdate.installmentAmountUsd = (validatedData.installmentAmount * usdRate).toString();
            }
          }
        }
      }
    }

    // **RECALCULATE REMAINING AMOUNTS BASED ON UPDATED VALUES**
    const currentTotalPaidCents = toCents(parseFloat(existingPlan.totalPaid.toString()) || 0);
    const currentTotalPaidUsdCents = toCents(parseFloat(existingPlan.totalPaidUsd?.toString() || "0"));

    // Get the new total planned amount (either from update or existing)
    const newTotalPlannedCents = toCents(parseFloat(dataToUpdate.totalPlannedAmount || existingPlan.totalPlannedAmount.toString()));
    const newTotalPlannedUsdCents = toCents(parseFloat(dataToUpdate.totalPlannedAmountUsd || existingPlan.totalPlannedAmountUsd?.toString() || "0"));

    // Calculate remaining amounts with precision
    const newRemainingAmountCents = Math.max(0, newTotalPlannedCents - currentTotalPaidCents);
    const newRemainingAmountUsdCents = Math.max(0, newTotalPlannedUsdCents - currentTotalPaidUsdCents);

    // Update the dataToUpdate object with recalculated remaining amounts
    dataToUpdate.remainingAmount = fromCents(newRemainingAmountCents).toString();
    dataToUpdate.remainingAmountUsd = fromCents(newRemainingAmountUsdCents).toString();

    // Update payment plan record
    const [updatedPlan] = await db
      .update(paymentPlan)
      .set(dataToUpdate)
      .where(eq(paymentPlan.id, planId))
      .returning();

    // Update related pending payments with comprehensive multi-currency support
    if (validatedData.distributionType !== undefined ||
      validatedData.installmentAmount !== undefined ||
      validatedData.currency !== undefined) {

      // Get all pending payments for this plan
      const pendingPayments = await db
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.paymentPlanId, planId),
            eq(payment.paymentStatus, "pending")
          )
        );

      // Update pending payments with new currency conversions
      for (const pendingPayment of pendingPayments) {
        const paymentAmount = parseFloat(pendingPayment.amount.toString());
        const paymentCurrency = pendingPayment.currency;
        const planCurrency = validatedData.currency || existingPlan.currency;
        
        const conversions = await calculateMultiCurrencyConversions(
          paymentAmount,
          paymentCurrency,
          pledgeCurrency,
          planCurrency,
          validatedData.exchangeRate,
          pendingPayment.paymentDate
        );

        const paymentUpdates = {
          amountUsd: safeNumericString(conversions.amountUsd),
          exchangeRate: safeNumericString(conversions.usdExchangeRate),
          amountInPledgeCurrency: safeNumericString(conversions.amountInPledgeCurrency),
          pledgeCurrencyExchangeRate: safeNumericString(conversions.pledgeCurrencyExchangeRate),
          amountInPlanCurrency: safeNumericString(conversions.amountInPlanCurrency),
          planCurrencyExchangeRate: safeNumericString(conversions.planCurrencyExchangeRate),
        };

        await db
          .update(payment)
          .set(paymentUpdates)
          .where(eq(payment.id, pendingPayment.id));

        // Log comprehensive currency conversions
        if (conversions.amountUsd && paymentCurrency !== "USD" && conversions.usdExchangeRate) {
          await logCurrencyConversion(
            pendingPayment.id,
            paymentCurrency,
            "USD",
            paymentAmount,
            conversions.amountUsd,
            conversions.usdExchangeRate,
            "plan_update_usd"
          );
        }

        if (conversions.amountInPledgeCurrency !== paymentAmount && conversions.pledgeCurrencyExchangeRate) {
          await logCurrencyConversion(
            pendingPayment.id,
            paymentCurrency,
            pledgeCurrency,
            paymentAmount,
            conversions.amountInPledgeCurrency,
            conversions.pledgeCurrencyExchangeRate,
            "plan_update_pledge"
          );
        }

        if (conversions.amountInPlanCurrency !== paymentAmount && conversions.planCurrencyExchangeRate) {
          await logCurrencyConversion(
            pendingPayment.id,
            paymentCurrency,
            planCurrency,
            paymentAmount,
            conversions.amountInPlanCurrency,
            conversions.planCurrencyExchangeRate,
            "plan_update_plan"
          );
        }
      }
    }

    return NextResponse.json({
      message: "Payment plan updated successfully",
      paymentPlan: updatedPlan,
    });
  } catch (error) {
    console.error("Error updating payment plan:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return ErrorHandler.handle(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planIdString } = await params;
    const planId = parseInt(planIdString, 10);

    if (isNaN(planId) || planId <= 0) {
      return NextResponse.json(
        { error: "Invalid payment plan ID" },
        { status: 400 }
      );
    }

    // Check if payment plan exists
    const [existingPlan] = await db
      .select()
      .from(paymentPlan)
      .where(eq(paymentPlan.id, planId))
      .limit(1);

    if (!existingPlan) {
      return NextResponse.json(
        { error: "Payment plan not found" },
        { status: 404 }
      );
    }

    // Check if there are any completed payments for this plan
    const existingPayments = await db
      .select()
      .from(payment)
      .where(
        and(
          eq(payment.paymentPlanId, planId),
          eq(payment.paymentStatus, "completed")
        )
      )
      .limit(1);

    if (existingPayments.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete payment plan with completed payments. Consider cancelling instead.",
        },
        { status: 400 }
      );
    }

    // Delete related records in sequence (foreign key constraints)
    // Delete currency conversion logs first
    await db
      .delete(currencyConversionLog)
      .where(
        sql`payment_id IN (SELECT id FROM ${payment} WHERE payment_plan_id = ${planId})`
      );

    // Delete installment schedules (this will cascade to related payments via foreign key)
    await db
      .delete(installmentSchedule)
      .where(eq(installmentSchedule.paymentPlanId, planId));

    // Delete any remaining pending payments
    await db
      .delete(payment)
      .where(
        and(
          eq(payment.paymentPlanId, planId),
          eq(payment.paymentStatus, "pending")
        )
      );

    // Finally delete the payment plan
    await db
      .delete(paymentPlan)
      .where(eq(paymentPlan.id, planId));

    return NextResponse.json({
      message: "Payment plan deleted successfully",
      deletedPlanId: planId,
    });

  } catch (error) {
    console.error("Error deleting payment plan:", error);
    return ErrorHandler.handle(error);
  }
}