
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql, eq, and } from "drizzle-orm";
import { paymentMethods, PaymentMethod, NewPaymentMethod } from '@/lib/db/schema';

// List all payment methods
export async function GET() {
  const methods = await db.select().from(paymentMethods).orderBy(paymentMethods.id);
  return NextResponse.json(methods);
}

// Add a new payment method
export async function POST(req: NextRequest) {
  const data = await req.json();
  const { name, description, isActive } = data;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const [created] = await db.insert(paymentMethods).values({ name, description, isActive }).returning();
  return NextResponse.json(created);
}

// Update a payment method
export async function PUT(req: NextRequest) {
  const data = await req.json();
  const { id, name, description, isActive } = data;
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  const [updated] = await db.update(paymentMethods)
    .set({ name, description, isActive, updatedAt: new Date() })
    .where(eq(paymentMethods.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

// Delete a payment method
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  const [deleted] = await db.delete(paymentMethods).where(eq(paymentMethods.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(deleted);
}
