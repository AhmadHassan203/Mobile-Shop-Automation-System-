You are working inside the existing MobileShop OS interactive prototype.

First inspect the complete prototype before changing anything, especially:

- index.html
- styles.css
- app.js
- README.md
- current localStorage state structure
- navigation, modal, drawer, table, card and form patterns

Do not rebuild the prototype from scratch.

Extend the existing prototype with a new interactive module called:

# Digital Services

The purpose is to test the manual operational flow before backend development.

The cashier completes the real transaction externally using an official mobile application such as JazzCash, Easypaisa, a banking app, utility-bill app or telecom retailer app.

This prototype only records the transaction manually.

Do not implement any external API integration.

---

# 1. Preserve existing functionality

Do not break or remove:

- Dashboard
- Point of Sale
- product search
- IMEI selection
- sales flow
- customer demand
- inventory
- purchase orders
- receiving
- recommendations
- cash closing
- finance
- products
- localStorage persistence
- prototype reset

Follow the existing visual design and component patterns.

Do not introduce a new framework or build system.

Continue using the current vanilla:

- HTML
- CSS
- JavaScript
- localStorage

---

# 2. Add navigation

Add a new navigation group:

Digital Services

Include these pages:

- New Transaction
- Transaction History
- Service Balances
- Commission Report
- Reconciliation

The main navigation item should be prominent and easy for the cashier to access.

---

# 3. New Transaction screen

Create a simple, cashier-friendly transaction screen.

## Section A: Service selector

At the top, add:

Service
[Select Service ▼]

Options:

- JazzCash
- Easypaisa
- Bank Transfer
- Utility Bill
- Jazz Load
- Zong Load
- Other

When Utility Bill is selected, show:

- Bill Type
  - Electricity
  - Gas
  - Water
  - Internet
  - Telephone
  - Other

- Company / Provider
  - LESCO
  - SNGPL
  - WASA
  - PTCL
  - StormFiber
  - Other

- Consumer / Reference Number

When Jazz Load or Zong Load is selected, show:

- Customer Mobile Number
- Network
- Load or Bundle
- Optional package name

When Bank Transfer is selected, show:

- Bank Name
- Beneficiary Name
- Masked Account / IBAN Reference

For JazzCash and Easypaisa, show:

- Customer Mobile Number
- Optional customer name

---

# 4. Prominent transaction-direction cards

Below the service selector, display two large cards side by side:

## AMOUNT SENT

Subtitle:

Sent from shop wallet, account or provider float

Inside the card:

Amount
[PKR __________]

## AMOUNT RECEIVED

Subtitle:

Received into shop wallet, account or provider float

Inside the card:

Amount
[PKR __________]

Rules:

- The cards must be large and visually prominent.
- Only one direction can be active.
- Selecting one card must deselect and clear the other.
- Entering an amount in one card should activate that direction.
- Use clear visual active and inactive states.
- Do not use ambiguous labels such as only “Send” and “Receive”.
- Always describe the direction from the shop’s perspective.

Use internal values:

- SENT_FROM_SHOP
- RECEIVED_INTO_SHOP

---

# 5. Customer service-fee calculation

The shop charges its own fee.

Initial prototype rules:

## Amount Sent

Charge:

PKR 10 per PKR 1,000

Default formula:

Fee = Ceiling(Principal Amount / 1,000) × 10

Examples:

- PKR 1,000 → PKR 10
- PKR 1,500 → PKR 20
- PKR 2,000 → PKR 20
- PKR 2,200 → PKR 30

## Amount Received / Withdrawal

Charge:

PKR 20 per PKR 1,000

Default formula:

Fee = Ceiling(Principal Amount / 1,000) × 20

Examples:

- PKR 1,000 → PKR 20
- PKR 1,500 → PKR 40
- PKR 2,000 → PKR 40
- PKR 2,200 → PKR 60

Do not hard-code the rules only inside form rendering.

Create a reusable prototype fee-rule configuration structure.

Example:

```js
digitalServiceFeeRules: [
  {
    service: "JazzCash",
    direction: "SENT_FROM_SHOP",
    calculationMethod: "SLAB",
    blockSize: 1000,
    feePerBlock: 10,
    minimumFee: 10,
    active: true
  },
  {
    service: "JazzCash",
    direction: "RECEIVED_INTO_SHOP",
    calculationMethod: "SLAB",
    blockSize: 1000,
    feePerBlock: 20,
    minimumFee: 20,
    active: true
  }
]

Add equivalent default rules for:

Easypaisa
Bank Transfer

For Utility Bill, Jazz Load and Zong Load, allow a configurable flat fee, initially zero.

Also support these calculation methods in the prototype:

SLAB
PROPORTIONAL
FLAT
NONE

The user does not need to configure all rules from the main transaction form, but the data structure must support them.

6. Fee handling for Amount Sent

Example:

Principal Amount: PKR 1,000
Shop Service Fee: PKR 10
Customer Gives Cash: PKR 1,010

System preview:

Physical cash increases by PKR 1,010
Provider float decreases by PKR 1,000
Shop fee revenue increases by PKR 10
7. Fee handling for Amount Received

Add a field:

Fee Collection Method

Options:

Deduct from Customer Payout
Collect Separately

Default:

Deduct from Customer Payout

Deduct from payout example

Principal received digitally: PKR 1,000
Service fee: PKR 20
Cash given to customer: PKR 980

System preview:

Provider float increases by PKR 1,000
Physical cash decreases by PKR 980
Shop fee revenue increases by PKR 20
Collect separately example

Principal received digitally: PKR 1,000
Cash given to customer: PKR 1,000
Customer separately pays fee: PKR 20

System preview:

Provider float increases by PKR 1,000
Physical cash decreases by PKR 980 net
Shop fee revenue increases by PKR 20

Show the numbers clearly so the cashier can verify them before saving.

8. Additional fields

Below the direction and amount section, add:

Customer Name, optional
Customer Mobile Number
Customer / Account Reference
Provider Transaction ID
External Transaction Date and Time
Provider Gross Commission
Provider Commission Tax
Other Direct Charges
Status
Notes

Statuses:

SUCCESSFUL
PENDING
FAILED
REVERSED
DISPUTED

Default status:

SUCCESSFUL

Rules:

A successful transaction requires Provider Transaction ID.
Failed transactions must not affect cash, float, fee revenue or commission.
Pending transactions should appear separately and should not be treated as settled earnings.
Reversed transactions must reverse the original cash, float, fee and commission impact.
Do not store PIN, OTP, MPIN, password or biometric information.
9. Live financial preview

Before saving, show a prominent summary card.

For Amount Sent, show:

Principal Amount
Customer Service Fee
Customer Gives Cash
Provider Gross Commission
Commission Tax
Provider Net Commission
Other Direct Charges
Gross Service Earnings
Net Service Earnings
Physical Cash Increase
Provider Float Decrease

For Amount Received, show:

Principal Amount Received Digitally
Customer Service Fee
Fee Collection Method
Cash Given to Customer
Additional Cash Fee Received, where applicable
Provider Gross Commission
Commission Tax
Provider Net Commission
Other Direct Charges
Gross Service Earnings
Net Service Earnings
Physical Cash Decrease
Provider Float Increase

Use these formulas:

Provider Net Commission
=
Provider Gross Commission
- Provider Commission Tax
Gross Service Earnings
=
Customer Service Fee
+ Provider Gross Commission
Net Service Earnings
=
Customer Service Fee
+ Provider Net Commission
- Other Direct Charges

The principal amount must never be shown as revenue or profit.

10. Save transaction workflow

The Save Transaction button must first open a review modal.

The review modal should show:

service
direction
principal amount
customer service fee
customer cash paid or received
provider float impact
provider transaction ID
provider commission
net service earnings
status
cashier
timestamp

Buttons:

Back to Edit
Confirm and Save

After confirmation:

store the transaction in localStorage
update service balance
update physical cash impact
update earnings totals
add it to transaction history
show a success screen or success toast

Do not generate the final record before confirmation.

11. Digital-service data structure

Add a safe backward-compatible state structure.

Existing users may already have prototype data saved in localStorage.

Do not require them to reset localStorage.

On application load, initialize any missing properties.

Add structures similar to:

digitalServiceTransactions: [],
digitalServiceFeeRules: [],
digitalServiceBalances: {
  physicalCash: 0,
  jazzCashFloat: 200000,
  easypaisaFloat: 200000,
  bankBalance: 300000,
  jazzLoadFloat: 50000,
  zongLoadFloat: 50000,
  utilityBillFloat: 100000
}

Each transaction should preserve:

{
  id,
  service,
  subService,
  direction,
  principalAmount,

  feeRuleSnapshot: {
    calculationMethod,
    blockSize,
    feePerBlock,
    flatFee,
    minimumFee,
    maximumFee
  },

  customerServiceFee,
  feeCollectionMethod,

  customerCashPaid,
  customerCashReceived,
  customerPayout,

  providerGrossCommission,
  providerCommissionTax,
  providerNetCommission,
  otherDirectCharges,

  grossServiceEarnings,
  netServiceEarnings,

  physicalCashIn,
  physicalCashOut,
  providerFloatIn,
  providerFloatOut,

  customerName,
  customerPhone,
  customerReference,

  billType,
  billCompany,
  consumerReference,

  bankName,
  beneficiaryName,
  accountReference,

  network,
  packageName,

  providerTransactionId,
  externalTransactionAt,
  status,
  notes,

  cashierName,
  createdAt,
  reversalOfTransactionId
}

Use numbers consistently.

Do not use formatted PKR strings inside stored calculations.

12. Transaction History page

Create a transaction table with:

Transaction ID
Date and Time
Service
Direction
Principal Amount
Service Fee
Provider Commission
Net Earnings
Provider Reference
Cashier
Status
Action

Add filters:

date
service
direction
status
cashier

Actions:

View Details
Mark Pending as Successful
Reverse Transaction
Mark as Disputed

Reversal must:

create or preserve a clear reversal reference
reverse cash impact
reverse float impact
reverse service-fee revenue
reverse commission
keep the original transaction visible
prevent the same transaction from being reversed twice
13. Service Balances page

Show cards for:

Physical Cash
JazzCash Float
Easypaisa Float
Bank Balance
Utility Bill Float
Jazz Load Float
Zong Load Float

For each service show:

opening balance
amount sent today
amount received today
current balance
pending amount
last transaction time

Add low-balance warnings using prototype thresholds.

Example:

JazzCash Float below PKR 25,000
Physical Cash below PKR 50,000
14. Commission Report

Show:

total principal sent
total principal received
customer fees from sent transactions
customer fees from received transactions
provider gross commission
commission tax
provider net commission
other direct charges
net digital-service earnings

Allow grouping by:

service
direction
cashier
day
week
month

Show service-level cards:

JazzCash Net Earnings
Easypaisa Net Earnings
Bank Transfer Net Earnings
Utility Bill Net Earnings
Jazz Load Net Earnings
Zong Load Net Earnings
15. Reconciliation page

Show:

expected physical cash impact
current provider float balances
successful transaction count
pending transaction count
reversed transaction count
transactions missing provider references
calculated service earnings

Allow the cashier or owner to enter:

counted physical cash
counted JazzCash float
counted Easypaisa float
counted bank balance
counted load balances

Calculate variance for each balance.

Variance requires:

reason
cashier
timestamp

This prototype may store the reconciliation locally.

16. Dashboard integration

Add a Digital Services section to the existing owner dashboard.

Show:

Sent Today
Received Today
Customer Fees Today
Provider Net Commission
Net Digital-Service Earnings
Pending Transactions
Float Warnings

Add an action-queue item when:

a transaction is pending
provider reference is missing
float is low
reconciliation is incomplete

Do not mix principal amounts with normal sales revenue.

Add Digital Services earnings to financial reporting separately.

17. UX requirements

The New Transaction screen must be simple enough for a cashier.

Requirements:

clear service dropdown
two large direction cards
automatic fee calculation
large PKR amount display
no unnecessary technical terminology
live preview
clear customer payment or payout
review before save
success confirmation
usable at 1366px desktop width
responsive tablet behavior
keyboard-friendly amount entry
Enter should not accidentally save without review

Use the existing neutral white, grey and restrained-blue design.

Use semantic colors carefully:

blue for selected action
green for successful
amber for pending
red for failed/reversed/variance
18. Prototype test data

Add sample transactions:

JazzCash Amount Sent
Principal: PKR 10,000
Fee: PKR 100
Successful
Easypaisa Amount Received
Principal: PKR 5,000
Fee: PKR 100
Deduct from payout
Successful
LESCO electricity bill
Principal: PKR 8,500
Flat fee: PKR 50
Successful
Jazz Load
Principal: PKR 1,000
Customer fee: PKR 0
Provider commission: PKR 14
Pending bank transfer
Principal: PKR 25,000
Must not be treated as settled

Do not duplicate seed transactions every time the browser reloads.

19. Acceptance scenarios

Verify these manually:

Scenario 1: Amount Sent
Select JazzCash.
Select Amount Sent.
Enter PKR 1,000.
Fee should be PKR 10.
Customer gives PKR 1,010.
Float decreases by PKR 1,000.
Cash increases by PKR 1,010.
Net earnings include the fee and provider net commission.
Scenario 2: Slab fee
Enter PKR 1,500 as Amount Sent.
Fee should be PKR 20.
Scenario 3: Withdrawal
Select Easypaisa.
Select Amount Received.
Enter PKR 1,000.
Fee should be PKR 20.
Deduct from payout should give customer PKR 980.
Scenario 4: Separate withdrawal fee
Choose Collect Separately.
Principal is PKR 1,000.
Cash payout is PKR 1,000.
Fee revenue is PKR 20.
Net physical cash decrease is PKR 980.
Scenario 5: Missing reference
Select Successful status.
Leave Provider Transaction ID empty.
Save must be blocked.
Scenario 6: Pending transaction
Save as Pending.
Do not add it to settled earnings or final float balance.
Show it in pending totals.
Scenario 7: Reversal
Reverse a successful transaction.
Cash, float, service fee and commission impact must be reversed.
Original record must remain visible.
Second reversal must be blocked.
Scenario 8: Utility bill
Select Utility Bill.
Show bill-specific fields.
Save LESCO payment with provider reference.
Scenario 9: Existing prototype regression

Confirm that the existing phone sale, IMEI, demand, receiving, inventory and cash-closing flows still work.

20. Code-quality requirements
Inspect before editing.
Reuse existing functions and styles where practical.
Keep calculation functions pure and reusable.
Avoid one oversized function for the complete module.
Add comments only where calculations are not obvious.
Handle missing old localStorage fields safely.
Prevent NaN, negative amounts and invalid fee calculations.
Format money only for display.
Store raw numeric values.
Avoid inline duplicated fee formulas.
Do not add external dependencies.
Do not rewrite unrelated modules.
Do not silently change existing seeded data.
21. README update

Update README.md with:

Digital Services module overview
manual external transaction limitation
service-fee rules
sample test flow
how to reset prototype data
statement that this prototype does not call provider APIs
22. Required completion report

After implementation, provide:

Files Inspected
Files Modified
Functionality Added
Fee and Profit Formulas
localStorage Migration Behavior
Manual Test Scenarios Completed
Existing Flows Re-tested
Known Prototype Limitations
Remaining Business Decisions

Include exact syntax or validation commands run.

Do not claim successful testing unless it was actually performed.


The prompt deliberately keeps the actual JazzCash, Easypaisa, bank, bill and load transactions external while m