import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";


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

  const options = useMemo(() => {
    if (!paymentMethods) return [];

    const methodOptions = paymentMethods.map(method => ({
      value: method.name.toLowerCase().replace(/\s+/g, '_'),
      label: method.name,
      id: method.id,
    }));

    // Remove duplicates based on value
    const uniqueOptions = methodOptions.reduce((acc, current) => {
      const exists = acc.find(item => item.value === current.value);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, [] as typeof methodOptions);

    return uniqueOptions;
  }, [paymentMethods]);

  return { options, isLoading };
}


// Helper function to get payment method detail options for forms
export function usePaymentMethodDetailOptions(paymentMethod?: string) {
  const { data: paymentMethods, isLoading } = usePaymentMethods();

  const options = useMemo(() => {
    if (!paymentMethods || !paymentMethod) return [];

    const selectedMethod = paymentMethods.find(method =>
      method.name.toLowerCase().replace(/\s+/g, '_') === paymentMethod
    );

    if (!selectedMethod || !selectedMethod.details) return [];

    const detailOptions = selectedMethod.details.map(detail => ({
      value: detail.key.toLowerCase().replace(/\s+/g, '_'),
      label: detail.value,
      id: detail.id,
    }));

    // Remove duplicates based on value
    const uniqueOptions = detailOptions.reduce((acc, current) => {
      const exists = acc.find(item => item.value === current.value);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, [] as typeof detailOptions);

    return uniqueOptions;
  }, [paymentMethods, paymentMethod]);

  return { options, isLoading };
}
