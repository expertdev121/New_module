import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from "drizzle-orm";
import { paymentMethods, paymentMethodDetails } from '@/lib/db/schema';

// List all active payment methods with their details
export async function GET() {
  try {
    // Get all active payment methods
    const methods = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.isActive, true))
      .orderBy(paymentMethods.name);

    // Get all details for active payment methods
    const details = await db
      .select()
      .from(paymentMethodDetails);

    // Combine methods with their details
    const methodsWithDetails = methods.map(method => ({
      ...method,
      details: details.filter(detail => detail.paymentMethodId === method.id)
    }));

    return NextResponse.json(methodsWithDetails);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }
}
