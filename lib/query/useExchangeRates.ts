import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface ExchangeRateData {
  data: {
    currency: string;
    rates: Record<string, string>;
  };
}

export const useExchangeRates = (date?: string) => {
  return useQuery<ExchangeRateData, Error>({
    queryKey: ["exchangeRates", date],
    queryFn: async () => {
      const res = await axios.get(`/api/exchange-rates`, {
        params: { date },
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: true,
  });
};
