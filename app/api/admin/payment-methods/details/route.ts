
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql, eq, and } from "drizzle-orm";
import { paymentMethodDetails, PaymentMethodDetail, NewPaymentMethodDetail } from '@/lib/db/schema';

// List all payment method details (optionally filter by paymentMethodId)
export async function GET(req: NextRequest) {
  const paymentMethodId = req.nextUrl.searchParams.get('paymentMethodId');
  let details;

  if (paymentMethodId) {
    details = await db.select().from(paymentMethodDetails).where(eq(paymentMethodDetails.paymentMethodId, Number(paymentMethodId)));
  } else {
    details = await db.select().from(paymentMethodDetails);
  }

  return NextResponse.json(details);
}

// Add a new payment method detail
export async function POST(req: NextRequest) {
  const data = await req.json();
  const { paymentMethodId, key, value } = data;
  if (!paymentMethodId || !key) return NextResponse.json({ error: 'paymentMethodId and key are required' }, { status: 400 });
  const [created] = await db.insert(paymentMethodDetails).values({ paymentMethodId, key, value }).returning();
  return NextResponse.json(created);
}

// Update a payment method detail
export async function PUT(req: NextRequest) {
  const data = await req.json();
  const { id, key, value } = data;
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  const [updated] = await db.update(paymentMethodDetails)
    .set({ key, value, updatedAt: new Date() })
    .where(eq(paymentMethodDetails.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

// Delete a payment method detail
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  const [deleted] = await db.delete(paymentMethodDetails).where(eq(paymentMethodDetails.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(deleted);
}
