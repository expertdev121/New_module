# TODO: Fix Select.Item Error and Super Admin Redirect

## Issues Identified
1. **Select.Item Error**: In `app/admin/log-reports/page.tsx`, the Select component has a SelectItem with an empty string value (`value=""`), which is not allowed. This causes an error when visiting admin/log-reports.
2. **Super Admin Redirect**: In `app/auth/login/page.tsx`, super admins are redirected to `/dashboard`, but according to the sidebar navigation, they should go to `/admin/manage-admins` since they don't have dashboard access in their navigation.

## Tasks
- [x] Fix Select.Item in log-reports page: Change empty string value to "all"
- [x] Fix super admin redirect: Change redirect to /admin/manage-admins
- [x] Test the fixes by running the app

## Files to Edit
- `app/admin/log-reports/page.tsx`
- `app/auth/login/page.tsx`
