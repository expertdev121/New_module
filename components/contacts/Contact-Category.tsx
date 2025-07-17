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

export default function ContactCategoriesCard({
  categories,
}: ContactCategoriesCardProps) {
  const { contactId } = useParams<{ contactId: string }>();

  const categoryOrder = ["Tuition", "Donation", "Miscellaneous"];

  const createEmptyCategory = (name: string) => ({
    categoryId: name.toLowerCase(),
    categoryName: name,
    categoryDescription: "",
    totalPledgedUsd: "0.00",
    totalPaidUsd: "0.00",
    currentBalanceUsd: "0.00",
    pledgeCount: 0,
    pledges: [] // Changed from pledge to pledges array
  });
 
  const formatCurrency = (amount: string, currency: string = "USD") => {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.parseFloat(amount));

    // Extract currency symbol and amount
    const currencySymbol = formatted.replace(/[\d,.\s]/g, "");
    const numericAmount = formatted.replace(/[^\d,.\s]/g, "").trim();

    return { symbol: currencySymbol, amount: numericAmount };
  };
  const categoryMap = new Map<string, Category>();
  categories.forEach((cat) => {
    categoryMap.set(cat.categoryName.toLowerCase(), cat);
  });

  const sortedCategories = categoryOrder.map((categoryName) => {
    const existing = categoryMap.get(categoryName.toLowerCase());
    return existing || createEmptyCategory(categoryName);
  });

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
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Pledged ($)</TableHead>
              <TableHead className="text-right">Paid ($)</TableHead>
              <TableHead className="text-right">Balance ($)</TableHead>
              <TableHead className="text-right">Pledges</TableHead>
              <TableHead className="text-right">Scheduled</TableHead>
              <TableHead className="text-right">Unscheduled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCategories.map((category) => {
              return (
                <TableRow key={category.categoryId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/contacts/${contactId}/pledges?categoryId=${category?.categoryId}`}
                      className="font-medium text-primary hover:underline hover:text-primary-dark transition-colors duration-200"
                    >
                      {category.categoryName}
                    </Link>
                  </TableCell>
                  <TableCell>{category.categoryDescription || "N/A"}</TableCell>
                  <TableCell className="text-right">
                    $ {category.totalPledgedUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    $ {category.totalPaidUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    $ {category.currentBalanceUsd}
                  </TableCell>
                  <TableCell className="text-right">
                    {category.pledgeCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-evenly">
                                          $ {category.currentBalanceUsd}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-evenly">
                                         $ {category.totalPledgedUsd}
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