import { ContactFormValues } from "@/components/forms/contact-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClientErrorHandler, ApiError } from "@/lib/error-handler";

async function updateContact(contactId: number, data: ContactFormValues) {
  const response = await fetch(`/api/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw error;
  }
  return response.json();
}

export function useUpdateContact(
  setFieldError?: (field: string, message: string) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: ContactFormValues }) =>
      updateContact(contactId, data),
    onSuccess: () => {
      toast.success("Contact updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-details"] });
    },
    onError: (error: ApiError) => {
      const errorMessage = ClientErrorHandler.handle(error, setFieldError);
      toast.error(errorMessage);
    },
  });
}
