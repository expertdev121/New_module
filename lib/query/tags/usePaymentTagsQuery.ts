import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag } from "@/lib/db/schema";

export interface PaymentTagsResponse {
  tags: Tag[];
  paymentId: number;
}

export interface AddPaymentTagData {
  paymentId: number;
  tagId: number;
}

export interface AddPaymentTagResponse {
  message: string;
  paymentTag: {
    id: number;
    paymentId: number;
    tagId: number;
    tag: Tag;
  };
}

export interface RemovePaymentTagData {
  paymentId: number;
  tagId: number;
}

export interface RemovePaymentTagResponse {
  message: string;
  removedTag: {
    id: number;
    name: string;
  };
}

const fetchPaymentTags = async (paymentId: number): Promise<PaymentTagsResponse> => {
  const response = await fetch(`/api/payments/${paymentId}/tags`);
  if (!response.ok) {
    throw new Error(`Failed to fetch payment tags: ${response.statusText}`);
  }
  return response.json();
};

const addPaymentTag = async (data: AddPaymentTagData): Promise<AddPaymentTagResponse> => {
  const response = await fetch(`/api/payments/${data.paymentId}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tagId: data.tagId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to add tag to payment: ${response.statusText}`);
  }
  return response.json();
};

const removePaymentTag = async (data: RemovePaymentTagData): Promise<RemovePaymentTagResponse> => {
  const response = await fetch(`/api/payments/${data.paymentId}/tags/${data.tagId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to remove tag from payment: ${response.statusText}`);
  }
  return response.json();
};

export const paymentTagKeys = {
  all: ["payment-tags"] as const,
  paymentTags: (paymentId: number) => [...paymentTagKeys.all, "payment", paymentId] as const,
};

export const usePaymentTagsQuery = (
  paymentId: number,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
  }
) => {
  return useQuery({
    queryKey: paymentTagKeys.paymentTags(paymentId),
    queryFn: () => fetchPaymentTags(paymentId),
    enabled: (options?.enabled ?? true) && !!paymentId,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
};

export const useAddPaymentTagMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addPaymentTag,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: paymentTagKeys.paymentTags(data.paymentTag.paymentId) });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => {
      console.error("Error adding tag to payment:", error);
    },
  });
};

export const useRemovePaymentTagMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removePaymentTag,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentTagKeys.paymentTags(variables.paymentId) });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => {
      console.error("Error removing tag from payment:", error);
    },
  });
};
