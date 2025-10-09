# Resolve TypeScript ESLint Errors for 'any' Types

## Steps to Complete

1. **Edit app/dashboard/page.tsx**
   - Import RangeKeyDict from 'react-date-range'
   - Replace `any` in DateRangePicker onChange with `RangeKeyDict`

2. **Edit app/api/dashboard/overview/route.ts**
   - Import SQL from 'drizzle-orm'
   - Replace `any` in pledgeWhereCondition and paymentWhereCondition with `SQL<unknown>`

3. **Edit app/api/dashboard/payment-methods/route.ts**
   - Import SQL from 'drizzle-orm'
   - Replace `any` in whereCondition with `SQL<unknown>`

4. **Edit app/api/dashboard/pledge-status/route.ts**
   - Import SQL from 'drizzle-orm'
   - Replace `any` in whereCondition with `SQL<unknown>`

5. **Edit app/api/dashboard/recent-activity/route.ts**
   - Import SQL from 'drizzle-orm'
   - Replace `any` in paymentWhereCondition and pledgeWhereCondition with `SQL<unknown>`

6. **Edit app/api/dashboard/top-donors/route.ts**
   - Import SQL from 'drizzle-orm'
   - Replace `any` in pledgeWhereCondition and paymentWhereCondition with `SQL<unknown>`

7. **Verify Changes**
   - Run TypeScript check to ensure no errors remain
   - Test the application functionality
