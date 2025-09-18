import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contact, Contact } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Helper: safely extract error message
function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Helper: normalize email
function normalizeEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return email.toLowerCase().trim();
}

// Helper: normalize name
function normalizeName(name: string | null | undefined): string | undefined {
  if (!name?.trim()) return undefined;
  const cleaned = name.trim();
  if (['-', '_', 'N/A', 'n/a'].includes(cleaned)) return undefined;
  return cleaned;
}

// Flatten keys like 'customData[firstname]' to 'firstname'
function flattenCustomDataKeys(data: Record<string, string>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const match = k.match(/^customData\[(.+)\]$/);
    if (match) flat[match[1]] = v;
    else flat[k] = v;
  }
  return flat;
}

// Schema for webhook data
const webhookSchema = z.object({
  ghlcontactid: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z.string().optional(),
  displayname: z.string().optional(),
}).catchall(z.string().optional());

// Extract names
function extractNames(data: Record<string, string | undefined>) {
  let firstName = normalizeName(data.firstname);
  let lastName = normalizeName(data.lastname);

  if (!firstName && lastName) firstName = 'N/A';
  if (!lastName && firstName) lastName = 'N/A';

  return { firstName, lastName };
}

// Find a contact to delete
async function findContact({
  ghlContactId,
  firstName,
  lastName,
  email,
  displayName,
}: {
  ghlContactId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  displayName?: string;
}): Promise<Contact | null> {
  let found: Contact[] = [];

  if (ghlContactId) {
    found = await db.select().from(contact).where(eq(contact.ghlContactId, ghlContactId)).limit(1);
  }

  if (!found.length && firstName && lastName) {
    found = await db.select().from(contact)
      .where(and(eq(contact.firstName, firstName), eq(contact.lastName, lastName)))
      .limit(1);
  }

  if (!found.length && email) {
    found = await db.select().from(contact).where(eq(contact.email, email)).limit(1);
  }

  if (!found.length && displayName) {
    found = await db.select().from(contact).where(eq(contact.displayName, displayName)).limit(1);
  }

  return found[0] || null;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Contact Delete Webhook ===');
    const contentType = request.headers.get('content-type') || '';
    const url = new URL(request.url);

    let data: Record<string, string> = Object.fromEntries(url.searchParams.entries());
    let dataSource = 'query_parameters';

    if (!Object.keys(data).length) {
      if (contentType.includes('application/json')) {
        const json = await request.json();
        data = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]));
        dataSource = 'json_body';
      } else {
        const formData = await request.formData();
        data = {};
        for (const [k, v] of formData.entries()) data[k] = v.toString();
        dataSource = 'form_data';
      }
    }

    console.log('Received data:', data, 'Source:', dataSource);

    data = flattenCustomDataKeys(data);
    const parsed = webhookSchema.safeParse(data);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', errors: parsed.error.errors },
        { status: 400 }
      );
    }

    const valid = parsed.data;
    const { firstName, lastName } = extractNames(valid);
    const email = normalizeEmail(valid.email);
    const ghlContactId = valid.ghlcontactid?.trim();
    const displayName = valid.displayname?.trim();

    const target = await findContact({ ghlContactId, firstName, lastName, email, displayName });

    if (!target) {
      return NextResponse.json(
        { success: false, message: 'Contact not found', code: 'NOT_FOUND', received: valid },
        { status: 404 }
      );
    }

    await db.delete(contact).where(eq(contact.id, target.id));

    return NextResponse.json({
      success: true,
      message: 'Contact deleted successfully',
      code: 'CONTACT_DELETED',
      deletedContact: target,
      source: dataSource,
    });
  } catch (error: unknown) {
    console.error('Unexpected error in delete webhook:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', code: 'SERVER_ERROR', error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Contact delete webhook is active',
    methods: ['POST'],
    example: {
      queryParams: '/api/webhook/contact/delete?ghlcontactid=123',
      jsonBody: '{"ghlcontactid":"123"}',
    },
  });
}