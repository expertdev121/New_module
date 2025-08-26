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

// Helper: normalize name (handle dashes, empty strings, etc.)
function normalizeName(name: string | null | undefined): string | undefined {
  if (!name?.trim()) return undefined;
  const cleaned = name.trim();
  // If it's just a dash or other placeholder, return undefined
  if (cleaned === '-' || cleaned === '_' || cleaned === 'N/A' || cleaned === 'n/a') return undefined;
  return cleaned;
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

// Schema for webhook data (flat keys) - updated to match your webhook fields
const webhookSchema = z.object({
  contact_id: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  first_name: z.string().optional(), // Alternative field name
  last_name: z.string().optional(),  // Alternative field name
  displayname: z.string().optional(),
  display_name: z.string().optional(), // Alternative field name
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

// Extract names with fallback logic
function extractNames(data: Record<string, string | undefined>): { firstName: string | undefined; lastName: string | undefined } {
  // Try various field combinations - prioritize the main fields your webhook sends
  let firstName = normalizeName(data.firstname || data.first_name);
  let lastName = normalizeName(data.lastname || data.last_name);

  // If we have a full_name but missing first/last, try to split it
  if ((!firstName || !lastName) && data.full_name) {
    const fullName = data.full_name.trim();
    const nameParts = fullName.split(' ').filter((part: string) => part.trim() && part !== '-');
    
    if (nameParts.length >= 2) {
      if (!firstName) firstName = nameParts[0];
      if (!lastName) lastName = nameParts.slice(1).join(' ');
    } else if (nameParts.length === 1) {
      // If only one name part, decide based on what's missing
      if (!firstName && !lastName) {
        // Default to last name for single names (common for companies)
        lastName = nameParts[0];
        firstName = 'N/A';
      } else if (!firstName) {
        firstName = nameParts[0];
      } else if (!lastName) {
        lastName = nameParts[0];
      }
    }
  }

  // Final fallback - if we still don't have both names
  if (!firstName && lastName) {
    firstName = 'N/A'; // Placeholder for missing first name
  }
  if (!lastName && firstName) {
    lastName = 'N/A'; // Placeholder for missing last name
  }

  return { firstName, lastName };
}

// Extract display name with fallback logic
function extractDisplayName(data: Record<string, string | undefined>, firstName: string | undefined, lastName: string | undefined): string | undefined {
  // Try displayname first, then display_name
  let displayName = data.displayname?.trim() || data.display_name?.trim();
  
  // If no display name provided, construct one from first/last name
  if (!displayName && firstName && lastName) {
    if (firstName === 'N/A') {
      displayName = lastName;
    } else if (lastName === 'N/A') {
      displayName = firstName;
    } else {
      displayName = `${firstName} ${lastName}`;
    }
  }
  
  // Clean up any malformed template artifacts
  if (displayName) {
    // Remove common template artifacts
    displayName = displayName
      .replace(/-, \( & \)$/, '') // Remove trailing ", ( & )"
      .replace(/^-, /, '')        // Remove leading "-, "
      .replace(/ & $/, '')        // Remove trailing " & "
      .replace(/\(\s*&\s*\)/, '') // Remove empty "( & )"
      .trim();
      
    // If after cleanup it's empty or just punctuation, return undefined
    if (!displayName || displayName === '-' || displayName === ',' || displayName === '()') {
      displayName = undefined;
    }
  }
  
  return displayName;
}

// Upsert contact by firstName + lastName only
async function handleContactUpsert(data: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | undefined;
  displayName?: string | undefined;
  title?: string | undefined;
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
      address?: string | undefined;
      displayName?: string | undefined;
      title?: string | undefined;
      updatedAt?: Date;
    } = { updatedAt: new Date() };

    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (title !== undefined) updateData.title = title;

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
        displayName: displayName,
        title: title,
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

    // Extract names with intelligent fallback
    const { firstName, lastName } = extractNames(validData);

    if (!firstName || !lastName) {
      return NextResponse.json({
        success: false,
        message: 'Unable to extract valid first name and last name from the provided data',
        code: 'MISSING_REQUIRED_FIELDS',
        received: { firstName, lastName, full_name: validData.full_name },
        debug: { 
          availableFields: Object.keys(validData),
          dataSource 
        },
      }, { status: 400 });
    }

    // Extract and clean display name
    const displayName = extractDisplayName(validData, firstName, lastName);
    const title = validData.title?.trim() || undefined;
    const email = normalizeEmail(validData.email);
    const phone = normalizePhone(validData.phone);
    const address = validData.address?.trim() || undefined;

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
    note: 'Accepts data via URL query parameters, form data, or JSON body. Extracts names intelligently from various field combinations.',
    example: {
      queryParams: '/api/webhook/contact?firstname=John&lastname=Doe&email=john@test.com',
      formData: 'POST form data: firstname, lastname, email, etc.',
      jsonBody: 'POST JSON body: {"firstname": "John", "lastname": "Doe", "email": "john@test.com"}',
    }
  }, { status: 200 });
}