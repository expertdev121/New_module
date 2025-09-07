/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { z } from "zod";

const PlanStatusEnum = z.enum([
  "active",
  "completed",
  "cancelled", 
  "paused",
  "overdue",
]);

const CurrencyEnum = z.enum([
  "USD",
  "ILS", 
  "EUR",
  "JPY",
  "GBP",
  "AUD",
  "CAD",
  "ZAR",
]);

const FrequencyEnum = z.enum([
  "weekly",
  "monthly", 
  "quarterly",
  "biannual",
  "annual",
  "one_time",
  "custom",
]);

const DistributionTypeEnum = z.enum([
  "fixed",
  "custom",
]);

// Updated interface to match the new multi-currency schema
interface PaymentPlan {
  id: number;
  pledgeId: number;
  relationshipId?: number;
  planName?: string;
  frequency: z.infer<typeof FrequencyEnum>;
  distributionType: z.infer<typeof DistributionTypeEnum>;
  totalPlannedAmount: number;
  currency: z.infer<typeof CurrencyEnum>;
  // New USD conversion fields
  totalPlannedAmountUsd?: number;
  installmentAmount: number;
  installmentAmountUsd?: number;
  numberOfInstallments: number;
  exchangeRate?: number;
  startDate: string;
  endDate?: string;
  nextPaymentDate?: string;
  installmentsPaid: number;
  totalPaid: number;
  totalPaidUsd?: number;
  remainingAmount: number;
  remainingAmountUsd?: number;
  planStatus: z.infer<typeof PlanStatusEnum>;
  autoRenew: boolean;
  remindersSent: number;
  lastReminderDate?: string;
  // New currency priority field
  currencyPriority: number;
  isActive: boolean;
  notes?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  // Related data that might be included
  pledgeDescription?: string;
  pledgeContact?: string;
  pledgeOriginalAmount?: string;
  pledgeOriginalAmountUsd?: string;
  pledgeCurrency?: string;
  pledgeExchangeRate?: string;
  contactId?: number;
  // Installment schedule with USD amounts
  installmentSchedule?: Array<{
    id: number;
    paymentPlanId: number;
    installmentDate: string;
    installmentAmount: string;
    currency: string;
    installmentAmountUsd?: string;
    status: "pending" | "paid" | "overdue" | "cancelled";
    paidDate?: string | null;
    paymentId?: number | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  // Custom installments with USD support
  customInstallments?: Array<{
    date: string;
    amount: number;
    amountUsd?: number;
    notes?: string;
    isPaid?: boolean;
    paidDate?: string;
    paidAmount?: number;
  }>;
}

interface PaymentPlansResponse {
  paymentPlans: PaymentPlan[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters?: {
    pledgeId?: number;
    contactId?: number;
    relationshipId?: number;
    planStatus?: string;
    frequency?: string;
    currency?: string;
    search?: string;
  };
  // New summary fields for multi-currency support
  summary?: {
    totalPlannedAmount: Record<string, number>;
    totalPlannedAmountUsd: number;
    totalPaidAmount: Record<string, number>;
    totalPaidAmountUsd: number;
    totalRemainingAmount: Record<string, number>;
    totalRemainingAmountUsd: number;
    planCountByStatus: Record<string, number>;
    planCountByCurrency: Record<string, number>;
  };
}

interface UsePaymentPlansParams {
  pledgeId?: number;
  contactId?: number;
  relationshipId?: number;
  page?: number;
  limit?: number;
  search?: string;
  planStatus?: z.infer<typeof PlanStatusEnum>;
  frequency?: z.infer<typeof FrequencyEnum>;
  currency?: z.infer<typeof CurrencyEnum>;
  // New filter options
  includeInstallmentSchedule?: boolean;
  includePledgeDetails?: boolean;
  sortBy?: "createdAt" | "startDate" | "totalPlannedAmount" | "nextPaymentDate" | "currencyPriority";
  sortOrder?: "asc" | "desc";
}

// Updated query hook with enhanced multi-currency support
export const usePaymentPlans = ({
  pledgeId,
  contactId,
  relationshipId,
  page = 1,
  limit = 10,
  search,
  planStatus,
  frequency,
  currency,
  includeInstallmentSchedule = false,
  includePledgeDetails = false,
  sortBy = "createdAt",
  sortOrder = "desc",
}: UsePaymentPlansParams) => {
  return useQuery<PaymentPlansResponse, Error>({
    queryKey: [
      "paymentPlans",
      { 
        pledgeId, 
        contactId, 
        relationshipId,
        page, 
        limit, 
        search, 
        planStatus,
        frequency,
        currency,
        includeInstallmentSchedule,
        includePledgeDetails,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      // Basic pagination and search
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (search) params.append("search", search);
      
      // Status and type filters
      if (planStatus) params.append("planStatus", planStatus);
      if (frequency) params.append("frequency", frequency);
      if (currency) params.append("currency", currency);
      
      // Relationship filter
      if (relationshipId) params.append("relationshipId", relationshipId.toString());
      
      // Include options
      if (includeInstallmentSchedule) params.append("includeInstallmentSchedule", "true");
      if (includePledgeDetails) params.append("includePledgeDetails", "true");
      
      // Sorting
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);

      let url: string;
      if (pledgeId) {
        // Get payment plans for a specific pledge
        url = `/api/pledges/${pledgeId}/payment-plans`;
      } else if (contactId) {
        // Get payment plans for a specific contact
        url = `/api/contacts/${contactId}/payment-plans`;
      } else {
        // Get all payment plans with filters
        url = `/api/payment-plans`;
      }

      const response = await axios.get(url, { params });
      return response.data;
    },
    enabled: !!(pledgeId || contactId || (!pledgeId && !contactId)), // Allow querying all plans
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Specialized hook for getting active payment plans by pledge
export const useActivePaymentPlansByPledge = (pledgeId: number) => {
  return usePaymentPlans({
    pledgeId,
    planStatus: "active",
    limit: 100, // Get all active plans
    includeInstallmentSchedule: true,
    sortBy: "currencyPriority",
    sortOrder: "asc",
  });
};

// Hook for getting payment plans summary across currencies
export const usePaymentPlansSummary = (params?: {
  contactId?: number;
  planStatus?: z.infer<typeof PlanStatusEnum>;
  currency?: z.infer<typeof CurrencyEnum>;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
}) => {
  return useQuery<PaymentPlansResponse["summary"], Error>({
    queryKey: ["paymentPlansSummary", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      
      if (params?.contactId) {
        searchParams.append("contactId", params.contactId.toString());
      }
      if (params?.planStatus) {
        searchParams.append("planStatus", params.planStatus);
      }
      if (params?.currency) {
        searchParams.append("currency", params.currency);
      }
      if (params?.dateRange?.startDate) {
        searchParams.append("startDate", params.dateRange.startDate);
      }
      if (params?.dateRange?.endDate) {
        searchParams.append("endDate", params.dateRange.endDate);
      }

      const response = await axios.get(`/api/payment-plans/summary`, { 
        params: searchParams 
      });
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook for getting overdue payment plans (useful for reminders)
export const useOverduePaymentPlans = (params?: {
  contactId?: number;
  daysPastDue?: number;
  includeInstallmentSchedule?: boolean;
}) => {
  return usePaymentPlans({
    ...params,
    planStatus: "overdue",
    limit: 100,
    sortBy: "nextPaymentDate",
    sortOrder: "asc",
  });
};

// Hook for getting payment plans by relationship (useful for family/business relationships)
export const usePaymentPlansByRelationship = (relationshipId: number, params?: {
  planStatus?: z.infer<typeof PlanStatusEnum>;
  includeInstallmentSchedule?: boolean;
}) => {
  return usePaymentPlans({
    relationshipId,
    ...params,
    limit: 100,
    sortBy: "currencyPriority",
    sortOrder: "asc",
  });
};

// Export types for use in components
export type { 
  PaymentPlan, 
  PaymentPlansResponse, 
  UsePaymentPlansParams 
};

export { 
  PlanStatusEnum, 
  CurrencyEnum, 
  FrequencyEnum, 
  DistributionTypeEnum 
};