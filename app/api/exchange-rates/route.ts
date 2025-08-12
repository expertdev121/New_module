import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeRate } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import axios from "axios";
import type { ExchangeRate as ExchangeRateRow } from "@/lib/db/schema";

interface ExchangeRateData {
  data: {
    currency: string;
    rates: Record<string, string>;
  };
}

const rateCache = new Map<string, ExchangeRateData>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

  if (rateCache.has(date)) {
    return NextResponse.json(rateCache.get(date)!);
  }

  const dbRates = await db
    .select()
    .from(exchangeRate)
    .where(and(eq(exchangeRate.baseCurrency, "USD"), eq(exchangeRate.date, date)));

  if (dbRates.length > 0) {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const mostRecent = new Date(dbRates[0].updatedAt);

    if (mostRecent >= oneDayAgo) {
      const transformedRates: Record<string, string> = {};
      dbRates.forEach((r) => {
        transformedRates[r.targetCurrency] = r.rate.toString();
      });
      transformedRates["USD"] = "1.0";
      const result = { data: { currency: "USD", rates: transformedRates } };
      rateCache.set(date, result);
      return NextResponse.json(result);
    }
  }

  const ACCESS_KEY = process.env.NEXT_PUBLIC_EXCHANGERATE_API_KEY!;
  const response = await axios.get(
    `https://api.exchangerate.host/historical?access_key=${ACCESS_KEY}&date=${date}&currencies=USD,ILS,EUR,JPY,GBP,AUD,CAD,ZAR&format=1`
  );

  const transformedRates: Record<string, string> = {};
  if (response.data.quotes) {
    Object.entries(response.data.quotes).forEach(([key, value]) => {
      if (key.startsWith("USD")) {
        const currency = key.replace("USD", "") as ExchangeRateRow["targetCurrency"];
        transformedRates[currency] = (1 / Number(value)).toFixed(6);
      }
    });
    transformedRates["USD"] = "1.0";
  }

  const insertData: Omit<ExchangeRateRow, "id" | "createdAt">[] = Object.entries(transformedRates)
    .filter(([cur]) => cur !== "USD")
    .map(([currency, rate]) => ({
      baseCurrency: "USD",
      targetCurrency: currency as ExchangeRateRow["targetCurrency"],
      rate,
      date,
      updatedAt: new Date().toISOString().split("T")[0],
    }));

  await db
    .insert(exchangeRate)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        exchangeRate.baseCurrency,
        exchangeRate.targetCurrency,
        exchangeRate.date,
      ],
      set: {
        rate: sql`excluded.rate`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  const result = { data: { currency: "USD", rates: transformedRates } };
  rateCache.set(date, result);
  return NextResponse.json(result);
}
