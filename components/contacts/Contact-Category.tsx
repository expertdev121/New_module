"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Category } from "@/lib/query/useContactCategories";
import { DollarSign } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface ContactCategoriesCardProps {
  categories: Category[];
}

// Extended interface for categories that includes scheduledUsd from the backend
interface ExtendedCategory extends Category {
  scheduledUsd?: number | string; // Allow both number and string from backend
}

export default function ContactCategoriesCard({
  categories,
}: ContactCategoriesCardProps) {
  const { contactId } = useParams<{ contactId: string }>();

  const categoryOrder = ["Donations", "Tuition", "Miscellaneous"];

  const createEmptyCategory = (name: string): ExtendedCategory => ({
    categoryId: name.toLowerCase() as unknown as Category['categoryId'],
    categoryName: name,
    categoryDescription: "",
    totalPledgedUsd: 0,
    totalPaidUsd: 0,
    currentBalanceUsd: 0,
    pledgeCount: 0,
    scheduledUsd: 0,
  });

  const formatCurrency = (amount: string | number, currency: string = "USD") => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);

    const currencySymbol = formatted.replace(/[\d,.\s]/g, "");
    const numericPart = formatted.replace(/[^\d,.\s]/g, "").trim();

    return { symbol: currencySymbol, amount: numericPart };
  };

  const getScheduledAmount = (category: ExtendedCategory) => {
    // Handle all possible types and convert to number
    let scheduled = category.scheduledUsd;

    // Convert to number regardless of input type
    if (typeof scheduled === 'string') {
      scheduled = parseFloat(scheduled);
    } else if (scheduled === null || scheduled === undefined) {
      scheduled = 0;
    }

    // Final safety check - ensure it's a valid number
    const validScheduled = (typeof scheduled === 'number' && !isNaN(scheduled)) ? scheduled : 0;

    console.log(`💰 Scheduled amount for ${category.categoryName}: $${validScheduled.toFixed(2)} (from backend)`);
    console.log(`🔍 Original scheduledUsd:`, category.scheduledUsd, 'Type:', typeof category.scheduledUsd);

    return validScheduled.toFixed(2);
  };

  const calculateUnscheduled = (balance: string | number, scheduled: string | number) => {
    // Handle balance conversion
    let balanceNum = balance;
    if (typeof balanceNum === 'string') {
      balanceNum = parseFloat(balanceNum);
    }
    const validBalance = (typeof balanceNum === 'number' && !isNaN(balanceNum)) ? balanceNum : 0;

    // Handle scheduled conversion
    let scheduledNum = scheduled;
    if (typeof scheduledNum === 'string') {
      scheduledNum = parseFloat(scheduledNum);
    }
    const validScheduled = (typeof scheduledNum === 'number' && !isNaN(scheduledNum)) ? scheduledNum : 0;

    // Ensure unscheduled is never negative - use Math.max to set minimum to 0
    const unscheduled = Math.max(0, validBalance - validScheduled).toFixed(2);

    console.log(`📊 Unscheduled calculation: Balance($${validBalance}) - Scheduled($${validScheduled}) = $${unscheduled}`);
    return unscheduled;
  };

  const categoryMap = new Map<string, ExtendedCategory>();
  categories.forEach((cat) => {
    // Map "Donation" to "Donations" if it exists
    const categoryName = cat.categoryName === "Donation" ? "Donations" : cat.categoryName;
    const updatedCategory = { ...cat, categoryName };
    categoryMap.set(categoryName.toLowerCase(), updatedCategory as ExtendedCategory);
  });

  const sortedCategories = categoryOrder.map((categoryName) => {
    const existing = categoryMap.get(categoryName.toLowerCase());
    return existing || createEmptyCategory(categoryName);
  });

  // Debug log to see the data structure from backend
  console.log('\n🔍 Categories with scheduled amounts from backend:', sortedCategories);

  return (
    <Card className="w-full lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold">Category</TableHead>
              <TableHead className="font-bold text-right">Pledged</TableHead>
              <TableHead className="font-bold text-right">Paid</TableHead>
              <TableHead className="font-bold text-right">Balance</TableHead>
              <TableHead className="font-bold text-right">Pledges</TableHead>
              <TableHead className="font-bold text-right italic">Scheduled</TableHead>
              <TableHead className="font-bold text-right italic">Unscheduled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCategories.map((category) => {
              // Debug log for each category
              console.log(`🔍 Category ${category.categoryName} scheduledUsd:`, category.scheduledUsd, typeof category.scheduledUsd);

              const scheduledAmount = getScheduledAmount(category);
              const unscheduledAmount = calculateUnscheduled(
                category.currentBalanceUsd,
                scheduledAmount
              );

              return (
                <TableRow key={category.categoryId}>
                  <TableCell className="font-bold">
                    <Link
                      href={`/contacts/${contactId}/pledges?categoryId=${category?.categoryId}`}
                      className="font-bold text-primary hover:underline hover:text-primary-dark transition-colors duration-200"
                    >
                      {category.categoryName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    $ {typeof category.totalPledgedUsd === 'number' ? category.totalPledgedUsd.toFixed(2) : category.totalPledgedUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    $ {typeof category.totalPaidUsd === 'number' ? category.totalPaidUsd.toFixed(2) : category.totalPaidUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    $ {typeof category.currentBalanceUsd === 'number' ? category.currentBalanceUsd.toFixed(2) : category.currentBalanceUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    {category.pledgeCount}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-evenly italic text-blue-600">
                      $ {scheduledAmount}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-evenly italic text-red-600">
                      $ {unscheduledAmount}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
