# Delivery Phases

## Delivery strategy

Build vertical slices that can be demonstrated and tested end to end. Do not build all screens first and connect logic later.

A realistic one-developer target:

- **Ultra-Lean MVP (Release 1, Phases 1 & 2 only):** maximum 4 focused weeks (1 month)
- **Strong production v1 (All phases):** approximately 12-16 focused weeks

The one-month deadline requires strictly limiting Release 1 to Catalog, Inventory, Purchasing, and Point-of-Sale workflows.

## Phase 0 - Discovery and foundations

### Goal
Freeze the first-shop workflow and remove ambiguity.

### Deliverables
- confirm shop business model: new, used, accessories, repair, wholesale/retail
- define roles
- define invoice and tax requirements with accountant
- confirm PTA/DIRBS and Punjab Police process
- list suppliers and payment methods
- sample purchase and sale documents
- initial catalog and attributes
- architecture decision record
- monorepo and CI setup
- development/staging environments
- coding standards
- database backup plan

### Exit criteria
- first release scope approved
- 10 realistic end-to-end scenarios documented
- no unresolved critical compliance assumption
- deployment skeleton works

## Phase 1 - Catalog, access and inventory foundation

### Goal
Create trustworthy product and stock identity.

### Deliverables
- organization/branch/location
- users, roles and permissions
- categories, brands, models and variants
- serialized/non-serialized tracking
- IMEI/serial validation
- product search
- basic suppliers/customers
- inventory unit and movement ledger
- stock opening/import workflow
- audit log foundation
- catalog seed for Lahore market

### Exit criteria
- serialized and batch stock can be loaded
- duplicate IMEI is blocked
- stock movement history is traceable
- permissions are server-enforced

## Phase 2 - Purchases, receiving and POS

### Goal
Run daily shop transactions through the system.

### Deliverables
- supplier quotes
- purchase orders
- goods receiving
- landed cost
- payables basics
- POS
- sale posting
- split payments
- receipt
- cash session
- returns/exchanges
- basic sales/profit dashboard

### Exit criteria
- complete purchase-to-sale flow passes
- sale updates stock and COGS atomically
- cash closing reconciles
- posted transactions cannot be edited
- critical E2E tests pass

## Phase 3 - Customer demand and buying intelligence

### Goal
Capture missed opportunities and recommend next purchases.

### Deliverables
- quick demand capture
- unavailable item workflow
- follow-ups and reservations
- lost-sale reasons
- product alias matching
- daily product metrics
- stockout measurement
- reorder formula
- recommendation review screen
- budget allocation
- draft PO from accepted suggestions
- recommendation evaluation history

### Exit criteria
- unavailable requests affect recommendations
- recommendation reasons are visible
- owner can accept/reject/modify
- no recommendation auto-orders
- low-confidence output is labeled

## Phase 4 - Finance and owner command center

### Goal
Show business reality, not only sales totals.

### Deliverables
- expenses
- receivables/payables
- owner capital/withdrawals
- management P&L
- cash flow
- inventory valuation
- gross margin analysis
- daily/weekly/monthly dashboard
- alerts and task center
- exports for accountant

### Exit criteria
- gross profit matches sampled manual calculations
- profit and cash reports are clearly separated
- inventory value reconciles with stock
- daily closing has variance workflow

## Phase 5 - Used phones, warranty and optional repairs

### Goal
Control the highest-risk device workflows.

### Deliverables
- seller intake
- consent/declaration
- e-Gadget/PTA reference fields
- condition checklist
- battery health and photos
- quarantine workflow
- trade-in valuation
- warranty claims
- supplier claims
- repair tickets, parts and labor if required

### Exit criteria
- unverified used device cannot be sold
- inspection history is traceable
- return/warranty state transitions are tested
- sensitive documents are access-controlled

## Phase 6 - Automations and AI explanation

### Goal
Reduce owner workload without losing control.

### Deliverables
- daily owner summary
- weekly buying plan
- automated follow-up tasks
- supplier/order reminders
- inventory aging alerts
- WhatsApp/SMS/email adapters
- optional natural-language intelligence
- English/Urdu explanation
- question-answering over authorized shop data

### AI limitations
- LLM reads prepared metrics, not raw unrestricted database access
- LLM cannot post a sale, alter stock or approve a purchase
- tool calls require permission and validation
- numerical claims must link to deterministic metrics
- prompts and outputs are logged safely

### Exit criteria
- AI statements are traceable to source metrics
- unsafe actions require human approval
- notification retries are idempotent

## Phase 7 - Production hardening and expansion

### Goal
Make the system dependable for continuous use.

### Deliverables
- load/performance testing
- security review
- backup restore drill
- monitoring and alerts
- data-retention policy
- disaster recovery runbook
- offline draft support
- printer/barcode testing
- staff training
- migration checklist
- staged production launch
- post-launch defect process

### Exit criteria
- restore drill passes
- no critical/high security defects
- inventory opening balance approved
- production reconciliation passes
- support runbook exists

## Priority order when time is limited

1. Product identity and inventory truth
2. Purchase/receiving
3. POS/payment/returns
4. Customer demand capture
5. Reorder intelligence
6. Finance dashboard
7. Used-device controls
8. Notifications
9. AI explanation
10. expansion features

## What not to compress

Do not save time by removing:

- server-side authorization
- database transactions
- audit trail
- IMEI uniqueness
- test coverage for sale/purchase/return
- backups
- data validation
- posted-transaction immutability
- owner approval for purchases
