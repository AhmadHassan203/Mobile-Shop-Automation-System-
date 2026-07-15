# Product and UX Design Specification

## 1. Design principles

1. **Counter-speed first:** common tasks should take as few taps as possible.
2. **Exceptions over decoration:** surface stockouts, missing IMEIs, overdue payments and pending work.
3. **Explain every number:** users can drill from a dashboard metric to source transactions.
4. **Prevent errors before saving:** block duplicate IMEIs, negative stock and invalid prices.
5. **Separate draft from posted:** drafts are editable; posted transactions are corrected through controlled workflows.
6. **Mobile-friendly, desktop-efficient:** responsive PWA with keyboard shortcuts and barcode-scanner support.
7. **Evidence before AI:** recommendations show formulas and underlying records.
8. **Urdu-ready:** layout and content system should support future bilingual and RTL requirements.

## 2. Information architecture

Primary navigation:

- Dashboard
- Sell
- Demand
- Inventory
- Purchases
- Customers
- Suppliers
- Returns / Warranty
- Repairs
- Finance
- Intelligence
- Reports
- Tasks
- Settings

On a small screen, keep `Sell`, `Demand`, `Inventory`, `Tasks` and `More` in bottom navigation.

## 3. Global patterns

### Global search
Search by:

- product/model
- SKU/barcode
- IMEI/serial
- customer name/phone
- supplier
- invoice number
- purchase order
- repair/warranty ticket

### Status badges
Use consistent statuses and avoid using color alone. Each badge includes text and icon.

### Money
Always show `PKR` or `Rs.` consistently. Use thousands separators. Hide cost/profit from unauthorized roles.

### Dates
Show local date/time in Asia/Karachi and preserve exact timestamps in details.

### Confirmation
High-risk actions require a summary of impact, not a generic "Are you sure?"

Example:
"Posting this sale will remove IMEI X from available stock, record PKR 245,000 revenue and PKR 18,500 gross profit."

## 4. Core screens

## 4.1 Owner dashboard

### Header
- business date
- branch/location selector
- open/closed cash-session state
- alerts
- global search

### KPI row
- sales
- gross profit
- expenses
- estimated operating profit
- cash position
- inventory value

### Owner attention
Ranked cards:

1. Out of stock with active demand
2. Reorder recommendations awaiting approval
3. High-value aged stock
4. Missing/invalid IMEI checks
5. Supplier orders delayed
6. Receivables/payables due
7. Returns/warranties pending
8. Closing mismatch

### Demand and buying
- top requested unavailable items
- demand by price band
- recommended purchase budget
- expected gross profit
- confidence and risk

### Drill-down behavior
Clicking any metric opens a filtered report with exact records and calculation definition.

## 4.2 Point-of-sale screen

Layout for desktop/tablet:

- left: search and product results
- center: cart
- right: totals, customer and payment

Flow:

1. Scan/search item.
2. For serialized product, choose/scan specific IMEI.
3. Add optional accessories or service.
4. Select customer or quick walk-in.
5. Apply permitted discount with reason.
6. Select payment method(s).
7. Review profit warning if allowed.
8. Post sale.
9. Print/share receipt.

Keyboard shortcuts:

- `/` focus search
- `F2` customer
- `F4` discount
- `F8` payment
- `Ctrl+Enter` review/post
- `Esc` close dialog

## 4.3 Quick demand capture

The quick form must fit in one drawer/modal:

- product text or catalog match
- variant and condition
- customer budget
- quantity
- availability result
- customer phone, optional
- follow-up
- note

After save, show:

- matching available alternatives
- expected next stock date if known
- ability to create reservation or quotation
- demand count for similar request

## 4.4 Product detail

Tabs:

- Overview
- Available units
- Sales
- Demand
- Purchases
- Price history
- Returns/defects
- Recommendations
- Audit

Overview includes:

- model/variant attributes
- current selling price
- average cost
- available/reserved/inbound
- days of cover
- 30-day sales
- 30-day unmet demand
- margin
- aging
- recommended action

## 4.5 Inventory unit detail

For serialized items:

- product and variant
- IMEI1/IMEI2/serial
- PTA verification status and date
- current state/location
- purchase source and cost
- sale/customer link when sold
- condition and battery health
- warranty
- inspection photos
- full movement timeline
- used-device verification references
- risk flags

## 4.6 Purchase recommendation screen

Each row must display:

- product
- available / inbound / reserved
- 30-day sales
- unmet demand
- stockout days
- lead time
- target stock
- recommended quantity
- estimated cost
- expected gross profit
- confidence
- reasons
- risks
- suggested supplier

Owner actions:

- accept
- reduce quantity
- increase with reason
- defer
- reject with reason
- create draft purchase order

Budget panel:

- purchase budget
- selected investment
- expected return
- cash remaining
- risk concentration by brand/price band
- capital tied in aged stock

## 4.7 Daily closing

Checklist:

- opening cash
- cash sales
- cash refunds
- expenses paid from drawer
- cash removed/deposited
- expected closing cash
- counted cash
- variance
- reason
- submitted by
- approved by

The system should not silently change sales to fix a cash mismatch.

## 5. Empty states

Every empty state should explain:

- what is missing
- why it matters
- the next action

Example:
"No unavailable customer requests have been recorded yet. Use Quick Demand whenever a customer asks for an item you cannot sell today."

## 6. Error states

Errors must preserve user input and explain the exact correction.

Bad:
"Invalid data."

Good:
"IMEI 352... already belongs to inventory unit INV-1042 received on 12 July 2026."

## 7. Responsive behavior

### Desktop
Dense tables, keyboard control, split panes.

### Tablet
Primary counter device; large tap targets and optional barcode scanner.

### Mobile
Owner review, quick inquiry, stock lookup, notifications and approvals. Complex bulk receiving may remain desktop/tablet optimized.

## 8. Accessibility

- visible focus
- keyboard navigation
- semantic labels
- contrast compliance
- icons paired with text
- no status conveyed only by color
- printable receipts readable in grayscale

## 9. Suggested visual language

- clean retail operations interface
- neutral background
- one primary accent
- green only for confirmed positive results
- red only for loss/blocking risk
- amber for attention
- compact data tables
- plain language, not accounting jargon where avoidable

## 10. Design deliverables per phase

For every feature, produce:

1. user flow
2. wireframe
3. states: loading, empty, error, success
4. field definitions
5. validation
6. permissions
7. analytics events
8. acceptance criteria
9. responsive behavior
10. audit impact
