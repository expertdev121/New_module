import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { contact, payment, pledge, paymentAllocations } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportType, filters, preview } = await request.json();
    const { eventCode, year, locationId } = filters;

    // Escape single quotes to prevent SQL injection
    const escapeSql = (value: string) => value.replace(/'/g, "''");
    const safeLocationId = escapeSql(locationId);
    const safeEventCode = eventCode ? escapeSql(eventCode) : null;

    // Base query for direct payments (non-split payments)
    let directPaymentsSQL = `
      SELECT
        COALESCE(p.amount_usd, p.amount) as amount,
        p.payment_method as donation_source,
        CASE WHEN pl.notes ILIKE '%restricted%' THEN true ELSE false END as is_restricted,
        pl.campaign_code,
        EXTRACT(YEAR FROM p.payment_date)::integer as year,
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

    // Apply event code filter
    if (safeEventCode) {
      directPaymentsSQL += ` AND pl.campaign_code = '${safeEventCode}'`;
    }

    // Apply year filter
    if (year) {
      const safeYear = parseInt(year.toString(), 10);
      directPaymentsSQL += ` AND EXTRACT(YEAR FROM p.payment_date) = ${safeYear}`;
    }

    // Query for split payments (payment allocations)
    let splitPaymentsSQL = `
      SELECT
        COALESCE(pa.allocated_amount_usd, pa.allocated_amount) as amount,
        p.payment_method as donation_source,
        CASE WHEN pl.notes ILIKE '%restricted%' THEN true ELSE false END as is_restricted,
        pl.campaign_code,
        EXTRACT(YEAR FROM p.payment_date)::integer as year,
        p.payment_date
      FROM payment_allocations pa
      INNER JOIN payment p ON pa.payment_id = p.id
      INNER JOIN pledge pl ON pa.pledge_id = pl.id
      INNER JOIN contact c ON pl.contact_id = c.id
      WHERE p.payment_status = 'completed'
        AND c.location_id = '${safeLocationId}'
        AND p.payment_date IS NOT NULL`;

    if (safeEventCode) {
      splitPaymentsSQL += ` AND pl.campaign_code = '${safeEventCode}'`;
    }

    if (year) {
      const safeYear = parseInt(year.toString(), 10);
      splitPaymentsSQL += ` AND EXTRACT(YEAR FROM p.payment_date) = ${safeYear}`;
    }

    // Combine both queries
    const unionSQL = `(${directPaymentsSQL}) UNION ALL (${splitPaymentsSQL})`;

    // Main aggregation query with year-over-year comparison
    const querySQL = `
      WITH payment_data AS (
        ${unionSQL}
      ),
      yearly_totals AS (
        SELECT
          campaign_code,
          year,
          SUM(amount) as year_total
        FROM payment_data
        GROUP BY campaign_code, year
      )
      SELECT
        pd.donation_source,
        pd.is_restricted,
        pd.campaign_code,
        pd.year,
        SUM(pd.amount) as total_donations,
        yt.year_total as year_end_total,
        COALESCE(
          (SELECT yt_prev.year_total 
           FROM yearly_totals yt_prev 
           WHERE yt_prev.campaign_code = pd.campaign_code 
           AND yt_prev.year = pd.year - 1),
          0
        ) as previous_year_total
      FROM payment_data pd
      LEFT JOIN yearly_totals yt ON pd.campaign_code = yt.campaign_code AND pd.year = yt.year
      GROUP BY 
        pd.donation_source,
        pd.is_restricted,
        pd.campaign_code,
        pd.year,
        yt.year_total
      ORDER BY pd.year DESC, pd.campaign_code, pd.donation_source`;

    // Execute query
    const results = await db.execute(sql.raw(querySQL));
    const rows = (results as any).rows || [];

    // For preview, return JSON data
    if (preview) {
      const previewData = rows.slice(0, 10).map((row: any) => ({
        'Year': row.year ? row.year.toString() : '',
        'Event Code': row.campaign_code || '',
        'Donation Source': row.donation_source || 'Not Specified',
        'Restricted vs. Unrestricted Funds': row.is_restricted ? 'Restricted' : 'Unrestricted',
        'Total Donations Received': (parseFloat(row.total_donations || 0)).toFixed(2),
        'Year-End Total for Event': (parseFloat(row.year_end_total || 0)).toFixed(2),
        'Previous Year Total': (parseFloat(row.previous_year_total || 0)).toFixed(2),
        'Year-over-Year Change': row.previous_year_total > 0 
          ? (((parseFloat(row.year_end_total || 0) - parseFloat(row.previous_year_total || 0)) / parseFloat(row.previous_year_total)) * 100).toFixed(2) + '%'
          : 'N/A',
      }));
      return NextResponse.json({ data: previewData, total: rows.length });
    }

    // Generate CSV
    const csvData = rows.map((row: any) => ({
      'Year': row.year ? row.year.toString() : '',
      'Event Code': row.campaign_code || '',
      'Donation Source': row.donation_source || 'Not Specified',
      'Restricted vs. Unrestricted Funds': row.is_restricted ? 'Restricted' : 'Unrestricted',
      'Total Donations Received': (parseFloat(row.total_donations || 0)).toFixed(2),
      'Year-End Total for Event': (parseFloat(row.year_end_total || 0)).toFixed(2),
      'Previous Year Total': (parseFloat(row.previous_year_total || 0)).toFixed(2),
      'Year-over-Year Change': row.previous_year_total > 0 
        ? (((parseFloat(row.year_end_total || 0) - parseFloat(row.previous_year_total || 0)) / parseFloat(row.previous_year_total)) * 100).toFixed(2) + '%'
        : 'N/A',
    }));

    const csv = stringify(csvData, { header: true });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="financial-accounting-${reportType}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Error generating financial accounting report:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}