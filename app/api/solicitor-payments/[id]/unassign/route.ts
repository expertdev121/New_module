import { db } from "@/lib/db";
import { bonusCalculation, payment, user, contact, pledge } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
    // Remove bonus calculation if exists
    await db
      .delete(bonusCalculation)
      .where(eq(bonusCalculation.paymentId, paymentId));

    // Update payment to remove solicitor assignment
    const updatedPayment = await db
      .update(payment)
      .set({
        solicitorId: null,
        bonusPercentage: null,
        bonusAmount: null,
        bonusRuleId: null,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentId))
      .returning();

    if (updatedPayment.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ payment: updatedPayment[0] });
  } catch (error) {
    console.error("Error unassigning payment:", error);
    return NextResponse.json(
      { error: "Failed to unassign payment" },
      { status: 500 }
    );
  }
}
