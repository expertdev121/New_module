/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
// Import the specific types from your schema file
import { paymentPlan, pledge, installmentSchedule, payment, PaymentPlan, NewPaymentPlan, NewPayment } from "@/lib/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";

// Zod schema for validating individual custom installments
const installmentSchema = z.object({
  date: z.string().min(1, "Installment date is required"),
  amount: z.number().positive("Installment amount must be positive"),
  notes: z.string().optional(),
});

// Updated schema with conditional validation for custom installments
const paymentPlanSchema = z.object({
  pledgeId: z.number().positive(),
  planName: z.string().optional(),
  frequency: z.enum([
    "weekly",
    "monthly",
    "quarterly",
    "biannual",
    "annual",
    "one_time",
    "custom",
  ]),
  distributionType: z.enum(["fixed", "custom"]).default("fixed"),
  totalPlannedAmount: z
    .number()
    .positive("Total planned amount must be positive"),
  currency: z.enum(["USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR"]),
  installmentAmount: z.number().positive("Installment amount must be positive").optional(),
  numberOfInstallments: z
    .number()
    .int()
    .positive("Number of installments must be positive")
    .optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  nextPaymentDate: z.string().optional(),
  autoRenew: z.boolean().default(false),
  planStatus: z.enum(["active", "completed", "cancelled", "paused", "overdue"]).optional(),
  // Updated paymentMethod to match schema enum
  paymentMethod: z.enum([
    "ach", "bill_pay", "cash", "check", "credit", "credit_card", "expected",
    "goods_and_services", "matching_funds", "money_order", "p2p", "pending", "bank_transfer",
    "refund", "scholarship", "stock", "student_portion", "unknown", "wire", "xfer", "other"
  ]).optional(),
  // methodDetail is text in schema, not enum
  methodDetail: z.string().optional(),
  currencyPriority: z.number().int().positive().default(1),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  customInstallments: z.array(installmentSchema).optional(),
}).refine((data) => {
  // Validation for fixed distribution type
  if (data.distributionType === "fixed") {
    return data.installmentAmount !== undefined && data.numberOfInstallments !== undefined;
  }
  // Validation for custom distribution type
  if (data.distributionType === "custom") {
    return data.customInstallments && data.customInstallments.length > 0;
  }
  return true;
}, {
  message: "For 'fixed' distribution type, installmentAmount and numberOfInstallments are required. For 'custom' distribution type, customInstallments array is required.",
  path: ["distributionType"]
});

/**
 * Helper function to calculate installment dates based on frequency
 */
function calculateInstallmentDates(startDate: string, frequency: string, numberOfInstallments: number): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < numberOfInstallments; i++) {
    const installmentDate = new Date(start);

    switch (frequency) {
      case "weekly":
        installmentDate.setDate(start.getDate() + (i * 7));
        break;
      case "monthly":
        installmentDate.setMonth(start.getMonth() + i);
        break;
      case "quarterly":
        installmentDate.setMonth(start.getMonth() + (i * 3));
        break;
      case "biannual":
        installmentDate.setMonth(start.getMonth() + (i * 6));
        break;
      case "annual":
        installmentDate.setFullYear(start.getFullYear() + i);
        break;
      case "one_time":
        installmentDate.setTime(start.getTime());
        break;
      default:
        installmentDate.setTime(start.getTime());
    }

    dates.push(installmentDate.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Helper function to calculate USD conversions
 */
function calculateUsdConversions(amount: number, currency: string, exchangeRate: number | null) {
  if (!exchangeRate || currency === "USD") {
    return currency === "USD" ? amount : null;
  }
  return amount * exchangeRate;
}

/**
 * Handles POST requests to create a new payment plan.
 * If distributionType is 'custom', it also creates individual installment schedule entries.
 * The numberOfInstallments will be set to the length of customInstallments for custom distribution.
 * Creates scheduled payment records for each installment.
 */
export async function POST(request: NextRequest) {
  let createdPaymentPlan: PaymentPlan | null = null;
  let paymentPlanIdToDelete: number | null = null;
  let createdInstallmentIds: number[] = [];
  let createdPaymentIds: number[] = [];

  try {
    const body = await request.json();
    const validatedData = paymentPlanSchema.parse(body);

    // Precision helper functions
    const toCents = (amount: number): number => Math.round(amount * 100);
    const fromCents = (cents: number): number => Math.round(cents) / 100;

    // --- Enhanced Validation for 'custom' distribution type ---
    if (validatedData.distributionType === "custom") {
      if (!validatedData.customInstallments || validatedData.customInstallments.length === 0) {
        return NextResponse.json(
          { error: "Validation failed", details: [{ field: "customInstallments", message: "Custom installments must be provided for 'custom' distribution type." }] },
          { status: 400 }
        );
      }

      // Validate sum of custom installments with precision handling
      const totalCustomCents = validatedData.customInstallments.reduce((sum, installment) => 
        sum + toCents(installment.amount), 0
      );
      const expectedCents = toCents(validatedData.totalPlannedAmount);
      
      // Allow up to 2 cents difference and auto-adjust
      const difference = expectedCents - totalCustomCents;
      if (Math.abs(difference) > 2) {
        return NextResponse.json(
          { error: "Validation failed", details: [{ field: "totalPlannedAmount", message: `Sum of custom installments (${fromCents(totalCustomCents)}) must equal the total planned amount (${fromCents(expectedCents)}).` }] },
          { status: 400 }
        );
      } else if (difference !== 0) {
        // Auto-adjust the last installment
        const lastIndex = validatedData.customInstallments.length - 1;
        const lastCents = toCents(validatedData.customInstallments[lastIndex].amount);
        validatedData.customInstallments[lastIndex].amount = fromCents(lastCents + difference);
      }

      // Validate installment dates are unique
      const installmentDates = validatedData.customInstallments.map(inst => inst.date);
      const uniqueDates = new Set(installmentDates);
      if (uniqueDates.size !== installmentDates.length) {
        return NextResponse.json(
          { error: "Validation failed", details: [{ field: "customInstallments", message: "Installment dates must be unique." }] },
          { status: 400 }
        );
      }

      // Validate that installment dates are not too far in the past
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(currentDate);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const invalidDates = validatedData.customInstallments.filter(inst => {
        const instDate = new Date(inst.date);
        instDate.setHours(0, 0, 0, 0);
        return instDate < thirtyDaysAgo;
      });
      
      if (invalidDates.length > 0) {
        return NextResponse.json(
          { error: "Validation failed", details: [{ field: "customInstallments", message: "Installment dates cannot be more than 30 days in the past." }] },
          { status: 400 }
        );
      }
    }

    // --- Enhanced Validation for 'fixed' distribution type with Auto-Correction ---
    if (validatedData.distributionType === "fixed") {
      if (!validatedData.installmentAmount || !validatedData.numberOfInstallments) {
        return NextResponse.json(
          { error: "Validation failed", details: [{ field: "installmentAmount/numberOfInstallments", message: "Installment amount and number of installments are required for 'fixed' distribution type." }] },
          { status: 400 }
        );
      }

      // Auto-correct precision issues for fixed distribution
      const totalPlannedAmount = validatedData.totalPlannedAmount;
      const numberOfInstallments = validatedData.numberOfInstallments;
      
      // Calculate correct installment amount using cent-based math
      const totalCents = toCents(totalPlannedAmount);
      const baseCentsPerInstallment = Math.floor(totalCents / numberOfInstallments);
      const remainderCents = totalCents % numberOfInstallments;
      
      // Check if the provided installment amount would create precision issues
      const providedInstallmentCents = toCents(validatedData.installmentAmount);
      const calculatedTotalCents = providedInstallmentCents * numberOfInstallments;
      const expectedTotalCents = toCents(totalPlannedAmount);
      
      // If there's a mismatch, auto-correct or convert to custom
      if (Math.abs(calculatedTotalCents - expectedTotalCents) > 1) {
        if (remainderCents === 0) {
          // Perfect division - just update the installment amount
          const baseInstallmentAmount = fromCents(baseCentsPerInstallment);
          validatedData.installmentAmount = baseInstallmentAmount;
        } else {
          // Convert to custom distribution to handle remainder properly
          const customInstallments = [];
          const startDate = new Date(validatedData.startDate);
          
          for (let i = 0; i < numberOfInstallments; i++) {
            const installmentDate = new Date(startDate);
            
            switch (validatedData.frequency) {
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
            
            // Distribute remainder cents among first installments
            let installmentCents = baseCentsPerInstallment;
            if (i < remainderCents) {
              installmentCents += 1;
            }
            
            customInstallments.push({
              date: installmentDate.toISOString().split('T')[0],
              amount: fromCents(installmentCents),
              notes: `Installment ${i + 1}`,
            });
          }
          
          validatedData.distributionType = "custom";
          validatedData.customInstallments = customInstallments;
          validatedData.installmentAmount = fromCents(baseCentsPerInstallment);
        }
      }
    }

    // 1. Check if the associated pledge exists AND retrieve its exchange_rate
    const currentPledge = await db
      .select({
        id: pledge.id,
        exchangeRate: pledge.exchangeRate,
        currency: pledge.currency,
      })
      .from(pledge)
      .where(eq(pledge.id, validatedData.pledgeId))
      .limit(1);

    if (currentPledge.length === 0) {
      return NextResponse.json({ error: "Pledge not found" }, { status: 404 });
    }

    const pledgeExchangeRate = currentPledge[0].exchangeRate;
    const pledgeCurrency = currentPledge[0].currency;

    // Calculate values based on distribution type
    let finalInstallmentAmount: string;
    let finalNumberOfInstallments: number;
    let finalTotalPlannedAmount: string;

    if (validatedData.distributionType === "custom") {
      // For custom distribution, set numberOfInstallments to the length of customInstallments
      finalNumberOfInstallments = validatedData.customInstallments!.length;
      
      // Calculate exact total from custom installments
      const exactTotalCents = validatedData.customInstallments!.reduce((sum, inst) => 
        sum + toCents(inst.amount), 0
      );
      finalTotalPlannedAmount = fromCents(exactTotalCents).toFixed(2);
      
      // Calculate average installment amount for reference
      finalInstallmentAmount = fromCents(Math.floor(exactTotalCents / finalNumberOfInstallments)).toFixed(2);
    } else {
      // For fixed distribution, use the corrected values
      finalInstallmentAmount = validatedData.installmentAmount!.toFixed(2);
      finalNumberOfInstallments = validatedData.numberOfInstallments!;
      
      // Ensure total matches installment amount × count exactly
      const exactTotalCents = toCents(validatedData.installmentAmount!) * finalNumberOfInstallments;
      finalTotalPlannedAmount = fromCents(exactTotalCents).toFixed(2);
    }

    // Calculate USD conversions
    const totalPlannedAmountUsd = calculateUsdConversions(
      parseFloat(finalTotalPlannedAmount), 
      validatedData.currency, 
      pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
    );
    
    const installmentAmountUsd = calculateUsdConversions(
      parseFloat(finalInstallmentAmount), 
      validatedData.currency, 
      pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
    );

    const remainingAmountUsd = totalPlannedAmountUsd;

    // Prepare data for inserting into the paymentPlan table
    const newPaymentPlanData: NewPaymentPlan = {
      pledgeId: validatedData.pledgeId,
      planName: validatedData.planName || null,
      frequency: validatedData.frequency,
      distributionType: validatedData.distributionType,
      totalPlannedAmount: finalTotalPlannedAmount,
      currency: validatedData.currency,
      totalPlannedAmountUsd: totalPlannedAmountUsd?.toFixed(2) || null,
      installmentAmount: finalInstallmentAmount,
      installmentAmountUsd: installmentAmountUsd?.toFixed(2) || null,
      numberOfInstallments: finalNumberOfInstallments,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate || null,
      nextPaymentDate: validatedData.nextPaymentDate || validatedData.startDate,
      remainingAmount: finalTotalPlannedAmount,
      remainingAmountUsd: remainingAmountUsd?.toFixed(2) || null,
      planStatus: "active",
      autoRenew: validatedData.autoRenew,
      currencyPriority: validatedData.currencyPriority,
      remindersSent: 0,
      lastReminderDate: null,
      isActive: true,
      notes: validatedData.notes || null,
      internalNotes: validatedData.internalNotes || null,
      totalPaid: "0",
      totalPaidUsd: "0",
      exchangeRate: pledgeExchangeRate,
    };

    // 2. Insert the new payment plan
    const paymentPlanResult = await db
      .insert(paymentPlan)
      .values(newPaymentPlanData)
      .returning();

    if (paymentPlanResult.length === 0) {
      throw new Error("Failed to create payment plan record in database. No record returned.");
    }

    createdPaymentPlan = paymentPlanResult[0];
    paymentPlanIdToDelete = createdPaymentPlan.id;

    // 3. Handle installment schedules and scheduled payments based on distribution type
    if (validatedData.distributionType === "custom" && validatedData.customInstallments) {
      // Custom distribution - insert custom installment schedules and payments
      const installmentsToInsert = validatedData.customInstallments.map((inst) => ({
        paymentPlanId: createdPaymentPlan!.id,
        installmentDate: inst.date,
        installmentAmount: inst.amount.toFixed(2),
        currency: createdPaymentPlan!.currency,
        installmentAmountUsd: calculateUsdConversions(
          inst.amount, 
          validatedData.currency, 
          pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
        )?.toFixed(2) || null,
        notes: inst.notes || null,
      }));

      const installmentResults = await db.insert(installmentSchedule).values(installmentsToInsert).returning();
      createdInstallmentIds = installmentResults.map(inst => inst.id);

      // Create scheduled payments for each custom installment
      const scheduledPayments: NewPayment[] = installmentResults.map((installmentRecord, index) => {
        const installmentAmount = validatedData.customInstallments![index].amount;
        const amountUsd = calculateUsdConversions(
          installmentAmount, 
          validatedData.currency, 
          pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
        );
        
        // Calculate pledge currency conversion
        let amountInPledgeCurrency = installmentAmount;
        let pledgeCurrencyExchangeRate = null;
        
        if (validatedData.currency !== pledgeCurrency && pledgeExchangeRate) {
          // Convert from plan currency to pledge currency
          if (pledgeCurrency === "USD") {
            amountInPledgeCurrency = installmentAmount * parseFloat(pledgeExchangeRate.toString());
          } else if (validatedData.currency === "USD") {
            amountInPledgeCurrency = installmentAmount / parseFloat(pledgeExchangeRate.toString());
          } else {
            // Both are non-USD currencies - convert through USD
            const usdAmount = installmentAmount * parseFloat(pledgeExchangeRate.toString());
            // Would need pledge currency exchange rate to USD for this conversion
            amountInPledgeCurrency = installmentAmount; // Fallback to original amount
          }
          pledgeCurrencyExchangeRate = pledgeExchangeRate;
        }

        return {
          pledgeId: validatedData.pledgeId,
          paymentPlanId: createdPaymentPlan!.id,
          installmentScheduleId: installmentRecord.id,
          amount: installmentAmount.toFixed(2),
          currency: validatedData.currency,
          amountUsd: amountUsd?.toFixed(2) || null,
          amountInPledgeCurrency: amountInPledgeCurrency.toFixed(2),
          exchangeRate: pledgeExchangeRate,
          pledgeCurrencyExchangeRate: pledgeCurrencyExchangeRate,
          amountInPlanCurrency: installmentAmount.toFixed(2), // Same as amount since it's the plan currency
          planCurrencyExchangeRate: validatedData.currency === "USD" ? null : pledgeExchangeRate,
          paymentDate: installmentRecord.installmentDate,
          receivedDate: null, 
          paymentMethod: (validatedData.paymentMethod || "other") as NewPayment['paymentMethod'],
          methodDetail: validatedData.methodDetail || null,
          paymentStatus: "pending",
          referenceNumber: null,
          checkNumber: null,
          receiptNumber: null,
          receiptType: null,
          receiptIssued: false,
          solicitorId: null,
          bonusPercentage: null,
          bonusAmount: null,
          bonusRuleId: null,
          notes: validatedData.customInstallments![index].notes || null,
        };
      });

      const paymentResults = await db.insert(payment).values(scheduledPayments).returning();
      createdPaymentIds = paymentResults.map(p => p.id);

    } else {
      // Fixed distribution - calculate installment dates and create schedules and payments
      const installmentDates = calculateInstallmentDates(
        validatedData.startDate,
        validatedData.frequency,
        finalNumberOfInstallments
      );

      const installmentAmountUsdForFixed = calculateUsdConversions(
        parseFloat(finalInstallmentAmount), 
        validatedData.currency, 
        pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
      );

      const installmentsToInsert = installmentDates.map((date) => ({
        paymentPlanId: createdPaymentPlan!.id,
        installmentDate: date,
        installmentAmount: finalInstallmentAmount,
        currency: createdPaymentPlan!.currency,
        installmentAmountUsd: installmentAmountUsdForFixed?.toFixed(2) || null,
        notes: null,
      }));

      const installmentResults = await db.insert(installmentSchedule).values(installmentsToInsert).returning();
      createdInstallmentIds = installmentResults.map(inst => inst.id);

      // Create scheduled payments for each fixed installment
      const scheduledPayments: NewPayment[] = installmentResults.map((installmentRecord) => {
        const installmentAmount = parseFloat(finalInstallmentAmount);
        const amountUsd = calculateUsdConversions(
          installmentAmount, 
          validatedData.currency, 
          pledgeExchangeRate ? parseFloat(pledgeExchangeRate.toString()) : null
        );
        
        // Calculate pledge currency conversion
        let amountInPledgeCurrency = installmentAmount;
        let pledgeCurrencyExchangeRate = null;
        
        if (validatedData.currency !== pledgeCurrency && pledgeExchangeRate) {
          if (pledgeCurrency === "USD") {
            amountInPledgeCurrency = installmentAmount * parseFloat(pledgeExchangeRate.toString());
          } else if (validatedData.currency === "USD") {
            amountInPledgeCurrency = installmentAmount / parseFloat(pledgeExchangeRate.toString());
          } else {
            amountInPledgeCurrency = installmentAmount; // Fallback
          }
          pledgeCurrencyExchangeRate = pledgeExchangeRate;
        }

        return {
          pledgeId: validatedData.pledgeId,
          paymentPlanId: createdPaymentPlan!.id,
          installmentScheduleId: installmentRecord.id,
          amount: finalInstallmentAmount,
          currency: validatedData.currency,
          amountUsd: amountUsd?.toFixed(2) || null,
          amountInPledgeCurrency: amountInPledgeCurrency.toFixed(2),
          exchangeRate: pledgeExchangeRate,
          pledgeCurrencyExchangeRate: pledgeCurrencyExchangeRate,
          amountInPlanCurrency: finalInstallmentAmount,
          planCurrencyExchangeRate: validatedData.currency === "USD" ? null : pledgeExchangeRate,
          paymentDate: installmentRecord.installmentDate,
          receivedDate: null,
          paymentMethod: (validatedData.paymentMethod || "other") as NewPayment['paymentMethod'],
          methodDetail: validatedData.methodDetail || null,
          paymentStatus: "pending",
          referenceNumber: null,
          checkNumber: null,
          receiptNumber: null,
          receiptType: null,
          receiptIssued: false,
          solicitorId: null,
          bonusPercentage: null,
          bonusAmount: null,
          bonusRuleId: null,
          notes: null,
        };
      });

      const paymentResults = await db.insert(payment).values(scheduledPayments).returning();
      createdPaymentIds = paymentResults.map(p => p.id);
    }

    // All operations successful
    return NextResponse.json(
      {
        message: "Payment plan created successfully with scheduled payments",
        paymentPlan: createdPaymentPlan,
        scheduledPaymentsCount: createdPaymentIds.length,
      },
      { status: 201 }
    );

  } catch (error) {
    // --- Enhanced Manual Rollback Logic for Partial Failures ---
    console.warn("Error occurred during payment plan creation. Attempting rollback...");

    // Rollback payments first (due to foreign key constraints)
    if (createdPaymentIds.length > 0) {
      try {
        await db.delete(payment).where(sql`id = ANY(${createdPaymentIds})`);
        console.warn(`Successfully rolled back ${createdPaymentIds.length} scheduled payments.`);
      } catch (rollbackError) {
        console.error(`CRITICAL: Failed to rollback scheduled payments (IDs: ${createdPaymentIds.join(', ')}). Data inconsistency possible!`, rollbackError);
      }
    }

    // Rollback installment schedules
    if (createdInstallmentIds.length > 0) {
      try {
        await db.delete(installmentSchedule).where(sql`id = ANY(${createdInstallmentIds})`);
        console.warn(`Successfully rolled back ${createdInstallmentIds.length} installment schedules.`);
      } catch (rollbackError) {
        console.error(`CRITICAL: Failed to rollback installment schedules (IDs: ${createdInstallmentIds.join(', ')}). Data inconsistency possible!`, rollbackError);
      }
    }

    // Rollback payment plan
    if (paymentPlanIdToDelete) {
      try {
        await db.delete(paymentPlan).where(eq(paymentPlan.id, paymentPlanIdToDelete));
        console.warn(`Successfully rolled back payment plan (ID: ${paymentPlanIdToDelete}).`);
      } catch (rollbackError) {
        console.error(`CRITICAL: Failed to rollback payment plan (ID: ${paymentPlanIdToDelete}). Data inconsistency possible!`, rollbackError);
      }
    }

    // --- Error Response Handling ---
    if (error instanceof z.ZodError) {
      console.error("Validation error during payment plan creation:", error.issues);
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message === "Pledge not found") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes("Failed to create payment plan record")) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const pgError = error as any;
      if (pgError.code) {
          switch (pgError.code) {
              case '23502': // NOT NULL violation
                  console.error("PostgreSQL NOT NULL constraint violation:", pgError.detail || pgError.message);
                  return NextResponse.json(
                      { error: "Required data is missing or invalid (database constraint violation).", detail: pgError.detail || pgError.message },
                      { status: 400 }
                  );
              case '23503': // Foreign key violation
                  console.error("PostgreSQL Foreign Key constraint violation:", pgError.detail || pgError.message);
                  return NextResponse.json(
                      { error: "Associated record not found (foreign key violation).", detail: pgError.detail || pgError.message },
                      { status: 400 }
                  );
              case '23505': // Unique constraint violation
                  console.error("PostgreSQL Unique constraint violation:", pgError.detail || pgError.message);
                  return NextResponse.json(
                      { error: "Duplicate data entry (unique constraint violation).", detail: pgError.detail || pgError.message },
                      { status: 409 }
                  );
              default:
                  console.error(`Unhandled PostgreSQL error (Code: ${pgError.code}):`, pgError.message, pgError.detail);
                  return NextResponse.json(
                      { error: "A database error occurred.", message: pgError.message },
                      { status: 500 }
                  );
          }
      }
    }

    console.error("Unhandled general error creating payment plan:", error);
    return ErrorHandler.handle(error);
  }
}

// --- GET Endpoint ---
const querySchema = z.object({
  pledgeId: z.coerce.number().positive().optional(),
  contactId: z.coerce.number().positive().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  planStatus: z
    .enum(["active", "completed", "cancelled", "paused", "overdue"])
    .optional(),
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
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedParams = querySchema.safeParse({
      pledgeId: searchParams.get("pledgeId")
        ? parseInt(searchParams.get("pledgeId")!)
        : undefined,
      contactId: searchParams.get("contactId")
        ? parseInt(searchParams.get("contactId")!)
        : undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      planStatus: searchParams.get("planStatus") ?? undefined,
      frequency: searchParams.get("frequency") ?? undefined,
      distributionType: searchParams.get("distributionType") ?? undefined,
    });

    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsedParams.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { pledgeId, contactId, page, limit, planStatus, frequency, distributionType } =
      parsedParams.data;
    const offset = (page - 1) * limit;
    const conditions = [];

    if (pledgeId) {
      conditions.push(eq(paymentPlan.pledgeId, pledgeId));
    }

    if (contactId) {
      conditions.push(
        sql`${paymentPlan.pledgeId} IN (SELECT id FROM ${pledge} WHERE contact_id = ${contactId})`
      );
    }

    if (planStatus) {
      conditions.push(eq(paymentPlan.planStatus, planStatus));
    }

    if (frequency) {
      conditions.push(eq(paymentPlan.frequency, frequency));
    }

    if (distributionType) {
      conditions.push(eq(paymentPlan.distributionType, distributionType));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const paymentPlansQuery = db
      .select({
        id: paymentPlan.id,
        pledgeId: paymentPlan.pledgeId,
        planName: paymentPlan.planName,
        frequency: paymentPlan.frequency,
        distributionType: paymentPlan.distributionType,
        totalPlannedAmount: paymentPlan.totalPlannedAmount,
        currency: paymentPlan.currency,
        totalPlannedAmountUsd: paymentPlan.totalPlannedAmountUsd,
        installmentAmount: paymentPlan.installmentAmount,
        installmentAmountUsd: paymentPlan.installmentAmountUsd,
        numberOfInstallments: paymentPlan.numberOfInstallments,
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
        currencyPriority: paymentPlan.currencyPriority,
        isActive: paymentPlan.isActive,
        notes: paymentPlan.notes,
        internalNotes: paymentPlan.internalNotes,
        createdAt: paymentPlan.createdAt,
        updatedAt: paymentPlan.updatedAt,
        exchangeRate: paymentPlan.exchangeRate,
        pledgeDescription: sql<string>`(
          SELECT description FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeDescription"),
        pledgeOriginalAmount: sql<string>`(
          SELECT original_amount FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("pledgeOriginalAmount"),
        contactId: sql<number>`(
          SELECT contact_id FROM ${pledge} WHERE id = ${paymentPlan.pledgeId}
        )`.as("contactId"),
      })
      .from(paymentPlan)
      .where(whereClause)
      .orderBy(sql`${paymentPlan.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(paymentPlan)
      .where(whereClause);

    const [paymentPlans, totalCountResult] = await Promise.all([
      paymentPlansQuery.execute(),
      countQuery.execute(),
    ]);

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    const response = {
      paymentPlans,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        pledgeId,
        contactId,
        planStatus,
        frequency,
        distributionType,
      },
    };
    return NextResponse.json(response, {
      headers: {
        "X-Total-Count": response.pagination.totalCount.toString(),
      },
    });
  } catch (error) {
    console.error("Error fetching payment plans:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch payment plans",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}