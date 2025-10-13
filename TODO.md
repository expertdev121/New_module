# Update Payment Plan Form for Dynamic Dropdowns

## Tasks
- [ ] Add useQuery hook to fetch payment methods data from /api/payment-methods
- [ ] Transform fetched data into paymentOptions and detailOptions
- [ ] Replace static paymentMethods array with dynamic paymentOptions in paymentMethod Combobox
- [ ] Update methodDetail Combobox to use filtered detailOptions based on selected paymentMethod
- [ ] Add useEffect to reset methodDetail when paymentMethod changes
- [ ] Update Zod schema: paymentMethod to z.string().optional()
- [ ] Update ensurePaymentMethod function for dynamic defaults
- [ ] Update preview/summary display to lookup labels dynamically
- [ ] Update form defaultValues and resetForm to use dynamic data
- [ ] Handle loading/error states in dropdowns
- [ ] Update onSubmit validation for paymentMethod selection
