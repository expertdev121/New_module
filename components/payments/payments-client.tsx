"use client";

import React, { useState, Dispatch, SetStateAction } from "react";
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

import {
  Search,
  BadgeDollarSignIcon,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  Calendar,
  CreditCard,
  Split,
  Users,
  ArrowRight,
} from "lucide-react";
import {
  useDeletePaymentMutation,
  usePaymentsQuery,
  Payment as ApiPayment,
} from "@/lib/query/payments/usePaymentQuery";
import { LinkButton } from "../ui/next-link";
import FactsDialog from "../facts-iframe";
import PaymentFormDialog from "../forms/payment-dialog";
import EditPaymentDialog from "@/app/contacts/[contactId]/payments/__components/edit-payment";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { usePledgeByIdQuery } from "@/lib/query/pledge/usePledgeQuery";
import { Badge } from "@/components/ui/badge";

const PaymentStatusEnum = z.enum([
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "processing",
  "expected",
]);

type PaymentStatusType = z.infer<typeof PaymentStatusEnum>;

// *************************
// ***** DATE FORMATTER ****
// *************************
function displayDate_DDMMMYYYY(dateString: string | null | undefined): string {
  if (!dateString || dateString.trim() === "" || dateString === "0000-00-00" || dateString === "1970-01-01")
    return "Unscheduled";
  let d = new Date(dateString);
  if (isNaN(d.getTime())) {
    const parts = typeof dateString === "string" ? dateString.split("-") : [];
    if (parts.length === 3) {
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }
  if (isNaN(d.getTime())) return "-";
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Define the expected Payment type for EditPaymentDialog
interface EditPayment extends Omit<ApiPayment, "allocations"> {
  contactId?: number;
  allocations: EditAllocation[];
}

interface EditAllocation {
  id: number;
  paymentId: number;
  pledgeId: number;
  installmentScheduleId: number | null;
  allocatedAmount: string;
  currency: string;
  allocatedAmountUsd: string | undefined;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  pledge?: {
    id: number;
    contactId: number;
    campaignId?: number;
    currency: string;
  };
  pledgeDescription?: string;
}

interface PaymentsTableProps {
  contactId?: number;
}

export default function PaymentsTable({ contactId }: PaymentsTableProps) {
  const [selectedPayment, setSelectedPayment] = useState<EditPayment | null>(
    null
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(
    null
  );
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Type conversion function to transform ApiPayment to EditPayment
  const convertToEditPayment = (apiPayment: ApiPayment): EditPayment => {
    return {
      ...apiPayment,
      contactId: contactId,
      allocations:
        apiPayment.allocations?.map((allocation) => ({
          ...allocation,
          allocatedAmount: allocation.allocatedAmount.toString(),
          notes: allocation.notes === undefined ? null : allocation.notes,
        })) || [],
    };
  };

  const handleOpenChangeEditDialog = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setTimeout(() => setSelectedPayment(null), 300);
    }
  };

  const formatUSDAmount = (amount: string | null | undefined) => {
    if (!amount) return "$0.00";
    const value = Number.parseFloat(amount) || 0;
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Split Payment Badge Component
  const SplitPaymentBadge = ({ payment }: { payment: ApiPayment }) => {
    if (!payment.isSplitPayment) return null;

    // Check if it's a multi-contact payment by looking at unique contact IDs in allocations
    const uniqueContacts = new Set(payment.allocations?.map(a => a.pledgeOwnerName).filter(Boolean));
    const isMultiContact = uniqueContacts.size > 1;

    return (
      <Badge variant="outline" className={isMultiContact ? "bg-green-50 text-green-700 border-green-200" : "bg-purple-50 text-purple-700 border-purple-200"}>
        {isMultiContact ? (
          <>
            <Users className="h-3 w-3 mr-1" />
            Multi-Contact ({payment.allocationCount})
          </>
        ) : (
          <>
            <Split className="h-3 w-3 mr-1" />
            Split ({payment.allocationCount})
          </>
        )}
      </Badge>
    );
  };

  // Payment Plan Badge Component
  const PaymentPlanBadge = ({ payment }: { payment: ApiPayment }) => {
    if (!payment.paymentPlanId) return null;

    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        <Calendar className="h-3 w-3 mr-1" />
        Plan #{payment.paymentPlanId}
      </Badge>
    );
  };

  // Payment Type Indicator with Plan Badge
  const PaymentTypeIndicator = ({ payment }: { payment: ApiPayment }) => {
    if (payment.isSplitPayment) {
      // Check if it's multi-contact
      const uniqueContacts = new Set(payment.allocations?.map(a => a.pledgeOwnerName).filter(Boolean));
      const isMultiContact = uniqueContacts.size > 1;

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-green-600">
            {isMultiContact ? <Users className="h-4 w-4" /> : <Split className="h-4 w-4" />}
            <span className="text-xs font-medium">{isMultiContact ? "Multi" : "Split"}</span>
          </div>
          <SplitPaymentBadge payment={payment} />
        </div>
      );
    }

    if (payment.paymentPlanId) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-blue-600">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium">Planned</span>
          </div>
          <PaymentPlanBadge payment={payment} />
        </div>
      );
    }

    // Check for third party payments
    if (payment.isThirdPartyPayment) {
      return (
        <div className="flex items-center gap-1 text-orange-600">
          <Users className="h-4 w-4" />
          <span className="text-xs font-medium">Third Party</span>
        </div>
      );
    }

    // Default to direct
    return (
      <div className="flex items-center gap-1 text-green-600">
        <CreditCard className="h-4 w-4" />
        <span className="text-xs font-medium">Direct</span>
      </div>
    );
  };


  // Payment Status Badge Component
  const PaymentStatusBadge = ({ status }: { status: string }) => {
    const statusClass = getStatusBadgeColor(status);
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);

    return (
      <Badge variant="outline" className={`${statusClass} font-medium`}>
        {statusText}
      </Badge>
    );
  };

  // Updated Third Party Badge - now shows "Paid By"
  const PaidByBadge = ({ payment }: { payment: ApiPayment }) => {
    if (!payment.isThirdPartyPayment) {
      return <span className="text-gray-400">-</span>;
    }

    return (
      <div className="flex flex-col items-center gap-1">
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
          <Users className="h-3 w-3 mr-1" />
          Paid By
        </Badge>
        {payment.payerContactName && (
          <span className="text-xs text-gray-600 max-w-20 truncate" title={payment.payerContactName}>
            {payment.payerContactName}
          </span>
        )}
      </div>
    );
  };

  // Helper function to format dates with fallback for unscheduled
  const formatDateWithFallback = (
    date: string | null | undefined,
    fallbackText: string = "Unscheduled"
  ) => {
    if (!date || date.trim() === "" || date === "0000-00-00" || date === "1970-01-01") {
      return fallbackText;
    }
    return displayDate_DDMMMYYYY(date);
  };

  const [pledgeId] = useQueryState("pledgeId", {
    parse: (value) => {
      if (!value) return null;
      const parsed = Number.parseInt(value);
      return isNaN(parsed) ? null : parsed;
    },
    serialize: (value) =>
      value !== null && value !== undefined ? value.toString() : "",
  });

  const [page, setPage] = useQueryState("page", {
    parse: (value) => Number.parseInt(value) || 1,
    serialize: (value) => value.toString(),
  });

  const [limit] = useQueryState("limit", {
    parse: (value) => Number.parseInt(value) || 10,
    serialize: (value) => value.toString(),
  });

  const [search, setSearch] = useQueryState("search");

  const [paymentStatus, setPaymentStatus] = useQueryState<PaymentStatusType | null>("paymentStatus", {
    parse: (value) => {
      if (
        value === "pending" ||
        value === "completed" ||
        value === "failed" ||
        value === "cancelled" ||
        value === "refunded" ||
        value === "processing"
      ) {
        return value as PaymentStatusType;
      }
      return null;
    },
    serialize: (value) => value ?? "",
  });

  const currentPage = page ?? 1;
  const currentLimit = limit ?? 10;

  const queryParams = {
    ...(pledgeId ? { pledgeId } : contactId ? { contactId } : {}),
    page: currentPage,
    limit: currentLimit,
    search: search || undefined,
    paymentStatus: paymentStatus || undefined,
  };

  const { data, isLoading, error } = usePaymentsQuery(queryParams);
  const { data: pledgeData, isLoading: isPledgeLoading } = usePledgeByIdQuery(
    selectedPayment?.pledgeId ?? 0
  );

  const deletePaymentMutation = useDeletePaymentMutation();

  const handlePaymentRowClick = (payment: ApiPayment) => {
    const convertedPayment = convertToEditPayment(payment);
    setSelectedPayment(convertedPayment);
    setIsEditDialogOpen(true);
  };

  const toggleExpandedRow = (paymentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const handleDeletePayment = async (payment: ApiPayment) => {
    setDeletingPaymentId(payment.id);
    try {
      await deletePaymentMutation.mutateAsync({
        paymentId: payment.id,
      });
      toast.success(`Payment #${payment.id} deleted successfully`);
      setExpandedRows((prev) => {
        const newSet = new Set(prev);
        newSet.delete(payment.id);
        return newSet;
      });
    } catch (error) {
      console.error("Failed to delete payment:", error);
      toast.error(`Failed to delete payment #${payment.id}`);
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const formatCurrency = (amount: string, currency: string = "USD") => {
    try {
      const value = Number.parseFloat(amount) || 0;
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

      const currencySymbol = formatted.replace(/[\d,.\s]/g, "");
      const numericAmount = formatted.replace(/[^\d,.\s]/g, "").trim();

      return { symbol: currencySymbol, amount: numericAmount };
    } catch (error) {
      return { symbol: "$", amount: "Invalid" };
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "refunded":
        return "bg-orange-100 text-orange-800 border-orange-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Helper function to get applied amount in USD for this payment
  const getAppliedAmountUSD = (payment: ApiPayment) => {
    if (payment.isSplitPayment && payment.allocations) {
      // For split payments, sum all allocated amounts in USD
      const totalUSD = payment.allocations.reduce((sum, allocation) => {
        return sum + parseFloat(allocation.allocatedAmountUsd || "0");
      }, 0);
      return totalUSD.toString();
    }
    // For non-split payments, use the payment's USD amount
    return payment.amountUsd || "0";
  };

  // Updated helper function to get applied amount in pledge currency for multi-currency support
  const getAppliedAmountPledgeCurrency = (payment: ApiPayment) => {
    if (payment.isSplitPayment && payment.allocations) {
      // For split payments with multiple currencies, return array of amounts per currency
      const currencyGroups = payment.allocations.reduce((acc, allocation) => {
        const pledgeCurrency = allocation.pledge?.currency || allocation.pledgeCurrency || 'USD';
        const amount = parseFloat(allocation.allocatedAmountInPledgeCurrency?.toString() || '0');

        if (acc[pledgeCurrency]) {
          acc[pledgeCurrency] += amount;
        } else {
          acc[pledgeCurrency] = amount;
        }

        return acc;
      }, {} as Record<string, number>);

      // Return formatted string for multiple currencies
      const currencies = Object.keys(currencyGroups);
      if (currencies.length === 1) {
        // Single currency - return as before
        const currency = currencies[0];
        return {
          amount: currencyGroups[currency].toString(),
          currency: currency,
          isMultiCurrency: false
        };
      } else {
        // Multiple currencies - return combined display
        const formattedAmounts = currencies.map(currency => {
          const formatted = formatCurrency(currencyGroups[currency].toString(), currency);
          return `${formatted.symbol}${formatted.amount}`;
        }).join(' + ');

        return {
          amount: formattedAmounts,
          currency: 'MULTI',
          isMultiCurrency: true
        };
      }
    }

    // For non-split payments, use the payment's amountInPledgeCurrency and pledgeOriginalCurrency
    return {
      amount: payment.amountInPledgeCurrency || payment.amount,
      currency: payment.pledgeOriginalCurrency || payment.currency,
      isMultiCurrency: false
    };
  };

  // Helper function to format method detail with proper capitalization
  const formatMethodDetail = (methodDetail: string | null | undefined) => {
    if (!methodDetail) return "N/A";
    return methodDetail.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Helper function to format payment method with proper capitalization and fallback
  const formatPaymentMethod = (paymentMethod: string | null | undefined) => {
    if (!paymentMethod || paymentMethod.trim() === "") return "Not Specified";
    return paymentMethod.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (error) {
    return (
      <Alert className="mx-4 my-6">
        <AlertDescription>
          Failed to load payments data. Please try again later.
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
      {/* Edit Payment Dialog */}
      {selectedPayment && (
        <EditPaymentDialog
          open={isEditDialogOpen}
          onOpenChange={handleOpenChangeEditDialog}
          payment={selectedPayment}
        />
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search payments..."
                value={search || ""}
                onChange={(e) => setSearch(e.target.value || null)}
                className="pl-10"
              />
            </div>

            <Select
              value={paymentStatus ?? "all"}
              onValueChange={(value) => {
                if (
                  value === "pending" ||
                  value === "completed" ||
                  value === "failed" ||
                  value === "cancelled" ||
                  value === "refunded" ||
                  value === "processing"
                ) {
                  setPaymentStatus(value as PaymentStatusType);
                } else {
                  setPaymentStatus(null);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>

            <PaymentFormDialog
              pledgeId={pledgeId ?? undefined}
              contactId={contactId}
              showPledgeSelector={true}
              amount={0}
              currency="USD"
              description=""
            />
            <FactsDialog />
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold text-gray-900">
                    Type
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Paid By
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Scheduled
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Effective
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Applied: USD Currency
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Applied: Plg Currency
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Applied: Payment Currency
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Payment Method
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Method Detail
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Check Number
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900">
                    Notes
                  </TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: currentLimit }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 13 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.payments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="text-center py-8 text-gray-500"
                    >
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.payments.map((payment) => (
                    <React.Fragment key={payment.id}>
                      <TableRow
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handlePaymentRowClick(payment)}
                      >
                        <TableCell>
                          <PaymentTypeIndicator payment={payment} />
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={payment.paymentStatus} />
                        </TableCell>
                        <TableCell className="text-center">
                          <PaidByBadge payment={payment} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatDateWithFallback(payment.paymentDate)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatDateWithFallback(
                            payment.receivedDate,
                            "Not Received"
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            ${formatUSDAmount(getAppliedAmountUSD(payment))}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const appliedAmount = getAppliedAmountPledgeCurrency(payment);
                            if (appliedAmount.isMultiCurrency) {
                              return (
                                <span className="font-medium text-sm">
                                  {appliedAmount.amount}
                                </span>
                              );
                            } else {
                              const formatted = formatCurrency(appliedAmount.amount, appliedAmount.currency);
                              return (
                                <span className="font-medium">
                                  {formatted.symbol}{formatted.amount}
                                </span>
                              );
                            }
                          })()}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {(() => {
                              if (payment.isSplitPayment && payment.allocations) {
                                // Sum all allocated amounts in payment currency
                                const totalPaymentCurrency = payment.allocations.reduce((sum, allocation) => {
                                  return sum + parseFloat(allocation.allocatedAmount.toString());
                                }, 0);
                                return formatCurrency(totalPaymentCurrency.toString(), payment.currency).symbol + formatCurrency(totalPaymentCurrency.toString(), payment.currency).amount;
                              }
                              // For non-split payments, use the payment amount and currency
                              return formatCurrency(payment.amount, payment.currency).symbol + formatCurrency(payment.amount, payment.currency).amount;
                            })()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-gray-900">
                            {formatPaymentMethod(payment.paymentMethod)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-700">
                            {formatMethodDetail(payment.methodDetail)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-700">
                            {payment.referenceNumber ||
                              payment.checkNumber ||
                              "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-700">
                            {payment.notes || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => toggleExpandedRow(payment.id, e)}
                            className="p-1 h-6 w-6"
                          >
                            {expandedRows.has(payment.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Row Content */}
                      {expandedRows.has(payment.id) && (
                        <TableRow>
                          <TableCell colSpan={13} className="bg-gray-50 p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Column 1: Payment Details */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-gray-900">
                                  Payment Details
                                </h4>
                                <div className="space-y-2 text-sm">
                                  {/* Third Party Payment info - Enhanced */}
                                  {payment.isThirdPartyPayment && (
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                          <Users className="h-3 w-3 mr-1" />
                                          Third Party Payment
                                        </Badge>
                                      </div>
                                      <div className="space-y-1 text-xs">
                                        {payment.payerContactName && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-orange-700 font-medium">Paid By:</span>
                                            <span className="text-orange-800">{payment.payerContactName}</span>
                                          </div>
                                        )}
                                        {payment.pledgeOwnerName && !payment.isSplitPayment && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-orange-700 font-medium">Paid For:</span>
                                            <span className="text-orange-800">{payment.pledgeOwnerName}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Status:
                                    </span>
                                    <PaymentStatusBadge status={payment.paymentStatus} />
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Scheduled Date:
                                    </span>
                                    <span className="font-medium">
                                      {formatDateWithFallback(payment.paymentDate)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Effective Date:
                                    </span>
                                    <span className="font-medium">
                                      {formatDateWithFallback(
                                        payment.receivedDate,
                                        "Not Received"
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Amount ({payment.currency}):
                                    </span>
                                    <span className="font-medium">
                                      {
                                        formatCurrency(
                                          payment.amount,
                                          payment.currency
                                        ).symbol
                                      }
                                      {
                                        formatCurrency(
                                          payment.amount,
                                          payment.currency
                                        ).amount
                                      }
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Amount (USD):
                                    </span>
                                    <span className="font-medium">
                                      ${formatUSDAmount(payment.amountUsd)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {/* Column 2: Receipt/Method Information */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-gray-900">
                                  Payment Method & Receipt
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Method:
                                    </span>
                                    <span className="font-medium">
                                      {formatPaymentMethod(payment.paymentMethod)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Method Detail:
                                    </span>
                                    <span className="font-medium">
                                      {formatMethodDetail(payment.methodDetail)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Account:
                                    </span>
                                    <span className="font-medium">
                                      {payment.account || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Check Number:
                                    </span>
                                    <span className="font-medium">
                                      {payment.checkNumber || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Receipt Issued:
                                    </span>
                                    <span className={`font-medium ${payment.receiptIssued
                                      ? "text-green-600"
                                      : "text-red-600"
                                      }`}
                                    >
                                      {payment.receiptIssued ? "Yes" : "No"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {/* Column 3: Campaign/Solicitor/IDs */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-gray-900">
                                  Additional Information
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Solicitor:
                                    </span>
                                    <span className="font-medium">
                                      {payment.solicitorName || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Payment ID:
                                    </span>
                                    <span className="font-medium">
                                      #{payment.id}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      Plan ID:
                                    </span>
                                    <span className="font-medium">
                                      {payment.paymentPlanId ? `#${payment.paymentPlanId}` : "N/A"}
                                    </span>
                                  </div>
                                  {payment.bonusAmount && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">
                                        Bonus Amount:
                                      </span>
                                      <span className="font-medium text-green-600">
                                        ${formatUSDAmount(payment.bonusAmount)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Enhanced Split Payment Allocations Section */}
                            {payment.isSplitPayment && payment.allocations && payment.allocations.length > 0 && (
                              <div className="mt-6 pt-4 border-t">
                                {(() => {
                                  // Check if it's multi-contact by unique pledge owners
                                  const uniqueContacts = new Set(payment.allocations?.map(a => a.pledgeOwnerName).filter(Boolean));
                                  const isMultiContact = uniqueContacts.size > 1;

                                  return (
                                    <>
                                      <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        {isMultiContact ? (
                                          <>
                                            <Users className="h-4 w-4 text-green-600" />
                                            <span className="text-green-600">Multi-Contact Payment Allocations</span>
                                          </>
                                        ) : (
                                          <>
                                            <Split className="h-4 w-4 text-purple-600" />
                                            <span className="text-purple-600">Split Payment Allocations</span>
                                          </>
                                        )}
                                        <Badge variant="outline" className={isMultiContact ? "bg-green-50 text-green-700 border-green-200" : "bg-purple-50 text-purple-700 border-purple-200"}>
                                          {payment.allocations.length} allocations
                                        </Badge>
                                      </h4>

                                      {/* Summary for multi-contact payments */}
                                      {isMultiContact && payment.isThirdPartyPayment && (
                                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                          <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                              <ArrowRight className="h-4 w-4 text-blue-600" />
                                              <span className="font-medium text-blue-800">
                                                {payment.payerContactName || "Unknown"} paid for {uniqueContacts.size} people&apos;s pledges
                                              </span>
                                            </div>
                                            <span className="text-blue-700 font-medium">
                                              Total: {formatCurrency(payment.amount, payment.currency).symbol}
                                              {formatCurrency(payment.amount, payment.currency).amount}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-3">
                                        {payment.allocations.map((allocation, index) => (
                                          <div
                                            key={allocation.id || index}
                                            className="bg-white p-4 rounded-lg border border-gray-200 hover:border-purple-200 transition-colors"
                                          >
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                              {/* Pledge Information */}
                                              <div>
                                                <h5 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                                                  <Badge variant="outline" className="text-xs">
                                                    #{allocation.pledgeId}
                                                  </Badge>
                                                  Pledge
                                                </h5>
                                                <p className="text-sm text-gray-600 mb-2">
                                                  {allocation.pledgeDescription || "No description"}
                                                </p>
                                                {allocation.pledgeOwnerName && (
                                                  <div className="flex items-center gap-1 text-xs">
                                                    <Users className="h-3 w-3 text-gray-400" />
                                                    <span className="text-gray-500">Owner:</span>
                                                    <span className="font-medium text-gray-700">{allocation.pledgeOwnerName}</span>
                                                  </div>
                                                )}
                                                {allocation.installmentScheduleId && (
                                                  <p className="text-xs text-blue-600 mt-1">
                                                    Installment #{allocation.installmentScheduleId}
                                                  </p>
                                                )}
                                              </div>

                                              {/* Amount Information */}
                                              <div>
                                                <h6 className="font-medium text-gray-800 mb-2 text-sm">Amounts</h6>
                                                <div className="space-y-1">
                                                  <div className="flex justify-between text-xs">
                                                    <span className="text-gray-600">Allocated:</span>
                                                    <span className="font-medium">
                                                      {formatCurrency(allocation.allocatedAmount.toString(), allocation.currency).symbol}
                                                      {formatCurrency(allocation.allocatedAmount.toString(), allocation.currency).amount}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between text-xs">
                                                    <span className="text-gray-600">USD:</span>
                                                    <span className="font-medium">
                                                      ${formatUSDAmount(allocation.allocatedAmountUsd)}
                                                    </span>
                                                  </div>
                                                  {allocation.allocatedAmountInPledgeCurrency && (
                                                    <div className="flex justify-between text-xs">
                                                      <span className="text-gray-600">Pledge Currency:</span>
                                                      <span className="font-medium">
                                                        {(() => {
                                                          const pledgeCurrency = allocation.pledge?.currency || allocation.pledgeCurrency || 'USD';
                                                          const formatted = formatCurrency(
                                                            allocation.allocatedAmountInPledgeCurrency.toString(),
                                                            pledgeCurrency
                                                          );
                                                          return `${formatted.symbol}${formatted.amount}`;
                                                        })()}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Receipt Information */}
                                              <div>
                                                <h6 className="font-medium text-gray-800 mb-2 text-sm">Receipt</h6>
                                                <div className="space-y-1 text-xs">
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">Number:</span>
                                                    <span className="font-medium">
                                                      {allocation.receiptNumber || "N/A"}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">Type:</span>
                                                    <span className="font-medium">
                                                      {allocation.receiptType || "N/A"}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">Issued:</span>
                                                    <span className={`font-medium ${allocation.receiptIssued ? "text-green-600" : "text-red-600"}`}>
                                                      {allocation.receiptIssued ? "Yes" : "No"}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Notes */}
                                              <div>
                                                {allocation.notes && (
                                                  <div>
                                                    <h6 className="font-medium text-gray-800 mb-2 text-sm">Notes</h6>
                                                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                                                      {allocation.notes}
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Updated Allocation Summary */}
                                      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                          <div>
                                            <span className="text-gray-600">Total Allocations:</span>
                                            <div className="font-medium">{payment.allocations.length}</div>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Total Amount:</span>
                                            <div className="font-medium">
                                              {formatCurrency(payment.amount, payment.currency).symbol}
                                              {formatCurrency(payment.amount, payment.currency).amount}
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Total USD:</span>
                                            <div className="font-medium">${formatUSDAmount(payment.amountUsd)}</div>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Pledge Currencies:</span>
                                            <div className="font-medium text-purple-600">
                                              {(() => {
                                                const currencies = [...new Set(payment.allocations.map(a =>
                                                  a.pledge?.currency || a.pledgeCurrency || 'USD'
                                                ))];
                                                return currencies.length > 1 ? `${currencies.length} currencies` : currencies[0];
                                              })()}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Notes */}
                            {payment.notes && (
                              <div className="mt-6 pt-4 border-t">
                                <h4 className="font-semibold text-gray-900 mb-2">
                                  Payment Notes
                                </h4>
                                <p className="text-sm text-gray-700 bg-white p-3 rounded border">
                                  {payment.notes}
                                </p>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="mt-6 pt-4 flex justify-end gap-2 border-t">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={deletingPaymentId === payment.id}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 bg-transparent"
                                  >
                                    {deletingPaymentId === payment.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Payment
                                      </>
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Payment #{payment.id}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this payment? This action cannot be undone.
                                      {payment.isSplitPayment && (
                                        <>
                                          <br />
                                          <br />
                                          <strong className="text-red-600">Warning:</strong> This is a split payment
                                          affecting {payment.allocationCount} pledges. All allocations will be removed.
                                        </>
                                      )}
                                      {payment.isThirdPartyPayment && (
                                        <>
                                          <br />
                                          <br />
                                          <strong className="text-blue-600">Note:</strong> This is a third-party payment
                                          {payment.payerContactName && ` made by ${payment.payerContactName}`}
                                          {payment.pledgeOwnerName && !payment.isSplitPayment && ` for ${payment.pledgeOwnerName}`}.
                                        </>
                                      )}
                                      <br />
                                      <br />
                                      <strong>Payment Details:</strong>
                                      <br />
                                      Payment ID: #{payment.id}
                                      <br />
                                      {payment.paymentPlanId && (
                                        <>
                                          Payment Plan ID: #{payment.paymentPlanId}
                                          <br />
                                        </>
                                      )}
                                      Amount:{" "}
                                      {formatCurrency(payment.amount, payment.currency).symbol}
                                      {formatCurrency(payment.amount, payment.currency).amount}
                                      <br />
                                      Date: {formatDateWithFallback(payment.paymentDate)}
                                      <br />
                                      Status: {payment.paymentStatus}
                                      <br />
                                      Type: {payment.isSplitPayment
                                        ? (() => {
                                          const uniqueContacts = new Set(payment.allocations?.map(a => a.pledgeOwnerName).filter(Boolean));
                                          return uniqueContacts.size > 1 ? "Multi-Contact Payment" : "Split Payment";
                                        })()
                                        : payment.paymentPlanId
                                          ? "Planned Payment"
                                          : "Direct Payment"}
                                      {payment.isThirdPartyPayment && " (Third Party)"}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeletePayment(payment)
                                      }
                                      className="bg-red-600 hover:bg-red-700"
                                      disabled={deletingPaymentId === payment.id}
                                    >
                                      {deletingPaymentId === payment.id ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete Payment"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <LinkButton
                                variant="secondary"
                                href={`/contacts/${contactId}/payment-plans`}
                                className="flex items-center gap-2"
                              >
                                <BadgeDollarSignIcon className="h-4 w-4" />
                                Payment Plans
                              </LinkButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Updated Pagination */}
          {data && data.pagination && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-600">
                Showing {(data.pagination.page - 1) * data.pagination.limit + 1}{" "}
                to{" "}
                {Math.min(
                  data.pagination.page * data.pagination.limit,
                  data.pagination.totalCount
                )}{" "}
                of {data.pagination.totalCount} payments
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={!data.pagination.hasPreviousPage}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={!data.pagination.hasNextPage}
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
