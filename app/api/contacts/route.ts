import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql, desc, asc, or, ilike } from "drizzle-orm";
import type {
  Column,
  ColumnBaseConfig,
  ColumnDataType,
  SQL,
} from "drizzle-orm";
import {
  contact,
  pledge,
  studentRoles,
  contactRoles,
  payment,
  NewContact,
} from "@/lib/db/schema";
import { z } from "zod";
import { contactFormSchema } from "@/lib/form-schemas/contact";
import { ErrorHandler } from "@/lib/error-handler";

interface ContactResponse {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  gender: string | null;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalPledgedUsd: number;
  totalPaidUsd: number;
  currentBalanceUsd: number;
  studentProgram: string | null;
  studentStatus: string | null;
  roleName: string | null;
  lastPaymentDate: Date | null;
}

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "updatedAt",
      "firstName",
      "lastName",
      "displayName",
      "totalPledgedUsd",
    ])
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedParams = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
    });

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsedParams.error },
        { status: 400 }
      );
    }

    const { page, limit, search, sortBy, sortOrder } = parsedParams.data;
    const offset = (page - 1) * limit;

    // ✅ Aggregate pledge totals per contact
    const pledgeSummary = db
      .select({
        contactId: pledge.contactId,
        totalPledgedUsd: sql<number>`COALESCE(SUM(${pledge.originalAmountUsd}), 0)`.as(
          "totalPledgedUsd"
        ),
        totalPaidUsd: sql<number>`COALESCE(SUM(${pledge.totalPaidUsd}), 0)`.as(
          "totalPaidUsd"
        ),
        currentBalanceUsd: sql<number>`COALESCE(SUM(${pledge.balanceUsd}), 0)`.as(
          "currentBalanceUsd"
        ),
      })
      .from(pledge)
      .groupBy(pledge.contactId)
      .as("pledgeSummary");

    // ✅ Aggregate last payment date per contact
    const lastPaymentSummary = db
      .select({
        contactId: pledge.contactId,
        lastPaymentDate: sql<Date>`MAX(${payment.paymentDate})`.as(
          "lastPaymentDate"
        ),
      })
      .from(pledge)
      .leftJoin(payment, eq(pledge.id, payment.pledgeId))
      .groupBy(pledge.contactId)
      .as("lastPaymentSummary");

    // ✅ Looser search: split search into words, remove punctuation, match any term (OR logic)
    const terms = search
      ? search
          .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ") // remove punctuation
          .trim()
          .split(/\s+/)
      : [];

    const whereClause =
      terms.length > 0
        ? terms
            .map((term) =>
              or(
                ilike(contact.firstName, `%${term}%`),
                ilike(contact.lastName, `%${term}%`),
                ilike(contact.displayName, `%${term}%`),
                ilike(contact.email, `%${term}%`),
                ilike(contact.phone, `%${term}%`)
              )
            )
            .reduce((acc, clause) => (acc ? or(acc, clause) : clause), undefined)
        : undefined;

    const selectedFields = {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      displayName: contact.displayName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      gender: contact.gender,
      address: contact.address,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      totalPledgedUsd: pledgeSummary.totalPledgedUsd,
      totalPaidUsd: pledgeSummary.totalPaidUsd,
      currentBalanceUsd: pledgeSummary.currentBalanceUsd,
      studentProgram: studentRoles.program,
      studentStatus: studentRoles.status,
      roleName: contactRoles.roleName,
      lastPaymentDate: lastPaymentSummary.lastPaymentDate,
    };

    const query = db
      .select(selectedFields)
      .from(contact)
      .leftJoin(pledgeSummary, eq(contact.id, pledgeSummary.contactId))
      .leftJoin(lastPaymentSummary, eq(contact.id, lastPaymentSummary.contactId))
      .leftJoin(studentRoles, eq(contact.id, studentRoles.contactId))
      .leftJoin(contactRoles, eq(contact.id, contactRoles.contactId))
      .where(whereClause)
      .groupBy(
        contact.id,
        contact.firstName,
        contact.lastName,
        contact.displayName,
        contact.email,
        contact.phone,
        contact.title,
        contact.gender,
        contact.address,
        contact.createdAt,
        contact.updatedAt,
        studentRoles.program,
        studentRoles.status,
        contactRoles.roleName,
        pledgeSummary.totalPledgedUsd,
        pledgeSummary.totalPaidUsd,
        pledgeSummary.currentBalanceUsd,
        lastPaymentSummary.lastPaymentDate
      );

    let orderByField:
      | SQL<unknown>
      | Column<ColumnBaseConfig<ColumnDataType, string>, object, object>;
    switch (sortBy) {
      case "updatedAt":
        orderByField = selectedFields.updatedAt;
        break;
      case "displayName":
        orderByField = selectedFields.displayName;
        break;
      case "firstName":
        orderByField = selectedFields.firstName;
        break;
      case "lastName":
        orderByField = selectedFields.lastName;
        break;
      case "totalPledgedUsd":
        orderByField = sql`${pledgeSummary.totalPledgedUsd}`;
        break;
      default:
        orderByField = selectedFields.updatedAt;
    }

    const contactsQuery = query
      .orderBy(sortOrder === "asc" ? asc(orderByField) : desc(orderByField))
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(distinct ${contact.id})`.as("count"),
      })
      .from(contact)
      .where(whereClause);

    const [contacts, totalCountResult] = await Promise.all([
      contactsQuery.execute(),
      countQuery.execute(),
    ]);

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      contacts: contacts as ContactResponse[],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch contacts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = contactFormSchema.parse(body);
    const newContact: NewContact = {
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      email: validatedData.email,
      phone: validatedData.phone,
      title: validatedData.title,
      gender: validatedData.gender,
      address: validatedData.address,
    };

    const result = await db.insert(contact).values(newContact).returning();

    return NextResponse.json(
      {
        message: "Contact created successfully",
        contact: result[0],
      },
      { status: 201 }
    );
  } catch (error) {
    return ErrorHandler.handle(error);
  }
}
