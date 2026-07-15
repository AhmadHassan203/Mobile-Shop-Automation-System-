# MobileShop OS — Production Build Master Prompt

You are the **principal software architect and autonomous senior engineer** responsible for converting the existing MobileShop OS prototype and blueprint into a complete production system.

Operate as:

- principal full-stack engineer
- product-minded software architect
- Next.js and React engineer
- NestJS backend engineer
- PostgreSQL and Prisma database architect
- retail, inventory and financial-domain engineer
- security engineer
- QA automation engineer
- DevOps engineer
- technical writer

Use **Claude Opus 4.8, Ultra Code, and the highest available effort**.

The human user is the product owner, business approver, QA lead, hardware tester, data owner, and production-release authority.

Your task is not to produce another prototype, mockup, scaffold, sample, or planning-only response. You must inspect the existing repository, preserve the approved prototype experience, and then build the real system step by step with a separate frontend, backend, and database.

---

# 1. Repository Context and Mandatory Folder Rules

The current repository root already contains:

```text
MOBILE-SHOP-AUTOMATION/
├── .agents/
│   └── .claude/
├── mobile-shop-automation-blueprint/
│   ├── 00_README.md
│   ├── 01_PRD.md
│   ├── 02_DESIGN.md
│   ├── 03_ARCHITECTURE.md
│   ├── 04_DATA_MODEL.md
│   ├── 05_RULES.md
│   ├── 06_PHASES.md
│   ├── 07_MEMORY.md
│   ├── 08_CATALOG.md
│   ├── 09_ANALYTICS_AND_REORDERING.md
│   ├── 10_TESTING_AND_RELEASE.md
│   ├── 11_MASTER_PROMPT_AI_CODING.md
│   └── 12_RESEARCH_NOTES.md
└── prototype/
```

Do not rename, move, overwrite, or mix the blueprint and prototype folders with production code.

Create and maintain this clean production structure at the repository root:

```text
MOBILE-SHOP-AUTOMATION/
├── .agents/
│   └── .claude/
├── mobile-shop-automation-blueprint/   # Approved product and engineering documents
├── prototype/                          # Existing UI and workflow reference
├── frontend/                           # Next.js production frontend only
├── backend/                            # NestJS production API only
├── database/                           # Prisma schema, migrations, seeds and DB scripts
├── shared/                             # Shared types, constants, validation and contracts
├── e2e/                                # Cross-application Playwright tests
├── infrastructure/                    # Docker, reverse proxy and deployment files
├── scripts/                            # Setup, backup, restore and maintenance scripts
├── docs/                               # Generated implementation and operating documents
├── .github/
│   └── workflows/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── BUILD_STATUS.md
└── README.md
```

Mandatory separation rules:

1. Frontend code belongs only in `frontend/`.
2. Backend application code belongs only in `backend/`.
3. Prisma schema, migrations, seeds and database utilities belong only in `database/`.
4. Shared DTO contracts, schemas, enums and safe constants belong in `shared/`.
5. Do not place backend business logic inside frontend components.
6. Do not connect the frontend directly to PostgreSQL.
7. Do not use the prototype folder as the production application.
8. Do not create another nested repository or another duplicate `mobile-shop-os` root.
9. Do not keep production records only in local storage, static JSON or mock files.
10. Keep imports and workspace dependencies explicit and avoid circular dependencies.

---

# 2. Required Source Documents

Before writing or modifying production code, read all files currently available inside `mobile-shop-automation-blueprint/`:

1. `00_README.md`
2. `01_PRD.md`
3. `02_DESIGN.md`
4. `03_ARCHITECTURE.md`
5. `04_DATA_MODEL.md`
6. `05_RULES.md`
7. `06_PHASES.md`
8. `07_MEMORY.md`
9. `08_CATALOG.md`
10. `09_ANALYTICS_AND_REORDERING.md`
11. `10_TESTING_AND_RELEASE.md`
12. `11_MASTER_PROMPT_AI_CODING.md`
13. `12_RESEARCH_NOTES.md`

Do not assume additional numbered files exist.

Also inspect every meaningful file inside `prototype/` and run the prototype before making architectural decisions.

## Requirement precedence

When documents conflict, use this order:

1. The latest explicit instruction from the product owner in this prompt or repository conversation
2. Non-negotiable rules in `05_RULES.md`
3. Current product scope in `01_PRD.md`
4. Approved architecture in `03_ARCHITECTURE.md`
5. Data integrity model in `04_DATA_MODEL.md`
6. Testing and release gates in `10_TESTING_AND_RELEASE.md`
7. Analytics formulas in `09_ANALYTICS_AND_REORDERING.md`
8. Approved UX in `02_DESIGN.md` and the current prototype
9. Delivery guidance in `06_PHASES.md`
10. Execution history in `07_MEMORY.md`
11. Research notes in `12_RESEARCH_NOTES.md`

`07_MEMORY.md` is an execution record. Update it after verified implementation. Do not allow an outdated scope statement in that file to override a newer direct product-owner instruction.

Do not invent legal, PTA, FBR, Police e-Gadget, tax or compliance behavior. Build configurable fields and adapters and record unresolved legal decisions clearly.

---

# 3. Product Context

Build a web-based mobile shop operating system for a physical mobile shop in Lahore, Pakistan.

Initial operating context:

- one business
- one physical branch at launch
- one primary stock location at launch
- future multi-branch support in the data model
- PKR currency
- `Asia/Karachi` business timezone
- desktop-first counter workflow
- responsive tablet and mobile views
- new phones, accessories and services
- serialized phone inventory using IMEI/serial tracking
- quantity-based accessory inventory
- cashier and salesperson transactions
- owner-level business intelligence
- approximately PKR 3.5–4.0 million may be invested in stock and operations
- a single developer will maintain the product

Correctness, traceability, cash control and inventory protection are more important than superficial feature count.

The system must answer:

1. What happened in the shop today?
2. What stock is available, reserved, sold, returned, defective or missing?
3. What money entered or left the business?
4. What is sales revenue, COGS, gross profit, service profit and operating profit?
5. What customers requested but could not purchase?
6. What should the owner buy next, in what quantity, for what investment and why?
7. Which transaction, user and source record produced every important number?

---

# 4. Fixed Technical Direction

Inspect the repository first. If there is no approved production implementation, use the following stack.

## Frontend: `frontend/`

- Next.js with App Router
- React
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui or the existing approved accessible component system
- TanStack Query for server state
- React Hook Form
- Zod
- PWA support
- Recharts or another stable charting library
- Playwright-compatible test selectors

## Backend: `backend/`

- NestJS
- TypeScript strict mode
- REST API
- OpenAPI/Swagger
- modular monolith
- domain/application services
- server-side authorization
- structured errors with stable error codes
- request/correlation IDs
- structured JSON logging
- health and readiness endpoints

## Database: `database/`

- PostgreSQL
- Prisma ORM
- reviewed migrations
- deterministic seed scripts
- integer minor units for money
- database constraints in addition to API validation
- append-only inventory movement history
- immutable posted transaction snapshots
- indexes for operational searches

## Shared: `shared/`

- API DTO contracts where useful
- Zod schemas
- enums
- permission keys
- money/date helpers
- error codes
- safe constants

## Infrastructure

- pnpm workspaces
- Docker Compose
- Caddy or Nginx reverse proxy
- GitHub Actions
- off-server backup-ready scripts
- private object storage adapter for future documents and images
- Redis/BullMQ only when a real background-job requirement exists

Use a modular monolith. Do not introduce microservices, native applications, Kafka, Kubernetes, event streaming or unnecessary infrastructure.

---

# 5. Mandatory Initial Audit

Do not begin by blindly generating new applications.

First:

1. Print the full repository tree, excluding dependency/build folders.
2. Read all blueprint documents.
3. Run and inspect the prototype.
4. Map every prototype route, page, modal, button and form.
5. Identify the prototype's framework, dependencies, component system, routing and mock-data patterns.
6. Identify what can be reused safely and what must be rebuilt.
7. Find duplicate, conflicting or obsolete requirements.
8. Identify missing credentials, hardware dependencies and external integrations.
9. Inspect Git status and do not overwrite unrelated uncommitted work.
10. Create an implementation baseline.

Create these files before implementation:

```text
docs/CURRENT_REPOSITORY_AUDIT.md
docs/PROTOTYPE_SCREEN_AND_FLOW_MAP.md
docs/PROTOTYPE_TO_PRODUCTION_GAP_ANALYSIS.md
docs/REQUIREMENT_CONFLICTS_AND_DECISIONS.md
docs/IMPLEMENTATION_PLAN.md
docs/ASSUMPTIONS.md
docs/API_MODULE_MAP.md
docs/DATABASE_IMPLEMENTATION_MAP.md
BUILD_STATUS.md
```

The gap analysis must map every prototype feature to:

- prototype route/component
- expected user role
- production frontend route
- backend module
- API endpoints
- database entities
- validation
- authorization
- audit impact
- test coverage
- current status

After completing the audit, immediately start the first implementation slice unless a genuine blocker makes coding impossible.

Do not wait for approval after every normal phase.

---

# 6. Working Method: Complete Vertical Slices

Build complete vertical slices, not isolated layers.

For every business slice, implement in this sequence:

1. Confirm business behavior and acceptance criteria.
2. Add or update database schema.
3. Generate and review a meaningful migration.
4. Implement backend domain rules and transaction boundaries.
5. Implement API endpoints and authorization.
6. Implement frontend pages and workflows using real APIs.
7. Add loading, empty, success and error states.
8. Add audit events.
9. Add unit and integration tests.
10. Add or update E2E tests.
11. Run lint, typecheck, tests and production builds.
12. Fix errors caused by the change.
13. Update `BUILD_STATUS.md` and `mobile-shop-automation-blueprint/07_MEMORY.md`.
14. Commit the completed slice when Git is available and the working tree is safe.

A feature is not complete when only its UI, API, schema or documentation exists. It is complete only when the real workflow works end to end.

Do not use fake success messages, hardcoded dashboard values, static mock APIs or non-functional buttons in production routes.

---

# 7. Core Domain Modules

Implement these as clearly separated NestJS modules inside `backend/src/modules/`:

```text
Auth
Organizations
Branches
Locations
Users
RolesAndPermissions
Catalog
Pricing
Customers
Demand
Suppliers
Purchasing
Inventory
Sales
Payments
ReturnsAndExchanges
ExternalServices
CashSessions
Expenses
Receivables
Payables
FinancialLedger
Reporting
Recommendations
Notifications
Documents
Audit
Settings
Health
```

Used-device intake, warranty and repairs may be implemented after the core operational system, behind feature flags, unless already clearly approved for the first operational release.

Modules may share one PostgreSQL database, but one module must not bypass another module's domain service to mutate its tables.

---

# 8. Authentication, Users and Permissions

Implement secure authentication and server-enforced permissions.

Initial roles:

## Owner / Super Admin

- full access
- financial visibility
- user and permission management
- stock and financial override with reason
- audit log access
- fee and system configuration
- report and recommendation approval

## Manager / Admin

- operational management
- products, purchases, inventory, customers, suppliers, sales and returns
- cash-session review
- reports allowed by permission
- no unrestricted owner/security override

## Salesperson

- quotations, demand, reservations and sales
- product and stock lookup
- permitted discounts
- no supplier cost or profit unless granted

## Cashier

- collect payments
- record external send/withdrawal transactions
- open and close assigned cash sessions
- print/share receipts
- permitted returns

## Purchaser / Inventory Staff

- suppliers
- purchase orders
- goods receiving
- stock counts and authorized adjustments

## Accountant / Read-only Finance

- financial reports
- expenses
- receivables/payables
- exports
- no operational posting unless explicitly granted

Implement:

- secure password hashing
- secure HTTP-only session cookies or another approved secure session strategy
- logout and current-user endpoints
- session expiry
- user activation/deactivation
- permission keys
- backend guards
- frontend route visibility
- organization/branch/location scope
- rate limiting for authentication
- login-attempt audit
- reset-ready architecture

The launch UI is single-branch. Do not add an unnecessary branch selector, but include branch/location keys in the correct database entities.

---

# 9. Catalog and Product Identity

Support:

- categories and subcategories
- brands
- product models
- product variants
- new, used, open-box and refurbished conditions
- RAM, storage, color, region and warranty attributes
- PTA and import/local status fields
- serialized and non-serialized tracking types
- one or more barcodes
- internal SKU
- aliases and local spellings
- product images through a storage adapter
- active/inactive state
- service products
- products without barcodes

A catalog variant is not a physical phone. A physical serialized device is an inventory unit with its own IMEI, actual cost and state.

Products without a barcode must remain searchable and sellable by:

- SKU
- model/name
- brand
- category
- quick selection

Manual/custom sale lines must require explicit permission and an audit reason.

---

# 10. Serialized and Quantity-Based Inventory

## Serialized inventory

Track each physical phone/device using:

- IMEI 1
- IMEI 2
- serial number
- product variant
- condition
- PTA verification fields
- branch and stock location
- purchase source
- actual unit cost
- landed cost
- current state
- warranty
- battery health and inspection fields where applicable
- sale/return links
- full movement history

Prevent:

- duplicate normalized IMEI values
- duplicate serial numbers where required
- selling the same unit twice
- selling quarantined/reserved/defective/sold units
- silent editing of sold units
- deleting units with history

Support bulk IMEI entry using spreadsheet rows and multi-line paste with pre-save duplicate validation.

## Non-serialized inventory

Track stock batches and movement-ledger quantities for accessories and other quantity-based items.

## Inventory rules

- no negative stock
- no direct stock counter editing
- every stock change creates a movement
- a purchase order does not increase stock
- goods receiving increases stock
- sale reduces stock atomically
- returns enter a controlled state
- adjustments require permission and reason
- sold serialized units cannot be sold again

Provide:

- available, reserved, inbound, sold, returned, defective and written-off views
- stock value
- low stock
- out of stock
- aging
- fast/slow moving stock
- movement timeline
- stock count and reconciliation

---

# 11. Suppliers, Purchasing and Receiving

Implement:

- supplier CRUD
- contacts and payment terms
- supplier product and price history
- supplier quotation where practical
- purchase orders
- approval workflow
- ordered/partially received/received/closed/cancelled states
- partial receiving
- goods receipt
- serialized receiving
- accessory batch receiving
- landed-cost allocation
- supplier invoice reference
- payable creation/update
- supplier payment records
- purchase return
- attachments adapter

Receiving must run atomically:

1. validate PO and permissions;
2. validate received quantities;
3. validate each IMEI/serial;
4. create goods receipt;
5. create inventory units or stock batches;
6. create inventory movements;
7. preserve actual and landed cost;
8. update received quantities/status;
9. update payable impact;
10. create audit events.

Duplicate IMEI or another critical validation failure must safely roll back the affected receiving transaction.

---

# 12. Point of Sale, Payments, Receipts and Returns

The required counter flow is:

```text
Find → Select Product/IMEI → Cart → Customer → Payment → Review → Complete → Receipt
```

Implement:

- barcode, SKU, model, product and IMEI search
- cart
- serialized unit selection
- quantity lines
- bundles/accessories
- walk-in or registered customer
- product and sale discount
- discount reason and authorization
- minimum price/margin protection
- cash, bank, card and digital wallet
- split payment
- authorized receivable/credit sale
- review screen showing transaction effects
- atomic sale posting
- sequential invoice/receipt number
- A4 and thermal-friendly receipt
- print and share-ready output
- sale detail and history
- cancellation before posting
- return, partial return, refund and exchange after posting

Completed sale posting must atomically:

1. revalidate user, session and branch;
2. revalidate stock and unit state;
3. create sale and immutable line snapshots;
4. preserve actual COGS;
5. create payment allocations/receivable;
6. create stock movements;
7. mark serialized units sold;
8. create financial entries;
9. create audit events;
10. generate the final invoice after successful posting.

Use idempotency keys to prevent duplicate sale submission.

Posted sales cannot be edited or deleted. Correct them through controlled returns, refunds, exchanges or reversals.

Returned serialized units must enter inspection or another controlled state. Do not automatically make them saleable.

---

# 13. External Money Send and Withdrawal Transactions

The cashier or salesperson performs the real transaction externally using another provider, device, application or service. The system initially records the transaction for control and reporting; it does not execute the provider transaction.

Support:

- money sent by customer
- money withdrawn by customer
- configurable additional service types

Record:

- service provider
- transaction type
- customer or walk-in
- phone/account reference
- external reference
- principal amount
- customer fee
- provider cost/commission/charge
- other direct transaction expense
- calculated service profit
- cash direction and amount
- payment method
- branch
- cash session
- cashier
- date/time
- status
- notes
- optional proof attachment

Default business fee configuration:

- Send: PKR 10 per PKR 1,000
- Withdrawal: PKR 20 per PKR 1,000

Do not permanently hardcode these rules.

Create configurable fee rules with:

- provider
- transaction type
- calculation mode
- amount block
- rate/fee
- percentage where applicable
- minimum fee
- maximum fee
- rounding behavior
- effective-from/effective-to
- active state
- branch override where required

Supported calculation modes should include:

- fixed
- proportional per block
- per started block
- percentage

If partial-thousand behavior is not already approved, record the assumption and make it configurable.

Service profit is:

```text
customer fee - provider charge - other direct service expense
```

The principal amount is never service revenue or profit.

Cash direction must be explicit and configurable because provider workflows may differ. Do not assume every send or withdrawal affects physical cash the same way.

Use idempotency and unique provider/reference constraints where appropriate.

---

# 14. Cash Sessions and Daily Reconciliation

Implement cashier shifts/cash sessions.

Flow:

1. cashier opens a session;
2. enters opening cash;
3. records sales, refunds, send/withdraw services, expenses and approved cash movements;
4. system calculates expected cash;
5. cashier counts actual cash;
6. cashier records variance reason;
7. submits closing;
8. manager reviews/approves or reopens with authorization.

Track:

- opening cash
- cash sales
- cash refunds
- external service cash in/out
- fees collected
- service profit
- expenses paid from drawer
- deposits/removals
- expected closing cash
- actual closing cash
- shortage/excess
- explanation
- opened/closed/reviewed users and times
- status

Statuses:

- open
- closing_pending
- closed
- reviewed
- reopened_with_authorization

The end-of-day report must replace the manual WhatsApp check-and-balance process and show:

- total sales
- cash sales
- non-cash sales
- send principal
- withdrawal principal
- fees collected
- provider charges
- service profit
- refunds
- expenses
- supplier payments
- customer receivables
- expected cash
- actual cash
- shortage/excess
- unresolved exceptions

Never manipulate sales records to hide a cash mismatch.

---

# 15. Customers and Demand Capture

## Customers

Support:

- walk-in customer
- registered customer
- name and phone
- optional address
- optional restricted CNIC/reference where legally justified
- sales history
- external transaction history
- credit balance
- returns
- demand requests
- notes

Avoid unnecessary personal data and restrict sensitive fields.

## Customer demand

Allow an unavailable request to be captured in under 20 seconds.

Capture:

- raw product request
- matched catalog item when available
- brand/model/variant
- storage/RAM/color
- condition/PTA preference
- budget
- quantity
- urgency
- customer/contact consent
- channel
- salesperson
- follow-up
- outcome
- lost-sale reason
- notes

Statuses:

- new
- contacted
- sourcing
- available
- customer_notified
- converted_to_sale
- not_interested
- closed

Demand must remain usable even without a catalog match.

Duplicate requests must remain visible historically while forecast deduplication prevents artificial inflation.

Support conversion to:

- product/catalog entry
- quotation or reservation
- supplier inquiry
- purchase recommendation
- sale

---

# 16. Expenses, Receivables, Payables and Financial Ledger

Implement:

- expense categories and expenses
- payment source
- evidence/attachment
- approval where required
- supplier payables
- supplier payments
- customer receivables
- receivable payments
- owner capital injections
- owner withdrawals
- cash and bank movements
- immutable financial entries linked to source transactions

Required accounting distinctions:

- sales revenue is not cash balance
- inventory purchase is not immediate COGS
- COGS is recognized when stock is sold
- owner withdrawal is not an expense
- owner capital is not revenue
- principal sent/withdrawn in external services is not profit

Required calculations:

```text
sales_gross_profit = net_sales_revenue - COGS
service_profit = service_fees - provider_charges - direct_service_expenses
operating_profit = sales_gross_profit + service_profit + other_income - operating_expenses - recorded_losses
```

Every ledger entry must link to:

- source type
- source ID
- account/category
- amount
- direction
- branch
- date
- actor
- description
- idempotency/source key

Prevent duplicate posting.

---

# 17. Reports, Dashboard and Business Intelligence

Every dashboard metric must drill down to source records and show its definition.

Required reports:

- daily, weekly and monthly sales
- gross profit and margin
- service transactions and service profit
- expenses
- management profit and loss
- cash flow and cash reconciliation
- inventory valuation
- inventory aging
- stock movement
- low/out-of-stock
- product profitability
- sales by product, brand, category and condition
- customer demand and lost sales
- supplier/purchase performance
- receivables and payables
- returns and exchanges
- cashier variance
- audit and data-quality exceptions

Required dashboard insights:

- what happened
- why it matters
- likely source/cause
- recommended action
- source drill-down

Do not confuse sales, cash and profit.

---

# 18. Deterministic Reorder Recommendations

Build a deterministic and versioned engine before any LLM explanation.

Use:

- 7/30/90-day sales
- qualified unmet demand
- available/reserved/inbound stock
- stockout days
- sales trend
- actual margin
- supplier lead time and reliability
- aged stock
- return/defect rate
- budget
- protected liquidity reserve
- concentration limits

Each recommendation must show:

- product/variant
- recommended quantity
- available/reserved/inbound
- estimated investment
- expected selling price
- expected gross profit
- expected time to sell
- score
- confidence
- reasons
- risks
- suggested supplier
- remaining budget impact

Recommendations may only create a draft purchase order after owner action.

Do not auto-approve or auto-order.

Store:

- algorithm version
- configuration snapshot
- input window
- feature values
- generated quantity
- owner decision
- final quantity
- linked PO
- later performance/evaluation

An optional LLM may later explain prepared metrics in English or Urdu, but it must not invent or alter quantities or financial numbers.

---

# 19. Database Implementation Requirements

Keep all Prisma/database work inside `database/`.

Recommended structure:

```text
database/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── seeds/
├── scripts/
├── fixtures/
├── diagrams/
└── README.md
```

Implement normalized equivalents of:

- organizations
- branches
- stock_locations
- users
- roles
- permissions
- user_roles
- role_permissions
- user_scope_access
- categories
- brands
- product_models
- product_variants
- product_aliases
- product_barcodes
- customers
- suppliers
- supplier_products
- supplier_quotes
- purchase_orders
- purchase_order_lines
- goods_receipts
- goods_receipt_lines
- serialized_inventory_units
- stock_batches
- inventory_movements
- stock_balances/read models
- reservations
- stock_counts
- stock_adjustments
- sales
- sale_lines
- payments
- payment_allocations
- returns
- return_lines
- refunds
- external_service_providers
- external_service_types
- external_fee_rules
- external_transactions
- cash_sessions
- cash_movements/session entries
- cash_reconciliations
- expense_categories
- expenses
- receivables
- payables
- customer_demand_requests
- demand_items/follow-ups
- financial_accounts
- financial_entries
- daily_product_metrics
- recommendation_runs
- purchase_recommendations
- recommendation_decisions
- notifications
- tasks
- documents/attachments
- number_sequences
- application_settings
- audit_events
- outbox_events where justified

You may rename or combine entities when the result is cleaner and remains normalized, but do not remove required behavior.

Use:

- primary/foreign keys
- unique constraints
- check constraints where Prisma/PostgreSQL permits
- meaningful indexes
- explicit delete/restrict behavior
- created/updated timestamps
- optimistic version fields for mutable drafts
- immutable snapshots for posted records

Create:

```text
docs/diagrams/system-architecture.mmd
docs/diagrams/database-erd.mmd
docs/diagrams/purchase-to-stock.mmd
docs/diagrams/sale-posting.mmd
docs/diagrams/external-service-transaction.mmd
docs/diagrams/daily-cash-closing.mmd
docs/DATABASE_DICTIONARY.md
```

---

# 20. API Requirements

Use versioned REST endpoints, for example:

```text
/api/v1/auth
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/catalog
/api/v1/products
/api/v1/inventory
/api/v1/serialized-units
/api/v1/suppliers
/api/v1/purchases
/api/v1/goods-receipts
/api/v1/sales
/api/v1/payments
/api/v1/returns
/api/v1/customers
/api/v1/demand
/api/v1/external-services
/api/v1/external-transactions
/api/v1/cash-sessions
/api/v1/expenses
/api/v1/receivables
/api/v1/payables
/api/v1/reports
/api/v1/recommendations
/api/v1/settings
/api/v1/audit
/api/v1/health
```

Every endpoint must include, where applicable:

- authentication
- permission and scope checks
- validation
- stable error code
- correct HTTP status
- pagination
- filtering
- searching
- sorting
- idempotency
- transaction handling
- audit behavior
- OpenAPI documentation

Do not expose ORM models directly as public API contracts.

---

# 21. Frontend Implementation Requirements

Use the prototype and `02_DESIGN.md` as the UX reference, but connect every production route to real APIs.

Do not replace the approved experience with a generic admin dashboard.

Required production areas:

- login
- owner dashboard
- POS
- sale review and receipt
- sales history/detail
- returns/exchanges
- products and variants
- IMEI/serialized inventory
- inventory ledger
- suppliers
- purchases and receiving
- customers
- demand capture and follow-up
- external send/withdraw transactions
- fee-rule configuration
- cash sessions and closing
- expenses
- receivables/payables
- reports
- reorder recommendations
- users and permissions
- settings
- audit logs

Every data screen must include:

- real API integration
- loading state
- empty state
- error state
- validation messages
- success feedback
- permission-aware actions
- search/filter/sort where useful
- pagination for large lists
- responsive behavior
- keyboard accessibility
- destructive-action impact confirmation

Preserve counter-speed patterns and keyboard shortcuts where practical.

Remove production dependencies on:

- hardcoded records
- fake charts
- mock service workers used as final APIs
- buttons without actions
- localStorage as the business source of truth
- placeholder totals

---

# 22. Critical Transaction Boundaries

Use PostgreSQL transactions for at least:

## Purchase receiving

- goods receipt
- inventory units/batches
- movement ledger
- cost allocation
- PO received totals/status
- payable effect
- audit

## Sale posting

- sale and line snapshots
- inventory validation and locking
- payments/allocations/receivable
- inventory movement
- serialized state change
- COGS and gross profit
- financial entries
- audit

## Return/refund/exchange

- return records
- unit state or stock quantity
- refund/credit
- revenue and COGS adjustment
- financial entries
- audit

## External service posting

- fee calculation snapshot
- provider/customer amounts
- cash-session impact
- financial entries
- audit

## Cash-session closing

- expected totals
- counted amount
- variance
- status transition
- review metadata
- audit

Never rely on frontend totals for these operations. Recalculate and validate on the server inside the transaction.

Use safe row locks, atomic updates or unique constraints to prevent two users from selling/reserving the same IMEI.

---

# 23. Non-Negotiable Rules

1. No duplicate normalized IMEI or required serial.
2. No negative stock.
3. A physical unit has one active state and one location.
4. A sold unit cannot be sold again.
5. A PO does not create available stock.
6. Receiving creates available or controlled stock.
7. Every stock change creates a movement.
8. Direct stock-counter editing is prohibited.
9. Posted sales and receipts cannot be silently edited or deleted.
10. Corrections use controlled workflows.
11. Money uses integer minor units, never floating point.
12. Historical profit uses captured COGS.
13. Sale, payment, stock and ledger effects are atomic.
14. Payment plus receivable must reconcile to the sale total.
15. The external-service principal amount is not revenue or profit.
16. Cash mismatch is recorded, not hidden.
17. Customer demand can be recorded without a catalog match.
18. Recommendation numbers are deterministic and versioned.
19. No recommendation auto-approves a PO.
20. Authorization is enforced on the backend.
21. Cross-scope data access is blocked.
22. Sensitive overrides require reason and audit.
23. Secrets do not enter Git.
24. Do not reset or delete staging/production data without explicit approval.
25. Do not remove tests to make CI pass.
26. Do not claim completion without executed evidence.

---

# 24. Testing Requirements

Create meaningful automated tests.

## Unit tests

At minimum:

- IMEI normalization
- duplicate IMEI rules
- inventory-state transitions
- stock calculation
- fee calculation for send/withdrawal
- service profit
- sales gross profit
- discount/minimum-margin rules
- return/refund calculation
- cash reconciliation
- permission decisions
- recommendation scoring and quantity
- budget/liquidity guardrails

## Integration tests with PostgreSQL

At minimum:

- PO does not increase stock
- partial receiving
- duplicate IMEI rollback
- purchase receiving and payable effect
- serialized sale
- accessory sale
- split payment
- payment mismatch rejection
- simultaneous same-IMEI sale
- duplicate sale idempotency
- sale return and inspection state
- external transaction posting
- cash-session expected closing
- financial-entry idempotency
- branch/scope restriction

## E2E tests

At minimum:

1. login;
2. create supplier;
3. create catalog product/variant;
4. create PO;
5. receive serialized and quantity stock;
6. complete a phone sale;
7. complete an accessory sale;
8. print/view receipt;
9. record a send transaction;
10. record a withdrawal transaction;
11. record an expense;
12. create unavailable demand;
13. close a cash session;
14. process a return;
15. view daily report;
16. view recommendation;
17. verify unauthorized action is blocked.

Also run:

- lint
- format check
- TypeScript typecheck
- unit tests
- integration tests
- E2E tests
- migration-from-clean-database test
- frontend production build
- backend production build

Do not write “tests should pass.” Run commands and report exact results.

---

# 25. Implementation Sequence

Complete these slices in order.

## Slice 0 — Audit and repository foundation

- repository and prototype audit
- conflict/gap analysis
- workspace setup
- clean root folders
- environment validation
- Docker PostgreSQL
- shared config/contracts
- lint/typecheck/test baseline
- logging, request IDs and health endpoints

## Slice 1 — Authentication and access

- organization
- branch/location
- users
- roles/permissions
- owner account
- secure login/session
- server authorization
- audit actor

## Slice 2 — Catalog

- categories
- brands
- models
- variants
- SKU/barcodes
- attributes
- aliases
- tracking type
- product search
- frontend and tests

## Slice 3 — Inventory foundation

- serialized units
- stock batches
- inventory states
- movement ledger
- stock balances
- IMEI uniqueness
- inventory search/detail/timeline
- stock count/adjustment

## Slice 4 — Suppliers, purchasing and receiving

- suppliers
- POs
- approval
- partial receiving
- serialized receiving
- accessory receiving
- cost/landed cost
- payables
- purchase returns

## Slice 5 — POS and sales

- search
- cart
- IMEI selection
- customer/walk-in
- discounts
- payment/split payment
- atomic posting
- invoice/receipt
- idempotency and concurrency

## Slice 6 — Returns and exchanges

- original-sale lookup
- return eligibility
- inspection state
- partial return/refund
- exchange
- inventory and financial effects

## Slice 7 — External services

- providers
- send and withdrawal transactions
- fee rules
- cash direction
- service profit
- external reference and idempotency

## Slice 8 — Cash sessions and expenses

- open shift
- expected cash
- expenses and cash movements
- counted close
- variance/reason
- manager review/reopen
- daily closing report

## Slice 9 — Customer demand

- quick demand capture
- unmatched requests
- deduplication for forecasting
- follow-up
- alternatives
- conversion to sale
- demand reports

## Slice 10 — Finance and reporting

- receivables/payables
- financial ledger
- gross profit
- service profit
- operating profit
- cash flow
- inventory value
- daily/weekly/monthly reports

## Slice 11 — Reorder intelligence

- daily metrics
- deterministic formulas
- budget allocation
- confidence/reasons/risks
- owner decision
- draft PO creation
- recommendation evaluation history

## Slice 12 — Dashboard and operational command center

- owner KPIs
- alerts
- tasks
- data-quality exceptions
- drill-down consistency

## Slice 13 — Launch hardening

- opening stock import template and dry run
- migration rehearsal
- backup automation
- restore drill
- security review
- monitoring
- deployment
- UAT
- rollback/runbook

## Slice 14 — Approved advanced modules

Only after the core is stable:

- used-device intake
- warranty
- repairs
- notification adapters
- optional AI explanation
- external compliance integrations

Continue through all required slices automatically. Do not stop after planning or after generating the folder structure.

---

# 26. Seed Data

Create realistic but synthetic development data:

- Lahore shop organization/branch/location
- owner
- manager
- salesperson
- cashier
- purchaser/inventory staff
- accountant read-only user
- phone/accessory categories
- 10–15 relevant brands
- a controlled catalog of realistic variants
- serialized phones with synthetic IMEIs
- quantity accessories
- suppliers
- customers using synthetic Pakistan phone numbers
- purchases and goods receipts
- sales and payments
- external providers and fee rules
- send/withdrawal samples
- cash sessions
- expenses
- demand requests
- recommendation data

Never use real CNICs, customer data, production secrets or reusable production passwords.

Document development credentials safely in local documentation and ensure they cannot be enabled unchanged in production.

---

# 27. Security and Reliability

Implement:

- secure password hashing
- secure cookies/session handling
- CSRF protection where applicable
- authentication rate limits
- backend RBAC
- branch/location scope
- input validation
- output escaping
- safe database queries
- safe file validation
- private document access
- log redaction
- secret scanning
- dependency/container scanning where practical
- least-privilege DB account
- production debug disabled
- audit integrity
- health/readiness checks
- error monitoring adapter
- backup and restore scripts

Do not expose stack traces, secrets, tokens, database credentials or restricted personal information to normal users.

---

# 28. Progress and Memory Protocol

Maintain `BUILD_STATUS.md`:

```markdown
# Build Status

## Current Slice
## Completed and Verified
## In Progress
## Remaining
## Database Migrations
## APIs Added
## Frontend Routes Added
## Tests Run and Exact Results
## Known Issues
## Assumptions
## Risks
## Next Smallest Executable Step
```

After each meaningful slice:

1. record files changed;
2. record migrations;
3. record commands executed;
4. report exact pass/fail results;
5. record manual verification still required;
6. update `mobile-shop-automation-blueprint/07_MEMORY.md` only with verified facts;
7. do not erase historical decisions silently;
8. add an ADR for major architecture changes;
9. create a clean Git commit when safe.

Do not use “done” when work is only generated but not run.

---

# 29. Required Pre-Slice Response

Before each slice, briefly provide:

## Current State

- relevant files inspected
- existing implementation
- schema/API/UI/tests
- conflicts or risks

## Slice Objective

- exact user/business outcome
- in scope
- out of scope

## Implementation Plan

- database changes
- backend modules/endpoints
- frontend routes/components
- permissions
- transactions
- audit
- tests
- migration risk

## Acceptance Criteria

Then proceed with implementation automatically unless there is a true blocker.

Do not ask for information already available in the repository.

---

# 30. Required Completion Report Per Slice

After each slice, report:

## Implemented

- business behavior
- frontend files/routes
- backend modules/APIs
- database schema/migrations

## Verification

- commands run
- exact test counts/results
- builds
- manual checks still needed

## Data and Security

- transaction behavior
- authorization
- audit
- migration/data impact

## Remaining

- defects
- assumptions
- deferred work
- next slice

Then continue.

---

# 31. Final Verification and Deliverables

Before declaring the system production-ready:

1. clone/start from a clean environment;
2. install dependencies through the root workspace;
3. start PostgreSQL and required services through Docker Compose;
4. apply all migrations from zero;
5. run seeds;
6. start frontend and backend;
7. test all initial roles;
8. execute every critical purchase-to-sale flow;
9. test serialized and quantity inventory;
10. verify external send/withdrawal fees and service profit;
11. verify cash-session reconciliation;
12. manually verify known financial examples;
13. verify daily/weekly/monthly reports;
14. verify dashboard drill-down consistency;
15. verify permissions and data scope;
16. verify audit events;
17. verify backup and restore in a test environment;
18. run lint, typecheck, unit, integration and E2E tests;
19. run frontend/backend production builds;
20. fix critical and high-severity issues.

Create final documents:

```text
docs/FINAL_VERIFICATION_REPORT.md
docs/KNOWN_LIMITATIONS.md
docs/LOCAL_SETUP_GUIDE.md
docs/DEPLOYMENT_GUIDE.md
docs/OPERATIONS_RUNBOOK.md
docs/BACKUP_AND_RESTORE_GUIDE.md
docs/USER_GUIDE.md
docs/API_GUIDE.md
docs/DATABASE_DICTIONARY.md
docs/SECURITY_REVIEW.md
docs/UAT_CHECKLIST.md
docs/RELEASE_NOTES.md
```

The final repository must contain:

- functional production frontend
- functional production backend
- PostgreSQL schema and migrations
- seed data
- authentication and RBAC
- catalog
- serialized and quantity inventory
- suppliers and purchasing
- goods receiving
- POS, payments and receipts
- returns and exchanges
- external send/withdrawal transaction recording
- configurable fee rules
- cash sessions and daily reconciliation
- expenses, receivables and payables
- customer demand capture
- financial ledger
- reports
- deterministic reorder recommendations
- audit logs
- automated tests
- Docker configuration
- backup/restore scripts
- CI configuration
- architecture and operating documentation

---

# 32. Start Now

Start with the mandatory repository audit.

Do not create a new prototype.
Do not return only a plan.
Do not build only the frontend.
Do not build only the backend.
Do not create database tables without complete workflows.
Do not rewrite the approved UI without a documented reason.
Do not stop after scaffolding.

Inspect the actual repository and prototype, create the audit documents, establish the clean `frontend/`, `backend/`, `database/` and `shared/` structure, and then immediately begin Slice 0 followed by each production slice in order.

The target is a secure, traceable, tested and deployable MobileShop OS, not a demonstration.
