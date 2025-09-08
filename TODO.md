# TODO: Fix Date Year Restriction in Forms

## Tasks
- [x] Update pledge-form.tsx to improve year restriction logic
- [x] Add year restriction to startDate and endDate in student-role.tsx
- [x] Add year restriction to date inputs in payment-plan-dialog.tsx
- [ ] Add year restriction to date inputs in payment-form.tsx
- [ ] Add year restriction to date inputs in payment-dialog.tsx
- [ ] Add year restriction to date inputs in contact-role-form.tsx
- [ ] Add year restriction to date inputs in edit-payment.tsx

## Notes
- Use onChange handler to prevent updating field if year has more than 4 digits
- Handler: if value exists, split by '-', check if first part (year) length >4, if so return without updating
- Apply to all Input type="date" in forms
