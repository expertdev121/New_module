import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { z } from "zod";

const PaymentStatusEnum = z.enum([
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "processing",
]);

interface PaymentResponse {
  id: number;
  amount: string;
  currency: string;
  amountUsd: string | null;
  paymentDate: string;
  receivedDate: string | null;
  processedDate: string | null;
  paymentMethod: string | null;
  paymentStatus: z.infer<typeof PaymentStatusEnum> | null;
  referenceNumber: string | null;
  checkNumber: string | null;
  receiptNumber: string | null;
  receiptIssued: boolean | null;
  receiptIssuedDate: string | null;
  notes: string | null;
  paymentPlanId: number | null;
  pledgeId?: number; // Add pledgeId to response for View link
}

interface ApiResponse {
  payments: PaymentResponse[];
}

// Updated schema to support either pledgeId or contactId
const QueryParamsSchema = z
  .object({
    pledgeId: z.number().positive().optional(),
    contactId: z.number().positive().optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(10),
    search: z.string().optional(),
    paymentStatus: PaymentStatusEnum.optional(),
  })
  .refine((data) => data.pledgeId || data.contactId, {
    message: "Either pledgeId or contactId must be provided",
  });
type QueryParams = z.infer<typeof QueryParamsSchema>;
const fetchPayments = async (params: QueryParams): Promise<ApiResponse> => {
  const validatedParams = QueryParamsSchema.parse(params);
  const queryParams = {
    page: validatedParams.page,
    limit: validatedParams.limit,
    ...(validatedParams.search && { search: validatedParams.search }),
    ...(validatedParams.paymentStatus && {
      paymentStatus: validatedParams.paymentStatus,
    }),
  };
  try {
    let url: string;

    if (validatedParams.pledgeId) {
      url = `/api/payments/${validatedParams.pledgeId}`;
    } else if (validatedParams.contactId) {
      url = `/api/contacts/${validatedParams.contactId}/payments`;
    } else {
      throw new Error("Either pledgeId or contactId must be provided");
    }

    const response = await axios.get<ApiResponse>(url, {
      params: queryParams,
    });

    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to fetch payments: ${
        axios.isAxiosError(error) ? error.message : "Unknown error"
      }`
    );
  }
};

export const usePaymentsQuery = (params: QueryParams) => {
  return useQuery<ApiResponse, Error>({
    queryKey: ["payments", params],
    queryFn: () => fetchPayments(params),
    enabled: !!(params.pledgeId || params.contactId),
  });
};
