"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";

interface ReportData {
  [key: string]: string;
}

export default function DonorContributionReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [filters] = useState({
    locationId: session?.user?.locationId || ""
  });

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/auth/login");
    } else if (session.user.role !== "admin") {
      router.push("/contacts");
    }
  }, [session, status, router]);

  // Load all data on component mount
  useEffect(() => {
    if (session?.user?.role === "admin" && initialLoad) {
      fetchReportData("all");
      setInitialLoad(false);
    }
  }, [session, initialLoad]);

  if (status === "loading") {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!session || session.user.role !== "admin") {
    return null; // Will redirect
  }

  const filterOptions = [
    {
      id: "all",
      title: "All Amounts",
      description: "Show all donor contributions",
      minAmount: undefined
    },
    {
      id: "500-above",
      title: "$500 and Above",
      description: "Show donors who have given $500 or more",
      minAmount: 500
    },
    {
      id: "1000-above",
      title: "$1,000 and Above",
      description: "Show donors who have given $1,000 or more",
      minAmount: 1000
    }
  ];

  const fetchReportData = async (filterId: string) => {
    setLoading(true);
    try {
      const filterOption = filterOptions.find(f => f.id === filterId);
      const response = await fetch('/api/admin/reports/donor-contribution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType: filterId,
          filters: {
            ...filters,
            minAmount: filterOption?.minAmount
          },
          preview: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setReportData(result.data || []);
        setSelectedFilter(filterId);
      } else {
        console.error('Failed to fetch report data');
        setReportData([]);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (filterId: string) => {
    try {
      const filterOption = filterOptions.find(f => f.id === filterId);
      const response = await fetch('/api/admin/reports/donor-contribution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType: filterId,
          filters: {
            ...filters,
            minAmount: filterOption?.minAmount
          }
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `donor-contribution-${filterId}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
    }
  };

  const columns: ColumnDef<ReportData>[] = useMemo(() => {
    if (reportData.length === 0) return [];
    return Object.keys(reportData[0]).map((header) => ({
      accessorKey: header,
      header: header,
      cell: ({ getValue }) => {
        const value = getValue() as string;
        return <span className="text-sm">{value}</span>;
      },
    }));
  }, [reportData]);

  const table = useReactTable({
    data: reportData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Donor Contribution Reports</h1>
        <p className="text-muted-foreground">
          Generate reports to track giving levels and donor engagement
        </p>
      </div>

      {/* Filter Selection */}
      <div className="flex gap-4 flex-wrap">
        {filterOptions.map((filter) => (
          <Button
            key={filter.id}
            variant={selectedFilter === filter.id ? "default" : "outline"}
            onClick={() => fetchReportData(filter.id)}
            disabled={loading}
          >
            {filter.title}
          </Button>
        ))}
      </div>

      {/* Data Table */}
      {reportData.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Report Data ({reportData.length} donors)</h2>
            <Button onClick={() => generateReport(selectedFilter)}>
              <FileText className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <DataTable table={table} />
        </div>
      )}

      {loading && (
        <div className="text-center py-8">Loading report data...</div>
      )}
    </div>
  );
}
