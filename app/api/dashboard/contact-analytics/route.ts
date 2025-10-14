import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, and, gte, lte, desc, count, sum } from "drizzle-orm";
import { contact, pledge, payment, relationships } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    let dateFilter: any = null;
    if (startDate && endDate) {
      dateFilter = and(
        gte(contact.createdAt, new Date(startDate)),
        lte(contact.createdAt, new Date(endDate))
      );
    }

    // Gender distribution
    const genderStats = await db
      .select({
        gender: contact.gender,
        count: sql<number>`COUNT(*)`,
      })
      .from(contact)
      .where(dateFilter)
      .groupBy(contact.gender);

    const genderData = {
      labels: genderStats.map(stat => stat.gender || 'Not specified'),
      values: genderStats.map(stat => stat.count),
    };

    // Title distribution (top 10)
    const titleStats = await db
      .select({
        title: contact.title,
        count: sql<number>`COUNT(*)`,
      })
      .from(contact)
      .where(and(
        sql`${contact.title} IS NOT NULL`,
        dateFilter
      ))
      .groupBy(contact.title)
      .orderBy(desc(sql<number>`COUNT(*)`))
      .limit(10);

    const titleData = {
      labels: titleStats.map(stat => stat.title || 'Unknown'),
      values: titleStats.map(stat => stat.count),
    };

    // Contact creation over time (monthly for last 12 months or custom date range)
    let contactCreationData;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

      // Generate all months in the range
      const allMonths = [];
      for (let i = 0; i <= monthsDiff; i++) {
        const monthDate = new Date(start.getFullYear(), start.getMonth() + i, 1);
        allMonths.push({
          year: monthDate.getFullYear(),
          month: monthDate.getMonth(),
          label: monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        });
      }

      // Get actual data for the date range
      const contactCreationStats = await db
        .select({
          month: sql<string>`DATE_TRUNC('month', ${contact.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(contact)
        .where(and(
          gte(contact.createdAt, start),
          lte(contact.createdAt, end)
        ))
        .groupBy(sql`DATE_TRUNC('month', ${contact.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${contact.createdAt})`);

      // Fill in missing months with 0
      contactCreationData = {
        labels: allMonths.map(month => month.label),
        values: allMonths.map(month => {
          const stat = contactCreationStats.find(stat => {
            const statDate = new Date(stat.month);
            return statDate.getFullYear() === month.year && statDate.getMonth() === month.month;
          });
          return stat ? stat.count : 0;
        }),
      };
    } else {
      // Default: last 12 months
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

      const contactCreationStats = await db
        .select({
          month: sql<string>`DATE_TRUNC('month', ${contact.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(contact)
        .where(gte(contact.createdAt, twelveMonthsAgo))
        .groupBy(sql`DATE_TRUNC('month', ${contact.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${contact.createdAt})`);

      contactCreationData = {
        labels: contactCreationStats.map(stat => {
          const date = new Date(stat.month);
          return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        }),
        values: contactCreationStats.map(stat => stat.count),
      };
    }

    // Contact engagement (contacts with pledges/payments)
    const totalContacts = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contact)
      .where(dateFilter);

    const contactsWithPledges = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${pledge.contactId})` })
      .from(pledge)
      .where(dateFilter ? and(
        gte(pledge.pledgeDate, startDate!),
        lte(pledge.pledgeDate, endDate!)
      ) : undefined);

    const contactsWithPayments = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${payment.payerContactId})` })
      .from(payment)
      .where(and(
        eq(payment.paymentStatus, 'completed'),
        dateFilter ? and(
          gte(payment.paymentDate, startDate!),
          lte(payment.paymentDate, endDate!)
        ) : undefined
      ));

    const engagementData = {
      totalContacts: totalContacts[0]?.count || 0,
      contactsWithPledges: contactsWithPledges[0]?.count || 0,
      contactsWithPayments: contactsWithPayments[0]?.count || 0,
    };

    // Relationship types distribution
    const relationshipStats = await db
      .select({
        relationshipType: relationships.relationshipType,
        count: sql<number>`COUNT(*)`,
      })
      .from(relationships)
      .where(eq(relationships.isActive, true))
      .groupBy(relationships.relationshipType)
      .orderBy(desc(sql<number>`COUNT(*)`))
      .limit(10);

    const relationshipData = {
      labels: relationshipStats.map(stat => stat.relationshipType),
      values: relationshipStats.map(stat => stat.count),
    };

    // Contact contribution summary with pagination
    const offset = (page - 1) * limit;
    const contributionStats = await db
      .select({
        contactId: contact.id,
        name: sql<string>`CONCAT(${contact.firstName}, ' ', ${contact.lastName})`,
        pledgeCount: sql<number>`COUNT(DISTINCT ${pledge.id})`,
        totalPledged: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`,
        paymentCount: sql<number>`COUNT(DISTINCT ${payment.id})`,
        totalPaid: sql<number>`COALESCE(SUM(${payment.amountUsd}), 0)`,
      })
      .from(contact)
      .leftJoin(pledge, eq(contact.id, pledge.contactId))
      .leftJoin(payment, and(
        eq(contact.id, payment.payerContactId),
        eq(payment.paymentStatus, 'completed')
      ))
      .where(dateFilter)
      .groupBy(contact.id, contact.firstName, contact.lastName)
      .orderBy(desc(sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`))
      .limit(limit)
      .offset(offset);

    const topContributors = contributionStats.map(stat => ({
      name: stat.name,
      pledges: stat.pledgeCount,
      pledgeAmount: Number(stat.totalPledged),
      payments: stat.paymentCount,
      paymentAmount: Number(stat.totalPaid),
    }));

    // Get total count for pagination
    const totalContributors = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${contact.id})` })
      .from(contact)
      .leftJoin(pledge, eq(contact.id, pledge.contactId))
      .leftJoin(payment, and(
        eq(contact.id, payment.payerContactId),
        eq(payment.paymentStatus, 'completed')
      ))
      .where(dateFilter);

    return NextResponse.json({
      genderData,
      titleData,
      contactCreationData,
      engagementData,
      relationshipData,
      topContributors,
      pagination: {
        page,
        limit,
        total: totalContributors[0]?.count || 0,
        totalPages: Math.ceil((totalContributors[0]?.count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching contact analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch contact analytics" },
      { status: 500 }
    );
  }
}
