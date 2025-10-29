"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Campaign, useContactCampaigns } from "@/lib/query/useContactCategories";
import { DollarSign } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Extended interface for campaigns that includes scheduledUsd from the backend
interface ExtendedCampaign extends Campaign {
  scheduledUsd?: number | string; // Allow both number and string from backend
}

export default function ContactCampaignsCard() {
  const { contactId } = useParams<{ contactId: string }>();
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: campaignsData, isLoading, isError } = useContactCampaigns(
    parseInt(contactId || "0"),
    page,
    limit
  );

  const campaigns = campaignsData?.campaigns || [];
  const pagination = campaignsData?.pagination;

  const getScheduledAmount = (campaign: ExtendedCampaign) => {
    let scheduled = campaign.scheduledUsd;

    if (typeof scheduled === "string") {
      scheduled = parseFloat(scheduled);
    } else if (scheduled === null || scheduled === undefined) {
      scheduled = 0;
    }

    const validScheduled =
      typeof scheduled === "number" && !isNaN(scheduled) ? scheduled : 0;

    console.log(
      `💰 Scheduled amount for ${campaign.campaignName}: $${validScheduled} (from backend)`
    );
    return validScheduled.toLocaleString("en-US");
  };

  const calculateUnscheduled = (
    balance: string | number,
    scheduled: string | number
  ) => {
    let balanceNum = balance;
    if (typeof balanceNum === "string") {
      balanceNum = parseFloat(balanceNum);
    }
    const validBalance =
      typeof balanceNum === "number" && !isNaN(balanceNum) ? balanceNum : 0;

    let scheduledNum = scheduled;
    if (typeof scheduledNum === "string") {
      scheduledNum = parseFloat(scheduledNum);
    }
    const validScheduled =
      typeof scheduledNum === "number" && !isNaN(scheduledNum)
        ? scheduledNum
        : 0;

    const unscheduled = Math.max(0, validBalance - validScheduled);

    console.log(
      `📊 Unscheduled calculation: Balance($${validBalance}) - Scheduled($${validScheduled}) = $${unscheduled}`
    );
    return unscheduled.toLocaleString("en-US");
  };

  const sortedCampaigns = [...campaigns].sort((a, b) =>
    a.campaignName.localeCompare(b.campaignName)
  );

  console.log(
    "\n🔍 Campaigns with scheduled amounts from backend:",
    sortedCampaigns
  );

  return (
    <Card className="w-full lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Financial Summary by Campaign
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold">Campaign</TableHead>
              <TableHead className="font-bold text-right">Committed Donation</TableHead>
              <TableHead className="font-bold text-right">Paid</TableHead>
              <TableHead className="font-bold text-right">Balance</TableHead>
              <TableHead className="font-bold text-right">Pledges</TableHead>
              <TableHead className="font-bold text-right italic">
                Scheduled
              </TableHead>
              <TableHead className="font-bold text-right italic">
                Unscheduled
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCampaigns.map((campaign) => {
              const scheduledAmount = getScheduledAmount(campaign);
              const unscheduledAmount = calculateUnscheduled(
                campaign.currentBalanceUsd,
                campaign.scheduledUsd || 0
              );

              return (
                <TableRow key={campaign.campaignId}>
                  <TableCell className="font-bold">
                    <Link
                      href={`/contacts/${contactId}/pledges?campaignId=${campaign?.campaignId}`}
                      className="font-bold text-primary hover:underline hover:text-primary-dark transition-colors duration-200"
                    >
                      {campaign.campaignName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    ${(
                      typeof campaign.totalPledgedUsd === "number"
                        ? campaign.totalPledgedUsd
                        : parseFloat(campaign.totalPledgedUsd) || 0
                    ).toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(
                      typeof campaign.totalPaidUsd === "number"
                        ? campaign.totalPaidUsd
                        : parseFloat(campaign.totalPaidUsd) || 0
                    ).toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(
                      typeof campaign.currentBalanceUsd === "number"
                        ? campaign.currentBalanceUsd
                        : parseFloat(campaign.currentBalanceUsd) || 0
                    ).toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.pledgeCount}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-evenly italic text-blue-600">
                      ${scheduledAmount}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-evenly italic text-red-600">
                      ${unscheduledAmount}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {pagination && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Page {page} of {pagination.totalPages} ({pagination.total} total campaigns)
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
