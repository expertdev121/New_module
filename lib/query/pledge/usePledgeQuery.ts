import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Payment Types
export interface CreatePaymentData {
  pledgeId: number;
  amount: number;
  relationshipId?: number;
  currency: string;
  amountUsd?: number;
  paymentDate: string;
  receivedDate?: string;
  paymentMethod?: string;
  paymentStatus?:
    | "pending"
    | "completed"
    | "failed"
    | "cancelled"
    | "refunded"
    | "processing";
  referenceNumber?: string;
  checkNumber?: string;
  receiptNumber?: string;
  receiptIssued?: boolean;
  notes?: string;
  paymentPlanId?: number;
}

export interface CreatePaymentResponse {
  message: string;
  payment: {
    id: number;
    pledgeId: number;
    amount: string;
    relationshipId?: number;
    currency: string;
    amountUsd: string | null;
    paymentDate: string;
    receivedDate: string | null;
    paymentMethod: string | null;
    paymentStatus: string | null;
    referenceNumber: string | null;
    checkNumber: string | null;
    receiptNumber: string | null;
    receiptIssued: boolean | null;
    notes: string | null;
    paymentPlanId: number | null;
    createdAt: string;
    updatedAt: string;
  };
}

// Pledge Types
export interface PledgeQueryParams {
  contactId?: number;
  categoryId?: number;
  relationshipId?: number;
  page?: number;
  limit?: number;
  search?: string;
  status?: "fullyPaid" | "partiallyPaid" | "unpaid";
  startDate?: string;
  endDate?: string;
}

// ------------- CRITICAL UPDATE: Support nested data in Pledge -------------
export interface Pledge {
  id: number;
  contactId: number;
  categoryId: number | null;
  relationshipId?: number;
  pledgeDate: string;
  description: string;
  originalAmount: string;
  currency: string;
  originalAmountUsd: string | null;
  totalPaid: string;
  totalPaidUsd: string | null;
  balance: string;
  balanceUsd: string | null;
  exchangeRate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  progressPercentage: number;
  categoryName: string | null;
  categoryDescription: string | null;
  relationship?: {
    id: number;
    type: string;
    label: string;
    isActive: boolean;
    notes?: string | null;
    relatedContact: {
      id: number;
      firstName: string;
      lastName: string;
      fullName: string;
      email?: string | null;
      phone?: string | null;
    };
  } | null;

  contact?: {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email?: string | null;
  };

  category?: {
    id: number;
    name: string;
    description?: string | null;
  } | null;
}
// ------------- END CRITICAL UPDATE -------------

export interface PledgesResponse {
  pledges: Pledge[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    contactId?: number;
    categoryId?: number;
    relationshipId?: number; // ADDED to match queryPossible keys
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface CreatePledgeData {
  contactId: number;
  categoryId?: number;
  relationshipId?: number;
  pledgeDate: string;
  description: string;
  originalAmount: number;
  currency: string;
  originalAmountUsd: number;
  exchangeRate: number;
  notes?: string;
}

export interface CreatePledgeResponse {
  message: string;
  pledge: Pledge;
}

export interface CreatePledgeAndPayData extends CreatePledgeData {
  shouldRedirectToPay: boolean;
}

export interface UpdatePledgeData {
  id: number;
  contactId?: number;
  relationshipId?: number;
  categoryId?: number;
  pledgeDate?: string;
  description?: string;
  originalAmount?: number;
  currency?: string;
  originalAmountUsd?: number;
  exchangeRate?: number;
  isActive?: boolean;
  notes?: string;
}

export interface UpdatePledgeResponse {
  message: string;
  pledge: Pledge;
}

const updatePledge = async (
  data: UpdatePledgeData
): Promise<UpdatePledgeResponse> => {
  const { id, ...updateData } = data;
  const response = await fetch(`/api/pledges/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error || `Failed to update pledge: ${response.statusText}`
    );
  }

  return response.json();
};

const createPayment = async (
  data: CreatePaymentData
): Promise<CreatePaymentResponse> => {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error || `Failed to create payment: ${response.statusText}`
    );
  }

  return response.json();
};

const fetchPledgeById = async (id: number): Promise<Pledge> => {
  const response = await fetch(`/api/pledges/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pledge: ${response.statusText}`);
  }
  return response.json();
};

const fetchPledges = async (
  params: PledgeQueryParams
): Promise<PledgesResponse> => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, value.toString());
    }
  });

  const response = await fetch(`/api/pledges?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch pledges: ${response.statusText}`);
  }

  return response.json();
};

const createPledge = async (
  data: CreatePledgeData
): Promise<CreatePledgeResponse> => {
  const response = await fetch("/api/pledges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error || `Failed to create pledge: ${response.statusText}`
    );
  }

  return response.json();
};

const deletePledge = async (
  pledgeId: number
): Promise<DeletePledgeResponse> => {
  const response = await fetch(`/api/pledges/${pledgeId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete pledge");
  }

  return response.json();
};

// Query Keys
export const pledgeKeys = {
  all: ["pledges"] as const,
  lists: () => [...pledgeKeys.all, "list"] as const,
  list: (params: PledgeQueryParams) => [...pledgeKeys.lists(), params] as const,
  details: () => [...pledgeKeys.all, "detail"] as const,
  detail: (id: number) => [...pledgeKeys.details(), id] as const,
};

export const paymentKeys = {
  all: ["payments"] as const,
  lists: () => [...paymentKeys.all, "list"] as const,
  byPledge: (pledgeId: number) =>
    [...paymentKeys.lists(), "pledge", pledgeId] as const,
  byContact: (contactId: number) =>
    [...paymentKeys.lists(), "contact", contactId] as const,
};

// Query Hooks
export const usePledgeByIdQuery = (id: number) =>
  useQuery({
    queryKey: pledgeKeys.detail(id),
    queryFn: () => fetchPledgeById(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

export const usePledgesQuery = (params: PledgeQueryParams) => {
  return useQuery({
    queryKey: pledgeKeys.list(params),
    queryFn: () => fetchPledges(params),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
};

// Mutation Hooks
export const useCreatePledgeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPledge,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: pledgeKeys.all });
      queryClient.invalidateQueries({
        queryKey: pledgeKeys.list({ contactId: variables.contactId }),
      });
      if (variables.categoryId) {
        queryClient.invalidateQueries({
          queryKey: pledgeKeys.list({ categoryId: variables.categoryId }),
        });
      }
    },
    onError: (error) => {
      console.error("Error creating pledge:", error);
    },
  });
};

export const useUpdatePledgeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePledge,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: pledgeKeys.all });
      queryClient.setQueryData(pledgeKeys.detail(variables.id), data.pledge);
      if (variables.contactId || data.pledge.contactId) {
        queryClient.invalidateQueries({
          queryKey: pledgeKeys.list({
            contactId: variables.contactId || data.pledge.contactId,
          }),
        });
      }
      const categoryIdForQuery =
        variables.categoryId ??
        (data.pledge.categoryId !== null ? data.pledge.categoryId : undefined);

      if (categoryIdForQuery !== undefined) {
        queryClient.invalidateQueries({
          queryKey: pledgeKeys.list({
            categoryId: categoryIdForQuery,
          }),
        });
      }
      if (
        variables.originalAmount ||
        variables.currency ||
        variables.originalAmountUsd
      ) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
        queryClient.invalidateQueries({
          queryKey: paymentKeys.byPledge(variables.id),
        });
      }
    },
    onError: (error) => {
      console.error("Error updating pledge:", error);
    },
  });
};

export const useCreatePaymentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPayment,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({
        queryKey: paymentKeys.byPledge(variables.pledgeId),
      });
      queryClient.invalidateQueries({ queryKey: pledgeKeys.all });
      queryClient.invalidateQueries({
        queryKey: pledgeKeys.detail(variables.pledgeId),
      });
    },
    onError: (error) => {
      console.error("Error creating payment:", error);
    },
  });
};

export const useCreatePledgeAndPayMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePledgeAndPayData) => {
      const { shouldRedirectToPay, ...pledgeData } = data;
      const result = await createPledge(pledgeData);
      return { ...result, shouldRedirectToPay };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: pledgeKeys.all });
      queryClient.invalidateQueries({
        queryKey: pledgeKeys.list({ contactId: variables.contactId }),
      });

      if (variables.categoryId) {
        queryClient.invalidateQueries({
          queryKey: pledgeKeys.list({ categoryId: variables.categoryId }),
        });
      }
    },
    onError: (error) => {
      console.error("Error creating pledge:", error);
    },
  });
};

interface DeletePledgeResponse {
  success: boolean;
  message: string;
  deletedPledgeId: number;
  deletedRecords: {
    bonusCalculations: number;
    payments: number;
    paymentPlans: number;
  };
}

export const useDeletePledge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePledge,
    onSuccess: (pledgeId) => {
      queryClient.invalidateQueries({ queryKey: ["pledges"] });
      queryClient.removeQueries({ queryKey: ["pledge", pledgeId] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["paymentPlans"] });
    },
  });
};
