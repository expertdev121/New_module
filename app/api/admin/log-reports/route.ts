import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { eq, and, gte, lte, like, or } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const userEmail = searchParams.get("userEmail");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const whereConditions = [];

    if (action) {
      whereConditions.push(eq(auditLog.action, action));
    }

    if (userEmail) {
      whereConditions.push(like(auditLog.userEmail, `%${userEmail}%`));
    }

    if (dateFrom) {
      whereConditions.push(gte(auditLog.timestamp, new Date(dateFrom)));
    }

    if (dateTo) {
      // Add one day to include the end date
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      whereConditions.push(lte(auditLog.timestamp, endDate));
    }

    const logs = await db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        userEmail: auditLog.userEmail,
        action: auditLog.action,
        details: auditLog.details,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        timestamp: auditLog.timestamp,
      })
      .from(auditLog)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(auditLog.timestamp)
      .limit(1000); // Limit results for performance

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
