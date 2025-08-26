import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contact } from '@/lib/db/schema';
import { eq, or, and } from 'drizzle-orm';
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

// Helper: normalize name for comparison
function normalizeName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return name.toLowerCase().trim();
}

// Updated schema to match your webhook parameter names and include title
const webhookQuerySchema = z.object({
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

// Helper function to handle contact creation or update - FIXED FOR NEON/POSTGRESQL
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
  
  // Check if contact exists by first and last name
  const existingContact = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.firstName, firstName),
        eq(contact.lastName, lastName)
      )
    )
    .limit(1);

  if (existingContact.length > 0) {
    // Contact exists - update it
    const updateData: {
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      displayName?: string | null;
      title?: string | null;
      updatedAt?: Date;
    } = {
      email: email || existingContact[0].email,
      phone: phone || existingContact[0].phone,
      address: address || existingContact[0].address,
      updatedAt: new Date(),
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName.trim() || null;
    }

    if (title !== undefined) {
      updateData.title = title.trim() || null;
    }

    // FOR NEON/POSTGRESQL: Use .returning()
    const updatedContacts = await db
      .update(contact)
      .set(updateData)
      .where(eq(contact.id, existingContact[0].id))
      .returning();

    const updatedContact = updatedContacts[0];

    return {
      contact: {
        ...updatedContact,
        externalContactId
      },
      isNew: false,
      action: 'updated' as const
    };
  } else {
    // Check for email/phone duplicates only if contact doesn't exist by name
    const whereConditions = [];
    if (email) whereConditions.push(eq(contact.email, email));
    if (phone) whereConditions.push(eq(contact.phone, phone));

    if (whereConditions.length > 0) {
      const duplicateContact = await db
        .select({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone
        })
        .from(contact)
        .where(or(...whereConditions))
        .limit(1);

      if (duplicateContact.length > 0) {
        throw new Error(`Contact with this ${email && duplicateContact[0].email === email ? 'email' : 'phone'} already exists with different name: ${duplicateContact[0].firstName} ${duplicateContact[0].lastName}`);
      }
    }

    // FOR NEON/POSTGRESQL: Use .returning() - this works correctly
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
        externalContactId
      },
      isNew: true,
      action: 'created' as const
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Webhook Debug ===');
    console.log('URL:', request.url);
    console.log('Method:', request.method);
    console.log('Content-Type:', request.headers.get('content-type'));

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    console.log('Query parameters:', queryParams);
    console.log('Query param keys:', Object.keys(queryParams));

    if (Object.keys(queryParams).length > 0) {
      console.log('Using query parameters as data source');
      
      const result = webhookQuerySchema.safeParse(queryParams);
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message: 'Query parameter validation failed',
            code: 'QUERY_VALIDATION_ERROR',
            errors: result.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
              received: queryParams[e.path[0] as string]
            })),
          },
          { status: 400 }
        );
      }

      const data = result.data;
      
      const firstName = data.firstname?.trim();
      const lastName = data.lastname?.trim();
      const displayName = data.displayname?.trim();
      const title = data.title?.trim();
      const email = normalizeEmail(data.email);
      const phone = normalizePhone(data.phone);
      const address = data.address?.trim() || null;

      console.log('Extracted from query params:', { 
        firstName, 
        lastName, 
        displayName,
        title,
        email, 
        phone, 
        address 
      });

      if (!firstName || !lastName) {
        return NextResponse.json(
          {
            success: false,
            message: 'First name and last name are required',
            code: 'MISSING_REQUIRED_FIELDS',
            received: { firstName, lastName }
          },
          { status: 400 }
        );
      }

      try {
        const result = await handleContactUpsert({
          firstName,
          lastName,
          email,
          phone,
          address,
          displayName,
          title,
          externalContactId: data.contact_id
        });

        console.log(`Successfully ${result.action} contact with ID: ${result.contact.id}`);

        return NextResponse.json(
          {
            success: true,
            message: `Contact ${result.action} successfully`,
            code: result.isNew ? 'CONTACT_CREATED' : 'CONTACT_UPDATED',
            contact: result.contact,
            source: 'query_parameters',
            action: result.action
          },
          { status: result.isNew ? 201 : 200 }
        );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: getErrorMessage(error),
            code: 'DUPLICATE_CONTACT_ERROR',
          },
          { status: 409 }
        );
      }
    }

    // Fallback body processing
    let body: Record<string, string> = {};

    const cloneForm = request.clone();
    const cloneJson = request.clone();
    const cloneText = request.clone();

    try {
      const form = await request.formData();
      if (!form.entries().next().done) {
        for (const [k, v] of form.entries()) body[k] = v.toString();
        console.log('Parsed as formData:', Object.keys(body));
      } else {
        throw new Error('empty formData');
      }
    } catch (formErr: unknown) {
      try {
        const json = await cloneJson.json();
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          body = Object.fromEntries(
            Object.entries(json).map(([key, value]) => [key, String(value)])
          );
          console.log('Parsed as JSON:', Object.keys(body));
        } else {
          throw new Error('invalid JSON');
        }
      } catch (jsonErr: unknown) {
        try {
          const txt = await cloneText.text();
          if (txt.trim()) {
            const params = new URLSearchParams(txt);
            if ([...params].length) {
              for (const [k, v] of params.entries()) body[k] = v;
              console.log('Parsed as urlEncoded:', Object.keys(body));
            } else {
              const parsedJson = JSON.parse(txt);
              if (typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
                body = Object.fromEntries(
                  Object.entries(parsedJson).map(([key, value]) => [key, String(value)])
                );
                console.log('Parsed text as JSON:', Object.keys(body));
              } else {
                throw new Error('Parsed JSON is not an object');
              }
            }
          } else {
            throw new Error('empty text');
          }
        } catch (textErr: unknown) {
          return NextResponse.json(
            {
              success: false,
              message: 'No data found in query parameters or request body',
              code: 'NO_DATA_FOUND',
              debug: {
                queryParams: Object.keys(queryParams),
                bodyParsing: {
                  form: getErrorMessage(formErr),
                  json: getErrorMessage(jsonErr),
                  text: getErrorMessage(textErr),
                }
              },
            },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(body).length > 0) {
      console.log('Using request body as fallback');
      
      const bodyResult = webhookQuerySchema.safeParse(body);
      if (!bodyResult.success) {
        return NextResponse.json(
          {
            success: false,
            message: 'Body data validation failed',
            code: 'BODY_VALIDATION_ERROR',
            errors: bodyResult.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
              received: body[e.path[0] as string]
            })),
          },
          { status: 400 }
        );
      }

      const bodyData = bodyResult.data;
      
      const firstName = bodyData.firstname?.trim();
      const lastName = bodyData.lastname?.trim();
      const displayName = bodyData.displayname?.trim();
      const title = bodyData.title?.trim();
      const email = normalizeEmail(bodyData.email);
      const phone = normalizePhone(bodyData.phone);
      const address = bodyData.address?.trim() || null;

      if (!firstName || !lastName) {
        return NextResponse.json(
          {
            success: false,
            message: 'First name and last name are required',
            code: 'MISSING_REQUIRED_FIELDS',
            received: { firstName, lastName }
          },
          { status: 400 }
        );
      }

      try {
        const result = await handleContactUpsert({
          firstName,
          lastName,
          email,
          phone,
          address,
          displayName,
          title,
          externalContactId: bodyData.contact_id
        });

        console.log(`Successfully ${result.action} contact with ID: ${result.contact.id}`);

        return NextResponse.json(
          {
            success: true,
            message: `Contact ${result.action} successfully`,
            code: result.isNew ? 'CONTACT_CREATED' : 'CONTACT_UPDATED',
            contact: result.contact,
            source: 'request_body',
            action: result.action
          },
          { status: result.isNew ? 201 : 200 }
        );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: getErrorMessage(error),
            code: 'DUPLICATE_CONTACT_ERROR',
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: 'No valid data found',
        code: 'NO_VALID_DATA'
      },
      { status: 400 }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Unexpected server error',
        code: 'UNEXPECTED_ERROR',
        debug: process.env.NODE_ENV === 'development' ? {
          error: getErrorMessage(error)
        } : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      message: 'Webhook endpoint is active',
      methods: ['POST'],
      note: 'Accepts data via URL query parameters or request body. Only firstname and lastname are required. Works with Neon PostgreSQL using .returning().',
      example: '/api/webhook/contact?firstname=John&lastname=Doe&email=john@test.com&displayname=Johnny&title=Manager'
    },
    { status: 200 }
  );
}
