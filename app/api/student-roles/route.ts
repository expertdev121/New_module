import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, desc, asc, or, ilike, and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { studentRoles, user } from "@/lib/db/schema";
import { studentRoleSchema } from "@/lib/form-schemas/student-role";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  program: z.enum(["LH", "LLC", "ML", "Kollel", "Madrich"]).optional(),
  track: z
    .enum([
      "Alef",
      "Bet",
      "Gimmel",
      "Dalet",
      "Heh",
      "March Draft",
      "August Draft",
      "Room & Board",
      "Other Draft",
    ])
    .optional(),
  trackDetail: z
    .enum(["Full Year", "Fall", "Spring", "Until Pesach"])
    .optional(),
  status: z
    .enum([
      "Student",
      "Active Soldier",
      "Staff",
      "Withdrew",
      "Transferred Out",
      "Left Early",
      "Asked to Leave",
    ])
    .optional(),
  machzor: z.enum(["10.5", "10", "9.5", "9", "8.5", "8"]).optional(),
  year: z.string().optional(),
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
      program: searchParams.get("program") ?? undefined,
      track: searchParams.get("track") ?? undefined,
      trackDetail: searchParams.get("trackDetail") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      machzor: searchParams.get("machzor") ?? undefined,
      year: searchParams.get("year") ?? undefined,
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
      program,
      track,
      trackDetail,
      status,
      machzor,
      year,
      isActive,
      contactId,
    } = parsedParams.data;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(studentRoles.program, `%${search}%`),
          ilike(studentRoles.track, `%${search}%`),
          ilike(studentRoles.trackDetail, `%${search}%`),
          ilike(studentRoles.status, `%${search}%`),
          ilike(studentRoles.year, `%${search}%`),
          ilike(studentRoles.machzor, `%${search}%`),
          ilike(studentRoles.additionalNotes, `%${search}%`)
        )
      );
    }
    if (program) conditions.push(eq(studentRoles.program, program));
    if (track) conditions.push(eq(studentRoles.track, track));
    if (trackDetail) conditions.push(eq(studentRoles.trackDetail, trackDetail));
    if (status) conditions.push(eq(studentRoles.status, status));
    if (machzor) conditions.push(eq(studentRoles.machzor, machzor));
    if (year) conditions.push(eq(studentRoles.year, year));
    if (isActive !== undefined)
      conditions.push(eq(studentRoles.isActive, isActive));
    if (contactId) conditions.push(eq(studentRoles.contactId, contactId));

    // Add locationId filtering for admins
    if (isAdmin && currentUser.locationId) {
      conditions.push(eq(studentRoles.locationId, currentUser.locationId));
      conditions.push(isNotNull(studentRoles.locationId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause;
    switch (sortBy) {
      case "id":
        orderByClause =
          sortOrder === "asc" ? asc(studentRoles.id) : desc(studentRoles.id);
        break;
      case "contactId":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.contactId)
            : desc(studentRoles.contactId);
        break;
      case "year":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.year)
            : desc(studentRoles.year);
        break;
      case "program":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.program)
            : desc(studentRoles.program);
        break;
      case "track":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.track)
            : desc(studentRoles.track);
        break;
      case "trackDetail":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.trackDetail)
            : desc(studentRoles.trackDetail);
        break;
      case "status":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.status)
            : desc(studentRoles.status);
        break;
      case "machzor":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.machzor)
            : desc(studentRoles.machzor);
        break;
      case "startDate":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.startDate)
            : desc(studentRoles.startDate);
        break;
      case "endDate":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.endDate)
            : desc(studentRoles.endDate);
        break;
      case "isActive":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.isActive)
            : desc(studentRoles.isActive);
        break;
      case "createdAt":
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.createdAt)
            : desc(studentRoles.createdAt);
        break;
      case "updatedAt":
      default:
        orderByClause =
          sortOrder === "asc"
            ? asc(studentRoles.updatedAt)
            : desc(studentRoles.updatedAt);
        break;
    }

    const query = db
      .select()
      .from(studentRoles)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(studentRoles)
      .where(whereClause);

    const [roles, totalCountResult] = await Promise.all([
      query.execute(),
      countQuery.execute(),
    ]);

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    const response = {
      studentRoles: roles,
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
        program,
        track,
        trackDetail,
        status,
        machzor,
        year,
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
    console.error("Error fetching student roles:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch student roles",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const rawBody = await request.json();
    const {
      startDate: rawStartDate,
      endDate: rawEndDate,
      ...otherFields
    } = rawBody;
    const validatedData = studentRoleSchema.parse(otherFields);

    const today = new Date();
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(today.getFullYear() + 2);

    const formattedToday = today.toISOString().split("T")[0];
    const formattedTwoYearsFromNow = twoYearsFromNow
      .toISOString()
      .split("T")[0];

    const finalStartDate =
      rawStartDate && rawStartDate !== "" ? rawStartDate : formattedToday;

    const finalEndDate =
      rawEndDate && rawEndDate !== "" ? rawEndDate : formattedTwoYearsFromNow;

    const newStudentRole = {
      ...validatedData,
      startDate: finalStartDate,
      endDate: finalEndDate,
    };

    console.log(
      "Final student role being inserted:",
      JSON.stringify(newStudentRole, null, 2)
    );

    const result = await db
      .insert(studentRoles)
      .values(newStudentRole)
      .returning();

    return NextResponse.json(
      {
        message: "Student role created successfully",
        studentRole: result[0],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(
        "Zod validation error details:",
        JSON.stringify(error.issues, null, 2)
      );
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

    console.error("Error creating student role:", error);
    return ErrorHandler.handle(error);
  }
}
