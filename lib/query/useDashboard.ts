import { useQuery } from "@tanstack/react-query";

export interface OverviewData {
  totalContacts: number;
  contactsGrowthPercentage: number;
  totalPledges: number;
  totalPledgeAmount: number;
  totalPayments: number;
  totalPaymentAmount: number;
  activePlans: number;
  scheduledPayments: number;
  unscheduledPayments: number;
  thirdPartyPayments: number;
  collectionRate: number;
  avgPledgeSize: number;
  avgPaymentSize: number;
}

export interface TrendsData {
  labels: string[];
  pledges: number[];
  payments: number[];
}

export interface PaymentMethodData {
  labels: string[];
  values: number[];
  counts: number[];
}

export interface PledgeStatusData {
  labels: string[];
  values: number[];
  percentages: number[];
}

export interface TopDonor {
  name: string;
  pledges: number;
  pledgeAmount: number;
  thirdPartyAmount: number;
  amount: number;
  pledgedAmount: number;
  completion: number;
}

export interface RecentActivity {
  type: string;
  contactName: string;
  amount: number;
  date: string;
  method: string;
}

export const useDashboardOverview = (timeRange?: string, startDate?: string, endDate?: string) => {
  return useQuery<OverviewData, Error>({
    queryKey: ["dashboard", "overview", timeRange, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (timeRange === "custom" && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      } else {
        params.append("period", timeRange || "1m");
      }
      const response = await fetch(`/api/dashboard/overview?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch overview: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export const useDashboardTrends = (timeRange?: string, startDate?: string, endDate?: string) => {
  return useQuery<TrendsData, Error>({
    queryKey: ["dashboard", "trends", timeRange, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (timeRange === "custom" && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      } else {
        params.append("period", timeRange || "6m");
      }
      const response = await fetch(`/api/dashboard/trends?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch trends: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useDashboardPaymentMethods = () => {
  return useQuery<PaymentMethodData, Error>({
    queryKey: ["dashboard", "payment-methods"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/payment-methods");
      if (!response.ok) {
        throw new Error(`Failed to fetch payment methods: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useDashboardPledgeStatus = () => {
  return useQuery<PledgeStatusData, Error>({
    queryKey: ["dashboard", "pledge-status"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/pledge-status");
      if (!response.ok) {
        throw new Error(`Failed to fetch pledge status: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useDashboardTopDonors = () => {
  return useQuery<TopDonor[], Error>({
    queryKey: ["dashboard", "top-donors"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/top-donors");
      if (!response.ok) {
        throw new Error(`Failed to fetch top donors: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useDashboardRecentActivity = () => {
  return useQuery<RecentActivity[], Error>({
    queryKey: ["dashboard", "recent-activity"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/recent-activity");
      if (!response.ok) {
        throw new Error(`Failed to fetch recent activity: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};
