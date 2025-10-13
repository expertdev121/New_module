import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface PaymentMethod {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  details: PaymentMethodDetail[];
}

export interface PaymentMethodDetail {
  id: number;
  paymentMethodId: number;
  key: string;
  value: string;
  createdAt?: string;
  updatedAt?: string;
}

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const response = await axios.get("/api/payment-methods");
      return response.data;
    },
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Helper function to get payment method options for forms
export function usePaymentMethodOptions() {
  const { data: paymentMethods, isLoading } = usePaymentMethods();

  const options = paymentMethods?.map(method => ({
    value: method.name.toLowerCase().replace(/\s+/g, '_'),
    label: method.name,
  })) || [];

  return { options, isLoading };
}

// Helper function to get payment method detail options for forms
export function usePaymentMethodDetailOptions(paymentMethod?: string) {
  const { data: paymentMethods, isLoading } = usePaymentMethods();

  const selectedMethod = paymentMethods?.find(method =>
    method.name.toLowerCase().replace(/\s+/g, '_') === paymentMethod
  );

  const options = selectedMethod?.details.map(detail => ({
    value: detail.key.toLowerCase().replace(/\s+/g, '_'),
    label: detail.value,
  })) || [];

  return { options, isLoading };
}
