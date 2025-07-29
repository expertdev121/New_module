/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line react-hooks/exhaustive-deps
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronsUpDown, X, Plus ,Split,Users} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
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
import { useExchangeRates } from "@/lib/query/useExchangeRates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreatePaymentMutation } from "@/lib/query/payments/usePaymentQuery";
import { usePledgeDetailsQuery } from "@/lib/query/payment-plans/usePaymentPlanQuery";
import { PlusCircleIcon } from "lucide-react";
import { usePledgesQuery } from "@/lib/query/usePledgeData";
import useContactId from "@/hooks/use-contact-id";

interface Solicitor {
  id: number;
  firstName: string;
  lastName: string;
  commissionRate: number;
  contact: any;
}

interface Pledge {
  id: number;
  description: string | null;
  currency: string;
  balance: string;
  originalAmount: string;
  remainingBalance?: number;
  contact?: {
    fullName: string;
  };
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
  { value: "refund", label: "Refund" },
  { value: "returned", label: "Returned" },
  { value: "declined", label: "Declined" },
] as const;

const receiptTypes = [
  { value: "invoice", label: "Invoice" },
  { value: "confirmation", label: "Confirmation" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
] as const;

const allocationSchema = z.object({
  pledgeId: z.number().optional(),
  allocatedAmount: z.number().optional(),
  installmentScheduleId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const paymentSchema = z.object({
  amount: z.number().optional(),
  currency: z.enum(supportedCurrencies).optional(),
  amountUsd: z.number().optional(),
  exchangeRate: z.number().optional(),
  paymentDate: z.string().optional(),
  receivedDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional(),
  methodDetail: z.string().optional().nullable(),
  paymentStatus: z.string().optional(),
  referenceNumber: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.string().optional().nullable(),
  receiptIssued: z.boolean().optional(),

  solicitorId: z.number().optional().nullable(),
  bonusPercentage: z.number().optional().nullable(),
  bonusAmount: z.number().optional().nullable(),
  bonusRuleId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),

  pledgeId: z.number().optional().nullable(),
  paymentPlanId: z.number().optional().nullable(),
  installmentScheduleId: z.number().optional().nullable(),

  isSplitPayment: z.boolean().optional(),
  allocations: z.array(allocationSchema).optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentDialogProps {
  pledgeId?: number;
  contactId?: number;
  amount: number;
  currency: string;
  description: string;
  showPledgeSelector?: boolean;
}

export default function PaymentFormDialog({
  pledgeId: initialPledgeId,
  contactId: propContactId,
  showPledgeSelector = false,
}: PaymentDialogProps) {
  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
    refetch: refetchRates,
  } = useExchangeRates();
  const { data: solicitorsData, isLoading: isLoadingSolicitors } =
    useSolicitors({ status: "active" });
  const createPaymentMutation = useCreatePaymentMutation();

  const [open, setOpen] = useState(false);
  const [showSolicitorSection, setShowSolicitorSection] = useState(false);

  const contactId = useContactId() || propContactId;

  const { data: pledgesData, isLoading: isLoadingPledges } = usePledgesQuery(
    {
      contactId: contactId as number,
      page: 1,
      limit: 100,
      status: undefined,
    },
    { enabled: !!contactId }
  );

  const isLoadingAllInstallments = false;

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      currency: "USD",
      exchangeRate: 1,
      amountUsd: 0,
      paymentDate: new Date().toISOString().split("T")[0],
      receivedDate: null,
      paymentMethod: "cash",
      methodDetail: null,
      paymentStatus: "completed",
      referenceNumber: null,
      receiptNumber: null,
      receiptType: null,
      receiptIssued: false,
      solicitorId: null,
      bonusPercentage: null,
      bonusAmount: null,
      bonusRuleId: null,
      notes: null,
      pledgeId: initialPledgeId || null,
      paymentPlanId: null,
      installmentScheduleId: null,
      isSplitPayment: false,
      allocations: initialPledgeId
        ? [{ pledgeId: initialPledgeId, allocatedAmount: 0, installmentScheduleId: null, notes: null }]
        : [{ pledgeId: 0, allocatedAmount: 0, installmentScheduleId: null, notes: null }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const setCurrencyWithFallback = (currency: string) => {
    if (supportedCurrencies.includes(currency as typeof supportedCurrencies[number])) {
      form.setValue("currency", currency as typeof supportedCurrencies[number]);
    } else {
      // Fallback to USD if currency is not supported
      form.setValue("currency", "USD");
      console.warn(`Unsupported currency: ${currency}, defaulting to USD`);
    }
  };

  const watchedCurrency = form.watch("currency");
  const watchedAmount = form.watch("amount");
  const watchedPaymentDate = form.watch("paymentDate");
  const watchedSolicitorId = form.watch("solicitorId");
  const watchedBonusPercentage = form.watch("bonusPercentage");
  const watchedExchangeRate = form.watch("exchangeRate");
  const watchedAllocations = form.watch("allocations");
  const watchedIsSplitPayment = form.watch("isSplitPayment");
  const watchedMainPledgeId = form.watch("pledgeId");

  const totalAllocatedAmount = (watchedAllocations || []).reduce(
    (sum, alloc) => sum + (alloc.allocatedAmount || 0),
    0
  );
  const remainingToAllocate = (watchedAmount || 0) - totalAllocatedAmount;
  const { data: pledgeData, isLoading: isLoadingPledge } = usePledgeDetailsQuery(
    watchedMainPledgeId!,
    { enabled: !watchedIsSplitPayment && !!watchedMainPledgeId && watchedMainPledgeId !== 0 }
  );

  const effectivePledgeDescription = pledgeData?.pledge?.description || "N/A";
  const effectivePledgeCurrency = pledgeData?.pledge?.currency || "USD";

  const getExchangeRate = (currency: string): number => {
    if (currency === "USD") return 1;
    if (exchangeRatesData?.data?.rates) {
      const rate = parseFloat(exchangeRatesData.data.rates[currency]);
      return isNaN(rate) ? 1 : rate;
    }
    return 1;
  };

  // Auto-fill exchange rate when currency changes
  useEffect(() => {
    if (watchedCurrency && exchangeRatesData?.data?.rates) {
      const autoRate = getExchangeRate(watchedCurrency);
      if (autoRate) {
        form.setValue('exchangeRate', autoRate);
      }
    }
  }, [watchedCurrency, exchangeRatesData, form]);

  useEffect(() => {
    if (initialPledgeId && !form.formState.isDirty) {
      form.setValue("pledgeId", initialPledgeId);
      if (!watchedIsSplitPayment) {
        form.setValue("allocations.0.pledgeId", initialPledgeId);
        const initialPledge = pledgesData?.pledges?.find(p => p.id === initialPledgeId);
        if (initialPledge) {
          const balance = parseFloat(initialPledge.balance);
          form.setValue("amount", balance);
          form.setValue("allocations.0.allocatedAmount", balance);
          const currency = initialPledge.currency as typeof supportedCurrencies[number];
          if (supportedCurrencies.includes(currency)) {
            form.setValue("currency", currency);
          }
        }
      }
    }
  }, [initialPledgeId, form, pledgesData, watchedIsSplitPayment]);

  useEffect(() => {
    const updateCalculatedAmounts = () => {
      const currency = form.getValues("currency");
      const amount = form.getValues("amount");

      let currentExchangeRate = form.getValues("exchangeRate");
      // Ensure exchange rate is a positive number
      currentExchangeRate = (currentExchangeRate && currentExchangeRate > 0) ? currentExchangeRate : 1;

      if (currency && amount) {
        const rate = (currency === "USD") ? 1 : currentExchangeRate;
        const usdAmount = amount / rate;
        form.setValue("amountUsd", Math.round(usdAmount * 100) / 100);
      }
    };

    updateCalculatedAmounts();
  }, [watchedCurrency, watchedAmount, watchedExchangeRate, form]);

  useEffect(() => {
    if (watchedBonusPercentage != null && watchedAmount != null) {
      const bonusAmount = (watchedAmount * watchedBonusPercentage) / 100;
      form.setValue("bonusAmount", Math.round(bonusAmount * 100) / 100);
    } else {
      form.setValue("bonusAmount", null);
    }
  }, [watchedBonusPercentage, watchedAmount, form]);

  const resetForm = useCallback(() => {
    form.reset({
      amount: 0,
      currency: "USD",
      exchangeRate: 1,
      amountUsd: 0,
      paymentDate: new Date().toISOString().split("T")[0],
      receivedDate: null,
      paymentMethod: "cash",
      methodDetail: null,
      paymentStatus: "completed",
      referenceNumber: null,
      receiptNumber: null,
      receiptType: null,
      receiptIssued: false,
      solicitorId: null,
      bonusPercentage: null,
      bonusAmount: null,
      bonusRuleId: null,
      notes: null,
      pledgeId: initialPledgeId || null,
      paymentPlanId: null,
      installmentScheduleId: null,
      isSplitPayment: false,
      allocations: initialPledgeId
        ? [{ pledgeId: initialPledgeId, allocatedAmount: 0, installmentScheduleId: null, notes: null }]
        : [{ pledgeId: 0, allocatedAmount: 0, installmentScheduleId: null, notes: null }],
    });
    setShowSolicitorSection(false);
  }, [form, initialPledgeId]);

  const isValidCurrency = (currency: string): currency is typeof supportedCurrencies[number] => {
    return supportedCurrencies.includes(currency as typeof supportedCurrencies[number]);
  };

  const convertAmountBetweenCurrencies = (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    exchangeRates: Record<string, string> | undefined
  ): number => {
    // Ensure currencies are valid, default to USD if not
    const validFromCurrency = isValidCurrency(fromCurrency) ? fromCurrency : "USD";
    const validToCurrency = isValidCurrency(toCurrency) ? toCurrency : "USD";

    if (validFromCurrency === validToCurrency || !exchangeRates) {
      return Math.round(amount * 100) / 100;
    }

    const fromRate = parseFloat(exchangeRates[validFromCurrency] || "1");
    const toRate = parseFloat(exchangeRates[validToCurrency] || "1");

    if (isNaN(fromRate) || isNaN(toRate) || fromRate === 0 || toRate === 0) {
      console.warn(
        `Invalid exchange rates for ${validFromCurrency} or ${validToCurrency}, defaulting to direct conversion`
      );
      return Math.round(amount * 100) / 100;
    }

    const amountInUsd = amount / fromRate;
    const convertedAmount = amountInUsd * toRate;

    return Math.round(convertedAmount * 100) / 100;
  };

  const onSubmit = async (data: PaymentFormData) => {
    try {
      console.log('Form submitted with data:', data);
      const isSplit = data.isSplitPayment;

      const commonPaymentFields = {
        amount: data.amount,
        currency: data.currency,
        amountUsd: data.amountUsd,
        exchangeRate: data.exchangeRate,
        paymentDate: data.paymentDate,
        receivedDate: data.receivedDate,
        paymentMethod: data.paymentMethod,
        methodDetail: data.methodDetail,
        paymentStatus: data.paymentStatus,
        referenceNumber: data.referenceNumber,
        receiptNumber: data.receiptNumber,
        receiptType: data.receiptType,
        receiptIssued: data.receiptIssued,
        solicitorId: data.solicitorId ? String(data.solicitorId) : null,
        bonusPercentage: data.bonusPercentage,
        bonusAmount: data.bonusAmount,
        bonusRuleId: data.bonusRuleId,
        notes: data.notes,
      };

      let paymentPayload;

      if (isSplit) {
        if (!data.allocations || data.allocations.length === 0) {
          throw new Error("Split payment requires at least one allocation.");
        }

        // For split payments, create the payload with allocations
        paymentPayload = {
          ...commonPaymentFields,
          // Remove pledgeId for split payments - don't include installmentScheduleId
          pledgeId: null,
          allocations: await Promise.all((data.allocations || []).map(async (allocation) => {
            const targetPledge = pledgesData?.pledges?.find(p => p.id === allocation.pledgeId);
            if (!targetPledge) {
              throw new Error(`Pledge with ID ${allocation.pledgeId} not found for allocation.`);
            }

            // Type assertion to ensure we have a valid supported currency
            const paymentCurrency = data.currency || "USD";
            const validPaymentCurrency = isValidCurrency(paymentCurrency) ? paymentCurrency : "USD";

            const allocatedAmountInPledgeCurrency = convertAmountBetweenCurrencies(
              allocation.allocatedAmount || 0,
              validPaymentCurrency,
              targetPledge.currency,
              exchangeRatesData?.data?.rates
            );

            return {
              pledgeId: String(allocation.pledgeId),
              installmentScheduleId: allocation.installmentScheduleId ? String(allocation.installmentScheduleId) : null,
              amount: allocation.allocatedAmount,
              notes: allocation.notes,
            };
          })),
        };
      } else {
        // Single payment
        if (!data.pledgeId) {
          throw new Error("Single payment requires a pledge ID.");
        }

        // For single payments, build the payload conditionally
        const singlePaymentPayload: any = {
          ...commonPaymentFields,
          pledgeId: String(data.pledgeId),
        };

        // Only include installmentScheduleId if it exists and is valid
        if (data.allocations?.length === 1 && data.allocations[0].installmentScheduleId) {
          singlePaymentPayload.installmentScheduleId = String(data.allocations[0].installmentScheduleId);
        }

        paymentPayload = singlePaymentPayload;
      }

      console.log("Submitting Payload (final):", paymentPayload);

      await createPaymentMutation.mutateAsync(paymentPayload, {
        onSuccess: () => {
          toast.success("Payment and allocations created successfully!");
          resetForm();
          setOpen(false);
        },
        onError: (error) => {
          console.error("Error creating payment:", error);
          toast.error(
            error instanceof Error ? error.message : "Failed to create payment"
          );
        }
      });

    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const pledgeOptions =
    pledgesData?.pledges?.map((pledge: Pledge) => ({
      label: `#${pledge.id} - ${pledge.description || "No description"} (${pledge.currency} ${parseFloat(pledge.balance).toLocaleString()})`,
      value: pledge.id,
      balance: parseFloat(pledge.balance),
      currency: pledge.currency,
      description: pledge.description || "No description",
      originalAmount: parseFloat(pledge.originalAmount),
    })) || [];

  const solicitorOptions =
    solicitorsData?.solicitors?.map((solicitor: Solicitor) => ({
      label: `${solicitor.firstName} ${solicitor.lastName}${solicitor.id ? ` (${solicitor.id})` : ""
        }`,
      value: solicitor.id,
      commissionRate: solicitor.commissionRate,
      contact: solicitor.contact,
    })) || [];

  const getPledgeById = (id: number): Pledge | undefined => {
    return pledgesData?.pledges?.find((p: Pledge) => p.id === id);
  };

  const addAllocation = () => {
    append({ pledgeId: 0, allocatedAmount: 0, installmentScheduleId: null, notes: null });
  };

  const removeAllocation = (index: number) => {
    remove(index);
  };

  const getInstallmentOptionsForAllocation = useCallback((pledgeId: number) => {
    return [];
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="border-dashed text-white">
          <PlusCircleIcon />
          New Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
          <DialogDescription>
            {watchedIsSplitPayment ? (
              "Record a split payment across multiple pledges"
            ) : isLoadingPledge ? (
              "Loading pledge details..."
            ) : (
              <div>
                Record a payment for pledge: {effectivePledgeDescription}
                {pledgeData?.pledge?.remainingBalance && (
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Remaining Balance: {effectivePledgeCurrency}{" "}
                    {pledgeData.pledge.remainingBalance.toLocaleString()}
                  </span>
                )}
                {pledgeData?.contact && (
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Contact: {pledgeData.contact.fullName}
                  </span>
                )}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form.getValues());
          }} className="space-y-6">
            {/* Basic Payment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Split Payment Toggle */}
                  <div className="flex items-center space-x-2 md:col-span-2">
                    <Switch
                      id="isSplitPayment"
                      checked={watchedIsSplitPayment}
                      onCheckedChange={(checked) => {
                        form.setValue("isSplitPayment", checked);
                        if (checked) {
                          form.setValue("pledgeId", null);
                          form.setValue("allocations", [{ pledgeId: 0, allocatedAmount: 0, installmentScheduleId: null, notes: null }]);
                        } else {
                          form.setValue("allocations", [{ pledgeId: initialPledgeId || 0, allocatedAmount: 0, installmentScheduleId: null, notes: null }]);
                          if (initialPledgeId) {
                            form.setValue("pledgeId", initialPledgeId);
                            const initialPledge = pledgesData?.pledges?.find(p => p.id === initialPledgeId);
                            if (initialPledge) {
                              const balance = parseFloat(initialPledge.balance);
                              form.setValue("amount", balance);
                              form.setValue("allocations.0.allocatedAmount", balance);
                              form.setValue("currency", initialPledge.currency as typeof supportedCurrencies[number]);
                            }
                          }
                        }
                      }}
                    />
                    <label htmlFor="isSplitPayment" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Split Payment Across Multiple Pledges
                    </label>
                  </div>

                  {(!watchedIsSplitPayment && showPledgeSelector) && (
                    <FormField
                      control={form.control}
                      name="pledgeId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col md:col-span-2">
                          <FormLabel>Select Pledge</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn("w-full justify-between", (!field.value || field.value === 0) && "text-muted-foreground")}
                                  disabled={isLoadingPledges}
                                >
                                  {field.value
                                    ? pledgeOptions.find(
                                      (pledge: any) => pledge.value === field.value
                                    )?.label
                                    : isLoadingPledges
                                      ? "Loading pledges..."
                                      : "Select pledge"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput
                                  placeholder="Search pledges..."
                                  className="h-9"
                                />
                                <CommandList>
                                  <CommandEmpty>No pledge found.</CommandEmpty>
                                  <CommandGroup>
                                    {pledgeOptions.map((pledge: any) => (
                                      <CommandItem
                                        value={pledge.label}
                                        key={pledge.value}
                                        onSelect={() => {
                                          field.onChange(pledge.value);
                                          form.setValue("allocations.0.pledgeId", pledge.value);
                                          form.setValue("allocations.0.allocatedAmount", parseFloat(pledge.balance));
                                          form.setValue("amount", parseFloat(pledge.balance));
                                          const currency = pledge.currency as typeof supportedCurrencies[number];
                                          if (supportedCurrencies.includes(currency)) {
                                            form.setValue("currency", currency);
                                          }
                                        }}
                                      >
                                        {pledge.label}
                                        <Check
                                          className={cn(
                                            "ml-auto h-4 w-4",
                                            pledge.value === field.value
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value ? parseFloat(value) : 0);
                            }}
                          />
                        </FormControl>
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
                      </FormItem>
                    )}
                  />

                  {/* Exchange Rate */}
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exchange Rate (1 {watchedCurrency} = {field.value} USD)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.0001" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Amount in USD */}
                  <FormField
                    control={form.control}
                    name="amountUsd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount in USD</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Payment Date */}
                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Received Date */}
                  <FormField
                    control={form.control}
                    name="receivedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Method and Status Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Method & Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                  ? paymentMethods.find(
                                    (method) => method.value === field.value
                                  )?.label
                                  : "Select payment method"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search payment methods..." />
                              <CommandEmpty>No payment method found.</CommandEmpty>
                              <CommandGroup>
                                {paymentMethods.map((method) => (
                                  <CommandItem
                                    value={method.label}
                                    key={method.value}
                                    onSelect={() => {
                                      form.setValue("paymentMethod", method.value);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        method.value === field.value
                                          ? "opacity-100"
                                          : "opacity-0"
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
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value
                                  ? methodDetails.find(
                                    (detail) => detail.value === field.value
                                  )?.label
                                  : "Select method detail"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search method details..." />
                              <CommandEmpty>No method detail found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="None"
                                  onSelect={() => {
                                    form.setValue("methodDetail", null);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      !field.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  None
                                </CommandItem>
                                {methodDetails.map((detail) => (
                                  <CommandItem
                                    value={detail.label}
                                    key={detail.value}
                                    onSelect={() => {
                                      form.setValue("methodDetail", detail.value);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        detail.value === field.value
                                          ? "opacity-100"
                                          : "opacity-0"
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

                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
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
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="receiptNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="receiptType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt Type</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "__NONE_SELECTED__" ? null : value)}
                          value={field.value || ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select receipt type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__NONE_SELECTED__">None</SelectItem>
                            {receiptTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="receiptIssued"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm md:col-span-2">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Receipt Issued</FormLabel>
                          <DialogDescription>
                            Mark if a receipt has been issued for this payment.
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
                </div>
              </CardContent>
            </Card>

            {/* Solicitor Section */}
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
                                  disabled={isLoadingSolicitors}
                                >
                                  {field.value
                                    ? solicitorOptions.find(
                                      (solicitor: any) => solicitor.value === field.value
                                    )?.label
                                    : isLoadingSolicitors
                                      ? "Loading solicitors..."
                                      : "Select solicitor"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput
                                  placeholder="Search solicitors..."
                                  className="h-9"
                                />
                                <CommandList>
                                  <CommandEmpty>No solicitor found.</CommandEmpty>
                                  <CommandGroup>
                                    {solicitorOptions.map((solicitor: any) => (
                                      <CommandItem
                                        value={solicitor.label}
                                        key={solicitor.value}
                                        onSelect={() => {
                                          field.onChange(solicitor.value);
                                          if (solicitor.commissionRate != null) {
                                            form.setValue("bonusPercentage", solicitor.commissionRate);
                                          }
                                        }}
                                      >
                                        {solicitor.label}
                                        <Check
                                          className={cn(
                                            "ml-auto h-4 w-4",
                                            solicitor.value === field.value
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
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

                    <FormField
                      control={form.control}
                      name="bonusPercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Percentage (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === "" ? null : parseFloat(value));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bonusAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Amount</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} disabled value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bonusRuleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus Rule ID</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === "" ? null : parseInt(value, 10));
                              }}
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

            {/* Split Payment Section */}
            {watchedIsSplitPayment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Payment Allocations
                    <Badge variant="secondary" className="ml-2">
                      {fields.length} allocation{fields.length !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                  <DialogDescription>
                    Add allocation amounts for this split payment. All allocations must use the same currency as the payment.
                  </DialogDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {fields.length > 0 ? (
                    fields.map((field, index) => (
                      <div key={field.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Allocation #{index + 1}</h4>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAllocation(index)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Pledge Selection */}
                          <FormField
                            control={form.control}
                            name={`allocations.${index}.pledgeId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pledge *</FormLabel>
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
                                        disabled={isLoadingPledges}
                                      >
                                        {field.value
                                          ? pledgeOptions.find(
                                            (pledge) => pledge.value === field.value
                                          )?.label
                                          : isLoadingPledges
                                            ? "Loading pledges..."
                                            : "Select pledge"}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[400px] p-0">
                                    <Command>
                                      <CommandInput placeholder="Search pledges..." className="h-9" />
                                      <CommandList>
                                        <CommandEmpty>No pledge found.</CommandEmpty>
                                        <CommandGroup>
                                          {pledgeOptions.map((pledge) => (
                                            <CommandItem
                                              value={pledge.label}
                                              key={pledge.value}
                                              onSelect={() => {
                                                field.onChange(pledge.value);
                                                form.setValue(`allocations.${index}.installmentScheduleId`, null);
                                              }}
                                            >
                                              {pledge.label}
                                              <Check
                                                className={cn(
                                                  "ml-auto h-4 w-4",
                                                  pledge.value === field.value
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                                )}
                                              />
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                                <FormMessage className="text-xs text-red-500" />
                                {field.value && getPledgeById(field.value) && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Pledge Balance: {getPledgeById(field.value)?.currency}{" "}
                                    {parseFloat(getPledgeById(field.value)?.balance || "").toLocaleString()}
                                  </p>
                                )}
                              </FormItem>
                            )}
                          />

                          {/* Allocated Amount */}
                          <FormField
                            control={form.control}
                            name={`allocations.${index}.allocatedAmount`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Allocated Amount *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value ? parseFloat(value) : 0);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage className="text-xs text-red-500" />
                              </FormItem>
                            )}
                          />

                          {/* Allocation Notes */}
                          <div className="md:col-span-2">
                            <FormField
                              control={form.control}
                              name={`allocations.${index}.notes`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Allocation Notes</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      {...field}
                                      value={field.value || ""}
                                      rows={2}
                                      className="resize-none"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs text-red-500" />
                                </FormItem>
                              )}
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

                  {/* Add Allocation Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAllocation}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Allocation
                  </Button>

                  {/* Total Summary with validation */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-center font-medium">
                      <span>Total Allocated:</span>
                      <span className={cn(
                        "text-lg",
                        remainingToAllocate === 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {watchedCurrency} {totalAllocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-600 mt-1">
                      <span>Payment Amount:</span>
                      <span>
                        {watchedCurrency} {(watchedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Validation Messages */}
                    {remainingToAllocate !== 0 && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600 font-medium">⚠️ Validation Error</p>
                        <p className="text-xs text-red-600 mt-1">
                          Total allocated amount ({totalAllocatedAmount.toFixed(2)}) must equal payment amount ({(watchedAmount || 0).toFixed(2)})
                        </p>
                      </div>
                    )}

                    {remainingToAllocate === 0 && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-600 font-medium">✓ Allocations Valid</p>
                        <p className="text-xs text-green-600 mt-1">
                          All allocations are properly balanced
                        </p>
                      </div>
                    )}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createPaymentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createPaymentMutation.isPending ||
                  isLoadingRates ||
                  isLoadingSolicitors ||
                  isLoadingPledges ||
                  (watchedIsSplitPayment && remainingToAllocate !== 0)
                }
              >
                {createPaymentMutation.isPending ? "Creating Payment..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}