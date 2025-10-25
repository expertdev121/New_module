import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, desc, asc, or, ilike, and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { contactRoles, NewContactRole, user } from "@/lib/db/schema";
import { contactRoleSchema } from "@/lib/form-schemas/contact-role";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  roleName: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  contactId: z.coerce.number().positive().optional(),
});

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const parsedParams = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
      roleName: searchParams.get("roleName") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
      contactId: searchParams.get("contactId") ?? undefined,
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

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      roleName,
      isActive,
      contactId,
    } = parsedParams.data;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(contactRoles.roleName, `%${search}%`),
          ilike(contactRoles.notes, `%${search}%`)
        )
      );
    }
    if (roleName) conditions.push(eq(contactRoles.roleName, roleName));
    if (isActive !== undefined)
      conditions.push(eq(contactRoles.isActive, isActive));
    if (contactId) conditions.push(eq(contactRoles.contactId, contactId));

    // Add locationId filtering for admins
    if (isAdmin && currentUser.locationId) {
      conditions.push(eq(contactRoles.locationId, currentUser.locationId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    let orderByClause;
    switch (sortBy) {
      case "id":
        orderByClause =
          sortOrder === "asc" ? asc(contactRoles.id) : desc(contactRoles.id);
        break;
      case "contactId":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.contactId)
            : desc(contactRoles.contactId);
        break;
      case "roleName":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.roleName)
            : desc(contactRoles.roleName);
        break;
      case "startDate":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.startDate)
            : desc(contactRoles.startDate);
        break;
      case "endDate":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.endDate)
            : desc(contactRoles.endDate);
        break;
      case "isActive":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.isActive)
            : desc(contactRoles.isActive);
        break;
      case "createdAt":
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.createdAt)
            : desc(contactRoles.createdAt);
        break;
      case "updatedAt":
      default:
        orderByClause =
          sortOrder === "asc"
            ? asc(contactRoles.updatedAt)
            : desc(contactRoles.updatedAt);
        break;
    }

    const query = db
      .select()
      .from(contactRoles)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(contactRoles)
      .where(whereClause);

    const [roles, totalCountResult] = await Promise.all([
      query.execute(),
      countQuery.execute(),
    ]);

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    const response = {
      contactRoles: roles,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        search,
        roleName,
        isActive,
        contactId,
        sortBy: sortBy,
        sortOrder,
      },
    };

    return NextResponse.json(response, {
      headers: {
        "X-Total-Count": response.pagination.totalCount.toString(),
      },
    });
  } catch (error) {
    console.error("Error fetching contact roles:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch contact roles",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = contactRoleSchema.parse(body);

    const existingRole = await db
      .select()
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.contactId, validatedData.contactId),
          eq(contactRoles.roleName, validatedData.roleName),
          eq(contactRoles.isActive, true)
        )
      )
      .limit(1);

    if (existingRole.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate role",
          message: `Contact already has an active role '${validatedData.roleName}'`,
        },
        { status: 409 }
      );
    }

    const newContactRole: NewContactRole = {
      ...validatedData,
      startDate: validatedData.startDate
        ? new Date(validatedData.startDate).toISOString().split("T")[0]
        : undefined,
      endDate: validatedData.endDate
        ? new Date(validatedData.endDate).toISOString().split("T")[0]
        : undefined,
    };

    const result = await db
      .insert(contactRoles)
      .values(newContactRole)
      .returning();

    return NextResponse.json(
      {
        message: "Contact role created successfully",
        contactRole: result[0],
      },
      { status: 201 }
    );
  } catch (error) {
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
