/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line react-hooks/exhaustive-deps
"use client";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExchangeRates } from "@/lib/query/useExchangeRates";

import { toast } from "sonner";
import { useCreatePaymentMutation } from "@/lib/query/payments/usePaymentQuery";

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
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH Transfer" },
  { value: "wire", label: "Wire Transfer" },
  { value: "money_order", label: "Money Order" },
  { value: "stock", label: "Stock" },
  { value: "unknown", label: "Unknown" },
] as const;

const receiptTypes = [
  { value: "invoice", label: "Invoice" },
  { value: "confirmation", label: "Confirmation" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
] as const;

const paymentSchema = z.object({
  pledgeId: z.number().positive(),
  amount: z.number().positive("Payment amount must be positive"),
  currency: z.enum(supportedCurrencies).default("USD"),
  amountUsd: z.number().positive("Payment amount in USD must be positive"),
  exchangeRate: z.number().positive("Exchange rate must be positive"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.enum([
    "ach",
    "bill_pay",
    "cash",
    "check",
    "credit",
    "credit_card",
    "expected",
    "goods_and_services",
    "matching_funds",
    "money_order",
    "p2p",
    "pending",
    "refund",
    "scholarship",
    "stock",
    "student_portion",
    "unknown",
    "wire",
    "xfer",
  ]),
  referenceNumber: z.string().optional(),
  checkNumber: z.string().optional(),
  receiptNumber: z.string().optional(),
  receiptType: z
    .enum(["invoice", "confirmation", "receipt", "other"])
    .optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pledgeId: number;
  pledgeAmount: number;
  pledgeCurrency: string;
  pledgeDescription?: string;
  onPaymentCreated?: () => void;
}

export default function PaymentDialog({
  open,
  onOpenChange,
  pledgeId,
  pledgeAmount,
  pledgeCurrency,
  pledgeDescription,
  onPaymentCreated,
}: PaymentDialogProps) {
  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
  } = useExchangeRates();

  const createPaymentMutation = useCreatePaymentMutation();

  const form = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      pledgeId,
      currency: (pledgeCurrency as any) || "USD",
      exchangeRate: 1,
      amountUsd: 0,
      amount: pledgeAmount,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "cash" as const,
      referenceNumber: "",
      checkNumber: "",
      receiptNumber: "",
      notes: "",
    },
  });

  const watchedCurrency = form.watch("currency");
  const watchedAmount = form.watch("amount");
  const watchedPaymentDate = form.watch("paymentDate");
  const watchedPaymentMethod = form.watch("paymentMethod");

  // Update exchange rate when currency or date changes
  useEffect(() => {
    if (
      watchedCurrency &&
      watchedPaymentDate &&
      exchangeRatesData?.data?.rates
    ) {
      const rate =
        parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
      form.setValue("exchangeRate", rate);
    }
  }, [watchedCurrency, watchedPaymentDate, exchangeRatesData, form]);

  // Auto-calculate USD amount when amount or exchange rate changes
  useEffect(() => {
    const exchangeRate = form.getValues("exchangeRate");
    if (watchedAmount && exchangeRate) {
      // Since exchange rates are now inverted (currency to USD conversion rates),
      // we multiply instead of divide
      const usdAmount = watchedAmount * exchangeRate;
      form.setValue("amountUsd", Math.round(usdAmount * 100) / 100);
    }
  }, [watchedAmount, form.watch("exchangeRate"), form]);

  const onSubmit = async (data: PaymentFormData) => {
    try {
      let convertedAmount = data.amount;
      const inputCurrency = data.currency;
      const targetPledgeCurrency =
        (pledgeCurrency as (typeof supportedCurrencies)[number]) || "USD";

      // Validate that pledge currency is supported
      if (!supportedCurrencies.includes(targetPledgeCurrency as any)) {
        toast.error(`Unsupported pledge currency: ${targetPledgeCurrency}`);
        return;
      }

      // Convert amount to pledge currency if different
      if (
        inputCurrency !== targetPledgeCurrency &&
        exchangeRatesData?.data?.rates
      ) {
        // Convert input currency to USD first
        const inputToUsdRate =
          parseFloat(exchangeRatesData.data.rates[inputCurrency]) || 1;
        const usdAmount = data.amount * inputToUsdRate;

        // Convert USD to pledge currency
        const usdToPledgeRate =
          parseFloat(exchangeRatesData.data.rates[targetPledgeCurrency]) || 1;
        convertedAmount = usdAmount / usdToPledgeRate;
        convertedAmount = Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
      }

      // Create payload with converted amount and pledge currency
      const payload = {
        ...data,
        amount: convertedAmount,
        currency: targetPledgeCurrency,
        // Keep the original input for reference in amountUsd calculation
        amountUsd: data.amountUsd, // This stays as calculated
      };

      console.log("Original amount:", data.amount, data.currency);
      console.log("Converted amount:", convertedAmount, targetPledgeCurrency);

      await createPaymentMutation.mutateAsync(payload);

      toast.success("Payment created successfully!");

      // Reset form
      form.reset({
        pledgeId,
        currency: (pledgeCurrency as any) || "USD",
        exchangeRate: 1,
        amountUsd: 0,
        amount: pledgeAmount,
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod: "cash" as const,
        referenceNumber: "",
        checkNumber: "",
        receiptNumber: "",
        notes: "",
      });

      onOpenChange(false);

      if (onPaymentCreated) {
        onPaymentCreated();
      }
    } catch (error) {
      console.error("Error creating payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create payment"
      );
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      form.reset({
        pledgeId,
        currency: (pledgeCurrency as any) || "USD",
        exchangeRate: 1,
        amountUsd: 0,
        amount: pledgeAmount,
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod: "cash" as const,
        referenceNumber: "",
        checkNumber: "",
        receiptNumber: "",
        notes: "",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
          <DialogDescription>
            Record a payment for pledge:{" "}
            {pledgeDescription || `Pledge #${pledgeId}`}
            <span className="block mt-1 text-sm text-muted-foreground">
              Target currency: {pledgeCurrency} (amount will be auto-converted)
            </span>
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
                  {/* Total Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Amount</FormLabel>
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isLoadingRates}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  isLoadingRates
                                    ? "Loading currencies..."
                                    : "Select a currency"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {supportedCurrencies.map((curr) => (
                              <SelectItem key={curr} value={curr}>
                                {curr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {ratesError && (
                          <p className="text-sm text-red-500">Error fetching rates.</p>
                        )}
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
                            readOnly
                            className={isLoadingRates ? "opacity-70" : "opacity-70"}
                          />
                        </FormControl>
                        {isLoadingRates && <p className="text-sm text-gray-500">Fetching latest rates...</p>}
                        {ratesError && <p className="text-sm text-red-500">Error fetching rates.</p>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Amount USD */}
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

                  {/* Amount in Pledge Currency (show conversion if different) */}
                  {watchedCurrency && watchedCurrency !== pledgeCurrency && (
                    <FormField
                      control={form.control}
                      name="amount"
                      render={() => (
                        <FormItem>
                          <FormLabel>Amount (Pledge Currency: {pledgeCurrency})</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              value={(() => {
                                if (watchedAmount > 0 && exchangeRatesData?.data?.rates && watchedCurrency) {
                                  const inputToUsdRate =
                                    parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
                                  const usdAmount = watchedAmount * inputToUsdRate;
                                  const usdToPledgeRate =
                                    parseFloat(exchangeRatesData.data.rates[pledgeCurrency]) || 1;
                                  const convertedAmount = usdAmount / usdToPledgeRate;
                                  return Math.round(convertedAmount * 100) / 100;
                                }
                                return 0;
                              })()}
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
                        <FormLabel>Payment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
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
                  {/* Payment Method */}
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a payment method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentMethods.map((method) => (
                              <SelectItem key={method.value} value={method.value}>
                                {method.label}
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
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Transaction reference number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Check Number - only show if payment method is check */}
                  {watchedPaymentMethod === "check" && (
                    <FormField
                      control={form.control}
                      name="checkNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Check Number</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ""} 
                              placeholder="Check number" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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
                          <Input 
                            {...field} 
                            value={field.value || ""} 
                            placeholder="Receipt number" 
                          />
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
                        <Select onValueChange={field.onChange} value={field.value || ""}>
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
              </CardContent>
            </Card>

            {/* General Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>General Payment Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="Additional notes about this payment"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
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
                disabled={createPaymentMutation.isPending || isLoadingRates}
                className="bg-green-600 hover:bg-green-700"
              >
                {createPaymentMutation.isPending
                  ? "Creating..."
                  : "Record Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}