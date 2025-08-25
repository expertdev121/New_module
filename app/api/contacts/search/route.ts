// /api/contacts/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { sql, or, ilike } from "drizzle-orm";
import { z } from "zod";

const searchQuerySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    // Validate query parameter
    const validation = searchQuerySchema.safeParse({ q: query });
    if (!validation.success) {
      return NextResponse.json({ 
        contacts: [],
        error: validation.error.issues[0]?.message 
      });
    }

    const searchTerm = validation.data.q;

    const contacts = await db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        fullName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`.as('fullName'),
      })
      .from(contact)
      .where(
        or(
          ilike(contact.firstName, `%${searchTerm}%`),
          ilike(contact.lastName, `%${searchTerm}%`),
          ilike(contact.email, `%${searchTerm}%`),
          ilike(sql`concat(${contact.firstName}, ' ', ${contact.lastName})`, `%${searchTerm}%`)
        )
      )
      .orderBy(contact.firstName, contact.lastName)
      .limit(20);

    return NextResponse.json({ 
      contacts,
      count: contacts.length 
    });

  } catch (error) {
    console.error("Contact search error:", error);
    return NextResponse.json(
      { 
        error: "Failed to search contacts",
        contacts: [] 
      },
      { status: 500 }
    );
  }
}