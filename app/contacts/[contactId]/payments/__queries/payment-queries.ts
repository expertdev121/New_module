import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Payment {
  id: number;
  amount: string;
  currency: "USD" | "ILS" | "EUR" | "JPY" | "GBP" | "AUD" | "CAD" | "ZAR";
  amountUsd?: string;
  exchangeRate?: string;
  paymentDate: string;
  receivedDate?: string;
  paymentMethod:
    | "credit_card"
    | "cash"
    | "check"
    | "bank_transfer"
    | "paypal"
    | "wire_transfer"
    | "other";
  paymentStatus:
    | "pending"
    | "completed"
    | "failed"
    | "cancelled"
    | "expected"
    | "refunded"
    | "processing";
  referenceNumber?: string;
  checkNumber?: string;
  receiptNumber?: string;
  receiptType?: "invoice" | "confirmation" | "receipt" | "other";
  receiptIssued: boolean;
  solicitorId?: number;
  bonusPercentage?: string;
  bonusAmount?: string;
  bonusRuleId?: number;
  notes?: string;
  paymentPlanId?: number;
  pledgeId: number;
}

export interface PaymentsResponse {
  payments: Payment[];
}

export interface PaymentQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  paymentStatus?: Payment["paymentStatus"];
}

export interface UpdatePaymentRequest {
  paymentId: number;
  amount?: number;
  currency?: Payment["currency"];
  amountUsd?: number;
  exchangeRate?: number;
  paymentDate?: string;
  receivedDate?: string;
  paymentMethod?: Payment["paymentMethod"];
  paymentStatus?: Payment["paymentStatus"];
  referenceNumber?: string;
  checkNumber?: string;
  receiptNumber?: string;
  receiptType?: Payment["receiptType"];
  receiptIssued?: boolean;
  solicitorId?: number;
  bonusPercentage?: number;
  bonusAmount?: number;
  bonusRuleId?: number;
  notes?: string;
  paymentPlanId?: number;
}

export interface UpdatePaymentResponse {
  message: string;
  payment: Payment;
}

export interface DeletePaymentRequest {
  paymentId: number;
}

export interface DeletePaymentResponse {
  message: string;
  deletedPayment: {
    id: number;
    amount: string;
    paymentStatus: Payment["paymentStatus"];
    solicitorId?: number;
    bonusAmount?: string;
  };
}

export interface ErrorResponse {
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

export const paymentKeys = {
  all: ["payments"] as const,
  lists: () => [...paymentKeys.all, "list"] as const,
  list: (pledgeId: number, params?: PaymentQueryParams) =>
    [...paymentKeys.lists(), pledgeId, params] as const,
  details: () => [...paymentKeys.all, "detail"] as const,
  detail: (pledgeId: number, paymentId: number) =>
    [...paymentKeys.details(), pledgeId, paymentId] as const,
};

const paymentsAPI = {
  getPayments: async (
    pledgeId: number,
    params?: PaymentQueryParams
  ): Promise<PaymentsResponse> => {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.search) searchParams.append("search", params.search);
    if (params?.paymentStatus)
      searchParams.append("paymentStatus", params.paymentStatus);

    const queryString = searchParams.toString();
    const url = `/api/payments/${pledgeId}${
      queryString ? `?${queryString}` : ""
    }`;

    const response = await fetch(url);

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error || "Failed to fetch payments");
    }

    return response.json();
  },

  updatePayment: async (
    pledgeId: number,
    data: UpdatePaymentRequest
  ): Promise<UpdatePaymentResponse> => {
    const response = await fetch(`/api/payments/${pledgeId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error || "Failed to update payment");
    }

    return response.json();
  },

  deletePayment: async (
    pledgeId: number,
    data: DeletePaymentRequest
  ): Promise<DeletePaymentResponse> => {
    const response = await fetch(`/api/payments/${pledgeId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error || "Failed to delete payment");
    }

    return response.json();
  },
};

export const usePayments = (
  pledgeId: number,
  params?: PaymentQueryParams,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
  }
) => {
  return useQuery({
    queryKey: paymentKeys.list(pledgeId, params),
    queryFn: () => paymentsAPI.getPayments(pledgeId, params),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? 1000 * 60,
  });
};

export const useUpdatePayment = (
  pledgeId: number,
  options?: {
    onSuccess?: (data: UpdatePaymentResponse) => void;
    onError?: (error: Error) => void;
  }
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePaymentRequest) =>
      paymentsAPI.updatePayment(pledgeId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: paymentKeys.lists(),
      });
      queryClient.setQueryData(
        paymentKeys.detail(pledgeId, data.payment.id),
        data.payment
      );

      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
};

export const useDeletePayment = (
  pledgeId: number,
  options?: {
    onSuccess?: (data: DeletePaymentResponse) => void;
    onError?: (error: Error) => void;
  }
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeletePaymentRequest) =>
      paymentsAPI.deletePayment(pledgeId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: paymentKeys.lists(),
      });
      queryClient.removeQueries({
        queryKey: paymentKeys.detail(pledgeId, data.deletedPayment.id),
      });

      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
};

export const usePrefetchPayments = () => {
  const queryClient = useQueryClient();

  return (pledgeId: number, params?: PaymentQueryParams) => {
    queryClient.prefetchQuery({
      queryKey: paymentKeys.list(pledgeId, params),
      queryFn: () => paymentsAPI.getPayments(pledgeId, params),
      staleTime: 1000 * 60, // 1 minute
    });
  };
};

export const useOptimisticPaymentUpdate = (pledgeId: number) => {
  const queryClient = useQueryClient();

  return {
    optimisticUpdate: (paymentId: number, updates: Partial<Payment>) => {
      queryClient.setQueryData<PaymentsResponse>(
        paymentKeys.list(pledgeId),
        (old) => {
          if (!old) return old;

          return {
            ...old,
            payments: old.payments.map((payment) =>
              payment.id === paymentId ? { ...payment, ...updates } : payment
            ),
          };
        }
      );
    },

    revertOptimisticUpdate: () => {
      queryClient.invalidateQueries({
        queryKey: paymentKeys.list(pledgeId),
      });
    },
  };
};
