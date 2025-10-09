"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Users, DollarSign, Calendar, FileText, ArrowUpRight } from "lucide-react";
import { DateRangePicker, RangeKeyDict } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import type { TooltipItem } from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  useDashboardOverview,
  useDashboardTrends,
  useDashboardPaymentMethods,
  useDashboardPledgeStatus,
  useDashboardTopDonors,
  useDashboardRecentActivity,
} from "@/lib/query/useDashboard";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_COLORS = {
  blue: 'rgb(59, 130, 246)',
  green: 'rgb(16, 185, 129)',
  orange: 'rgb(245, 158, 11)',
  red: 'rgb(239, 68, 68)',
  purple: 'rgb(139, 92, 246)',
  pink: 'rgb(236, 72, 153)',
  teal: 'rgb(20, 184, 166)',
  indigo: 'rgb(99, 102, 241)',
  yellow: 'rgb(234, 179, 8)',
  cyan: 'rgb(6, 182, 212)',
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 6)),
      endDate: new Date(),
      key: 'selection'
    }
  ]);

  const [loading, setLoading] = useState(false);

  // Data queries
  const { data: overviewData, isLoading: overviewLoading } = useDashboardOverview(
    "custom",
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );
  const { data: trendsData, isLoading: trendsLoading } = useDashboardTrends(
    "custom",
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );
  const { data: paymentMethodData, isLoading: paymentMethodsLoading } = useDashboardPaymentMethods(
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );
  const { data: pledgeStatusData, isLoading: pledgeStatusLoading } = useDashboardPledgeStatus(
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );
  const { data: topDonors = [], isLoading: topDonorsLoading } = useDashboardTopDonors(
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );
  const { data: recentActivity = [], isLoading: recentActivityLoading } = useDashboardRecentActivity(
    dateRange[0].startDate.toISOString().split('T')[0],
    dateRange[0].endDate.toISOString().split('T')[0]
  );

  const isLoading = overviewLoading || trendsLoading || paymentMethodsLoading || pledgeStatusLoading || topDonorsLoading || recentActivityLoading;

  if (status === "loading") return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!session) {
    router.push("/auth/login");
    return null;
  }
  if (session.user.role !== "admin") {
    router.push("/contacts");
    return null;
  }

  const exportData = (format: "csv" | "pdf") => {
    setLoading(true);
    setTimeout(() => {
      alert(`Exporting data as ${format.toUpperCase()}...`);
      setLoading(false);
    }, 1000);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Chart configurations
  const trendChartData = trendsData ? {
    labels: trendsData.labels,
    datasets: [
      {
        label: 'Pledges',
        data: trendsData.pledges,
        borderColor: CHART_COLORS.blue,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Payments',
        data: trendsData.payments,
        borderColor: CHART_COLORS.green,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  } : { labels: [], datasets: [] };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(tickValue: string | number) {
            if (typeof tickValue === 'number') {
              if (tickValue >= 1000) {
                return '$' + (tickValue / 1000) + 'k';
              } else {
                return formatCurrency(tickValue);
              }
            }
            return tickValue;
          }
        }
      }
    }
  };

  const paymentMethodChartData = paymentMethodData ? {
    labels: paymentMethodData.labels,
    datasets: [
      {
        data: paymentMethodData.values,
        backgroundColor: [
          CHART_COLORS.blue,
          CHART_COLORS.green,
          CHART_COLORS.orange,
          CHART_COLORS.red,
          CHART_COLORS.purple,
          CHART_COLORS.pink,
          CHART_COLORS.teal,
          CHART_COLORS.indigo,
          CHART_COLORS.yellow,
          CHART_COLORS.cyan,
        ],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  } : { labels: [], datasets: [] };

  const paymentMethodChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'doughnut'>) {
            const label = context.label || '';
            const value = formatCurrency(context.parsed);
            const count = paymentMethodData?.counts[context.dataIndex] || 0;
            return label + ': ' + value + ' (' + count + ' transactions)';
          }
        }
      }
    },
  };

  const pledgeStatusChartData = pledgeStatusData ? {
    labels: pledgeStatusData.labels,
    datasets: [
      {
        label: 'Number of Pledges',
        data: pledgeStatusData.values,
        backgroundColor: [CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.red],
        borderWidth: 1,
        borderColor: '#fff',
      },
    ],
  } : { labels: [], datasets: [] };

  const pledgeStatusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      }
    }
  };

  const paymentVolumeChartData = paymentMethodData ? {
    labels: paymentMethodData.labels,
    datasets: [
      {
        label: 'Payment Volume',
        data: paymentMethodData.values,
        backgroundColor: CHART_COLORS.green,
        borderColor: CHART_COLORS.green,
        borderWidth: 1,
      },
    ],
  } : { labels: [], datasets: [] };

  const paymentVolumeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'bar'>) {
            return formatCurrency(context.parsed.y);
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(tickValue: string | number) {
            if (typeof tickValue === 'number') {
              return '$' + (tickValue / 1000) + 'k';
            }
            return tickValue;
          }
        }
      }
    }
  };

  return (
    <div className="bg-gray-50">
      <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-500 mt-1">Welcome back, {session.user.email}</p>
            </div>
            <div className="flex gap-3 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Calendar className="w-4 h-4 mr-2" />
                    {dateRange[0].startDate.toLocaleDateString()} - {dateRange[0].endDate.toLocaleDateString()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <DateRangePicker
                    onChange={(item: RangeKeyDict) => setDateRange([item.selection as { startDate: Date; endDate: Date; key: string }])}
                    showSelectionPreview={true}
                    moveRangeOnFirstSelection={false}
                    months={2}
                    ranges={dateRange}
                    direction="horizontal"
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={() => exportData("csv")} disabled={loading}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => exportData("pdf")} disabled={loading}>
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pledges">Pledges</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Contacts</CardTitle>
                    <Users className="w-4 h-4 text-gray-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overviewData?.totalContacts.toLocaleString() || 0}</div>
                    <p className="text-xs text-green-600 flex items-center mt-1">
                      <ArrowUpRight className="w-3 h-3 mr-1" />
                      {overviewData?.contactsGrowthPercentage || 0}% from previous period
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Pledges</CardTitle>
                    <FileText className="w-4 h-4 text-gray-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overviewData?.totalPledgeAmount || 0)}</div>
                    <p className="text-xs text-gray-600 mt-1">{overviewData?.totalPledges || 0} pledges</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Collected</CardTitle>
                    <DollarSign className="w-4 h-4 text-gray-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overviewData?.totalPaymentAmount || 0)}</div>
                    <p className="text-xs text-green-600 flex items-center mt-1">
                      <ArrowUpRight className="w-3 h-3 mr-1" />
                      {overviewData?.collectionRate || 0}% collection rate
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Active Plans</CardTitle>
                    <Calendar className="w-4 h-4 text-gray-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overviewData?.activePlans || 0}</div>
                    <p className="text-xs text-gray-600 mt-1">
                      {overviewData?.scheduledPayments || 0} scheduled payments
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Pledges vs Payments Trend</CardTitle>
                    <CardDescription>
                      Comparison over selected period
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <Line data={trendChartData} options={trendChartOptions} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Methods Distribution</CardTitle>
                    <CardDescription>Breakdown by payment type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <Doughnut data={paymentMethodChartData} options={paymentMethodChartOptions} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Bottom Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Donors</CardTitle>
                    <CardDescription>Highest contributing contacts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {topDonors.map((donor, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">{donor.name}</p>
                              <p className="text-sm text-gray-500">{donor.pledges} pledges</p>
                              <div className="text-xs text-gray-400">
                                <span className="text-blue-600">Pledge: {formatCurrency(donor.pledgeAmount)}</span>
                                {donor.thirdPartyAmount > 0 && (
                                  <span className="ml-2 text-purple-600">Third-party: {formatCurrency(donor.thirdPartyAmount)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(donor.amount)}</p>
                            <p className="text-sm text-green-600">{Math.round(donor.completion * 100) / 100}% complete</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest transactions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentActivity.map((activity, index) => (
                        <div key={index} className="flex items-center justify-between border-b pb-3 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              activity.type === 'payment' ? 'bg-green-500' :
                              activity.type === 'pledge' ? 'bg-blue-500' : 'bg-purple-500'
                            }`} />
                            <div>
                              <p className="font-medium text-sm">{activity.contactName}</p>
                              <p className="text-xs text-gray-500">{activity.method} • {activity.date}</p>
                            </div>
                          </div>
                          <p className="font-semibold">{formatCurrency(activity.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="pledges" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Pledge Status Overview</CardTitle>
                    <CardDescription>Current status of all pledges</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <Bar data={pledgeStatusChartData} options={pledgeStatusChartOptions} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pledge Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Average Pledge</span>
                      <span className="font-bold">{formatCurrency(overviewData?.avgPledgeSize || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Active Plans</span>
                      <span className="font-bold">{overviewData?.activePlans || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Scheduled</span>
                      <span className="font-bold">{overviewData?.scheduledPayments || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Unscheduled</span>
                      <span className="font-bold">{overviewData?.unscheduledPayments || 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="payments" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Volume by Method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <Bar data={paymentVolumeChartData} options={paymentVolumeChartOptions} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Payments</span>
                      <span className="font-bold">{overviewData?.totalPayments || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Average Payment</span>
                      <span className="font-bold">{formatCurrency(overviewData?.avgPaymentSize || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Third Party</span>
                      <span className="font-bold">{overviewData?.thirdPartyPayments || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Collection Rate</span>
                      <span className="font-bold text-green-600">{overviewData?.collectionRate || 0}%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Analytics</CardTitle>
                  <CardDescription>Overview of contact engagement and contributions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">Contact analytics coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
    </div>
  );
}
