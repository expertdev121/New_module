"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { User, MapPin, Grid2x2, Trash2 } from "lucide-react";
import { Contact, ContactRole, StudentRole } from "@/lib/db/schema";
import ContactCategoriesCard from "./Contact-Category";
import { Category } from "@/lib/query/useContactCategories";
import { DeleteConfirmationDialog } from "../ui/delete-confirmation-dialog";
import { useDeleteContact } from "@/lib/mutation/useDeleteContact";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ContactWithRoles extends Contact {
  contactRoles: ContactRole[];
  studentRoles: StudentRole[];
}

interface FinancialSummary {
  totalPledgedUsd: number;
  totalPaidUsd: number;
  currentBalanceUsd: number;
}

interface ContactOverviewTabProps {
  contact: ContactWithRoles;
  financialSummary: FinancialSummary;
  categoriesData?: {
    categories: Category[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const ContactOverviewTab: React.FC<ContactOverviewTabProps> = ({
  contact,
  financialSummary,
  categoriesData,
}) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteContactMutation = useDeleteContact();

  const paymentPercentage =
    financialSummary.totalPledgedUsd > 0
      ? Math.round(
        parseFloat(((financialSummary.totalPaidUsd /
          financialSummary.totalPledgedUsd) *
        100).toFixed(2))
      )
      : 0;

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    deleteContactMutation.mutate(contact.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        router.push("/contacts");
      },
    });
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const contactName = contact.displayName || `${contact.firstName} ${contact.lastName}`;

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {contactName}
          </h1>
          <p className="text-gray-600 mt-1">
            Contact Details
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={handleDeleteClick}
          disabled={deleteContactMutation.isPending}
          className="flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          {deleteContactMutation.isPending ? "Deleting..." : "Delete Contact"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 divide-y">
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">Full Name</dt>
                <dd className="text-right capitalize">
                  {contact.displayName || `${contact.title ? `${contact.title}. ` : ""}${contact.firstName} ${contact.lastName}` || "N/A"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">Email</dt>
                <dd className="text-right overflow-hidden text-ellipsis">
                  {contact.email ?? "N/A"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">Phone</dt>
                <dd className="text-right">{contact.phone ?? "N/A"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">Gender</dt>
                <dd className="text-right capitalize">
                  {contact.gender ?? "N/A"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  Address
                </dt>
                <dd className="text-right">{contact.address ?? "N/A"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* General Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Grid2x2 className="h-5 w-5" />
              General Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Payment Progress
                </span>
                <span className="text-sm font-medium">{paymentPercentage}%</span>
              </div>
              <Progress value={paymentPercentage} />
            </div>

            <dl className="space-y-4 divide-y">
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">
                  Total Pledged
                </dt>
                <dd className="text-right font-medium">
                  ${financialSummary.totalPledgedUsd.toLocaleString(
                    "en-US"
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">Total Paid</dt>
                <dd className="text-right font-medium">
                  ${financialSummary.totalPaidUsd.toLocaleString(
                    "en-US"
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-1 py-2">
                <dt className="text-muted-foreground font-medium">
                  Current Balance
                </dt>
                <dd className="text-right font-bold">
                  ${financialSummary.currentBalanceUsd.toLocaleString(
                    "en-US"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Categories Section */}
        <div className="lg:col-span-2">
          <ContactCategoriesCard />
        </div>
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        contactName={contactName}
        isDeleting={deleteContactMutation.isPending}
      />
    </>
  );
};

export default ContactOverviewTab;