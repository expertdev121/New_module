import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface Category {
  categoryId: number;
  categoryName: string;
  categoryDescription: string | null;
  totalPledgedUsd: number;
  totalPaidUsd: number;
  currentBalanceUsd: number;
  pledgeCount: number;
  scheduledUsd?: number | string;
}

export interface Campaign {
  campaignId: number;
  campaignName: string;
  campaignDescription: string | null;
  totalPledgedUsd: number;
  totalPaidUsd: number;
  currentBalanceUsd: number;
  pledgeCount: number;
  scheduledUsd?: number | string;
}

export function useContactCategories(contactId: number, page: number = 1, limit: number = 10) {
  return useQuery<{
    categories: Category[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: ["contactCategories", contactId, page, limit],
    queryFn: async () => {
      const response = await axios.get(`/api/contacts/${contactId}/categories?page=${page}&limit=${limit}`);
      return response.data;
    },
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });
}

export function useContactCampaigns(contactId: number, page: number = 1, limit: number = 10) {
  return useQuery<{
    campaigns: Campaign[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: ["contactCampaigns", contactId, page, limit],
    queryFn: async () => {
      const response = await axios.get(`/api/contacts/${contactId}/campaigns?page=${page}&limit=${limit}`);
      return response.data;
    },
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });
}
