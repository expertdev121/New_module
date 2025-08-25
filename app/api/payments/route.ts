import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, pledge, paymentAllocations } from "@/lib/db/schema";
import { sql, eq, and, or } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";

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

const allocationSchema = z.object({
  pledgeId: z.preprocess((val) => parseInt(String(val), 10), z.number().positive()),
  amount: z.number().positive(),
  installmentScheduleId: z.preprocess((val) => val ? parseInt(String(val), 10) : null, z.number().positive().nullable()).optional(),
  notes: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.enum(receiptTypeValues).optional().nullable(),
  receiptIssued: z.boolean().optional(),
});

const paymentSchema = z.object({
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
  solicitorId: z.preprocess((val) => val ? parseInt(String(val), 10) : null, z.number().positive().nullable()).optional(),
  bonusPercentage: z.number().min(0).max(100).optional().nullable(),
  bonusAmount: z.number().min(0).optional().nullable(),
  bonusRuleId: z.number().optional().nullable(),

  pledgeId: z.preprocess((val) => val ? parseInt(String(val), 10) : null, z.number().positive().nullable()).optional(),
  allocations: z.array(allocationSchema).optional(),

  // Third-party payment fields - CORRECTED
  isThirdPartyPayment: z.boolean().optional(),
  payerContactId: z.preprocess((val) => val ? parseInt(String(val), 10) : null, z.number().positive().nullable()).optional(),
}).refine((data) => {
  // Exactly one of pledgeId or allocations must be provided
  const hasPledgeId = data.pledgeId !== null && data.pledgeId !== undefined;
  const hasAllocations = data.allocations && data.allocations.length > 0;
  return hasPledgeId !== hasAllocations;
}, {
  message: "Either pledgeId (for single payment) or allocations (for split payment) must be provided, but not both",
}).refine((data) => {
  // If allocations exist, their sum must match amount
  if (data.allocations && data.allocations.length > 0) {
    const totalAllocated = data.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    const difference = Math.abs(totalAllocated - data.amount);
    return difference < 0.01; // allow small floating point error
  }
  return true;
}, {
  message: "Total allocation amount must equal the payment amount",
});

async function updatePledgeTotals(pledgeId: number) {
  // Calculate direct payments totals
  const directPayments = await db
    .select({
      totalInPledgeCurrency: sql<number>`COALESCE(SUM(${payment.amountInPledgeCurrency}::numeric), 0)`,
      totalUsd: sql<number>`COALESCE(SUM(${payment.amountUsd}::numeric), 0)`,
    })
    .from(payment)
    .where(eq(payment.pledgeId, pledgeId));

  // Calculate allocated payments totals
  const allocatedPayments = await db
    .select({
      totalAllocated: sql<number>`COALESCE(SUM(${paymentAllocations.allocatedAmount}::numeric), 0)`,
      totalAllocatedUsd: sql<number>`COALESCE(SUM(${paymentAllocations.allocatedAmountUsd}::numeric), 0)`,
    })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.pledgeId, pledgeId));

  const currentPledge = await db
    .select()
    .from(pledge)
    .where(eq(pledge.id, pledgeId))
    .limit(1);

  if (currentPledge.length === 0) return;

  const pledgeData = currentPledge[0];
  const originalAmount = parseFloat(pledgeData.originalAmount);
  const originalAmountUsd = parseFloat(pledgeData.originalAmountUsd || "0");

  const directTotal = Number(directPayments[0].totalInPledgeCurrency || 0);
  const directTotalUsd = Number(directPayments[0].totalUsd || 0);
  const allocatedTotal = Number(allocatedPayments[0].totalAllocated || 0);
  const allocatedTotalUsd = Number(allocatedPayments[0].totalAllocatedUsd || 0);

  const pledgeExchangeRate = parseFloat(pledgeData.exchangeRate || "1");
  const allocatedTotalInPledgeCurrency = pledgeData.currency === "USD"
    ? allocatedTotalUsd
    : allocatedTotalUsd / pledgeExchangeRate;

  const newTotalPaid = directTotal + allocatedTotalInPledgeCurrency;
  const newTotalPaidUsd = directTotalUsd + allocatedTotalUsd;
  const newBalance = Math.max(0, originalAmount - newTotalPaid);
  const newBalanceUsd = Math.max(0, originalAmountUsd - newTotalPaidUsd);

  await db
    .update(pledge)
    .set({
      totalPaid: newTotalPaid.toString(),
      totalPaidUsd: newTotalPaidUsd.toString(),
      balance: newBalance.toString(),
      balanceUsd: newBalanceUsd.toString(),
      updatedAt: new Date()
    })
    .where(eq(pledge.id, pledgeId));
}

export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof paymentSchema>;

  try {
    const body = await request.json();

    try {
      validatedData = paymentSchema.parse(body);
    } catch (zodErr) {
      if (zodErr instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: zodErr.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
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
      
      // CORRECTED: Third-party payment fields
      isThirdPartyPayment: validatedData.isThirdPartyPayment ?? false,
      payerContactId: validatedData.payerContactId || null,
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // --- Split payment flow ---
    if (validatedData.allocations && validatedData.allocations.length > 0) {
      const pledgeIds = validatedData.allocations.map((alloc) => alloc.pledgeId);
      const existingPledges = await db
        .select()
        .from(pledge)
        .where(sql`${pledge.id} IN (${sql.join(pledgeIds.map(id => sql`${id}`), sql`, `)})`);

      if (existingPledges.length !== pledgeIds.length) {
        const foundIds = existingPledges.map(p => p.id);
        const missingIds = pledgeIds.filter(id => !foundIds.includes(id));
        throw new AppError(`Pledges not found: ${missingIds.join(", ")}`, 404);
      }

      // Validate total allocated amounts equal payment amount
      const totalAllocated = validatedData.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
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
        if (!allocation.amount || allocation.amount <= 0) {
          throw new AppError(
            "Invalid allocation amount",
            400,
            { details: `Allocated amount must be positive. Found: ${allocation.amount || 0} for pledge ${allocation.pledgeId}` }
          );
        }
      }

      // Insert split payment record
      const amountUsd = validatedData.amount * validatedData.exchangeRate;
      const splitPaymentData = {
        ...commonPaymentData,
        pledgeId: null,
        amount: validatedData.amount.toFixed(2).toString(),
        amountUsd: amountUsd.toFixed(2).toString(),
        amountInPledgeCurrency: null,
      };
      const [createdPayment] = await db.insert(payment).values(splitPaymentData).returning();

      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      // Insert allocations
      const createdAllocations = [];
      for (const allocation of validatedData.allocations) {
        const allocationAmountUsd = allocation.amount * validatedData.exchangeRate;
        const allocationData = {
          paymentId: createdPayment.id,
          pledgeId: allocation.pledgeId,
          installmentScheduleId: allocation.installmentScheduleId || null,
          allocatedAmount: allocation.amount.toFixed(2).toString(),
          currency: validatedData.currency,
          allocatedAmountUsd: allocationAmountUsd.toFixed(2).toString(),
          notes: allocation.notes || null,
          receiptNumber: allocation.receiptNumber || null,
          receiptType: allocation.receiptType || null,
          receiptIssued: allocation.receiptIssued ?? false,
          
          // CORRECTED: Track payer contact in allocations
          payerContactId: validatedData.payerContactId || null,
          
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const [allocResult] = await db.insert(paymentAllocations).values(allocationData).returning();
        createdAllocations.push(allocResult);

        await updatePledgeTotals(allocation.pledgeId);
      }

      return NextResponse.json(
        {
          message: "Split payment created successfully",
          payment: createdPayment,
          allocations: createdAllocations,
          count: createdAllocations.length,
          isThirdPartyPayment: validatedData.isThirdPartyPayment || false,
          payerContactId: validatedData.payerContactId || null,
        },
        { status: 201 }
      );
    }
    // --- Single payment flow ---
    else if (validatedData.pledgeId) {
      const currentPledge = await db
        .select()
        .from(pledge)
        .where(eq(pledge.id, validatedData.pledgeId))
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
        pledgeId: validatedData.pledgeId,
        amount: validatedData.amount.toFixed(2).toString(),
        amountUsd: amountUsd.toFixed(2).toString(),
        amountInPledgeCurrency: amountInPledgeCurrency.toFixed(2).toString(),
      };

      const [createdPayment] = await db.insert(payment).values(newPaymentData).returning();

      if (!createdPayment) throw new AppError("Failed to create payment", 500);

      await updatePledgeTotals(validatedData.pledgeId);

      return NextResponse.json(
        {
          message: "Payment created successfully",
          payment: createdPayment,
          isThirdPartyPayment: validatedData.isThirdPartyPayment || false,
          payerContactId: validatedData.payerContactId || null,
        },
        { status: 201 }
      );
    }

    throw new AppError("Either pledgeId or allocations array is required", 400);
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

    // FIXED: Handle different contact-based queries with proper third-party payment filtering
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
              AND (pa.payer_contact_id IS NULL OR pa.payer_contact_id = ${contactId})
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
              AND (pa.payer_contact_id IS NULL OR pa.payer_contact_id = ${contactId})
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
          SELECT description FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("pledgeDescription"),
        pledgeOriginalAmount: sql<string>`(
          SELECT original_amount FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("pledgeOriginalAmount"),
        pledgeOriginalCurrency: sql<string>`(
          SELECT currency FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("pledgeOriginalCurrency"),
        pledgeExchangeRate: sql<string>`(
          SELECT exchange_rate FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("pledgeExchangeRate"),
        contactId: sql<number>`(
          SELECT contact_id FROM ${pledge} WHERE id = ${payment.pledgeId}
        )`.as("contactId"),
        
        // Contact information for pledge owner and payer
        pledgeOwnerName: sql<string>`(
          SELECT CONCAT(c.first_name, ' ', c.last_name)
          FROM ${pledge} p
          JOIN contact c ON p.contact_id = c.id
          WHERE p.id = ${payment.pledgeId}
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
          SELECT CONCAT(c.first_name, ' ', c.last_name)
          FROM solicitor s
          JOIN contact c ON s.contact_id = c.id
          WHERE s.id = ${payment.solicitorId}
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
              
              // Get payer contact name for allocations too
              payerContactName: sql<string>`(
                CASE 
                  WHEN ${paymentAllocations.payerContactId} IS NOT NULL THEN 
                    (SELECT CONCAT(c.first_name, ' ', c.last_name)
                     FROM contact c 
                     WHERE c.id = ${paymentAllocations.payerContactId})
                  ELSE NULL
                END
              )`.as("payerContactName"),
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