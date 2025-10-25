import { db } from "@/lib/db";
import { pledge, category, contact, user } from "@/lib/db/schema";
import { sql, eq, and, or, gte, lte, ilike, SQL, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const categoryId = searchParams.get("categoryId")
    ? parseInt(searchParams.get("categoryId")!, 10)
    : null;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const locationId = searchParams.get("locationId");

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: "Invalid limit, must be between 1 and 100" },
      { status: 400 }
    );
  }

  if (categoryId && (isNaN(categoryId) || categoryId <= 0)) {
    return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details including locationId for admin filtering
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

    const conditions: SQL<unknown>[] = [];

    // For admin users, always filter by their locationId
    if (isAdmin && currentUser.locationId) {
      conditions.push(eq(contact.locationId, currentUser.locationId));
    }

    let query = db
      .select({
        id: pledge.id,
        contactId: pledge.contactId,
        pledgeDate: pledge.pledgeDate,
        description: pledge.description,
        originalAmount: pledge.originalAmount,
        currency: pledge.currency,
        originalAmountUsd: pledge.originalAmountUsd,
        totalPaid: pledge.totalPaid,
        totalPaidUsd: pledge.totalPaidUsd,
        balance: pledge.balance,
        balanceUsd: pledge.balanceUsd,
        notes: pledge.notes,
        categoryName: category.name,
        categoryDescription: category.description,
        contactName: sql<string>`CONCAT(${contact.firstName}, ' ', ${contact.lastName})`,
        contactEmail: contact.email,
        progressPercentage: sql<number>`
          CASE
            WHEN ${pledge.originalAmount}::numeric > 0
            THEN ROUND((${pledge.totalPaid}::numeric / ${pledge.originalAmount}::numeric) * 100, 1)
            ELSE 0
          END
        `,
      })
      .from(pledge)
      .leftJoin(category, eq(pledge.categoryId, category.id))
      .leftJoin(contact, eq(pledge.contactId, contact.id))
      .$dynamic();

    if (categoryId) {
      conditions.push(eq(pledge.categoryId, categoryId));
    }
    if (locationId) {
      conditions.push(eq(contact.locationId, locationId));
    }
    if (startDate) {
      conditions.push(gte(pledge.pledgeDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(pledge.pledgeDate, endDate));
    }
    if (status === "fullyPaid") {
      conditions.push(eq(pledge.balance, "0"));
    } else if (status === "partiallyPaid") {
      conditions.push(
        and(
          sql`${pledge.balance}::numeric > 0`,
          sql`${pledge.totalPaid}::numeric > 0`
        )!
      );
    } else if (status === "unpaid") {
      conditions.push(eq(pledge.totalPaid, "0"));
    }
    if (search) {
      const searchConditions: SQL<unknown>[] = [];
      if (pledge.description) {
        searchConditions.push(
          ilike(sql`COALESCE(${pledge.description}, '')`, `%${search}%`)
        );
      }
      if (pledge.notes) {
        searchConditions.push(
          ilike(sql`COALESCE(${pledge.notes}, '')`, `%${search}%`)
        );
      }
      // Also search by contact name and email
      searchConditions.push(
        ilike(
          sql`CONCAT(${contact.firstName}, ' ', ${contact.lastName})`,
          `%${search}%`
        )
      );
      searchConditions.push(
        ilike(sql`COALESCE(${contact.email}, '')`, `%${search}%`)
      );

      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions)!);
      }
    }

    // Apply conditions only if there are any
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Add ordering by pledge date (most recent first)
    query = query.orderBy(sql`${pledge.pledgeDate} DESC`);

    const offset = (page - 1) * limit;
    query = query.limit(limit).offset(offset);

    const pledges = await query;

    // Get total count for pagination
    let countQuery = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pledge)
      .leftJoin(category, eq(pledge.categoryId, category.id))
      .leftJoin(contact, eq(pledge.contactId, contact.id))
      .$dynamic();

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }

    const [{ count: totalCount }] = await countQuery;
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      pledges,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch pledges" },
      { status: 500 }
    );
  }
}
