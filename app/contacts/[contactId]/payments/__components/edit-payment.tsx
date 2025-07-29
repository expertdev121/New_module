/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronsUpDown, Edit, Users, Split } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExchangeRates } from "@/lib/query/useExchangeRates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUpdatePaymentMutation } from "@/lib/query/payments/usePaymentQuery";
import { usePledgeDetailsQuery } from "@/lib/query/payment-plans/usePaymentPlanQuery";

interface Solicitor {
  id: number;
  firstName: string;
  lastName: string;
  commissionRate: number;
  contact: any;
}

interface Allocation {
  id?: number;
  pledgeId: number;
  allocatedAmount: string;
  notes: string | null;
  installmentScheduleId?: number | null;
  currency?: string;
  allocatedAmountUsd?: string | null;
  pledgeDescription?: string;
}

interface Payment {
  id: number;
  pledgeId: number | null; 
  contactId?: number;
  amount: string;
  currency: string;
  amountUsd: string | null;
  amountInPledgeCurrency: string | null;
  exchangeRate: string | null;
  paymentDate: string;
  receivedDate: string | null;
  paymentMethod: string;
  methodDetail: string | null;
  paymentStatus: string;
  referenceNumber: string | null;
  checkNumber: string | null;
  receiptNumber: string | null;
  receiptType: string | null;
  receiptIssued: boolean;
  solicitorId: number | null;
  bonusPercentage: string | null;
  bonusAmount: string | null;
  bonusRuleId: number | null;
  notes: string | null;
  paymentPlanId: number | null;
  isSplitPayment?: boolean;
  allocationCount?: number;
  allocations?: Allocation[];
  solicitorName?: string | null;
  pledgeDescription?: string | null;
  installmentScheduleId?: number | null;
}

const useSolicitors = (params: { search?: string; status?: "active" | "inactive" | "suspended"; } = {}) => {
  return useQuery<{ solicitors: Solicitor[] }>({
    queryKey: ["solicitors", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.status) searchParams.set("status", params.status);

      const response = await fetch(`/api/solicitor?${searchParams}`);
      if (!response.ok) throw new Error("Failed to fetch solicitors");
      return response.json();
    },
  });
};

const supportedCurrencies = [
  "USD",
  "ILS",
  "EUR",
  "JPY",
  "GBP",
  "AUD",
  "CAD",
  "ZAR",
] as const;

const paymentMethods = [
  { value: "ach", label: "ACH" },
  { value: "bill_pay", label: "Bill Pay" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit", label: "Credit" },
  { value: "credit_card", label: "Credit Card" },
  { value: "expected", label: "Expected" },
  { value: "goods_and_services", label: "Goods and Services" },
  { value: "matching_funds", label: "Matching Funds" },
  { value: "money_order", label: "Money Order" },
  { value: "p2p", label: "P2P" },
  { value: "pending", label: "Pending" },
  { value: "refund", label: "Refund" },
  { value: "scholarship", label: "Scholarship" },
  { value: "stock", label: "Stock" },
  { value: "student_portion", label: "Student Portion" },
  { value: "unknown", label: "Unknown" },
  { value: "wire", label: "Wire" },
  { value: "xfer", label: "Xfer" },
  { value: "other", label: "Other" },
] as const;

const methodDetails = [
  { value: "achisomoch", label: "Achisomoch" },
  { value: "authorize", label: "Authorize" },
  { value: "bank_of_america_charitable", label: "Bank of America Charitable" },
  { value: "banquest", label: "Banquest" },
  { value: "banquest_cm", label: "Banquest CM" },
  { value: "benevity", label: "Benevity" },
  { value: "chai_charitable", label: "Chai Charitable" },
  { value: "charityvest_inc", label: "Charityvest Inc." },
  { value: "cjp", label: "CJP" },
  { value: "donors_fund", label: "Donors' Fund" },
  { value: "earthport", label: "EarthPort" },
  { value: "e_transfer", label: "e-transfer" },
  { value: "facts", label: "FACTS" },
  { value: "fidelity", label: "Fidelity" },
  { value: "fjc", label: "FJC" },
  { value: "foundation", label: "Foundation" },
  { value: "goldman_sachs", label: "Goldman Sachs" },
  { value: "htc", label: "HTC" },
  { value: "jcf", label: "JCF" },
  { value: "jcf_san_diego", label: "JCF San Diego" },
  { value: "jgive", label: "Jgive" },
  { value: "keshet", label: "Keshet" },
  { value: "masa", label: "MASA" },
  { value: "masa_old", label: "MASA Old" },
  { value: "matach", label: "Matach" },
  { value: "matching_funds", label: "Matching Funds" },
  { value: "mizrachi_canada", label: "Mizrachi Canada" },
  { value: "mizrachi_olami", label: "Mizrachi Olami" },
  { value: "montrose", label: "Montrose" },
  { value: "morgan_stanley_gift", label: "Morgan Stanley Gift" },
  { value: "ms", label: "MS" },
  { value: "mt", label: "MT" },
  { value: "ojc", label: "OJC" },
  { value: "paypal", label: "PayPal" },
  { value: "pelecard", label: "PeleCard (EasyCount)" },
  { value: "schwab_charitable", label: "Schwab Charitable" },
  { value: "stripe", label: "Stripe" },
  { value: "tiaa", label: "TIAA" },
  { value: "touro", label: "Touro" },
  { value: "uktoremet", label: "UKToremet (JGive)" },
  { value: "vanguard_charitable", label: "Vanguard Charitable" },
  { value: "venmo", label: "Venmo" },
  { value: "vmm", label: "VMM" },
  { value: "wise", label: "Wise" },
  { value: "worldline", label: "Worldline" },
  { value: "yaadpay", label: "YaadPay" },
  { value: "yaadpay_cm", label: "YaadPay CM" },
  { value: "yourcause", label: "YourCause" },
  { value: "yu", label: "YU" },
  { value: "zelle", label: "Zelle" },
] as const;

const paymentStatuses = [
  { value: "expected", label: "Expected" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "processing", label: "Processing" },
] as const;

const receiptTypes = [
  { value: "invoice", label: "Invoice" },
  { value: "confirmation", label: "Confirmation" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
] as const;

const editPaymentSchema = z.object({
  paymentId: z.number().positive(),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.enum([...supportedCurrencies] as [string, ...string[]]).optional(),
  amountUsd: z.number().positive("Amount in USD must be positive").optional(),
  amountInPledgeCurrency: z.number().positive("Amount in pledge currency must be positive").optional(),
  exchangeRate: z.number().positive("Exchange rate must be positive").optional(),

  paymentDate: z.string().min(1, "Payment date is required").optional(),
  receivedDate: z.string().optional().nullable(),
  methodDetail: z.string().optional().nullable(),
  paymentMethod: z.string().optional(),
  paymentStatus: z.string().optional(),

  referenceNumber: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.string().optional().nullable(),
  receiptIssued: z.boolean().optional(),

  solicitorId: z.number().positive("Solicitor ID must be positive").optional().nullable(),
  bonusPercentage: z.number().min(0).max(100).optional().nullable(),
  bonusAmount: z.number().min(0).optional().nullable(),
  bonusRuleId: z.number().positive("Bonus rule ID must be positive").optional().nullable(),
  notes: z.string().optional().nullable(),

  pledgeId: z.number().positive("Pledge ID must be positive").optional().nullable(),
  paymentPlanId: z.number().positive("Payment plan ID must be positive").optional().nullable(),
  isSplitPayment: z.boolean().optional(),
  allocations: z.array(z.object({
    id: z.number().optional(),
    pledgeId: z.number().positive(),
    allocatedAmount: z.number().positive("Amount must be positive"),
    notes: z.string().nullable(),
    currency: z.string().optional(),
  })).optional(),
}).refine((data) => {
  // Validate that total allocations equal payment amount for split payments
  if (data.isSplitPayment && data.allocations && data.amount) {
    const totalAllocated = data.allocations.reduce((sum, alloc) => 
      sum + alloc.allocatedAmount, 0
    );
    return Math.abs(totalAllocated - data.amount) < 0.01;
  }
  return true;
}, {
  message: "Total allocated amount must equal payment amount",
  path: ["allocations"]
});

type EditPaymentFormData = z.infer<typeof editPaymentSchema>;

interface EditPaymentDialogProps {
  payment: Payment & { contactId?: number }; 
  contactId?: number; 
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function EditPaymentDialog({
  payment,
  contactId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditPaymentDialogProps) {
  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
  } = useExchangeRates();
  const { data: solicitorsData } = useSolicitors({ status: "active" });

  const [internalOpen, setInternalOpen] = useState(false);
  const [showSolicitorSection, setShowSolicitorSection] = useState(
    !!payment.solicitorId
  );

  // Add state to track allocation changes
  const [editableAllocations, setEditableAllocations] = useState<Allocation[]>(
    payment.allocations || []
  );

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => { })) : setInternalOpen;

  const isPaymentPlanPayment = payment.paymentPlanId !== null;
  const isSplitPayment = payment.isSplitPayment || false;

  const { data: pledgeData } = usePledgeDetailsQuery(
    payment.pledgeId || 0,
    { enabled: !!payment.pledgeId && !isSplitPayment && !payment.pledgeDescription }
  );

  const form = useForm<EditPaymentFormData>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      paymentId: payment.id,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      amountUsd: payment.amountUsd ? parseFloat(payment.amountUsd) : undefined,
      amountInPledgeCurrency: payment.amountInPledgeCurrency ? parseFloat(payment.amountInPledgeCurrency) : undefined,
      exchangeRate: payment.exchangeRate ? parseFloat(payment.exchangeRate) : 1,
      paymentDate: payment.paymentDate,
      receivedDate: payment.receivedDate || null,
      paymentMethod: payment.paymentMethod,
      methodDetail: payment.methodDetail || null,
      paymentStatus: payment.paymentStatus,
      referenceNumber: payment.referenceNumber || null,
      checkNumber: payment.checkNumber || null,
      receiptNumber: payment.receiptNumber || null,
      receiptType: payment.receiptType || null,
      receiptIssued: payment.receiptIssued,
      solicitorId: payment.solicitorId || null,
      bonusPercentage: payment.bonusPercentage ? parseFloat(payment.bonusPercentage) : null,
      bonusAmount: payment.bonusAmount ? parseFloat(payment.bonusAmount) : null,
      bonusRuleId: payment.bonusRuleId || null,
      notes: payment.notes || null,
      pledgeId: payment.pledgeId || null,
      paymentPlanId: payment.paymentPlanId || null,
      isSplitPayment: isSplitPayment,
    },
  });

  const watchedCurrency = form.watch("currency");
  const watchedAmount = form.watch("amount");
  const watchedPaymentDate = form.watch("paymentDate");
  const watchedSolicitorId = form.watch("solicitorId");
  const watchedBonusPercentage = form.watch("bonusPercentage");
  const watchedExchangeRate = form.watch("exchangeRate");

  // Function to handle allocation amount changes
  const handleAllocationAmountChange = (allocationIndex: number, newAmount: number) => {
    setEditableAllocations(prev => 
      prev.map((allocation, index) => 
        index === allocationIndex 
          ? { ...allocation, allocatedAmount: newAmount.toString() }
          : allocation
      )
    );
  };

  // Function to handle allocation notes changes
  const handleAllocationNotesChange = (allocationIndex: number, newNotes: string) => {
    setEditableAllocations(prev => 
      prev.map((allocation, index) => 
        index === allocationIndex 
          ? { ...allocation, notes: newNotes }
          : allocation
      )
    );
  };

  // Function to calculate total allocated amount
  const getTotalAllocatedAmount = () => {
    return editableAllocations.reduce((total, allocation) => 
      total + parseFloat(allocation.allocatedAmount), 0
    );
  };

  // Function to check if allocations are valid
  const areAllocationsValid = () => {
    if (!isSplitPayment || !editableAllocations.length) return true;
    
    const totalAllocated = getTotalAllocatedAmount();
    const paymentAmount = watchedAmount || parseFloat(payment.amount);
    
    return Math.abs(totalAllocated - paymentAmount) < 0.01;
  };

  // Function to check if allocation currencies match payment currency
  const areAllocationCurrenciesValid = () => {
    if (!isSplitPayment) return true;
    
    const paymentCurrency = watchedCurrency || payment.currency;
    return editableAllocations.every(allocation => 
      (allocation.currency || payment.currency) === paymentCurrency
    );
  };

  useEffect(() => {
    if (watchedCurrency && watchedPaymentDate && exchangeRatesData?.data?.rates) {
      const rate = parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
      form.setValue("exchangeRate", rate);
    }
  }, [watchedCurrency, watchedPaymentDate, exchangeRatesData, form]);

  useEffect(() => {
    if (watchedAmount && watchedExchangeRate) {
      const usdAmount = watchedAmount / watchedExchangeRate;
      form.setValue("amountUsd", Math.round(usdAmount * 100) / 100);
    }
  }, [watchedAmount, watchedExchangeRate, form]);

  useEffect(() => {
    if (watchedBonusPercentage != null && watchedAmount != null) {
      const bonusAmount = (watchedAmount * watchedBonusPercentage) / 100;
      form.setValue("bonusAmount", Math.round(bonusAmount * 100) / 100);
    } else {
      form.setValue("bonusAmount", null);
    }
  }, [watchedBonusPercentage, watchedAmount, form]);

  useEffect(() => {
    setShowSolicitorSection(!!watchedSolicitorId);
  }, [watchedSolicitorId]);

  // Reset editable allocations when payment changes
  useEffect(() => {
    setEditableAllocations(payment.allocations || []);
  }, [payment.allocations]);

  // Update allocation currencies when payment currency changes
  useEffect(() => {
    if (isSplitPayment && watchedCurrency && editableAllocations.length > 0) {
      setEditableAllocations(prev => 
        prev.map(allocation => ({
          ...allocation,
          currency: watchedCurrency
        }))
      );
    }
  }, [watchedCurrency, isSplitPayment]);

  const resetForm = useCallback(() => {
    form.reset({
      paymentId: payment.id,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      amountUsd: payment.amountUsd ? parseFloat(payment.amountUsd) : undefined,
      amountInPledgeCurrency: payment.amountInPledgeCurrency ? parseFloat(payment.amountInPledgeCurrency) : undefined,
      exchangeRate: payment.exchangeRate ? parseFloat(payment.exchangeRate) : 1,
      paymentDate: payment.paymentDate,
      receivedDate: payment.receivedDate || null,
      paymentMethod: payment.paymentMethod,
      methodDetail: payment.methodDetail || null,
      paymentStatus: payment.paymentStatus,
      referenceNumber: payment.referenceNumber || null,
      checkNumber: payment.checkNumber || null,
      receiptNumber: payment.receiptNumber || null,
      receiptType: payment.receiptType || null,
      receiptIssued: payment.receiptIssued,
      solicitorId: payment.solicitorId || null,
      bonusPercentage: payment.bonusPercentage ? parseFloat(payment.bonusPercentage) : null,
      bonusAmount: payment.bonusAmount ? parseFloat(payment.bonusAmount) : null,
      bonusRuleId: payment.bonusRuleId || null,
      notes: payment.notes || null,
      pledgeId: payment.pledgeId || null,
      paymentPlanId: payment.paymentPlanId || null,
      isSplitPayment: isSplitPayment,
    });
    setShowSolicitorSection(!!payment.solicitorId);
    setEditableAllocations(payment.allocations || []);
  }, [form, payment, isSplitPayment]);

  const convertAmountBetweenCurrencies = (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    exchangeRates: Record<string, string> | undefined
  ): number => {
    if (fromCurrency === toCurrency || !exchangeRates) {
      return Math.round(amount * 100) / 100;
    }

    const fromRate = parseFloat(exchangeRates[fromCurrency] || "1");
    const toRate = parseFloat(exchangeRates[toCurrency] || "1");

    if (isNaN(fromRate) || isNaN(toRate) || fromRate === 0 || toRate === 0) {
      console.warn(
        `Invalid exchange rates for ${fromCurrency} or ${toCurrency}, defaulting to direct conversion`
      );
      return Math.round(amount * 100) / 100;
    }

    const amountInUsd = amount / fromRate;
    const convertedAmount = amountInUsd * toRate;
    return Math.round(convertedAmount * 100) / 100;
  };

  const updatePaymentMutation = useUpdatePaymentMutation(
    isSplitPayment ? payment.id : (payment.pledgeId || 0)
  );

  const onSubmit = async (data: EditPaymentFormData) => {
    try {
      // Additional validation for split payments
      if (isSplitPayment) {
        if (!areAllocationsValid()) {
          toast.error("Total allocated amount must equal payment amount");
          return;
        }
        
        if (!areAllocationCurrenciesValid()) {
          toast.error("All allocation currencies must match the payment currency");
          return;
        }
      }

      if (isPaymentPlanPayment) {
        const { amount, paymentDate, ...allowedUpdates } = data;
        if (amount !== parseFloat(payment.amount) || paymentDate !== payment.paymentDate) {
          toast.error("Cannot modify amount or payment date for payment plan payments");
          return;
        }
        const updateData = Object.fromEntries(
          Object.entries(allowedUpdates).filter(([, value]) => value !== undefined && value !== null && value !== "")
        );
        await updatePaymentMutation.mutateAsync(updateData as any);
      } else {
        // Convert editable allocations to the correct format
        const processedAllocations = editableAllocations.map(alloc => ({
          ...alloc,
          allocatedAmount: parseFloat(alloc.allocatedAmount),
          currency: watchedCurrency || payment.currency // Ensure currency matches
        }));

        const updateData = {
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "")
          ),
          ...(isSplitPayment && { allocations: processedAllocations })
        };
        await updatePaymentMutation.mutateAsync(updateData as any);
      }

      toast.success("Payment updated successfully!");
      setOpen(false);
    } catch (error) {
      console.error("Error updating payment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update payment");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      if (controlledOnOpenChange) {
        controlledOnOpenChange(newOpen);
      }
    } else {
      setInternalOpen(newOpen);
    }                                                                                                           
    if (!newOpen) {
      resetForm();
    }
  };

  const solicitorOptions = solicitorsData?.solicitors?.map((solicitor: Solicitor) => ({
    label: `${solicitor.firstName} ${solicitor.lastName}${solicitor.id ? ` (${solicitor.id})` : ""}`,
    value: solicitor.id,
    commissionRate: solicitor.commissionRate,
    contact: solicitor.contact,
  })) || [];

  const effectivePledgeDescription = pledgeData?.pledge?.description || payment.pledgeDescription || "N/A";
  const effectivePledgeCurrency = pledgeData?.pledge?.currency || "USD";

  const formatCurrency = (amount: string | number, currency: string = "USD") => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${currency} ${numAmount.toLocaleString()}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Payment
            {isSplitPayment && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <Split className="h-3 w-3 mr-1" />
                Split Payment
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            <div>
              {isSplitPayment ? (
                <>
                  Edit split payment affecting {payment.allocations?.length || 0} pledges
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Total Amount: {payment.currency} {parseFloat(payment.amount).toLocaleString()}
                  </span>
                  {payment.allocations && payment.allocations.length > 0 && (
                    <div className="mt-2 p-2 bg-purple-50 rounded-md">
                      <span className="text-xs font-medium text-purple-700">Current Allocations:</span>
                      <div className="mt-1 space-y-1">
                        {payment.allocations.map((alloc, index) => (
                          <div key={alloc.id || index} className="flex justify-between text-xs text-purple-600">
                            <span>
                              Pledge #{alloc.pledgeId}
                              {alloc.pledgeDescription && ` (${alloc.pledgeDescription})`}
                            </span>
                            <span>{formatCurrency(alloc.allocatedAmount, alloc.currency || payment.currency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  Edit payment for pledge {payment.pledgeDescription ? `"${payment.pledgeDescription}"` : `#${payment.pledgeId}`}
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Current Amount: {payment.currency} {parseFloat(payment.amount).toLocaleString()}
                  </span>
                </>
              )}
              {payment.solicitorName && (
                <span className="block mt-1 text-sm text-muted-foreground">
                  Solicitor: {payment.solicitorName}
                </span>
              )}
              {isPaymentPlanPayment && (
                <span className="block mt-1 text-sm text-orange-600 font-medium">
                  ⚠️ This payment belongs to a payment plan. Amount and payment date cannot be modified.
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Payment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Payment ID (Read-only) */}
                  <FormField
                    control={form.control}
                    name="paymentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment ID</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" readOnly className="opacity-70" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Total Amount
                          {isPaymentPlanPayment && (
                            <span className="text-sm text-orange-600 ml-2">(Controlled by Payment Plan)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            disabled={isPaymentPlanPayment}
                            className={isPaymentPlanPayment ? "opacity-60 cursor-not-allowed bg-muted" : ""}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        {isPaymentPlanPayment && (
                          <p className="text-xs text-orange-600">
                            Amount is controlled by the payment plan and cannot be modified
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Currency */}
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {supportedCurrencies.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Exchange Rate */}
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exchange Rate (to USD)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.0001"
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            readOnly={isLoadingRates}
                            className={isLoadingRates ? "opacity-70" : ""}
                          />
                        </FormControl>
                        {isLoadingRates && <p className="text-sm text-gray-500">Fetching latest rates...</p>}
                        {ratesError && <p className="text-sm text-red-500">Error fetching rates.</p>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Amount in USD */}
                  <FormField
                    control={form.control}
                    name="amountUsd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (USD)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" readOnly className="opacity-70" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Amount in Pledge Currency (only for non-split payments) */}
                  {!isSplitPayment && (
                    <FormField
                      control={form.control}
                      name="amountInPledgeCurrency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (Pledge Currency: {effectivePledgeCurrency})</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              value={convertAmountBetweenCurrencies(
                                watchedAmount || 0,
                                watchedCurrency || "USD",
                                effectivePledgeCurrency,
                                exchangeRatesData?.data?.rates
                              )}
                              readOnly
                              className="opacity-70"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Payment Date */}
                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Payment Date
                          {isPaymentPlanPayment && (
                            <span className="text-sm text-orange-600 ml-2">(Controlled by Payment Plan)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            disabled={isPaymentPlanPayment}
                            className={isPaymentPlanPayment ? "opacity-60 cursor-not-allowed bg-muted" : ""}
                          />
                        </FormControl>
                        {isPaymentPlanPayment && (
                          <p className="text-xs text-orange-600">
                            Payment date is controlled by the payment plan and cannot be modified
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Received Date */}
                  <FormField
                    control={form.control}
                    name="receivedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Received Date</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Split Payment Allocations Section - Now Editable */}
            {isSplitPayment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Payment Allocations
                    <Badge variant="secondary" className="ml-2">
                      {editableAllocations.length || 0} allocation{editableAllocations.length !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                  <DialogDescription>
                    Edit allocation amounts for this split payment. All allocations must use the same currency as the payment.
                  </DialogDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editableAllocations && editableAllocations.length > 0 ? (
                    editableAllocations.map((allocation, index) => (
                      <div key={allocation.id || index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Allocation #{index + 1}</h4>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {formatCurrency(allocation.allocatedAmount, watchedCurrency || payment.currency)}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Pledge ID - Read Only */}
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Pledge ID
                            </label>
                            <Input
                              value={`#${allocation.pledgeId}`}
                              readOnly
                              className="opacity-70 bg-white"
                            />
                          </div>

                          {/* Pledge Description - Read Only */}
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Pledge Description
                            </label>
                            <Input
                              value={allocation.pledgeDescription || "No description"}
                              readOnly
                              className="opacity-70 bg-white"
                            />
                          </div>

                          {/* Allocated Amount - Now Editable */}
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Allocated Amount *
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={parseFloat(allocation.allocatedAmount)}
                              onChange={(e) => {
                                const newAmount = parseFloat(e.target.value) || 0;
                                handleAllocationAmountChange(index, newAmount);
                              }}
                              className="bg-white"
                              placeholder="Enter allocated amount"
                            />
                          </div>

                          {/* Currency - Read Only, shows payment currency */}
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Currency
                            </label>
                            <Input
                              value={watchedCurrency || payment.currency}
                              readOnly
                              className="opacity-70 bg-white"
                            />
                          </div>

                          {/* Allocation Notes - Now Editable */}
                          <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Allocation Notes
                            </label>
                            <Textarea
                              value={allocation.notes || ""}
                              onChange={(e) => {
                                handleAllocationNotesChange(index, e.target.value);
                              }}
                              className="bg-white resize-none"
                              rows={2}
                              placeholder="Enter allocation notes..."
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Split className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No allocations found for this split payment</p>
                    </div>
                  )}

                  {/* Total Summary with validation */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-center font-medium">
                      <span>Total Allocated:</span>
                      <span className={cn(
                        "text-lg",
                        areAllocationsValid() ? "text-green-600" : "text-red-600"
                      )}>
                        {watchedCurrency || payment.currency} {getTotalAllocatedAmount().toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-600 mt-1">
                      <span>Payment Amount:</span>
                      <span>
                        {watchedCurrency || payment.currency} {(watchedAmount || parseFloat(payment.amount)).toLocaleString()}
                      </span>
                    </div>
                    
                    {/* Validation Messages */}
                    {!areAllocationsValid() && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600 font-medium">⚠️ Validation Error</p>
                        <p className="text-xs text-red-600 mt-1">
                          Total allocated amount ({getTotalAllocatedAmount().toFixed(2)}) must equal payment amount ({(watchedAmount || parseFloat(payment.amount)).toFixed(2)})
                        </p>
                      </div>
                    )}
                    
                    {!areAllocationCurrenciesValid() && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600 font-medium">⚠️ Currency Mismatch</p>
                        <p className="text-xs text-red-600 mt-1">
                          All allocation currencies must match payment currency ({watchedCurrency || payment.currency})
                        </p>
                      </div>
                    )}
                    
                    {areAllocationsValid() && areAllocationCurrenciesValid() && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-600 font-medium">✓ Allocations Valid</p>
                        <p className="text-xs text-green-600 mt-1">
                          All allocations are properly balanced and currencies match
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Method and Status Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Method & Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Payment Method */}
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value
                                  ? paymentMethods.find((method) => method.value === field.value)?.label
                                  : "Select a payment method"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput placeholder="Search payment methods..." />
                              <CommandEmpty>No payment method found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value=""
                                  onSelect={() => {
                                    form.setValue("paymentMethod", "")
                                  }}
                                  className="text-muted-foreground"
                                >
                                  <div className="mr-2 h-4 w-4" />
                                  Select a payment method
                                </CommandItem>
                                {paymentMethods.map((method) => (
                                  <CommandItem
                                    key={method.value}
                                    value={method.value}
                                    onSelect={() => {
                                      form.setValue("paymentMethod", method.value)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === method.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {method.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Method Detail */}
                  <FormField
                    control={form.control}
                    name="methodDetail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method Detail</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                                disabled={!form.watch("paymentMethod")}
                              >
                                {field.value
                                  ? methodDetails.find((detail) => detail.value === field.value)?.label
                                  : "Select a method detail"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput placeholder="Search method detail..." />
                              <CommandEmpty>No method detail found.</CommandEmpty>
                              <CommandGroup>
                                {methodDetails.map((detail) => (
                                  <CommandItem
                                    key={detail.value}
                                    value={detail.value}
                                    onSelect={() => {
                                      form.setValue("methodDetail", detail.value)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === detail.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {detail.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Status */}
                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a payment status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentStatuses.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Reference Number */}
                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Check Number */}
                  <FormField
                    control={form.control}
                    name="checkNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Check Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Receipt Information Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receipt Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Receipt Number */}
                  <FormField
                    control={form.control}
                    name="receiptNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Receipt Type */}
                  <FormField
                    control={form.control}
                    name="receiptType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a receipt type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {receiptTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Receipt Issued */}
                <FormField
                  control={form.control}
                  name="receiptIssued"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm mt-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Receipt Issued</FormLabel>
                        <DialogDescription>
                          Has a receipt been issued for this payment?
                        </DialogDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Solicitor Section Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="show-solicitor-section"
                checked={showSolicitorSection}
                onCheckedChange={(checked) => {
                  setShowSolicitorSection(checked);
                  if (!checked) {
                    form.setValue("solicitorId", null);
                    form.setValue("bonusPercentage", null);
                    form.setValue("bonusAmount", null);
                    form.setValue("bonusRuleId", null);
                  }
                }}
              />
              <label htmlFor="show-solicitor-section" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Assign Solicitor
              </label>
            </div>

            {showSolicitorSection && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Solicitor Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Solicitor ID */}
                    <FormField
                      control={form.control}
                      name="solicitorId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Solicitor</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value
                                    ? solicitorOptions.find((solicitor) => solicitor.value === field.value)?.label
                                    : "Select solicitor"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="Search solicitor..." />
                                <CommandList>
                                  <CommandEmpty>No solicitor found.</CommandEmpty>
                                  <CommandGroup>
                                    {solicitorOptions.map((solicitor) => (
                                      <CommandItem
                                        value={solicitor.label}
                                        key={solicitor.value}
                                        onSelect={() => {
                                          form.setValue("solicitorId", solicitor.value);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            solicitor.value === field.value ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {solicitor.label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Bonus Percentage */}
                    <FormField
                      control={form.control}
                      name="bonusPercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Percentage (%)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Bonus Amount */}
                    <FormField
                      control={form.control}
                      name="bonusAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Amount</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" step="0.01" readOnly className="opacity-70" value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Bonus Rule ID */}
                    <FormField
                      control={form.control}
                      name="bonusRuleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Rule ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* General Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>General Payment Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4 justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updatePaymentMutation.isPending || (isSplitPayment && (!areAllocationsValid() || !areAllocationCurrenciesValid()))}
              >
                {updatePaymentMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}