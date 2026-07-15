# MobileShop OS — Clickable Prototype

A static, front-end-only prototype of the **MobileShop OS** blueprint (a POS +
inventory + customer-demand + deterministic reorder-intelligence system for a
Lahore mobile shop). It exists to **walk the flow of the system** — not to be the
real app. There is no backend: all data is mock seed data and all "posting"
actions update the screen locally.

## How to open

Just double-click **`index.html`** (the Dashboard). Everything is plain HTML/CSS/JS
loaded over `file://` — no server, no build step, no internet required. Use the
left sidebar to move between screens; most numbers and rows are clickable and
drill down into the relevant screen.

> Tip: there's a light/dark toggle (moon icon) in the top bar.

## The main flows to try

1. **Sell → Receipt** — *Sell (POS)*: search a phone, add it (an IMEI is picked),
   choose payment, **Review & post** → see the impact summary → get a receipt.
2. **Missed demand → Buying plan** — *Demand*: record an out-of-stock request →
   it feeds *Intelligence*, where the reorder engine ranks what to buy, shows its
   **reasons/risks/confidence**, and lets the owner accept into a budget.
3. **Purchase → Stock** — *Purchases* → open a PO → **Receive stock** (scan IMEIs,
   duplicate-IMEI is blocked) → goods receipt creates inventory.
4. **Inventory truth** — *Inventory* → a product → an IMEI unit's full movement
   timeline and audit.
5. **Money reality** — *Finance* (management P&L, profit ≠ cash) → *Daily Closing*
   (cash reconciliation with variance).
6. **High-risk control** — *Used Intake*: a device stays **quarantined** until all
   verification gates pass.
7. **Digital Services** — *New Transaction*: record a manual JazzCash,
   Easypaisa, bank transfer, utility bill or mobile-load transaction after the
   cashier completes it in the official external provider app.

## Screen map

| Area | Screens |
|------|---------|
| Command center | `index.html` (Dashboard) |
| Sell | `pos.html`, `demand.html`, `customers.html` |
| Stock | `inventory.html`, `product.html`, `unit.html`, `purchases.html`, `purchase-order.html`, `suppliers.html` |
| Service | `returns.html`, `repairs.html`, `used-intake.html` |
| Money | `finance.html`, `closing.html` |
| Digital Services | `digital-services.html`, `digital-history.html`, `digital-balances.html`, `digital-commission.html`, `digital-reconciliation.html` |
| Intelligence | `intelligence.html`, `reports.html`, `tasks.html` |
| System | `settings.html` |

## Digital Services

Digital Services is a manual operational-flow prototype. The cashier still uses
the official JazzCash, Easypaisa, banking, utility-bill or telecom retailer app
outside this prototype. MobileShop OS only records what happened, calculates the
shop fee, previews cash/float impact, and stores the local record in
`localStorage`. It does **not** call provider APIs.

Default service-fee rules:

- Amount Sent from shop: slab fee of Rs 10 per started Rs 1,000 for JazzCash,
  Easypaisa and Bank Transfer.
- Amount Received into shop / withdrawal: slab fee of Rs 20 per started
  Rs 1,000 for JazzCash, Easypaisa and Bank Transfer.
- Utility Bill starts with a configurable flat fee of Rs 50.
- Jazz Load, Zong Load and Other start with a configurable flat fee of Rs 0.

Sample test flow:

1. Open `digital-services.html`.
2. Select JazzCash, choose **AMOUNT SENT**, enter Rs 1,000.
3. Confirm the preview shows Rs 10 service fee, Rs 1,010 customer cash, Rs 1,000
   provider float decrease.
4. Add a provider transaction ID, review, then confirm and save.
5. Check `digital-history.html`, `digital-balances.html` and
   `digital-commission.html`.

To reset Digital Services prototype data only, run this in the browser console:

```js
localStorage.removeItem("msos-digital-services-v1")
location.reload()
```

The theme toggle uses `msos-theme`; removing the Digital Services key does not
reset the rest of the prototype.

## Structure

```
prototype/
  index.html            # Dashboard (reference screen)
  <screen>.html         # one file per screen
  assets/
    styles.css          # design system (tokens, components, light/dark)
    data.js             # shared mock seed data (globals: DB, fmt)
    digital.js          # digital-services localStorage state + calculations
    shell.js            # renders sidebar + topbar; helpers (globals: Shell)
  _CONTRACT.md          # build contract the screens follow
  _TEMPLATE.html        # blank page skeleton
```

All screens share `assets/styles.css`, `assets/data.js` and `assets/shell.js`, so
the look, navigation and data stay consistent. To change a number everywhere,
edit `assets/data.js`.

*This is a design/flow prototype of the blueprint in the parent folder — it is not
a production system and makes no accounting, PTA or Punjab Police claims.*
