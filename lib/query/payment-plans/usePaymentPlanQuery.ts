import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";

export interface PaymentPlanFormData {
  pledgeId: number;
  relationshipId?: number;
  planName?: string;
  frequency:
    | "weekly"
    | "monthly"
    | "quarterly"
    | "biannual"
    | "annual"
    | "one_time"
    | "custom";
  distributionType?: "fixed" | "custom";
  totalPlannedAmount: number;
  currency: "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR";
  totalPlannedAmountUsd?: number;
  installmentAmount: number;
  installmentAmountUsd?: number;
  numberOfInstallments: number;
  exchangeRate?: number;
  startDate: string;
  endDate?: string;
  nextPaymentDate?: string;
  currencyPriority?: number;
  autoRenew: boolean;
  notes?: string;
  internalNotes?: string;
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

export interface InstallmentSchedule {
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
}

export interface PaymentPlanUpdateData
  extends Omit<Partial<PaymentPlanFormData>, "pledgeId"> {
  planStatus?: "active" | "completed" | "cancelled" | "paused" | "overdue";
}

export interface PaymentPlan {
  id: number;
  pledgeId: number;
  relationshipId?: number;
  planName?: string;
  frequency: string;
  distributionType: "fixed" | "custom";
  totalPlannedAmount: number;
  currency: string;
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
  planStatus: "active" | "completed" | "cancelled" | "paused" | "overdue";
  autoRenew: boolean;
  remindersSent: number;
  lastReminderDate?: string;
  currencyPriority: number;
  isActive: boolean;
  notes?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  pledgeDescription?: string;
  pledgeContact?: string;
  pledgeOriginalAmount?: string;
  pledgeOriginalAmountUsd?: string;
  pledgeCurrency?: string;
  pledgeExchangeRate?: string;
  contactId?: number;
  installmentSchedule?: InstallmentSchedule[];
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

export interface PledgeDetails {
  pledge: {
    id: number;
    pledgeDate: string;
    description?: string;
    originalAmount: number;
    currency: string;
    totalPaid: number;
    balance: number;
    originalAmountUsd?: number;
    totalPaidUsd?: number;
    balanceUsd?: number;
    exchangeRate?: number;
    isActive: boolean;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    paymentPercentage: number;
    remainingBalance: number;
    isPaidInFull: boolean;
  };
  contact: {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email?: string;
    phone?: string;
  };
  category?: {
    id: number;
    name: string;
    description?: string;
  };
  relationship?: {
    id: number;
    relationshipType: string;
    relatedContactId: number;
    relatedContact?: {
      id: number;
      firstName: string;
      lastName: string;
      fullName: string;
    };
  };
  paymentSummary: {
    totalPayments: number;
    lastPaymentDate?: string;
    lastPaymentAmount?: number;
  };
  paymentPlans: PaymentPlan[];
  activePaymentPlans: PaymentPlan[];
}

// Utility function to clean payment plan data
const cleanPaymentPlanData = (data: PaymentPlanFormData): PaymentPlanFormData => {
  const roundMoney = (amount: number) => Math.round(amount * 100) / 100;
  
  const cleanedData = {
    ...data,
    totalPlannedAmount: roundMoney(data.totalPlannedAmount)
  };

  // Clean USD amounts if provided
  if (data.totalPlannedAmountUsd) {
    cleanedData.totalPlannedAmountUsd = roundMoney(data.totalPlannedAmountUsd);
  }

  if (data.installmentAmountUsd) {
    cleanedData.installmentAmountUsd = roundMoney(data.installmentAmountUsd);
  }

  if (data.customInstallments && data.customInstallments.length > 0) {
    // For custom installments, clean each amount and recalculate total if needed
    cleanedData.customInstallments = data.customInstallments.map(installment => ({
      ...installment,
      amount: roundMoney(installment.amount),
      amountUsd: installment.amountUsd ? roundMoney(installment.amountUsd) : installment.amountUsd,
      paidAmount: installment.paidAmount ? roundMoney(installment.paidAmount) : installment.paidAmount
    }));
    
    // Optionally recalculate total from custom installments
    const customTotal = cleanedData.customInstallments.reduce((sum, inst) => sum + inst.amount, 0);
    cleanedData.totalPlannedAmount = roundMoney(customTotal);
    
    // Recalculate USD total if exchange rate is available
    if (data.exchangeRate && cleanedData.customInstallments.every(inst => inst.amountUsd)) {
      const customTotalUsd = cleanedData.customInstallments.reduce((sum, inst) => sum + (inst.amountUsd || 0), 0);
      cleanedData.totalPlannedAmountUsd = roundMoney(customTotalUsd);
    }
    
  } else if (data.numberOfInstallments > 0) {
    // For fixed installments, ensure the math works out
    const exactInstallmentAmount = cleanedData.totalPlannedAmount / data.numberOfInstallments;
    cleanedData.installmentAmount = roundMoney(exactInstallmentAmount);
    
    // Handle USD installment amount if provided
    if (cleanedData.totalPlannedAmountUsd && data.numberOfInstallments > 0) {
      const exactInstallmentAmountUsd = cleanedData.totalPlannedAmountUsd / data.numberOfInstallments;
      cleanedData.installmentAmountUsd = roundMoney(exactInstallmentAmountUsd);
    }
    
    // Double-check that installments * amount = total (accounting for rounding)
    const calculatedTotal = cleanedData.installmentAmount * data.numberOfInstallments;
    const difference = Math.abs(cleanedData.totalPlannedAmount - calculatedTotal);
    
    // If difference is more than a penny, adjust
    if (difference > 0.01) {
      cleanedData.installmentAmount = roundMoney(cleanedData.totalPlannedAmount / data.numberOfInstallments);
    }
  } else {
    // Single payment
    cleanedData.installmentAmount = cleanedData.totalPlannedAmount;
    if (cleanedData.totalPlannedAmountUsd) {
      cleanedData.installmentAmountUsd = cleanedData.totalPlannedAmountUsd;
    }
  }

  return cleanedData;
};

// Utility function to clean update data
const cleanPaymentPlanUpdateData = (data: PaymentPlanUpdateData): PaymentPlanUpdateData => {
  const roundMoney = (amount: number) => Math.round(amount * 100) / 100;
  
  const cleanedData = { ...data };

  // Clean monetary values if they exist
  if (data.totalPlannedAmount) {
    cleanedData.totalPlannedAmount = roundMoney(data.totalPlannedAmount);
  }
  
  if (data.totalPlannedAmountUsd) {
    cleanedData.totalPlannedAmountUsd = roundMoney(data.totalPlannedAmountUsd);
  }
  
  if (data.installmentAmount) {
    cleanedData.installmentAmount = roundMoney(data.installmentAmount);
  }

  if (data.installmentAmountUsd) {
    cleanedData.installmentAmountUsd = roundMoney(data.installmentAmountUsd);
  }

  if (data.customInstallments && data.customInstallments.length > 0) {
    cleanedData.customInstallments = data.customInstallments.map(installment => ({
      ...installment,
      amount: roundMoney(installment.amount),
      amountUsd: installment.amountUsd ? roundMoney(installment.amountUsd) : installment.amountUsd,
      paidAmount: installment.paidAmount ? roundMoney(installment.paidAmount) : installment.paidAmount
    }));
  }

  // If we have both total and installment info, ensure consistency
  if (cleanedData.totalPlannedAmount && cleanedData.numberOfInstallments && cleanedData.numberOfInstallments > 0) {
    const exactInstallmentAmount = cleanedData.totalPlannedAmount / cleanedData.numberOfInstallments;
    cleanedData.installmentAmount = roundMoney(exactInstallmentAmount);
    
    // Handle USD consistency
    if (cleanedData.totalPlannedAmountUsd) {
      const exactInstallmentAmountUsd = cleanedData.totalPlannedAmountUsd / cleanedData.numberOfInstallments;
      cleanedData.installmentAmountUsd = roundMoney(exactInstallmentAmountUsd);
    }
    
    const calculatedTotal = cleanedData.installmentAmount * cleanedData.numberOfInstallments;
    const difference = Math.abs(cleanedData.totalPlannedAmount - calculatedTotal);
    
    if (difference > 0.01) {
      cleanedData.installmentAmount = roundMoney(cleanedData.totalPlannedAmount / cleanedData.numberOfInstallments);
    }
  }

  return cleanedData;
};

export const useInstallmentScheduleQuery = (paymentPlanId: number) => {
  return useQuery({
    queryKey: ["installment_schedule", paymentPlanId],
    queryFn: async (): Promise<InstallmentSchedule[]> => {
      const res = await fetch(`/api/payment-plans/${paymentPlanId}/installments`);
      if (!res.ok) throw new Error("Failed to fetch installment schedule");
      return res.json();
    },
    enabled: !!paymentPlanId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreatePaymentPlanMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PaymentPlanFormData) => {
      const cleanedData = cleanPaymentPlanData(data);

      const response = await fetch("/api/payment-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Handle validation errors specifically
        if (response.status === 400 && responseData.details) {
          // Combine all validation messages into one
          const combinedMessages = responseData.details
            .map((d: { field: string; message: string }) => d.message)
            .join(", ");
          throw new Error(combinedMessages);
        }
        throw new Error(responseData.error || "Failed to create payment plan");
      }

      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-plans"] });
      queryClient.invalidateQueries({ queryKey: ["pledges"] });
      toast.success("Payment plan created successfully!");
    },
    onError: (error) => {
      console.error("Error creating payment plan:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create payment plan"
      );
    },
  });
};

export const usePaymentPlansQuery = (params?: {
  pledgeId?: number;
  contactId?: number;
  relationshipId?: number;
  page?: number;
  limit?: number;
  planStatus?: string;
  frequency?: string;
  currency?: string;
}) => {
  const searchParams = new URLSearchParams();

  if (params?.pledgeId)
    searchParams.append("pledgeId", params.pledgeId.toString());
  if (params?.contactId)
    searchParams.append("contactId", params.contactId.toString());
  if (params?.relationshipId)
    searchParams.append("relationshipId", params.relationshipId.toString());
  if (params?.page) searchParams.append("page", params.page.toString());
  if (params?.limit) searchParams.append("limit", params.limit.toString());
  if (params?.planStatus) searchParams.append("planStatus", params.planStatus);
  if (params?.frequency) searchParams.append("frequency", params.frequency);
  if (params?.currency) searchParams.append("currency", params.currency);

  return useQuery({
    queryKey: ["paymentPlans", params],
    queryFn: async () => {
      const response = await fetch(
        `/api/payment-plans?${searchParams.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch payment plans");
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const usePaymentPlansByPledgeQuery = (pledgeId: number) => {
  return usePaymentPlansQuery({ pledgeId, limit: 100 });
};

export const usePaymentPlanQuery = (planId: number) => {
  return useQuery({
    queryKey: ["payment-plan", planId],
    queryFn: async (): Promise<{ paymentPlan: PaymentPlan }> => {
      const response = await fetch(`/api/payment-plans/${planId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch payment plan");
      }

      return response.json();
    },
    enabled: !!planId && planId > 0,
    staleTime: 2 * 60 * 1000,
  });
};

export const usePledgeDetailsQuery = (
  pledgeId: number,
  // Add a second optional argument for useQuery options
  options?: Omit<UseQueryOptions<PledgeDetails, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<PledgeDetails, Error>({ // Added generic types for better type inference
    queryKey: ["pledge-details", pledgeId],
    queryFn: async (): Promise<PledgeDetails> => {
      const response = await fetch(`/api/pledges/${pledgeId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch pledge details");
      }

      return response.json();
    },
    enabled: !!pledgeId && pledgeId > 0,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
};

export const useUpdatePaymentPlanMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: PaymentPlanUpdateData;
    }) => {
      const cleanedData = cleanPaymentPlanUpdateData(data);

      const response = await fetch(`/api/payment-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Handle validation errors specifically
        if (response.status === 400 && responseData.details) {
          const combinedMessages = responseData.details
            .map((d: { field: string; message: string }) => d.message)
            .join(", ");
          throw new Error(combinedMessages);
        }
        throw new Error(responseData.error || "Failed to update payment plan");
      }

      return responseData;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries();
      queryClient.invalidateQueries({
        queryKey: ["payment-plan", variables.id],
      });

      const updatedPlan = data.paymentPlan;
      if (updatedPlan?.pledgeId) {
        queryClient.invalidateQueries({
          queryKey: ["payment-plans", updatedPlan.pledgeId],
        });
        queryClient.invalidateQueries({
          queryKey: ["pledge-details", updatedPlan.pledgeId],
        });
      }

      queryClient.invalidateQueries({ queryKey: ["pledges"] });

      toast.success("Payment plan updated successfully!");
    },
    onError: (error) => {
      console.error("Error updating payment plan:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update payment plan"
      );
    },
  });
};

export const useCancelPaymentPlanMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: number) => {
      const response = await fetch(`/api/payment-plans/${planId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel payment plan");
      }

      return response.json();
    },
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: ["paymentPlans"] });
      queryClient.invalidateQueries({ queryKey: ["payment-plan", planId] });
      toast.success("Payment plan cancelled successfully!");
    },
    onError: (error) => {
      console.error("Error cancelling payment plan:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel payment plan"
      );
    },
  });
};

export const useDeletePaymentPlanMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: number) => {
      const response = await fetch(`/api/payment-plans/${planId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete payment plan");
      }

      return response.json();
    },
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: ["paymentPlans"] });
      queryClient.removeQueries({ queryKey: ["payment-plan", planId] });
      toast.success("Payment plan deleted successfully!");
    },
    onError: (error) => {
      console.error("Error deleting payment plan:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete payment plan"
      );
    },
  });
};

export const usePauseResumePaymentPlanMutation = () => {  
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      action,
    }: {
      planId: number;
      action: "pause" | "resume";
    }) => {
      const newStatus = action === "pause" ? "paused" : "active";

      const response = await fetch(`/api/payment-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planStatus: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} payment plan`);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["paymentPlans"] });
      queryClient.invalidateQueries({
        queryKey: ["payment-plan", variables.planId],
      });

      const actionText = variables.action === "pause" ? "paused" : "resumed";
      toast.success(`Payment plan ${actionText} successfully!`);
    },
    onError: (error, variables) => {
      console.error(`Error ${variables.action}ing payment plan:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${variables.action} payment plan`
      );
    },
  });
};