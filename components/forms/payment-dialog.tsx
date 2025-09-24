/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line react-hooks/exhaustive-deps
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronsUpDown, X, Plus, Split, Users, Search, UserPlus } from "lucide-react";
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
import PledgeDialog from "../forms/pledge-form";
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

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
}

interface ContactAllocation {
  contactId: number;
  contactName: string;
  pledges: {
    pledgeId: number;
    pledgeDescription: string;
    currency: string;
    balance: number;
    allocatedAmount: number;
  }[];
}

const useSolicitors = (params: { search?: string; status?: "active" | "inactive" | "suspended" } = {}) =>
  useQuery<{ solicitors: Solicitor[] }>({
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

const useContacts = (search?: string) =>
  useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts", search],
    queryFn: async () => {
      if (!search || search.length < 2) return { contacts: [] };
      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(search)}`);
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
    enabled: !!search && search.length >= 2,
  });

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

const accountOptions = [
  { value: "Bank HaPoalim", label: "Bank HaPoalim" },
  { value: "Bank of Montreal", label: "Bank of Montreal" },
  { value: "Mizrachi Tfachot", label: "Mizrachi Tfachot" },
  { value: "MS - Donations", label: "MS - Donations" },
  { value: "MS - Operations", label: "MS - Operations" },
  { value: "Citibank", label: "Citibank" },
  { value: "Pagi", label: "Pagi" },
] as const;

// Allocation schema with receipt fields per allocation
const allocationSchema = z.object({
  pledgeId: z.number().optional(),
  allocatedAmount: z.number().optional(),
  installmentScheduleId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptType: z.string().optional().nullable(),
  receiptIssued: z.boolean().optional(),
});

// Payment schema
const paymentSchema = z.object({
  amount: z.number().optional(),
  currency: z.enum(supportedCurrencies).optional(),
  amountUsd: z.number().optional(),
  exchangeRate: z.number().optional(),
  amountInPledgeCurrency: z.number().optional(),
  exchangeRateToPledgeCurrency: z.number().optional(),
  paymentDate: z.string().optional(),
  receivedDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional(),
  methodDetail: z.string().optional().nullable(),
  account: z.string().optional().nullable(),
  paymentStatus: z.string().optional(),
  checkDate: z.string().optional().nullable(),
  checkNumber: z.string().optional().nullable(),

  solicitorId: z.number().optional().nullable(),
  bonusPercentage: z.number().optional().nullable(),
  bonusAmount: z.number().optional().nullable(),
  bonusRuleId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),

  pledgeId: z.number().optional().nullable(),
  paymentPlanId: z.number().optional().nullable(),
  installmentScheduleId: z.number().optional().nullable(),

  // Third-party payment fields
  isThirdPartyPayment: z.boolean().optional(),
  thirdPartyContactId: z.number().optional().nullable(),

  isSplitPayment: z.boolean().optional(),
  isMultiContactPayment: z.boolean().optional(),
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
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      currency: "USD",
      exchangeRate: 1,
      amountUsd: 0,
      amountInPledgeCurrency: 0,
      exchangeRateToPledgeCurrency: 1,
      paymentDate: new Date().toISOString().split("T")[0],
      receivedDate: null,
      paymentMethod: "cash",
      methodDetail: undefined,
      account: "",
      checkDate: null,
      checkNumber: null,
      paymentStatus: "completed",
      solicitorId: null,
      bonusPercentage: null,
      bonusAmount: null,
      bonusRuleId: null,
      notes: null,
      pledgeId: initialPledgeId || null,
      paymentPlanId: null,
      installmentScheduleId: null,
      isThirdPartyPayment: false,
      thirdPartyContactId: null,
      isSplitPayment: false,
      isMultiContactPayment: false,
      allocations: initialPledgeId
        ? [
          {
            pledgeId: initialPledgeId,
            allocatedAmount: 0,
            installmentScheduleId: null,
            notes: null,
            receiptNumber: null,
            receiptType: null,
            receiptIssued: false,
          },
        ]
        : [
          {
            pledgeId: 0,
            allocatedAmount: 0,
            installmentScheduleId: null,
            notes: null,
            receiptNumber: null,
            receiptType: null,
            receiptIssued: false,
          },
        ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const watchedCurrency = form.watch("currency");
  const watchedAmount = form.watch("amount");
  const watchedPaymentDate = form.watch("paymentDate");
  const watchedReceivedDate = form.watch("receivedDate");
  const watchedSolicitorId = form.watch("solicitorId");
  const watchedBonusPercentage = form.watch("bonusPercentage");
  const watchedExchangeRate = form.watch("exchangeRate");
  const watchedAllocations = form.watch("allocations");
  const watchedIsSplitPayment = form.watch("isSplitPayment");
  const watchedIsMultiContactPayment = form.watch("isMultiContactPayment");
  const watchedMainPledgeId = form.watch("pledgeId");
  const watchedIsThirdParty = form.watch("isThirdPartyPayment");

  const { data: solicitorsData, isLoading: isLoadingSolicitors } = useSolicitors({ status: "active" });
  const createPaymentMutation = useCreatePaymentMutation();

  const [open, setOpen] = useState(false);
  const [showSolicitorSection, setShowSolicitorSection] = useState(false);
  const [pledgeDialogOpen, setPledgeDialogOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedThirdPartyContact, setSelectedThirdPartyContact] = useState<Contact | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [contactAllocations, setContactAllocations] = useState<ContactAllocation[]>([]);
  const [showMultiContactSection, setShowMultiContactSection] = useState(false);
  const [multiContactSearch, setMultiContactSearch] = useState("");
  const [selectedMultiContacts, setSelectedMultiContacts] = useState<Contact[]>([]);
  const [multiContactAllocations, setMultiContactAllocations] = useState<ContactAllocation[]>([]);

  // Multi-contact allocation functions
  const addMultiContact = (contact: Contact) => {
    if (!selectedMultiContacts.find(c => c.id === contact.id)) {
      setSelectedMultiContacts([...selectedMultiContacts, contact]);
      // Initialize allocation for this contact
      const newAllocation: ContactAllocation = {
        contactId: contact.id,
        contactName: contact.fullName,
        pledges: []
      };
      setMultiContactAllocations([...multiContactAllocations, newAllocation]);
    }
    setMultiContactSearch("");
  };

  const removeMultiContact = (contactId: number) => {
    setSelectedMultiContacts(selectedMultiContacts.filter(c => c.id !== contactId));
    setMultiContactAllocations(multiContactAllocations.filter(a => a.contactId !== contactId));
  };

  const updateMultiContactAllocation = (contactId: number, pledgeId: number, amount: number) => {
    setMultiContactAllocations(prev =>
      prev.map(allocation => {
        if (allocation.contactId === contactId) {
          const existingPledgeIndex = allocation.pledges.findIndex(p => p.pledgeId === pledgeId);
          if (existingPledgeIndex >= 0) {
            // Update existing pledge allocation
            const updatedPledges = [...allocation.pledges];
            updatedPledges[existingPledgeIndex] = {
              ...updatedPledges[existingPledgeIndex],
              allocatedAmount: amount
            };
            return { ...allocation, pledges: updatedPledges };
          } else {
            // Add new pledge allocation
            const pledge = allPledgesData?.find(p => p.id === pledgeId);
            if (pledge) {
              return {
                ...allocation,
                pledges: [...allocation.pledges, {
                  pledgeId,
                  pledgeDescription: pledge.description || "No description",
                  currency: pledge.currency,
                  balance: parseFloat(pledge.balance),
                  allocatedAmount: amount
                }]
              };
            }
          }
        }
        return allocation;
      })
    );
  };

  const getTotalMultiContactAllocation = () => {
    return multiContactAllocations.reduce((total, allocation) => {
      return total + allocation.pledges.reduce((contactTotal, pledge) => {
        return contactTotal + pledge.allocatedAmount;
      }, 0);
    }, 0);
  };

  // Refs to store last valid date values
  const lastValidPaymentDateRef = useRef<string | null>(null);
  const lastValidReceivedDateRef = useRef<string | null>(null);
  const lastValidCheckDateRef = useRef<string | null>(null);

  const contactId = useContactId() || propContactId;

  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(contactSearch);
  const { data: multiContactsData, isLoading: isLoadingMultiContacts } = useContacts(multiContactSearch);

  // Get pledges for all selected contacts in multi-contact mode
  // Get pledges for all selected contacts in multi-contact mode
  const multiContactIds = selectedMultiContacts.map(c => c.id);

  // Use a single query for all multi-contact pledges
  const { data: multiContactPledgesData } = useQuery({
    queryKey: ['multi-contact-pledges', multiContactIds],
    queryFn: async () => {
      if (multiContactIds.length === 0) return { pledges: [] };

      const pledgePromises = multiContactIds.map(async (contactId) => {
        const response = await fetch(`/api/pledges?contactId=${contactId}&page=1&limit=100`);
        if (!response.ok) throw new Error('Failed to fetch pledges');
        const data = await response.json();
        return data.pledges || [];
      });

      const results = await Promise.all(pledgePromises);
      const allPledges = results.flat(); // Use flat() instead of flatMap for arrays

      return { pledges: allPledges };
    },
    enabled: multiContactIds.length > 0,
  });

  // Combine all pledges from multi-contacts
  const allPledgesData = useMemo(() => {
    return multiContactPledgesData?.pledges || [];
  }, [multiContactPledgesData]);


  // Get pledges for the current contact or third-party contact
  const targetContactId = selectedThirdPartyContact?.id || contactId;
  const { data: pledgesData, isLoading: isLoadingPledges } = usePledgesQuery(
    {
      contactId: targetContactId as number,
      page: 1,
      limit: 100,
      status: undefined,
    },
    { enabled: !!targetContactId && !watchedIsMultiContactPayment }
  );

  // Get pledge currency for exchange rate display
  const selectedPledgeCurrency = useMemo(() => {
    if (!watchedMainPledgeId || !pledgesData?.pledges) return null;
    const pledge = pledgesData.pledges.find(p => p.id === watchedMainPledgeId);
    return pledge?.currency || null;
  }, [watchedMainPledgeId, pledgesData?.pledges]);

  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
    refetch: refetchRates,
  } = useExchangeRates(watchedReceivedDate || undefined);

  const totalAllocatedAmount = (watchedAllocations || []).reduce(
    (sum, alloc) => sum + (alloc.allocatedAmount || 0),
    0
  );
  const remainingToAllocate = (watchedAmount || 0) - totalAllocatedAmount;

  const { data: pledgeData, isLoading: isLoadingPledge } = usePledgeDetailsQuery(
    watchedMainPledgeId!,
    { enabled: !watchedIsSplitPayment && !watchedIsMultiContactPayment && !!watchedMainPledgeId && watchedMainPledgeId !== 0 }
  );

  // Add debugging for pledges data
  useEffect(() => {
    if (pledgesData?.pledges) {
      const ids = pledgesData.pledges.map(p => p.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        console.warn('Duplicate pledge IDs found:', [...new Set(duplicates)]);
        console.log('All pledges:', pledgesData.pledges);
      }
    }
  }, [pledgesData?.pledges]);

  const getExchangeRate = (currency: string): number => {
    if (currency === "USD") return 1;
    const rates = exchangeRatesData?.data?.rates;
    if (rates && rates.hasOwnProperty(currency)) {
      const rate = parseFloat(rates[currency]);
      return isNaN(rate) ? 1 : rate;
    }
    console.warn(`Missing exchange rate for ${currency}, defaulting to 1`);
    return 1;
  };

  // Set exchange rate automatically on currency change
  useEffect(() => {
    if (watchedCurrency && exchangeRatesData?.data?.rates) {
      const autoRate = getExchangeRate(watchedCurrency);
      form.setValue("exchangeRate", autoRate, { shouldValidate: true, shouldDirty: true });
    }
  }, [watchedCurrency, exchangeRatesData, form]);

  // Update amountUsd whenever amount, currency or exchangeRate changes
  useEffect(() => {
    const currency = form.getValues("currency");
    const amount = form.getValues("amount");
    let currentExchangeRate = form.getValues("exchangeRate");
    currentExchangeRate = currentExchangeRate && currentExchangeRate > 0 ? currentExchangeRate : 1;

    if (currency && amount != null) {
      const rate = currency === "USD" ? 1 : currentExchangeRate;
      // Fix conversion: amount in foreign currency divided by rate (ILS per USD) to get USD
      const usdAmount = currency === "USD" ? amount : amount / rate;
      form.setValue("amountUsd", Math.round(usdAmount * 100) / 100, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [watchedCurrency, watchedAmount, watchedExchangeRate, form]);

  // Update bonusAmount when bonusPercentage or amount changes
  useEffect(() => {
    if (watchedBonusPercentage != null && watchedAmount != null) {
      const bonusAmount = (watchedAmount * watchedBonusPercentage) / 100;
      form.setValue("bonusAmount", Math.round(bonusAmount * 100) / 100, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      form.setValue("bonusAmount", null, { shouldValidate: true, shouldDirty: true });
    }
  }, [watchedBonusPercentage, watchedAmount, form]);

  // Calculate pledge exchange rate and amount in pledge currency
  useEffect(() => {
    if (selectedPledgeCurrency && watchedCurrency && exchangeRatesData?.data?.rates) {
      const paymentCurrency = watchedCurrency;
      const pledgeCurrency = selectedPledgeCurrency;

      if (paymentCurrency === pledgeCurrency) {
        // Same currency, exchange rate is 1
        form.setValue("exchangeRateToPledgeCurrency", 1, { shouldValidate: true, shouldDirty: true });
        form.setValue("amountInPledgeCurrency", watchedAmount || 0, { shouldValidate: true, shouldDirty: true });
      } else {
        // Different currencies, calculate exchange rate
        let exchangeRate = 1;

        if (paymentCurrency === "USD") {
          // Payment in USD, pledge in foreign currency
          exchangeRate = getExchangeRate(pledgeCurrency);
        } else if (pledgeCurrency === "USD") {
          // Payment in foreign currency, pledge in USD
          exchangeRate = 1 / getExchangeRate(paymentCurrency);
        } else {
          // Both currencies are foreign, convert through USD
          const paymentToUsdRate = getExchangeRate(paymentCurrency);
          const pledgeToUsdRate = getExchangeRate(pledgeCurrency);
          exchangeRate = pledgeToUsdRate / paymentToUsdRate;
        }

        form.setValue("exchangeRateToPledgeCurrency", Math.round(exchangeRate * 10000) / 10000, {
          shouldValidate: true,
          shouldDirty: true,
        });

        // Calculate amount in pledge currency
        const amountInPledgeCurrency = (watchedAmount || 0) * exchangeRate;
        form.setValue("amountInPledgeCurrency", Math.round(amountInPledgeCurrency * 100) / 100, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    } else {
      // No pledge selected or no exchange rates available
      form.setValue("exchangeRateToPledgeCurrency", 1, { shouldValidate: true, shouldDirty: true });
      form.setValue("amountInPledgeCurrency", watchedAmount || 0, { shouldValidate: true, shouldDirty: true });
    }
  }, [selectedPledgeCurrency, watchedCurrency, watchedAmount, exchangeRatesData, form]);

  const resetForm = useCallback(() => {
    form.reset({
      amount: 0,
      currency: "USD",
      exchangeRate: 1,
      amountUsd: 0,
      paymentDate: new Date().toISOString().split("T")[0],
      receivedDate: null,
      paymentMethod: "cash",
      methodDetail: undefined,
      account: "",
      checkDate: null,
      checkNumber: null,
      paymentStatus: "completed",
      solicitorId: null,
      bonusPercentage: null,
      bonusAmount: null,
      bonusRuleId: null,
      notes: null,
      pledgeId: initialPledgeId || null,
      paymentPlanId: null,
      installmentScheduleId: null,
      isThirdPartyPayment: false,
      thirdPartyContactId: null,
      isSplitPayment: false,
      isMultiContactPayment: false,
      allocations: initialPledgeId
        ? [
          {
            pledgeId: initialPledgeId,
            allocatedAmount: 0,
            installmentScheduleId: null,
            notes: null,
            receiptNumber: null,
            receiptType: null,
            receiptIssued: false,
          },
        ]
        : [
          {
            pledgeId: 0,
            allocatedAmount: 0,
            installmentScheduleId: null,
            notes: null,
            receiptNumber: null,
            receiptType: null,
            receiptIssued: false,
          },
        ],
    });
    setShowSolicitorSection(false);
    setSelectedThirdPartyContact(null);
    setContactSearch("");
    setSelectedMultiContacts([]);
    setMultiContactAllocations([]);
    setMultiContactSearch("");
    setShowMultiContactSection(false);
  }, [form, initialPledgeId]);

  const onSubmit = async (data: PaymentFormData) => {
    try {
      // Validate required fields first
      if (!data.amount || data.amount <= 0) {
        throw new Error("Payment amount is required and must be greater than 0");
      }

      if (!data.currency) {
        throw new Error("Currency is required");
      }

      if (!data.paymentMethod) {
        throw new Error("Payment method is required");
      }

      if (!data.paymentStatus) {
        throw new Error("Payment status is required");
      }

      if (!data.paymentDate) {
        throw new Error("Payment date is required");
      }

      const exchangeRateNum = Number(data.exchangeRate) || 1;
      const amountNum = Number(data.amount);
      const amountUsdNum = Number(data.amountUsd) || (amountNum * exchangeRateNum);

      const isSplit = data.isSplitPayment;
      const isThirdParty = !!(data.isThirdPartyPayment && selectedThirdPartyContact);
      const isMultiContact = watchedIsMultiContactPayment && selectedMultiContacts.length > 0;

      // Build base payload with correct type assertions
      const basePayload = {
        amount: amountNum,
        currency: data.currency as any,
        amountUsd: amountUsdNum,
        exchangeRate: exchangeRateNum,
        paymentDate: data.paymentDate,
        receivedDate: data.receivedDate || undefined,
        paymentMethod: data.paymentMethod as any,
        methodDetail: data.methodDetail || undefined,
        account: data.account || undefined,
        checkDate: data.checkDate || undefined,
        checkNumber: data.checkNumber || undefined,
        paymentStatus: data.paymentStatus as any,
        solicitorId: data.solicitorId ? Number(data.solicitorId) : undefined,
        bonusPercentage: data.bonusPercentage || undefined,
        bonusAmount: data.bonusAmount || undefined,
        bonusRuleId: data.bonusRuleId || undefined,
        notes: data.notes || undefined,
        isThirdPartyPayment: isThirdParty,
        payerContactId: isThirdParty ? (contactId || undefined) : undefined,
      };

      if (isMultiContact) {
        // Handle multi-contact payment
        if (getTotalMultiContactAllocation() !== (data.amount || 0)) {
          throw new Error("Multi-contact payment allocation amounts must equal the total payment amount");
        }

        // Create individual payments for each contact's allocations
        const paymentPromises: Promise<any>[] = [];

        for (const contactAllocation of multiContactAllocations) {
          if (contactAllocation.pledges.length > 0) {
            const contactTotal = contactAllocation.pledges.reduce((sum, pledge) => sum + pledge.allocatedAmount, 0);

            if (contactTotal > 0) {
              // Create allocations array for this contact
              const allocations = contactAllocation.pledges.map((pledge) => ({
                pledgeId: Number(pledge.pledgeId),
                installmentScheduleId: null,
                allocatedAmount: Number(pledge.allocatedAmount),
                currency: data.currency,
                notes: null,
                receiptNumber: null,
                receiptType: null,
                receiptIssued: false,
              }));

              const contactPaymentPayload = {
                ...basePayload,
                amount: contactTotal,
                amountUsd: contactTotal / exchangeRateNum, // Convert to USD
                pledgeId: 0, // Split payment across multiple pledges
                isThirdPartyPayment: true,
                payerContactId: contactId,
                thirdPartyContactId: contactAllocation.contactId,
                allocations: allocations as any,
              };

              paymentPromises.push(createPaymentMutation.mutateAsync(contactPaymentPayload as any));
            }
          }
        }

        // Execute all payments
        await Promise.all(paymentPromises);

        toast.success(`Multi-contact payment created successfully for ${selectedMultiContacts.length} contacts!`);

      } else if (isSplit) {
        if (!data.allocations || data.allocations.length === 0) {
          throw new Error("Split payment requires at least one allocation.");
        }

        // Validate all allocations have valid pledge IDs
        for (const allocation of data.allocations) {
          if (!allocation.pledgeId || allocation.pledgeId === 0) {
            throw new Error("All allocations must have a valid pledge selected.");
          }
          if (!allocation.allocatedAmount || allocation.allocatedAmount <= 0) {
            throw new Error("All allocations must have an amount greater than 0.");
          }
        }

        const paymentPayload = {
          ...basePayload,
          pledgeId: 0,
          // Cast allocations to any to bypass TypeScript checking
          allocations: data.allocations.map((allocation) => ({
            pledgeId: Number(allocation.pledgeId),
            installmentScheduleId: allocation.installmentScheduleId ? Number(allocation.installmentScheduleId) : null,
            allocatedAmount: Number(allocation.allocatedAmount) || 0, // Changed from 'amount' to 'allocatedAmount'
            currency: data.currency, // Add currency from the main payment
            notes: allocation.notes || null,
            receiptNumber: allocation.receiptNumber || null,
            receiptType: allocation.receiptType || null,
            receiptIssued: allocation.receiptIssued || false,
          })) as any, // Type assertion to bypass strict typing
        };

        await createPaymentMutation.mutateAsync(paymentPayload as any);
      } else {
        if (!data.pledgeId || data.pledgeId === 0) {
          throw new Error("Single payment requires a valid pledge ID.");
        }

        const paymentPayload = {
          ...basePayload,
          pledgeId: Number(data.pledgeId),
          installmentScheduleId: data.allocations?.length === 1 && data.allocations[0].installmentScheduleId
            ? Number(data.allocations[0].installmentScheduleId)
            : null,
        };

        await createPaymentMutation.mutateAsync(paymentPayload as any);
      }

      // Success handling
      const paymentType = isMultiContact
        ? "Multi-contact payment"
        : isThirdParty
          ? "Third-party payment"
          : "Payment";
      const target = selectedThirdPartyContact ? ` for ${selectedThirdPartyContact.fullName}` : "";
      toast.success(`${paymentType}${target} created successfully!`);
      resetForm();
      setOpen(false);

    } catch (error) {
      console.error("Error creating payment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create payment");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  // Fix pledge options with useMemo and deduplication
  const pledgeOptions = useMemo(() => {
    if (!pledgesData?.pledges) return [];

    // Remove duplicates by pledge ID
    const uniquePledges = pledgesData.pledges.reduce((acc, pledge) => {
      if (!acc.find(p => p.id === pledge.id)) {
        acc.push(pledge);
      }
      return acc;
    }, [] as Pledge[]);

    // Filter pledges with scheduledAmount > 0
    const filteredPledges = uniquePledges;

    return filteredPledges.map((pledge: Pledge) => {
      // Calculate unscheduledAmount as balance minus scheduledAmount if available
      const balanceNum = parseFloat(pledge.balance);
      // Parse scheduledAmount from string to number
      const scheduledAmountNum = parseFloat((pledge as any).scheduledAmount || '0');
      const unscheduledAmountNum = Math.max(0, balanceNum - scheduledAmountNum);

      return {
        label: `#${pledge.id} - ${pledge.description || "No description"} (${pledge.currency} ${unscheduledAmountNum.toLocaleString()})`,
        value: pledge.id,
        balance: balanceNum,
        unscheduledAmount: unscheduledAmountNum,
        currency: pledge.currency,
        description: pledge.description || "No description",
        originalAmount: parseFloat(pledge.originalAmount),
      };
    });
  }, [pledgesData?.pledges]);

  const solicitorOptions = useMemo(() => {
    if (!solicitorsData?.solicitors) return [];

    return solicitorsData.solicitors.map((solicitor: Solicitor) => ({
      label: `${solicitor.firstName} ${solicitor.lastName}${solicitor.id ? ` (${solicitor.id})` : ""}`,
      value: solicitor.id,
      commissionRate: solicitor.commissionRate,
      contact: solicitor.contact,
    }));
  }, [solicitorsData?.solicitors]);

  const contactOptions = useMemo(() => {
    if (!contactsData?.contacts) return [];

    return contactsData.contacts.map((contact: Contact) => ({
      label: contact.fullName,
      value: contact.id,
      ...contact,
    }));
  }, [contactsData?.contacts]);

  const multiContactOptions = useMemo(() => {
    if (!multiContactsData?.contacts) return [];

    return multiContactsData.contacts.map((contact: Contact) => ({
      label: contact.fullName,
      value: contact.id,
      ...contact,
    }));
  }, [multiContactsData?.contacts]);

  const addAllocation = () => {
    append({
      pledgeId: 0,
      allocatedAmount: 0,
      installmentScheduleId: null,
      notes: null,
      receiptNumber: null,
      receiptType: null,
      receiptIssued: false,
    });
  };

  const removeAllocation = (index: number) => {
    remove(index);
  };

  const handleThirdPartyToggle = (checked: boolean) => {
    form.setValue("isThirdPartyPayment", checked);
    if (!checked) {
      setSelectedThirdPartyContact(null);
      setContactSearch("");
      form.setValue("thirdPartyContactId", null);
    }
  };

  const handleContactSelect = (contact: Contact) => {
    setSelectedThirdPartyContact(contact);
    form.setValue("thirdPartyContactId", contact.id);
    setContactSearch("");
    // Reset pledge selection when changing contact
    form.setValue("pledgeId", null);
    form.setValue("allocations", [
      {
        pledgeId: 0,
        allocatedAmount: 0,
        installmentScheduleId: null,
        notes: null,
        receiptNumber: null,
        receiptType: null,
        receiptIssued: false,
      },
    ]);
  };

  const handleMultiContactToggle = (checked: boolean) => {
    setShowMultiContactSection(checked);
    form.setValue("isMultiContactPayment", checked);
    if (!checked) {
      setSelectedMultiContacts([]);
      setMultiContactAllocations([]);
      setMultiContactSearch("");
      // Reset split payment if multi-contact is disabled
      form.setValue("isSplitPayment", false);
    } else {
      // Enable split payment when multi-contact is enabled
      form.setValue("isSplitPayment", true);
      form.setValue("pledgeId", null);
    }
  };

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
            {watchedIsThirdParty && selectedThirdPartyContact ? (
              <div>
                Recording payment for <strong>{selectedThirdPartyContact.fullName}</strong>
                <span className="block mt-1 text-sm text-muted-foreground">
                  This payment will appear in your account but apply to their pledge balance
                </span>
              </div>
            ) : watchedIsMultiContactPayment ? (
              "Record a payment split across multiple contacts and their pledges"
            ) : watchedIsSplitPayment ? (
              "Record a split payment across multiple pledges"
            ) : (
              "Record a payment for a pledge"
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(form.getValues());
            }}
            className="space-y-6"
          >
            {/* Third-Party Payment Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Payment Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isThirdPartyPayment"
                      checked={watchedIsThirdParty}
                      onCheckedChange={handleThirdPartyToggle}
                    />
                    <label
                      htmlFor="isThirdPartyPayment"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Third-Party Payment (Pay for someone else&apos;s pledge)
                    </label>
                  </div>

                  {watchedIsThirdParty && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Search for Contact</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Type to search contacts..."
                            value={contactSearch}
                            onChange={(e) => setContactSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      {contactSearch.length >= 2 && (
                        <div className="border rounded-md max-h-40 overflow-y-auto">
                          {isLoadingContacts ? (
                            <div className="p-3 text-center text-gray-500">Loading contacts...</div>
                          ) : contactOptions.length > 0 ? (
                            contactOptions.map((contact, index) => (
                              <button
                                key={`contact-${contact.value}-${index}`}
                                type="button"
                                className="w-full p-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                                onClick={() => handleContactSelect(contact)}
                              >
                                <div className="font-medium">{contact.label}</div>
                              </button>
                            ))
                          ) : (
                            <div className="p-3 text-center text-gray-500">No contacts found</div>
                          )}
                        </div>
                      )}

                      {selectedThirdPartyContact && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-blue-900">
                                Selected Contact: {selectedThirdPartyContact.fullName}
                              </div>
                              <div className="text-sm text-blue-700">
                                Payment will apply to this contact&apos;s pledge but appear in your account
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedThirdPartyContact(null);
                                form.setValue("thirdPartyContactId", null);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2 md:col-span-2">
                    <Switch
                      id="isMultiContactPayment"
                      checked={showMultiContactSection}
                      onCheckedChange={handleMultiContactToggle}
                    />
                    <label
                      htmlFor="isMultiContactPayment"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Multi-Contact Payment (Split payment across multiple contacts)
                    </label>
                  </div>

                  {!watchedIsMultiContactPayment && (
                    <div className="flex items-center space-x-2 md:col-span-2">
                      <Switch
                        id="isSplitPayment"
                        checked={watchedIsSplitPayment}
                        onCheckedChange={(checked) => {
                          form.setValue("isSplitPayment", checked);
                          if (checked) {
                            form.setValue("pledgeId", null);
                            form.setValue("allocations", [
                              {
                                pledgeId: 0,
                                allocatedAmount: 0,
                                installmentScheduleId: null,
                                notes: null,
                                receiptNumber: null,
                                receiptType: null,
                                receiptIssued: false,
                              },
                            ]);
                          } else {
                            form.setValue("allocations", [
                              {
                                pledgeId: initialPledgeId || 0,
                                allocatedAmount: 0,
                                installmentScheduleId: null,
                                notes: null,
                                receiptNumber: null,
                                receiptType: null,
                                receiptIssued: false,
                              },
                            ]);
                            if (initialPledgeId && !selectedThirdPartyContact) {
                              form.setValue("pledgeId", initialPledgeId);
                              const initialPledge = pledgesData?.pledges?.find(p => p.id === initialPledgeId);
                              if (initialPledge) {
                                const balance = parseFloat(initialPledge.balance);
                                form.setValue("amount", balance);
                                form.setValue("allocations.0.allocatedAmount", balance);
                                form.setValue(
                                  "currency",
                                  initialPledge.currency as typeof supportedCurrencies[number]
                                );
                              }
                            }
                          }
                        }}
                      />
                      <label
                        htmlFor="isSplitPayment"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Split Payment Across Multiple Pledges
                      </label>
                    </div>
                  )}

                  {!watchedIsSplitPayment && !watchedIsMultiContactPayment && (showPledgeSelector || watchedIsThirdParty) && (
                    <FormField
                      control={form.control}
                      name="pledgeId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col md:col-span-2">
                          <FormLabel>
                            Select Pledge
                            {watchedIsThirdParty && selectedThirdPartyContact && (
                              <span className="text-sm text-muted-foreground ml-2">
                                (from {selectedThirdPartyContact.fullName}&apos;s pledges)
                              </span>
                            )}
                          </FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between",
                                    (!field.value || field.value === 0) && "text-muted-foreground"
                                  )}
                                  disabled={isLoadingPledges || (watchedIsThirdParty && !selectedThirdPartyContact)}
                                >
                                  {field.value
                                    ? pledgeOptions.find(
                                      (pledge: any) => pledge.value === field.value
                                    )?.label
                                    : isLoadingPledges
                                      ? "Loading pledges..."
                                      : watchedIsThirdParty && !selectedThirdPartyContact
                                        ? "Select a contact first"
                                        : "Select pledge"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="Search pledges..." className="h-9" />
                                <CommandList className="max-h-[200px] overflow-y-auto">
                                  <CommandEmpty>No pledge found.</CommandEmpty>
                                  <CommandGroup>
                                    {pledgeOptions.map((pledge: any, index) => (
                                      <CommandItem
                                        value={pledge.label}
                                        key={`pledge-${pledge.value}-${index}`}
                                        onSelect={() => {
                                          if (field.value === pledge.value) {
                                            field.onChange(null);
                                            form.setValue("allocations.0.pledgeId", undefined);
                                            form.setValue("allocations.0.allocatedAmount", 0);
                                            form.setValue("amount", 0);
                                          } else {
                                            field.onChange(pledge.value);
                                            form.setValue("allocations.0.pledgeId", pledge.value);
                                            form.setValue("allocations.0.allocatedAmount", parseFloat(pledge.balance));
                                            form.setValue("amount", parseFloat(pledge.balance));
                                            const currency = pledge.currency as typeof supportedCurrencies[number];
                                            if (supportedCurrencies.includes(currency)) {
                                              form.setValue("currency", currency);
                                            }
                                          }
                                        }}
                                      >
                                        {pledge.label}
                                        <Check
                                          className={cn(
                                            "ml-auto h-4 w-4",
                                            pledge.value === field.value ? "opacity-100" : "opacity-0"
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

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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

                  {/* Exchange Rate - Non-editable input */}
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormLabel>
                          Exchange Rate (1 {watchedCurrency} = {field.value} USD)
                        </FormLabel>
                        <FormControl>
                          <Input type="number" step="0.0001" {...field} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Hidden USD field */}
                  <FormField
                    control={form.control}
                    name="amountUsd"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Pledge Exchange Rate */}
                  <FormField
                    control={form.control}
                    name="exchangeRateToPledgeCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Pledge Exchange Rate (1 {watchedCurrency} = {field.value} {selectedPledgeCurrency || "USD"})
                        </FormLabel>
                        <FormControl>
                          <Input type="number" step="0.0001" {...field} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Amount in Pledge Currency */}
                  <FormField
                    control={form.control}
                    name="amountInPledgeCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount in Pledge Currency ({selectedPledgeCurrency || "USD"})</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ""} onInput={(e) => {
                            const target = e.target as HTMLInputElement;
                            const value = target.value;
                            if (value) {
                              const parts = value.split("-");
                              // Check if year part is longer than 4 digits (handles both YYYY-MM-DD and direct year input)
                              if ((parts.length > 1 && parts[0] && parts[0].length > 4) || (parts.length === 1 && value.length > 4)) {
                                target.value = lastValidPaymentDateRef.current ?? "";
                                return;
                              }
                              lastValidPaymentDateRef.current = value;
                            } else {
                              lastValidPaymentDateRef.current = null;
                            }
                            field.onChange(value);
                          }} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="receivedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ""} onInput={(e) => {
                            const target = e.target as HTMLInputElement;
                            const value = target.value;
                            if (value) {
                              const parts = value.split("-");
                              if (parts[0] && parts[0].length > 4) {
                                target.value = field.value ?? "";
                                return;
                              }
                            }
                            field.onChange(value);
                          }} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

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
                                  ? paymentMethods.find((method) => method.value === field.value)?.label
                                  : "Select payment method"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search payment methods..." />
                              <CommandList className="max-h-[200px] overflow-y-auto">
                                <CommandEmpty>No payment method found.</CommandEmpty>
                                <CommandGroup>
                                  {paymentMethods.map((method, index) => (
                                    <CommandItem
                                      value={method.label}
                                      key={`payment-method-${method.value}-${index}`}
                                      onSelect={() => {
                                        form.setValue("paymentMethod", method.value, { shouldValidate: true, shouldDirty: true });
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          method.value === field.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {method.label}
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
                                  ? methodDetails.find((detail) => detail.value === field.value)?.label
                                  : "Select method detail"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search method details..." />
                              <CommandList className="max-h-[200px] overflow-y-auto">
                                <CommandEmpty>No method detail found.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="None"
                                    onSelect={() => {
                                      form.setValue("methodDetail", undefined, { shouldValidate: true, shouldDirty: true });
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
                                  {methodDetails.map((detail, index) => (
                                    <CommandItem
                                      value={detail.value}
                                      key={`method-detail-${detail.value}-${index}`}
                                      onSelect={() => {
                                        form.setValue("methodDetail", detail.value, { shouldValidate: true, shouldDirty: true });
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          detail.value === field.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {detail.label}
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
                    name="account"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account</FormLabel>
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
                                  ? accountOptions.find((account) => account.value === field.value)?.label
                                  : "Select account"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search accounts..." />
                              <CommandEmpty>No account found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="None"
                                  onSelect={() => {
                                    form.setValue("account", null, { shouldValidate: true, shouldDirty: true });
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
                                {accountOptions.map((account, index) => (
                                  <CommandItem
                                    value={account.value}
                                    key={`account-${account.value}-${index}`}
                                    onSelect={() => {
                                      form.setValue("account", account.value, { shouldValidate: true, shouldDirty: true });
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        account.value === field.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {account.label}
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

                  <div className="flex gap-4 md:col-span-2">
                    <FormField
                      control={form.control}
                      name="checkDate"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Check Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ""} onInput={(e) => {
                              const target = e.target as HTMLInputElement;
                              const value = target.value;
                              if (value) {
                                const parts = value.split("-");
                                if (parts[0] && parts[0].length > 4) {
                                  target.value = field.value ?? "";
                                  return;
                                }
                              }
                              field.onChange(value);
                            }} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="checkNumber"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Check Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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
              <label
                htmlFor="show-solicitor-section"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
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
                                    ? solicitorOptions.find((solicitor: any) => solicitor.value === field.value)?.label
                                    : isLoadingSolicitors
                                      ? "Loading solicitors..."
                                      : "Select solicitor"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="Search solicitors..." className="h-9" />
                                <CommandList>
                                  <CommandEmpty>No solicitor found.</CommandEmpty>
                                  <CommandGroup>
                                    {solicitorOptions.map((solicitor: any, index) => (
                                      <CommandItem
                                        value={solicitor.label}
                                        key={`solicitor-${solicitor.value}-${index}`}
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
                                            solicitor.value === field.value ? "opacity-100" : "opacity-0"
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

            {/* Multi-Contact Payment Section */}
            {showMultiContactSection && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Multi-Contact Payment
                    <Badge variant="secondary" className="ml-2">
                      {selectedMultiContacts.length} contact{selectedMultiContacts.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                  <DialogDescription>
                    Split this payment across multiple contacts and their pledges
                  </DialogDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Contact Search and Selection */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Search and Add Contacts</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Type to search contacts..."
                          value={multiContactSearch}
                          onChange={(e) => setMultiContactSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {multiContactSearch.length >= 2 && (
                      <div className="border rounded-md max-h-40 overflow-y-auto">
                        {isLoadingMultiContacts ? (
                          <div className="p-3 text-center text-gray-500">Loading contacts...</div>
                        ) : multiContactOptions.length > 0 ? (
                          multiContactOptions.map((contact, index) => (
                            <button
                              key={`multi-contact-${contact.value}-${index}`}
                              type="button"
                              className="w-full p-3 text-left hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between"
                              onClick={() => addMultiContact(contact)}
                            >
                              <div className="font-medium">{contact.label}</div>
                              <UserPlus className="h-4 w-4 text-blue-600" />
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-gray-500">No contacts found</div>
                        )}
                      </div>
                    )}

                    {/* Selected Contacts */}
                    {selectedMultiContacts.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Selected Contacts</label>
                        <div className="flex flex-wrap gap-2">
                          {selectedMultiContacts.map((contact) => (
                            <Badge key={contact.id} variant="default" className="flex items-center gap-2">
                              {contact.fullName}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMultiContact(contact.id)}
                                className="h-4 w-4 p-0 hover:bg-transparent"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Multi-Contact Allocation Matrix */}
                  {selectedMultiContacts.length > 0 && (
                    <div className="space-y-4">
                      <div className="border-t pt-4">
                        <h4 className="text-md font-semibold mb-3">Allocation Matrix</h4>
                        {allPledgesData.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="border border-gray-300 p-2 text-left font-medium">Contact</th>
                                  {selectedMultiContacts.map((contact) => {
                                    // Get pledges specific to this contact
                                    const contactPledges = allPledgesData.filter(pledge => {
                                      // Assuming pledge has contactId or similar field to identify ownership
                                      return pledge.contactId === contact.id || pledge.contact?.id === contact.id;
                                    });

                                    return contactPledges.map((pledge) => (
                                      <th key={`${contact.id}-${pledge.id}`} className="border border-gray-300 p-2 text-center font-medium min-w-[120px]">
                                        {pledge.description || `Pledge #${pledge.id}`}
                                        <br />
                                        <span className="text-xs text-gray-600">
                                          {pledge.currency} {parseFloat(pledge.balance).toLocaleString()}
                                        </span>
                                        <br />
                                        <span className="text-xs text-blue-600">
                                          {contact.fullName}
                                        </span>
                                      </th>
                                    ));
                                  })}
                                  <th className="border border-gray-300 p-2 text-center font-medium min-w-[100px]">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedMultiContacts.map((contact) => {
                                  // Get pledges specific to this contact
                                  const contactPledges = allPledgesData.filter(pledge =>
                                    pledge.contactId === contact.id || pledge.contact?.id === contact.id
                                  );

                                  return (
                                    <tr key={contact.id} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 p-2 font-medium">
                                        {contact.fullName}
                                      </td>
                                      {selectedMultiContacts.map((headerContact) => {
                                        const headerContactPledges = allPledgesData.filter(pledge =>
                                          pledge.contactId === headerContact.id || pledge.contact?.id === headerContact.id
                                        );

                                        return headerContactPledges.map((pledge) => {
                                          // Only show input if this pledge belongs to the current row contact
                                          const isOwnPledge = pledge.contactId === contact.id || pledge.contact?.id === contact.id;
                                          const allocation = multiContactAllocations
                                            .find(a => a.contactId === contact.id)
                                            ?.pledges.find(p => p.pledgeId === pledge.id);

                                          return (
                                            <td key={`${headerContact.id}-${pledge.id}`} className="border border-gray-300 p-2">
                                              {isOwnPledge ? (
                                                <Input
                                                  type="number"
                                                  step="0.01"
                                                  value={allocation?.allocatedAmount || 0}
                                                  onChange={(e) => {
                                                    const amount = parseFloat(e.target.value) || 0;
                                                    updateMultiContactAllocation(contact.id, pledge.id, amount);
                                                  }}
                                                  className="w-full text-center"
                                                  placeholder="0.00"
                                                />
                                              ) : (
                                                <div className="w-full text-center text-gray-300 py-2">-</div>
                                              )}
                                            </td>
                                          );
                                        });
                                      })}
                                      <td className="border border-gray-300 p-2 text-center font-medium">
                                        {(multiContactAllocations
                                          .find(a => a.contactId === contact.id)
                                          ?.pledges.reduce((sum, pledge) => sum + pledge.allocatedAmount, 0) || 0)
                                          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {/* Total Row */}
                                <tr className="bg-gray-50 font-medium">
                                  <td className="border border-gray-300 p-2 text-right">Total Allocated:</td>
                                  {selectedMultiContacts.map((contact) => {
                                    const contactPledges = allPledgesData.filter(pledge =>
                                      pledge.contactId === contact.id || pledge.contact?.id === contact.id
                                    );

                                    return contactPledges.map((pledge) => {
                                      const totalForPledge = multiContactAllocations.reduce((sum, allocation) => {
                                        const pledgeAllocation = allocation.pledges.find(p => p.pledgeId === pledge.id);
                                        return sum + (pledgeAllocation?.allocatedAmount || 0);
                                      }, 0);

                                      return (
                                        <td key={`total-${contact.id}-${pledge.id}`} className="border border-gray-300 p-2 text-center">
                                          {totalForPledge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      );
                                    });
                                  })}
                                  <td className="border border-gray-300 p-2 text-center">
                                    {getTotalMultiContactAllocation().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <div className="mb-2">No pledges found for selected contacts</div>
                            <div className="text-sm">Make sure the selected contacts have active pledges</div>
                          </div>
                        )}
                      </div>

                      {/* Validation Summary */}
                      {allPledgesData.length > 0 && (
                        <div className="border-t pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="flex justify-between">
                              <span>Payment Amount:</span>
                              <span className="font-medium">
                                {watchedCurrency} {(watchedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Allocated:</span>
                              <span className={cn(
                                "font-medium",
                                getTotalMultiContactAllocation() === (watchedAmount || 0) ? "text-green-600" : "text-red-600"
                              )}>
                                {watchedCurrency} {getTotalMultiContactAllocation().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Remaining:</span>
                              <span className={cn(
                                "font-medium",
                                (watchedAmount || 0) - getTotalMultiContactAllocation() >= 0 ? "text-gray-600" : "text-red-600"
                              )}>
                                {watchedCurrency} {((watchedAmount || 0) - getTotalMultiContactAllocation()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {getTotalMultiContactAllocation() !== (watchedAmount || 0) && getTotalMultiContactAllocation() > 0 && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-sm text-red-600 font-medium">⚠️ Allocation Mismatch</p>
                              <p className="text-xs text-red-600 mt-1">
                                Total allocated amount ({getTotalMultiContactAllocation().toFixed(2)}) must equal payment amount (
                                {(watchedAmount || 0).toFixed(2)})
                              </p>
                            </div>
                          )}

                          {getTotalMultiContactAllocation() === (watchedAmount || 0) && getTotalMultiContactAllocation() > 0 && (
                            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                              <p className="text-sm text-green-600 font-medium">✓ Allocations Balanced</p>
                              <p className="text-xs text-green-600 mt-1">All allocations are properly balanced</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Split Payment Allocations Section */}
            {watchedIsSplitPayment && !showMultiContactSection && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Payment Allocations
                    <Badge variant="secondary" className="ml-2">
                      {fields.length} allocation{fields.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                  <DialogDescription>
                    {watchedIsThirdParty && selectedThirdPartyContact
                      ? `Add allocation amounts for this split payment to ${selectedThirdPartyContact.fullName}'s pledges`
                      : "Add allocation amounts for this split payment"}
                  </DialogDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {fields.length > 0 ? (
                    fields.map((field, index) => (
                      <div
                        key={`${field.id}-${index}`}
                        className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow duration-200"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold">Allocation #{index + 1}</h4>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAllocation(index)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
                              aria-label={`Remove allocation ${index + 1}`}
                            >
                              <X className="h-5 w-5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Pledge Selection */}
                          <FormField
                            control={form.control}
                            name={`allocations.${index}.pledgeId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Pledge *
                                  {watchedIsThirdParty && selectedThirdPartyContact && (
                                    <span className="text-sm text-muted-foreground ml-2">
                                      (from {selectedThirdPartyContact.fullName}&apos;s pledges)
                                    </span>
                                  )}
                                </FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                          "w-full flex justify-between items-center min-w-0",
                                          (!field.value || field.value === 0) && "text-muted-foreground"
                                        )}
                                        disabled={isLoadingPledges || (watchedIsThirdParty && !selectedThirdPartyContact)}
                                      >
                                        <span className="block truncate max-w-[calc(100%-1.5rem)]" style={{ minWidth: 0 }}>
                                          {field.value
                                            ? pledgeOptions.find((pledge) => pledge.value === field.value)?.label
                                            : isLoadingPledges
                                              ? "Loading pledges..."
                                              : watchedIsThirdParty && !selectedThirdPartyContact
                                                ? "Select a contact first"
                                                : "Select pledge"}
                                        </span>
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
                                          {pledgeOptions.map((pledge, pledgeIndex) => (
                                            <CommandItem
                                              value={pledge.label}
                                              key={`allocation-${index}-pledge-${pledge.value}-${pledgeIndex}`}
                                              onSelect={() => {
                                                field.onChange(pledge.value);
                                              }}
                                            >
                                              <Check
                                                className={cn(
                                                  "mr-2 h-4 w-4",
                                                  pledge.value === field.value ? "opacity-100" : "opacity-0"
                                                )}
                                              />
                                              <div className="flex flex-col">
                                                <span>{pledge.description}</span>
                                                <span className="text-sm text-muted-foreground">
                                                  {pledge.currency} {pledge.unscheduledAmount.toLocaleString()}
                                                </span>
                                              </div>
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
                                    placeholder="0.00"
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

                          {/* Notes */}
                          <FormField
                            control={form.control}
                            name={`allocations.${index}.notes`}
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Optional notes for this allocation..."
                                    className="min-h-[80px]"
                                    {...field}
                                    value={field.value || ""}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Receipt Information */}
                          <div className="md:col-span-2 border-t pt-4">
                            <h5 className="text-md font-medium mb-3">Receipt Information</h5>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <FormField
                                control={form.control}
                                name={`allocations.${index}.receiptNumber`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Receipt Number</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Enter receipt number"
                                        {...field}
                                        value={field.value || ""}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`allocations.${index}.receiptType`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Receipt Type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select type" />
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

                              <FormField
                                control={form.control}
                                name={`allocations.${index}.receiptIssued`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                      <FormLabel className="text-base">Receipt Issued</FormLabel>
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
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Split className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No allocations added yet.</p>
                      <p className="text-sm">Click "Add Allocation" to get started.</p>
                    </div>
                  )}

                  {/* Add Allocation Button */}
                  <div className="flex justify-center pt-4">
                    <Button type="button" onClick={addAllocation} variant="outline" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add Allocation
                    </Button>
                  </div>

                  {/* Allocation Summary */}
                  {fields.length > 0 && (
                    <div className="border-t pt-4 mt-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span>Payment Amount:</span>
                          <span className="font-medium">
                            {watchedCurrency} {(watchedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Allocated:</span>
                          <span className={cn(
                            "font-medium",
                            totalAllocatedAmount === (watchedAmount || 0) ? "text-green-600" : "text-red-600"
                          )}>
                            {watchedCurrency} {totalAllocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Remaining:</span>
                          <span className={cn(
                            "font-medium",
                            remainingToAllocate >= 0 ? "text-gray-600" : "text-red-600"
                          )}>
                            {watchedCurrency} {remainingToAllocate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {remainingToAllocate !== 0 && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-sm text-yellow-600 font-medium">⚠️ Allocation Mismatch</p>
                          <p className="text-xs text-yellow-600 mt-1">
                            {remainingToAllocate > 0
                              ? `You have ${remainingToAllocate.toFixed(2)} ${watchedCurrency} remaining to allocate.`
                              : `You have over-allocated by ${Math.abs(remainingToAllocate).toFixed(2)} ${watchedCurrency}.`}
                          </p>
                        </div>
                      )}

                      {remainingToAllocate === 0 && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                          <p className="text-sm text-green-600 font-medium">✓ Allocations Balanced</p>
                          <p className="text-xs text-green-600 mt-1">All allocations are properly balanced</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notes Section */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional payment notes..."
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPaymentMutation.isPending}
              >
                {createPaymentMutation.isPending ? "Creating..." : "Create Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      {(selectedThirdPartyContact?.id || contactId) && (
        <PledgeDialog
          open={pledgeDialogOpen}
          onOpenChange={setPledgeDialogOpen}
          contactId={selectedThirdPartyContact?.id || contactId!}
          onPledgeCreated={(pledgeId) => {
            form.setValue("pledgeId", pledgeId);
            setPledgeDialogOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}