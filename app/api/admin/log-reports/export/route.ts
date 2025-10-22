import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { eq, and, gte, lte, like } from "drizzle-orm";

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

    let whereConditions = [];

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
      .orderBy(auditLog.timestamp);

    // Create CSV content
    const csvHeaders = "ID,User ID,User Email,Action,Details,IP Address,User Agent,Timestamp\n";
    const csvRows = logs.map(log =>
      `"${log.id}","${log.userId}","${log.userEmail}","${log.action}","${log.details.replace(/"/g, '""')}","${log.ipAddress}","${log.userAgent.replace(/"/g, '""')}","${log.timestamp.toISOString()}"`
    ).join("\n");

    const csvContent = csvHeaders + csvRows;

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
