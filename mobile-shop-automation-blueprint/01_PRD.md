# Product Requirements Document

## 1. Product summary

MobileShop OS is a point-of-sale, inventory, purchasing, customer-demand and business-intelligence platform for a Lahore mobile shop. It is designed for a single owner initially but must support future staff, branches and warehouses without redesigning the core data model.

## 2. Problem statement

A mobile shop loses money and opportunities when:

- sales and purchases are recorded inconsistently
- phones cannot be traced by IMEI
- accessories are counted manually
- customer requests for unavailable models are forgotten
- the owner does not know real gross margin or net operating profit
- fast-moving products run out
- slow-moving stock traps capital
- supplier prices and lead times are not compared
- returns, warranties and used phones have incomplete histories
- buying decisions are based on memory rather than evidence

## 3. Product goals

### 3.1 Operational goals

- Record every stock and money movement.
- Make checkout fast enough for a physical retail counter.
- Track phones and other serialized items individually.
- Track accessories by SKU and quantity.
- Keep sale, payment, inventory and profit records consistent.
- Provide daily owner tasks and exception alerts.

### 3.2 Intelligence goals

- Measure what customers asked for, including unavailable products.
- Identify products, variants and price bands with the highest demand.
- Rank products for reordering.
- Recommend quantities within a configurable purchase budget.
- Explain why each recommendation was generated.
- Separate high sales from high profit.
- Identify stockouts, dead stock, margin leakage and supplier issues.

### 3.3 Quality goals

- No negative stock.
- No duplicate IMEI or serial.
- No silent editing of posted financial transactions.
- Complete auditability.
- Reliable backup and restore.
- Role-based access for future staff.
- Responsive PWA usable on desktop, tablet and mobile.

## 4. Users and roles

### Owner / Super Admin
Full access to configuration, financials, purchase approval, price overrides, reports, users, audit log and integrations.

### Manager
Sales, purchases, inventory, returns, customers, reports and limited configuration. Cannot alter protected financial history or system-wide security.

### Salesperson
Create quotations, inquiries, reservations and sales. View allowed prices and stock. Cannot see supplier cost or full profit unless granted.

### Purchaser
Manage suppliers, vendor quotes, purchase orders and receiving. Cannot finalize payment without permission.

### Cashier
Receive payments, open/close cash drawer, issue receipts and process permitted returns.

### Technician
View and update assigned repair or inspection jobs. Cannot view unrelated financial data.

### Accountant / Read-only Finance
View reports, expenses, payables, receivables and exports. No operational edits.

The initial release may expose only Owner, but permissions must be modeled from the beginning.

## 5. Core modules

## 5.1 Dashboard and daily command center

The dashboard must show:

- today's sales revenue
- today's gross profit
- today's expenses
- estimated net operating result
- cash, bank and digital payment totals
- outstanding receivables and payables
- low stock
- products currently out of stock with active demand
- stock older than configured thresholds
- pending purchase orders
- pending customer follow-ups
- pending returns, warranties and repairs
- recommended purchase budget allocation
- data-quality exceptions

Every metric must link to the underlying transactions.

## 5.2 Product catalog

Support:

- category, subcategory, brand, model and variant
- RAM, storage, color and region
- new, used, open-box and refurbished conditions
- PTA/IMEI status fields
- official/local warranty, shop warranty or no warranty
- serialized and non-serialized stock
- multiple barcodes
- compatible accessories
- configurable price bands
- product images and specifications
- active/inactive state
- aliases for customer-request matching

A catalog product is not the same as an inventory unit. For example, "iPhone 17 Pro Max 256 GB Black" is a variant, while each physical phone is a unique inventory unit with IMEI and cost.

## 5.3 Suppliers and purchasing

Support:

- supplier profiles and contacts
- vendor price quotations
- purchase requisitions
- purchase orders
- partial receiving
- goods-received notes
- per-unit IMEI capture
- batch receiving for accessories
- landed cost allocation
- supplier invoice and payment terms
- purchase returns
- payables
- supplier lead time and reliability
- supplier-wise price history

Purchase status:
`draft -> approved -> ordered -> partially_received -> received -> closed/cancelled`

## 5.4 Inventory

Support:

- store, warehouse and virtual locations
- available, reserved, sold, returned, defective, repair, warranty and quarantined states
- IMEI1, IMEI2, serial and barcode
- quantity by SKU for non-serialized goods
- transfers
- reservations
- stock counts and adjustments
- adjustment reasons and approval
- inventory valuation
- aging and days in stock
- stock movement ledger
- stock alerts

Every adjustment must create a ledger entry; direct quantity editing is prohibited.

## 5.5 Customer demand and missed sales

Create an inquiry in under 20 seconds.

Fields:

- customer name and phone, optional for anonymous walk-ins
- request date and channel
- brand, model, variant, storage, color and condition
- desired price or budget range
- PTA preference
- urgency
- quantity
- trade-in interest
- outcome
- lost-sale reason
- salesperson note
- follow-up date
- consent to contact

Outcomes:

- sold immediately
- reserved
- quotation sent
- unavailable
- price too high
- customer postponed
- bought elsewhere
- incompatible requirement
- invalid/fraudulent
- unknown

Unavailable demand must count toward reorder intelligence. Duplicate requests by the same customer for the same item within a configurable period should be deduplicated for forecasting while remaining visible in history.

## 5.6 Sales and point of sale

Support:

- barcode, SKU, model, IMEI and customer search
- cart
- quotation
- reservation with expiry
- sale
- discount with reason
- bundled accessories
- split payments
- cash, bank transfer, card and digital wallet methods
- customer credit when authorized
- tax and invoice fields
- receipt printing and WhatsApp-ready PDF
- salesperson attribution
- cost of goods and gross profit
- returns, exchanges and refunds
- sale cancellation before posting only

Posted sales cannot be edited. Corrections use return, refund, exchange, debit note or credit note workflows.

## 5.7 Used-device intake and trade-in

Support:

- seller identity and contact
- CNIC or approved identity reference, subject to legal/privacy policy
- seller consent and declaration
- device model and variant
- IMEI verification status
- Punjab Police e-Gadget reference/status where applicable
- physical condition checklist
- display, touch, cameras, speakers, microphone, ports and network tests
- battery health
- repair/opening history
- accessories and box
- photos
- quoted value
- approved purchase value
- expected resale value
- risk flags
- quarantine until checks pass
- purchase and resale margin

The system must not mark a used device as saleable until required verification and inspection gates pass.

## 5.8 Returns, warranty and repair

Support:

- return eligibility based on policy
- original sale lookup
- device/IMEI matching
- reason and evidence
- condition on return
- restock, quarantine, supplier warranty or write-off outcome
- customer warranty claims
- supplier warranty claims
- repair jobs
- parts and labor
- technician notes
- promised and actual completion dates
- customer notifications

Repair can be deferred if the shop does not offer repairs at launch.

## 5.9 Finance and cash control

The system must calculate management-level business performance:

- sales revenue
- discounts
- returns
- COGS
- gross profit
- gross margin
- operating expenses
- estimated net operating profit
- cash inflow/outflow
- cash drawer balance
- bank/digital payment balance
- receivables
- payables
- inventory value
- owner withdrawals and capital injections
- supplier payments
- customer refunds

It must distinguish profit from cash. Buying stock reduces cash but does not become COGS until the item is sold.

## 5.10 Purchase intelligence

For each product or variant, show:

- sales in 7, 30 and 90 days
- inquiries and missed demand
- available, reserved and inbound stock
- stockout days
- average sale price
- average unit cost
- gross profit and margin
- return/defect rate
- supplier lead time
- days of cover
- aging stock
- recommended quantity
- estimated investment
- expected gross profit
- confidence score
- plain-language reasons
- risk warnings

No purchase order may be created automatically without owner approval.

## 5.11 Reports

Required reports:

- daily sales and profit
- sales by product, brand, category, condition and price band
- gross margin by product
- purchase and supplier report
- inventory valuation
- inventory aging
- stock movement
- stockout and lost-sales report
- customer demand report
- reorder recommendation report
- cash flow
- expenses
- receivables/payables
- returns and warranty
- salesperson performance
- audit report
- data-quality report

Export to CSV/XLSX/PDF can be phased, but the data model must support it.

## 6. Notifications and automations

- low-stock alert
- stockout with demand alert
- follow-up reminder
- reservation expiry
- purchase order overdue
- supplier payment due
- customer receivable due
- inventory aging alert
- unusual discount alert
- negative-margin prevention
- return/warranty deadline
- daily owner summary
- weekly buying plan
- monthly business review

Initial notifications may be in-app. WhatsApp/SMS/email integrations come later.

## 7. Non-functional requirements

### Reliability
- Transactions for sale and receiving must be atomic.
- Idempotency is required for payment and integration callbacks.
- Backup restore must be tested.

### Performance
- Product search response target under 500 ms for normal shop volume.
- Sale posting target under two seconds under normal connectivity.
- Dashboard reports may use precomputed aggregates.

### Security
- Secure sessions
- rate limiting
- role-based authorization
- encrypted transport
- protected sensitive identity documents
- immutable audit trail
- secret management outside source control

### Localization
- PKR
- Asia/Karachi timezone
- English first
- Urdu labels or bilingual UI later
- Pakistani phone number formatting
- A4 and thermal receipt formats

### Scalability
Start with one shop and one stock location, but include `organization_id`, `branch_id` and `location_id` in the correct domains to avoid future data migration.

## 8. Out of scope for the first release

- autonomous purchasing
- marketplace scraping without permission
- full general ledger and statutory accounting
- payroll
- native Android/iOS apps
- multiple legal entities
- advanced machine-learning forecasting
- franchise management
- biometric attendance
- microservices
- blockchain

## 9. Product KPIs

- percentage of sales recorded in system
- inventory accuracy
- missing/duplicate IMEI count
- gross margin accuracy
- inquiry capture rate
- missed-demand conversion rate
- stockout rate
- sell-through rate
- inventory turnover
- aged inventory value
- return and defect rate
- supplier on-time rate
- recommendation acceptance rate
- forecast error
- number of manual corrections
- daily closing completion rate

## 10. Acceptance criteria for first production release

- At least 20 representative phone/accessory SKUs can be loaded.
- A serialized phone can be purchased, received, sold, returned and traced.
- A non-serialized accessory can be purchased and sold by quantity.
- A customer inquiry for an unavailable device affects the demand report.
- Gross profit is calculated from actual unit cost.
- Cash and non-cash payments reconcile with sales.
- Reorder suggestions show quantity, investment and reasons.
- All critical actions appear in the audit log.
- Backup and restore pass a documented test.
