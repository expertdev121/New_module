# TODO: Add Campaigns Tab to Dashboard

## Overview
Add a new "Campaigns" tab to the dashboard that displays campaign-based payment data with location filtering.

## Tasks
- [ ] Add "Campaigns" tab to the TabsList in app/dashboard/page.tsx
- [ ] Create campaigns section with summary cards (total campaigns, total payments, total amount, total contacts)
- [ ] Add campaign details table showing campaign code, pledges, payments, amount, contacts
- [ ] Add detailed payments per campaign with contact names, amounts, dates, methods
- [ ] Add location ID filter dropdown (need to fetch available locations)
- [ ] Use existing useDashboardCampaigns hook with location filtering

## Implementation Details
- API endpoint: `/api/dashboard/campaigns` (already exists)
- Hook: `useDashboardCampaigns` (already exists with locationId support)
- Location filtering: Need to create a way to fetch available locationIds for the dropdown
- Data structure: CampaignsData interface with campaigns array and details array

## Next Steps
1. Update dashboard page to include campaigns tab
2. Implement location filter dropdown
3. Create campaign summary cards
4. Add campaign details table
5. Add detailed payments section
