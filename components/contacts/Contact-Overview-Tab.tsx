"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { User, MapPin, Grid2x2 } from "lucide-react";
import { Contact, ContactRole, StudentRole } from "@/lib/db/schema";
import ContactCategoriesCard from "./Contact-Category";
import { Category } from "@/lib/query/useContactCategories";

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
  categories: Category[];
}

const ContactOverviewTab: React.FC<ContactOverviewTabProps> = ({
  contact,
  financialSummary,
  categories,
}) => {
  const paymentPercentage =
    financialSummary.totalPledgedUsd > 0
      ? Math.round(
          (financialSummary.totalPaidUsd /
            financialSummary.totalPledgedUsd) *
            100
        )
      : 0;

  return (
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
                {contact.title ? `${contact.title}. ` : ""}
                {contact.firstName} {contact.lastName}
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
                ${Math.round(financialSummary.totalPledgedUsd).toLocaleString(
                  "en-US"
                )}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-1 py-2">
              <dt className="text-muted-foreground font-medium">Total Paid</dt>
              <dd className="text-right font-medium">
                ${Math.round(financialSummary.totalPaidUsd).toLocaleString(
                  "en-US"
                )}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-1 py-2">
              <dt className="text-muted-foreground font-medium">
                Current Balance
              </dt>
              <dd className="text-right font-bold">
                ${Math.round(financialSummary.currentBalanceUsd).toLocaleString(
                  "en-US"
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Categories Section */}
      <div className="lg:col-span-2">
        <ContactCategoriesCard categories={categories} />
      </div>
    </div>
  );
};

export default ContactOverviewTab;