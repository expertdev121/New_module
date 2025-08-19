import { useQuery,UseQueryOptions  } from "@tanstack/react-query";
import axios from "axios";

interface PledgeResponse {
  id: number;
  pledgeDate: string;
  description: string | null;
  originalAmount: string;
  currency: string;
  originalAmountUsd: string | null;
  totalPaid: string;
  totalPaidUsd: string | null;
  balance: string;
  balanceUsd: string | null;
  notes: string | null;
  categoryName: string | null;
  categoryDescription: string | null;
  progressPercentage: number;
  scheduledAmount: string;
  unscheduledAmount: string;
  activePlanCount: number;
  hasActivePlan: boolean;
  paymentPlanStatus: 'active' | 'none';
  schedulePercentage: number;
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

interface ApiResponse {
  pledges: PledgeResponse[];
}

interface QueryParams {
  contactId?: number;
  categoryId?: number;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  status?: "fullyPaid" | "partiallyPaid" | "unpaid";
  search?: string;
}

const fetchPledges = async (params: QueryParams): Promise<ApiResponse> => {
  const queryParams = {
    ...(params.categoryId && { categoryId: params.categoryId }),
    page: params.page || 1,
    limit: params.limit || 10,
    ...(params.startDate && { startDate: params.startDate }),
    ...(params.endDate && { endDate: params.endDate }),
    ...(params.status && { status: params.status }),
    ...(params.search && { search: params.search }),
  };

  try {
    const url = `/api/contacts/${params.contactId}/pledges`;
    const response = await axios.get<ApiResponse>(url, {
      params: queryParams,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to fetch pledges: ${axios.isAxiosError(error) ? error.message : "Unknown error"
      }`
    );
  }
};

export const usePledgesQuery = (
  params: QueryParams,
 options?: Omit<UseQueryOptions<ApiResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<ApiResponse, Error>({
    queryKey: ["pledges", params],
    queryFn: () => fetchPledges(params),
    ...options,
  });
};
