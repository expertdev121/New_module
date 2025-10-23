# Admin and User Management Updates

## Admin Management
- [ ] Add locationId field to add/edit admin form in `app/admin/manage-admins/page.tsx`
- [ ] Update GET API to include locationId in response (`app/api/admin/manage-admins/route.ts`)
- [ ] Update POST API to handle locationId (`app/api/admin/manage-admins/route.ts`)
- [ ] Update PUT API to handle locationId (`app/api/admin/manage-admins/[id]/route.ts`)

## User Management
- [ ] Add "Add User" form to users page (`app/admin/users/page.tsx`)
- [ ] Add locationId column to users table (`components/admin/users-table.tsx`)
- [ ] Add edit functionality to users table (password + locationId) (`components/admin/users-table.tsx`)
- [ ] Update GET API to include locationId in response (`app/api/admin/users/route.ts`)
- [ ] Update PUT API to handle locationId and password updates (`app/api/admin/users/[id]/route.ts`)
- [ ] Add POST API for creating users (`app/api/admin/users/route.ts`)

## Testing
- [ ] Test add/edit functionality for admins
- [ ] Test add/edit functionality for users
- [ ] Verify locationId is properly stored/retrieved
