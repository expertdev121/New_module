import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { contact, payment, pledge, campaign, paymentAllocations } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';

interface CampaignFundraisingRow {
  campaign_code: string | null;
  campaign_name: string | null;
  total_raised: number | null;
  total_donors: number | null;
  avg_gift: number | null;
  donor_id: number | null;
  donor_first_name: string | null;
  donor_last_name: string | null;
  donor_email: string | null;
  donor_phone: string | null;
  donor_address: string | null;
  donor_contribution: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportType, filters, preview } = await request.json();
    const { campaignCode, year, locationId } = filters;

    // Escape single quotes to prevent SQL injection
    const escapeSql = (value: string) => value.replace(/'/g, "''");
    const safeLocationId = escapeSql(locationId);
    const safeCampaignCode = campaignCode ? escapeSql(campaignCode) : null;

    // Base query for direct payments (non-split payments)
    let directPaymentsSQL = `
      SELECT
        pl.campaign_code,
        c.id as donor_id,
        c.first_name as donor_first_name,
        c.last_name as donor_last_name,
        c.email as donor_email,
        c.phone as donor_phone,
        c.address as donor_address,
        COALESCE(p.amount_usd, p.amount) as amount,
        p.payment_date
      FROM payment p
      INNER JOIN pledge pl ON p.pledge_id = pl.id
      INNER JOIN contact c ON pl.contact_id = c.id
      WHERE c.location_id = '${safeLocationId}'
        AND p.payment_status = 'completed'
        AND p.payment_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_allocations pa 
          WHERE pa.payment_id = p.id
        )`;

    // Apply campaign filter
    if (safeCampaignCode) {
      directPaymentsSQL += ` AND pl.campaign_code = '${safeCampaignCode}'`;
    }

    // Apply year filter
    if (year) {
      const safeYear = parseInt(year.toString(), 10);
      directPaymentsSQL += ` AND EXTRACT(YEAR FROM p.payment_date) = ${safeYear}`;
    }

    // Query for split payments (payment allocations)
    let splitPaymentsSQL = `
      SELECT
        pl.campaign_code,
        c.id as donor_id,
        c.first_name as donor_first_name,
        c.last_name as donor_last_name,
        c.email as donor_email,
        c.phone as donor_phone,
        c.address as donor_address,
        COALESCE(pa.allocated_amount_usd, pa.allocated_amount) as amount,
        p.payment_date
      FROM payment_allocations pa
      INNER JOIN payment p ON pa.payment_id = p.id
      INNER JOIN pledge pl ON pa.pledge_id = pl.id
      INNER JOIN contact c ON pl.contact_id = c.id
      WHERE p.payment_status = 'completed'
        AND c.location_id = '${safeLocationId}'
        AND p.payment_date IS NOT NULL`;

    if (safeCampaignCode) {
      splitPaymentsSQL += ` AND pl.campaign_code = '${safeCampaignCode}'`;
    }

    if (year) {
      const safeYear = parseInt(year.toString(), 10);
      splitPaymentsSQL += ` AND EXTRACT(YEAR FROM p.payment_date) = ${safeYear}`;
    }

    // Combine both queries
    const unionSQL = `(${directPaymentsSQL}) UNION ALL (${splitPaymentsSQL})`;

    // Get campaign-level aggregates and donor details
    const querySQL = `
      WITH payment_data AS (
        ${unionSQL}
      ),
      campaign_totals AS (
        SELECT
          campaign_code,
          SUM(amount) as total_raised,
          COUNT(DISTINCT donor_id) as total_donors,
          AVG(amount) as avg_gift
        FROM payment_data
        GROUP BY campaign_code
      )
      SELECT
        pd.campaign_code,
        COALESCE(camp.name, pd.campaign_code) as campaign_name,
        ct.total_raised,
        ct.total_donors,
        ct.avg_gift,
        pd.donor_id,
        pd.donor_first_name,
        pd.donor_last_name,
        pd.donor_email,
        pd.donor_phone,
        pd.donor_address,
        SUM(pd.amount) as donor_contribution
      FROM payment_data pd
      INNER JOIN campaign_totals ct ON pd.campaign_code = ct.campaign_code
      LEFT JOIN campaign camp ON pd.campaign_code = camp.name
      GROUP BY 
        pd.campaign_code,
        camp.name,
        ct.total_raised,
        ct.total_donors,
        ct.avg_gift,
        pd.donor_id,
        pd.donor_first_name,
        pd.donor_last_name,
        pd.donor_email,
        pd.donor_phone,
        pd.donor_address
      ORDER BY pd.campaign_code, pd.donor_last_name, pd.donor_first_name`;

    // Execute query
    const results = await db.execute(sql.raw(querySQL));
    const rows = (results as { rows: unknown[] }).rows || [];

    // For preview, return JSON data
    if (preview) {
      const previewData = rows.slice(0, 10).map((row: unknown) => {
        const typedRow = row as CampaignFundraisingRow;
        return {
          'Campaign Name': typedRow.campaign_name || typedRow.campaign_code || '',
          'Campaign Code': typedRow.campaign_code || '',
          'Total Raised at Event': (parseFloat(typedRow.total_raised?.toString() || '0')).toFixed(2),
          'Number of Donors at Event': (parseInt(typedRow.total_donors?.toString() || '0')).toString(),
          'Average Gift Size': (parseFloat(typedRow.avg_gift?.toString() || '0')).toFixed(2),
          'Donor First Name': typedRow.donor_first_name || '',
          'Donor Last Name': typedRow.donor_last_name || '',
          'Donor Email': typedRow.donor_email || '',
          'Donor Phone': typedRow.donor_phone || '',
          'Donor Address': typedRow.donor_address || '',
          'Donor Total Contribution': (parseFloat(typedRow.donor_contribution?.toString() || '0')).toFixed(2),
        };
      });
      return NextResponse.json({ data: previewData, total: rows.length });
    }

    // Generate CSV
    const csvData = rows.map((row: unknown) => {
      const typedRow = row as CampaignFundraisingRow;
      return {
        'Campaign Name': typedRow.campaign_name || typedRow.campaign_code || '',
        'Campaign Code': typedRow.campaign_code || '',
        'Total Raised at Event': (parseFloat(typedRow.total_raised?.toString() || '0')).toFixed(2),
        'Number of Donors at Event': (parseInt(typedRow.total_donors?.toString() || '0')).toString(),
        'Average Gift Size': (parseFloat(typedRow.avg_gift?.toString() || '0')).toFixed(2),
        'Donor First Name': typedRow.donor_first_name || '',
        'Donor Last Name': typedRow.donor_last_name || '',
        'Donor Email': typedRow.donor_email || '',
        'Donor Phone': typedRow.donor_phone || '',
        'Donor Address': typedRow.donor_address || '',
        'Donor Total Contribution': (parseFloat(typedRow.donor_contribution?.toString() || '0')).toFixed(2),
      };
    });

    const csv = stringify(csvData, { header: true });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="campaign-fundraising-${reportType}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Error generating campaign fundraising report:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}