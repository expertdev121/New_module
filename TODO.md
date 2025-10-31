# TODO: Fix iframe login navigation issue

- [x] Import navigateInParent from lib/iframe-utils.ts in app/auth/login/page.tsx
- [x] Replace router.push calls with conditional navigation (navigateInParent for iframe, router.push for normal)
- [ ] Test iframe login flow
- [ ] Verify non-iframe login still works
