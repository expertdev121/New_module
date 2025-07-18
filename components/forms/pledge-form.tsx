/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import type React from "react";
import { useState, useEffect } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
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
import { useExchangeRates } from "@/lib/query/useExchangeRates";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useCreatePledgeMutation,
  useCreatePledgeAndPayMutation,
} from "@/lib/query/pledge/usePledgeQuery";
import PaymentDialog from "./payment-form";
import { getCategoryById, STATIC_CATEGORIES } from "@/lib/data/categories";

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

const pledgeSchema = z.object({
  contactId: z.number().positive(),
  categoryId: z.number().positive().optional(),
  description: z.string().min(1, "Description is required"),
  pledgeDate: z.string().min(1, "Pledge date is required"),
  currency: z.enum(supportedCurrencies).default("USD"),
  originalAmount: z.number().positive("Pledge amount must be positive"),
  originalAmountUsd: z
    .number()
    .positive("Pledge amount in USD must be positive"),
  exchangeRate: z.number().positive("Exchange rate must be positive"),
  exchangeRateDate: z.string().optional(),
  campaignCode: z.string().optional(),
  notes: z.string().optional(),
});

type PledgeFormData = z.infer<typeof pledgeSchema>;

interface PledgeDialogProps {
  contactId: number;
  contactName?: string;
  onPledgeCreated?: (pledgeId: number) => void;
  onPledgeCreatedAndPay?: (pledgeId: number) => void;
}

export default function PledgeDialog({
  contactId,
  contactName,
  onPledgeCreated,
  onPledgeCreatedAndPay,
}: PledgeDialogProps) {
  const [open, setOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [createdPledge, setCreatedPledge] = useState<any>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );

  const form = useForm({
    resolver: zodResolver(pledgeSchema),
    defaultValues: {
      contactId,
      categoryId: undefined,
      currency: "USD" as const,
      exchangeRate: 1,
      originalAmount: 0,
      originalAmountUsd: 0,
      description: "",
      pledgeDate: new Date().toISOString().split("T")[0],
      exchangeRateDate: new Date().toISOString().split("T")[0],
      campaignCode: "",
      notes: "",
    },
  });

  const watchedCurrency = form.watch("currency");
  const watchedOriginalAmount = form.watch("originalAmount");
  const watchedExchangeRateDate = form.watch("exchangeRateDate");

  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
  } = useExchangeRates(watchedExchangeRateDate);

  const createPledgeMutation = useCreatePledgeMutation();
  const createPledgeAndPayMutation = useCreatePledgeAndPayMutation();

  useEffect(() => {
    if (
      watchedCurrency &&
      watchedExchangeRateDate &&
      exchangeRatesData?.data?.rates
    ) {
      const rate =
        parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
      form.setValue("exchangeRate", rate);
    }
  }, [watchedCurrency, watchedExchangeRateDate, exchangeRatesData, form]);

  useEffect(() => {
    const exchangeRate = form.getValues("exchangeRate");
    if (watchedOriginalAmount && exchangeRate) {
      const usdAmount = watchedOriginalAmount * exchangeRate;
      form.setValue("originalAmountUsd", Math.round(usdAmount * 100) / 100);
    }
  }, [watchedOriginalAmount, form.watch("exchangeRate"), form]);

  const handleCategoryChange = (categoryId: string) => {
    const id = parseInt(categoryId);
    form.setValue("categoryId", id);
    setSelectedCategoryId(id);
    // Clear description when category changes
    form.setValue("description", "");
  };

  const handleItemSelect = (item: string) => {
    form.setValue("description", item);
  };

  // Check if selected category is "Donation" (assuming it has name "Donation")
  const isDonationCategory = selectedCategoryId 
    ? STATIC_CATEGORIES.find(cat => cat.id === selectedCategoryId)?.name?.toLowerCase() === "donation"
    : false;

  const onSubmit = async (data: PledgeFormData, shouldOpenPayment = false) => {
    try {
      // Debug logging to check exchange rate values
      console.log("Form data before submission:", data);
      console.log("Exchange rate value:", data.exchangeRate);
      console.log("Exchange rate type:", typeof data.exchangeRate);

      // Include exchangeRate and campaignCode in the submission data
      const pledgeData = {
        contactId: data.contactId,
        categoryId: data.categoryId,
        pledgeDate: data.pledgeDate,
        description: data.description,
        originalAmount: data.originalAmount,
        currency: data.currency,
        originalAmountUsd: data.originalAmountUsd,
        exchangeRate: data.exchangeRate,
        campaignCode: data.campaignCode || undefined, // Only include if not empty
        notes: data.notes,
        // exchangeRateDate is excluded - it's only used for fetching rates
      };

      console.log("Pledge data being sent to backend:", pledgeData);

      if (shouldOpenPayment) {
        const result = await createPledgeAndPayMutation.mutateAsync({
          ...pledgeData,
          shouldRedirectToPay: true,
        });

        toast.success("Pledge created successfully!");

        // Reset form and close dialog
        form.reset({
          contactId,
          currency: "USD" as const,
          exchangeRate: 1,
          originalAmount: 0,
          originalAmountUsd: 0,
          description: "",
          pledgeDate: new Date().toISOString().split("T")[0],
          exchangeRateDate: new Date().toISOString().split("T")[0],
          campaignCode: "",
          notes: "",
        });
        setSelectedCategoryId(null);
        setOpen(false);

        // Store pledge data and open payment dialog
        setCreatedPledge(result.pledge);
        setPaymentDialogOpen(true);
      } else {
        const result = await createPledgeMutation.mutateAsync(pledgeData);

        toast.success("Pledge created successfully!");

        form.reset({
          contactId,
          categoryId: undefined,
          currency: "USD" as const,
          exchangeRate: 1,
          originalAmount: 0,
          originalAmountUsd: 0,
          description: "",
          pledgeDate: new Date().toISOString().split("T")[0],
          exchangeRateDate: new Date().toISOString().split("T")[0],
          campaignCode: "",
          notes: "",
        });
        setSelectedCategoryId(null);
        setOpen(false);

        // Call callback if provided
        if (onPledgeCreated) {
          onPledgeCreated(result.pledge.id);
        }
      }
    } catch (error) {
      console.error("Error submitting pledge:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create pledge"
      );
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset({
        contactId,
        currency: "USD" as const,
        exchangeRate: 1,
        originalAmount: 0,
        originalAmountUsd: 0,
        description: "",
        pledgeDate: new Date().toISOString().split("T")[0],
        exchangeRateDate: new Date().toISOString().split("T")[0],
        campaignCode: "",
        notes: "",
      });
      setSelectedCategoryId(null);
    }
  };

  const isSubmitting =
    createPledgeMutation.isPending || createPledgeAndPayMutation.isPending;

  const selectedCategory = selectedCategoryId
    ? getCategoryById(selectedCategoryId)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="border-dashed text-white"
            aria-label="Create Pledge"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Pledge
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Pledge</DialogTitle>
            <DialogDescription>
              Add a new pledge for {contactName || `contact ID ${contactId}`}.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Category</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-[200px] justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? STATIC_CATEGORIES.find(
                                  (category) => category.id === field.value
                                )?.name
                              : "Select category"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search category..."
                            className="h-9"
                          />
                          <CommandList>
                            <CommandEmpty>No category found.</CommandEmpty>
                            <CommandGroup>
                              {STATIC_CATEGORIES.map((category) => (
                                <CommandItem
                                  key={category.id}
                                  value={category.name}
                                  onSelect={() => {
                                    form.setValue("categoryId", category.id);
                                    handleCategoryChange(
                                      category.id.toString()
                                    );
                                  }}
                                >
                                  {category.name}
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      category.id === field.value
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
                    <FormDescription>
                      Select the category for this pledge.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Campaign Code Field - Only show for Donation category */}
              {isDonationCategory && (
                <FormField
                  control={form.control}
                  name="campaignCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter campaign code (optional)"
                        />
                      </FormControl>
                      <FormDescription>
                        Optional campaign code for donation tracking.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Description with item selection */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          {...field}
                          placeholder="Enter description of the pledge"
                        />
                        {selectedCategory &&
                          selectedCategory.items.length > 0 && (
                            <div className="mt-2">
                              <FormLabel className="text-sm text-muted-foreground">
                                Or select from {selectedCategory.name} items:
                              </FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between mt-1"
                                  >
                                    Select item from {selectedCategory.name}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0">
                                  <Command>
                                    <CommandInput
                                      placeholder={`Search ${selectedCategory.name} items...`}
                                      className="h-9"
                                    />
                                    <CommandList className="max-h-[200px]">
                                      <CommandEmpty>
                                        No items found.
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {selectedCategory.items.map(
                                          (item, index) => (
                                            <CommandItem
                                              key={index}
                                              value={item}
                                              onSelect={() =>
                                                handleItemSelect(item)
                                              }
                                            >
                                              {item}
                                            </CommandItem>
                                          )
                                        )}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Pledge Date */}
              <FormField
                control={form.control}
                name="pledgeDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pledge Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                    <FormLabel>Currency *</FormLabel>
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
                                : "Select currency"
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
                      <FormMessage>Error loading exchange rates</FormMessage>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Exchange Rate Date */}
              {/* <FormField
                control={form.control}
                name="exchangeRateDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exchange Rate Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      Select the date for which exchange rates should be used.
                      Current date uses live rates.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              /> */}

              {/* Exchange Rate (Read-only) */}
              <FormField
                control={form.control}
                name="exchangeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exchange Rate (to USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.0001"
                        {...field}
                        readOnly
                        className="bg-gray-50"
                      />
                    </FormControl>
                    <FormDescription>
                      {isLoadingRates
                        ? "Loading exchange rate..."
                        : `Rate for ${watchedExchangeRateDate || "today"}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Original Amount */}
              <FormField
                control={form.control}
                name="originalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pledge Amount ({watchedCurrency}) *</FormLabel>
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

              {/* Original Amount USD (Read-only) */}
              <FormField
                control={form.control}
                name="originalAmountUsd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pledge Amount (USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        readOnly
                        className="bg-gray-50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional notes about this pledge"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => onSubmit(data, false))}
                  disabled={isSubmitting || isLoadingRates}
                >
                  {isSubmitting ? "Creating..." : "Create Pledge"}
                </Button>
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => onSubmit(data, true))}
                  disabled={isSubmitting || isLoadingRates}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? "Creating..." : "Create Pledge + Pay"}
                </Button>
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      {createdPledge && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          pledgeId={createdPledge.id}
          pledgeAmount={parseFloat(createdPledge.originalAmount)}
          pledgeCurrency={createdPledge.currency}
          pledgeDescription={createdPledge.description}
          onPaymentCreated={() => {
            if (onPledgeCreatedAndPay) {
              onPledgeCreatedAndPay(createdPledge.id);
            }
            setCreatedPledge(null);
          }}
        />
      )}
    </>
  );
}