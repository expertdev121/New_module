"use client";

import React, { useMemo } from "react";
import { useQueryState } from "nuqs";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search } from "lucide-react";
import { LinkButton } from "../ui/next-link";
import { useGetContacts } from "@/lib/query/useContacts";
import ContactFormDialog from "../forms/contact-form";
import ContactsSummaryCards from "./contact-summary";
import { useRouter } from "next/navigation";
import ExportDataDialog from "../export";

const QueryParamsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z
    .enum(["updatedAt", "firstName", "lastName", "displayName", "totalPledgedUsd"])
    .default("displayName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export default function ContactsTable() {
  const [page, setPage] = useQueryState("page", {
    parse: (value) => parseInt(value) || 1,
    serialize: (value) => value.toString(),
  });
  const [limit] = useQueryState("limit", {
    parse: (value) => parseInt(value) || 10,
    serialize: (value) => value.toString(),
  });
  const [search, setSearch] = useQueryState("search");
  const [sortBy, setSortBy] = useQueryState("sortBy", {
    parse: (value) =>
      ["updatedAt", "firstName", "lastName", "displayName", "totalPledgedUsd"].includes(value)
        ? value
        : "displayName",
    serialize: (value) => value,
  });
  const [sortOrder, setSortOrder] = useQueryState("sortOrder", {
    parse: (value) => (value === "asc" || value === "desc" ? value : "asc"),
    serialize: (value) => value,
  });

  const router = useRouter();

  const currentPage = page ?? 1;
  const currentLimit = limit ?? 10;

  const queryParams = QueryParamsSchema.parse({
    page: currentPage,
    limit: currentLimit,
    search: search || undefined,
    sortBy: sortBy || "displayName",
    sortOrder: sortOrder || "asc",
  });

  const { data, isLoading, error } = useGetContacts(queryParams);

  const summaryData = useMemo(() => {
    if (!data?.contacts) return undefined;

    const totalContacts = data.pagination.totalCount;
    const totalPledgedAmount = data.contacts.reduce((sum, contact) => {
      const amount = parseFloat(contact.totalPledgedUsd?.toString() || "0");
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    const contactsWithPledges = data.contacts.filter((contact) => {
      const amount = parseFloat(contact.totalPledgedUsd?.toString() || "0");
      return !isNaN(amount) && amount > 0;
    }).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentContacts = data.contacts.filter((contact) => {
      const createdDate = new Date(contact.createdAt);
      return createdDate >= thirtyDaysAgo;
    }).length;

    return {
      totalContacts,
      totalPledgedAmount,
      contactsWithPledges,
      recentContacts,
    };
  }, [data]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (error) {
    return (
      <Alert className="mx-4 my-6">
        <AlertDescription>
          Failed to load contacts data. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="py-4">
      <ContactsSummaryCards
        data={summaryData}
        showViewAll={true}
        pledgesHref="/pledges"
        pledgersHref="/student-roles"
        recentHref="/contact-roles"
      />
      <p className="my-2 text-muted-foreground">
        View and manage your contacts
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search contacts..."
            value={search || ""}
            onChange={(e) => setSearch(e.target.value || null)}
            className="pl-10"
          />
        </div>

        <Select
          value={sortBy as string | undefined}
          onValueChange={(value) => setSortBy(value === "" ? null : value)}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="updatedAt">Updated At</SelectItem>
              <SelectItem value="firstName">First Name</SelectItem>
              <SelectItem value="lastName">Last Name</SelectItem>
              <SelectItem value="displayName">Full Name</SelectItem>
              <SelectItem value="totalPledgedUsd">Total Pledged</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={sortOrder as string | undefined}
          onValueChange={(value) => setSortOrder(value as "asc" | "desc")}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Sort Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <ContactFormDialog />
        <ExportDataDialog
          triggerText="Export All Data"
          triggerVariant="secondary"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold text-gray-900">
                Full Name
              </TableHead>
              <TableHead className="font-semibold text-gray-900">
                Email
              </TableHead>
              <TableHead className="font-semibold text-gray-900">
                Phone
              </TableHead>
              <TableHead className="font-semibold text-gray-900">
                Total Pledged (USD)
              </TableHead>
              <TableHead className="font-semibold text-gray-900">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: currentLimit }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-gray-500"
                >
                  No contacts found
                </TableCell>
              </TableRow>
            ) : (
              data?.contacts.map((contact) => (
                <TableRow
                  key={`${contact.id}-${contact.createdAt}`}
                  className="hover:bg-gray-50"
                  onClick={() => {
                    router.push(`/contacts/${contact.id}`);
                  }}
                >
                  <TableCell className="font-medium">
                    {contact.displayName || `${contact.firstName} ${contact.lastName}` || "N/A"}
                  </TableCell>
                  <TableCell>{contact.email || "N/A"}</TableCell>
                  <TableCell>{contact.phone || "N/A"}</TableCell>
                  <TableCell>
                    {formatCurrency(contact.totalPledgedUsd)}
                  </TableCell>
                  <TableCell>
                    <LinkButton
                      variant="secondary"
                      href={`/contacts/${contact.id}`}
                      className="p-2 text-primary underline"
                    >
                      View
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.contacts.length > 0 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            Showing {(currentPage - 1) * currentLimit + 1} to{" "}
            {Math.min(currentPage * currentLimit, data.pagination.totalCount)}{" "}
            of {data.pagination.totalCount} contacts
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(currentPage - 1)}
              disabled={!data.pagination.hasPreviousPage}
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-600">
                Page {currentPage} of {data.pagination.totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(currentPage + 1)}
              disabled={!data.pagination.hasNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
