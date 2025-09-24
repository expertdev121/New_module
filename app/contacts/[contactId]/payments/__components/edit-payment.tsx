/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronsUpDown, Edit, Users, Split, AlertTriangle, Plus, X, Search, UserPlus, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useExchangeRates } from "@/lib/query/useExchangeRates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUpdatePaymentMutation } from "@/lib/query/payments/usePaymentQuery";
import { usePledgeDetailsQuery } from "@/lib/query/payment-plans/usePaymentPlanQuery";
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
  contactId?: number;
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

interface Allocation {
  id?: number;
  pledgeId: number;
  allocatedAmount: string;
  notes: string | null;
  installmentScheduleId?: number | null;
  currency?: string;
  allocatedAmountUsd?: string | null;
  pledgeDescription?: string | null;
  receiptNumber?: string | null;
  receiptType?: string | null;
  receiptIssued?: boolean;
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
  checkNumber: string | null;
  checkDate?: string | null;
  account?: string | null;
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
  // Third-party payment fields
  isThirdPartyPayment?: boolean;
  thirdPartyContactId?: number | null;
  payerContactId?: number | null;
  // Multi-contact payment fields
  isMultiContactPayment?: boolean;
  multiContactAllocations?: ContactAllocation[];
}

const useSolicitors = (params: { search?: string; status?: "active" | "inactive" | "suspended" } = {}) => {
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

const useContactById = (contactId?: number | null) =>
  useQuery<{ contact: Contact }>({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      if (!contactId) throw new Error("Contact ID is required");
      const response = await fetch(`/api/contacts/${contactId}`);
      if (!response.ok) throw new Error("Failed to fetch contact");
      return response.json();
    },
    enabled: !!contactId,
  });

// New hook to fetch pledge details including contact info
const usePledgeWithContact = (pledgeId?: number | null) =>
  useQuery<{ pledge: Pledge; contact: Contact }>({
    queryKey: ["pledge-with-contact", pledgeId],
    queryFn: async () => {
      if (!pledgeId) throw new Error("Pledge ID is required");
      const response = await fetch(`/api/pledges/${pledgeId}`);
      if (!response.ok) throw new Error("Failed to fetch pledge");
      return response.json();
    },
    enabled: !!pledgeId,
  });

const supportedCurrencies = [
  "USD", "ILS", "EUR", "JPY", "GBP", "AUD", "CAD", "ZAR",
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

const accountOptions = [
  { value: "Bank HaPoalim", label: "Bank HaPoalim" },
  { value: "Bank of Montreal", label: "Bank of Montreal" },
  { value: "Mizrachi Tfachot", label: "Mizrachi Tfachot" },
  { value: "MS - Donations", label: "MS - Donations" },
  { value: "MS - Operations", label: "MS - Operations" },
  { value: "Citibank", label: "Citibank" },
  { value: "Pagi", label: "Pagi" },
] as const;

const NO_SELECTION = "__NONE__"; // Sentinel for 'None' selection for Select components

const editPaymentSchema = z
  .object({
    paymentId: z.number().positive(),
    amount: z.number().positive("Amount must be positive").optional(),
    currency: z.enum([...supportedCurrencies] as [string, ...string[]]).optional(),
    amountUsd: z.number().positive("Amount in USD must be positive").optional(),
    amountInPledgeCurrency: z.number().positive("Amount in pledge currency must be positive").optional(),
    exchangeRate: z.number().positive("Exchange rate must be positive").optional(),
    exchangeRateToPledgeCurrency: z.number().positive("Exchange rate to pledge currency must be positive").optional(),
    paymentDate: z.string().min(1, "Payment date is required").optional(),
    receivedDate: z.string().optional().nullable(),
    methodDetail: z.string().optional().nullable(),
    paymentMethod: z.string().optional().nullable(),
    paymentStatus: z.string().optional(),
    account: z.string().optional().nullable(),
    checkDate: z.string().optional().nullable(),
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

    // Third-party payment fields
    isThirdPartyPayment: z.boolean().optional(),
    thirdPartyContactId: z.number().positive().optional().nullable(),
    payerContactId: z.number().positive().optional().nullable(),

    // Multi-contact payment fields
    isMultiContactPayment: z.boolean().optional(),

    allocations: z
      .array(
        z.object({
          id: z.number().optional(),
          pledgeId: z.number().positive(),
          allocatedAmount: z.number().positive("Amount must be positive"),
          notes: z.string().nullable(),
          currency: z.string().optional(),
          receiptNumber: z.string().optional().nullable(),
          receiptType: z.enum(receiptTypes.map((t) => t.value) as [string, ...string[]]).optional().nullable(),
          receiptIssued: z.boolean().optional(),
        })
      )
      .optional(),
    // New fields for installment management
    autoAdjustAllocations: z.boolean().optional(),
    redistributionMethod: z.enum(["proportional", "equal", "custom"]).optional(),
  })
  .refine(
    (data) => {
      if (data.isSplitPayment && data.allocations && data.amount) {
        const totalAllocated = data.allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
        return Math.abs(totalAllocated - data.amount) < 0.01;
      }
      return true;
    },
    {
      message: "Total allocated amount must equal payment amount",
      path: ["allocations"],
    }
  )
  .refine(
    (data) => {
      // Third-party payment validation
      if (data.isThirdPartyPayment && !data.thirdPartyContactId) {
        return false;
      }
      return true;
    },
    {
      message: "Third-party contact must be selected for third-party payments",
      path: ["thirdPartyContactId"],
    }
  );

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
  contactId: propContactId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditPaymentDialogProps) {
  const { data: solicitorsData } = useSolicitors({ status: "active" });
  const contactId = useContactId() || propContactId || payment.contactId;

  // Third-party payment state
  const [contactSearch, setContactSearch] = useState("");
  const [selectedThirdPartyContact, setSelectedThirdPartyContact] = useState<Contact | null>(null);

  // Multi-contact payment state
  const [selectedMultiContacts, setSelectedMultiContacts] = useState<Contact[]>([]);
  const [multiContactAllocations, setMultiContactAllocations] = useState<ContactAllocation[]>([]);
  const [showMultiContactSection, setShowMultiContactSection] = useState(false);
  const [multiContactSearch, setMultiContactSearch] = useState("");

  // Check if this payment is already a third-party or multi-contact payment
  const isExistingThirdPartyPayment = payment.isThirdPartyPayment || false;
  const isExistingMultiContactPayment = payment.isMultiContactPayment || false;
  const existingThirdPartyContactId = payment.thirdPartyContactId || null;

  // NEW: Get pledge details with contact info for third-party payments
  const { data: pledgeWithContactData, isLoading: isLoadingPledgeWithContact } = usePledgeWithContact(
    isExistingThirdPartyPayment && payment.pledgeId ? payment.pledgeId : null
  );

  // Fetch third-party contact details if not available from pledge data
  const { data: thirdPartyContactData } = useContactById(existingThirdPartyContactId);

  // Get pledges for the current contact or third-party contact
  const targetContactId = selectedThirdPartyContact?.id || contactId;
  const { data: pledgesData, isLoading: isLoadingPledges } = usePledgesQuery(
    {
      contactId: targetContactId as number,
      page: 1,
      limit: 100,
      status: undefined,
    },
    { enabled: !!targetContactId && !showMultiContactSection }
  );

  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(contactSearch);
  const { data: multiContactsData, isLoading: isLoadingMultiContacts } = useContacts(multiContactSearch);

  // Multi-contact pledge fetching
  const multiContactIds = selectedMultiContacts.map(c => c.id);
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
      const allPledges = results.flat();

      return { pledges: allPledges };
    },
    enabled: multiContactIds.length > 0,
  });

  const allPledgesData = useMemo(() => {
    return multiContactPledgesData?.pledges || [];
  }, [multiContactPledgesData]);

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

  const [internalOpen, setInternalOpen] = useState(false);
  const [showSolicitorSection, setShowSolicitorSection] = useState(!!payment.solicitorId);
  const [showAmountChangeWarning, setShowAmountChangeWarning] = useState(false);
  const [autoAdjustAllocations, setAutoAdjustAllocations] = useState(false);
  const [redistributionMethod, setRedistributionMethod] = useState<"proportional" | "equal" | "custom">("proportional");
  const [canConvertToSplit, setCanConvertToSplit] = useState(false);
  const [originalAmount] = useState(parseFloat(payment.amount));

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => { })) : setInternalOpen;

  const isPaymentPlanPayment = payment.paymentPlanId !== null;
  const isSplitPayment = payment.isSplitPayment || false;

  const { data: pledgeData } = usePledgeDetailsQuery(payment.pledgeId || 0, {
    enabled: !!payment.pledgeId && !isSplitPayment && !payment.pledgeDescription,
  });

  const form = useForm<EditPaymentFormData>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      paymentId: payment.id,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      amountUsd: payment.amountUsd ? parseFloat(payment.amountUsd) : undefined,
      amountInPledgeCurrency: payment.amountInPledgeCurrency ? parseFloat(payment.amountInPledgeCurrency) : undefined,
      exchangeRate: payment.exchangeRate ? parseFloat(payment.exchangeRate) : 1,
      exchangeRateToPledgeCurrency: 1,
      paymentDate: payment.paymentDate,
      receivedDate: payment.receivedDate || null,
      paymentMethod: payment.paymentMethod ?? undefined,
      methodDetail: payment.methodDetail ?? undefined,
      paymentStatus: payment.paymentStatus ?? undefined,
      account: payment.account ?? undefined,
      checkDate: payment.checkDate ?? undefined,
      checkNumber: payment.checkNumber ?? undefined,
      receiptNumber: isSplitPayment ? undefined : (payment.receiptNumber ?? undefined),
      receiptType: isSplitPayment ? undefined : (payment.receiptType ?? undefined),
      receiptIssued: isSplitPayment ? false : payment.receiptIssued,
      solicitorId: payment.solicitorId ?? undefined,
      bonusPercentage: payment.bonusPercentage ? parseFloat(payment.bonusPercentage) : undefined,
      bonusAmount: payment.bonusAmount ? parseFloat(payment.bonusAmount) : undefined,
      bonusRuleId: payment.bonusRuleId ?? undefined,
      notes: payment.notes ?? undefined,
      pledgeId: payment.pledgeId || null,
      paymentPlanId: payment.paymentPlanId || null,
      isSplitPayment: isSplitPayment,
      // Third-party payment defaults
      isThirdPartyPayment: isExistingThirdPartyPayment,
      thirdPartyContactId: existingThirdPartyContactId,
      payerContactId: payment.payerContactId || null,
      // Multi-contact payment defaults
      isMultiContactPayment: isExistingMultiContactPayment,
      autoAdjustAllocations: false,
      redistributionMethod: "proportional",
      allocations: isSplitPayment && payment.allocations
        ? payment.allocations.map(alloc => ({
          id: alloc.id,
          pledgeId: alloc.pledgeId,
          allocatedAmount: parseFloat(alloc.allocatedAmount),
          notes: alloc.notes,
          currency: alloc.currency || payment.currency,
          receiptNumber: alloc.receiptNumber || null,
          receiptType: alloc.receiptType || null,
          receiptIssued: alloc.receiptIssued ?? false,
        }))
        : payment.pledgeId
          ? [{
            pledgeId: payment.pledgeId,
            allocatedAmount: parseFloat(payment.amount),
            notes: null,
            currency: payment.currency,
            receiptNumber: payment.receiptNumber || null,
            receiptType: payment.receiptType || null,
            receiptIssued: payment.receiptIssued ?? false,
          }]
          : [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
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
  const watchedIsSplitPayment = form.watch("isSplitPayment");
  const watchedIsMultiContactPayment = form.watch("isMultiContactPayment");
  const watchedAllocations = form.watch("allocations");
  const watchedIsThirdParty = form.watch("isThirdPartyPayment");
  const watchedThirdPartyContactId = form.watch("thirdPartyContactId");
  const watchedPledgeId = form.watch("pledgeId");

  const {
    data: exchangeRatesData,
    isLoading: isLoadingRates,
    error: ratesError,
  } = useExchangeRates(watchedReceivedDate || undefined);

  const totalAllocatedAmount = (watchedAllocations || []).reduce(
    (sum, alloc) => sum + (alloc.allocatedAmount || 0),
    0
  );
  const remainingToAllocate = (watchedAmount || 0) - totalAllocatedAmount;

  // Initialize existing multi-contact data if this is a multi-contact payment
  useEffect(() => {
    if (isExistingMultiContactPayment && payment.multiContactAllocations && !selectedMultiContacts.length) {
      // Load existing multi-contact data
      setShowMultiContactSection(true);
      form.setValue("isMultiContactPayment", true);
      form.setValue("isSplitPayment", true);

      // Initialize contacts and allocations from payment data
      const contacts = payment.multiContactAllocations.map(allocation => ({
        id: allocation.contactId,
        fullName: allocation.contactName,
        firstName: "",
        lastName: ""
      }));
      setSelectedMultiContacts(contacts);
      setMultiContactAllocations(payment.multiContactAllocations);
    }
  }, [isExistingMultiContactPayment, payment.multiContactAllocations, selectedMultiContacts.length, form]);

  // NEW: Effect to load and set the third-party contact from pledge data
  useEffect(() => {
    if (isExistingThirdPartyPayment && pledgeWithContactData?.contact && !selectedThirdPartyContact) {
      const thirdPartyContact = pledgeWithContactData.contact;
      setSelectedThirdPartyContact(thirdPartyContact);
      // Also update the form with the correct thirdPartyContactId
      form.setValue("thirdPartyContactId", thirdPartyContact.id);
    }
  }, [isExistingThirdPartyPayment, pledgeWithContactData, selectedThirdPartyContact, form]);

  // Effect to clear pledge selection when third-party contact changes
  useEffect(() => {
    if (watchedIsThirdParty && !isExistingThirdPartyPayment) {
      // Only reset for new third-party payments, not existing ones
      form.setValue("pledgeId", null);
      if (watchedIsSplitPayment) {
        form.setValue("allocations", [{
          pledgeId: 0,
          allocatedAmount: 0,
          notes: null,
          currency: payment.currency,
          receiptNumber: null,
          receiptType: null,
          receiptIssued: false,
        }]);
      }
    }
  }, [selectedThirdPartyContact, watchedIsThirdParty, watchedIsSplitPayment, form, payment.currency, isExistingThirdPartyPayment]);

  // Check if payment can be converted to split
  useEffect(() => {
    setCanConvertToSplit(!isPaymentPlanPayment && !isSplitPayment && !!payment.pledgeId);
  }, [isPaymentPlanPayment, isSplitPayment, payment.pledgeId]);

  // Auto-adjust allocations when amount changes
  const redistributeAllocations = useCallback((newAmount: number, method: "proportional" | "equal" | "custom") => {
    if (!watchedIsSplitPayment || !watchedAllocations || watchedAllocations.length === 0) return;

    const totalOriginal = watchedAllocations.reduce(
      (sum, alloc) => sum + (alloc.allocatedAmount || 0),
      0
    );
    if (totalOriginal === 0) return;

    let newAllocations: any[];
    switch (method) {
      case "proportional":
        // Maintain proportional distribution
        newAllocations = watchedAllocations.map((alloc) => {
          const proportion = (alloc.allocatedAmount || 0) / totalOriginal;
          const newAllocationAmount = newAmount * proportion;
          return {
            ...alloc,
            allocatedAmount: newAllocationAmount,
          };
        });
        break;
      case "equal":
        // Distribute equally among all allocations
        const equalAmount = newAmount / watchedAllocations.length;
        newAllocations = watchedAllocations.map((alloc) => ({
          ...alloc,
          allocatedAmount: equalAmount,
        }));
        break;
      case "custom":
      default:
        // Keep existing allocations, user will adjust manually
        newAllocations = [...watchedAllocations];
        break;
    }

    // Ensure the total equals the new amount (handle rounding errors)
    const newTotal = newAllocations.reduce((sum, alloc) => sum + (alloc.allocatedAmount || 0), 0);
    const difference = newAmount - newTotal;
    if (Math.abs(difference) > 0.001 && newAllocations.length > 0) {
      // Add the difference to the first allocation
      const firstAllocation = newAllocations[0];
      const adjustedAmount = (firstAllocation.allocatedAmount || 0) + difference;
      newAllocations[0] = {
        ...firstAllocation,
        allocatedAmount: adjustedAmount,
      };
    }

    replace(newAllocations);
  }, [watchedIsSplitPayment, watchedAllocations, replace]);

  // Handle auto-adjustment when amount changes
  useEffect(() => {
    if (!watchedIsSplitPayment || !autoAdjustAllocations || !watchedAmount) return;

    const currentAmount = watchedAmount;
    const originalTotal = totalAllocatedAmount;

    // Only auto-adjust if the amounts don't match
    if (Math.abs(currentAmount - originalTotal) > 0.01) {
      redistributeAllocations(currentAmount, redistributionMethod);
    }
  }, [watchedAmount, autoAdjustAllocations, redistributionMethod, redistributeAllocations, watchedIsSplitPayment, totalAllocatedAmount]);

  // Show warning when amount changes
  useEffect(() => {
    if (watchedIsSplitPayment && watchedAmount && Math.abs(watchedAmount - originalAmount) > 0.01) {
      setShowAmountChangeWarning(true);
    } else {
      setShowAmountChangeWarning(false);
    }
  }, [watchedAmount, originalAmount, watchedIsSplitPayment]);

  const areAllocationsValid = () => {
    if (showMultiContactSection) {
      return getTotalMultiContactAllocation() === (watchedAmount || 0);
    }
    if (!watchedIsSplitPayment || !watchedAllocations || watchedAllocations.length === 0) return true;
    const paymentAmount = watchedAmount || parseFloat(payment.amount);
    return Math.abs(totalAllocatedAmount - paymentAmount) < 0.01;
  };

  const areAllocationCurrenciesValid = () => {
    if (!watchedIsSplitPayment) return true;
    const paymentCurrency = watchedCurrency || payment.currency;
    return watchedAllocations?.every(
      (allocation) => (allocation.currency || payment.currency) === paymentCurrency
    ) ?? true;
  };

  // Handle manual redistribution
  const handleRedistribute = () => {
    if (watchedAmount) {
      redistributeAllocations(watchedAmount, redistributionMethod);
      toast.success(`Allocations redistributed using ${redistributionMethod} method`);
    }
  };

  // Handle undo split payment functionality
  const handleUndoSplitPayment = (targetPledgeId: number) => {
    // Find the allocation for the target pledge to get receipt info
    const targetAllocation = watchedAllocations?.find(alloc => alloc.pledgeId === targetPledgeId);

    // Convert to regular payment
    form.setValue("isSplitPayment", false);
    form.setValue("isMultiContactPayment", false);
    form.setValue("pledgeId", targetPledgeId);
    setShowMultiContactSection(false);

    // Restore receipt information from the target allocation if available
    if (targetAllocation) {
      form.setValue("receiptNumber", targetAllocation.receiptNumber);
      form.setValue("receiptType", targetAllocation.receiptType);
      form.setValue("receiptIssued", targetAllocation.receiptIssued ?? false);
    } else {
      // Clear receipt fields if no target allocation found
      form.setValue("receiptNumber", null);
      form.setValue("receiptType", null);
      form.setValue("receiptIssued", false);
    }

    // Clear allocations and multi-contact data
    replace([]);
    setSelectedMultiContacts([]);
    setMultiContactAllocations([]);

    toast.success(`Split payment converted to regular payment for Pledge #${targetPledgeId}`);
  };

  // Handle third-party payment toggle
  const handleThirdPartyToggle = (checked: boolean) => {
    form.setValue("isThirdPartyPayment", checked);
    if (!checked) {
      setSelectedThirdPartyContact(null);
      setContactSearch("");
      form.setValue("thirdPartyContactId", null);
      form.setValue("payerContactId", null);
    } else {
      // Set the current contact as the payer when enabling third-party mode
      form.setValue("payerContactId", contactId || null);
    }
  };

  // Handle contact selection
  const handleContactSelect = (contact: Contact) => {
    setSelectedThirdPartyContact(contact);
    form.setValue("thirdPartyContactId", contact.id);
    setContactSearch("");
    // Reset pledge selection when changing contact
    form.setValue("pledgeId", null);
    if (watchedIsSplitPayment) {
      form.setValue("allocations", [{
        pledgeId: 0,
        allocatedAmount: 0,
        notes: null,
        currency: payment.currency,
        receiptNumber: null,
        receiptType: null,
        receiptIssued: false,
      }]);
    }
  };

  // Handle multi-contact payment toggle
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

  // Handle split payment toggle
  const handleSplitPaymentToggle = (checked: boolean) => {
    form.setValue("isSplitPayment", checked);
    if (checked) {
      // Converting to split payment
      if (payment.pledgeId) {
        // Start with current payment as first allocation
        const currentAllocation = {
          pledgeId: payment.pledgeId,
          allocatedAmount: parseFloat(payment.amount),
          notes: null,
          currency: payment.currency,
          receiptNumber: payment.receiptNumber || null,
          receiptType: payment.receiptType || null,
          receiptIssued: payment.receiptIssued ?? false,
        };
        replace([currentAllocation]);
      } else {
        // No existing pledge, start with empty allocation
        replace([{
          pledgeId: 0,
          allocatedAmount: 0,
          notes: null,
          currency: payment.currency,
          receiptNumber: null,
          receiptType: null,
          receiptIssued: false,
        }]);
      }
      // Clear single payment fields
      form.setValue("pledgeId", null);
      form.setValue("receiptNumber", null);
      form.setValue("receiptType", null);
      form.setValue("receiptIssued", false);
    } else {
      // Converting back to single payment
      if (watchedAllocations && watchedAllocations.length > 0) {
        const firstAllocation = watchedAllocations[0];
        form.setValue("pledgeId", firstAllocation.pledgeId);
        form.setValue("receiptNumber", firstAllocation.receiptNumber);
        form.setValue("receiptType", firstAllocation.receiptType);
        form.setValue("receiptIssued", firstAllocation.receiptIssued ?? false);
      }
      replace([]);
      // Also disable multi-contact if split is disabled
      setShowMultiContactSection(false);
      form.setValue("isMultiContactPayment", false);
    }
  };

  // Add new allocation
  const addAllocation = () => {
    append({
      pledgeId: 0,
      allocatedAmount: 0,
      notes: null,
      currency: watchedCurrency || payment.currency,
      receiptNumber: null,
      receiptType: null,
      receiptIssued: false,
    });
  };

  // Remove allocation
  const removeAllocation = (index: number) => {
    remove(index);
  };

  // Enhanced exchange rate and date validation effect
  useEffect(() => {
    // Determine the date to use for exchange rate: receivedDate if available, else today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dateToUse: string | null = null;
    if (watchedReceivedDate) {
      dateToUse = watchedReceivedDate;
    } else {
      // Use today's date in ISO format if no received date
      dateToUse = today.toISOString().split("T")[0];
    }

    if (!dateToUse) return;

    const selectedDate = new Date(dateToUse);
    selectedDate.setHours(0, 0, 0, 0);

    // Clear any existing payment date errors since future dates are now allowed
    form.clearErrors("paymentDate");

    // Refetch exchange rates when dateToUse or currency changes
    // useExchangeRates hook should handle refetching based on dateToUse

    if (watchedCurrency && exchangeRatesData?.data?.rates) {
      const rate = parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
      form.setValue("exchangeRate", rate);

      // Show appropriate toast based on which date is being used
      if (watchedReceivedDate) {
        if (selectedDate > today) {
          toast.info(`Using today's exchange rate (received date is in future)`);
        } else {
          toast.success(`Exchange rate updated based on received date`);
        }
      } else {
        toast.info(`Using today's exchange rate (no received date set, using today's date)`);
      }
    }
  }, [watchedCurrency, watchedReceivedDate, exchangeRatesData, form]);

  useEffect(() => {
    if (watchedAmount && watchedExchangeRate) {
      const usdAmount = watchedAmount / watchedExchangeRate;
      form.setValue("amountUsd", Math.round(usdAmount * 100) / 100);
    }
  }, [watchedAmount, watchedExchangeRate, form]);

  const pledgeOptions = useMemo(() => {
    if (!pledgesData?.pledges) return [];

    // Remove duplicates by pledge ID
    const uniquePledges = pledgesData.pledges.reduce((acc, pledge) => {
      if (!acc.find(p => p.id === pledge.id)) {
        acc.push(pledge);
      }
      return acc;
    }, [] as Pledge[]);

    const filteredPledges = uniquePledges;

    return filteredPledges.map((pledge: Pledge) => ({
      label: `#${pledge.id} - ${pledge.description || "No description"} (${pledge.currency} ${parseFloat(pledge.balance).toLocaleString()})`,
      value: pledge.id,
      balance: parseFloat(pledge.balance),
      currency: pledge.currency,
      description: pledge.description || "No description",
      originalAmount: parseFloat(pledge.originalAmount),
    }));
  }, [pledgesData?.pledges]);

  // Calculate amount in pledge currency
  useEffect(() => {
    if (watchedAmount && watchedCurrency && watchedPledgeId != null && exchangeRatesData?.data?.rates && !watchedIsSplitPayment) {
      const pledgeOption = pledgeOptions.find(p => p.value === watchedPledgeId);
      if (pledgeOption) {
        const pledgeCurrency = pledgeOption.currency;

        // Skip calculation if payment currency and pledge currency are the same
        if (watchedCurrency === pledgeCurrency) {
          form.setValue("amountInPledgeCurrency", watchedAmount);
          return;
        }

        const paymentCurrencyRate = parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
        const pledgeCurrencyRate = parseFloat(exchangeRatesData.data.rates[pledgeCurrency]) || 1;

        if (paymentCurrencyRate && pledgeCurrencyRate) {
          // Convert payment amount to USD first, then to pledge currency
          const amountInUSD = watchedAmount / paymentCurrencyRate;
          const amountInPledgeCurrency = amountInUSD * pledgeCurrencyRate;
          form.setValue("amountInPledgeCurrency", Math.round(amountInPledgeCurrency * 100) / 100);
        }
      }
    } else if (watchedIsSplitPayment || !watchedPledgeId) {
      // For split payments or no pledge selected, clear the field
      // Use undefined instead of null for TypeScript compatibility
      form.setValue("amountInPledgeCurrency", undefined);
    }
  }, [watchedAmount, watchedCurrency, watchedPledgeId, exchangeRatesData, watchedIsSplitPayment, pledgeOptions, form]);

  useEffect(() => {
    if (watchedCurrency && watchedPledgeId != null && exchangeRatesData?.data?.rates && !watchedIsSplitPayment) {
      const pledgeOption = pledgeOptions.find(p => p.value === watchedPledgeId);
      if (pledgeOption) {
        const pledgeCurrency = pledgeOption.currency;

        // Skip calculation if payment currency and pledge currency are the same
        if (watchedCurrency === pledgeCurrency) {
          form.setValue("exchangeRateToPledgeCurrency", 1);
          return;
        }

        const paymentCurrencyRate = parseFloat(exchangeRatesData.data.rates[watchedCurrency]) || 1;
        const pledgeCurrencyRate = parseFloat(exchangeRatesData.data.rates[pledgeCurrency]) || 1;

        if (paymentCurrencyRate && pledgeCurrencyRate) {
          // Calculate the exchange rate from payment currency to pledge currency
          const exchangeRateToPledge = pledgeCurrencyRate / paymentCurrencyRate;
          form.setValue("exchangeRateToPledgeCurrency", Math.round(exchangeRateToPledge * 10000) / 10000);
        }
      }
    } else if (watchedIsSplitPayment || !watchedPledgeId) {
      // For split payments or no pledge selected, reset to 1
      form.setValue("exchangeRateToPledgeCurrency", 1);
    }
  }, [watchedCurrency, watchedPledgeId, exchangeRatesData, watchedIsSplitPayment, pledgeOptions, form]);

  useEffect(() => {
    if (watchedBonusPercentage != null && watchedAmount != null) {
      const bonusAmount = (watchedAmount * watchedBonusPercentage) / 100;
      form.setValue("bonusAmount", Math.round(bonusAmount * 100) / 100);
    } else {
      // Use undefined instead of null for TypeScript compatibility
      form.setValue("bonusAmount", undefined);
    }
  }, [watchedBonusPercentage, watchedAmount, form]);

  useEffect(() => {
    setShowSolicitorSection(!!watchedSolicitorId);
  }, [watchedSolicitorId]);

  // Update allocation currencies when payment currency changes
  useEffect(() => {
    if (
      watchedIsSplitPayment &&
      watchedCurrency &&
      watchedAllocations &&
      watchedAllocations.length > 0
    ) {
      const needsUpdate = watchedAllocations.some(a => a.currency !== watchedCurrency);
      if (needsUpdate) {
        const updatedAllocations = watchedAllocations.map(allocation => ({
          ...allocation,
          currency: watchedCurrency,
        }));
        replace(updatedAllocations);
      }
    }
  }, [watchedCurrency, watchedIsSplitPayment, watchedAllocations, replace]);

  // Reset form and allocations on close
  const resetForm = useCallback(() => {
    form.reset({
      paymentId: payment.id,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      amountUsd: payment.amountUsd ? parseFloat(payment.amountUsd) : undefined,
      amountInPledgeCurrency: payment.amountInPledgeCurrency
        ? parseFloat(payment.amountInPledgeCurrency)
        : undefined,
      exchangeRate: payment.exchangeRate ? parseFloat(payment.exchangeRate) : 1,
      exchangeRateToPledgeCurrency: 1,
      paymentDate: payment.paymentDate,
      receivedDate: payment.receivedDate || null,
      paymentMethod: payment.paymentMethod,
      methodDetail: payment.methodDetail || null,
      paymentStatus: payment.paymentStatus,
      account: payment.account || null,
      checkDate: payment.checkDate || null,
      checkNumber: payment.checkNumber || null,
      receiptNumber: isSplitPayment ? null : payment.receiptNumber || null,
      receiptType: isSplitPayment ? null : payment.receiptType || null,
      receiptIssued: isSplitPayment ? false : payment.receiptIssued,
      solicitorId: payment.solicitorId || null,
      bonusPercentage: payment.bonusPercentage ? parseFloat(payment.bonusPercentage) : null,
      bonusAmount: payment.bonusAmount ? parseFloat(payment.bonusAmount) : null,
      bonusRuleId: payment.bonusRuleId || null,
      notes: payment.notes || null,
      pledgeId: payment.pledgeId || null,
      paymentPlanId: payment.paymentPlanId || null,
      isSplitPayment: isSplitPayment,
      isThirdPartyPayment: isExistingThirdPartyPayment,
      thirdPartyContactId: existingThirdPartyContactId,
      payerContactId: payment.payerContactId || null,
      isMultiContactPayment: isExistingMultiContactPayment,
      autoAdjustAllocations: false,
      redistributionMethod: "proportional",
    });
    setShowSolicitorSection(!!payment.solicitorId);
    setAutoAdjustAllocations(false);
    setRedistributionMethod("proportional");
    setShowAmountChangeWarning(false);
    setSelectedThirdPartyContact(null);
    setContactSearch("");
    setShowMultiContactSection(isExistingMultiContactPayment);
    setSelectedMultiContacts(isExistingMultiContactPayment && payment.multiContactAllocations
      ? payment.multiContactAllocations.map(allocation => ({
        id: allocation.contactId,
        fullName: allocation.contactName,
        firstName: "",
        lastName: ""
      }))
      : []);
    setMultiContactAllocations(isExistingMultiContactPayment && payment.multiContactAllocations
      ? payment.multiContactAllocations
      : []);

    // If editing an existing third-party payment, restore the contact
    if (isExistingThirdPartyPayment && existingThirdPartyContactId) {
      // This will be handled by the effect that loads the existing contact
    }

    // Reset allocations
    const initialAllocations = isSplitPayment && payment.allocations
      ? payment.allocations.map(alloc => ({
        id: alloc.id,
        pledgeId: alloc.pledgeId,
        allocatedAmount: parseFloat(alloc.allocatedAmount),
        notes: alloc.notes,
        currency: alloc.currency || payment.currency,
        receiptNumber: alloc.receiptNumber || null,
        receiptType: alloc.receiptType || null,
        receiptIssued: alloc.receiptIssued ?? false,
      }))
      : payment.pledgeId
        ? [{
          pledgeId: payment.pledgeId,
          allocatedAmount: parseFloat(payment.amount),
          notes: null,
          currency: payment.currency,
          receiptNumber: payment.receiptNumber || null,
          receiptType: payment.receiptType || null,
          receiptIssued: payment.receiptIssued ?? false,
        }]
        : [];
    replace(initialAllocations);
  }, [form, payment, isSplitPayment, replace, isExistingThirdPartyPayment, existingThirdPartyContactId, isExistingMultiContactPayment]);

  const updatePaymentMutation = useUpdatePaymentMutation(watchedIsSplitPayment ? payment.id : watchedPledgeId || payment.pledgeId || 0);

  // Get pledge currency for exchange rate display
  const selectedPledgeCurrency = useMemo(() => {
    if (!watchedPledgeId || !pledgesData?.pledges) return null;
    const pledge = pledgesData.pledges.find(p => p.id === watchedPledgeId);
    return pledge?.currency || null;
  }, [watchedPledgeId, pledgesData?.pledges]);

  const onSubmit = async (data: EditPaymentFormData) => {
    try {
      if (showMultiContactSection) {
        // Handle multi-contact payment validation
        if (getTotalMultiContactAllocation() !== (data.amount || 0)) {
          toast.error("Multi-contact payment allocation amounts must equal the total payment amount");
          return;
        }

        // For multi-contact payments, we need to handle the update differently
        // This would typically involve updating multiple payment records or
        // updating the payment structure to support multi-contact allocations
        const multiContactPayload = {
          ...data,
          isMultiContactPayment: true,
          multiContactAllocations: multiContactAllocations,
        };

        await updatePaymentMutation.mutateAsync(multiContactPayload as any);
      } else if (watchedIsSplitPayment) {
        if (!areAllocationsValid()) {
          toast.error("Total allocated amount must equal payment amount");
          return;
        }
        if (!areAllocationCurrenciesValid()) {
          toast.error("All allocation currencies must match the payment currency");
          return;
        }
      } else {
        // For non-split payments, ensure a pledge is selected
        if (!data.pledgeId) {
          toast.error("Please select a pledge for the payment");
          return;
        }
      }

      const isThirdParty = !!(data.isThirdPartyPayment && selectedThirdPartyContact);

      // Build base payload with third-party fields
      const basePayload = {
        isThirdPartyPayment: isThirdParty,
        thirdPartyContactId: isThirdParty ? selectedThirdPartyContact?.id : null,
        payerContactId: isThirdParty ? (contactId || null) : null,
      };

      if (isPaymentPlanPayment) {
        // For payment plan payments, allow amount changes but warn about installment impact
        const allowedUpdates = { ...data, ...basePayload };
        // Remove undefined or empty fields
        const filteredData = Object.fromEntries(
          Object.entries(allowedUpdates).filter(([key, val]) => {
            // Keep essential fields even if they're falsy
            if (['receiptIssued', 'autoAdjustAllocations', 'isSplitPayment', 'isThirdPartyPayment', 'isMultiContactPayment'].includes(key)) return true;
            return val !== undefined && val !== null && val !== '';
          })
        );
        await updatePaymentMutation.mutateAsync(filteredData as any);
      } else {
        const processedAllocations = watchedIsSplitPayment && watchedAllocations
          ? watchedAllocations.map((alloc) => ({
            ...alloc,
            allocatedAmount: alloc.allocatedAmount || 0,
            currency: watchedCurrency || payment.currency,
            receiptNumber: alloc.receiptNumber || null,
            receiptType: alloc.receiptType || null,
            receiptIssued: alloc.receiptIssued || false,
          }))
          : undefined;

        const filteredData = Object.fromEntries(
          Object.entries(data).filter(([key, val]) => {
            if (['receiptIssued', 'autoAdjustAllocations', 'isSplitPayment', 'isThirdPartyPayment', 'isMultiContactPayment'].includes(key)) return true;
            return val !== undefined && val !== null && val !== '';
          })
        );

        const updateData = {
          ...filteredData,
          ...basePayload,
          ...(watchedIsSplitPayment && processedAllocations && { allocations: processedAllocations }),
          ...(showMultiContactSection && {
            isMultiContactPayment: true,
            multiContactAllocations: multiContactAllocations
          }),
        };

        await updatePaymentMutation.mutateAsync(updateData as any);
      }

      // Success handling
      const paymentType = showMultiContactSection
        ? "Multi-contact payment"
        : isThirdParty
          ? "Third-party payment"
          : "Payment";
      const target = selectedThirdPartyContact ? ` for ${selectedThirdPartyContact.fullName}` : "";
      toast.success(`${paymentType}${target} updated successfully!`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update payment");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
    if (!newOpen) {
      resetForm();
    }
  };

  const solicitorOptions =
    solicitorsData?.solicitors?.map((solicitor: Solicitor) => ({
      label: `${solicitor.firstName} ${solicitor.lastName}${solicitor.id ? ` (${solicitor.id})` : ""}`,
      value: solicitor.id,
      commissionRate: solicitor.commissionRate,
      contact: solicitor.contact,
    })) || [];

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

  const effectivePledgeDescription = pledgeData?.pledge?.description || payment.pledgeDescription || "N/A";

  const formatCurrency = (amount: string | number, currency = "USD") => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return `${currency} ${numAmount.toLocaleString()}`;
  };

  // Undo Split Section Component
  const UndoSplitSection = () => {
    if (!watchedIsSplitPayment || !watchedAllocations?.length) return null;

    const handleUndoWithoutSelectingPledge = () => {
      form.setValue("isSplitPayment", false);
      form.setValue("isMultiContactPayment", false);
      form.setValue("pledgeId", null);
      replace([]);
      setShowMultiContactSection(false);
      setSelectedMultiContacts([]);
      setMultiContactAllocations([]);
      toast.success("Split payment undone. You can now select a new pledge.");
    };

    return (
      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h4 className="font-medium text-amber-800">Undo Split Payment</h4>
        </div>
        <p className="text-sm text-amber-700 mb-3">
          You can convert this split payment back to a regular payment. Choose one of the options below:
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-800 mb-2">Option 1: Select a pledge to apply the full amount</p>
            <div className="space-y-2">
              {watchedAllocations.map((allocation, index) => {
                const pledgeOption = pledgeOptions.find(p => p.value === allocation.pledgeId);
                return (
                  <div key={allocation.pledgeId || index} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {pledgeOption?.label || `Pledge #${allocation.pledgeId}`}
                      </div>
                      <div className="text-xs text-gray-600">
                        Allocated: {formatCurrency(allocation.allocatedAmount || 0, allocation.currency || payment.currency)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleUndoSplitPayment(allocation.pledgeId)}
                      className="ml-2 text-amber-700 border-amber-300 hover:bg-amber-100"
                    >
                      Select
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-amber-200 my-4" />

          <div>
            <p className="text-sm font-medium text-amber-800 mb-2">Option 2: Undo split and choose pledge later</p>
            <p className="text-xs text-amber-700 mb-3">
              This will remove all allocations and allow you to select a new pledge for the entire payment amount.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleUndoWithoutSelectingPledge}
              className="w-full flex items-center gap-2 text-amber-700 border-amber-300 hover:bg-amber-100"
            >
              <RotateCcw className="h-4 w-4" />
              Undo Split and Re-assign
            </Button>
          </div>
        </div>
        <p className="text-xs text-amber-600 mt-4">
          This action will delete all current allocations and convert this back to a regular payment.
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Payment
            {watchedIsSplitPayment && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <Split className="h-3 w-3 mr-1" />
                Split Payment
              </Badge>
            )}
            {watchedIsThirdParty && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <UserPlus className="h-3 w-3 mr-1" />
                Third-Party
              </Badge>
            )}
            {showMultiContactSection && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Users className="h-3 w-3 mr-1" />
                Multi-Contact
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            <div>
              {watchedIsThirdParty && selectedThirdPartyContact ? (
                <div>
                  Editing payment for <strong>{selectedThirdPartyContact.fullName}</strong>
                  <span className="block mt-1 text-sm text-muted-foreground">
                    This payment will appear in your account but apply to their pledge balance
                  </span>
                </div>
              ) : showMultiContactSection ? (
                <div>
                  Edit multi-contact payment affecting {selectedMultiContacts.length} contacts
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Total Amount: {payment.currency} {parseFloat(payment.amount).toLocaleString()}
                  </span>
                </div>
              ) : watchedIsSplitPayment ? (
                <>
                  Edit split payment affecting {watchedAllocations?.length || 0} pledges
                  <span className="block mt-1 text-sm text-muted-foreground">
                    Total Amount: {payment.currency} {parseFloat(payment.amount).toLocaleString()}
                  </span>
                  {watchedAllocations && watchedAllocations.length > 0 && (
                    <div className="mt-2 p-2 bg-purple-50 rounded-md">
                      <span className="text-xs font-medium text-purple-700">Current Allocations:</span>
                      <div className="mt-1 space-y-1">
                        {watchedAllocations.slice(0, 3).map((alloc, index) => (
                          <div key={alloc.pledgeId || index} className="flex justify-between text-xs text-purple-600">
                            <span>
                              Pledge #{alloc.pledgeId}
                            </span>
                            <span>{formatCurrency(alloc.allocatedAmount || 0, alloc.currency || payment.currency)}</span>
                          </div>
                        ))}
                        {watchedAllocations.length > 3 && (
                          <div className="text-xs text-purple-600">
                            ... and {watchedAllocations.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  Edit payment for pledge{" "}
                  {payment.pledgeDescription ? `"${payment.pledgeDescription}"` : `#${payment.pledgeId}`}
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
                <span className="block mt-1 text-sm text-blue-600 font-medium">
                  ℹ️ This payment belongs to a payment plan. Changes may affect installment scheduling.
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <UndoSplitSection />

            {/* Amount Change Warning for Split Payments */}
            {showAmountChangeWarning && watchedIsSplitPayment && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <div className="space-y-2">
                    <p className="font-medium">Payment amount has changed</p>
                    <p className="text-sm">
                      The current allocations total {formatCurrency(showMultiContactSection ? getTotalMultiContactAllocation() : totalAllocatedAmount, watchedCurrency || payment.currency)}
                      but the payment amount is {formatCurrency(watchedAmount || 0, watchedCurrency || payment.currency)}.
                    </p>
                    <div className="flex items-center gap-4 mt-3">
                      {!autoAdjustAllocations && !showMultiContactSection && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRedistribute}
                          className="flex items-center gap-1"
                        >
                          Redistribute
                        </Button>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

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
                      disabled={isPaymentPlanPayment} // Disable for payment plan payments
                    />
                    <label
                      htmlFor="isThirdPartyPayment"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Third-Party Payment (Payment for someone else&apos;s pledge)
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isMultiContactPayment"
                      checked={showMultiContactSection}
                      onCheckedChange={handleMultiContactToggle}
                      disabled={isPaymentPlanPayment}
                    />
                    <label
                      htmlFor="isMultiContactPayment"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Multi-Contact Payment (Split payment across multiple contacts)
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

            {/* Payment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Payment ID - Read Only */}
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

                  {/* Split Payment Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isSplitPayment"
                      checked={watchedIsSplitPayment}
                      onCheckedChange={handleSplitPaymentToggle}
                      disabled={isPaymentPlanPayment || (isSplitPayment && !canConvertToSplit) || showMultiContactSection}
                    />
                    <label
                      htmlFor="isSplitPayment"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Split Payment Across Multiple Pledges
                    </label>
                  </div>

                  {/* Single Pledge Selection - only show for non-split payments */}
                  {!watchedIsSplitPayment && !showMultiContactSection && (
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
                                    ? pledgeOptions.find((pledge: any) => pledge.value === field.value)?.label
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
                                <CommandList>
                                  <CommandEmpty>No pledge found.</CommandEmpty>
                                  <CommandGroup>
                                    {pledgeOptions.map((pledge: any, index) => (
                                      <CommandItem
                                        value={pledge.label}
                                        key={`pledge-${pledge.value}-${index}`}
                                        onSelect={() => {
                                          field.onChange(pledge.value);
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

                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Total Amount
                          {isPaymentPlanPayment && (
                            <span className="text-sm text-blue-600 ml-2">(May affect installments)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        {isPaymentPlanPayment && (
                          <p className="text-xs text-blue-600">
                            Changing amount may require adjusting the payment plan installments
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
                      <FormItem className="hidden">
                        <FormLabel>
                          Exchange Rate (to USD)
                          {watchedReceivedDate ? (
                            <span className="text-sm text-blue-600 ml-2">
                              (Based on received date: {new Date(watchedReceivedDate).toLocaleDateString()})
                            </span>
                          ) : watchedPaymentDate ? (
                            <span className="text-sm text-orange-600 ml-2">
                              (Based on today date - no received date set)
                            </span>
                          ) : null}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.0001"
                            readOnly={isLoadingRates}
                            className={isLoadingRates ? "opacity-70" : ""}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
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
                      <FormItem className="hidden">
                        <FormLabel>Amount (USD)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" readOnly className="opacity-70" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Exchange Rate to Pledge Currency */}
                  <FormField
                    control={form.control}
                    name="exchangeRateToPledgeCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Exchange Rate (to {selectedPledgeCurrency || 'Pledge Currency'})
                          {watchedReceivedDate ? (
                            <span className="text-sm text-blue-600 ml-2">
                              (Based on received date: {new Date(watchedReceivedDate).toLocaleDateString()})
                            </span>
                          ) : watchedPaymentDate ? (
                            <span className="text-sm text-orange-600 ml-2">
                              (Based on today date - no received date set)
                            </span>
                          ) : null}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.0001"
                            readOnly={isLoadingRates || watchedIsSplitPayment || !watchedPledgeId || (watchedCurrency === selectedPledgeCurrency)}
                            className={isLoadingRates ? "opacity-70" : ""}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        {!watchedPledgeId && !watchedIsSplitPayment && (
                          <p className="text-sm text-gray-500">Select a pledge to see exchange rate</p>
                        )}
                        {watchedCurrency === selectedPledgeCurrency && watchedPledgeId && (
                          <p className="text-sm text-green-600">Same currency - no conversion needed</p>
                        )}
                        {watchedIsSplitPayment && (
                          <p className="text-sm text-gray-500">Not applicable for split payments</p>
                        )}
                        {isLoadingRates && <p className="text-sm text-gray-500">Fetching latest rates...</p>}
                        {ratesError && <p className="text-sm text-red-500">Error fetching rates.</p>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Amount in Pledge Currency */}
                  <FormField
                    control={form.control}
                    name="amountInPledgeCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount in Pledge Currency</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" readOnly className="opacity-70" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Date */}
                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Payment Date
                          {isPaymentPlanPayment && (
                            <span className="text-sm text-blue-600 ml-2">(May affect scheduling)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                          />
                        </FormControl>
                        {isPaymentPlanPayment && (
                          <p className="text-xs text-blue-600">
                            Changing date may affect future installment scheduling
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
                          <Input {...field} type="date" value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

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
                    Edit multi-contact payment allocations across multiple contacts and their pledges
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
                                    const contactPledges = allPledgesData.filter(pledge =>
                                      pledge.contactId === contact.id || pledge.contact?.id === contact.id
                                    );

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
                                {selectedMultiContacts.map((contact) => (
                                  <tr key={contact.id} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 p-2 font-medium">
                                      {contact.fullName}
                                    </td>
                                    {selectedMultiContacts.map((headerContact) => {
                                      const headerContactPledges = allPledgesData.filter(pledge =>
                                        pledge.contactId === headerContact.id || pledge.contact?.id === headerContact.id
                                      );

                                      return headerContactPledges.map((pledge) => {
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
                                ))}
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

            {/* Payment Method & Status */}
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
                                  : "Select payment method"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search payment methods..." />
                              <CommandList>
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
                              <CommandList>
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
                                      value={detail.value}
                                      key={detail.value}
                                      onSelect={() => {
                                        form.setValue("methodDetail", detail.value);
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

                  {/* Account */}
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
                                    form.setValue("account", null);
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
                                {accountOptions.map((account) => (
                                  <CommandItem
                                    value={account.value}
                                    key={account.value}
                                    onSelect={() => {
                                      form.setValue("account", account.value);
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Check Fields */}
                  <div className="flex gap-4 md:col-span-2">
                    <FormField
                      control={form.control}
                      name="checkDate"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Check Date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" value={field.value || ""} />
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
                </div>
              </CardContent>
            </Card>

            {/* Split Payment Allocations Section */}
            {watchedIsSplitPayment && !showMultiContactSection && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Split className="h-5 w-5" />
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
                  {/* Auto-adjustment controls */}
                  <div className="border-b pb-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="autoAdjust"
                          checked={autoAdjustAllocations}
                          onCheckedChange={setAutoAdjustAllocations}
                        />
                        <label htmlFor="autoAdjust" className="text-sm font-medium">
                          Auto-adjust allocations when amount changes
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium">Method:</label>
                        <Select value={redistributionMethod} onValueChange={(value) => setRedistributionMethod(value as any)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="proportional">Proportional</SelectItem>
                            <SelectItem value="equal">Equal</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {fields.length > 0 ? (
                    fields.map((field, index) => (
                      <div
                        key={field.id}
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
                                          {pledgeOptions.map((pledge) => (
                                            <CommandItem
                                              value={pledge.label}
                                              key={pledge.value}
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
                                                  {pledge.currency} {pledge.balance.toLocaleString()}
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
                                <CommandInput placeholder="Search solicitors..." className="h-9" />
                                <CommandList>
                                  <CommandEmpty>No solicitor found.</CommandEmpty>
                                  <CommandGroup>
                                    {solicitorOptions.map((solicitor) => (
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

            {/* Receipt Information - Only for non-split payments */}
            {!watchedIsSplitPayment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Receipt Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="receiptNumber"
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
                      name="receiptType"
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
                      name="receiptIssued"
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

            {/* Action Buttons */}
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
                disabled={updatePaymentMutation.isPending || (watchedIsSplitPayment && !areAllocationsValid()) || (showMultiContactSection && getTotalMultiContactAllocation() !== (watchedAmount || 0))}
              >
                {updatePaymentMutation.isPending ? "Updating..." : "Update Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}