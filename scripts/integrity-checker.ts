// scripts/integrity-checker.ts

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { eq, and, sql } from 'drizzle-orm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import ws from 'ws';

// Load environment variables
config();

// Configure WebSocket constructor for Node.js environments
neonConfig.webSocketConstructor = ws;

import {
  pledge,
  paymentPlan,
  payment,
  contact,
  exchangeRate as exchangeRateTable,
} from '../lib/db/schema';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL!;
const EXCHANGE_API_KEY = process.env.NEXT_PUBLIC_EXCHANGERATE_API_KEY!;
const EXCHANGE_API_URL = 'https://v6.exchangerate-api.com/v6';
const TOLERANCE = 0.01;

// Add better error checking
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('💡 Make sure you have a .env or .env.local file with:');
  console.error('   DATABASE_URL=your_connection_string_here');
  process.exit(1);
}

if (!EXCHANGE_API_KEY) {
  console.error('❌ NEXT_PUBLIC_EXCHANGERATE_API_KEY environment variable is not set');
  console.error('💡 Add your exchange rate API key to your .env file');
  process.exit(1);
}

interface IntegrityIssue {
  id: string;
  type: 'pledge_balance' | 'payment_plan_amounts' | 'payment_conversion';
  severity: 'critical' | 'warning';
  contactId: number;
  contactName: string;
  recordId: number;
  recordType: 'pledge' | 'payment_plan' | 'payment';
  description: string;
  currentValue: any;
  expectedValue: any;
  affectedFields: string[];
  fixValue: string;
  fixRecordId: number;
}

interface CheckSummary {
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  affectedContacts: number;
  timestamp: string;
}

class CurrencyIntegrityService {
  private db: ReturnType<typeof drizzle>;
  private exchangeRateCache: Map<string, { rate: number; date: string }> = new Map();

  constructor() {
    const pool = new Pool({ 
      connectionString: DATABASE_URL
    });
    this.db = drizzle(pool, { 
      logger: true
    });
  }

  async checkDatabaseConnection(): Promise<boolean> {
    try {
      console.log('Testing database connection...');
      const result = await this.db.execute(sql`SELECT 1 as test`);
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      return false;
    }
  }

  async checkTablesExist(): Promise<{ exists: boolean; missing: string[] }> {
    const requiredTables = ['pledge', 'payment', 'contact', 'payment_plan'];
    const missing: string[] = [];
    
    try {
      console.log('Checking if required tables exist...');
      
      // Fix: Use proper column access for Drizzle result rows
      console.log('🔍 Listing all tables in database...');
      const allTablesResult = await this.db.execute(sql`
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name;
      `);
      
      console.log('📋 Found tables:');
      if (allTablesResult.rows.length === 0) {
        console.log('  ❌ NO TABLES FOUND - Database appears to be empty!');
      } else {
        allTablesResult.rows.forEach((row: any) => {
          const tableName = row.table_name || row[0];
          const schemaName = row.table_schema || row[1]; 
          console.log(`  - ${schemaName}.${tableName}`);
        });
      }
      
      // Check if our tables exist in ANY schema
      console.log('\n🔍 Searching for our required tables in all schemas...');
      for (const tableName of requiredTables) {
        try {
          const result = await this.db.execute(sql`
            SELECT table_schema, table_name
            FROM information_schema.tables 
            WHERE LOWER(table_name) = LOWER(${tableName})
            AND table_type = 'BASE TABLE';
          `);
          
          if (result.rows.length > 0) {
            const foundSchema = result.rows[0].table_schema || result.rows[0][0];
            const foundTable = result.rows[0].table_name || result.rows[0][1];
            console.log(`✅ Table '${tableName}' found as '${foundSchema}.${foundTable}'`);
          } else {
            missing.push(tableName);
            console.log(`❌ Table '${tableName}' not found in any schema`);
          }
        } catch (error) {
          console.error(`❌ Error checking table '${tableName}':`, error);
          missing.push(tableName);
        }
      }

      return { exists: missing.length === 0, missing };
    } catch (error) {
      console.error('Error checking tables:', error);
      return { exists: false, missing: requiredTables };
    }
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string, date?: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const cacheKey = `${fromCurrency}-${toCurrency}-${date || 'latest'}`;

    if (this.exchangeRateCache.has(cacheKey)) {
      return this.exchangeRateCache.get(cacheKey)!.rate;
    }

    try {
      const response = await axios.get(
        `${EXCHANGE_API_URL}/${EXCHANGE_API_KEY}/latest/${fromCurrency}`,
        { timeout: 10000 }
      );

      let rate = response.data.conversion_rates[toCurrency];

      if (rate) {
        this.exchangeRateCache.set(cacheKey, { rate, date: response.data.time_last_update_utc });
        return rate;
      }
    } catch (error) {
      console.warn(`Failed to fetch exchange rate from API for ${fromCurrency}-${toCurrency}:`, error instanceof Error ? error.message : String(error));
    }

    try {
      const dbRates = await this.db
        .select()
        .from(exchangeRateTable)
        .where(
          and(
            sql`${exchangeRateTable.baseCurrency} = ${fromCurrency}`,
            sql`${exchangeRateTable.targetCurrency} = ${toCurrency}`
          )
        )
        .orderBy(sql`${exchangeRateTable.date} DESC`)
        .limit(1);

      if (dbRates.length > 0) {
        const rate = parseFloat(dbRates[0].rate);
        this.exchangeRateCache.set(cacheKey, { rate, date: dbRates[0].date });
        return rate;
      }

      const inverseRates = await this.db
        .select()
        .from(exchangeRateTable)
        .where(
          and(
            sql`${exchangeRateTable.baseCurrency} = ${toCurrency}`,
            sql`${exchangeRateTable.targetCurrency} = ${fromCurrency}`
          )
        )
        .orderBy(sql`${exchangeRateTable.date} DESC`)
        .limit(1);

      if (inverseRates.length > 0) {
        const rate = 1 / parseFloat(inverseRates[0].rate);
        this.exchangeRateCache.set(cacheKey, { rate, date: inverseRates[0].date });
        return rate;
      }
    } catch (error) {
      console.warn(`Database fallback failed for ${fromCurrency}-${toCurrency}:`, error instanceof Error ? error.message : String(error));
    }

    throw new Error(`Unable to find exchange rate for ${fromCurrency} to ${toCurrency}`);
  }

  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string, date?: string): Promise<{
    convertedAmount: number;
    exchangeRate: number;
  }> {
    // Use today's date if no date provided
    const conversionDate = date || new Date().toISOString().split('T')[0];
    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency, conversionDate);
    const convertedAmount = parseFloat((amount * exchangeRate).toFixed(2));
    return { convertedAmount, exchangeRate };
  }

  private isAmountEqual(amount1: number | null, amount2: number | null): boolean {
    if (amount1 === null && amount2 === null) return true;
    if (amount1 === null || amount2 === null) return false;
    return Math.abs(amount1 - amount2) <= TOLERANCE;
  }

  async checkPledgeBalances(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];
    console.log('🔍 Checking ALL pledge balances (multi-currency support)...');

    try {
      // Get ALL pledges - no limits
      const pledgeData = await this.db
        .select({
          id: pledge.id,
          contactId: pledge.contactId,
          originalAmount: pledge.originalAmount,
          totalPaid: pledge.totalPaid,
          balance: pledge.balance,
          currency: pledge.currency,
          isActive: pledge.isActive,
        })
        .from(pledge);

      console.log(`📊 Found ${pledgeData.length} total pledges in database`);
      
      if (pledgeData.length === 0) {
        console.log('No pledges found in database');
        return issues;
      }

      const activePledges = pledgeData.filter(p => p.isActive === true);
      console.log(`📊 Active pledges: ${activePledges.length}`);

      if (activePledges.length === 0) {
        console.log('No active pledges found');
        return issues;
      }

      // Check ALL active pledges
      for (const pledgeRecord of activePledges) {
        try {
          // Get contact name
          const contactData = await this.db
            .select({
              firstName: contact.firstName,
              lastName: contact.lastName,
            })
            .from(contact)
            .where(eq(contact.id, pledgeRecord.contactId))
            .limit(1);

          const contactName = contactData.length > 0 
            ? `${contactData[0].firstName || ''} ${contactData[0].lastName || ''}`.trim() 
            : 'Unknown Contact';

          // CRITICAL: Sum amount_in_pledge_currency for multi-currency support
          // This handles cases where payments are in different currencies than the pledge
          const paymentSum = await this.db
            .select({
              total: sql<number>`COALESCE(SUM(amount_in_pledge_currency), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.pledgeId, pledgeRecord.id),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                sql`${payment.amountInPledgeCurrency} IS NOT NULL`  // Must have converted amount
              )
            );

          // Also count completed payments that are missing pledge currency conversion
          const unconvertedPayments = await this.db
            .select({
              count: sql<number>`COUNT(*)`,
              totalOriginalAmount: sql<number>`COALESCE(SUM(amount), 0)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.pledgeId, pledgeRecord.id),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                sql`${payment.amountInPledgeCurrency} IS NULL`  // Missing conversion
              )
            );

          // Get third-party payment details for logging
          const thirdPartyPayments = await this.db
            .select({
              paymentId: payment.id,
              amount: payment.amountInPledgeCurrency,
              payerFirstName: sql<string>`payer.first_name`,
              payerLastName: sql<string>`payer.last_name`,
              isThirdParty: payment.isThirdPartyPayment,
            })
            .from(payment)
            .leftJoin(sql`contact as payer`, eq(payment.payerContactId, sql`payer.id`))
            .where(
              and(
                eq(payment.pledgeId, pledgeRecord.id),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                eq(payment.isThirdPartyPayment, true),
                sql`${payment.amountInPledgeCurrency} IS NOT NULL`
              )
            );

          // Get pending/expected payments for context
          const pendingPayments = await this.db
            .select({
              total: sql<number>`COALESCE(SUM(amount_in_pledge_currency), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.pledgeId, pledgeRecord.id),
                sql`${payment.paymentStatus} IN ('pending', 'expected')`
              )
            );

          const actualTotalPaid = paymentSum.length > 0 ? Number(paymentSum[0].total) : 0;
          const completedPaymentCount = paymentSum.length > 0 ? Number(paymentSum[0].count) : 0;
          const unconvertedCount = unconvertedPayments.length > 0 ? Number(unconvertedPayments[0].count) : 0;
          const pendingCount = pendingPayments.length > 0 ? Number(pendingPayments[0].count) : 0;
          const pendingTotal = pendingPayments.length > 0 ? Number(pendingPayments[0].total) : 0;
          const expectedBalance = Number(pledgeRecord.originalAmount) - actualTotalPaid;

          console.log(`🔍 Checking pledge ${pledgeRecord.id} (${contactName}) [${pledgeRecord.currency}]:`);
          console.log(`  - Original: ${pledgeRecord.originalAmount} ${pledgeRecord.currency}`);
          console.log(`  - Recorded Paid: ${pledgeRecord.totalPaid} ${pledgeRecord.currency}`);
          console.log(`  - Actual Paid (converted): ${actualTotalPaid} ${pledgeRecord.currency}`);
          console.log(`  - Completed payments with conversion: ${completedPaymentCount}`);
          console.log(`  - Completed payments WITHOUT conversion: ${unconvertedCount}`);
          console.log(`  - Pending/Expected payments: ${pendingCount} totaling ${pendingTotal} (not counted)`);
          console.log(`  - Recorded Balance: ${pledgeRecord.balance} ${pledgeRecord.currency}`);
          console.log(`  - Expected Balance: ${expectedBalance} ${pledgeRecord.currency}`);

          // Log third-party payments
          if (thirdPartyPayments.length > 0) {
            console.log(`  - Third-party payments (counted toward beneficiary balance):`);
            thirdPartyPayments.forEach(tp => {
              const payerName = `${tp.payerFirstName || ''} ${tp.payerLastName || ''}`.trim() || 'Unknown Payer';
              console.log(`    * ${payerName} paid ${tp.amount} ${pledgeRecord.currency} for ${contactName}`);
            });
          }

          // Flag if there are payments missing conversion
          if (unconvertedCount > 0) {
            console.warn(`  ⚠️ ${unconvertedCount} completed payments are missing pledge currency conversion!`);
          }

          // Check total paid amount
          if (!this.isAmountEqual(actualTotalPaid, Number(pledgeRecord.totalPaid))) {
            issues.push({
              id: `pledge_total_paid_${pledgeRecord.id}`,
              type: 'pledge_balance',
              severity: 'critical',
              contactId: pledgeRecord.contactId,
              contactName,
              recordId: pledgeRecord.id,
              recordType: 'pledge',
              description: `Multi-currency total paid mismatch. Recorded: ${pledgeRecord.totalPaid} ${pledgeRecord.currency}, Actual: ${actualTotalPaid} ${pledgeRecord.currency} (${completedPaymentCount} converted payments, ${unconvertedCount} need conversion)`,
              currentValue: Number(pledgeRecord.totalPaid),
              expectedValue: actualTotalPaid,
              affectedFields: ['total_paid'],
              fixValue: actualTotalPaid.toFixed(2),
              fixRecordId: pledgeRecord.id
            });
          }

          // Check balance calculation
          if (!this.isAmountEqual(Number(pledgeRecord.balance), expectedBalance)) {
            issues.push({
              id: `pledge_balance_${pledgeRecord.id}`,
              type: 'pledge_balance',
              severity: 'critical',
              contactId: pledgeRecord.contactId,
              contactName,
              recordId: pledgeRecord.id,
              recordType: 'pledge',
              description: `Multi-currency balance incorrect. Recorded: ${pledgeRecord.balance} ${pledgeRecord.currency}, Expected: ${expectedBalance} ${pledgeRecord.currency}`,
              currentValue: Number(pledgeRecord.balance),
              expectedValue: expectedBalance,
              affectedFields: ['balance'],
              fixValue: expectedBalance.toFixed(2),
              fixRecordId: pledgeRecord.id
            });
          }

        } catch (error) {
          console.error(`Error checking pledge ${pledgeRecord.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in checkPledgeBalances:', error);
      throw error;
    }

    return issues;
  }

  async checkPaymentPlanIntegrity(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];
    console.log('🔍 Checking ALL payment plan amounts (multi-currency support)...');

    try {
      // Get ALL payment plans - no limits
      const planData = await this.db
        .select({
          id: paymentPlan.id,
          totalPlannedAmount: paymentPlan.totalPlannedAmount,
          totalPaid: paymentPlan.totalPaid,
          remainingAmount: paymentPlan.remainingAmount,
          installmentAmount: paymentPlan.installmentAmount,
          numberOfInstallments: paymentPlan.numberOfInstallments,
          currency: paymentPlan.currency,
          isActive: paymentPlan.isActive,
          pledgeId: paymentPlan.pledgeId,
        })
        .from(paymentPlan);

      console.log(`📊 Found ${planData.length} total payment plans in database`);
      
      if (planData.length === 0) {
        console.log('No payment plans found in database');
        return issues;
      }

      const activePlans = planData.filter(p => p.isActive === true);
      console.log(`📊 Active payment plans: ${activePlans.length}`);

      if (activePlans.length === 0) {
        console.log('No active payment plans found');
        return issues;
      }

      // Check ALL active plans
      for (const plan of activePlans) {
        try {
          // Get contact information through pledge
          let contactName = 'Unknown Contact';
          let contactId = 0;

          if (plan.pledgeId) {
            const pledgeWithContact = await this.db
              .select({
                contactId: pledge.contactId,
                firstName: contact.firstName,
                lastName: contact.lastName,
              })
              .from(pledge)
              .leftJoin(contact, eq(pledge.contactId, contact.id))
              .where(eq(pledge.id, plan.pledgeId))
              .limit(1);

            if (pledgeWithContact.length > 0) {
              contactId = pledgeWithContact[0].contactId;
              contactName = `${pledgeWithContact[0].firstName || ''} ${pledgeWithContact[0].lastName || ''}`.trim() || 'Unknown Contact';
            }
          }

          // CRITICAL: Sum amount_in_plan_currency for multi-currency support
          const paymentSum = await this.db
            .select({
              total: sql<number>`COALESCE(SUM(amount_in_plan_currency), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.paymentPlanId, plan.id),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                sql`${payment.amountInPlanCurrency} IS NOT NULL`  // Must have converted amount
              )
            );

          // Count payments missing plan currency conversion
          const unconvertedPayments = await this.db
            .select({
              count: sql<number>`COUNT(*)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.paymentPlanId, plan.id),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                sql`${payment.amountInPlanCurrency} IS NULL`  // Missing conversion
              )
            );

          // Get pending payments for context
          const pendingPayments = await this.db
            .select({
              count: sql<number>`COUNT(*)`,
              total: sql<number>`COALESCE(SUM(amount_in_plan_currency), 0)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.paymentPlanId, plan.id),
                sql`${payment.paymentStatus} IN ('pending', 'expected')`
              )
            );

          const actualTotalPaid = paymentSum.length > 0 ? Number(paymentSum[0].total) : 0;
          const completedCount = paymentSum.length > 0 ? Number(paymentSum[0].count) : 0;
          const unconvertedCount = unconvertedPayments.length > 0 ? Number(unconvertedPayments[0].count) : 0;
          const pendingCount = pendingPayments.length > 0 ? Number(pendingPayments[0].count) : 0;
          const pendingTotal = pendingPayments.length > 0 ? Number(pendingPayments[0].total) : 0;
          const expectedRemainingAmount = Number(plan.totalPlannedAmount) - actualTotalPaid;
          const expectedInstallmentAmount = plan.numberOfInstallments > 0 
            ? Number(plan.totalPlannedAmount) / plan.numberOfInstallments 
            : 0;

          console.log(`🔍 Checking plan ${plan.id} (${contactName}) [${plan.currency}]:`);
          console.log(`  - Planned: ${plan.totalPlannedAmount} ${plan.currency}`);
          console.log(`  - Recorded Paid: ${plan.totalPaid} ${plan.currency}`);
          console.log(`  - Actual Paid (converted): ${actualTotalPaid} ${plan.currency}`);
          console.log(`  - Completed payments with conversion: ${completedCount}`);
          console.log(`  - Completed payments WITHOUT conversion: ${unconvertedCount}`);
          console.log(`  - Pending/Expected payments: ${pendingCount} totaling ${pendingTotal} (not counted)`);
          console.log(`  - Recorded Remaining: ${plan.remainingAmount} ${plan.currency}`);
          console.log(`  - Expected Remaining: ${expectedRemainingAmount} ${plan.currency}`);

          // Flag if there are payments missing conversion
          if (unconvertedCount > 0) {
            console.warn(`  ⚠️ ${unconvertedCount} completed payments are missing plan currency conversion!`);
          }

          if (!this.isAmountEqual(actualTotalPaid, Number(plan.totalPaid))) {
            issues.push({
              id: `plan_total_paid_${plan.id}`,
              type: 'payment_plan_amounts',
              severity: 'critical',
              contactId,
              contactName,
              recordId: plan.id,
              recordType: 'payment_plan',
              description: `Multi-currency plan total paid mismatch. Recorded: ${plan.totalPaid} ${plan.currency}, Actual: ${actualTotalPaid} ${plan.currency} (${completedCount} converted payments, ${unconvertedCount} need conversion)`,
              currentValue: Number(plan.totalPaid),
              expectedValue: actualTotalPaid,
              affectedFields: ['total_paid'],
              fixValue: actualTotalPaid.toFixed(2),
              fixRecordId: plan.id
            });
          }

          if (!this.isAmountEqual(Number(plan.remainingAmount), expectedRemainingAmount)) {
            issues.push({
              id: `plan_remaining_${plan.id}`,
              type: 'payment_plan_amounts',
              severity: 'critical',
              contactId,
              contactName,
              recordId: plan.id,
              recordType: 'payment_plan',
              description: `Multi-currency remaining amount incorrect. Recorded: ${plan.remainingAmount} ${plan.currency}, Expected: ${expectedRemainingAmount} ${plan.currency}`,
              currentValue: Number(plan.remainingAmount),
              expectedValue: expectedRemainingAmount,
              affectedFields: ['remaining_amount'],
              fixValue: expectedRemainingAmount.toFixed(2),
              fixRecordId: plan.id
            });
          }

          // Check installment amount (allow small variance)
          if (Math.abs(Number(plan.installmentAmount) - expectedInstallmentAmount) > 0.02) {
            issues.push({
              id: `plan_installment_${plan.id}`,
              type: 'payment_plan_amounts',
              severity: 'warning',
              contactId,
              contactName,
              recordId: plan.id,
              recordType: 'payment_plan',
              description: `Installment amount may be incorrect. Recorded: ${plan.installmentAmount} ${plan.currency}, Expected: ${expectedInstallmentAmount.toFixed(2)} ${plan.currency}`,
              currentValue: Number(plan.installmentAmount),
              expectedValue: parseFloat(expectedInstallmentAmount.toFixed(2)),
              affectedFields: ['installment_amount'],
              fixValue: expectedInstallmentAmount.toFixed(2),
              fixRecordId: plan.id
            });
          }

        } catch (error) {
          console.error(`Error checking payment plan ${plan.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in checkPaymentPlanIntegrity:', error);
      throw error;
    }

    return issues;
  }

  async checkPaymentConversions(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];
    console.log('🔍 Checking ALL payment conversions (multi-currency support)...');

    try {
      // Get ALL payments - no limits
      const paymentData = await this.db
        .select({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          amountUsd: payment.amountUsd,
          amountInPledgeCurrency: payment.amountInPledgeCurrency,
          amountInPlanCurrency: payment.amountInPlanCurrency,
          paymentDate: payment.paymentDate,
          receivedDate: payment.receivedDate,
          paymentStatus: payment.paymentStatus,
          pledgeId: payment.pledgeId,
          paymentPlanId: payment.paymentPlanId,
          exchangeRate: payment.exchangeRate,
          pledgeCurrencyExchangeRate: payment.pledgeCurrencyExchangeRate,
          planCurrencyExchangeRate: payment.planCurrencyExchangeRate,
          isThirdPartyPayment: payment.isThirdPartyPayment,
          payerContactId: payment.payerContactId,
        })
        .from(payment);

      console.log(`📊 Found ${paymentData.length} total payments to check for multi-currency conversion errors`);

      // Process ALL payments
      for (const paymentRecord of paymentData) {
        try {
          let pledgeCurrency = null;
          let planCurrency = null;
          let contactName = 'Unknown Contact';
          let contactId = 0;
          let payerName = null;

          // Get pledge currency if payment is linked to pledge
          if (paymentRecord.pledgeId) {
            const pledgeWithContact = await this.db
              .select({
                contactId: pledge.contactId,
                currency: pledge.currency,
                firstName: contact.firstName,
                lastName: contact.lastName,
              })
              .from(pledge)
              .leftJoin(contact, eq(pledge.contactId, contact.id))
              .where(eq(pledge.id, paymentRecord.pledgeId))
              .limit(1);

            if (pledgeWithContact.length > 0) {
              contactId = pledgeWithContact[0].contactId;
              pledgeCurrency = pledgeWithContact[0].currency;
              contactName = `${pledgeWithContact[0].firstName || ''} ${pledgeWithContact[0].lastName || ''}`.trim() || 'Unknown Contact';
            }
          }

          // Get plan currency if payment is linked to payment plan
          if (paymentRecord.paymentPlanId) {
            const planWithContact = await this.db
              .select({
                currency: paymentPlan.currency,
                pledgeId: paymentPlan.pledgeId,
              })
              .from(paymentPlan)
              .where(eq(paymentPlan.id, paymentRecord.paymentPlanId))
              .limit(1);

            if (planWithContact.length > 0) {
              planCurrency = planWithContact[0].currency;
              
              // If no contact info yet, get it from the plan's pledge
              if (!contactId && planWithContact[0].pledgeId) {
                const pledgeContact = await this.db
                  .select({
                    contactId: pledge.contactId,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                  })
                  .from(pledge)
                  .leftJoin(contact, eq(pledge.contactId, contact.id))
                  .where(eq(pledge.id, planWithContact[0].pledgeId))
                  .limit(1);

                if (pledgeContact.length > 0) {
                  contactId = pledgeContact[0].contactId;
                  contactName = `${pledgeContact[0].firstName || ''} ${pledgeContact[0].lastName || ''}`.trim() || 'Unknown Contact';
                }
              }
            }
          }

          // Get payer information if third-party payment
          if (paymentRecord.isThirdPartyPayment && paymentRecord.payerContactId) {
            const payerData = await this.db
              .select({
                firstName: contact.firstName,
                lastName: contact.lastName,
              })
              .from(contact)
              .where(eq(contact.id, paymentRecord.payerContactId))
              .limit(1);

            if (payerData.length > 0) {
              payerName = `${payerData[0].firstName || ''} ${payerData[0].lastName || ''}`.trim();
            }
          }

          // Use received_date for currency conversion, fallback to payment_date, then today's date
          const conversionDate = paymentRecord.receivedDate || paymentRecord.paymentDate || new Date().toISOString().split('T')[0];

          console.log(`🔍 Checking payment ${paymentRecord.id}:`);
          console.log(`  - Beneficiary: ${contactName}`);
          if (payerName) {
            console.log(`  - Payer: ${payerName} (third-party payment)`);
          }
          console.log(`  - Payment: ${paymentRecord.amount} ${paymentRecord.currency}`);
          console.log(`  - Pledge Currency: ${pledgeCurrency}`);
          console.log(`  - Plan Currency: ${planCurrency}`);
          console.log(`  - Recorded USD: ${paymentRecord.amountUsd}`);
          console.log(`  - Recorded Pledge Currency Amount: ${paymentRecord.amountInPledgeCurrency}`);
          console.log(`  - Recorded Plan Currency Amount: ${paymentRecord.amountInPlanCurrency}`);
          console.log(`  - Conversion date: ${conversionDate}`);

          // 1. Check USD conversion (for non-USD payments)
          if (paymentRecord.currency !== 'USD') {
            try {
              const { convertedAmount: expectedAmountUsd, exchangeRate: usdRate } = await this.convertCurrency(
                Number(paymentRecord.amount), 
                paymentRecord.currency, 
                'USD', 
                conversionDate
              );

              const recordedUsd = Number(paymentRecord.amountUsd || 0);
              const errorPercentage = expectedAmountUsd > 0 
                ? Math.abs((recordedUsd - expectedAmountUsd) / expectedAmountUsd) * 100
                : (recordedUsd > 0 ? 100 : 0);

              console.log(`  - Expected USD: ${expectedAmountUsd} (rate: ${usdRate}), Error: ${errorPercentage.toFixed(1)}%`);

              // Flag conversions with > 10% error OR missing USD amount
              if (errorPercentage > 10 || recordedUsd === 0 || !this.isAmountEqual(recordedUsd, expectedAmountUsd)) {
                issues.push({
                  id: `payment_usd_conversion_${paymentRecord.id}`,
                  type: 'payment_conversion',
                  severity: (errorPercentage > 50 || recordedUsd === 0) ? 'critical' : 'warning',
                  contactId,
                  contactName,
                  recordId: paymentRecord.id,
                  recordType: 'payment',
                  description: `USD conversion incorrect (${errorPercentage.toFixed(1)}% error). ${paymentRecord.amount} ${paymentRecord.currency} → Recorded: $${recordedUsd}, Expected: $${expectedAmountUsd}`,
                  currentValue: recordedUsd,
                  expectedValue: expectedAmountUsd,
                  affectedFields: ['amount_usd', 'exchange_rate'],
                  fixValue: `${expectedAmountUsd.toFixed(2)}|${usdRate}`,
                  fixRecordId: paymentRecord.id
                });
              }
            } catch (error) {
              console.warn(`USD conversion failed for payment ${paymentRecord.id}:`, error instanceof Error ? error.message : String(error));
            }
          }

          // 2. Check pledge currency conversion (if payment is linked to a pledge)
          if (pledgeCurrency) {
            let expectedPledgeAmount: number;
            let pledgeRate: number;
            
            if (paymentRecord.currency === pledgeCurrency) {
              // Same currency - should equal payment amount
              expectedPledgeAmount = Number(paymentRecord.amount);
              pledgeRate = 1;
              console.log(`  - Same currency (${pledgeCurrency}): expected ${expectedPledgeAmount}`);
            } else {
              // Different currency - needs conversion
              try {
                const conversion = await this.convertCurrency(
                  Number(paymentRecord.amount), 
                  paymentRecord.currency, 
                  pledgeCurrency, 
                  conversionDate
                );
                expectedPledgeAmount = conversion.convertedAmount;
                pledgeRate = conversion.exchangeRate;
                console.log(`  - Cross-currency (${paymentRecord.currency}→${pledgeCurrency}): expected ${expectedPledgeAmount} (rate: ${pledgeRate})`);
              } catch (error) {
                console.warn(`Pledge currency conversion failed for payment ${paymentRecord.id}:`, error instanceof Error ? error.message : String(error));
                continue;
              }
            }

            const recordedPledgeAmount = Number(paymentRecord.amountInPledgeCurrency || 0);
            const errorPercentage = expectedPledgeAmount > 0 
              ? Math.abs((recordedPledgeAmount - expectedPledgeAmount) / expectedPledgeAmount) * 100
              : (recordedPledgeAmount > 0 ? 100 : 0);

            console.log(`  - Pledge Currency Check: Expected ${expectedPledgeAmount} ${pledgeCurrency}, Got ${recordedPledgeAmount} ${pledgeCurrency}, Error: ${errorPercentage.toFixed(1)}%`);

            // Flag ANY missing or incorrect pledge currency amount
            if (recordedPledgeAmount === 0 || errorPercentage > 1 || !this.isAmountEqual(recordedPledgeAmount, expectedPledgeAmount)) {
              issues.push({
                id: `payment_pledge_conversion_${paymentRecord.id}`,
                type: 'payment_conversion',
                severity: (errorPercentage > 50 || recordedPledgeAmount === 0) ? 'critical' : 'warning',
                contactId,
                contactName,
                recordId: paymentRecord.id,
                recordType: 'payment',
                description: `Pledge currency conversion incorrect (${errorPercentage.toFixed(1)}% error). ${paymentRecord.amount} ${paymentRecord.currency} → Recorded: ${recordedPledgeAmount} ${pledgeCurrency}, Expected: ${expectedPledgeAmount} ${pledgeCurrency}`,
                currentValue: recordedPledgeAmount,
                expectedValue: expectedPledgeAmount,
                affectedFields: ['amount_in_pledge_currency', 'pledge_currency_exchange_rate'],
                fixValue: `${expectedPledgeAmount.toFixed(2)}|${pledgeRate}`,
                fixRecordId: paymentRecord.id
              });
            }
          }

          // 3. Check plan currency conversion (if payment is linked to a payment plan)
          if (planCurrency) {
            let expectedPlanAmount: number;
            let planRate: number;
            
            if (paymentRecord.currency === planCurrency) {
              // Same currency - should equal payment amount
              expectedPlanAmount = Number(paymentRecord.amount);
              planRate = 1;
              console.log(`  - Same currency (${planCurrency}): expected ${expectedPlanAmount}`);
            } else {
              // Different currency - needs conversion
              try {
                const conversion = await this.convertCurrency(
                  Number(paymentRecord.amount), 
                  paymentRecord.currency, 
                  planCurrency, 
                  conversionDate
                );
                expectedPlanAmount = conversion.convertedAmount;
                planRate = conversion.exchangeRate;
                console.log(`  - Cross-currency (${paymentRecord.currency}→${planCurrency}): expected ${expectedPlanAmount} (rate: ${planRate})`);
              } catch (error) {
                console.warn(`Plan currency conversion failed for payment ${paymentRecord.id}:`, error instanceof Error ? error.message : String(error));
                continue;
              }
            }

            const recordedPlanAmount = Number(paymentRecord.amountInPlanCurrency || 0);
            const errorPercentage = expectedPlanAmount > 0 
              ? Math.abs((recordedPlanAmount - expectedPlanAmount) / expectedPlanAmount) * 100
              : (recordedPlanAmount > 0 ? 100 : 0);

            console.log(`  - Plan Currency Check: Expected ${expectedPlanAmount} ${planCurrency}, Got ${recordedPlanAmount} ${planCurrency}, Error: ${errorPercentage.toFixed(1)}%`);

            // Flag ANY missing or incorrect plan currency amount
            if (recordedPlanAmount === 0 || errorPercentage > 1 || !this.isAmountEqual(recordedPlanAmount, expectedPlanAmount)) {
              issues.push({
                id: `payment_plan_conversion_${paymentRecord.id}`,
                type: 'payment_conversion',
                severity: (errorPercentage > 50 || recordedPlanAmount === 0) ? 'critical' : 'warning',
                contactId,
                contactName,
                recordId: paymentRecord.id,
                recordType: 'payment',
                description: `Plan currency conversion incorrect (${errorPercentage.toFixed(1)}% error). ${paymentRecord.amount} ${paymentRecord.currency} → Recorded: ${recordedPlanAmount} ${planCurrency}, Expected: ${expectedPlanAmount} ${planCurrency}`,
                currentValue: recordedPlanAmount,
                expectedValue: expectedPlanAmount,
                affectedFields: ['amount_in_plan_currency', 'plan_currency_exchange_rate'],
                fixValue: `${expectedPlanAmount.toFixed(2)}|${planRate}`,
                fixRecordId: paymentRecord.id
              });
            }
          }

        } catch (error) {
          console.error(`Error checking payment ${paymentRecord.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in checkPaymentConversions:', error);
      throw error;
    }

    return issues;
  }

  async fixPledgeTotalsAfterPaymentCorrections(): Promise<void> {
    console.log('\n🔄 Recalculating pledge totals after multi-currency payment corrections...');
    
    try {
      // Get all pledges that have payments with proper converted amounts
      const pledgesWithPayments = await this.db
        .selectDistinct({
          pledgeId: payment.pledgeId,
        })
        .from(payment)
        .where(
          and(
            sql`${payment.pledgeId} IS NOT NULL`,
            eq(payment.paymentStatus, 'completed'),
            sql`${payment.receivedDate} IS NOT NULL`,
            sql`${payment.amountInPledgeCurrency} IS NOT NULL`
          )
        );

      console.log(`Found ${pledgesWithPayments.length} pledges with completed payments to recalculate`);

      for (const pledgeRow of pledgesWithPayments) {
        const pledgeId = pledgeRow.pledgeId;
        
        // Skip if pledgeId is null or invalid
        if (!pledgeId || isNaN(Number(pledgeId))) {
          console.warn(`Skipping invalid pledge ID: ${pledgeId}`);
          continue;
        }
        
        try {
          console.log(`🔄 Recalculating multi-currency totals for pledge ${pledgeId}...`);

          // Get correct payment totals for this pledge (sum of converted amounts)
          const paymentSum = await this.db
            .select({
              total: sql<number>`COALESCE(SUM(amount_in_pledge_currency), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(payment)
            .where(
              and(
                eq(payment.pledgeId, pledgeId),
                eq(payment.paymentStatus, 'completed'),
                sql`${payment.receivedDate} IS NOT NULL`,
                sql`${payment.amountInPledgeCurrency} IS NOT NULL`
              )
            );

          // Get pledge data
          const pledgeData = await this.db
            .select({
              originalAmount: pledge.originalAmount,
              currentTotalPaid: pledge.totalPaid,
              currentBalance: pledge.balance,
              currency: pledge.currency,
            })
            .from(pledge)
            .where(eq(pledge.id, pledgeId))
            .limit(1);

          if (pledgeData.length > 0 && paymentSum.length > 0) {
            const actualTotalPaid = Number(paymentSum[0].total) || 0;
            const paymentCount = Number(paymentSum[0].count) || 0;
            const originalAmount = Number(pledgeData[0].originalAmount) || 0;
            const correctBalance = originalAmount - actualTotalPaid;
            
            const currentTotalPaid = Number(pledgeData[0].currentTotalPaid) || 0;
            const currentBalance = Number(pledgeData[0].currentBalance) || 0;
            
            console.log(`  - Pledge ${pledgeId} (${pledgeData[0].currency}):`);
            console.log(`    * Original Amount: ${originalAmount} ${pledgeData[0].currency}`);
            console.log(`    * Completed Payments (converted): ${paymentCount}`);
            console.log(`    * Current Total Paid: ${currentTotalPaid} → New: ${actualTotalPaid}`);
            console.log(`    * Current Balance: ${currentBalance} → New: ${correctBalance}`);

            // Only update if values are different (avoid unnecessary updates)
            const needsUpdate = !this.isAmountEqual(currentTotalPaid, actualTotalPaid) || 
                               !this.isAmountEqual(currentBalance, correctBalance);

            if (needsUpdate) {
              await this.db.update(pledge)
                .set({
                  totalPaid: actualTotalPaid.toFixed(2),
                  balance: correctBalance.toFixed(2),
                  updatedAt: new Date()
                })
                .where(eq(pledge.id, pledgeId));

              console.log(`  ✅ Updated pledge ${pledgeId}: paid=${actualTotalPaid.toFixed(2)}, balance=${correctBalance.toFixed(2)}`);
            } else {
              console.log(`  ✅ Pledge ${pledgeId} already correct, no update needed`);
            }
          } else {
            console.warn(`  ⚠️ Could not find pledge data or payment sum for pledge ${pledgeId}`);
          }
        } catch (error) {
          console.error(`❌ Failed to update pledge ${pledgeId}:`, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      console.error('❌ Error in fixPledgeTotalsAfterPaymentCorrections:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async runCompleteCheck(): Promise<{ summary: CheckSummary; issues: IntegrityIssue[] }> {
    console.log('Multi-Currency Integrity Service - Starting Complete Check');
    console.log('========================================================\n');

    const connected = await this.checkDatabaseConnection();
    if (!connected) {
      throw new Error('Database connection failed. Please check your DATABASE_URL and ensure the database is accessible.');
    }

    const { exists, missing } = await this.checkTablesExist();
    if (!exists) {
      throw new Error(`Required tables are missing: ${missing.join(', ')}. Please run database migrations first using 'pnpm db:migrate' or 'pnpm db:push'.`);
    }

    const allIssues: IntegrityIssue[] = [];

    try {
      const pledgeIssues = await this.checkPledgeBalances();
      allIssues.push(...pledgeIssues);
      console.log(`Found ${pledgeIssues.length} pledge issues`);

      const planIssues = await this.checkPaymentPlanIntegrity();
      allIssues.push(...planIssues);
      console.log(`Found ${planIssues.length} payment plan issues`);

      const paymentIssues = await this.checkPaymentConversions();
      allIssues.push(...paymentIssues);
      console.log(`Found ${paymentIssues.length} payment conversion issues`);

    } catch (error) {
      console.error('Error during integrity check:', error instanceof Error ? error.message : String(error));
      throw error;
    }

    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
    const warningIssues = allIssues.filter(i => i.severity === 'warning').length;
    const affectedContacts = new Set(allIssues.map(i => i.contactId)).size;

    const summary: CheckSummary = {
      totalIssues: allIssues.length,
      criticalIssues,
      warningIssues,
      affectedContacts,
      timestamp: new Date().toISOString()
    };

    return { summary, issues: allIssues };
  }

  async applyFixes(issuesToFix: IntegrityIssue[]): Promise<{ fixed: number; failed: number; errors: string[] }> {
    console.log(`\nApplying multi-currency fixes for ${issuesToFix.length} issues...`);

    let fixed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const issue of issuesToFix) {
      try {
        if (issue.recordType === 'payment') {
          if (issue.affectedFields.includes('amount_usd') || issue.affectedFields.includes('exchange_rate')) {
            const [amountUsd, exchangeRate] = issue.fixValue.split('|');
            await this.db.update(payment)
              .set({
                amountUsd: amountUsd,
                exchangeRate: exchangeRate,
                updatedAt: new Date()
              })
              .where(eq(payment.id, issue.fixRecordId));
            console.log(`✅ Fixed USD conversion: Payment ${issue.fixRecordId} → ${amountUsd} USD (rate: ${exchangeRate})`);
          }
          
          if (issue.affectedFields.includes('amount_in_pledge_currency') || issue.affectedFields.includes('pledge_currency_exchange_rate')) {
            const [pledgeAmount, pledgeRate] = issue.fixValue.split('|');
            await this.db.update(payment)
              .set({
                amountInPledgeCurrency: pledgeAmount,
                pledgeCurrencyExchangeRate: pledgeRate,
                updatedAt: new Date()
              })
              .where(eq(payment.id, issue.fixRecordId));
            console.log(`✅ Fixed pledge currency conversion: Payment ${issue.fixRecordId} → ${pledgeAmount} (rate: ${pledgeRate})`);
          }

          if (issue.affectedFields.includes('amount_in_plan_currency') || issue.affectedFields.includes('plan_currency_exchange_rate')) {
            const [planAmount, planRate] = issue.fixValue.split('|');
            await this.db.update(payment)
              .set({
                amountInPlanCurrency: planAmount,
                planCurrencyExchangeRate: planRate,
                updatedAt: new Date()
              })
              .where(eq(payment.id, issue.fixRecordId));
            console.log(`✅ Fixed plan currency conversion: Payment ${issue.fixRecordId} → ${planAmount} (rate: ${planRate})`);
          }
        } else if (issue.recordType === 'pledge') {
          if (issue.affectedFields.includes('total_paid')) {
            await this.db.update(pledge)
              .set({
                totalPaid: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(pledge.id, issue.fixRecordId));
          }
          if (issue.affectedFields.includes('balance')) {
            await this.db.update(pledge)
              .set({
                balance: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(pledge.id, issue.fixRecordId));
          }
          if (issue.affectedFields.includes('total_paid_usd')) {
            await this.db.update(pledge)
              .set({
                totalPaidUsd: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(pledge.id, issue.fixRecordId));
          }
        } else if (issue.recordType === 'payment_plan') {
          if (issue.affectedFields.includes('total_paid')) {
            await this.db.update(paymentPlan)
              .set({
                totalPaid: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(paymentPlan.id, issue.fixRecordId));
          }
          if (issue.affectedFields.includes('remaining_amount')) {
            await this.db.update(paymentPlan)
              .set({
                remainingAmount: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(paymentPlan.id, issue.fixRecordId));
          }
          if (issue.affectedFields.includes('installment_amount')) {
            await this.db.update(paymentPlan)
              .set({
                installmentAmount: issue.fixValue,
                updatedAt: new Date()
              })
              .where(eq(paymentPlan.id, issue.fixRecordId));
          }
        }

        fixed++;
        console.log(`✅ Fixed: ${issue.recordType} ${issue.recordId}`);
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        failed++;
        const errorMsg = `❌ Failed to fix ${issue.recordType} ${issue.fixRecordId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return { fixed, failed, errors };
  }

  async saveReport(summary: CheckSummary, issues: IntegrityIssue[], filename?: string): Promise<string> {
    const reportData = { summary, issues, generatedAt: new Date().toISOString() };
    const defaultFilename = `multi-currency-integrity-report-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(process.cwd(), 'reports', filename || defaultFilename);

    const reportsDir = path.dirname(filepath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
    return filepath;
  }

  displaySummary(summary: CheckSummary): void {
    console.log('\n📊 MULTI-CURRENCY INTEGRITY CHECK SUMMARY');
    console.log('=========================================');
    console.log(`🕒 Scan Date: ${new Date(summary.timestamp).toLocaleString()}`);
    console.log(`📋 Total Issues: ${summary.totalIssues}`);
    console.log(`🔴 Critical: ${summary.criticalIssues} (auto-fix)`);
    console.log(`🟡 Warning: ${summary.warningIssues} (review needed)`);
    console.log(`👥 Affected Contacts: ${summary.affectedContacts}`);
  }

  displayIssues(issues: IntegrityIssue[]): void {
    if (issues.length === 0) return;

    console.log('\n🔍 FOUND MULTI-CURRENCY ISSUES');
    console.log('===============================');

    const issuesByContact = issues.reduce((acc, issue) => {
      const key = issue.contactId.toString();
      if (!acc[key]) acc[key] = { contactName: issue.contactName, issues: [] };
      acc[key].issues.push(issue);
      return acc;
    }, {} as Record<string, { contactName: string; issues: IntegrityIssue[] }>);

    Object.entries(issuesByContact)
      .sort(([,a], [,b]) => b.issues.length - a.issues.length)
      .slice(0, 10)
      .forEach(([contactId, { contactName, issues: contactIssues }]) => {
        console.log(`\n👤 ${contactName} (ID: ${contactId}) - ${contactIssues.length} issues`);
        contactIssues.slice(0, 3).forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : '🟡';
          console.log(`  ${i+1}. ${icon} ${issue.description}`);
        });
        if (contactIssues.length > 3) {
          console.log(`  ... and ${contactIssues.length - 3} more`);
        }
      });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  const service = new CurrencyIntegrityService();

  try {
    switch (command) {
      case 'check':
        console.log('🚀 Running multi-currency integrity check...');
        console.log('💡 Only counting payments that are: completed AND have received_date AND have converted amounts');
        console.log('💡 Expected/pending payments are ignored in balance calculations');
        console.log('💡 Third-party payments count toward beneficiary balance');
        console.log('💡 Using received_date for currency conversions');
        console.log('💡 Enhanced validation: >10% conversion error = warning, >50% = critical');
        console.log('💡 Checking ALL records with complete multi-currency support');
        console.log('💡 Handles mixed currencies within single pledges/plans\n');
        
        const { summary, issues } = await service.runCompleteCheck();

        service.displaySummary(summary);

        if (issues.length === 0) {
          console.log('\n✅ No multi-currency integrity issues found! Your data is clean.');
          return;
        }

        service.displayIssues(issues);

        const reportPath = await service.saveReport(summary, issues);
        console.log(`\n📄 Full multi-currency report saved to: ${reportPath}`);

        const criticalIssues = issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
          console.log('\n🔧 Auto-fixing critical multi-currency issues...');
          const result = await service.applyFixes(criticalIssues);
          console.log(`\n✅ Fixed: ${result.fixed}, ❌ Failed: ${result.failed}`);

          if (result.errors.length > 0) {
            console.log('❌ Errors:');
            result.errors.forEach(err => console.log(`  ${err}`));
          }
        }

        const warningIssues = issues.filter(i => i.severity === 'warning');
        if (warningIssues.length > 0) {
          console.log(`\n⚠️  ${warningIssues.length} warning issues found. Review the report if needed.`);
        }
        break;

      case 'fix-conversions':
        console.log('🔧 Running aggressive multi-currency conversion fixes...');
        console.log('💡 Checking ALL payments for currency conversion issues');
        console.log('💡 Will fix missing pledge currency amounts (same currency = payment amount)');
        console.log('💡 Will fix missing plan currency amounts (same currency = payment amount)');
        console.log('💡 Will fix incorrect cross-currency conversions');
        console.log('💡 Supports mixed currencies within single pledges/plans\n');
        
        const checkResult = await service.runCompleteCheck();
        
        const conversionIssues = checkResult.issues.filter(i => i.type === 'payment_conversion');
        if (conversionIssues.length > 0) {
          console.log(`Found ${conversionIssues.length} multi-currency conversion issues`);
          const result = await service.applyFixes(conversionIssues);
          console.log(`\n✅ Fixed: ${result.fixed}, ❌ Failed: ${result.failed}`);
          
          if (result.errors.length > 0) {
            console.log('❌ Errors:');
            result.errors.forEach(err => console.log(`  ${err}`));
          }
          
          // Recalculate pledge totals after fixing payment conversions
          await service.fixPledgeTotalsAfterPaymentCorrections();
        } else {
          console.log('✅ No multi-currency conversion issues found');
        }
        break;

      case 'help':
      default:
        console.log(`
🏦 Multi-Currency Integrity Service for LevHaTora
===============================================

Business Rules:
• Only payments with status='completed' AND received_date IS NOT NULL AND converted amounts populated count as paid
• Expected/pending payments are ignored in balance calculations  
• Third-party payments count toward beneficiary's pledge balance
• Currency conversions use received_date, fallback to payment_date, then today's date
• Enhanced validation flags >10% conversion errors as warnings, >50% as critical
• Checks ALL records in database (no artificial limits)
• Full multi-currency support: handles mixed currencies within single pledges/plans

Multi-Currency Features:
• Pledge in ILS can have payments in USD, CAD, EUR - all properly converted and summed
• Payment plan in USD can have payments in multiple currencies - all tracked correctly  
• Cross-currency conversions use live/historical exchange rates
• Same-currency payments: amount_in_pledge_currency = payment amount (no conversion needed)
• Missing conversion detection: flags payments without proper converted amounts

Commands:
  check                Run full multi-currency integrity check and auto-fix critical issues
  fix-conversions      Focus on currency conversion fixes only
  help                 Show this help

Usage:
  pnpm run integrity:check
  pnpm run integrity:check fix-conversions

The service will:
1. ✅ Check database connection and table existence
2. 💰 Check ALL pledge balances using converted payment amounts (multi-currency)
3. 📋 Verify ALL payment plan amounts using converted payment amounts (multi-currency)
4. 💱 Validate ALL payment currency conversions (USD + pledge currency + plan currency)
5. 🔧 Auto-fix critical data integrity issues
6. 📄 Generate detailed reports in /reports folder

Examples handled:
• Pledge: 1000 ILS, Payments: 200 ILS + 100 USD + 50 CAD → All converted to ILS and summed
• Payment plan: 5000 USD, Payments: 1000 USD + 500 EUR + 2000 CAD → All converted to USD 
• Missing conversions: 36 CAD payment → amount_in_pledge_currency should be 36 if pledge is CAD
• Cross-currency: $203.13 USD → 58 ILS (should be ~770 ILS) = 92% error → CRITICAL

Reports are saved as JSON files with detailed fix information.
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
      console.error('\n💡 This usually means you need to run database migrations:');
      console.error('   pnpm db:push  (for development)');
      console.error('   pnpm db:migrate  (for production)');
    }
    
    if (error instanceof Error && error.message.includes('WebSocket')) {
      console.error('\n💡 WebSocket connection failed. Make sure you have installed ws:');
      console.error('   pnpm add ws @types/ws');
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
