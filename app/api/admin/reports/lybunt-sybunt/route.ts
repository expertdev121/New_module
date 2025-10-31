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
    const { locationId } = filters;

    // Escape single quotes to prevent SQL injection
    const escapeSql = (value: string) => value.replace(/'/g, "''");
    const safeLocationId = escapeSql(locationId);

    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    // Base query for direct payments (non-split payments)
    const directPaymentsSQL = `
      SELECT
        c.id as donor_id,
        c.first_name as donor_first_name,
        c.last_name as donor_last_name,
        c.email,
        c.phone,
        c.address,
        COALESCE(p.amount_usd, p.amount) as amount,
        p.payment_date,
        EXTRACT(YEAR FROM p.payment_date)::integer as year,
        pl.campaign_code
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

    // Query for split payments (payment allocations)
    const splitPaymentsSQL = `
      SELECT
        c.id as donor_id,
        c.first_name as donor_first_name,
        c.last_name as donor_last_name,
        c.email,
        c.phone,
        c.address,
        COALESCE(pa.allocated_amount_usd, pa.allocated_amount) as amount,
        p.payment_date,
        EXTRACT(YEAR FROM p.payment_date)::integer as year,
        pl.campaign_code
      FROM payment_allocations pa
      INNER JOIN payment p ON pa.payment_id = p.id
      INNER JOIN pledge pl ON pa.pledge_id = pl.id
      INNER JOIN contact c ON pl.contact_id = c.id
      WHERE p.payment_status = 'completed'
        AND c.location_id = '${safeLocationId}'
        AND p.payment_date IS NOT NULL`;

    // Combine both queries
    const unionSQL = `(${directPaymentsSQL}) UNION ALL (${splitPaymentsSQL})`;

    let querySQL: string;

    if (reportType === 'lybunt') {
      // LYBUNT: Last Year But Unfortunately Not This year
      // Donors who gave last year but not this year
      querySQL = `
        WITH payment_data AS (
          ${unionSQL}
        ),
        donors_last_year AS (
          SELECT DISTINCT donor_id
          FROM payment_data
          WHERE year = ${lastYear}
        ),
        donors_this_year AS (
          SELECT DISTINCT donor_id
          FROM payment_data
          WHERE year = ${currentYear}
        ),
        lybunt_donors AS (
          SELECT dly.donor_id
          FROM donors_last_year dly
          WHERE NOT EXISTS (
            SELECT 1 FROM donors_this_year dty
            WHERE dty.donor_id = dly.donor_id
          )
        )
        SELECT
          pd.donor_id,
          pd.donor_first_name,
          pd.donor_last_name,
          pd.email,
          pd.phone,
          pd.address,
          MAX(pd.payment_date) as last_gift_date,
          MAX(pd.amount) as last_gift_amount,
          SUM(pd.amount) as total_lifetime_giving,
          STRING_AGG(DISTINCT pd.campaign_code, ', ' ORDER BY pd.campaign_code) as campaign_codes,
          STRING_AGG(DISTINCT pd.year::text, ', ' ORDER BY pd.year::text) as years_of_giving,
          COUNT(DISTINCT pd.year) as years_active
        FROM payment_data pd
        INNER JOIN lybunt_donors ld ON pd.donor_id = ld.donor_id
        GROUP BY 
          pd.donor_id,
          pd.donor_first_name,
          pd.donor_last_name,
          pd.email,
          pd.phone,
          pd.address
        ORDER BY total_lifetime_giving DESC, pd.donor_last_name, pd.donor_first_name`;
    } else if (reportType === 'sybunt') {
      // SYBUNT: Some Year(s) But Unfortunately Not This year
      // Donors who gave in past years but not this year
      querySQL = `
        WITH payment_data AS (
          ${unionSQL}
        ),
        donors_past_years AS (
          SELECT DISTINCT donor_id
          FROM payment_data
          WHERE year < ${currentYear}
        ),
        donors_this_year AS (
          SELECT DISTINCT donor_id
          FROM payment_data
          WHERE year = ${currentYear}
        ),
        sybunt_donors AS (
          SELECT dpy.donor_id
          FROM donors_past_years dpy
          WHERE NOT EXISTS (
            SELECT 1 FROM donors_this_year dty
            WHERE dty.donor_id = dpy.donor_id
          )
        )
        SELECT
          pd.donor_id,
          pd.donor_first_name,
          pd.donor_last_name,
          pd.email,
          pd.phone,
          pd.address,
          MAX(pd.payment_date) as last_gift_date,
          MAX(pd.amount) as last_gift_amount,
          SUM(pd.amount) as total_lifetime_giving,
          STRING_AGG(DISTINCT pd.campaign_code, ', ' ORDER BY pd.campaign_code) as campaign_codes,
          STRING_AGG(DISTINCT pd.year::text, ', ' ORDER BY pd.year::text) as years_of_giving,
          COUNT(DISTINCT pd.year) as years_active,
          MAX(pd.year) as most_recent_year
        FROM payment_data pd
        INNER JOIN sybunt_donors sd ON pd.donor_id = sd.donor_id
        GROUP BY 
          pd.donor_id,
          pd.donor_first_name,
          pd.donor_last_name,
          pd.email,
          pd.phone,
          pd.address
        ORDER BY most_recent_year DESC, total_lifetime_giving DESC, pd.donor_last_name, pd.donor_first_name`;
    } else {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    // Execute query
    const results = await db.execute(sql.raw(querySQL));
    const rows = (results as any).rows || [];

    // For preview, return JSON data
    if (preview) {
      const previewData = rows.slice(0, 10).map((row: any) => ({
        'Donor First Name': row.donor_first_name || '',
        'Donor Last Name': row.donor_last_name || '',
        'Email': row.email || '',
        'Phone': row.phone || '',
        'Address': row.address || '',
        'Last Gift Date': row.last_gift_date ? new Date(row.last_gift_date).toLocaleDateString('en-US') : '',
        'Last Gift Amount': (parseFloat(row.last_gift_amount || 0)).toFixed(2),
        'Total Lifetime Giving': (parseFloat(row.total_lifetime_giving || 0)).toFixed(2),
        'Years Active': row.years_active ? row.years_active.toString() : '0',
        'Years of Giving': row.years_of_giving || '',
        'Campaign Codes': row.campaign_codes || '',
        'Most Recent Year': reportType === 'sybunt' && row.most_recent_year ? row.most_recent_year.toString() : '',
        'Segment': reportType.toUpperCase(),
        'Status': reportType === 'lybunt' 
          ? `Gave in ${lastYear}, Not in ${currentYear}`
          : `Last gave in ${row.most_recent_year || 'past'}, Not in ${currentYear}`,
      }));
      return NextResponse.json({ data: previewData, total: rows.length });
    }

    // Generate CSV
    const csvData = rows.map((row: any) => ({
      'Donor First Name': row.donor_first_name || '',
      'Donor Last Name': row.donor_last_name || '',
      'Email': row.email || '',
      'Phone': row.phone || '',
      'Address': row.address || '',
      'Last Gift Date': row.last_gift_date ? new Date(row.last_gift_date).toLocaleDateString('en-US') : '',
      'Last Gift Amount': (parseFloat(row.last_gift_amount || 0)).toFixed(2),
      'Total Lifetime Giving': (parseFloat(row.total_lifetime_giving || 0)).toFixed(2),
      'Years Active': row.years_active ? row.years_active.toString() : '0',
      'Years of Giving': row.years_of_giving || '',
      'Campaign Codes': row.campaign_codes || '',
      'Most Recent Year': reportType === 'sybunt' && row.most_recent_year ? row.most_recent_year.toString() : '',
      'Segment': reportType.toUpperCase(),
      'Status': reportType === 'lybunt' 
        ? `Gave in ${lastYear}, Not in ${currentYear}`
        : `Last gave in ${row.most_recent_year || 'past'}, Not in ${currentYear}`,
      'Record Number': row.donor_id || '',
    }));

    const csv = stringify(csvData, { header: true });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${reportType}-report-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Error generating LYBUNT/SYBUNT report:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}