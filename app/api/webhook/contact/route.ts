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

// Schema for URL parameters (all strings from URL)
const webhookQuerySchema = z.object({
  contact_id: z.string().optional(),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  full_name: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")), // Allow empty string
  phone: z.string().optional().or(z.literal("")), // Allow empty string for phone too
  tags: z.string().optional(),
  country: z.string().optional(),
  date_created: z.string().optional(),
  full_address: z.string().optional(),
  contact_type: z.string().optional(),
  location: z.string().optional(),
  workflow: z.string().optional(),
  triggerData: z.string().optional(),
  contact: z.string().optional(),
  attributionSource: z.string().optional(),
  customData: z.string().optional(),
}).catchall(z.string().optional());

export async function POST(request: NextRequest) {
  try {
    console.log('=== Webhook Debug ===');
    console.log('URL:', request.url);
    console.log('Method:', request.method);
    console.log('Content-Type:', request.headers.get('content-type'));

    // Extract URL and query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    console.log('Query parameters:', queryParams);
    console.log('Query param keys:', Object.keys(queryParams));

    // Check if we have query parameters (primary method)
    if (Object.keys(queryParams).length > 0) {
      console.log('Using query parameters as data source');
      
      // Validate query parameters
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
      
      // Extract and normalize contact information
      const firstName = data.first_name?.trim();
      const lastName = data.last_name?.trim();
      const email = normalizeEmail(data.email);
      const phone = normalizePhone(data.phone);
      const address = data.full_address?.trim() || null;

      console.log('Extracted from query params:', { firstName, lastName, email, phone, address });

      // Validate required fields - only first_name and last_name are required now
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

      // Check for duplicates - priority: name match, then email/phone match
      const whereConditions = [];
      
      // First check for exact name match (case insensitive)
      const normalizedFirstName = normalizeName(firstName);
      const normalizedLastName = normalizeName(lastName);
      
      if (normalizedFirstName && normalizedLastName) {
        whereConditions.push(
          and(
            eq(contact.firstName, firstName), // Store original case but compare normalized
            eq(contact.lastName, lastName)
          )
        );
      }

      // Also check email/phone duplicates if provided
      if (email) whereConditions.push(eq(contact.email, email));
      if (phone) whereConditions.push(eq(contact.phone, phone));

      if (whereConditions.length > 0) {
        const existingContact = await db
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

        if (existingContact.length > 0) {
          // Check if it's a name match or email/phone match
          const nameMatch = existingContact[0].firstName.toLowerCase() === normalizedFirstName && 
                           existingContact[0].lastName.toLowerCase() === normalizedLastName;
          
          return NextResponse.json(
            {
              success: false,
              message: nameMatch 
                ? 'Contact with this name already exists'
                : 'Contact with this email or phone already exists',
              code: 'DUPLICATE_CONTACT',
              matchType: nameMatch ? 'name' : 'email_or_phone',
              existingContact: existingContact[0]
            },
            { status: 409 }
          );
        }
      }

      // Insert new contact
      const [newContact] = await db
        .insert(contact)
        .values({
          firstName,
          lastName,
          email,
          phone,
          address,
        })
        .returning();

      console.log(`Successfully created contact with ID: ${newContact.id}`);

      return NextResponse.json(
        {
          success: true,
          message: 'Contact created successfully',
          code: 'CONTACT_CREATED',
          contact: {
            ...newContact,
            externalContactId: data.contact_id
          },
          source: 'query_parameters'
        },
        { status: 201 }
      );
    }

    // Fallback: try to parse request body if no query params
    let body: Record<string, string> = {};
    let parseMethod = 'none';

    const cloneForm = request.clone();
    const cloneJson = request.clone();
    const cloneText = request.clone();

    // Try FormData
    try {
      const form = await request.formData();
      if (!form.entries().next().done) {
        for (const [k, v] of form.entries()) body[k] = v.toString();
        parseMethod = 'formData';
        console.log('Parsed as formData:', Object.keys(body));
      } else {
        throw new Error('empty formData');
      }
    } catch (formErr: unknown) {
      // Try JSON
      try {
        const json = await cloneJson.json();
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          // Convert JSON object to string values for consistency
          body = Object.fromEntries(
            Object.entries(json).map(([key, value]) => [key, String(value)])
          );
          parseMethod = 'json';
          console.log('Parsed as JSON:', Object.keys(body));
        } else {
          throw new Error('invalid JSON');
        }
      } catch (jsonErr: unknown) {
        // Try URL-encoded text
        try {
          const txt = await cloneText.text();
          if (txt.trim()) {
            const params = new URLSearchParams(txt);
            if ([...params].length) {
              for (const [k, v] of params.entries()) body[k] = v;
              parseMethod = 'urlEncoded';
              console.log('Parsed as urlEncoded:', Object.keys(body));
            } else {
              const parsedJson = JSON.parse(txt);
              if (typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
                body = Object.fromEntries(
                  Object.entries(parsedJson).map(([key, value]) => [key, String(value)])
                );
                parseMethod = 'textJson';
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

    // Process body data (similar logic as query params)
    if (Object.keys(body).length > 0) {
      console.log('Using request body as fallback');
      
      // Validate body data using the same schema
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
      
      // Extract and normalize contact information from body
      const firstName = bodyData.first_name?.trim();
      const lastName = bodyData.last_name?.trim();
      const email = normalizeEmail(bodyData.email);
      const phone = normalizePhone(bodyData.phone);
      const address = bodyData.full_address?.trim() || null;

      // Validate required fields - only first_name and last_name are required now
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

      // Check for duplicates - priority: name match, then email/phone match
      const whereConditions = [];
      
      // First check for exact name match (case insensitive)
      const normalizedFirstName = normalizeName(firstName);
      const normalizedLastName = normalizeName(lastName);
      
      if (normalizedFirstName && normalizedLastName) {
        whereConditions.push(
          and(
            eq(contact.firstName, firstName), // Store original case but compare normalized
            eq(contact.lastName, lastName)
          )
        );
      }

      // Also check email/phone duplicates if provided
      if (email) whereConditions.push(eq(contact.email, email));
      if (phone) whereConditions.push(eq(contact.phone, phone));

      if (whereConditions.length > 0) {
        const existingContact = await db
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

        if (existingContact.length > 0) {
          // Check if it's a name match or email/phone match
          const nameMatch = existingContact[0].firstName.toLowerCase() === normalizedFirstName && 
                           existingContact[0].lastName.toLowerCase() === normalizedLastName;
          
          return NextResponse.json(
            {
              success: false,
              message: nameMatch 
                ? 'Contact with this name already exists'
                : 'Contact with this email or phone already exists',
              code: 'DUPLICATE_CONTACT',
              matchType: nameMatch ? 'name' : 'email_or_phone',
              existingContact: existingContact[0]
            },
            { status: 409 }
          );
        }
      }

      // Insert new contact
      const [newContact] = await db
        .insert(contact)
        .values({
          firstName,
          lastName,
          email,
          phone,
          address,
        })
        .returning();

      console.log(`Successfully created contact with ID: ${newContact.id}`);

      return NextResponse.json(
        {
          success: true,
          message: 'Contact created successfully',
          code: 'CONTACT_CREATED',
          contact: {
            ...newContact,
            externalContactId: bodyData.contact_id
          },
          source: 'request_body'
        },
        { status: 201 }
      );
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
      note: 'Accepts data via URL query parameters or request body. Only first_name and last_name are required. Checks for duplicate names before creating.',
      example: '/api/webhook/contact?first_name=John&last_name=Doe&email=john@test.com'
    },
    { status: 200 }
  );
}