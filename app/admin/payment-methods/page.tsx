"use client";
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import PaymentMethodsManagement from '@/components/admin/payment-methods-management';
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Updated types to match the management component's expectations
type PaymentMethod = {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;  // Changed from is_active to isActive
  createdAt?: string;
  updatedAt?: string;
  details: PaymentMethodDetail[];
};

type PaymentMethodDetail = {
  id: number;
  paymentMethodId: number;  // Changed from payment_method_id to paymentMethodId
  key: string;
  value: string;
  createdAt?: string;
  updatedAt?: string;
};

// API Response types to handle schema variations
interface PaymentMethodApiResponse {
  id: number;
  name: string;
  description?: string;
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface PaymentMethodDetailApiResponse {
  id: number;
  paymentMethodId?: number;
  payment_method_id?: number;
  key: string;
  value: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const PaymentMethodsPage = () => {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchMethods();
  }, [currentPage, pageSize, search]);

  // Normalize API response to match our interface
  const normalizePaymentMethod = (apiMethod: PaymentMethodApiResponse): Omit<PaymentMethod, 'details'> => ({
    id: apiMethod.id,
    name: apiMethod.name,
    description: apiMethod.description,
    isActive: apiMethod.isActive !== undefined ? apiMethod.isActive : apiMethod.is_active !== undefined ? apiMethod.is_active : true,
    createdAt: apiMethod.createdAt || apiMethod.created_at,
    updatedAt: apiMethod.updatedAt || apiMethod.updated_at,
  });

  const normalizePaymentMethodDetail = (apiDetail: PaymentMethodDetailApiResponse): PaymentMethodDetail => ({
    id: apiDetail.id,
    paymentMethodId: apiDetail.paymentMethodId || apiDetail.payment_method_id || 0,
    key: apiDetail.key,
    value: apiDetail.value,
    createdAt: apiDetail.createdAt || apiDetail.created_at,
    updatedAt: apiDetail.updatedAt || apiDetail.updated_at,
  });

  async function fetchMethods() {
    setLoading(true);
    setError(null);
    try {
      // Build query parameters for pagination and search
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      if (search) params.append("search", search);

      const res = await fetch(`/api/admin/payment-methods?${params}`, {
        credentials: 'include',
      });
      
      if (!res.ok) throw new Error('Failed to fetch payment methods');
      
      const data = await res.json();
      
      // If your API doesn't return pagination info, create it manually
      if (data.methods) {
        // If API returns paginated response
        const normalizedMethods = await Promise.all(
          data.methods.map(async (apiMethod: PaymentMethodApiResponse) => {
            try {
              const detailsRes = await fetch(`/api/admin/payment-methods/details?paymentMethodId=${apiMethod.id}`, {
                credentials: 'include',
              });
              const apiDetails: PaymentMethodDetailApiResponse[] = await detailsRes.json();
              
              const normalizedMethod = normalizePaymentMethod(apiMethod);
              const normalizedDetails = apiDetails.map(normalizePaymentMethodDetail);
              
              return {
                ...normalizedMethod,
                details: normalizedDetails,
              } as PaymentMethod;
            } catch {
              return {
                ...normalizePaymentMethod(apiMethod),
                details: [],
              } as PaymentMethod;
            }
          })
        );
        
        setMethods(normalizedMethods);
        setPagination(data.pagination);
      } else {
        // If API returns all methods, handle pagination client-side
        const allMethods: PaymentMethodApiResponse[] = data;
        
        // Fetch details for each method and normalize
        const methodsWithDetails = await Promise.all(
          allMethods.map(async (apiMethod: PaymentMethodApiResponse) => {
            try {
              const detailsRes = await fetch(`/api/admin/payment-methods/details?paymentMethodId=${apiMethod.id}`, {
                credentials: 'include',
              });
              const apiDetails: PaymentMethodDetailApiResponse[] = await detailsRes.json();
              
              const normalizedMethod = normalizePaymentMethod(apiMethod);
              const normalizedDetails = apiDetails.map(normalizePaymentMethodDetail);
              
              return {
                ...normalizedMethod,
                details: normalizedDetails,
              } as PaymentMethod;
            } catch {
              return {
                ...normalizePaymentMethod(apiMethod),
                details: [],
              } as PaymentMethod;
            }
          })
        );

        // Apply search filter
        const filteredMethods = search 
          ? methodsWithDetails.filter(m => 
              m.name.toLowerCase().includes(search.toLowerCase()) || 
              (m.description || "").toLowerCase().includes(search.toLowerCase())
            )
          : methodsWithDetails;

        // Calculate pagination
        const totalCount = filteredMethods.length;
        const totalPages = Math.ceil(totalCount / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedMethods = filteredMethods.slice(startIndex, endIndex);

        setMethods(paginatedMethods);
        setPagination({
          page: currentPage,
          limit: pageSize,
          totalCount,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
        });
      }
    } catch (e) {
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  if (loading) {
    return <div className="text-center py-8">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Manage Payment Methods</h1>
          <p className="text-muted-foreground">
            View and manage payment methods and their details
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Methods ({pagination?.totalCount || 0})</CardTitle>
              <CardDescription>
                Manage all payment methods and their details
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 mb-4">{error}</div>
          )}
          
          <PaymentMethodsManagement 
            methods={methods} 
            search={search}
            onSearchChange={handleSearchChange}
            onMethodUpdate={fetchMethods}
          />

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, pagination.totalCount)} of {pagination.totalCount} payment methods
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentMethodsPage;
