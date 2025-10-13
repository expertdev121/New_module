// lib/query/payment-plans/usePaymentPlanQuery.ts
import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";


// Update the interfaces to match your form schema exactly
export interface CustomInstallment {
  installmentDate: string;
  installmentAmount: number;
  currency: string;
  installmentAmountUsd?: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paidDate?: string;
  notes?: string;
  paymentId?: number;
}


export interface PaymentPlanFormData {
  pledgeId: number;
  relationshipId?: number;
  planName?: string;
  frequency: "weekly" | "monthly" | "quarterly" | "biannual" | "annual" | "one_time" | "custom";
  distributionType: "fixed" | "custom";
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
  installmentsPaid?: number;
  totalPaid?: number;
  totalPaidUsd?: number;
  remainingAmount?: number;
  remainingAmountUsd?: number;
  planStatus: "active" | "completed" | "cancelled" | "paused" | "overdue";
  autoRenew: boolean;
  remindersSent?: number;
  lastReminderDate?: string;
  currencyPriority?: number;
  isActive?: boolean;
  notes?: string;
  internalNotes?: string;
  customInstallments?: CustomInstallment[];
  paymentMethod: string;
  methodDetail?: string;
  // Third-party payment fields - UPDATED to allow null
  isThirdPartyPayment?: boolean;
  thirdPartyContactId?: number | null;
  payerContactId?: number | null;
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


export interface PaymentPlanUpdateData extends Partial<PaymentPlanFormData> {
  id: number;
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
  paymentMethod?: string;
  methodDetail?: string;
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
  customInstallments?: CustomInstallment[];
  // Third-party payment fields
  isThirdPartyPayment?: boolean;
  thirdPartyContactId?: number | null;
  payerContactId?: number;
  payerContactName?: string;
  pledgeContactName?: string;
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

  const cleanedData: PaymentPlanFormData = {
    ...data,
    totalPlannedAmount: roundMoney(data.totalPlannedAmount),
    installmentAmount: roundMoney(data.installmentAmount),
    pledgeId: data.pledgeId,
    frequency: data.frequency,
    distributionType: data.distributionType,
    currency: data.currency,
    numberOfInstallments: data.numberOfInstallments,
    startDate: data.startDate,
    planStatus: data.planStatus || "active",
    autoRenew: data.autoRenew || false,
    paymentMethod: data.paymentMethod,
    methodDetail: data.methodDetail || ""
  };


  // Clean USD amounts if provided
  if (data.totalPlannedAmountUsd) {
    cleanedData.totalPlannedAmountUsd = roundMoney(data.totalPlannedAmountUsd);
  }


  if (data.installmentAmountUsd) {
    cleanedData.installmentAmountUsd = roundMoney(data.installmentAmountUsd);
  }


  // Handle custom installments
  if (data.customInstallments && data.customInstallments.length > 0) {
    cleanedData.customInstallments = data.customInstallments.map(installment => ({
      ...installment,
      installmentAmount: roundMoney(installment.installmentAmount),
      installmentAmountUsd: installment.installmentAmountUsd ?
        roundMoney(installment.installmentAmountUsd) : undefined
    }));
  }


  return cleanedData;
};


// Utility function to clean update data
const cleanPaymentPlanUpdateData = (data: Partial<PaymentPlanFormData>): Partial<PaymentPlanFormData> => {
  const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

  const cleanedData: Partial<PaymentPlanFormData> = { ...data };


  // Clean monetary values if they exist
  if (data.totalPlannedAmount !== undefined) {
    cleanedData.totalPlannedAmount = roundMoney(data.totalPlannedAmount);
  }

  if (data.totalPlannedAmountUsd !== undefined) {
    cleanedData.totalPlannedAmountUsd = roundMoney(data.totalPlannedAmountUsd);
  }

  if (data.installmentAmount !== undefined) {
    cleanedData.installmentAmount = roundMoney(data.installmentAmount);
  }


  if (data.installmentAmountUsd !== undefined) {
    cleanedData.installmentAmountUsd = roundMoney(data.installmentAmountUsd);
  }


  if (data.customInstallments && data.customInstallments.length > 0) {
    cleanedData.customInstallments = data.customInstallments.map(installment => ({
      ...installment,
      installmentAmount: roundMoney(installment.installmentAmount),
      installmentAmountUsd: installment.installmentAmountUsd !== undefined ?
        roundMoney(installment.installmentAmountUsd) : undefined
    }));
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
  options?: Omit<UseQueryOptions<PledgeDetails, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<PledgeDetails, Error>({
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
      data: Partial<PaymentPlanFormData>;
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
