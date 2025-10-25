import { db } from "@/lib/db";
import {
  payment,
  category,
  pledge,
  bonusRule,
  bonusCalculation,
  user,
  solicitor,
  contact,
} from "@/lib/db/schema";
import { eq, and, lte, sql, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const paymentId = parseInt(id, 10);
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details including locationId
    const userDetails = await db
      .select({
        role: user.role,
        locationId: user.locationId,
      })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (userDetails.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentUser = userDetails[0];
    const isAdmin = currentUser.role === "admin";

    const body = await request.json();
    const { solicitorId } = body;

    if (!solicitorId) {
      return NextResponse.json(
        { error: "Solicitor ID is required" },
        { status: 400 }
      );
    }

    // Verify solicitor belongs to admin's location (if admin)
    if (isAdmin && currentUser.locationId) {
      const solicitorCheck = await db
        .select()
        .from(solicitor)
        .where(
          and(
            eq(solicitor.id, solicitorId),
            eq(solicitor.locationId, currentUser.locationId)
          )
        )
        .limit(1);

      if (solicitorCheck.length === 0) {
        return NextResponse.json(
          { error: "Solicitor not found or access denied" },
          { status: 403 }
        );
      }
    }

    // Verify payment belongs to admin's location (if admin)
    if (isAdmin && currentUser.locationId) {
      const paymentCheck = await db
        .select()
        .from(payment)
        .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
        .innerJoin(contact, eq(pledge.contactId, contact.id))
        .where(
          and(
            eq(payment.id, paymentId),
            eq(contact.locationId, currentUser.locationId)
          )
        )
        .limit(1);

      if (paymentCheck.length === 0) {
        return NextResponse.json(
          { error: "Payment not found or access denied" },
          { status: 403 }
        );
      }
    }

    // Get payment details
    const paymentDetails = await db
      .select({
        id: payment.id,
        amountUsd: payment.amountUsd,
        paymentDate: payment.paymentDate,
        categoryName: category.name,
      })
      .from(payment)
      .innerJoin(pledge, eq(payment.pledgeId, pledge.id))
      .leftJoin(category, eq(pledge.categoryId, category.id))
      .where(eq(payment.id, paymentId))
      .limit(1);

    if (paymentDetails.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const paymentInfo = paymentDetails[0];
    const paymentAmount = parseFloat(paymentInfo.amountUsd || "0");
    const paymentDate = paymentInfo.paymentDate;
    const isDonation = paymentInfo.categoryName
      ?.toLowerCase()
      .includes("donation");

    // Find applicable bonus rules
    const applicableRules = await db
      .select()
      .from(bonusRule)
      .where(
        and(
          eq(bonusRule.solicitorId, solicitorId),
          eq(bonusRule.isActive, true),
          lte(bonusRule.effectiveFrom, paymentDate),
          sql`(${bonusRule.effectiveTo} IS NULL OR ${bonusRule.effectiveTo} >= ${paymentDate})`,
          sql`(${bonusRule.paymentType} = 'both' OR 
                   (${bonusRule.paymentType} = 'donation' AND ${isDonation}) OR
                   (${bonusRule.paymentType} = 'tuition' AND NOT ${isDonation}))`,
          sql`(${bonusRule.minAmount} IS NULL OR ${bonusRule.minAmount} <= ${paymentAmount})`,
          sql`(${bonusRule.maxAmount} IS NULL OR ${bonusRule.maxAmount} >= ${paymentAmount})`
        )
      )
      .orderBy(desc(bonusRule.priority));

    let bonusPercentage = "0";
    let bonusAmount = "0";
    let bonusRuleId = null;

    if (applicableRules.length > 0) {
      const rule = applicableRules[0]; // Highest priority rule
      bonusPercentage = rule.bonusPercentage || "0";
      bonusAmount = (
        (paymentAmount * parseFloat(bonusPercentage)) /
        100
      ).toFixed(2);
      bonusRuleId = rule.id;
    }

    // Update payment with solicitor assignment
    const updatedPayment = await db
      .update(payment)
      .set({
        solicitorId,
        bonusPercentage,
        bonusAmount,
        bonusRuleId,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentId))
      .returning();

    // Create bonus calculation record
    if (parseFloat(bonusAmount) > 0) {
      await db.insert(bonusCalculation).values({
        paymentId,
        solicitorId,
        bonusRuleId,
        paymentAmount: paymentAmount.toString(),
        bonusPercentage,
        bonusAmount,
        calculatedAt: new Date(),
        isPaid: false,
        notes: `Auto-calculated on assignment using rule: ${applicableRules[0]?.ruleName}`,
      });
    }

    return NextResponse.json({
      payment: updatedPayment[0],
      bonusCalculated: parseFloat(bonusAmount) > 0,
    });
  } catch (error) {
    console.error("Error assigning payment:", error);
    return NextResponse.json(
      { error: "Failed to assign payment" },
      { status: 500 }
    );
  }
}
