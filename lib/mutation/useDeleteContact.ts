import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClientErrorHandler, ApiError } from "@/lib/error-handler";

async function deleteContact(contactId: number) {
  const response = await fetch(`/api/contacts/${contactId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw error;
  }

  return response.json();
}

export function useDeleteContact(
  setFieldError?: (field: string, message: string) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteContact,
    onSuccess: (data) => {
      toast.success(`Contact "${data.deletedContact.name}" deleted successfully!`);
      // Invalidate and refetch contacts queries
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-details"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: ApiError) => {
      const errorMessage = ClientErrorHandler.handle(error, setFieldError);
      toast.error(errorMessage);
    },
  });
}
