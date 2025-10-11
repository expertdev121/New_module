import { db } from "@/lib/db";
import { category, pledge, payment } from "@/lib/db/schema";
import { sql, eq, desc, and, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const offset = (page - 1) * limit;

  try {
    const [totalResult] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(category)
      .where(eq(category.isActive, true));

    const total = parseInt(totalResult?.total?.toString() || "0");

    const categoriesWithTotals = await db
      .select({
        categoryId: category.id,
        categoryName: category.name,
        categoryDescription: category.description,
        totalPledgedUsd: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        totalPaidUsd: sql<number>`COALESCE(SUM(${pledge.totalPaidUsd}), 0)`,
        currentBalanceUsd: sql<number>`COALESCE(SUM(${pledge.balanceUsd}), 0)`,
        pledgeCount: sql<number>`COUNT(${pledge.id})`,
        // Add scheduled calculation from payments without received_date
        scheduledUsd: sql<number>`COALESCE(
          (SELECT SUM(p_inner.amount_usd)
           FROM payment p_inner
           JOIN pledge pl_inner ON p_inner.pledge_id = pl_inner.id
           WHERE pl_inner.category_id = ${category.id}
           AND pl_inner.contact_id = ${contactId}
           AND p_inner.received_date IS NULL
          AND p_inner.payment_status IN ('pending', 'processing', 'expected')
          ), 0
        )`.as("scheduledUsd"),
      })
      .from(category)
      .leftJoin(pledge, and(eq(category.id, pledge.categoryId), eq(pledge.contactId, contactId)))
      .where(eq(category.isActive, true))
      .groupBy(category.id, category.name, category.description)
      .orderBy(category.name)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ 
      categories: categoriesWithTotals, 
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
