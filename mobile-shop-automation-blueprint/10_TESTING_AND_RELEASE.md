# Testing, Security and Release Plan

## 1. Quality strategy

Test the financial and inventory invariants more deeply than visual details.

Testing layers:

- unit tests for formulas and domain rules
- integration tests with PostgreSQL
- API authorization tests
- end-to-end tests for shop workflows
- migration tests
- backup/restore drills
- security testing
- manual hardware tests for scanners/printers

## 2. Critical automated test scenarios

### Catalog and inventory
- duplicate IMEI1 rejected
- duplicate IMEI2 rejected
- same IMEI normalized despite spaces/dashes
- serialized unit has one state/location
- non-serialized stock cannot go negative
- transfer creates balanced movements
- unauthorized adjustment blocked

### Purchase
- PO does not increase available stock
- partial receipt handled
- receiving creates inventory and payable
- duplicate IMEI rolls back whole receipt
- landed cost allocation reconciles
- purchase return reverses stock/payable correctly

### Sale
- selling available IMEI succeeds
- selling reserved-by-other transaction fails
- selling same IMEI concurrently only allows one success
- payment allocation equals total
- COGS snapshot preserved
- sale posting is atomic
- duplicate client retry does not duplicate sale
- posted sale cannot be edited

### Return
- original sale/IMEI verified
- return restores correct state, not automatically available
- refund reconciles
- revenue and COGS reversal correct
- expired return policy handled with permission

### Demand and recommendation
- unavailable request counted
- duplicate request deduped according to rule
- converted request linked to sale
- available/inbound/reserved affect quantity correctly
- budget cap applied
- low data gives low confidence
- recommendation formula version stored

### Finance
- inventory purchase does not become immediate COGS
- owner withdrawal excluded from expense
- receivable/payable reconciliation
- cash-session expected balance
- refund and expense affect cash correctly

### Authorization
- salesperson cannot see cost when denied
- cashier cannot approve purchase
- manager cannot change owner permissions
- technician cannot access customer finance
- branch scope enforced

## 3. End-to-end golden flows

1. New phone purchase -> receive IMEI -> sell -> receipt -> dashboard.
2. Accessory batch purchase -> sell multiple units -> stock count.
3. Customer asks for unavailable model -> demand -> recommendation -> draft PO -> receive -> notify -> sale.
4. Used phone intake -> verification -> quarantine -> inspection -> available -> sale.
5. Sale return -> inspection -> restock or defective.
6. Supplier credit purchase -> payable -> partial payment -> close.
7. Customer credit sale -> receivable -> payment -> close.
8. Daily opening -> sales/expenses/refunds -> counted close -> variance.
9. Stock transfer between locations.
10. Restore database/object backup into test environment.

## 4. Test data

Use realistic but synthetic data:

- Lahore customer phone formats
- multiple brands and price bands
- phones with dual IMEI
- new/used/open-box conditions
- accessories by batch
- cash and split payments
- supplier credit terms
- stockouts and unmet requests
- returns and defective devices
- aged inventory

Never use real CNICs or production secrets in tests.

## 5. Security checklist

- dependency scan
- secret scan
- secure cookies/session
- password policy
- MFA for privileged account where possible
- server-side RBAC
- branch/location scoping
- rate limits
- CSRF/XSS/SQL injection protection
- safe file upload validation
- private object storage
- sensitive-field encryption
- log redaction
- backup encryption
- least-privilege database user
- production debug disabled
- audit log integrity
- export permissions
- account lockout/recovery process

## 6. Backup and disaster recovery

### Minimum
- daily PostgreSQL backup
- transaction/WAL or more frequent backup if available
- off-server encrypted copy
- object-storage backup/versioning
- retention policy
- backup monitoring
- monthly restore drill

### Restore drill evidence
Record:

- backup timestamp
- restore environment
- restore commands
- row counts
- sample transaction checks
- object/document checks
- duration
- issues
- sign-off

A backup is not trusted until restore is tested.

## 7. Environments

### Local
Developer environment with Docker Compose and synthetic seed data.

### Staging
Production-like environment for migrations, hardware/integration tests and owner acceptance.

### Production
Restricted access, monitored, backed up and separate from staging.

Never reuse production database credentials in local/staging.

## 8. Release gates

A release may proceed only when:

- migrations reviewed
- tests pass
- critical flows pass in staging
- backup created
- rollback plan documented
- monitoring active
- permissions sampled
- known issues disclosed
- release notes written
- memory updated
- owner acceptance completed for workflow changes

## 9. Pilot launch plan

### Before pilot
- clean catalog
- approved opening inventory
- scan every serialized device
- import supplier/customer essentials
- configure payment methods
- configure receipt
- enter cash opening
- train owner
- keep old records available for comparison

### First week
- reconcile stock daily
- reconcile cash daily
- review missing demand captures
- log every mismatch
- do not add major new features
- fix correctness issues first

### After stability
- activate recommendations
- activate follow-up notifications
- add used/repair module
- add AI summaries

## 10. Operational monitoring

Alert on:

- failed database backup
- API unavailable
- repeated 5xx errors
- queue backlog
- failed external integration
- low disk
- database connection exhaustion
- unusual login failures
- stock invariant failure
- sale/payment mismatch
- audit write failure

## 11. Release notes template

- version/date
- features
- fixes
- migrations
- configuration changes
- integration changes
- known issues
- rollback notes
- tests run
- owner-visible behavior changes
