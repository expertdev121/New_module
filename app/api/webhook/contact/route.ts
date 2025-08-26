import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contact } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Helper: safely extract error message
function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Helper: normalize phone
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  return phone.replace(/[\s\-\(\)\+]/g, '');
}

// Helper: normalize email
function normalizeEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return email.toLowerCase().trim();
}

// Flatten keys like 'customData[firstname]' to 'firstname'
function flattenCustomDataKeys(data: Record<string, string>): Record<string, string> {
  const flatData: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    const customDataMatch = key.match(/^customData\[(.+)\]$/);
    if (customDataMatch) {
      flatData[customDataMatch[1]] = value;
    } else {
      flatData[key] = value;
    }
  }

  return flatData;
}

// Schema for webhook data (flat keys)
const webhookSchema = z.object({
  contact_id: z.string().optional(),
  firstname: z.string().min(1, "First name is required"),
  lastname: z.string().min(1, "Last name is required"),
  displayname: z.string().optional(),
  title: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional(),
  tags: z.string().optional(),
  country: z.string().optional(),
  date_created: z.string().optional(),
  contact_type: z.string().optional(),
  location: z.string().optional(),
  workflow: z.string().optional(),
  triggerData: z.string().optional(),
  contact: z.string().optional(),
  attributionSource: z.string().optional(),
  customData: z.string().optional(),
}).catchall(z.string().optional());

// Upsert contact by firstName + lastName only
async function handleContactUpsert(data: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  displayName?: string;
  title?: string;
  externalContactId?: string;
}) {
  const { firstName, lastName, email, phone, address, displayName, title, externalContactId } = data;

  const existingContact = await db
    .select()
    .from(contact)
    .where(and(eq(contact.firstName, firstName), eq(contact.lastName, lastName)))
    .limit(1);

  if (existingContact.length > 0) {
    const updateData: {
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      displayName?: string | null;
      title?: string | null;
      updatedAt?: Date;
    } = { updatedAt: new Date() };

    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (displayName !== undefined) updateData.displayName = displayName.trim() || null;
    if (title !== undefined) updateData.title = title.trim() || null;

    const updatedContacts = await db
      .update(contact)
      .set(updateData)
      .where(eq(contact.id, existingContact[0].id))
      .returning();

    const updatedContact = updatedContacts[0];

    return {
      contact: {
        ...updatedContact,
        externalContactId,
      },
      isNew: false,
      action: 'updated' as const,
    };
  } else {
    const newContacts = await db
      .insert(contact)
      .values({
        firstName,
        lastName,
        email,
        phone,
        address,
        displayName: displayName?.trim() || null,
        title: title?.trim() || null,
      })
      .returning();

    const newContact = newContacts[0];

    return {
      contact: {
        ...newContact,
        externalContactId,
      },
      isNew: true,
      action: 'created' as const,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Webhook Debug ===');
    console.log('URL:', request.url);
    console.log('Method:', request.method);
    const contentType = request.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);

    // Check query params first
    const url = new URL(request.url);
    let data: Record<string, string> = Object.fromEntries(url.searchParams.entries());
    let dataSource = 'query_parameters';

    // If no query params, parse request body based on content-type
    if (!Object.keys(data).length) {
      if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data') || contentType === '') {
        const formData = await request.formData();
        data = {};
        for (const [k, v] of formData.entries()) {
          data[k] = v.toString();
        }
        dataSource = 'form_data';
      } else if (contentType.includes('application/json')) {
        const json = await request.json();
        data = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]));
        dataSource = 'json_body';
      } else {
        const text = await request.text();
        if (text.trim()) {
          const params = new URLSearchParams(text);
          data = {};
          for (const [k, v] of params.entries()) {
            data[k] = v;
          }
          dataSource = 'url_encoded_text';
        }
      }
    }

    console.log('Received data:', data, 'Source:', dataSource);

    if (!Object.keys(data).length) {
      return NextResponse.json({ success: false, message: 'No data found', code: 'NO_DATA' }, { status: 400 });
    }

    // Flatten keys like customData[firstname] to firstname
    data = flattenCustomDataKeys(data);

    // Validate data
    const parsed = webhookSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Data validation failed',
          code: 'VALIDATION_ERROR',
          errors: parsed.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            received: data[e.path[0] as string],
          })),
          debug: { data, dataSource },
        },
        { status: 400 }
      );
    }

    const validData = parsed.data;

    const firstName = validData.firstname?.trim();
    const lastName = validData.lastname?.trim();
    const displayName = validData.displayname?.trim();
    const title = validData.title?.trim();
    const email = normalizeEmail(validData.email);
    const phone = normalizePhone(validData.phone);
    const address = validData.address?.trim() || null;

    if (!firstName || !lastName) {
      return NextResponse.json({
        success: false,
        message: 'First name and last name are required',
        code: 'MISSING_REQUIRED_FIELDS',
        received: { firstName, lastName },
      }, { status: 400 });
    }

    const result = await handleContactUpsert({
      firstName,
      lastName,
      email,
      phone,
      address,
      displayName,
      title,
      externalContactId: validData.contact_id,
    });

    console.log(`Successfully ${result.action} contact with ID: ${result.contact.id}`);

    return NextResponse.json({
      success: true,
      message: `Contact ${result.action} successfully`,
      code: result.isNew ? 'CONTACT_CREATED' : 'CONTACT_UPDATED',
      contact: result.contact,
      source: dataSource,
      action: result.action,
    }, { status: result.isNew ? 201 : 200 });

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Unexpected server error',
        code: 'SERVER_ERROR',
        debug: process.env.NODE_ENV === 'development' ? { error: getErrorMessage(error) } : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Webhook endpoint is active',
    methods: ['POST'],
    note: 'Accepts data via URL query parameters, form data, or JSON body. Only firstname and lastname required. Upserts contact by name.',
    example: {
      queryParams: '/api/webhook/contact?firstname=John&lastname=Doe&email=john@test.com',
      formData: 'POST form data: firstname, lastname, email, etc.',
      jsonBody: 'POST JSON body: {"firstname": "John", "lastname": "Doe", "email": "john@test.com"}',
    }
  }, { status: 200 });
}

