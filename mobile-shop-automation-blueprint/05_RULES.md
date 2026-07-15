# Business, Data and Engineering Rules

## 1. Non-negotiable business rules

1. Every phone or serialized device must have a unique IMEI or serial before becoming saleable.
2. A serialized unit may exist in only one active stock state and one location at a time.
3. Stock cannot become negative.
4. A sold IMEI cannot be sold again unless a completed return restores it to an approved saleable state.
5. A purchase order does not create available stock; receiving does.
6. A posted sale cannot be edited or deleted.
7. A posted purchase receipt cannot be silently edited.
8. Corrections use reversal, return, refund, credit/debit note or adjustment with reason.
9. All stock adjustments require a reason and audit entry.
10. Cost must be known before stock is considered financially complete.
11. Profit is based on recorded COGS, not current catalog cost.
12. Customer demand must be recordable even when the requested product does not exist in the catalog.
13. A reorder suggestion may create only a draft purchase order until approved by an authorized user.
14. Used devices remain quarantined until required identity, IMEI and condition checks pass.
15. Blocked, duplicate, cloned, invalid or otherwise prohibited devices must not be marked saleable.
16. Sensitive identity documents are restricted, encrypted and never exposed in general reports.
17. Cash mismatches are recorded as variances; sales records are not manipulated to hide them.
18. Every discount above the configured threshold requires a reason and authorization.
19. A return must reference the original sale unless an authorized exceptional process is used.
20. Every external integration response must be stored with status and trace reference.

## 2. Product and catalog rules

- Product model and variant names use a canonical format.
- Aliases support spelling mistakes and local names.
- Storage/RAM/color are attributes, not free-form text when known.
- Condition values are controlled.
- PTA status values are controlled.
- Warranty terms are explicit.
- Serialized and non-serialized tracking mode cannot change after transactions exist without migration.
- Inactive products remain visible in historical records.

## 3. Inventory states

Allowed serialized states:

- pending_verification
- quarantined
- available
- reserved
- sold
- returned_inspection
- defective
- supplier_warranty
- customer_warranty
- repair
- written_off
- purchase_returned

State transitions must be explicit and tested.

Example allowed path:

`pending_verification -> quarantined -> available -> reserved -> sold -> returned_inspection -> available`

A returned unit cannot jump directly to available without inspection.

## 4. Sales rules

- Price below configured minimum margin requires warning or approval.
- A line with serialized tracking requires exactly one inventory unit per quantity.
- Payment total plus approved receivable must equal sale total.
- Split payment allocation must reconcile exactly.
- Sale posting and inventory deduction happen atomically.
- Receipt numbers are unique and sequential according to configured policy.
- Walk-in customer is allowed, but warranty/credit workflows may require customer identification.
- Return windows and warranty terms are stored on the sale snapshot.

## 5. Purchase rules

- Purchase quantities and costs cannot be negative.
- Received quantity cannot exceed permitted tolerance without approval.
- Every received serialized unit is scanned or entered individually.
- Duplicate IMEI blocks receiving.
- Landed-cost allocation method is documented.
- Supplier returns create reversing stock and payable effects.
- Supplier price history is preserved.
- Purchase recommendations consider available, reserved and inbound stock.

## 6. Customer demand rules

- An unavailable request must record why the sale was missed.
- Demand is linked to exact variant when possible, otherwise model/family/raw text.
- Repeat requests are visible but forecast deduplication rules prevent artificial inflation.
- Anonymous demand is allowed.
- Contact follow-up requires consent.
- Demand converted to sale should be linked to the sale.
- Staff cannot delete demand to improve performance metrics.

## 7. Finance rules

- Store money as integer minor units.
- Profit and cash are separate concepts.
- Inventory purchase affects cash/payable and inventory asset, not immediate COGS.
- COGS is recognized on sale.
- Returns reverse revenue and COGS according to condition/outcome.
- Owner withdrawal is not a shop expense.
- Owner capital injection is not sales revenue.
- Customer credit creates a receivable.
- Supplier unpaid purchase creates a payable.
- Every expense has category, date, amount, payment source and evidence where required.
- Management reports must state whether tax is included/excluded.

## 8. Recommendation rules

- Recommendations are explainable and reproducible.
- Algorithm version and input window are stored.
- Low-data products show low confidence.
- New launches do not receive aggressive quantities solely from external hype.
- Lost demand is weighted by likelihood and recency.
- High return/defect rate reduces priority.
- Aged stock and capital constraints reduce new buying.
- Supplier lead time and reliability affect safety stock.
- No LLM may alter numerical recommendations without deterministic validation.
- Owner decisions are recorded for later evaluation.

## 9. Engineering rules

- TypeScript strict mode.
- Validate all API input.
- Authorize on the server.
- Business rules belong in domain/application services, not only UI.
- Database migrations are reviewed and reversible where practical.
- No direct production database editing except documented emergency procedure.
- Use transactions for multi-record business operations.
- Use idempotency for retried writes.
- Use UTC-consistent storage and Asia/Karachi display.
- Use structured logs with request IDs.
- Never log passwords, tokens, CNIC images or full payment data.
- Feature flags protect incomplete modules.
- Every critical bug gets a regression test.
- No `any` without documented reason.
- No hidden magic numbers; configuration is named and versioned.
- API errors use stable machine codes plus human-readable messages.
- External integrations use adapters and retry policies.
- Background jobs must be idempotent.
- Secrets never enter Git.

## 10. Definition of done

A task is complete only when:

- requirements and edge cases are understood
- UI states are implemented
- server authorization exists
- validation exists
- transaction and audit effects are correct
- unit/integration tests pass
- relevant end-to-end flow passes
- error and empty states exist
- logs/metrics are adequate
- documentation is updated
- `07_MEMORY.md` is updated with verified status
- no known critical defect remains hidden
