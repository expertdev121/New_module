"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  useCreateRelationshipMutation,
  useContactSearchQuery,
  useContactDetailsQuery,
} from "@/lib/query/relationships/useRelationshipQuery";

// -- Relationship Types
const relationshipTypes = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "grandmother", label: "Grandmother" },
  { value: "grandfather", label: "Grandfather" },
  { value: "grandparent", label: "Grandparent" },
  { value: "grandchild", label: "Grandchild" },
  { value: "grandson", label: "Grandson" },
  { value: "granddaughter", label: "Granddaughter" },
  { value: "parent", label: "Parent" },
  { value: "step-parent", label: "Step-parent" },
  { value: "stepmother", label: "Stepmother" },
  { value: "stepfather", label: "Stepfather" },
  { value: "sister", label: "Sister" },
  { value: "brother", label: "Brother" },
  { value: "step-sister", label: "Step-sister" },
  { value: "step-brother", label: "Step-brother" },
  { value: "stepson", label: "Stepson" },
  { value: "daughter", label: "Daughter" },
  { value: "son", label: "Son" },
  { value: "aunt", label: "Aunt" },
  { value: "uncle", label: "Uncle" },
  { value: "aunt/uncle", label: "Aunt/Uncle" },
  { value: "nephew", label: "Nephew" },
  { value: "niece", label: "Niece" },
  { value: "cousin (m)", label: "Cousin (M)" },
  { value: "cousin (f)", label: "Cousin (F)" },
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "wife", label: "Wife" },
  { value: "husband", label: "Husband" },
  { value: "former husband", label: "Former Husband" },
  { value: "former wife", label: "Former Wife" },
  { value: "fiance", label: "Fiancé" },
  { value: "divorced co-parent", label: "Divorced Co-parent" },
  { value: "separated co-parent", label: "Separated Co-parent" },
  { value: "legal guardian", label: "Legal Guardian" },
  { value: "legal guardian partner", label: "Legal Guardian Partner" },
  { value: "friend", label: "Friend" },
  { value: "neighbor", label: "Neighbor" },
  { value: "relative", label: "Relative" },
  { value: "business", label: "Business" },
  { value: "owner", label: "Owner" },
  { value: "chevrusa", label: "Chevrusa" },
  { value: "congregant", label: "Congregant" },
  { value: "rabbi", label: "Rabbi" },
  { value: "contact", label: "Contact" },
  { value: "foundation", label: "Foundation" },
  { value: "donor", label: "Donor" },
  { value: "fund", label: "Fund" },
  { value: "rebbi contact", label: "Rebbi Contact" },
  { value: "rebbi contact for", label: "Rebbi Contact For" },
  { value: "employee", label: "Employee" },
  { value: "employer", label: "Employer" },
  { value: "machatunim", label: "Machatunim" },
] as const;

const relationshipValues = relationshipTypes.map((type) => type.value);

const relationshipSchema = z.object({
  contactId: z.coerce.number().positive("Contact ID is required"),
  relatedContactId: z.number().positive("Related contact must be selected"),
  relationshipType: z.enum(relationshipValues as [string, ...string[]], { required_error: "Relationship type is required" }),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
}).refine(
  (data) => data.contactId !== data.relatedContactId,
  {
    message: "Cannot create relationship with the same contact",
    path: ["relatedContactId"],
  }
);

type RelationshipFormData = z.infer<typeof relationshipSchema>;

interface RelationshipDialogProps {
  contactId: number;
  contactName?: string;
  contactEmail?: string;
  triggerButton?: React.ReactNode;
}

export default function RelationshipDialog(props: RelationshipDialogProps) {
  const { contactId, contactName } = props;
  const [open, setOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<any>(null);

  // Fetch main contact details to display
  const { data: contactData, isLoading: isLoadingContact } = useContactDetailsQuery(contactId);

  // Fetch contacts for search dropdown, enable only if search string >=2 chars
  const { data: searchResults, isLoading: isSearching } = useContactSearchQuery(contactSearch, { enabled: contactSearch.length >= 2 });

  const effectiveContactName = contactName || contactData?.contact.firstName || "Unknown Contact";
  const createRelationshipMutation = useCreateRelationshipMutation();

  const form = useForm({
    resolver: zodResolver(relationshipSchema),
    defaultValues: {
      contactId,
      relatedContactId: 0,
      relationshipType: undefined,
      isActive: true,
      notes: "",
    },
  });

  const resetForm = () => {
    form.reset({
      contactId,
      relatedContactId: 0,
      relationshipType: undefined,
      isActive: true,
      notes: "",
    });
    setContactSearch("");
    setSelectedContact(null);
  };

  const onSubmit = async (data: RelationshipFormData) => {
    try {
      await createRelationshipMutation.mutateAsync(data as any);
      resetForm();
      setOpen(false);
    } catch (error) {
      console.error("Error creating relationship:", error);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const handleContactSelect = (contact: any) => {
    form.setValue("relatedContactId", contact.id);
    setSelectedContact(contact);
    setContactSearch(`${contact.firstName} ${contact.lastName}`);
  };

  const selectedRelationshipType = form.watch("relationshipType");
  const selectedRelatedContactId = form.watch("relatedContactId");

  return (
    <>
      {props.triggerButton ? (
        <div onClick={() => setOpen(true)}>{props.triggerButton}</div>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="border-dashed">
          <Users className="w-4 h-4 mr-2" />
          Add Relationship
        </Button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Add Relationship</CardTitle>
              <CardDescription>
                {isLoadingContact ? "Loading contact details..." : (
                  <>
                    Create a relationship for: <strong>{effectiveContactName}</strong>
                    {contactData?.activeRelationships?.length ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {contactData.activeRelationships.length} active relationship{contactData.activeRelationships.length > 1 ? "s" : ""}
                      </div>
                    ) : null}
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                {/* CONTACT SEARCH */}
                <div className="mb-6">
                  <FormLabel>Search Related Contact *</FormLabel>
                  <Input
                    placeholder="Type name or email to search contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                  {contactSearch.length >= 2 && !selectedContact && (
                    <div className="max-h-32 overflow-y-auto border rounded-md mt-1 bg-white z-10 relative">
                      {isSearching ? (
                        <div className="p-2 text-sm text-muted-foreground">Searching...</div>
                      ) : searchResults?.contacts && searchResults.contacts.length > 0 ? (
                        searchResults.contacts
                          .filter((c: any) => c.id !== contactId)
                          .map((contact: any) => (
                            <button
                              key={contact.id}
                              type="button"
                              className="w-full text-left p-2 hover:bg-gray-50 text-sm"
                              onClick={() => handleContactSelect(contact)}
                            >
                              {contact.firstName} {contact.lastName} &mdash; {contact.email}
                            </button>
                          ))
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">No contacts found</div>
                      )}
                    </div>
                  )}

                  {/* SELECTED CONTACT CARD */}
                  {selectedContact && (
                    <div className="mt-2 p-2 rounded border bg-muted flex justify-between items-center gap-2">
                      <span>
                        <b>Selected:</b> {selectedContact.firstName} {selectedContact.lastName}
                        {selectedContact.email && <> (<span className="text-xs">{selectedContact.email}</span>)</>}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedContact(null);
                          form.setValue("relatedContactId", 0);
                          setContactSearch("");
                        }}
                        className="px-2 text-lg"
                        title="Remove selected contact"
                      >
                        ×
                      </Button>
                    </div>
                  )}
                </div>

                {/* Relationship Type as Dropdown */}
                <FormField
                  control={form.control}
                  name="relationshipType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select relationship type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]">
                          {relationshipTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Status */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 my-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div>
                        <FormLabel>Active Relationship</FormLabel>
                        <div className="text-xs text-muted-foreground">
                          Whether this relationship is currently active
                        </div>
                      </div>
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Additional notes about this relationship" rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* SUMMARY */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                  <h4 className="font-medium text-blue-900 mb-2">Relationship Summary</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <div>
                      <strong>{effectiveContactName}</strong> is the{" "}
                      <strong>
                        {selectedRelationshipType
                          ? relationshipTypes.find((t) => t.value === selectedRelationshipType)?.label.toLowerCase()
                          : "[relationship type]"}
                      </strong>{" "}
                      of{" "}
                      <strong>
                        {selectedContact
                          ? `${selectedContact.firstName} ${selectedContact.lastName}`
                          : "Unknown Contact"}
                      </strong>
                    </div>
                    <div>Status: {form.watch("isActive") ? "Active" : "Inactive"}</div>
                  </div>
                </div>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createRelationshipMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={
                  createRelationshipMutation.isPending ||
                  isLoadingContact ||
                  !selectedRelatedContactId ||
                  !selectedRelationshipType
                }
              >
                {createRelationshipMutation.isPending ? "Adding..." : "Add Relationship"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  );
}
