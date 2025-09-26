"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { tagSchema } from "@/lib/form-schemas/tag";
import { useCreateTagMutation, useUpdateTagMutation } from "@/lib/query/tags/useTagsQuery";
import { Tag } from "@/lib/db/schema";
import { toast } from "sonner";

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag;
  mode: "create" | "edit";
}

type TagFormData = z.infer<typeof tagSchema>;

export function TagDialog({ open, onOpenChange, tag, mode }: TagDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTagMutation = useCreateTagMutation();
  const updateTagMutation = useUpdateTagMutation();

  const form = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      name: "",
      description: "",
      showOnPayment: true,
      showOnPledge: true,
      isActive: true,
    },
  });

  // 👇 Reset form when tag or mode changes
  useEffect(() => {
    if (mode === "edit" && tag) {
      form.reset({
        name: tag.name || "",
        description: tag.description || "",
        showOnPayment: tag.showOnPayment ?? true,
        showOnPledge: tag.showOnPledge ?? true,
        isActive: tag.isActive ?? true,
      });
    } else if (mode === "create") {
      form.reset({
        name: "",
        description: "",
        showOnPayment: true,
        showOnPledge: true,
        isActive: true,
      });
    }
  }, [tag, mode, form]);

  const onSubmit = async (values: TagFormData) => {
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        await createTagMutation.mutateAsync(values);
        toast.success("Tag created successfully");
      } else if (mode === "edit" && tag) {
        await updateTagMutation.mutateAsync({
          tagId: tag.id,
          ...values,
        });
        toast.success("Tag updated successfully");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Tag" : "Edit Tag"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new tag that can be assigned to payments and pledges."
              : "Update the tag details."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter tag name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter tag description (optional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            /> */}

            <FormField
              control={form.control}
              name="showOnPayment"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Show on Payments</FormLabel>
                    <FormDescription>
                      Allow this tag to be assigned to payments
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="showOnPledge"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Show on Pledges</FormLabel>
                    <FormDescription>
                      Allow this tag to be assigned to pledges
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <FormDescription>
                      Inactive tags cannot be assigned to new items
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "create" ? "Create Tag" : "Update Tag"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
