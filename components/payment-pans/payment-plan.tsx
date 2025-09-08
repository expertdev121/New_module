/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { useQueryState } from "nuqs";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, ChevronDown, ChevronRight, Edit, Trash2 } from "lucide-react";
import { usePaymentPlansQuery, useDeletePaymentPlanMutation } from "@/lib/query/payment-plans/usePaymentPlanQuery";
import PaymentPlanDialog from "../forms/payment-plan-dialog";

const PlanStatusEnum = z.enum([
  "active",
  "completed",
  "cancelled",
  "paused",
  "overdue",
]);

type PlanStatusType = z.infer<typeof PlanStatusEnum>;

interface PaymentPlansTableProps {
  contactId?: number;
}

export default function PaymentPlansTable({
  contactId,
}: PaymentPlansTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [pledgeId] = useQueryState("pledgeId", {
    parse: (value) => {
      if (!value) return null;
      const parsed = parseInt(value);
      return isNaN(parsed) ? null : parsed;
    },
    serialize: (value) =>
      value !== null && value !== undefined ? value.toString() : "",
  });

  const [page, setPage] = useQueryState("page", {
    parse: (value) => parseInt(value) || 1,
    serialize: (value) => value.toString(),
  });
  const [limit] = useQueryState("limit", {
    parse: (value) => parseInt(value) || 10,
    serialize: (value) => value.toString(),
  });
  const [search, setSearch] = useQueryState("search");
  const [planStatus, setPlanStatus] = useQueryState<PlanStatusType | null>(
    "planStatus",
    {
      parse: (value) => {
        if (
          value === "active" ||
          value === "completed" ||
          value === "cancelled" ||
          value === "paused" ||
          value === "overdue"
        ) {
          return value as PlanStatusType;
        }
        return null;
      },
      serialize: (value) => value ?? "",
    }
  );

  const currentPage = page ?? 1;
  const currentLimit = limit ?? 10;

  const queryParams = {
    ...(pledgeId ? { pledgeId } : contactId ? { contactId } : {}),
    page: currentPage,
    limit: currentLimit,
    search: search || undefined,
    planStatus: planStatus || undefined,
  };

  const { data, isLoading, error, refetch } = usePaymentPlansQuery(queryParams);
  const deletePaymentPlanMutation = useDeletePaymentPlanMutation();

  const toggleRowExpansion = (planId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(planId)) {
      newExpanded.delete(planId);
    } else {
      newExpanded.add(planId);
    }
    setExpandedRows(newExpanded);
  };

  const handleDeletePaymentPlan = async (planId: number) => {
    try {
      await deletePaymentPlanMutation.mutateAsync(planId);
      setExpandedRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(planId);
        return newSet;
      });
      refetch();
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  // Fixed formatCurrency function
  const formatCurrency = (amount: string | null | undefined, currency: string) => {
    if (!amount || amount === "0" || amount === "") {
      return { symbol: getCurrencySymbol(currency), amount: '0.00' };
    }
    const value = Number(amount);
    if (isNaN(value)) {
      return { symbol: getCurrencySymbol(currency), amount: '0.00' };
    }

    // Format the number with proper decimal places
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return {
      symbol: getCurrencySymbol(currency),
      amount: formatted,
    };
  };

  // Helper function to get currency symbol
  const getCurrencySymbol = (currency: string) => {
    const symbols: { [key: string]: string } = {
      'USD': '$',
      'GBP': '£',
      'EUR': '€',
      'ILS': '₪',
      'JPY': '¥',
      'AUD': 'A$',
      'CAD': 'C$',
      'ZAR': 'R',
    };
    return symbols[currency] || currency;
  };

  // Fixed convertToUSD function - corrected exchange rate logic
  const convertToUSD = (amount: string | null | undefined, exchangeRate: string | null | undefined) => {
    if (!exchangeRate || exchangeRate === '0' || !amount || amount === '0') return null;
    const value = Number(amount);
    const rate = Number(exchangeRate);
    if (isNaN(value) || isNaN(rate) || rate === 0) return null;

    // The exchange rate is returned as USD per foreign currency
    // So if we have rate = 0.299 USD per ILS, then 47 ILS * 0.299 = USD amount
    const converted = value * rate;
    return converted.toString();
  };

  // Helper function to display amount with USD equivalent
  const displayAmountWithUSD = (
    amount: string | null | undefined,
    currency: string,
    exchangeRate: string | null | undefined,
    showUSDBelow = false
  ) => {
    const formatted = formatCurrency(amount, currency);
    const usdValue = convertToUSD(amount, exchangeRate);
    const formattedUsd = usdValue ? parseFloat(usdValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

    if (showUSDBelow && formattedUsd && currency !== 'USD') {
      return (
        <div className="text-center">
          <div>{formatted.symbol}{formatted.amount}</div>
          <div className="text-xs text-gray-500">(~${formattedUsd})</div>
        </div>
      );
    }

    return (
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">{formatted.symbol}</span>
        <span>{formatted.amount}</span>
      </div>
    );
  };

  // Fixed getUSDAmount function
  const getUSDAmount = (
    originalAmount: string | null | undefined,
    usdAmount: string | null | undefined,
    exchangeRate: string | null | undefined,
    currency: string
  ) => {
    // If currency is already USD, return the original amount
    if (currency === 'USD') {
      return originalAmount || '0';
    }

    // If USD amount is explicitly provided and not zero, use it
    if (usdAmount && usdAmount !== "0") {
      return usdAmount;
    }

    // Otherwise convert using exchange rate
    const converted = convertToUSD(originalAmount, exchangeRate);
    return converted || '0';
  };

  // NEW: Helper function to calculate correct installment amount
  const calculateInstallmentAmount = (plan: any) => {
    const totalAmount = Number(plan.totalPlannedAmount || 0);
    const numInstallments = Number(plan.numberOfInstallments || 0);

    // Handle edge cases
    if (numInstallments === 0) {
      return totalAmount.toString(); // Single payment
    }

    if (totalAmount > 0 && numInstallments > 0) {
      return (totalAmount / numInstallments).toString();
    }

    return "0";
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);

    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    const day = date.getDate().toString().padStart(2, "0");
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  };

  const getStatusColor = (status: PlanStatusType | null) => {
    switch (status) {
      case "active":
      case "completed":
        return "bg-green-100 text-green-800";
      case "paused":
      case "overdue":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Helper functions to get installment dates
  const getFirstInstallmentDate = (plan: any) => {
    if (plan.installmentSchedule && plan.installmentSchedule.length > 0) {
      return formatDate(plan.installmentSchedule[0].installmentDate);
    }
    return formatDate(plan.startDate);
  };

  const getLastInstallmentDate = (plan: any) => {
    if (plan.installmentSchedule && plan.installmentSchedule.length > 0) {
      const lastIndex = plan.installmentSchedule.length - 1;
      return formatDate(plan.installmentSchedule[lastIndex].installmentDate);
    }
    return formatDate(plan.endDate);
  };

  const getInstallmentsRemaining = (plan: any) => {
    const total = plan.numberOfInstallments || 0;
    const paid = plan.installmentsPaid || 0;
    return total - paid;
  };

  // Fixed exchange rate display
  const formatExchangeRate = (rate: string | null | undefined, currency: string) => {
    if (!rate || currency === 'USD') return "N/A";
    const rateNum = Number(rate);
    if (isNaN(rateNum)) return "N/A";
    return `1 ${currency} = ${rateNum.toFixed(4)} USD`;
  };

  const handleSuccess = () => {
    refetch();
  };

  if (error) {
    return (
      <Alert className="mx-4 my-6">
        <AlertDescription>
          Failed to load payment plans data. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!pledgeId && !contactId) {
    return (
      <Alert className="mx-4 my-6">
        <AlertDescription>
          No pledge or contact specified. Please provide either a pledgeId in
          the URL or a contactId prop.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Payment Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search payment plans..."
                value={search || ""}
                onChange={(e) => setSearch(e.target.value || null)}
                className="pl-10"
              />
            </div>

            <Select
              value={planStatus ?? ""}
              onValueChange={(value) => {
                if (
                  value === "active" ||
                  value === "completed" ||
                  value === "cancelled" ||
                  value === "paused" ||
                  value === "overdue"
                ) {
                  setPlanStatus(value as PlanStatusType);
                } else {
                  setPlanStatus(null);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>

            <PaymentPlanDialog
              mode="create"
              pledgeId={pledgeId ?? undefined}
              contactId={contactId}
              showPledgeSelector={!pledgeId}
              onSuccess={handleSuccess}
            />
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="font-semibold text-gray-900">Pledge Date</TableHead>
                  <TableHead className="font-semibold text-gray-900">Pledge Detail</TableHead>
                  <TableHead className="font-semibold text-gray-900">1st Inst</TableHead>
                  <TableHead className="font-semibold text-gray-900">Next Inst</TableHead>
                  <TableHead className="font-semibold text-gray-900">Last Inst</TableHead>
                  <TableHead className="font-semibold text-gray-900">Applied Pledge Amount</TableHead>
                  <TableHead className="font-semibold text-gray-900">Paid USD</TableHead>
                  <TableHead className="font-semibold text-gray-900">Paid</TableHead>
                  <TableHead className="font-semibold text-gray-900">Balance</TableHead>
                  
                  <TableHead className="font-semibold text-gray-900">Status</TableHead>
                </TableRow> 
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: currentLimit }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 11 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.paymentPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                      No payment plans found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.paymentPlans.map((plan: any) => {
                    // Get the correct currency for pledge vs plan
                    const pledgeCurrency = plan.currency;
                    const planCurrency = plan.currency;

                    // Get pledge original amount (this should be the full pledge amount)
                    const pledgeOriginalAmount = plan.totalPlannedAmount;

                    // Calculate USD amounts with corrected logic
                    const totalPlannedUSD = getUSDAmount(
                      plan.totalPlannedAmount,
                      plan.totalPlannedAmountUsd,
                      plan.exchangeRate,
                      planCurrency
                    );
                    const totalPaidUSD = getUSDAmount(
                      plan.totalPaid,
                      plan.totalPaidUsd,
                      plan.exchangeRate,
                      planCurrency
                    );

                    // Calculate remaining amount correctly
                    const remainingAmount = plan.remainingAmount || (
                      Number(plan.totalPlannedAmount || 0) - Number(plan.totalPaid || 0)
                    ).toString();

                    const remainingUSD = planCurrency === 'USD'
                      ? remainingAmount
                      : convertToUSD(remainingAmount, plan.exchangeRate) || '0';

                    // Calculate unscheduled amount (difference between pledge and planned)
                    const unscheduledAmount = (
                      Number(pledgeOriginalAmount || 0) - Number(plan.totalPlannedAmount || 0)
                    ).toString();

                    return (
                      <React.Fragment key={plan.id}>
                        <TableRow className="hover:bg-gray-50">
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRowExpansion(plan.id)}
                              className="p-1"
                            >
                              {expandedRows.has(plan.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>

                          {/* Pledge Date */}
                          <TableCell className="font-medium">
                            {formatDate(plan.pledge?.pledgeDate || plan.pledgeDate || plan.startDate)}
                          </TableCell>

                          {/* Pledge Detail */}
                          <TableCell>{plan.pledge?.description || plan.pledgeDescription || plan.planName || "N/A"}</TableCell>

                          {/* 1st Inst */}
                          <TableCell>{getFirstInstallmentDate(plan)}</TableCell>

                          {/* Next Inst */}
                          <TableCell>{formatDate(plan.nextPaymentDate)}</TableCell>

                          {/* Last Inst */}
                          <TableCell>{getLastInstallmentDate(plan)}</TableCell>

                          {/* Pledge Amount (original pledge amount in pledge currency) */}
                          <TableCell>
                            {displayAmountWithUSD(
                              pledgeOriginalAmount,
                              pledgeCurrency,
                              plan.exchangeRate,
                              true
                            )}
                          </TableCell>

                          {/* Paid USD */}
                          <TableCell>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500">$</span>
                              <span>{formatCurrency(totalPaidUSD, "USD").amount}</span>
                            </div>
                          </TableCell>

                          {/* Paid (in plan currency) */}
                          <TableCell>
                            {displayAmountWithUSD(plan.totalPaid || "0", planCurrency, plan.exchangeRate)}
                          </TableCell>

                          {/* Balance (remaining in plan currency) */}
                          <TableCell>
                            {displayAmountWithUSD(remainingAmount, planCurrency, plan.exchangeRate)}
                          </TableCell>

                          

                          {/* Status */}
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(plan.planStatus)}`}>
                              {plan.planStatus || 'active'}
                            </span>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row Content */}
                        {expandedRows.has(plan.id) && (
                          <TableRow>
                            <TableCell colSpan={11} className="bg-gray-50 p-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Column 1: Schedule */}
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-gray-900">Schedule</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Frequency:</span>
                                      <span className="font-medium capitalize">{plan.frequency || "N/A"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Total Installments:</span>
                                      <span className="font-medium">{plan.numberOfInstallments || "N/A"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Installments Paid:</span>
                                      <span className="font-medium">{plan.installmentsPaid || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Installments Remaining:</span>
                                      <span className="font-medium">{getInstallmentsRemaining(plan)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Next Payment:</span>
                                      <span className="font-medium">{formatDate(plan.nextPaymentDate)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Column 2: Financial Details */}
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-gray-900">Financial Details</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Total Planned ({planCurrency}):</span>
                                      <span className="font-medium">{formatCurrency(plan.totalPlannedAmount || "0", planCurrency).symbol}{formatCurrency(plan.totalPlannedAmount || "0", planCurrency).amount}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Total Planned (USD):</span>
                                      <span className="font-medium">${formatCurrency(convertToUSD(plan.totalPlannedAmount || "0", plan.exchangeRate) || "0", "USD").amount}</span>
                                    </div>
                                    {/* FIXED: Use calculated installment amount */}
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Installment Amount:</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const calculatedAmount = calculateInstallmentAmount(plan);
                                          const formatted = formatCurrency(calculatedAmount, planCurrency);
                                          return `${formatted.symbol}${formatted.amount}`;
                                        })()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Exchange Rate:</span>
                                      <span className="font-medium">{formatExchangeRate(plan.exchangeRate, planCurrency)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Column 3: Additional Details */}
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-gray-900">Additional Details</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Distribution Type:</span>
                                      <span className="font-medium capitalize">{plan.distributionType || "fixed"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Auto Renew:</span>
                                      <span className="font-medium">{plan.autoRenew ? "Yes" : "No"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Created:</span>
                                      <span className="font-medium">{formatDate(plan.createdAt)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Last Updated:</span>
                                      <span className="font-medium">{formatDate(plan.updatedAt)}</span>
                                    </div>
                                    {plan.notes && (
                                      <div>
                                        <span className="text-gray-600">Notes:</span>
                                        <p className="mt-1 text-gray-900 text-sm">{plan.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Quick Actions */}
                              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                                <PaymentPlanDialog
                                  mode="edit"
                                  paymentPlanId={plan.id}
                                  pledgeId={plan.pledgeId}
                                  onSuccess={handleSuccess}
                                  trigger={
                                    <Button size="sm" variant="outline">
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit Plan
                                    </Button>
                                  }
                                />

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      disabled={deletePaymentPlanMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Plan
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payment Plan</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this payment plan? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeletePaymentPlan(plan.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={deletePaymentPlanMutation.isPending}
                                      >
                                        {deletePaymentPlanMutation.isPending ? "Deleting..." : "Delete Plan"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleRowExpansion(plan.id)}
                                >
                                  Collapse
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.paymentPlans.length > 0 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * currentLimit + 1} to{" "}
                {Math.min(currentPage * currentLimit, data.paymentPlans.length)}{" "}
                of {data.paymentPlans.length} payment plans
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">Page {currentPage}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={data.paymentPlans.length < currentLimit}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
