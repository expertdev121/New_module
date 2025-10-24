# Campaign Management Implementation Plan

## Current Status
- [x] Plan approved by user
- [ ] Add campaigns table to schema
- [ ] Create API endpoints for campaigns CRUD operations
- [ ] Create admin UI component for managing campaigns
- [ ] Update dashboard campaigns API to use new campaigns table
- [ ] Update dashboard page campaigns tab
- [ ] Generate and run database migration
- [ ] Test complete CRUD functionality
- [ ] Verify location-based filtering works for admins

## Schema Changes
- Add campaigns table with: name, description, status, location_id, created_by, updated_by, timestamps
- Add relations to user table for created_by/updated_by

## API Endpoints
- GET /api/admin/campaigns - List campaigns with location filtering
- POST /api/admin/campaigns - Create new campaign
- PUT /api/admin/campaigns/[id] - Update campaign
- DELETE /api/admin/campaigns/[id] - Delete campaign

## UI Components
- Admin campaigns management page with table and dialogs
- Form validation and error handling
- Location-based access control

## Dashboard Updates
- Update campaigns API to use campaigns table instead of pledge campaign codes
- Maintain backward compatibility if needed
- Update dashboard UI to work with new data structure

## Testing
- CRUD operations work correctly
- Location filtering for admins
- Dashboard displays campaign data properly
- Migration runs successfully
