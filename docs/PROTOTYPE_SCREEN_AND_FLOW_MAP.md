# Prototype Screen and Flow Map

> Definitive map of the approved clickable prototype at `d:/mobile/mobile-shop-automation-blueprint/prototype`.
> Required by `13_PRODUCTION_MASTER_BUILD_PROMPT.md` §5 item 4: *"Map every prototype route, page, modal, button and form."*
>
> **Every claim below comes from a file actually read.** Exact file paths, element ids, function names, column headers and numbers are quoted verbatim from the source.
>
> **Two things in this document are explicitly NOT from the repository and are labelled as such:**
> 1. **Proposed production route** — the prototype has no router. Routes are a *proposal* for the production frontend, derived from the prototype's own information architecture in `prototype/assets/shell.js`. They do not exist in the repository.
> 2. **Inferred roles** — the prototype has **no auth and no enforcement**. Role inference uses the role/permission matrix hard-coded in `prototype/settings.html` (`ROLES` + `CATS`), which is itself a static mock. Nothing in the prototype checks a role at runtime.

---

## 1. Overview

### 1.1 Technology

| Aspect | Reality (from the files) |
|---|---|
| Stack | Static HTML + CSS + vanilla ES5-style JavaScript. No framework, no bundler, no package manager, no `package.json` in `prototype/`. |
| Build step | **None.** `prototype/README.md` §"How to open": *"Everything is plain HTML/CSS/JS loaded over `file://` — no server, no build step, no internet required."* |
| Dependencies | Zero. `_CONTRACT.md` §7: *"Keep inline JS small, vanilla, dependency-free. No frameworks, no CDN, no external fonts/images."* |
| Network | None. `_CONTRACT.md` §7: *"Use emoji/`Shell.svg` for any imagery — no `<img>` with remote src."* |
| Routing | None. Cross-page navigation is plain `href` to a sibling `.html` file. Detail pages read `?id=` via `new URLSearchParams(location.search)` (`product.html`, `unit.html`, `purchase-order.html`). |
| Persistence | None for the core app (in-memory only, reset on reload). Digital Services alone persists to `localStorage` under key `msos-digital-services-v1`. Theme persists under `msos-theme`. |
| Backend / auth | **None.** `prototype/README.md`: *"There is no backend: all data is mock seed data and all 'posting' actions update the screen locally."* |

### 1.2 How to run it

Double-click `prototype/index.html`. That is the entire procedure (`prototype/README.md` §"How to open"). No server required; the prototype is designed to work over `file://`.

Reset commands documented in `prototype/README.md`:

```js
localStorage.removeItem("msos-digital-services-v1")
location.reload()
```

The theme key `msos-theme` is separate; removing the Digital Services key does not reset the theme, and neither key affects the rest of the prototype (which holds no persisted state at all).

### 1.3 File inventory (25 HTML files)

24 screen files + 1 skeleton (`_TEMPLATE.html`).

```text
prototype/
  _CONTRACT.md                      # build contract every screen follows
  _TEMPLATE.html                    # blank page skeleton (not a screen)
  README.md                         # how to run + screen map + digital-services notes
  DIGITAL_SERVICES_PROTOTYPE_PROMPT.md   # the spec the Digital Services module was built from
  index.html  pos.html  demand.html  customers.html
  inventory.html  product.html  unit.html
  purchases.html  purchase-order.html  suppliers.html
  returns.html  repairs.html  used-intake.html
  finance.html  closing.html
  digital-services.html  digital-history.html  digital-balances.html
  digital-commission.html  digital-reconciliation.html
  intelligence.html  reports.html  tasks.html  settings.html
  assets/
    styles.css   # design system (tokens, components, light/dark)
    data.js      # shared mock seed (globals: DB, fmt)
    digital.js   # digital-services localStorage state + calculations (global: Digital)
    shell.js     # renders sidebar + topbar; helpers (global: Shell)
```

### 1.4 The `_CONTRACT.md` conventions

`prototype/_CONTRACT.md` is the binding build contract. Its rules, in full:

**§1 Page skeleton (copy `_TEMPLATE.html` exactly)**
- Full HTML document, `<link rel="stylesheet" href="assets/styles.css">` in head.
- `<body data-page="...">` — sets which sidebar item highlights.
- Fixed structure: `.layout > (#sidebar + .main > (#topbar + main.content))`.
- Screen markup goes inside `<main class="content">`.
- Drawers/modals are `.overlay` elements **after** `.layout` as siblings, before scripts.
- Script order at end of body: `data.js`, `shell.js`, then the page's inline `<script>`.
- **"The sidebar and topbar render themselves from `shell.js` — do not write nav markup."**

**§2 `data-page` id per page.** The contract lists 19 mappings. See §1.5 below for the *actual* values including the five Digital Services pages the contract never updated.

**§3 Data.** *"use the shared seed, do NOT invent numbers."* `data.js` exposes globals `DB` and `fmt`. Named collections: `DB.SHOP, DB.KPI, DB.variants, DB.stock, DB.units, DB.sales, DB.demand, DB.suppliers, DB.purchaseOrders, DB.recommendations, DB.budget, DB.customers, DB.returns, DB.repairs, DB.usedIntakes, DB.finance, DB.tasks, DB.attention, DB.notifications, DB.reports, DB.audit`. Pages *may* compute derived values but must not hard-code contradictory figures.

**§4 Design language**
- Neutral surface, ONE accent (indigo, `--accent`).
- **"Green = confirmed positive only. Red = loss / blocking only. Amber = attention."**
- **"Status is never conveyed by color alone"** — every badge carries text (often an icon).
- Money: always `Rs` with thousands separators, tabular numerals, right-aligned in tables.
- **"Explain every number"** — metrics/rows are clickable and drill down (`class="row-link"` + `onclick`).
- **"Confirmation = impact summary, not 'Are you sure?'"** — use the `.impact` box to state the concrete effect.
- Every screen needs a `.page-head` with `<h1>`, `.subtitle`, `.actions`. Detail pages add `.breadcrumb` above.

**§5 Component classes.** `.card/.card-head/.card-pad`, `.grid.cols-2/3/4/6`, `.kpi(.accent)` with `.label/.value/.meta(+.trend.up/.down)`, `.btn(.btn-primary/.btn-pos/.btn-danger/.btn-ghost/.btn-sm/.btn-lg/.btn-block)`, `.badge(.pos/.neg/.warn/.info/.accent/.plain)`, `.table-wrap > table.data` with `.num`/`.mono`/`.row-link`, `.meter(.pos/.warn/.neg)`, `.confbar`, `.attn-card(.critical/.attention)`, `.tabs > .tab(.active)` + `.tab-panel(.active)`, `.field > label + .input`, `.field-row`, `.seg`, `.help`, `.timeline > .tl-item(.done)`, `.overlay(.open)(.center) > .drawer|.modal`, `.impact`, `.empty`, `.callout.info/.warn/.neg/.pos`, `.kv(.k/.v)`, `.divider`, `.spread`, `.row`, `.stack.g6/g10/g16`, `.tag-list`, `.thumb`, `.avatar-sm`, `.small/.tiny/.muted`, `.mono`, `.pos-text/.neg-text`, `.breadcrumb`.

**§6 Shell helpers.** `Shell.svg(name[,cls])`, `Shell.open(id)`, `Shell.close(id)`, `Shell.toast(msg[,positive=true])`, `Shell.notifications()`. Esc closes overlays automatically.

**§7 Interactivity rules.** *"destructive/backend actions just show a toast and/or update the DOM locally… Never require a server."* Cross-page links use real hrefs so the flow is walkable.

**§8 Quality bar.** Faithful to the blueprint's flow, realistic Lahore mobile-shop content, visually consistent, genuinely clickable where the flow matters.

### 1.5 The `data-page` / shell pattern

A page sets `<body data-page="X">` and writes only `<main class="content">`. On `DOMContentLoaded`, `shell.js`'s `boot()` reads `document.body.getAttribute("data-page")`, then injects `renderSidebar(active)` into `#sidebar` and `renderTopbar(active)` into `#topbar`. The nav item whose `id === active` receives `class="nav-item active"`.

**Actual `data-page` values in the repository (all 24 screens):**

| File | `data-page` | Matches `_CONTRACT.md` §2? |
|---|---|---|
| `index.html` | `dashboard` | Yes |
| `pos.html` | `pos` | Yes |
| `demand.html` | `demand` | Yes |
| `customers.html` | `customers` | Yes |
| `inventory.html` | `inventory` | Yes |
| `product.html` | `inventory` | Yes |
| `unit.html` | `inventory` | Yes |
| `purchases.html` | `purchases` | Yes |
| `purchase-order.html` | `purchases` | Yes |
| `suppliers.html` | `suppliers` | Yes |
| `returns.html` | `returns` | Yes |
| `repairs.html` | `repairs` | Yes |
| `used-intake.html` | `used` | Yes |
| `finance.html` | `finance` | Yes |
| `closing.html` | `closing` | Yes |
| `intelligence.html` | `intelligence` | Yes |
| `reports.html` | `reports` | Yes |
| `tasks.html` | `tasks` | Yes |
| `settings.html` | `settings` | Yes |
| `digital-services.html` | `digital-new` | **No — absent from the contract** |
| `digital-history.html` | `digital-history` | **No — absent from the contract** |
| `digital-balances.html` | `digital-balances` | **No — absent from the contract** |
| `digital-commission.html` | `digital-commission` | **No — absent from the contract** |
| `digital-reconciliation.html` | `digital-recon` | **No — absent from the contract** |

> **Contract drift (defect to carry into production planning).** `_CONTRACT.md` §2 lists only 19 `data-page` ids and was never updated when the Digital Services module landed. The five digital values above are correct against `shell.js`'s `NAV` ids — the contract, not the pages, is stale.
>
> **Second contract drift.** `_CONTRACT.md` §1 mandates script order `data.js`, `shell.js`, then inline. Five pages insert `digital.js` between `data.js` and `shell.js`: `index.html`, `finance.html`, `reports.html`, and all five `digital-*.html` pages. The real convention is `data.js` → [`digital.js`] → `shell.js` → inline.

### 1.6 The three global objects

| Global | Source | Contents |
|---|---|---|
| `DB` | `assets/data.js` | 21 read-only seed collections (§5.2 lists them all) |
| `fmt` | `assets/data.js` | `pkr(n)`, `pkrShort(n)`, `num(n)`, `pct(n)`, `variant(id)`, `variantName(id)` |
| `Shell` | `assets/shell.js` | `svg`, `icon` (alias of `svg`), `open`, `close`, `closeAll` (alias of `close`), `toast`, `notifications`, `toggleTheme`, `toggleSidebar` |
| `Digital` | `assets/digital.js` | `KEY`, `SERVICES`, `DIRECTIONS`, `STATUSES`, `BALANCE_KEYS`, `load`, `save`, `calculate`, `calcFee`, `findRule`, `addTransaction`, `updateStatus`, `reverseTransaction`, `totals`, `balanceSummary`, `saveReconciliation`, `pkr`, `dateText`, `num`, `lowThresholds` |

**Formatter behaviour (exact, from `assets/data.js`):**
- `fmt.pkr(n)` → `"Rs " + Math.abs(Math.round(n)).toLocaleString("en-PK")`, prefixed `-` when negative; returns `"—"` for `null`/`undefined`/`NaN`.
- `fmt.pkrShort(n)` → `≥1e7` → `"Rs X.XX Cr"`; `≥1e5` → `"Rs X.XX Lac"`; `≥1e3` → `"Rs Xk"`; else `"Rs n"`.
- `fmt.pct(n)` → `(n > 0 ? "+" : "") + n + "%"`.
- `fmt.variantName(id)` → `brand + " " + model` + storage (if not `"—"`) + color (if not `"—"`); `"Unknown"` if not found.

### 1.7 Design system tokens (`assets/styles.css`)

| Group | Tokens |
|---|---|
| Accent | `--accent:#3b56d9`, `--accent-600:#2f45b8`, `--accent-soft:#eef1fe`, `--accent-ink:#1e2a7a` |
| Semantic | `--pos:#147a4b` (confirmed positive), `--neg:#c0392b` (loss/blocking), `--warn:#b7791f` (attention), `--info:#2b6cb0` + `-soft` variants for each |
| Surface | `--bg:#f4f5f8`, `--surface:#ffffff`, `--surface-2:#fafbfd`, `--sidebar:#10162b`, `--sidebar-active:#1d2647` |
| Ink | `--ink:#1a1f2e`, `--ink-2:#4a5266`, `--ink-3:#7b8299`, `--line:#e4e7ee`, `--line-2:#eef0f5` |
| Shape | `--radius:12px`, `--radius-sm:8px`, `--shadow-sm/md/lg` |
| Metrics | `--sidebar-w:244px`, `--topbar-h:60px` |
| Type | `--font: "Segoe UI", system-ui, …`; `--mono: "SF Mono", ui-monospace, …` |

Dark theme is a full token override under `:root[data-theme="dark"]` (e.g. `--accent:#6d84f2`, `--bg:#0c1020`, `--pos:#47c78a`). Responsive breakpoints: `1100px` (cols-4/6 → 3), `900px` (sidebar becomes an off-canvas drawer, `.menu-toggle` appears), `720px` (all grids → 1 column).

> **Missing utility class (defect).** `styles.css` defines `.pos-text` and `.neg-text` but **no `.warn-text`**. `digital-balances.html` uses `<td class="num warn-text">` for the Pending Amount column and `digital-reconciliation.html` passes `"warn-text"` to its `card()` helper for pending counts. Both render with no colour.

---

## 2. Navigation map

All navigation is generated by `renderSidebar()` and `renderTopbar()` in `assets/shell.js`. **No page writes nav markup.**

### 2.1 Sidebar

**Brand block** (top): `.logo` reading `M` + `.name` `"MobileShop OS"` + `.sub` bound to `S.name` (`DB.SHOP.name` → `"Al-Madina Mobiles"`).

**Nav model — the `NAV` constant, complete and exact:**

| Group | `id` | Label | `href` | `icon` | `count` badge |
|---|---|---|---|---|---|
| *(no group label)* | `dashboard` | Dashboard | `index.html` | `dashboard` | — |
| **Sell** | `pos` | Sell (POS) | `pos.html` | `sell` | — |
| **Sell** | `demand` | Demand | `demand.html` | `demand` | **`6`** |
| **Sell** | `customers` | Customers | `customers.html` | `customers` | — |
| **Stock** | `inventory` | Inventory | `inventory.html` | `inventory` | — |
| **Stock** | `purchases` | Purchases | `purchases.html` | `purchases` | — |
| **Stock** | `suppliers` | Suppliers | `suppliers.html` | `suppliers` | — |
| **Service** | `returns` | Returns / Warranty | `returns.html` | `returns` | — |
| **Service** | `repairs` | Repairs | `repairs.html` | `repairs` | — |
| **Service** | `used` | Used Intake | `used-intake.html` | `used` | **`1`** |
| **Money** | `finance` | Finance | `finance.html` | `finance` | — |
| **Money** | `closing` | Daily Closing | `closing.html` | `closing` | — |
| **Digital Services** | `digital-new` | New Transaction | `digital-services.html` | `digital` | — |
| **Digital Services** | `digital-history` | Transaction History | `digital-history.html` | `reports` | — |
| **Digital Services** | `digital-balances` | Service Balances | `digital-balances.html` | `finance` | — |
| **Digital Services** | `digital-commission` | Commission Report | `digital-commission.html` | `reports` | — |
| **Digital Services** | `digital-recon` | Reconciliation | `digital-reconciliation.html` | `closing` | — |
| **Intelligence** | `intelligence` | Intelligence | `intelligence.html` | `intelligence` | **`7`** |
| **Intelligence** | `reports` | Reports | `reports.html` | `reports` | — |
| **Intelligence** | `tasks` | Tasks | `tasks.html` | `tasks` | **`6`** |
| **System** | `settings` | Settings | `settings.html` | `settings` | — |

8 groups, 21 items. Note `product.html`, `unit.html` and `purchase-order.html` are **detail pages with no nav entry** — they highlight their parent (`inventory`, `inventory`, `purchases` respectively).

> **The four `count` badges are hardcoded strings in `NAV`** (`"6"`, `"1"`, `"7"`, `"6"`), not derived from `DB`. See §5.

**Icon set.** `shell.js` defines exactly 17 inline SVG paths in the `I` map: `dashboard, sell, demand, inventory, purchases, suppliers, customers, returns, repairs, used, finance, digital, closing, intelligence, reports, tasks, settings, search, bell, menu, moon, check`. `svg(name, cls)` returns `'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" …>'` and falls back to an **empty** `<svg>` for an unknown name.

### 2.2 Topbar regions

Rendered left→right by `renderTopbar()`:

| Region | Markup / behaviour |
|---|---|
| **Menu toggle** | `.icon-btn.menu-toggle` → `Shell.toggleSidebar()`. Hidden by CSS above 900px (`.menu-toggle { display: none }`); shown below. |
| **Business date** | `.topbar-date` → `S.businessDate` (`"14 Jul 2026"`) + `.sub` `" · " + S.branch` (`"Hall Road, Lahore"`). |
| **Global search** | `.searchbar` with `placeholder="Search products, IMEI, customers, invoices…"`. `onkeydown`: Enter → `Shell.toast('Global search is illustrative in this prototype')`. **Non-functional stub.** |
| **Cash session pill** | `.cash-pill` — reads `S.cashSession.state`. `"open"` → class `""` + text `"Cash session open"`; otherwise class `"closed"` + `"Cash session closed"`. Seed is `open`, so every page shows "Cash session open". |
| **Theme toggle** | `.icon-btn` with `title="Toggle theme"` → `Shell.toggleTheme()`; moon icon. |
| **Notifications** | `.icon-btn` with `title="Notifications"` → `Shell.notifications()`; bell icon + a **permanently visible** `<span class="dot">` unread indicator. |
| **Avatar** | `.avatar` with `title=S.owner` showing initials via `S.owner.split(" ").map(w=>w[0]).join("").slice(0,2)` → `"HS"`. **Not a menu — no click handler, no logout.** |

### 2.3 Shell-level overlay: notifications drawer

Built on demand by `notifications()` into `#shell-notif` (created once, then reopened). Renders `DB.notifications` as `.attn-card` rows with `.rankdot` = `!`, `.t` = `n.text`, `.d` = `n.time`. Closes via `.x-close` → `Shell.close('shell-notif')`, backdrop click, or Esc. Cards are `cursor:default` — **not clickable, no deep links**.

---

## 3. Per-screen sections

> **Legend.** *Proposed production route* = a proposal, not in the repo (§0). *Inferred roles* = inference from the static matrix in `settings.html`; the prototype enforces nothing.

---

### 3.0 `_TEMPLATE.html` — page skeleton

| | |
|---|---|
| **File** | `prototype/_TEMPLATE.html` |
| **Purpose** | The blank skeleton every screen copies. **Not a screen** — no route, no roles, no data. |
| **Proposed production route** | *None.* Its production equivalent is the shared app-shell layout (sidebar + topbar + content slot). |
| **`data-page`** | `DATA_PAGE_ID` (placeholder) |
| **`<title>`** | `PAGE TITLE · MobileShop OS` |

Full contents: `<link rel="stylesheet" href="assets/styles.css">`; `.layout > (aside#sidebar + .main > (header#topbar + main.content))`; a comment marking `PAGE CONTENT GOES HERE`; a comment `<!-- Overlays (drawers/modals) live here, siblings of .layout -->`; then `data.js`, `shell.js`, and an inline `<script>` with the comment *"Page-specific JavaScript. DB, fmt and Shell are available globally."*

**Production takeaway:** the `<title>` pattern `"<Page> · MobileShop OS"` is used by all 24 screens and should be preserved as the production title template.

---

### 3.1 `index.html` — Dashboard

| | |
|---|---|
| **File** | `prototype/index.html` |
| **`data-page`** | `dashboard` · **`<title>`** `Dashboard · MobileShop OS` |
| **Purpose** | Owner command center. Answers "what happened today and what needs me". |
| **Proposed production route** | `/(app)/dashboard` (index redirect from `/`) |
| **Inferred roles** | Owner (full). Manager would see all tiles; Salesperson/Cashier must not see Gross profit / Inventory value (`See cost & margin` = `None`); Accountant read-only. |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Good afternoon, Haseeb"` (hardcoded greeting + name); `.subtitle` `"Here's what happened at Al-Madina Mobiles today — Tuesday, 14 July 2026"` (hardcoded).

**Actions (2).**

| Element | Label | Action |
|---|---|---|
| `#btn-demand` | `Shell.svg("demand") + " Record demand"` | `href="demand.html"` |
| `#btn-sell` | `Shell.svg("sell") + " New sale"` | `href="pos.html"` (`.btn-primary`) |

**KPIs — `#kpiRow`, `.grid.cols-6`, 6 tiles.** Each renders as an `<a class="kpi">`.

| # | Label | Value | Trend | Meta | Href | `.accent` |
|---|---|---|---|---|---|---|
| 1 | Sales today | `fmt.pkr(k.salesToday)` | `k.salesTrendPct` (`+8.4%`) | `vs yesterday` | `finance.html` | Yes |
| 2 | Gross profit | `fmt.pkr(k.grossProfitToday)` | `k.profitTrendPct` (`+3.1%`) | `k.grossMarginPct + "% margin"` | `finance.html` | — |
| 3 | Expenses | `fmt.pkr(k.expensesToday)` | — | **`"5 entries today"` (hardcoded)** | `finance.html` | — |
| 4 | Net operating | `fmt.pkr(k.netOperatingToday)` | — | `estimated` | `finance.html` | — |
| 5 | Cash position | `fmt.pkr(k.cashPosition)` | — | `drawer · session open` | `closing.html` | — |
| 6 | Inventory value | `fmt.pkrShort(k.inventoryValue)` | — | `at recorded cost` | `inventory.html` | — |

Trend markup: `'<span class="trend ' + (up?"up":"down") + '">' + (up?"▲":"▼") + " " + fmt.pct(t.trend) + '</span>'`.

**Card: "Needs your attention"** — hint `"Ranked by impact · click to open"`. `#attnList` maps `DB.attention` (7 rows) to `<a class="attn-card {severity}" href="{a.link}">` with `.rankdot` = `a.rank`, `.t` = `a.title`, `.d` = `a.detail`, `.chev` = a chevron SVG (re-injected by a second pass over `#attnList .chev`).

**Card: "Recent sales"** — action `View all →` → `finance.html`. Table `#salesTable`, `DB.sales.slice(0, 6)`.

| Column | Cell |
|---|---|
| `Invoice` | `.mono` `s.id` |
| `Time` | `.muted` `s.time` |
| `Customer` | `s.customer` |
| `Method` | `<span class="badge plain">s.method</span>` |
| `Total` (`.num`) | `.strong` `fmt.pkr(s.total)` |
| `Profit` (`.num`) | `.pos-text` `fmt.pkr(s.profit)` |

> **Every row is `onclick="location.href='finance.html'"`** — no per-invoice deep link. See §5.

**Card: "Demand & buying".** Sub-label `"Top requested items you couldn't sell"`. `#unmetList` derives from `DB.demand.filter(d => !d.available)`, groups by `fmt.variantName(d.variantId)` (or `d.request` when `variantId` is null), sums `d.qty`, sorts desc, takes **top 4**, renders `.spread` rows with `<span class="badge neg">{n} waiting</span>`. Then a `.divider` and three `.kv` rows: `Recommended budget` → `#budTotal` = `fmt.pkr(DB.budget.total)`; `Selected investment` → `#budSel` = `fmt.pkr(DB.budget.selected)`; `Expected gross profit` → `#budProfit` (`.pos-text`) = `fmt.pkr(DB.budget.expectedReturn)`. Footer button `Review buying plan →` → `intelligence.html`.

**Card: "Digital Services"** — head link `New transaction` → `digital-services.html`. `#digitalSummary` is computed live from `Digital.load()`:

| `.kv` row | Computation |
|---|---|
| Sent today | Σ `principalAmount` where `status==="SUCCESSFUL"` and `direction===SENT` |
| Received today | Σ `principalAmount` where `status==="SUCCESSFUL"` and `direction===RECEIVED` |
| Customer fees today | Σ `customerServiceFee` over settled |
| Provider net commission | Σ `providerNetCommission` over settled |
| Net digital-service earnings | Σ `netServiceEarnings` over settled |
| Pending transactions | count where `status==="PENDING"` |

Then a `.divider` and a conditional **action queue** (each an `<a class="spread">`):

| Condition | Row | Badge | Link |
|---|---|---|---|
| `pending > 0` | Pending digital transactions | `.badge.warn` = count | `digital-history.html` |
| `missingRef > 0` (status `SUCCESSFUL` && `!providerTransactionId`) | Provider references missing | `.badge.neg` = count | `digital-history.html` |
| `lows.length` (from `Digital.balanceSummary().filter(b => b.low)`) | Float warnings | `.badge.neg` = count | `digital-balances.html` |
| `reconOpen` (`digitalServiceReconciliations.length === 0`) | Digital reconciliation incomplete | `.badge.warn` `Open` | `digital-reconciliation.html` |

Empty state when the queue is empty: `"No digital-service action items."` Footer button `Record digital service →` → `digital-services.html`.

**Card: "Today's tasks"** — head link `All tasks` → `tasks.html`. `#taskList` maps `DB.tasks.slice(0, 4)` to `<a class="spread" href="{t.link}">` with the title and a due badge classed `neg` (High) / `warn` (Medium) / `plain`.

**Forms / modals:** none (beyond the shell notifications drawer).

**Data entities consumed:** `DB.KPI`, `DB.attention`, `DB.sales`, `DB.demand`, `DB.budget`, `DB.tasks`, `DB.SHOP` (via shell), `Digital` state (localStorage).

**Business rules visible:**
- Attention is **ranked by impact** and each card deep-links to the screen that resolves it.
- Digital-service **principal is never shown as revenue** — the Digital card reports Sent/Received separately from fees and net earnings.
- The digital action queue is the dashboard's exception surface: pending, missing reference, low float, incomplete reconciliation.

---

### 3.2 `pos.html` — Sell (Point of Sale)

| | |
|---|---|
| **File** | `prototype/pos.html` |
| **`data-page`** | `pos` · **`<title>`** `Point of Sale · MobileShop OS` |
| **Purpose** | Counter-speed checkout: search/scan → cart → payment → impact review → receipt. |
| **Proposed production route** | `/(app)/sell` |
| **Inferred roles** | Salesperson (`Sell (POS)` = `Full`, `See cost & margin` = **`None`** → the entire *Profit preview* card must be hidden), Cashier (`Sell (POS)` = `Limited`, discounts capped), Manager, Owner. The card is explicitly badged `<span class="badge accent">Owner view</span>`. |
| **Scripts** | `data.js` → `shell.js` → inline IIFE |

**Page-scoped CSS** (in `<style>`): `.pos-grid` (3 columns `340px minmax(0,1fr) 344px`, collapsing at 1200px and 820px), `.pos-result(.oos)`, `.pr-name`, `.pr-sub`, `.pr-price`, `.cart-line`, `.stepper`, `.line-x`, `.kbd`, `.amounts-hidden .pv-amount { filter: blur(6px) }`, `.receipt` + `.r-center/.r-hr/.r-row`.

**Tunables (exact constants).**

```js
var DISC_THRESHOLD = 2000;   // reason required for discounts above this
var MARGIN_WARN    = 6;      // gross-margin floor (%)
```

**Page head.** `<h1>` `"Sell — Point of Sale"`; subtitle *"Counter-speed checkout: search or scan, add to cart, take payment, print the receipt — all on one screen."*; `#shortcutChips` renders 5 `.badge.plain` chips from `chips = [["/","Search"],["F2","Customer"],["F4","Discount"],["F8","Payment"],["Ctrl+Enter","Review &amp; post"]]`.

**Actions (2).** `#btnDemand` → `demand.html` (`Record demand`); `Hold sale` (`.btn-ghost`) → `Shell.toast('Sale held — resume it from the counter queue')` — **stub, no queue exists**.

**LEFT column — "Products".** Head hint `#catCount` = `"{n} of {total} items"`. Search field `#posSearch`, `placeholder="Search product, brand or SKU…   ( press / )"`; a search SVG is injected via `$("posSearchBar").insertAdjacentHTML("afterbegin", Shell.svg("search"))`. Results `#resultsList` (`max-height:560px`, scrolls).

`renderResults()` filters `DB.variants` on `(brand + model + storage + color + sku).toLowerCase().indexOf(q)`. Per row:
- **In stock:** thumb glyph, `.pr-name` = `vName(v)`, `.pr-sub` = `<span class="mono">{sku}</span> · {tag}` where `tag = v.pta !== "—" ? v.pta : v.band`; right side `.pr-price` = `fmt.pkr(v.price)` + a stock badge.
- **Out of stock (`.oos`):** same but `.pr-sub` shows only the SKU, plus an inline link **`Out of stock — record demand →`** → `demand.html`, and badge `<span class="badge neg">Out</span>`. Row click is ignored (`if (!row || row.classList.contains("oos")) return`).
- **No match:** `.empty` with `🔍` / `No match` / `Nothing found for "{q}"`.

`stockBadge(id)` rule: `available <= 0` → `{neg, "Out"}`; `<= 2` → `{warn, "Low · N"}`; else `{pos, "In stock · N"}`.

`glyph(v)`: serialized → `📱`; else by model substring — `charger`/`cable` → `🔌`, `power` → `🔋`, `tune`/`ear` → `🎧`, `case` → `🛡️`, fallback `📦`.

**CENTER column — "Cart".** Head shows `#cartCount` (`Empty` / `"N item(s)"`) and `#clearCartBtn` (hidden when empty). Empty state `#cartEmpty`: `🧾` / *"Cart is empty"* / *"Search on the left and tap a product to add it. Phones attach an IMEI automatically; accessories add by quantity."*

Cart line markup per item: thumb, name, then **middle cell differs by tracking type** —
- Serialized: `<a class="mono" href="unit.html" title="Open unit record">{imei}</a>`, plus `<span class="badge plain">counter-assigned</span>` when `!l.unitId`.
- Non-serialized: a `.stepper` with `data-act="dec"` / `.qv` / `data-act="inc"`.

Right: line total `fmt.pkr(l.price * l.qty)` and `fmt.pkr(l.price)` (+ `" each"` for accessories). Far right: `.line-x` `data-act="remove"`.

**Discount form — `#discBlock`** (hidden when the cart is empty).

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#discAmount` | `input.input[type=number][min=0][inputmode=numeric]`, value `0` | `Discount (Rs)` + `<span class="kbd">F4</span>` | |
| `#discReason` | `input.input` | `Reason` + `#discReq` toggling `(optional)` / `(required)` | placeholder *"e.g. loyal customer, display piece, price match"* |
| `#discWarn` | div | — | Shows `"A reason is required for discounts above Rs 2,000."` |

**RIGHT column.**

*Customer card.* `#pickCustomerBtn` = `Change <span class="kbd">F2</span>`. Shows `#custAvatar` (`WI`), `#custName` (`Walk-in`), `#custMeta` (`No account · anonymous sale`).

*Payment card.* Head hint `Split supported`. Three `.kv` rows: `Subtotal` → `#sumSubtotal`, `Discount` → `#sumDiscount` (`.neg-text`, rendered as `"− Rs X"` when > 0), `Grand total` → `#sumTotal` (18px). Payment method `.seg#paySeg` with four buttons: **`Cash` (active by default), `Bank`, `Card`, `JazzCash`** (`data-pay` attributes). Help: *"Choose more than one method to split a payment (e.g. part cash, part bank transfer)."* — **the segmented control is single-select; splitting is not implemented.** Then `#reviewBtn` (`.btn-primary.btn-lg.btn-block`, `disabled` while the cart is empty): `Review & post sale <span class="kbd">Ctrl+Enter</span>`.

*Profit preview card.* Badge `Owner view`. `.kv` rows: `Cost basis (COGS)` → `#pvCogs`, `Gross profit` → `#pvProfit` (`.pos-text`), `Gross margin` → `#pvMargin`. `#pvWarn` shows a `.callout.neg` when `cart.length && margin < 6`: *"Low margin — X% … Below the 6% floor. Reduce the discount or check the cost basis."* Footer note: *"Cost basis uses recorded average cost per unit."* + link to `inventory.html`. `#pvToggle` toggles `.amounts-hidden` on `#profitBody` (blurs `.pv-amount`) and flips its own label `Hide amounts` ⇄ `Show amounts`.

**Overlays (3).**

| Id | Type | Contents |
|---|---|---|
| `#customerDrawer` | `.drawer` | Head `Select customer`. `#custSearch` (`placeholder="Search name or phone…"`), `#custList`, `.divider`, `<a class="btn btn-block" href="customers.html">+ Add a new customer</a>`. List = a fixed **Walk-in** row (`data-cust="__walkin"`, `.rankdot` `WI`, `"Anonymous sale · no account"`) + `DB.customers` filtered on `name + phone`; each row shows `phone · {purchases} orders · {spend} spent` and, when `credit > 0`, `<span class="badge warn">Owes {fmt.pkr(credit)}</span>`. |
| `#reviewModal` | `.overlay.center > .modal` | Head `Review & post sale`; body `#reviewBody`; foot `Back` (closes) + `#confirmPostBtn` `Confirm & post` (`.btn-pos`). |
| `#receiptModal` | `.overlay.center > .modal` (width `420px`) | Head `Receipt ready`; body `#receiptBody`; foot **`Print`** → `Shell.toast('Sent to thermal printer…')`, **`Share on WhatsApp`** → `Shell.toast('Receipt shared on WhatsApp', true)`, **`Done`** → close. All three are stubs. |

**Core logic.**

`computeTotals()`:
```js
subtotal = Σ(price × qty)
disc     = max(0, parseInt(discAmount)); if (disc > subtotal) disc = subtotal
total    = subtotal − disc
cogs     = Σ(cost × qty)          // cost = variant.avgCost
profit   = total − cogs
margin   = total > 0 ? profit/total*100 : 0
```

`addVariant(id)` rules:
- **Serialized:** `inCart` = count of existing lines for that variant. If `st.available - inCart <= 0` → `Shell.toast(name + " — no more units in stock", false)` and abort. Otherwise `pickSerialUnit()` finds the first `DB.units` entry with `variantId === id && state === "available" && imei1` not already in the cart; if none, it **synthesises** an IMEI via `synthImei()` and sets `unitId: null`. Toast: `"{name} added · IMEI {imei}"`.
- **Non-serialized:** merges into the existing line and increments `qty`; blocked when `st.available - inQty <= 0` → `"{name} — stock limit reached"`.

`changeQty(key, delta)`: blocks increment at `line.qty >= st.available` (`"Stock limit reached"`); removes the line when `qty <= 0`.

`synthImei(variantId, seq)` — **deterministic fake IMEI generator** (djb2-style hash of the variant id, prefixed `35`, padded/truncated to 15 digits):
```js
var h = 5381; for (…) { h = ((h << 5) + h + variantId.charCodeAt(i)) >>> 0; }
var s = ("35" + String(h) + String(1000000 + seq * 9173)).replace(/\D/g, "");
while (s.length < 15) s += "0";
return s.slice(0, 15);
```

**Invoice numbering.** `maxNo` = highest numeric suffix across `DB.sales` ids; `invoiceSeq = maxNo + 1`; `nextInvoiceNo()` → `"INV-2026-" + String(invoiceSeq).padStart(4, "0")`. Seed max is `INV-2026-0714`, so the first new invoice is **`INV-2026-0715`**. `invoiceSeq++` only on successful post.

**`openReview()` — the impact summary.** Blocks when: cart empty (`"Cart is empty — add a product first"`); or `disc > 2000 && !discReason` (`"Add a reason for the discount above Rs 2,000"` + focuses `#discReason`). Otherwise builds `.impact` bullets:
1. Per serialized line: *"Removes IMEI `{imei}` ({name}) from available stock"*; per accessory line: *"Reduces **{name}** stock by {qty}"*.
2. *"Records **{total}** revenue and **{profit}** gross profit ({margin}% margin)"*.
3. When `disc > 0`: *"Applies discount {disc}"* + `" — {reason}"`.
4. *"Payment via **{payment}**"*.
5. *"Customer: **{name}**"* + `" ({phone})"`.
6. *"Issues receipt `{invoice}` · WhatsApp + thermal print"*.

Plus, when `margin < 6`, a `.callout.neg`: *"Gross margin is X%, below the 6% floor. Post only if this is intentional."* Footer note: *"This prototype records the effect on-screen — no server call is made."*

**`postSale()`.** Closes the review modal, calls `buildReceipt(inv, t)`, toasts `"Sale posted · receipt ready"`, opens `#receiptModal`, increments `invoiceSeq`, clears the cart/discount/reason, re-renders. **`DB.sales`, `DB.stock` and `DB.units` are never mutated** — the sale evaporates on reload.

**Receipt contents** (`.receipt`, monospace): shop name `DB.SHOP.name`, branch `DB.SHOP.branch`, `Sales receipt`; rows `Invoice`, `Date` (`DB.SHOP.businessDate`), `Customer`, `Served by` (`DB.SHOP.owner.split(" ")[0]` → `"Haseeb"`); item lines with `IMEI {imei}` or `{price} each`; `Subtotal`, optional `Discount`, `TOTAL`, `Paid via`; `warrantyLine()` → *"Warranty: official manufacturer warranty on phones · accessories 7-day replacement."* when any serialized line is present, otherwise *"Warranty: 7-day replacement on accessories with this receipt."*; footer *"Shukriya! Thank you for shopping at {shop}."* and *"PTA-approved handset · returns within 7 days with receipt"*.

**Keyboard shortcuts** (document-level `keydown`; `typing` = target is `input`/`textarea`):

| Key | Behaviour |
|---|---|
| `/` | Only when **not** typing → focus + select `#posSearch` |
| `F2` | Open customer drawer, focus `#custSearch` after 60ms |
| `F4` | If cart non-empty → focus + select `#discAmount`; else toast `"Add items before applying a discount"` |
| `F8` | Focus the first `#paySeg` button + toast `"Payment method — Tab to a method, split supported"` |
| `Ctrl+Enter` / `Cmd+Enter` | `openReview()` |
| `Esc` | Closes overlays (from `shell.js`) |

**Data entities consumed:** `DB.variants`, `DB.stock`, `DB.units`, `DB.customers`, `DB.sales` (for the invoice sequence only), `DB.SHOP`.

**Business rules visible:**
- Serialized phones bind an **IMEI at add-to-cart time**; accessories are quantity-only.
- **Cart cannot exceed `stock.available`** for either type.
- **Discount > Rs 2,000 requires a reason** (hard block at review).
- **Gross-margin floor of 6%** — a warning, *not* a block ("Post only if this is intentional").
- **Confirmation is an impact summary**, never "are you sure".
- Cost basis is `variant.avgCost` ("recorded average cost per unit").
- Profit is an **owner-only view** that can be blurred at the counter (`Hide amounts`).

---

### 3.3 `demand.html` — Customer Demand & Missed Sales

| | |
|---|---|
| **File** | `prototype/demand.html` |
| **`data-page`** | `demand` · **`<title>`** `Customer Demand · MobileShop OS` |
| **Purpose** | Capture every request the shop could not fill, so it feeds the reorder engine. |
| **Proposed production route** | `/(app)/demand` |
| **Inferred roles** | Salesperson (records demand — the matrix has no explicit "record demand" category; `Sell (POS)` = `Full` is the closest), Manager, Owner. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Customer Demand & Missed Sales"`; subtitle *"Every request you couldn't fill today — captured so it drives what you buy next."* Actions: `View buying plan →` (`.btn-ghost`) → `intelligence.html`; `#btn-record` (`.btn-primary`) = `Shell.svg("demand") + " Record demand"` → `openCapture()`.

**Callout `#demandCallout`** (`.callout.warn`): *"Unavailable requests are counted as **qualified demand** in the buying plan — that's how the reorder engine knows what to restock."* + link `Open the buying plan →`.

**KPIs — `#kpiRow`, `.grid.cols-4`**, all derived from `state.rows` (live, re-rendered on capture):

| Label | Value | Meta | Action |
|---|---|---|---|
| Total requests | `r.length` | `logged · click to see all` | `setFilter('all')` · `.accent` |
| Unavailable · missed | `r.filter(d => !d.available).length` | `qualified demand ▸` | `setFilter('unavailable')` · value `.neg-text` |
| Reserved / quotation | count where `outcomeMeta().cat` is `reserved` or `quotation` | `converting ▸` | `setFilter('reserved')` · value `.pos-text` |
| Follow-ups due | count where `followUp && followUp !== "—"` | `tracked in Tasks →` | `href="tasks.html"` |

**Filter chips — `.seg#filterSeg`**, each showing a live count `"{label} ({n})"`:

| key | label |
|---|---|
| `all` | All |
| `unavailable` | Unavailable |
| `reserved` | Reserved |
| `quotation` | Quotation sent |
| `price` | Price too high |

`outcomeMeta(o)` maps the outcome **string prefix** to a category + badge class: `unavailable` → `{unavailable, neg}`; `reserved` → `{reserved, pos}`; `sold` → `{reserved, pos}`; `quotation` → `{quotation, info}`; `price` → `{price, warn}`; else `{other, info}`.

**Table `#demandTable`.**

| Column | Cell |
|---|---|
| `ID` | `.mono` `d.id` |
| `Logged` | `.muted.nowrap` `d.date` |
| `Customer` | `d.customer` |
| `Request` | `reqName(d)` + `<span class="badge plain">free text</span>` when `!d.variantId` |
| `Qty` (`.num`) | `d.qty` |
| `Urgency` | badge — `High`→`neg`, `Medium`→`warn`, else `plain` |
| `Outcome` | badge classed by `outcomeMeta(d.outcome).cls` |
| `Follow-up` | `<span class="badge warn">{followUp}</span>` or `<span class="muted">—</span>` |

Row click → `openDetail(d.id)`. Row count hint `#rowCount` = `"{shown} of {total} requests"`. Empty state `#emptyState`: `📭` / *"No requests in this view"* / *"Try another filter, or record a new customer request."* + a `Record demand` button.

**Drawer `#captureDrawer` — "Record customer demand".** Complete field list:

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#capProduct` | `select.input` | `Product — match from catalog` | `onchange="capAvail()"`. Options: `— Select a catalog item —`, then every `DB.variants` entry as `fmt.variantName(v.id)` + `"  · out of stock"` suffix when `available <= 0`, then `Other / not in catalog` (`value="__other"`). Help: *"Match to a catalog item so this demand feeds the reorder engine."* |
| `#capText` | `input.input` | `…or type what the customer asked for` | placeholder *"e.g. iPhone 16 Pro 256 (any colour)"* |
| `#capAvail` | *(computed div)* | `Availability right now` | See below |
| `#capVariant` | `input.input` | `Variant / condition` | placeholder `256 GB · Green · New`. **Captured in the DOM but never read by `saveDemand()`** |
| `#capQty` | `input.input[type=number][min=1]`, value `1` | `Quantity` | |
| `#capBudget` | `input.input` | `Customer budget` | placeholder `e.g. 40k–46k` |
| `#capPta` | `.seg` | `PTA preference` | Buttons: **`PTA only` (active)**, `Non-PTA ok`, `No preference` |
| `#capUrgency` | `.seg` | `Urgency` | Buttons: `Low`, **`Medium` (active)**, `High` |
| `#capPhone` | `input.input` | `Customer phone (optional)` | placeholder `03xx-xxxxxxx` |
| `#capFollow` | `input.input[type=date]` | `Follow-up date` | |
| `#capNote` | `textarea.input[rows=2]` | `Note` | placeholder *"Colour preference, timing, price objection…"* |
| `#capConsent` | `input[type=checkbox]`, **checked** | *"Customer consents to be contacted when stock arrives"* | |

Foot: `Cancel` (close) + `Record demand` (`.btn-primary`) → `saveDemand()`.

**`capAvail()` — live availability probe.** No selection → `<span class="badge plain">Pick a catalog item to check stock</span>`. `__other` → `<span class="badge warn">Not in catalog — logged as sourced-on-demand</span>`. `available > 0` → `<span class="badge pos">✓ In stock — {n} available</span>`. Else → `<span class="badge neg">OUT OF STOCK — will be captured as qualified demand</span>`.

**`saveDemand()` rules.**
- Requires a catalog match **or** free text, else `Shell.toast("Add a product or type the request first", false)`.
- `outcome` is derived, never chosen: `available` → `"Open — in stock"`; else `variantId` → `"Unavailable — out of stock"`; else → `"Unavailable — not in catalog"`.
- `customer` is derived: `phone ? "Customer ({phone})" : "Walk-in (anonymous)"`.
- New id `"DM-" + seq++` starting at **`seq = 5013`** (seed ends at `DM-5012`).
- `channel` is hardcoded `"Walk-in"`.
- If the active filter would hide the new row, the filter resets to `all`.
- When `!avail`, `showCaptureResult(rec)` renders the success panel; the form then resets.

**Drawer `#detailDrawer` — per-request detail.** Title = `"{id} · {reqName}"`. Body: urgency + outcome + channel badges; a card with the requested product (`fmt.variantName` + `.mono` SKU, or *"Not matched to catalog — source on demand"*); then `.kv` rows — `Request ID`, `Logged`, `Customer`, `Quantity`, `Budget`, `PTA preference`, `Channel`, `Follow-up`, `Consent to contact`, and `Note` (when present).

`consent` derivation: `d.consentCaptured === false` → `"No — do not contact"`; else `phone` present → `"Yes — may contact when stock arrives"`; else `"Not captured (anonymous walk-in)"`.

**When `!d.available`,** the drawer additionally shows:
- `.callout.warn`: *"Counted as **qualified demand**. **{sim}** open request(s) for this exact item · **{unmet}** qualified unmet in the last 30 days."* (`unmet` from `DB.stock[variantId].unmet`.)
- *"Matching alternatives in stock"* — up to **4** rows from `alternatives(d)`, each an `<a href="inventory.html">` with name, SKU, price and `<span class="badge pos">{n} in stock</span>`. Empty → *"No close alternatives in stock right now."*
- Buttons: **`Create reservation`** → toast *"Reservation created — customer will be notified when stock arrives"*; **`Send quotation`** → toast *"Quotation sent to {phone|the customer}"*. Both stubs.

**When `d.available`:** buttons **`Sell now`** → `pos.html` and **`Set follow-up`** → toast *"Follow-up reminder set"*.

**`alternatives(d)` algorithm.** Filter `DB.variants` to those with `stock.available > 0`, excluding the requested variant; if the request has no `variantId`, suggest any non-`Accessory` band; otherwise require `x.band === v.band || x.brand === v.brand`. Sort by `available` desc, `slice(0, 4)`.

**`showCaptureResult(rec)`** — an inline `#captureResult` card (not an overlay): head `"✓ Demand captured for an out-of-stock item"` with an `.x-close` → `hideCaptureResult()`; `.callout.warn` reading *"This is the **{n}{ordinal}** request for **{request}** while out of stock · **{unmet}** qualified unmet in the last 30 days. It now feeds the [buying plan](intelligence.html)."*; then a `.grid.cols-3` of alternative cards; then `Review buying plan →` → `intelligence.html` and `Add follow-up` → toast *"Added to follow-ups"*. Scrolls itself into view.

**Data entities consumed:** `DB.demand` (copied into `state.rows` via `Object.assign({}, d)`), `DB.variants`, `DB.stock`.

**Business rules visible:**
- **Unavailable requests = qualified demand** and are the reorder engine's input.
- Matching to a catalog variant is what makes demand actionable ("so this demand feeds the reorder engine").
- **Consent to contact** is captured per request and defaults to checked; anonymous walk-ins are marked "Not captured".
- Alternatives are offered by **same price band or same brand**.

---

### 3.4 `customers.html` — Customers

| | |
|---|---|
| **File** | `prototype/customers.html` |
| **`data-page`** | `customers` · **`<title>`** `Customers · MobileShop OS` |
| **Purpose** | Customer relationships — purchases, receivables, demand history and marketing consent. |
| **Proposed production route** | `/(app)/customers` (profile drawer → `/(app)/customers/[customerId]`) |
| **Inferred roles** | Salesperson (*"looks up customers"* per the matrix summary), Manager, Owner. Receivable amounts arguably fall under `Finance & reports`. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page head.** `<h1>` `Customers`; `#custSub` is **overwritten on boot** to `"{n} customers · {repeat} repeat buyers · {n} with outstanding credit"`. Actions: `#custSearch` (`placeholder="Search name or phone…"`, `oninput="filterCust()"`, inline search SVG); `#btn-add` (`.btn-primary`) = `Shell.svg("customers") + " Add customer"` → `Shell.open('addCust')`.

**KPIs — `.grid.cols-4#kpiRow`.**

| Label | Value | Meta | Link |
|---|---|---|---|
| Total customers | `custs.length` | `"{n} active relationships"` | — (`cursor:default`) |
| With outstanding credit | `creditList.length` | `"{fmt.pkr(creditSum)} total receivable"` | `finance.html` · `.accent` |
| Repeat buyers | `custs.filter(c => c.purchases > 1).length` | `bought more than once` | — |
| Lifetime spend | `fmt.pkr(spendSum)` | `"across {n} customers"` | `finance.html` |

**Table `#custBody`** — head hint *"Click a row to open the profile"*.

| Column | Cell |
|---|---|
| `Customer` | `.avatar-sm` initials + `.strong` name + `.tiny.muted.mono` `c.id` |
| `Phone` | `.mono` `c.phone` |
| `Purchases` (`.num`) | `fmt.num(c.purchases)` |
| `Lifetime spend` (`.num`) | `.strong` `fmt.pkr(c.spend)` |
| `Last visit` | `.muted` `c.lastVisit` |
| `Receivable` (`.num`) | `.neg-text` `fmt.pkr(c.credit)` when `> 0`, else `<span class="muted">—</span>` |
| `Consent` | `<span class="badge pos">✓ Yes</span>` or `<span class="badge warn"><span class="dot-i"></span>Pending</span>` |

Each `<tr>` carries `data-search="{name} {phone}"` (lowercased) driving `filterCust()`, which shows/hides rows and toggles a `#noResults` row (`colspan=7`, `🔍` / *"No matching customers"* / *"Try a different name or phone number."*).

**Drawer `#custDrawer` — customer profile.** Built by `openCustomerData(c)`. Foot: `Record demand` → `demand.html`; `New sale` (`.btn-primary`) → `pos.html`.

Body sections:
1. **Header** — 46px avatar, name, `.mono` `"{phone} · {id}"`, and either `<span class="badge neg">{credit} owed</span>` or `<span class="badge pos">✓ No dues</span>`.
2. **Key-values card** — `Phone`, `Consent` (`consentBadge`), `Purchases` (`"{n} orders"`), `Lifetime spend`, `Last visit`, `Receivable`.
3. **Credit callout** (only when `credit > 0`, `.callout.warn`): *"Customer credit of **{amount}** is a **receivable** — money the shop is owed. It stays in Finance under receivables until it is settled."*
4. **Purchase history** — header link `View in Finance →`. Matches `DB.sales.filter(s => s.customer === c.name)` — **name-string matching, no id join**. Each hit is an `<a class="attn-card" href="finance.html">` showing `{total} · {invoice id}` and `{time} · {item names}`. Empty → `.callout.info` *"No posted sales linked to this customer yet."* + *"Earlier orders live in the full ledger."* when `c.purchases > 0`.
5. **Demand history** — header link `Match & fulfil →`. Matches `DB.demand.filter(d => c.phone && d.customer.indexOf(c.phone) !== -1)` — **substring match on the customer display string**. Each row is a non-clickable `.attn-card` (`.attention` when unmet) with badge `Available` (`info`) or `Unmet` (`warn`). Footer note: *"Unmet requests feed the buying plan in [Intelligence](intelligence.html)."* Empty → `.callout.info` pointing at `demand.html`.

**Drawer `#addCust` — "Add customer".**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#ncName` | `input.input` | `Full name` | placeholder `e.g. Ali Hamza` |
| `#ncPhone` | `input.input` | `Phone number` | placeholder `03xx-xxxxxxx`; help *"Used to link demand requests and send restock alerts."* |
| `#consentSeg` | `.seg` | `Marketing consent` | Buttons **`Yes` (active, `data-v="Yes"`)** / `Pending` (`data-v="Pending"`); help *"Consent lets you send offers and restock alerts on WhatsApp."* |

`.callout.info`: *"Recording a customer lets you link purchases, track receivables and follow up on unmet demand."* Foot: `Cancel` + `Save customer` → `addCustomer()`.

**`addCustomer()` rules.** Requires both name and phone (`Shell.toast("Enter a name and phone number", false)`). New id = `"C-" + (206 + EXTRA.length)` (seed ends at `C-205`). Defaults: `purchases: 0, spend: 0, lastVisit: "Today", credit: 0`. Prepends the row via `insertAdjacentHTML("afterbegin", …)` and **increments only the first KPI tile's value in place** (`document.querySelector("#kpiRow .kpi .value")`) — the other three tiles go stale. Session-only: stored in a local `EXTRA` array, never in `DB`.

**Data entities consumed:** `DB.customers`, `DB.sales`, `DB.demand`.

**Business rules visible:**
- **Customer credit is a receivable** and is owned by Finance until settled.
- **Marketing consent is explicit** (`Yes` / `Pending`) and gates restock alerts.
- Unmet demand per customer feeds the buying plan.

---

### 3.5 `inventory.html` — Inventory & Catalog

| | |
|---|---|
| **File** | `prototype/inventory.html` |
| **`data-page`** | `inventory` · **`<title>`** `Inventory · MobileShop OS` |
| **Purpose** | Per-variant rollup of stock, demand, cover and aging; entry point to product/unit detail. |
| **Proposed production route** | `/(app)/inventory` |
| **Inferred roles** | Owner, Manager, Purchaser (`Inventory adjustments` = `Full`). Salesperson must not see `Avg cost` (`See cost & margin` = `None`). |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Inventory & Catalog"`; `#headSub` computed → `"{n} catalog variants · {phones} serialized phones · {acc} batch accessories at {DB.SHOP.branch}"`. Actions: `#searchInput` (`placeholder="Search product, SKU, brand…"`, `oninput="render()"`); `#btn-mv` = `Shell.svg("reports") + " Stock movements"` → `Shell.open('mvDrawer')`; `#btn-add` (`.btn-primary`) = `Shell.svg("inventory") + " Add product"` → **`Shell.toast('Add-product form is illustrative in this prototype')` — a stub with no form**.

**Explainer callout** (`.callout.info`): *"**Catalog vs stock.** A **variant** is a sellable definition — one SKU, one price. A serialized phone variant is backed by individual **IMEI-level units** you can open from its product page; batch accessories are tracked by quantity, not IMEI. The rows below roll up units into per-variant stock and demand."*

**KPIs — `.grid.cols-4#kpiRow`** (all `cursor:pointer`):

| Label | Value | Meta | Action |
|---|---|---|---|
| Catalog SKUs | `fmt.num(variants.length)` | `"{phones} serialized · {acc} batch"` | `applyFilter('all')` · `.accent` |
| Stock value | `fmt.pkrShort(DB.KPI.inventoryValue)` | `at recorded cost` | `location.href='reports.html'` |
| Out of stock | `fmt.num(outCount)` | `"{outUnmet} customers waiting"` | `applyFilter('out')`; `.neg-text` when `> 0` |
| Aged stock | `fmt.num(agedCount)` | `"≥30 days · {fmt.pkrShort(agedCapital)} tied up"` | `applyFilter('aged')` |

Derivations: `outRows` = `available === 0`; `outUnmet` = Σ `unmet` over those; `agedRows` = `ageDays >= 30`; `agedCapital` = Σ `available × avgCost` over those.

**Filter `.seg#segFilter`:** `All` (active), `Phones` (`v.serialized`), `Accessories` (`!v.serialized`), `Out of stock` (`available === 0`), `Aged 30d+` (`ageDays >= 30`). Right note: *"Click any row to open the product →"*.

**Contextual filter notes (`#filterNote`).**
- Filter `out` with results → `.callout.neg`: *"{n} line(s) out of stock · **{u} customers waiting**. [Review the reorder plan →](intelligence.html)"*.
- Filter `aged` with results → `.callout.warn`: *"{n} line(s) aged ≥30 days · **{capital} tied up** in slow stock. Consider a clearance or price drop."*

**Table `#catalogTable` — 11 columns.**

| Column | Cell |
|---|---|
| `Product` | `.strong` `brand + " " + model`; `.tiny.muted` = `[storage, color, ram]` filtered of `"—"` joined by `" · "`; `.tag-list` with `<span class="badge plain">Serialized|Batch</span>` + `<span class="badge info">{condition}</span>` when condition ≠ `New` |
| `SKU` | `.mono` `v.sku` |
| `Band` | `<span class="badge plain">{v.band}</span>` |
| `Price` (`.num`) | `.strong` `fmt.pkr(v.price)` |
| `Avg cost` (`.num`) | `.muted` `fmt.pkr(v.avgCost)` |
| `Stock` (`.num`) | `.strong` `s.available` + `.tiny.muted` holds line (`"{n} reserved"` / `"{n} inbound"` joined by `" · "`) |
| `30d sold` (`.num`) | `s.sold30` |
| `Unmet` | `<span class="badge neg">{n} unmet</span>` or `—` |
| `Days of cover` | `.meter` (class from `coverInfo`) with `width = clamp(0..100, round(d/21*100))` + label `"0 days · stockout"` when `available === 0`, else `"{d} days"` |
| `Age` | `—` when out of stock; `<span class="badge warn">{n}d</span>` when `>= 30`; else `.muted` `"{n}d"` |
| `Status` | badges from `statusBadges(s)` |

Row click → `location.href='product.html?id=' + v.id`. Hint `#shownCount` = `"{n} of {total} shown"`. Empty → `colspan="11"` `.empty` `🔍` / *"No matching products"*.

**Business-rule functions (exact thresholds).**

```js
function coverInfo(s){ var d=s.coverDays, cls="pos";
  if (d <= 3) cls="neg"; else if (d <= 7) cls="warn";
  return { cls, pct: Math.max(0, Math.min(100, Math.round(d/21*100))), days: d }; }

function statusBadges(s){ var out=[];
  if (s.available === 0) out.push({ cls:"neg", text: s.unmet > 0 ? "Out of stock · demand" : "Out of stock" });
  else if (s.available <= 3 || s.coverDays <= 3) out.push({ cls:"warn", text:"Low stock" });
  else out.push({ cls:"pos", text:"In stock" });
  if (s.available > 0 && s.ageDays >= 30) out.push({ cls:"warn", text:"Aged" });
  return out; }
```

**Drawer `#mvDrawer` — "Stock movements".** `.callout.info`: *"Recent quantity changes with reason and actor. The full, immutable ledger lives in [Reports → Stock movement ledger](reports.html)."* `#mvTimeline` maps **`DB.audit`** (not a movement ledger) into `.tl-item.done` rows: `.tl-time` = `"{a.time} · {a.actor}"`, `.tl-title` = `"{a.action} — {a.entity}"`, `.tl-desc` = `a.detail`. Foot: `Open full ledger` → `reports.html`; `Done` → close.

**Data entities consumed:** `DB.variants`, `DB.stock`, `DB.KPI.inventoryValue`, `DB.audit`, `DB.SHOP.branch`.

**Business rules visible:**
- **Variant (sellable definition) vs unit (physical IMEI)** is the core model distinction.
- Days-of-cover thresholds: **≤3 = critical (neg), ≤7 = warning, meter scale is 21 days = 100%**.
- **Aged = `ageDays >= 30`**; aged capital = `available × avgCost`.
- Low stock = `available <= 3 || coverDays <= 3`.

---

### 3.6 `product.html` — Product detail

| | |
|---|---|
| **File** | `prototype/product.html` |
| **`data-page`** | `inventory` (highlights the Inventory nav item) · **`<title>`** set at runtime to `"{name} · MobileShop OS"` |
| **Purpose** | Everything about one catalog variant across 9 tabs, with a recommended action. |
| **Proposed production route** | `/(app)/inventory/products/[variantId]` |
| **Inferred roles** | Owner, Manager, Purchaser. The Price-history, Recommendations and margin tiles depend on `See cost & margin`. |
| **Query param** | `?id={variantId}` — `params.get("id") || "V-IP17PM-256-BLK"`; falls back to `DB.variants[0]` if unknown |
| **Scripts** | `data.js` → `shell.js` → inline |

**Breadcrumb.** `Inventory` (→ `inventory.html`) `/` `#crumbName` (the variant name).

**Page head.** `#pName` = `fmt.variantName(id)`; `#pSub` = `<span class="mono">{sku}</span> · {condition} · {pta === "—" ? "Accessory" : pta}`. Actions: `#btn-reorder` = `Shell.svg("purchases") + " Reorder"` → `intelligence.html`; `#btn-sell` (`.btn-primary`) = `Shell.svg("sell") + " Sell this"` → `pos.html`.

**Recommended-action banner `#actionBanner`.** `recAction()` — evaluated in order:

```js
if (available === 0 && unmet > 0) → { label:"Stock deeper", cls:"neg",
    why:"Out of stock with {unmet} unmet request(s) — you are losing sales right now." }
if (ageDays >= 30)               → { label:"Clear aged stock", cls:"warn",
    why:"Oldest unit has sat {ageDays} days — capital is tied up, consider a promotion." }
if (unmet > available)           → { label:"Stock deeper", cls:"warn",
    why:"Demand ({unmet} unmet) is outpacing your {available} available unit(s)." }
else                             → { label:"Maintain", cls:"info",
    why:"Healthy cover and steady demand — no action needed today." }
```

Badge text map: `neg`→`Blocking`, `warn`→`Attention`, `info`→`Healthy`. The banner links `See the reasoning` → `showTab('recs')` and, when a recommendation exists, `Open buying plan →` → `intelligence.html`.

**KPIs — `.grid.cols-4#kpiRow`, 8 tiles**, each `onclick="showTab('{tab}')"`:

| Label | Value | Meta | → tab |
|---|---|---|---|
| Current price | `fmt.pkr(v.price)` | `"{band} band"` | `price` · `.accent` |
| Avg cost | `fmt.pkr(v.avgCost)` | `recorded landed cost` | `purchases` |
| Gross margin | `marginPct.toFixed(1) + "%"` | `"{fmt.pkr(perUnit)} per unit"` | `sales` |
| Days of cover | `st.coverDays` | `coverMeta` | `recs` |
| Available | `st.available` | `"{reserved} reserved · {inbound} inbound"` | `units` |
| Sold (30 days) | `st.sold30` | `units in last 30 days` | `sales` |
| Unmet demand | `st.unmet` | `requests while low / out` | `demand` · `.neg-text` when `> 0` |
| Aging | `st.ageDays + "d"` | `oldest unit in stock` | `units` · `.neg-text` when `>= 30` |

`perUnit = v.price - v.avgCost`; `marginPct = perUnit / v.price * 100`. `coverMeta` = `"Out of stock"` when `coverDays === 0`, `"Runs out soon"` when `<= 3`, else `"at current sales rate"`.

**Tabs — `#tabBar`, 9 panels.** `Overview`, `Units (n)`, `Sales`, `Demand`, `Purchases`, `Price history`, `Returns / defects`, `Recommendations`, `Audit`. `showTab(tid)` toggles `.tab.active` / `.tab-panel.active` and scrolls `#tabBar` into view.

| Tab | Content |
|---|---|
| **Overview** | Two cards. **Attributes** — `.kv` rows: `Brand`, `Model`, `RAM`, `Storage`, `Color`, `Condition`, `PTA status` (`"Not applicable"` when `"—"`), `Warranty`, `Price band`, `Tracking` (`"Serialized — by IMEI"` / `"Non-serialized — batch stock"`), `.divider`, `SKU`. **In plain language** — a generated prose paragraph (available/reserved/inbound, 30-day units, unmet requests, price vs cost, per-unit earnings, margin, cover, recommended action) + buttons `Sell this` → `pos.html`, `Reorder` → `intelligence.html`, `Record demand` → `demand.html`. |
| **Units** | Table `IMEI (primary)` \| `State` \| `Location` \| `Battery` \| `Grade` \| `Cost` (`.num`). Rows → `unit.html?id={u.id}`. IMEI cell appends `<span class="badge neg" title="{risks joined}">{n} flag</span>` when `u.risk.length`. Three distinct empty states: `📦` *"Batch stock — no IMEIs"* (non-serialized); `📇` *"IMEI records not loaded here"* (serialized with `available > 0` but no seed units); `📭` *"No units in stock"*. |
| **Sales** | Table `Invoice` \| `Time` \| `Customer` \| `Method` \| `Qty` \| `Unit price` \| `Line total`. Built by scanning `DB.sales[].items` through `nameMatches(itemName)`. **Every row → `finance.html`.** Empty → `.callout.info` *"The rollup shows **{sold30} sold in the last 30 days**, but no recent posted invoice in this window lists this exact model."* |
| **Demand** | Table `When` \| `Customer` \| `Requested` \| `Budget` \| `Urgency` \| `Outcome`. From `DB.demand.filter(x => x.variantId === id)`. **Every row → `demand.html`.** Hint `"{n} logged · {unmet} unmet"`. Empty → `🗣️` *"No recorded demand"*. |
| **Purchases** | Table `PO` \| `Date` \| `Supplier` \| `Status` \| `Received` (`"{received} / {units}"`) \| `Unit cost` (`po.total / po.units`) \| `Total`. Rows → `purchase-order.html?id={po.id}`. PO set built from `u.source.split("·")[0]`, plus POs whose `note` contains the model name or the recommendation id. Empty → `.callout.info` quoting the last landed cost. |
| **Price history** | **Illustrative** — three synthesized points: `~90 days ago` = `round100(avgCost × 0.962)`, `~45 days ago` = `round100(avgCost × 0.985)`, `Today` = `avgCost`. Columns `Point` \| `Landed cost` \| `List price` \| `Margin` \| `Note`. Preceded by `.callout.info`: *"Illustrative reference points — list price held at {price}. Live cost history comes from your purchase ledger."* |
| **Returns / defects** | Two KPI tiles: `Returns (30 days)` = `st.returns`; `Defect rate` = `(st.returns / st.sold30 * 100).toFixed(1) + "%"` (or `"—"`), meta `returns ÷ units sold`. Then table `Ref` \| `IMEI` \| `Reason` \| `Outcome` \| `Status` \| `When` → `returns.html`. Empty → `.callout.pos` *"No open returns, warranty claims or defects recorded for this product."* |
| **Recommendations** | Two cards. **Recommendation {id}** with a confidence badge and `.kv` rows: `Recommended quantity`, `Supplier`, `Unit cost` (`rec.cost/rec.qty`), `Order cost`, `Expected gross profit` (`.pos-text`), `Return on investment`, `Days of cover now`, `Confidence` (a `.confbar` meter at `rec.confPct`%). Buttons `Add to buying plan` → `openPlan()`, `Open full plan →` → `intelligence.html`. **Why the engine suggests this** — `rec.reasons` as a `<ul>`, plus a `.callout.warn` *"**Watch-outs:** {risks joined by ' · '}"*. Empty → `✅` *"No active reorder recommendation"*. |
| **Audit** | `.timeline` over `DB.audit` with `entityLink(e)` routing by prefix: `^INV-2026` → `finance.html`, `^PO-` → `purchases.html`, `^DM-` → `demand.html`, `^CS-` → `closing.html`, else plain text. Hint *"immutable record of critical actions"*. |

**Modal `#planModal` — "Add to buying plan".** `openPlan()` computes `newCover = rec.daysCover + Math.round(rec.qty / Math.max(st.sold30/30, 0.2))` and renders `.impact`:
- *"Order **{qty} × {name}** from {supplier}"*
- *"Commit **{cost}** of your buying budget"*
- *"Add an expected **{expProfit}** gross profit ({roi}% ROI)"*
- *"Raise days of cover from {daysCover} → ~{newCover} days"*

Foot: `Cancel` + `Add to plan` → `confirmPlan()` → close + `Shell.toast("{qty} × {model} added to buying plan", true)`. **Stub — the plan is not mutated.**

**Confidence class rule:** `High` → `pos`, `Medium` → `warn`, `Low` → `neg`.

**Data entities consumed:** `DB.variants`, `DB.stock`, `DB.units`, `DB.recommendations`, `DB.sales`, `DB.demand`, `DB.purchaseOrders`, `DB.returns`, `DB.audit`.

**Business rules visible:**
- Recommended action is **deterministic and ordered**: stockout+demand → aged → demand outpacing supply → maintain.
- Warranty default inference: `units[0].warranty` → else accessory `"Store 7-day"` → else `/Used/` condition `"Shop 7-day"` → else `"Official 1 yr"`.
- Defect rate = returns ÷ units sold (30d).

---

### 3.7 `unit.html` — Inventory unit (IMEI) detail

| | |
|---|---|
| **File** | `prototype/unit.html` |
| **`data-page`** | `inventory` · **`<title>`** `Inventory Unit · MobileShop OS` |
| **Purpose** | The single source of truth for one physical handset: identity, PTA, cost, state, movement timeline and audit. |
| **Proposed production route** | `/(app)/inventory/units/[unitId]` |
| **Inferred roles** | Owner, Manager, Purchaser (`Inventory adjustments` = `Full`), Technician (`Inventory adjustments` = `Limited`). |
| **Query param** | `?id={unitId}` — `params.get("id") || "INV-1042"`; falls back to `DB.units[0]` |
| **Scripts** | `data.js` → `shell.js` → inline |

**Breadcrumb `#crumb`.** `Inventory` → `inventory.html` / `{product}` → `product.html?id={variantId}` / `{unit.id}`.

**Page head.** `#pgTitle` = `"{unit.id} — {product}"`; `#pgSub` = `IMEI 1 <span class="mono">{imei1}</span> · serialized unit`; `#pgActions` = the state badge + `Move / adjust` button → `openMove()`.

**State badge model (exact).**

```js
const STATE = {
  available:            { cls: "pos",   text: "Available" },
  reserved:             { cls: "warn",  text: "Reserved" },
  sold:                 { cls: "plain", text: "Sold" },
  pending_verification: { cls: "neg",   text: "Quarantined" }
};
```

Note the mapping: the data value is `pending_verification`; the **UI label is "Quarantined"**.

**Derived values (all synthesized in-page).**

```js
const verified = !!unit.ptaVerifiedAt;
const last6    = (unit.imei1 || "").slice(-6);
const ptaRef   = "PTA-DIRBS-" + last6;          // fabricated reference
const freight  = Math.round((unit.cost || 0) * 0.004);   // per-unit share of transport/handling
const landed   = (unit.cost || 0) + freight;
const margin   = (unit.list || 0) - landed;
```

**Callout zone `#calloutZone`** — exactly one branch fires:

| Condition | Callout |
|---|---|
| `unit.risk.length` | `.callout.neg` `🚫` *"**Blocked from sale — {n} check(s) outstanding.**"* + a `<ul>` of `unit.risk` + *"This used device stays in **quarantine** until every gate passes. Verification file: [{udi.id}](used-intake.html?id={udi.id})."* **Plus** a follow-on card *"Used-device verification"* listing every `udi.gates[]` as `.spread` rows with `Passed` (`pos`) / `Pending` (`neg`) badges. |
| `state === "available"` | `.callout.pos` `✅` *"**Cleared for sale.** All identity and PTA checks passed. Live at **{location}**. [Open POS →](pos.html)"* |
| `state === "reserved"` | `.callout.warn` `⏳` *"**Reserved — not available for walk-in sale.** Held for a customer pickup. [See demand & reservations →](demand.html)"* |
| `state === "sold"` | `.callout.info` `📦` *"**Sold and removed from stock.** This record is retained for warranty and audit. Invoice [{sale.id}](finance.html) · {total}."* |

**Card "Unit details" — `#detailKv`, exact `.kv` rows in order:**

`IMEI 1` (mono) · `IMEI 2` (mono, or `— single physical SIM` when empty) · `Serial no.` (mono) · **divider** · `PTA status` (`Not applicable` when `"—"`, else `<span class="badge pos">✓ {pta}</span>`) · `PTA verified` (formatted date, or `<span class="badge warn">Awaiting verification</span>`) · `Verification ref` (mono `ptaRef`) · **divider** · `Current state` (badge) · `Location` (`#kvLocation`) · **divider** · `Purchase source` (via `sourceLink()`) · `Unit cost (invoice)` · `Freight & handling` · `Landed cost` (`.strong`) · `List price` · `Expected margin` (`.pos-text`/`.neg-text`) · **divider** · `Condition` · `Battery health` · `Grade` · **divider** · `Warranty` · `Warranty start` · `Warranty end (est.)`.

Battery annotation: `< 90` → `<span class="badge warn">below 90% threshold</span>`; `=== 100` → `<span class="badge pos">as new</span>`.

`sourceLink(src)`: matches `/PO-\d+/` → `purchase-order.html?id={po}`; `/UDI-\d+/` → `used-intake.html?id={udi}`; else plain text.

`warrantyEnd(startStr, warranty)`: parses `"(\d+)\s*yr"` → `setFullYear(+n)`, else `"(\d+)[\s-]*day"` → `setDate(+n)`, else `"—"`.

**Card "At a glance" — `#glance`.** `.kv` rows `State`, `Landed value` (`.strong`), `List price`, `Days in stock` (`st.ageDays` + `<span class="badge warn">aged</span>` when `> 30`), then `View all {model} stock →` → `product.html?id={variantId}`.

**Card "Immutability & audit trail".** Hint `Append-only`. `.callout.info` `🔒`: *"State never changes by editing this record — only through a **recorded movement**. Every movement is written to an append-only audit log with the actor, time and reason."* Table `#auditTable`: `Time` \| `Actor` \| `Action` \| `Entity` \| `Detail` — rendered from the **global `DB.audit`**, not unit-scoped.

**Card "Movement timeline".** Hint `#tlHint` = `"In verification"` when `pending_verification`, else `"Audited"`. Steps built by `steps[]`:
1. `Received into stock` — `.tl-time` = acquired date, desc `"Source: {sourceLink}"`. Always `done`.
2. `PTA & IMEI verified` — `done: verified`; time = verified date or `"Pending"`; desc = `"DIRBS clear · ref {ptaRef}"` or `"Awaiting PTA DIRBS + Police e-Gadget clearance"`.
3. Branch — if `pending_verification`: `Quarantined — checks pending` (`done: false`, time `"Now"`, desc *"Held in {location} until all gates pass. Not saleable."*). Otherwise `Marked available` (`done`), then optionally `Reserved for customer` (state `reserved`) and/or `Sold` (state `sold`, linking the invoice).

**Drawer `#moveDrawer` — "Record movement".** Intro: *"A unit's state only changes through a recorded, audited movement — never by editing the unit."*

| Field id | Type | Options |
|---|---|---|
| `#moveType` | `select.input`, `onchange="updateImpact()"` | `relocate` **Move location** · `reserve` **Reserve for customer** · `unreserve` **Release reservation** · `sold` **Mark as sold (via POS)** · `quarantine` **Send to quarantine** |
| `#moveLoc` | `select.input` inside `#locField` (shown only for `relocate`) | From `LOCATIONS = ["Store — Display", "Store — Counter", "Store — Safe", "Back store", "Intake — Quarantine"]`, reordered so the unit's current location is first |
| `#moveImpact` | `.impact` | Live impact list |

**`updateImpact()` — the impact text per movement type:**

| Type | Impact bullets |
|---|---|
| `relocate` | *"Physical location changes to **{to}**."* · *"Unit stays **available** — stock count unchanged."* · *"Logged as a location movement in the audit trail."* |
| `reserve` | *"State becomes **Reserved** — hidden from walk-in sale."* · *"Available count for {product} drops by 1."* · *"Reservation is time-boxed and audited."* |
| `unreserve` | *"State returns to **Available**."* · *"Available count for {product} rises by 1."* |
| `sold` | *"Sales are posted from POS, not here — this opens the checkout."* · *"Posting will remove IMEI {imei1} and record {list} revenue."* |
| `quarantine` | *"State becomes **Quarantined** — blocked from sale."* · *"Held until verification gates are re-checked."* |

**`recordMovement()`** closes the drawer and mutates only the DOM: `relocate` updates `#kvLocation` + toast `"Moved to {to} · recorded to audit log"`; `reserve` → `setState("warn","Reserved")`; `unreserve` → `setState("pos","Available")`; `quarantine` → `setState("neg","Quarantined")` (toast negative); `sold` → toast `"Sales are completed from POS — opening checkout"` (negative) but **does not navigate**. `setState` rewrites every `.js-state-badge`.

**Data entities consumed:** `DB.units`, `DB.variants` (via `fmt.variant`), `DB.stock`, `DB.sales`, `DB.usedIntakes`, `DB.audit`.

**Business rules visible:**
- **State changes only via a recorded movement**, never by editing the record — the central immutability rule.
- **Landed cost = invoice cost + freight share**; expected margin = list − landed.
- Battery threshold **90%**.
- A used device with outstanding risks is **blocked from sale** and cross-links to its `UDI-` intake file.
- Sales are posted from POS only.

---

### 3.8 `purchases.html` — Purchases & Receiving

| | |
|---|---|
| **File** | `prototype/purchases.html` |
| **`data-page`** | `purchases` · **`<title>`** `Purchases · MobileShop OS` |
| **Purpose** | PO list + lifecycle explainer. Teaches that **receiving**, not approval, creates stock. |
| **Proposed production route** | `/(app)/purchases` |
| **Inferred roles** | Purchaser (`Purchasing & suppliers` = `Full`), Manager, Owner. Accountant view-only. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Purchases & Receiving"`; subtitle *"Order stock from suppliers and receive it into inventory — a phone only becomes sellable once its units are **received**."* Actions: `Suppliers` → `suppliers.html`; `#btn-newpo` (`.btn-primary`) = `Shell.svg("purchases") + " New purchase order"` → `Shell.open('newpo')`.

**KPIs — `.grid.cols-4#kpiRow`.**

| Id | Label | Value | Meta | Action |
|---|---|---|---|---|
| `#kpiOpen` | Open purchase orders | `#vOpen` = `POS.filter(isOpen).length` | `awaiting receipt` | `setFilter('open')` · `.accent` |
| `#kpiTransit` | Units in transit | `#vTransit` = Σ `(units − received)` over in-transit POs | `#vTransitMeta` = `"across {n} orders"` | `setFilter('transit')` |
| *(anchor)* | Supplier payables | `fmt.pkr(DB.KPI.payables)` | `due to suppliers →` | `href="finance.html"` |
| `#kpiDraft` | Draft POs | `#vDraft` = `POS.filter(isDraft).length` | `need approval` | `setFilter('draft')` |

Predicates: `isOpen(p)` = `status !== "received" && status !== "closed"`; `isTransit(p)` = `status === "ordered" || status === "partially_received"`; `isDraft(p)` = `status === "draft"`.

**Card "Purchase order lifecycle".** Hint *"how a PO moves from intent to stock"*. `#flowRow` renders the `FLOW` array as badges joined by `→`:

```js
var FLOW = ["draft", "approved", "ordered", "partially_received", "received", "closed"];
var STATUS = {
  draft:              { cls: "plain",  label: "Draft" },
  approved:           { cls: "info",   label: "Approved" },
  ordered:            { cls: "accent", label: "Ordered" },
  partially_received: { cls: "warn",   label: "Partially received" },
  received:           { cls: "pos",    label: "Received" },
  closed:             { cls: "plain",  label: "Closed" }
};
```

`.callout.info`: *"**An approved PO does not create available stock.** Units become sellable only when you *receive* them — receiving is the step that adds phones to inventory and books their cost."*

**Auto-draft callout** (`.callout.info`, **hardcoded**): *"Draft `PO-2045` (3× iPhone 17 Pro Max) was generated automatically from reorder recommendation `R-06`. [Review the reasoning & confidence →](intelligence.html)"*

> **Data inconsistency (defect).** This callout cites `R-06`, but `DB.purchaseOrders` PO-2045's own `note` reads `"Draft from reorder recommendation R-08"` — and **`R-08` does not exist** in `DB.recommendations` (which runs `R-01`…`R-07`). Two contradictory sources plus one dangling reference.

**Table `#poTable` — 9 columns.**

| Column | Cell |
|---|---|
| `PO` | `.mono.strong` `p.id` |
| `Supplier` | `p.supplier` |
| `Date` | `.muted.nowrap` `p.date` |
| `Status` | `<span class="badge {cls}">{label}</span>` |
| `Lines` (`.num`) | `p.lines` |
| `Units` (`.num`) | `p.units` |
| `Received` | a 70px `.meter` at `round(received/units*100)`% + `.tiny.muted` `"{received}/{units}"` |
| `Total` (`.num`) | `.strong` `fmt.pkr(p.total)` |
| `Note` | `.muted.small` `p.note` (`max-width:190px`) |

Row click → `purchase-order.html?id={p.id}`. `meterFor(p)`: `pct >= 100 && p.units` → `pos`; `received > 0` → `warn`; else `""`.

**Filters.** `FILTERS` = `all` *"All purchase orders"* / `open` *"Open — awaiting receipt"* / `transit` *"In transit — ordered / partially received"* / `draft` *"Draft — needs approval"*. `#filterLabel` = `"{label} · {n} shown"`; `#resetFilter` (`Show all`) appears only when the filter ≠ `all`. The active KPI tile is highlighted by setting `style.borderColor = "var(--accent)"` — **border only, so status is never colour-alone**. Empty → `colspan="9"` `.empty` with the purchases icon.

**Drawer `#newpo` — "New purchase order"** (backdrop click closes).

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#poSupplier` | `select.input` | `Supplier` | Options = `DB.suppliers` (`value=s.id`, text `s.name`) |
| `#poSupplierHelp` | `.help` | — | Live: `"{terms} · ~{leadTime}-day lead · on-time {onTime}% · {brands}"` via `syncSupplierHelp()` |
| `#poNote` | `textarea.input[rows=2]` | `Order note` | placeholder *"e.g. Hot 50 restock — 8 customers waiting"*; help *"Add line items on the PO detail screen after the draft is created."* |

`.impact` — *"What creating this PO does"*: *"Records your intent to buy — it appears as a `Draft` awaiting approval."* · *"Does **not** reserve cash or add any stock."* · *"Inventory and cost update only when the units are **received**."* Foot: `Cancel` + `Create draft PO` → `createPO()`.

**`createPO()`.** New id = `"PO-" + (maxN + 1)` where `maxN` = highest numeric suffix in `POS` seeded from `2000`. Note defaults to `"Manual draft — add line items on the PO"`. Prepends to the local `POS` array (a `DB.purchaseOrders.slice()` working copy), sets `lines: 0, units: 0, total: 0, received: 0`, date = `DB.SHOP.businessDate`, switches the filter to `draft`, re-renders, and toasts `"Draft {id} created — no stock added until you receive it"`. **Session-only.**

**Data entities consumed:** `DB.purchaseOrders`, `DB.suppliers`, `DB.KPI.payables`, `DB.SHOP.businessDate`.

**Business rules visible:**
- **Receiving — not approval — creates stock.** Stated three times (lifecycle callout, new-PO impact, the receiving screen).
- PO lifecycle: `draft → approved → ordered → partially_received → received → closed`.
- A draft PO can be **auto-generated from a reorder recommendation**.

---

### 3.9 `purchase-order.html` — Purchase order detail & goods receipt

| | |
|---|---|
| **File** | `prototype/purchase-order.html` |
| **`data-page`** | `purchases` · **`<title>`** `Purchase Order · MobileShop OS` |
| **Purpose** | The receiving screen: scan each IMEI, block duplicates, post a goods receipt with an impact summary. |
| **Proposed production route** | `/(app)/purchases/[poId]` |
| **Inferred roles** | Purchaser (`Purchasing & suppliers` = `Full`), Manager, Owner. |
| **Query param** | `?id={poId}` — `params.get("id") || "PO-2043"`; falls back to `DB.purchaseOrders[0]` |
| **Scripts** | `data.js` → `shell.js` → inline |

> **Critical prototype limitation.** The order lines are **hardcoded for PO-2043 only** and do not vary with `?id=`. Whatever PO you open, you see the Galaxy A16 + Galaxy A55 lines and the "Partially received" explanation. See §5.

**Hardcoded line constants.**

```js
const A16_UNIT = 36000, A16_QTY = 10, A16_FREIGHT = 250;
const A55_UNIT = 100800, A55_QTY = 2;
const A16_LANDED = A16_UNIT + A16_FREIGHT;   // 36,250
```

`lines[]` = `V-A16-128-BLK` (10 ordered, 0 received, serialized) and `V-A55-256-NVY` (2 ordered, 2 received, serialized). `linesTotal` = `10×36,000 + 2×100,800` = **561,600**, which the comment notes *"sums to po.total (561,600) — keeps the page internally consistent"*. `totalUnits` = 12.

**Breadcrumb.** `Purchases` → `purchases.html` / `{po.id}`.

**Page head.** `#pgTitle` = `"{po.id} — {po.supplier}"`; `#pgSub` = `"Placed {po.date} · {po.note}"`. `#pgActions`: the status badge (`.js-status`), then `Approve` (**only when `po.status === "draft"`**) → `approve()`, then `Receive stock` (`.btn-primary`) → `receiveScroll()`.

**Table `#linesTable` — 7 columns + tfoot.**

| Column | Cell |
|---|---|
| `Product` | `.strong` name + `.tiny.mono.muted` SKU |
| `Type` | `<span class="badge info">Serialized · IMEI</span>` or `<span class="badge plain">Batch qty</span>` |
| `Ordered` (`.num`) | `l.ordered` |
| `Unit cost` (`.num`) | `fmt.pkr(l.unit)` |
| `Received` (`.num`) | `l.received`, classed `pos-text` when complete, `""` when partial, `muted` when zero; carries `.js-line-recv` |
| `Remaining` (`.num`) | `ordered − received`; carries `.js-line-rem` |
| `Line total` (`.num`) | `.strong` `fmt.pkr(ordered × unit)` |

Row click → `product.html?id={l.vid}`. `tfoot`: `Order total` \| totalUnits \| — \| `.js-total-recv` \| `.js-total-rem` \| `fmt.pkr(linesTotal)`.

**Receiving panel `#receiving`.** Head *"Goods receipt — receiving"*, hint *"Scan each unit"*. `.callout.info` `📦`: *"**Receiving — not PO approval — is what creates stock.** Approving a PO commits to buy; nothing enters inventory until the goods physically arrive and are received here. Each serialized phone is **scanned individually**, so every unit in stock traces back to this goods receipt by its own IMEI."*

*Left — serialized IMEI capture.* Header `Galaxy A16 128 GB — serialized` + `#capCount` badge `"0 / 10 captured"`. Sub-note: *"Scan or type each unit's IMEI. Duplicates are blocked against existing inventory and this receipt."* `.meter.warn` `#capMeter`.

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#imeiInput` | `input.input.mono[inputmode=numeric][autocomplete=off]` | `Unit IMEI` | placeholder `Scan or type 15-digit IMEI`; `onkeydown` Enter → `addImei()` |
| — | `.btn.btn-primary` | `Add IMEI` | → `addImei()` |
| `#imeiMsg` | div | — | Validation callouts |
| `#capList` | `.tag-list` | `Captured this receipt` | Chips with an inline `✕` → `removeImei(i)` |

*Right column.* **Landed cost** `.kv` rows: `Invoice unit cost` (`#lcCost`), `Freight & handling / unit` (`#lcFreight`), `Landed cost / unit` (`#lcLanded`, `.strong`); help *"Received units enter inventory at landed cost — freight is spread across the units on the delivery."* **Already received** — `Galaxy A55 256 GB — already received`, badge `2 / 2 done`, `#a55List` chips for the hardcoded `a55Imeis = ["356789012345671", "356789012345681"]`. **Batch pattern demo** (dashed box): *"How batch (accessory) lines receive — illustrative"* / *"Non-serialized items don't capture IMEIs. You just enter a received quantity; landed cost is per unit."* with `#batchQty` (`type=number`, `min=0`, value `40`, label `Spigen A55 Case · qty received`) + `Confirm qty` → `batchConfirm()` → toast `"{q} accessory units added to batch stock (no serials)"`. Note: *"Landed Rs 685 / unit · adds to batch stock, no serial numbers."*

*Footer.* `#postHint` + `#postBtn` (`.btn-pos`, `disabled` until ≥1 IMEI) → `openPost()`.

**`addImei()` — validation ladder (in order):**

| Check | Result |
|---|---|
| Empty | Refocus, no message |
| `!/^\d{14,16}$/.test(raw)` | `.callout.warn` ⚠️ *"Enter a valid 15-digit IMEI (digits only)."* — **note the regex accepts 14–16 digits while the copy says 15** |
| Already in `captured[]` | `.callout.neg` 🚫 *"IMEI {raw} was already scanned in this receipt."* + `inp.select()` |
| In `existing{}` | `.callout.neg` 🚫 *"IMEI {raw} already belongs to inventory unit [{id}](unit.html?id={id}) received on {date}. Refused — every phone must be unique."* |
| `captured.length >= A16_QTY` | `.callout.warn` ⚠️ *"All 10 ordered units are already captured. Remove one to swap it."* |
| Pass | Push, clear, refocus, re-render. At exactly `A16_QTY` → `.callout.pos` ✅ *"Full batch scanned — all 10 units captured. Ready to post."* |

`existing{}` is built from every `DB.units` `imei1` and `imei2`, plus an explicit seed: `existing["354001234567891"] = { id: "INV-1061", date: "08 Jul 2026" }` (the comment says *"ensure the seeded demo IMEI resolves as specified"*).

**Modal `#postModal` — "Post goods receipt".** Intro: *"This records the physical arrival of stock. It cannot be undone by editing — only by a reversing movement."* `.impact` from `openPost()`:
- *"Creates **{n}** serialized inventory unit(s) for **Galaxy A16 128 GB** — one per scanned IMEI — in **Available** / Pending-verification state."*
- *"Increases inventory value by **{n × 36,250}** at landed cost (Rs 36,250 / unit)."*
- *"Increases payable to **{supplier}** by **{n × 36,000}**, due on {supplier.terms}."*
- *"PO {id} → **Received** ({new}/{total})"* or *"**Partially received** ({new}/{total})"*.

Then `.callout.info` 🔒: *"Each captured IMEI becomes its own inventory unit with an append-only audit trail. Units needing PTA / e-Gadget checks are held in **Pending verification** before going Available."* Foot: `Cancel` + `Confirm & post receipt` (`.btn-pos`) → `confirmPost()`.

**`confirmPost()`.** Increments the local `received`, sets `lines[0].received = n`, re-renders the meter, and — **when `received >= totalUnits`** — flips every `.js-status` badge to `pos`/`Received`, swaps `#statusExplain`'s parent to `.callout.pos` with *"**Fully received.** All 12 units are in stock. This PO is complete."*, disables `#postBtn`, and rewrites `#postHint` to `"✓ {n} unit(s) posted into inventory."` Toast: `"Goods receipt posted"`. **`DB` is never mutated.**

**`approve()`.** Flips every `.js-status` to `info`/`Approved`, removes `#approveBtn`, toasts *"PO approved — commitment to buy recorded. Stock is created on receiving."*

**`receiveScroll()`.** Scrolls `#receiving` into view, then focuses `#imeiInput` after 350ms.

**Right column.** *Summary* card `.kv`: `Supplier` (link → `suppliers.html`), `Payment terms`, `Status`, `Lines` (`"2 (2 serialized)"`), `Units ordered`, `Order total`. Received progress: `#recvLabel` `"{received} / {total} units"`, `#recvMeter` (class flips `warn`→`pos` at 100%), `#recvNote` = *"All units received — this PO is complete."* or *"{n} units still to receive."* *Supplier* card `.kv`: `Contact`, `Terms`, `Lead time`, `On-time delivery` (badge: `>=90` → `pos`, `>=80` → `warn`, else `neg`), `Rating`, `Outstanding payable`. Then a `.callout.warn` `#statusExplain` — **hardcoded** *"**Partially received.** {po.received} of 12 units are in stock (the Galaxy A55 pair). The Galaxy A16 batch is still to be received below."*

**Data entities consumed:** `DB.purchaseOrders`, `DB.suppliers`, `DB.variants`, `DB.units` (for duplicate detection).

**Business rules visible:**
- **Duplicate IMEIs are refused** — against both the current receipt and all existing inventory. *"every phone must be unique."*
- **Receiving creates stock**, and each unit traces to its goods receipt by IMEI.
- **Landed cost = invoice cost + freight/unit**; freight is spread across the delivery.
- Receiving **increases the supplier payable** on the supplier's terms.
- Units needing PTA / e-Gadget checks land in **Pending verification**, not Available.
- Receipts are **reversed by a reversing movement, never edited**.
- Batch (accessory) lines receive by **quantity only, no serials**.

---

### 3.10 `suppliers.html` — Suppliers

| | |
|---|---|
| **File** | `prototype/suppliers.html` |
| **`data-page`** | `suppliers` · **`<title>`** `Suppliers · MobileShop OS` |
| **Purpose** | Supplier list with reliability, terms, payables and per-supplier payment recording. |
| **Proposed production route** | `/(app)/suppliers` (drawer → `/(app)/suppliers/[supplierId]`) |
| **Inferred roles** | Purchaser (`Purchasing & suppliers` = `Full`), Manager, Owner. Accountant `View`. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page head.** `<h1>` `Suppliers`; `#supSub` computed → `"{n} suppliers · avg {avgLead}-day lead time · {fmt.pkr(totalPayable())} outstanding to pay"`. Actions: `#supSearch` (`placeholder="Search name, brand, contact…"`, `oninput="filterSup()"`); `#btn-add` (`.btn-primary`) = `Shell.svg("suppliers") + " Add supplier"` → **`Shell.toast('Add-supplier form is illustrative in this prototype')` — a stub with no form**.

**KPIs — `.grid.cols-4#kpiRow`** (re-rendered by `renderKpis()` after a payment):

| Label | Value | Meta |
|---|---|---|
| Suppliers | `suppliers.length` | `"{n} A-rated"` |
| Avg lead time | `avgLead.toFixed(1) + " days"` | `order to delivery` |
| Avg on-time delivery | `Math.round(avgOnTime*10)/10 + "%"` | `weighted across suppliers` |
| Total payables | `fmt.pkr(totalPayable())` | `owed to suppliers` · `href="finance.html"` · `.accent` · `.neg-text` when `> 0` |

> The `Avg on-time delivery` meta says *"weighted across suppliers"* but `avg()` is an **unweighted arithmetic mean** of `s.onTime`.

**Table `#supBody` — 8 columns.** Head hint *"Click a row to open the supplier"*.

| Column | Cell |
|---|---|
| `Supplier` | `.strong` name + `.tiny.muted.mono` `s.id` |
| `Contact` | `.small` `s.contact` |
| `Terms` | `<span class="badge plain">{s.terms}</span>` |
| `Lead time` (`.num`) | `"{s.leadTime} days"` |
| `On-time delivery` | a `.confbar` `.meter` at `s.onTime`% + `"{n}%"` + `.tiny.muted` `onTimeLabel(n)` |
| `Payable` (`.num`) | `<span class="neg-text">{amount}</span>` or `<span class="muted">Rs 0</span>`; cell id `#pay-{s.id}` |
| `Rating` | `<span class="badge pos">✓ Rating A</span>` or `<span class="badge warn"><span class="dot-i"></span>Rating {r}</span>` |
| `Brands` | `.small.muted` `s.brands` |

Rows carry `data-search="{name} {contact} {brands} {terms}"` (lowercased) for `filterSup()`; a `#noResults` row (`colspan=8`) shows `🔍` / *"No matching suppliers"* / *"Try a different name, brand or contact."*

**Reliability thresholds (exact).**

```js
function onTimeCls(pct)   { return pct >= 90 ? "pos" : pct >= 80 ? "warn" : "neg"; }
function onTimeLabel(pct) { return pct >= 90 ? "Very reliable" : pct >= 80 ? "Mostly on time" : "Often late"; }
```

**Drawer `#supDrawer` — supplier detail** (backdrop click closes). Foot: `View in Finance` → `finance.html`; `New purchase order` (`.btn-primary`) → `purchases.html`.

Body, in order:
1. Header — name, `.mono` `"{id} · {brands}"`, rating badge.
2. Card `.kv`: `Contact`, `Payment terms`, `Lead time` (`"{n} days (order to delivery)"`), `On-time delivery` (badge `"{n}% · {label}"`).
3. **Delivery reliability** meter at `s.onTime`%. When `onTimeCls === "neg"`, a `.callout.warn`: *"Only **{n}%** of orders arrive on time. Add buffer days when reordering critical stock from this supplier."*
4. **Recent buying price** — heading + `<span class="tiny muted">Illustrative</span>`. Uses `repVariant` to pick one representative variant per supplier:

   ```js
   var repVariant = {
     "TechSource Intl":      "V-IP17PM-256-BLK",
     "Galaxy Distributors":  "V-A55-256-NVY",
     "Infinix Wholesale":    "V-HOT50-256-GRN",
     "AccessoryHub Lahore":  "V-CBL-TYPEC-1M"
   };
   ```

   `priceHistory(v)` **synthesizes** three points, rounded to a step of `500` (base ≥10,000) or `10`: `12 May 2026` = `avgCost × 0.99`, `20 Jun 2026` = `avgCost × 1.02`, `12 Jul 2026` = `avgCost` (`latest`). Table columns `Date` \| `Unit cost` \| `Change` — change renders `▲ {d}` in `.neg-text` (cost up = bad) and `▼ {d}` in `.pos-text` (cost down = good).
5. **Outstanding payable** `#payBlock` — see below.
6. **Purchase orders** for this supplier (`DB.purchaseOrders.filter(o => o.supplier === s.name)`) — each an `<a class="attn-card" href="purchase-order.html?id={o.id}">` with `"{id} · {total}"`, `"{date} · {units} units · {note}"`, a status badge and a chevron. Empty → `.callout.info` pointing at `purchases.html`.

**`payableBlock(s)`.** When paid off → `.callout.pos` *"No outstanding balance — this supplier is fully paid."* Otherwise a card with `Amount due` and an `.impact`:
- *"Reduce total payables by **{p}**"*
- *"Move **{p}** out of {s.terms.indexOf("Cash") >= 0 ? "cash drawer" : "bank"}"*
- *"Clear {name} dues and log the payment to the audit trail"*

plus `Record payment of {p}` (`.btn-primary.btn-block`) → `recordPayment(s.id)`.

**`recordPayment(id)`.** Sets `paid[id] = true` (session-only), re-renders `#payBlock`, the `#pay-{id}` table cell, the KPI row and `#supSub`; toasts `"Payment of {amt} recorded to {name}"`. `payableOf(s)` = `paid[s.id] ? 0 : s.payable`.

**Data entities consumed:** `DB.suppliers`, `DB.purchaseOrders`, `DB.variants` (via `fmt.variant`).

**Business rules visible:**
- On-time thresholds **90% / 80%**; below 80% prompts buffer days on reorder.
- The payment source is inferred from terms: `"Cash on delivery"` → cash drawer, otherwise bank.
- Payments are logged to the audit trail.

---

### 3.11 `returns.html` — Returns & Warranty

| | |
|---|---|
| **File** | `prototype/returns.html` |
| **`data-page`** | `returns` · **`<title>`** `Returns & Warranty · MobileShop OS` |
| **Purpose** | Take back devices safely: verify the original sale, inspect, then decide an outcome — never straight back to Available. |
| **Proposed production route** | `/(app)/returns` |
| **Inferred roles** | Manager (`Refunds & returns` = `Full`), Owner. Technician `Limited`. **Salesperson `None`.** |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page-scoped CSS.** `.chipset`, `.chip(.active)` with `data-tone` overrides — `.chip.active[data-tone="warn"]` uses `--warn-soft`/`--warn`; `[data-tone="neg"]` uses `--neg-soft`/`--neg`; default active uses `--accent-soft`/`--accent`.

**Page head.** `<h1>` `"Returns & Warranty"`; subtitle *"Take back faulty or unwanted devices safely — every unit passes inspection before it can be sold again."* Actions: `Returns report →` (`.btn-ghost`) → `reports.html`; `#btn-new` (`.btn-primary`) = `Shell.svg("returns") + " New return"` → `openNew()`.

**Gate callout `#gateCallout`** (`.callout.info`): *"A returned unit never goes **straight back to Available**. It is verified against the original sale, inspected, then either restocked, quarantined, claimed on warranty, or written off — with a full audit trail."*

**KPIs — `.grid.cols-4#kpiRow`.**

| Label | Value | Meta | Action |
|---|---|---|---|
| Open returns | non-warranty rows not matching `/restock\|written\|done\|complete/i` | `in the returns queue` | `switchTab('returns')` · `.accent` |
| In inspection | rows matching `/inspection/i` | `must clear QC before restock` | `switchTab('returns')` |
| Warranty claims | `rs.filter(isWar).length` | `supplier / customer` | `switchTab('warranty')` |
| Return rate | `(totRet / totSold * 100).toFixed(1) + "%"` | `"{totRet} returned / {totSold} sold (30d) · illustrative"` | `href="reports.html"` |

`totRet` / `totSold` are summed across **every** `DB.stock` key (`returns` and `sold30`), i.e. a whole-catalog rate, not per-case.

**Tabs `#tabs`.** `Returns` (badge `#cntReturns`) / `Warranty claims` (badge `#cntWar`). `isWar(r)` = `r.id.indexOf("WAR") === 0` — **the split is by id prefix**.

**Tables `#returnsTable` / `#warrantyTable` — identical 8 columns.**

| Column | Cell |
|---|---|
| `Return` / `Claim` | `.mono` `r.id` |
| `Original sale` | `<a class="mono" href="finance.html" onclick="event.stopPropagation()">{r.sale}</a>` |
| `Item` | `r.item` |
| `IMEI` | `.mono` or `<span class="muted">—</span>` |
| `Reason` | `r.reason` |
| `Condition` | badge via `conditionCls` |
| `Outcome` | badge via `outcomeCls` |
| `Status` | `statusBadge(s)` — always includes `<span class="dot-i"></span>` + the text |

Row click → `openReturn(r.id)`. Empty states: `#emptyReturns` (`↩️` / *"No returns in the queue"* / *"Nothing to inspect right now…"* + a `New return` button) and `#emptyWar` (`🛡️` / *"No open warranty claims"*).

**Class mapping functions (exact).**

```js
function statusCls(s){ s=(s||"").toLowerCase();
  if (/restock|done|complete/.test(s)) return "pos";
  if (/quarantine/.test(s))            return "warn";
  if (/written|write-off/.test(s))     return "neg";
  if (/open/.test(s))                  return "warn";
  if (/inspection/.test(s))            return "info";
  if (/progress|supplier/.test(s))     return "accent";
  return "plain"; }

function outcomeCls(o){ o=(o||"").toLowerCase();
  if (/write-off/.test(o))  return "neg";
  if (/quarantine/.test(o)) return "warn";
  if (/restock/.test(o))    return "info";
  return "plain"; }

function conditionCls(c){ c=(c||"").toLowerCase();
  if (/damaged/.test(c)) return "neg";
  if (/faulty/.test(c))  return "warn";
  if (/new/.test(c))     return "pos";   // matches "New" AND "Like new"
  return "plain"; }
```

**Drawer `#returnDrawer` — the workflow.** Title `"{id} · {item}"`. Foot: `Cancel` + `Process return` (`.btn-primary`) → `processReturn()`.

Body sections:
1. **Badge row** — status, outcome, `"{condition} on return"`.
2. **Original sale & device match** — a `.callout.pos` *"**Purchase verified.**"* with `verifyLine` = *"IMEI {imei} matched against original sale [{sale}](finance.html)."* for serialized items, or *"Accessory line matched on invoice [{sale}](finance.html) (non-serialized item)."* Then `.kv` rows `Original sale`, `Item`, `IMEI` (`"— (accessory)"` when absent), and `Catalog match` (the SKU) when `findVariant()` resolves.
3. **Reason & evidence** — `.kv` `Reason`, then an *"EVIDENCE ON FILE"* card. `evidenceFor(r)` returns `r.evidence` if set, else a canned string per reason:
   - `"Not charging (DOA)"` → *"Bench test: unit will not power on or take charge. Confirmed dead-on-arrival, still inside the return window."*
   - `"Customer changed mind"` → *"Returned sealed / like-new. Change-of-mind inside the 3-day window. No fault found on inspection."*
   - `"Battery draining fast"` → *"Battery health 79%. Drains ~1%/min at idle. Device is inside its official 1-year warranty."*
   - fallback → *"Reported by customer at the counter. Pending bench verification during inspection."*
4. **Workflow timeline** — 5 fixed steps, `done` when `i < stageOf(r)`: `Received at counter` (*"{date} · logged as {id}"*), `Original sale verified` (*"Matched to {sale}"*), `Inspection (QC gate)` (*"Passed — decision recorded"* / *"In progress — device on the bench"* / *"Queued"*), `Outcome decided` (the outcome or *"Choose below"*), `Closed` (*"Case closed · {status}"* or `—`).

   ```js
   function stageOf(r){ var s=(r.status||"").toLowerCase();
     if (/restock|written|done|complete/.test(s)) return 4;   // closed
     if (/progress|quarantine|supplier/.test(s))  return 3;    // outcome decided
     if (/inspection/.test(s))                    return 2;    // inspecting now
     return 1; }                                               // verified, awaiting inspection
   ```
5. **Inspection gate warning** — `.callout.warn`: *"A returned unit **cannot go straight to Available** — it must pass inspection first. Choose what happens next."*
6. **Outcome chips `#outcomeChips`** — from `CHIPS`:

   | `v` | label | tone |
   |---|---|---|
   | `restock` | Restock after inspection | `accent` |
   | `quarantine` | Quarantine | `warn` |
   | `supplier` | Supplier warranty | `accent` |
   | `writeoff` | Write-off | `neg` |

   Pre-selected via `chipForOutcome(r.outcome)`, which returns `null` for `"Customer warranty claim"` — the comment reads *"owner still decides"*.
7. **Impact box `#impactBox`** — live per chip:

   | Chip | `.impact` bullets |
   |---|---|
   | *(none)* | `.callout.info` *"Pick an outcome above to see exactly what it does to stock and the books."* |
   | `restock` | *"Unit passes inspection and is marked **saleable** again"* · *"IMEI {imei} returns to **Available** in inventory"* (or *"1 unit returns to accessory / batch stock"*) · *"Stock ledger + audit entry recorded against {id}"* |
   | `quarantine` | *"Unit moved to **Quarantine** — held out of saleable stock"* · *"Not counted as Available; flagged for a follow-up decision"* · *"Audit entry recorded against {id}"* |
   | `supplier` | *"Raises a **supplier warranty claim** against {brand}"* · *"Unit removed from saleable stock while awaiting replacement / credit"* · *"Payable / receivable adjusts when the claim is settled"* |
   | `writeoff` | *"Records an inventory **write-off** — unit removed permanently"* · *"Loss booked: **{avgCost}** at recorded cost"* · *"Reduces inventory value; audit entry recorded against {id}"* |

**`processReturn()`.** Blocks with `Shell.toast("Pick an outcome first", false)` when no chip is selected. Otherwise applies:

```js
restock    → { status: "Restocked",   outcome: "Restock after inspection" }
quarantine → { status: "Quarantine",  outcome: "Quarantine" }
supplier   → { status: "In progress", outcome: "Supplier warranty" }
writeoff   → { status: "Written off", outcome: "Write-off" }
```

then re-renders KPIs + tables, closes, toasts `"{id} processed — {outcome}"`. Mutates only `state.returns` (a copy).

**Drawer `#newDrawer` — "New return".**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#nrInvoice` | `input.input` | `Look up the original sale` | placeholder `Invoice no. — e.g. INV-2026-0711`; paired with a `Look up` button → `lookupSale()`. Help: *"A return can't be accepted without proof of purchase. Try `INV-2026-0711` (found) vs any other number (blocked)."* |
| `#nrLookupResult` | div | — | Verified / blocked callout |
| `#nrItem` | `select.input` | `Item being returned` | Every `DB.variants` entry + `Other / not in catalog` (`__other`) |
| `#nrReason` | `select.input` | `Reason for return` | `Not charging (DOA)`, `Defective / not powering on`, `Battery draining fast`, `Screen / display fault`, `Customer changed mind`, `Wrong item delivered`, `Software / setup issue`, `Other` |
| `#nrCondition` | `select.input` | `Condition on return` | `Like new`, `New`, `Used`, `Faulty`, `Damaged` |
| `#nrEvidence` | `textarea.input[rows=2]` | `Evidence note` | placeholder *"What you observed — bench test result, box/seal state, battery health…"*; help *"Recorded with the case so the inspection decision is defensible."* |

`.callout.warn`: *"Saving logs the return into **Inspection** — the unit is held out of saleable stock until it clears QC."* Foot: `Cancel` + `Save to inspection` → `saveReturn()`.

**`lookupSale()`.** `validInvoices` = every `DB.sales` id **plus** every `DB.returns[].sale`, upper-cased. Hit → `.callout.pos` *"**Sale found — {id}.** Proof of purchase verified; you can accept this return."* + a `Lines:` list when the record has `items`. Miss → `.callout.neg` *"**Blocked — no matching sale.** A return can't be accepted without the original invoice. Check the number or search the customer."*

**`saveReturn()`.** Blocks on an empty invoice (`"Look up the original sale first"`) and on an unknown invoice (`"Blocked — no matching sale for {invoice}"`). New id = `"RTN-" + String(seqRtn++).padStart(3,"0")` starting at **`seqRtn = 92`** (seed ends at `RTN-091`). Forced defaults: `imei: "—"`, `outcome: "Restock after inspection"`, `status: "Inspection"`, `date: "Today"`. Evidence falls back to `evidenceFor({reason})`. Then re-render, `switchTab("returns")`, close, toast `"{id} logged into inspection"`, reset the form.

**Data entities consumed:** `DB.returns` (copied), `DB.sales`, `DB.variants`, `DB.stock`.

**Business rules visible:**
- **Proof of purchase is mandatory** — no invoice, no return (enforced at lookup *and* at save).
- **A returned unit never goes straight back to Available** — inspection is a hard QC gate.
- Four terminal outcomes: restock / quarantine / supplier warranty / write-off, each with a distinct stock + books impact.
- Evidence is recorded *"so the inspection decision is defensible"*.
- Change-of-mind has a **3-day window** (per the canned evidence string; `settings.html` makes it configurable — see §3.20).

---

### 3.12 `repairs.html` — Repairs

| | |
|---|---|
| **File** | `prototype/repairs.html` |
| **`data-page`** | `repairs` · **`<title>`** `Repairs · MobileShop OS` |
| **Purpose** | A kanban workshop board: intake → parts → bench → pickup. **Explicitly optional at launch.** |
| **Proposed production route** | `/(app)/repairs` |
| **Inferred roles** | Technician (*"Handles repairs and inspections and updates job status — no pricing, no sales"*), Manager, Owner. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Page-scoped CSS.** `.kanban` (horizontal scroll), `.kb-col` (fixed `262px`, `.focus` adds an accent ring), `.kb-head`, `.kb-body`, `.rep-card` (hover lift), `.rep-cost`, `.rep-foot`, `.rep-tech`, `.rep-empty`.

**Page head.** `<h1>` `Repairs`; subtitle *"Repairs are optional at launch — this board shows the flow: intake → parts → bench → pickup."* Actions: `Returns / warranty →` (`.btn-ghost`) → `returns.html`; `#btn-new` (`.btn-primary`) = `Shell.svg("repairs") + " New repair"` → `openNew()`.

**Intro callout `#introCallout`** (`.callout.info`): *"Every job here carries an **IMEI**, a **technician** and a **promised date**. Repair charges post to [Finance](finance.html); warranty jobs cross-link to [Returns](returns.html)."*

**Stage model (exact).**

```js
var STAGES = ["Received", "Awaiting parts", "In repair", "Ready", "Delivered"];
var STAGE_ICON = { "Received":"📥", "Awaiting parts":"⏳", "In repair":"🔧", "Ready":"✅", "Delivered":"📦" };
var CURRENT_LABEL = { "Received":"Just booked in", "Awaiting parts":"Waiting on parts",
  "In repair":"On the bench now", "Ready":"Ready — awaiting pickup", "Delivered":"Delivered" };
function stageCls(s){ return ({ "Received":"info", "Awaiting parts":"warn",
  "In repair":"accent", "Ready":"pos", "Delivered":"plain" })[s] || "plain"; }
```

**KPIs — `.grid.cols-4#kpiRow`.**

| Label | Value | Meta | Action |
|---|---|---|---|
| Active jobs | `stage !== "Delivered"` | `in the workshop ▾` | `scrollBoard()` · `.accent` |
| Awaiting parts | `stage === "Awaiting parts"` | `waiting on supplier ▸` | `focusCol('Awaiting parts')` |
| Ready for pickup | `stage === "Ready"` | `notify customers ▸` | `focusCol('Ready')` · `.pos-text` |
| Repair revenue | `fmt.pkr(Σ x.cost)` | `charged across open jobs →` | `href="finance.html"` |

**Kanban board `#board`.** One `.kb-col[data-stage]` per stage with an icon, name and a count badge classed by `stageCls`. Cards (`jobCard`): `.mono.tiny.muted` id + `.rep-cost` `fmt.pkr(r.cost)`; `.dev` device; `.mono.tiny.muted` IMEI; `.issue` `🔧 {issue}`; footer = `.avatar-sm` technician initials + name, plus a promise badge:

```js
if (stage === "Ready")     → <span class="badge pos">Ready</span>
if (stage === "Delivered") → <span class="badge plain">Done</span>
if (late !== null && late < 0) → <span class="badge neg">Overdue</span>
else                       → <span class="badge plain">{promised}</span>
```

Per-column empty states: `Received` → `📥` *"No new intakes waiting"* + a `+ Book repair` button; `Delivered` → `📦` *"Completed jobs land here once handed over"*; others → `—` *"No jobs in this stage"*.

**Date handling — a hardcoded "today".**

```js
var TODAY = new Date(2026, 6, 13);   // 13 Jul 2026
function daysFromToday(s){ var d = pd(s); return d ? Math.round((d - TODAY)/86400000) : null; }
```

> **Date inconsistency (defect).** `TODAY` here is **13 Jul 2026** while `DB.SHOP.businessDate` is **`"14 Jul 2026"`**. The detail drawer also prints the literal string `"today (13 Jul 2026)"`. Overdue maths on this screen is one day behind the rest of the prototype.

**Drawer `#detailDrawer` — job detail.** Title `"{id} · {device}"`.

Body: badge row (stage + technician); a card with `Device in for repair` / device name / `.mono` `IMEI {imei}`; then the **promised-vs-actual** box:

| Condition | Callout |
|---|---|
| `stage === "Ready"` or `"Delivered"` | `.callout.pos` *"{Delivered\|Ready for pickup} today (13 Jul 2026) · promised **{promised}** — {on time.\|completed after the promised date.}"* |
| `late < 0` | `.callout.neg` *"Promised **{promised}** — **overdue by {n} day(s)**. Call the customer."* |
| otherwise | `.callout.info` *"Promised **{promised}** · currently **{stage}** — {due today\|{n} day(s) to go}."* |

Then `.kv` rows: `Job ID`, `Reported issue`, `Parts` (`"None required"` when `"—"`), `Technician`, `Booked in`, `Promised`, `Repair charge (customer)`. Then a **status-history timeline** over the five stages, `done` when `i <= stageIndex(r.stage)`; time = `r.receivedAt` for `Received`, `"Completed"` when `i < si`, `CURRENT_LABEL[stage]` at `i === si`, `"Pending"` beyond. Descriptions: *"Booked in · fault logged: {issue}"*, *"{parts} ordered from supplier"* / *"No parts required for this job"*, *"Technician {name} working on the fix"*, *"Repair complete · QC passed · ready for pickup"*, *"Handed to customer · charge collected"*.

Foot `#detailFoot`: `advance()` button labelled `"Advance to {next}"` (or `"Mark delivered"` for the last hop), or `<span class="badge pos">✓ Job closed</span>` at the end; plus `Notify customer` (`.btn-primary`) → `notifyCustomer(id)` → toast *"Pickup reminder sent — {id} is ready for collection"* when `Ready`, else *"Status update sent to the customer for {id}"*.

**Drawer `#newDrawer` — "Book a repair".**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#nrDevice` | `input.input` | `Device` | placeholder `e.g. Galaxy A16 128GB`; `oninput="refreshImpact()"` |
| `#nrImei` | `input.input.mono` | `IMEI` | placeholder `15-digit IMEI`; help *"Ties the job to a specific handset for warranty and audit."* |
| `#nrIssue` | `select.input` | `Reported issue` | `— Select the fault —`, `Cracked screen`, `Battery replacement`, `Charging port`, `Water damage`, `Speaker / microphone`, `Camera fault`, `Software / setup`, `Other` |
| `#nrTech` | `select.input` | `Technician` | `Usman`, `Bilal`, `Adeel` — **hardcoded staff list, not in `DB`** |
| `#nrPromise` | `input.input[type=date]` | `Promised date` | |
| `#nrCost` | `input.input[type=number][min=0]` | `Estimated repair charge` | placeholder `e.g. 5000`; help *"Customer-facing charge (labour + parts). Posts to Finance when the job completes."* |
| `#nrImpact` | `.impact` | — | Live |

`refreshImpact()` renders: *"Books **{device}** into the workshop as **REP-0{seq}**, assigns **{tech}**, promised **{date}**."* + *"Card appears in the **Received** column."* + *"Adds **{cost}** to expected repair revenue on completion."*

**`addRepair()`.** Requires a device (`"Enter the device first"`) and an issue (`"Select the reported issue first"`). New id = `"REP-0" + (seq++)` starting at **`seq = 19`** (seed max `REP-018`). Defaults: `stage: "Received"`, `parts: "—"`, `imei: imei || "—"`, `promised: prom ? fmtDate(prom) : "—"`, `cost: isNaN(cost) ? 0 : cost`, `receivedAt: "Today · just now"`. Then re-render, close, toast `"Repair booked — {id} added to Received"`, reset, `focusCol("Received")`.

**Synthetic intake times.** `RECEIVED = { "REP-018": "13 Jul · 09:45 AM", "REP-017": "12 Jul · 11:20 AM", "REP-016": "12 Jul · 05:10 PM" }` — the comment says *"Synthetic intake times (not in DB — derived for the timeline)"*.

**Data entities consumed:** `DB.repairs` (copied into `state.rows`).

**Business rules visible:**
- **Repairs are optional at launch** — stated in the subtitle.
- Every job carries **IMEI + technician + promised date**.
- Stage progression is strictly linear and one-way (`nextStage()` never goes back).
- Repair charges **post to Finance on completion**; warranty jobs cross-link to Returns.

---

### 3.13 `used-intake.html` — Used Device Intake & Trade-in

| | |
|---|---|
| **File** | `prototype/used-intake.html` |
| **`data-page`** | `used` · **`<title>`** `Used Device Intake · MobileShop OS` |
| **Purpose** | The highest-risk control in the system: a second-hand phone stays quarantined until **every** verification gate passes. |
| **Proposed production route** | `/(app)/used-intake` |
| **Inferred roles** | Purchaser (*"manages suppliers and intake"*), Manager, Owner. Technician (`Inventory adjustments` = `Limited`) for inspection. CNIC is a restricted field. |
| **Scripts** | `data.js` → `shell.js` → inline |

**Constants.**

```js
var BATTERY_THRESHOLD = 90;
var seq = 312;   // next UDI- id (seed goes to UDI-311)
var CONDITIONS = ["Display — no dead pixels / burn-in", "Touch — full digitiser response",
                  "Cameras — front & rear", "Battery & charging — holds charge"];
```

**Page head.** `<h1>` `"Used Device Intake & Trade-in"`; subtitle *"Every second-hand phone is held in quarantine until it passes all verification gates — protecting the shop from stolen or blacklisted devices."* Action: `#btn-new` (`.btn-primary`) = `Shell.svg("used") + " New intake"` → `openIntake()`.

**The core rule `#ruleCallout`** (`.callout.neg`, 🛡️): *"A used device **cannot be marked saleable** until **identity**, **IMEI / PTA**, **Police e-Gadget** and **physical inspection** gates all pass. A screenshot or a seller's statement is **not** sufficient verification."*

**KPIs — `.grid.cols-4#kpiRow`** (re-derived on every gate tick):

| Label | Value | Meta |
|---|---|---|
| In quarantine | `state.intakes.filter(it => !isCleared(it)).length` | `blocked from sale` · `.neg-text` when > 0 · `.accent` |
| Cleared — saleable | `state.intakes.filter(isCleared).length` | `all gates passed` · `.pos-text` when > 0 |
| Capital held in quarantine | `fmt.pkr(Σ it.approved over quarantined)` | `at approved buy price` |
| Potential resale margin | `fmt.pkr(Σ (resale − approved))` | `"across {n} devices"` · `.pos-text` |

Helpers: `isCleared(it)` = `it.gates.every(g => g.ok)`; `pendingCount` / `passedCount`; `margin(it)` = `resale − approved`; `marginPct(it)` = `margin/approved*100`; `batteryOk(pct)` = `parseInt(pct,10) >= 90`.

**Intake cards `#intakeList`.** `renderList()` sorts **quarantined first** (`(isCleared(a)?1:0) - (isCleared(b)?1:0)` — the comment says *"Quarantined first (higher risk), then cleared"*). Card id = `card-{it.id}`.

*Head:* `{device}` + `.mono.muted` `· {id}`; right = `<span class="badge pos">✓ Cleared — saleable</span>` or `<span class="badge warn"><span class="dot-i"></span>Quarantined — blocked from sale</span>`.

*Left column — "SELLER & IDENTITY":* `.kv` `Seller`; `CNIC` with `<span class="tiny" style="color:var(--warn)">🔒 restricted</span>` and a masked `.mono` value; `IMEI`. Then **"VALUATION"**: `Quoted`, `Approved (paid)`, `Expected resale`, `Gross margin` (`.pos-text` `"{amount} · {pct}%"`), `Battery health` (+ `<span class="badge neg">below 90%</span>` or `<span class="badge pos">ok</span>`), `Grade`.

*Right column — "VERIFICATION GATES":* a `{passed} / {total}` counter, a `.meter` (`pos` when cleared, else `warn`) at `round(passed/total*100)`%, then one `gateRow` per gate: the gate name (styled `color:var(--neg);font-weight:600` when failing), a badge `<span class="badge pos">✓ Passed</span>` / `<span class="badge neg">✕ Pending</span>`, and — only when the gate is pending **and** the intake is not yet cleared — a `Mark verified` button → `tickGate(id, idx)`.

*Verdict:* cleared → `.callout.pos` *"**Saleable: YES** — all {n} verification gates passed. This device can be listed for sale."*; else `.callout.neg` ⛔ *"**Saleable: NO** — {n} gate(s) pending. It stays in quarantine until every gate is verified."*

*Contextual drill-down:* for `UDI-311` only — *"Held as inventory unit [INV-1090](unit.html) in **Intake — Quarantine**."* (**a bare `unit.html` link with no `?id=`**).

*Footer actions:*

| State | Buttons |
|---|---|
| Cleared | `List for sale` (`.btn-pos` → `pos.html`, plus a toast *"{device} is listed and ready to sell"*) · `View intake record` → toast *"Intake record opened (illustrative)"* |
| Quarantined | `Cannot sell — quarantined` — **`disabled`**, `title="Blocked until all gates pass"` · `Add to tasks` → toast *"Reminder added to Tasks"* |

**Empty state `#emptyState`:** `📥` / *"No devices in intake"* / *"Buy-backs and trade-ins will appear here in quarantine until verified."* + a `New intake` button.

**`tickGate(id, idx)`.** Ignores already-passed gates. Sets `ok = true`; if that clears the intake → `it.status = "Cleared — saleable"`, re-render, toast `"{id} cleared — all gates passed, now saleable"`; otherwise re-render and toast `"{gateName} verified · {n} gate(s) remaining"`.

**Drawer `#intakeDrawer` — "New used-device intake".** Opens via `openIntake()` → `resetIntakeForm()` then `Shell.open`.

`.callout.warn` 🔒: *"The device is booked into **Quarantine** the moment you save. It becomes saleable only after every gate is verified below or on its card."*

**Section "SELLER IDENTITY":**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#capSeller` | `input.input` | `Seller full name (as on CNIC)` | placeholder `e.g. Waleed Ahmed` |
| `#capCnic` | `input.input.mono[maxlength=15]` | `CNIC number 🔒` | placeholder `35202-XXXXXXX-1`; help: *"Restricted field — only the **last 4 digits** are retained; the full number is masked in every record, report and export."* |
| `#capConsent` | `input[type=checkbox]`, **unchecked** | *"Seller consents to identity capture and Police e-Gadget verification, and confirms lawful ownership of the device. **Required.**"* | |

**Section "DEVICE":**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#capModel` | `select.input` | `Model` | `— Select model —`, then **serialized variants only** (`DB.variants.filter(v => v.serialized)`) rendered as `"{brand} {model}"`, then `Other / not in catalog` |
| `#capVariant` | `input.input` | `Variant (storage · colour)` | placeholder `128 GB · Black` |
| `#capImei` | `input.input.mono[maxlength=15]` | `IMEI` | `oninput="resetVerify()"`; paired with a `Verify IMEI / PTA` button → `verifyImei()` |
| `#verifyResult` | div | — | Verification badge |
| `#capEgadget` | `input.input.mono` | `Police e-Gadget reference` | placeholder `e.g. EG-LHR-2026-0xxxx`; help: *"Enter the reference returned by the Police e-Gadget check. A screenshot or the seller's word is not accepted."* |

**Section "PHYSICAL INSPECTION":** `#condList` renders the four `CONDITIONS` as `<label class="spread">` rows each containing `<input type="checkbox" id="cond-{i}">`.

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#capBattery` | `input.input[type=number][min=0][max=100]`, value `90` | `Battery health (%)` | |
| `#capGrade` | `select.input` | `Grade` | `Grade A`, `Grade B`, `Grade C` |
| `#capQuoted` | `input.input[type=number]` | `Quoted buy price (Rs)` | placeholder `e.g. 195000`; help: *"Battery below **90%** fails the battery gate automatically."* |

Foot: `Cancel` + `Save → send to Quarantine` (`.btn-primary`) → `saveIntake()`.

**`verifyImei()`.** Strips non-digits. `< 14` digits → `verified = false`, badge `<span class="badge neg">✕ Enter a valid 15-digit IMEI</span>`, toast *"IMEI looks incomplete — check the number"*. Otherwise `verified = true`, badge `<span class="badge pos">✓ PTA Approved · not reported lost/stolen</span>` + `<span class="tiny muted">(illustrative check — e-Gadget still required)</span>`, toast *"IMEI / PTA verified"*. **Always passes for any 14+ digit number — no real DIRBS lookup.**

**`saveIntake()` — validation and gate derivation.**

Blocks, in order: `if (!consent)` → *"Seller consent is required before intake"*; `if (!seller)` → *"Enter the seller's name"*; `if (imei.length < 14)` → *"A valid IMEI is required"*.

CNIC masking (the restricted-field rule, implemented):
```js
var digits = cnic.replace(/\D/g, "");
var prefix = digits.slice(0, 5) || "35202";
var last4  = digits.slice(-1) || "0";
var maskedCnic = prefix + "-•••••••-" + last4;
```
> **Implementation defect.** The help text promises *"only the **last 4 digits** are retained"* but `digits.slice(-1)` retains **one** digit. The mask renders `35202-•••••••-1`, matching the seed shape — so the visual is right and the variable name is wrong.

Resale derivation: `approved = quoted`; `resale = Math.round(quoted * 1.13)` — the comment says *"Derive resale (illustrative: quoted + ~13% target margin)"*.

**The five gates — exactly how each is set:**

```js
var gates = [
  { name: "Seller identity + consent",      ok: consent && !!seller },
  { name: "IMEI / PTA verification",        ok: verified },
  { name: "Police e-Gadget reference",      ok: false },   // reference entered still needs the police check to clear
  { name: "Physical inspection checklist",  ok: inspectionOk },   // every #condList checkbox ticked
  { name: "Battery health ≥ threshold",     ok: batteryOk(battery) }
];
```

> **A newly created intake can never be born cleared** — gate 3 is hardcoded `false` regardless of the `#capEgadget` value. `status` is therefore always `"Quarantined"` on save. The e-Gadget reference is stored as `egadgetRef` but is otherwise unused. This is deliberate: entering a reference is not the same as the police check clearing.

After save: `state.intakes.unshift(rec)`, re-render, close, toast `"{id} booked into Quarantine — pending verification gates"`, and scroll the new card into view.

**Data entities consumed:** `DB.usedIntakes` (deep-ish copied — `gates` are cloned per element), `DB.variants`.

**Business rules visible:**
- **Quarantine-by-default** for every used device; saleable only when all 5 gates pass.
- *"A screenshot or a seller's statement is **not** sufficient verification."*
- **Seller consent is mandatory** and blocks intake.
- **CNIC is a restricted field** — masked in every record, report and export.
- **Battery < 90% fails a gate automatically.**
- The e-Gadget **reference being entered ≠ the check having cleared**.
- Quarantined capital is tracked as a KPI (money locked in unsaleable stock).

---

### 3.14 `finance.html` — Finance & Cash

| | |
|---|---|
| **File** | `prototype/finance.html` |
| **`data-page`** | `finance` · **`<title>`** `Finance · MobileShop OS` |
| **Purpose** | The management P&L. Teaches the single hardest idea in the system: **profit ≠ cash**. |
| **Proposed production route** | `/(app)/finance` |
| **Inferred roles** | Owner (`Finance & reports` = `Full`), Manager (`View`), Accountant (`View`). Salesperson/Cashier/Technician = `None`. |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Finance & Cash"`; subtitle *"Management view for **14 Jul 2026** — *profit* is what you earned, *cash* is what you hold. They are not the same number."* (**the date is hardcoded in the markup**). Actions: `#btn-export` = `Shell.svg("reports") + " Export for accountant"` → `Shell.toast("Day-book exported for the accountant (CSV) — illustrative in this prototype", true)` — **a stub**; `#btn-expense` (`.btn-primary`) = `Shell.svg("finance") + " Record expense"` → `Shell.open('newexp')`.

**KPI row 1 — `.grid.cols-4`, all `<a class="kpi">`.**

| Label | Value id | Trend id | Meta id | Href |
|---|---|---|---|---|
| Sales revenue | `#kSalesVal` = `fmt.pkr(PL.salesRevenue)` | `#kSalesTrend` = `"▲ " + fmt.pct(DB.KPI.salesTrendPct)` | `#kSalesMeta` = `vs yesterday` | `reports.html` · `.accent` |
| Gross profit | `#kGrossVal` = `fmt.pkr(PL.grossProfit)` | `#kGrossTrend` = `"▲ " + fmt.pct(DB.KPI.profitTrendPct)` | `#kGrossMeta` = `"{PL.grossMarginPct}% margin"` | `reports.html` |
| Operating expenses | `#kExpVal` = `fmt.pkr(opEx)` **(live)** | — | `#kExpMeta` = `"{EXP.length} entries today"` **(live)** | `#expensesCard` (in-page anchor) |
| Estimated net operating | `#kNetVal` = `fmt.pkr(netOp)` **(live)** | — | `#kNetMeta` = `"after expenses · {netMargin}% net margin"` | `reports.html` |

> Both trend markers are **hardcoded to `▲` and `class="trend up"`** in the HTML; only the percentage is data-bound. A negative trend would render as an up-arrow in green.

**Profit-vs-cash callout `#profitCallout`** (`.callout.info`): *"**Profit is not cash.** Buying stock reduces your cash straight away, but that money only becomes an expense (`COGS`) on the P&L when the phone actually sells. A big cash-out for inventory can sit next to a healthy profit — and the other way round."*

**KPI row 2 — `#digitalKpis`, `.grid.cols-4`**, from `Digital.totals({ settledOnly: true })`:

| Label | Value | Meta | Href |
|---|---|---|---|
| Digital sent | `fmt.pkr(digitalTotals.sent)` | `principal movement only` | `digital-history.html` |
| Digital received | `fmt.pkr(digitalTotals.received)` | `principal movement only` | `digital-history.html` |
| Digital fees + commission | `fmt.pkr(digitalTotals.grossEarnings)` | `gross service earnings` | `digital-commission.html` · `.pos-text` |
| Net digital earnings | `fmt.pkr(digitalTotals.netEarnings)` | `"{digitalPending} pending not settled"` | `digital-commission.html` · `.pos-text` · `.accent` |

**Card "Profit & loss — today" — `#pnlBody`.** Hint *"how revenue becomes profit"*. Rows built by `pnlRowHTML(label, value, opt)` where `opt.less` renders `"− Rs X"` with a `Less: ` prefix, `opt.rule` adds a top border, `opt.total` bumps the font, `opt.badge` appends a `.badge.pos`:

| Row | Value | Options |
|---|---|---|
| Sales revenue | `PL.salesRevenue` | `strong` |
| Less: Discounts given | `PL.discounts` | `less` |
| Less: Returns & refunds | `PL.returns` | `less` |
| **Net sales** | `PL.netSales` | `rule`, `strong` |
| Less: Cost of goods sold (COGS) | `PL.cogs` | `less`, note *"Booked only when items sell — not when stock is bought."* |
| **Gross profit** | `PL.grossProfit` | `rule`, `strong`, `pos`, badge `"{grossMarginPct}% margin"` |
| Less: Operating expenses | `opEx` **(live)** | `less` |
| **Estimated net operating profit** | `netOp = PL.grossProfit − opEx` | `rule`, `strong`, `total`, badge `"{netMargin}% net margin"` |

`netMargin = (netOp / PL.netSales * 100).toFixed(1)`.

**Card "Cash & bank"** — hint *"what you actually hold"*.

| `.kv` row | Value id | Link |
|---|---|---|
| `Cash in drawer` + `<span class="badge pos"><span class="dot-i"></span>Session open</span>` | `#cashVal` = `fmt.pkr(cashPos)` | `.row-link` → `closing.html` |
| `Bank & digital wallets` | `#bankVal` = `fmt.pkr(bankPos)` | — |
| `Digital service floats` | `#digitalFloatVal` = Σ `current` over non-`physicalCash` balances | `.row-link` → `digital-balances.html` |
| `Digital cash impact` | `#digitalCashVal` = `(current >= 0 ? "+" : "") + fmt.pkr(digitalPhysical.current)` | `.row-link` → `digital-history.html` |
| **`Total liquid funds`** | `#liquidVal` = `cashPos + bankPos + digitalFloatTotal + digitalPhysical.current` | — |

`#sessionNote` = *"Drawer session open since **{cs.openedAt}** (float {fmt.pkr(cs.openingFloat)}). Count & reconcile at day end."* Footer button `Go to Daily Closing →` → `closing.html`.

> **Double-count risk (defect for production).** `digitalFloatTotal` includes the `bankBalance` key (seeded `300,000`, and the target of both `Bank Transfer` and `Other` per `BALANCE_KEYS`), while `bankPos` is the independent `DB.KPI.bankPosition` (`1,120,000`). `Total liquid funds` adds both. The two mock sources are unreconciled.

**Card "Receivables — owed to you"** (`<a class="card row-link" href="customers.html">`). `#recVal` = `fmt.pkr(DB.KPI.receivables)`; `#recNote` = `"Store credit across {n} customers · click to view"` (n from `DB.customers.filter(c => c.credit > 0)`); a chevron is injected into `.chev`.

**Card "Payables — you owe suppliers"** (`<a class="card row-link" href="suppliers.html">`). `#payVal` = `fmt.pkr(DB.KPI.payables)`; `#payNote` = `"Unpaid stock purchases · {n} suppliers"`; `#payBadge` (`.badge.warn`) = `"{topPayable.name} {fmt.pkr(topPayable.payable)} due 16 Jul"` — **the date `16 Jul` is hardcoded**; `topPayable` = the largest `s.payable`.

**Card "Digital services earnings — today" — `#digitalPnlBody`.** Hint *"principal kept separate from sales revenue"*. Uses the same `pnlRowHTML` ladder:

| Row | Value | Options |
|---|---|---|
| Digital principal sent | `digitalTotals.sent` | `strong`, note *"Movement only — not sales revenue."* |
| Digital principal received | `digitalTotals.received` | `strong`, note *"Movement only — not sales revenue."* |
| Customer service fees | `sentFees + receivedFees` | `pos` |
| Provider gross commission | `grossCommission` | `pos` |
| Less: Commission tax | `commissionTax` | `less` |
| Less: Other direct charges | `otherCharges` | `less` |
| **Net digital-service earnings** | `netEarnings` | `rule`, `strong`, `total`, `pos` |
| **Combined operating + digital earnings** | `netOp + netEarnings` | `rule`, `strong`, `total`, note *"Shown separately from phone sales revenue."* |

**Card "Operating expenses — today" — `#expensesCard`.** Head: `#expSummary` = `"{n} entries · {total}"` + a `+ Record expense` button.

Table `#expTable`:

| Column | Cell |
|---|---|
| `Ref` | `.mono.muted` `e.id` |
| `Category` | `e.category` |
| `Source` | `<span class="badge accent">Bank</span>` or `<span class="badge plain">Cash</span>` |
| `Date` | `.muted.nowrap` `e.date` |
| `Evidence / note` | `.muted.small` `e.note` or `<span class="tiny">—</span>` |
| `Amount` (`.num`) | `.strong` `fmt.pkr(e.amount)` |

Every row: `onclick="Shell.toast('Opening evidence for {id} — illustrative in this prototype')"` — **a stub; no evidence viewer exists**. `tfoot`: `Total operating expenses` (right-aligned, `colspan=5`) + the total. Empty state: `.empty` with the finance icon / *"No expenses recorded yet today"* / *"Rent, electricity and small costs go here — they reduce profit, not COGS."*

Footer note: *"Operating expenses are recorded as a daily accrual (e.g. monthly rent ÷ 30). They lower net operating profit but are **separate from COGS** — the cost of a phone is only booked when that phone sells."*

**Drawer `#newexp` — "Record an expense"** (backdrop click closes).

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#expCat` | `select.input` | `Category` | `onchange="updateImpact()"`. Options from `CATS` (11): `Shop rent (daily accrual)`, `Electricity`, `Salaries / wages`, `Staff tea / misc`, `Packaging / bags`, `Internet / DSL`, `Repairs & maintenance`, `Marketing / ads`, `Transport / delivery`, `Bank charges`, `Other` |
| `#expAmt` | `input.input[type=number][min=0][step=100]` | `Amount (Rs)` | `oninput="updateImpact()"` |
| `#expSourceSeg` | `.seg` | `Paid from` | **`Cash drawer` (active)** / `Bank / wallet` → `setSource('Cash'|'Bank', this)` |
| `#expDate` | `input.input[type=text]` | `Date` | Pre-filled `DB.SHOP.businessDate`; help *"Recorded against the current business day."* |
| `#expNote` | `textarea.input[rows=2]` | `Evidence / note` | placeholder *"e.g. WAPDA bill photo attached · receipt #4471"*; help *"Attach a reference so the entry is auditable at closing."* |
| `#expImpact` | `.impact` | — | Live |

**`updateImpact()`.** With `amt <= 0` it renders the generic form: *"Reduces the money you hold in the chosen source."* · *"Lowers today's net operating profit."* · *"Does **not** change COGS or gross profit."* · *"Enter an amount to see the exact effect."* With an amount, it renders the concrete form:
- *"Records **{amt}** as **{cat}**."*
- *"{Cash|Bank} on hand falls to **{srcAfter}**."*
- *"Estimated net operating profit falls to **{netOpAfter}**."*
- *"Gross profit & COGS are **unchanged** — this is an operating cost, not cost of goods."*

**`recordExpense()`.** Blocks with `Shell.toast("Enter an amount greater than zero", false)` when `amt <= 0`. New id = `"EXP-0" + (maxN + 1)` where `maxN` starts at `70` (seed runs `EXP-071`…`EXP-075`). Unshifts into the local `EXP` copy, then **decrements the running `cashPos` or `bankPos` variable** (session-only), resets the form, closes, re-renders everything, and toasts `"Recorded {amt} · {cat} from {source} — profit unchanged, cash reduced"`.

**Data entities consumed:** `DB.finance.pnl`, `DB.finance.expenses` (copied), `DB.KPI` (`cashPosition`, `bankPosition`, `receivables`, `payables`, trends), `DB.customers`, `DB.suppliers`, `DB.SHOP.cashSession`, `Digital` state.

**Business rules visible:**
- **Profit ≠ cash** — the screen's entire thesis, stated in the subtitle, the callout and the expense impact box.
- **COGS is booked when the item sells**, not when stock is bought.
- **Operating expenses are a daily accrual** (monthly rent ÷ 30) and are **separate from COGS** — they reduce net operating profit only.
- **Digital-service principal is a movement, never revenue** — reported in its own P&L block.
- Receivables ← customers; payables ← suppliers; each is one click away.
- Every expense wants **evidence attached so the entry is auditable at closing**.

---

### 3.15 `closing.html` — Daily Closing

| | |
|---|---|
| **File** | `prototype/closing.html` |
| **`data-page`** | `closing` · **`<title>`** `Daily Closing · MobileShop OS` |
| **Purpose** | Cash-drawer reconciliation. Count the drawer, record the variance, **never edit sales to make it match**. |
| **Proposed production route** | `/(app)/finance/closing` |
| **Inferred roles** | Cashier (`Cash session & drawer` = `Full`), Manager (`Full`), Owner (`Full`). |
| **Scripts** | `data.js` → `shell.js` → inline |

**Breadcrumb.** `Finance` → `finance.html` / `Daily closing`.

**Page head.** `<h1>` `Daily Closing`; subtitle *"Tuesday, 14 July 2026 · session CS-0714 opened 10:12 AM · cashier Haseeb Shahid"* (**hardcoded**). Actions: `Finance overview` (`.btn-ghost`) → `finance.html`; `#statusBadge` = `<span class="badge pos"><span class="dot-i"></span> Session open</span>`.

**Card "Cash drawer reconciliation".** Hint *"Count the drawer, not the sales"*. Intro: *"The system builds the expected figure from posted activity. You enter what you actually counted."*

**The expected-cash ladder `#ladder`** — built from `DB.finance.cash`:

| Sign | Label | Value | Drill-down |
|---|---|---|---|
| *(none)* | Opening cash (float) | `c.opening` | — |
| `+` | Cash sales | `c.cashSales` | `.row-link` → `Shell.open('dwCashSales')`, hint `"{n} sales ›"` |
| `−` | Cash refunds | `c.cashRefunds` | — (`0` → label gains `<span class="tiny muted">· none</span>`) |
| `−` | Expenses paid from drawer | `c.expensesFromDrawer` | `.row-link` → `Shell.open('dwDrawerExp')`, hint `"{n} entries ›"` |
| `−` | Cash removed / deposited to bank | `c.deposited` | — (`0` → `· none`) |

A row is clickable only when `r.drawer && r.v > 0` (`title="See what makes up this figure"`). Then `#expectedRow`: **`= Expected closing cash`** → `#expectedVal` = `fmt.pkr(c.expectedClosing)` at 19px.

**Counted-cash form.**

| Field id | Type | Label | Notes |
|---|---|---|---|
| `#countedInput` | `input.input[type=number][inputmode=numeric][min=0][step=100]` | `Counted cash in drawer` | placeholder *"Enter the physical amount you counted, e.g. 137000"*; help *"Count the notes and coins in the drawer and enter the total. Nothing is posted until you submit."* |
| `#reasonInput` | `textarea.input[rows=3]` | `Reason for variance` + `#reasonReq` (`<span class="badge neg">Required</span>`, shown only when variance ≠ 0) | placeholder *"e.g. Rs 200 short — change rounded up on a JazzCash sale; recounted and confirmed."*; help *"Required whenever the drawer doesn't balance. This is stored as a variance entry — sales records are never edited to make it match."* |
| `#attest` | `input[type=checkbox]` | *"I have physically counted the drawer and the amount above is correct."* | |

**Live variance panel `#variancePanel`.** `#varAmount` (22px), `#varNote`, `#varBadge`.

```js
function vMeta(v) {
  if (v === 0) return { label: "Balanced", badge: "pos",  text: "pos-text" };
  if (v > 0)   return { label: "Over",     badge: "warn", text: "pos-text" };
  return              { label: "Short",    badge: "neg",  text: "neg-text" };
}
```

Variance = `counted − expected`. Notes: `0` → *"Drawer matches the expected amount exactly."*; `> 0` → *"{amount} more than expected — check for an unrecorded entry, then note the reason."*; `< 0` → *"{amount} less than expected — record the reason below before submitting."* Empty input → `—` / `Awaiting count` / *"Enter the counted amount to check the drawer."*

> Note the deliberate asymmetry: **"Over" is amber, not green.** More cash than expected is still an unexplained discrepancy.

**Policy callout** (`.callout.warn` ⚠️): *"If the cash doesn't match, **record the variance and the reason**. Never change sales records to hide a mismatch — the audit trail must stay honest."*

**Sign-off `.kv` rows.** `Submitted by` → `<span class="avatar-sm">HS</span> Haseeb Shahid · Owner`; `Approved by` → `#approvedRow` = `Owner · self-approval <span class="badge plain">Sole owner</span>`.

**Side column.**

*Card "Session details"* `.kv`: `Session ID` `.mono` **`CS-0714`**, `Business date` **`Tue, 14 Jul 2026`**, `Opened` **`10:12 AM`**, `Opening float` → `#sessFloat` = `fmt.pkr(sess.openingFloat)`, `Cashier` **`Haseeb Shahid`**, `Status` → `#sessStatus`. (All bolded values are hardcoded markup except the float.)

*Card "Money in today"* — hint `by tender`. `#tenderList` groups `DB.sales.filter(s => /^Today/.test(s.time))` by `s.method`, sorts desc by value, and renders `.spread` rows with `<span class="badge accent">in drawer</span>` for `Cash` and `<span class="badge plain">to bank / wallet</span>` for everything else. `.callout.info` 💡: *"Only **cash** lands in the drawer. Card, JazzCash and bank transfers settle elsewhere and don't affect the count."*

*Card "Session activity"* — `#sessTimeline`: `Cash session opened` (time `sess.openedAt`, desc *"Opening float {x} · CS-0714"*), then one `done` item per today's cash sale in reverse order (*"Cash sale {id}"* / *"+{total} · {customer}"*), then `Expenses paid from drawer` (time `"During day"`, desc `"−{c.expensesFromDrawer} · {n} entries"`), then a **not-done** `Closing count & reconciliation` (time `"Now"`, desc *"Counting the drawer and recording any variance"*).

**Drill-down drawers (2).**

| Id | Contents |
|---|---|
| `#dwCashSales` — *"Cash sales today"* | Intro: *"These cash tenders add up to the **Cash sales** line in the reconciliation. Digital payments are excluded because they never touched the drawer."* Table `Invoice` \| `Time` \| `Customer` \| `Cash in` (`.num`) + a `Total cash sales` footer row. Rows → `finance.html`. |
| `#dwDrawerExp` — *"Expenses paid from drawer"* | Intro: *"Cash-source expenses paid out of the drawer today. Bank-paid expenses (rent, internet) are excluded — they don't reduce the drawer."* Table `Ref` \| `Category` (+ `.tiny.muted` note) \| `Paid` (`.num`) + a `Total from drawer` footer row. Rows → `finance.html`. |

Sources: `cashSalesToday` = `DB.sales.filter(s => s.method === "Cash" && /^Today/.test(s.time))`; `drawerExpenses` = `DB.finance.expenses.filter(e => e.source === "Cash")`.

**Modal `#confirmClose` — "Confirm daily closing".** Intro: *"Review the effect before it's recorded. This closes the cash session and writes an audit entry — it does not change any sale."* `.impact` — *"What this records"*:
- *"Expected closing cash: **{#cf-exp}**"*
- *"Counted cash: **{#cf-cnt}**"*
- *"Variance: **{#cf-var}** · {#cf-status badge}"*
- *"Closes cash session **CS-0714** and writes a variance entry to the audit log."*
- *"Sales records are **not** modified."*

Plus `#cf-reasonRow` (*"Reason on file: …"*) when a reason was typed. Foot: `Back` + `Confirm & close session` (`.btn-primary`) → `submitClosing()`.

**`openConfirm()` — the three blocking gates, in order:**

| Gate | Failure |
|---|---|
| Counted amount empty | `Shell.toast("Enter the counted cash amount first", false)` + focus `#countedInput` |
| `v !== 0 && reasonInput.value.trim() === ""` | Show `#reasonReq`, `Shell.toast("A reason is required when the drawer doesn't balance", false)` + focus `#reasonInput` |
| `#attest` unchecked | `Shell.toast("Confirm you've physically counted the drawer", false)` |

**`submitClosing()`.** Writes `c.counted` and `c.variance` onto the in-memory `DB.finance.cash` (the comment reads *"prototype: record locally, never touch sales"*), sets `submitted = true`, **disables** `#countedInput` / `#reasonInput` / `#attest`, flips `#statusBadge` → `<span class="badge plain"><span class="dot-i"></span> Session closed</span>`, `#sessStatus` → `Closed 6:12 PM` (**hardcoded time**), `#approvedRow` → `Haseeb Shahid · Owner <span class="badge pos"><span class="dot-i"></span> Approved</span>`, and replaces `#submitWrap` with a `.callout.pos`: *"**Daily closing submitted.** Session CS-0714 closed at 6:12 PM. Expected {x} · counted {y}. {varLine} No sales records were changed."* + a `Back to finance overview →` button. Toast: `"Daily closing submitted"`.

`varLine` = *"Drawer balanced exactly."* when balanced, else *"{±amount} recorded as a {over|short} variance in the audit log."*

**Data entities consumed:** `DB.finance.cash`, `DB.finance.expenses`, `DB.sales`, `DB.SHOP.cashSession`.

**Business rules visible:**
- **The expected figure is built by the system from posted activity; the human supplies only the count.**
- **A variance requires a reason** — a hard block.
- **Attestation is required** ("I have physically counted the drawer").
- **Sales records are never edited to make the drawer match** — stated four times (help text, policy callout, confirm modal, success callout).
- **Only cash affects the drawer**; card/JazzCash/bank settle elsewhere.
- "Over" is treated as an exception (amber), not a win.
- Closing **writes a variance entry to the audit log** and closes the session.

---

### 3.16 `digital-services.html` — Digital Services: New Transaction

| | |
|---|---|
| **File** | `prototype/digital-services.html` |
| **`data-page`** | `digital-new` · **`<title>`** `Digital Services · MobileShop OS` |
| **Purpose** | Record an external JazzCash / Easypaisa / bank / bill / load transaction **after** the cashier completed it in the official provider app. |
| **Proposed production route** | `/(app)/digital/new` |
| **Inferred roles** | Cashier, Manager, Owner. (The role matrix in `settings.html` has **no Digital Services category** — the module post-dates it. See §5.) |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Digital Services — New Transaction"`; subtitle *"Record an external JazzCash, Easypaisa, bank, bill or load transaction after completing it in the official provider app."* Actions: `History` → `digital-history.html`; `Balances` (`.btn-ghost`) → `digital-balances.html`.

**Scope callout** (`.callout.info`): *"This prototype records the manual shop entry only. It does not connect to JazzCash, Easypaisa, banks, utilities or telecom providers."*

**Card "Service".**

| Field id | Type | Label | Options |
|---|---|---|---|
| `#service` | `select.input` | `Service` | `Digital.SERVICES` = **JazzCash, Easypaisa, Bank Transfer, Utility Bill, Jazz Load, Zong Load, Other** |
| `#status` | `select.input` (in `#statusField`) | `Status` | `Digital.STATUSES` **minus `REVERSED`** → `SUCCESSFUL`, `PENDING`, `FAILED`, `DISPUTED`. Default = first = `SUCCESSFUL` |
| `#serviceFields` | *(container)* | — | Re-rendered per service by `renderServiceFields()` |

**Service-specific fields — `serviceSpecificHtml(service)`, exact per branch:**

| Service | Fields (id · label · options) |
|---|---|
| **Utility Bill** | `#billType` `Bill Type` → `Electricity`, `Gas`, `Water`, `Internet`, `Telephone`, `Other` · `#billCompany` `Company / Provider` → `LESCO`, `SNGPL`, `WASA`, `PTCL`, `StormFiber`, `Other` · `#consumerReference` `Consumer / Reference Number` (`.mono`) |
| **Jazz Load** / **Zong Load** | `#svcPhone` `Customer Mobile Number` · `#network` `Network` → the matching network first (`Jazz` or `Zong`), then `Jazz`, `Zong`, `Other` · `#loadType` `Load or Bundle` → `Load`, `Bundle` · `#packageName` `Optional package name` |
| **Bank Transfer** | `#bankName` `Bank Name` · `#beneficiaryName` `Beneficiary Name` · `#accountReference` `Masked Account / IBAN Reference` (`.mono`, placeholder `PK**1234`) |
| **JazzCash** / **Easypaisa** | `#svcPhone` `Customer Mobile Number` · `#svcName` `Optional customer name` |
| **Other** (fallback) | `#otherReference` `Service reference` |

Plus, appended in every branch: `#feeMethodWrap` containing `#feeCollectionMethod` `Fee Collection Method` → **`Deduct from Customer Payout`** (default), `Collect Separately`. It is `display:none` unless `direction === RECEIVED_INTO_SHOP`.

> `#loadType` is rendered and labelled but **never read** by `inputPayload()` — a dead field.

**Direction cards — `.direction-grid`, the module's signature control.**

| Card id | `data-dir` | Title | Subtitle | Amount field |
|---|---|---|---|---|
| `#cardSent` (**`.active` by default**) | `SENT_FROM_SHOP` | `AMOUNT SENT` | *"Sent from shop wallet, account or provider float"* | `#amountSent` (`input.input.amount-input[type=number][min=0][inputmode=numeric]`, placeholder `PKR`) |
| `#cardReceived` (`.inactive`) | `RECEIVED_INTO_SHOP` | `AMOUNT RECEIVED` | *"Received into shop wallet, account or provider float"* | `#amountReceived` (same) |

`setDirection(next)` toggles `.active` / `.inactive` on both cards and **clears the other card's amount**. Clicking a card sets the direction and focuses its input. Typing into either input **auto-activates that direction** (`if (this.value) setDirection(...)`). `.amount-input` is styled `font-size:26px; font-weight:740` — deliberately large for counter use.

**Card "Customer and provider details".**

| Field id | Type | Label |
|---|---|---|
| `#customerName` | `input.input` | `Customer Name` + `<span class="muted">(optional)</span>` |
| `#customerPhone` | `input.input` | `Customer Mobile Number` (placeholder `03xx-xxxxxxx`) |
| `#customerReference` | `input.input` | `Customer / Account Reference` |
| `#providerTransactionId` | `input.input.mono` | `Provider Transaction ID` |
| `#externalTransactionAt` | `input.input[type=datetime-local]` | `External Transaction Date and Time` |
| `#cashierName` | `input.input` | `Cashier` — pre-filled `DB.SHOP.owner` |
| `#providerGrossCommission` | `input.input[type=number][min=0]`, value `0` | `Provider Gross Commission` |
| `#providerCommissionTax` | `input.input[type=number][min=0]`, value `0` | `Provider Commission Tax` |
| `#otherDirectCharges` | `input.input[type=number][min=0]`, value `0` | `Other Direct Charges` |
| `#notes` | `textarea.input[rows=2]` | `Notes` — placeholder **"Never store PIN, OTP, MPIN, password or biometric information."** |

**Right rail.** Card *"Live financial preview"* with `#ruleHint` (= `"per Rs 1,000"` for `SLAB`, else the method name) and `#preview`. Then `#saveBtn` (`.btn-primary.btn-lg.btn-block`) `Review & Save Transaction`. Then card *"Current balances"* → `#miniBalances` = the **first 4** entries of `Digital.balanceSummary()`, `.neg-text` when `b.low`.

**Live preview `renderPreview()` — exact rows per direction.**

*SENT_FROM_SHOP:*

| Row | Value | Class |
|---|---|---|
| Principal Amount | `c.principalAmount` | |
| Customer Service Fee | `c.customerServiceFee` | `.pos-text` |
| **Customer Gives Cash** | `c.customerCashPaid` | `.strong` |
| Provider Gross Commission | `c.providerGrossCommission` | |
| Commission Tax | `c.providerCommissionTax` | `.neg-text` |
| Provider Net Commission | `c.providerNetCommission` | `.pos-text` |
| Other Direct Charges | `c.otherDirectCharges` | `.neg-text` |
| Gross Service Earnings | `c.grossServiceEarnings` | |
| Net Service Earnings | `c.netServiceEarnings` | `.pos-text` |
| *(in `.preview-total`)* Physical Cash Increase | `c.physicalCashIn` | `.pos-text` |
| *(in `.preview-total`)* Provider Float Decrease | `c.providerFloatOut` | `.neg-text` |

*RECEIVED_INTO_SHOP:*

| Row | Value | Class |
|---|---|---|
| Principal Amount Received Digitally | `c.principalAmount` | |
| Customer Service Fee | `c.customerServiceFee` | `.pos-text` |
| Fee Collection Method | `p.feeCollectionMethod` | |
| **Cash Given to Customer** | `c.customerPayout \|\| c.physicalCashOut` | `.strong` |
| Additional Cash Fee Received | `c.customerCashReceived \|\| 0` | `.pos-text` |
| Provider Gross Commission … Net Service Earnings | *(same six rows as above)* | |
| *(in `.preview-total`)* Physical Cash Decrease | `c.physicalCashOut − c.physicalCashIn` | `.neg-text` |
| *(in `.preview-total`)* Provider Float Increase | `c.providerFloatIn` | `.pos-text` |

When `status !== "SUCCESSFUL"`, a `.callout.warn` appends: *"{STATUS} transactions are stored but do not affect settled balances or earnings."*

**Validation — `validate(p)`, exact:**

```js
if (!p.principalAmount) return "Enter a principal amount.";
if (p.status === "SUCCESSFUL" && !p.providerTransactionId)
  return "Successful transactions require a Provider Transaction ID.";
if (p.principalAmount < 0) return "Amount cannot be negative.";
```

**Modal `#reviewModal` — "Review digital service transaction".** Rows: `Service` (+ `" · {subService}"`), `Direction` (*"Amount Sent from shop"* / *"Amount Received into shop"*), `Principal amount`, `Customer service fee`, `Customer cash paid or received`, `Provider float impact` (`"+{in}"` or `"− {out}"`), `Provider transaction ID` (or `—`), `Provider commission` (`"{gross} gross · {net} net"`), `Net service earnings` (`.pos-text`), `Status`, `Cashier`, `Timestamp`. Foot: `Back to Edit` + `Confirm and Save` → `#confirmBtn`.

**`#confirmBtn`.** `Digital.addTransaction(pendingInput)` → reload state → close → `Shell.toast("Digital service transaction saved · {tx.id}", true)` → **`location.href = "digital-history.html"`**. `pendingInput` is only set inside `#saveBtn` — implementing the spec rule *"Do not generate the final record before confirmation."*

**Keyboard rule.** `document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") e.preventDefault(); })` — implements *"Enter should not accidentally save without review."*

**Data entities consumed:** `Digital` state (localStorage), `DB.SHOP.owner`.

**Business rules visible:**
- **The shop never calls a provider API.** The cashier completes the transaction externally; this only records it.
- **Direction is always from the shop's perspective**, and exactly one direction can be active.
- **A successful transaction requires a Provider Transaction ID** — hard block.
- **Non-successful statuses store but do not settle** (no cash, float or earnings impact).
- **Never store PIN, OTP, MPIN, password or biometric information.**
- **Principal is never revenue** — fees and commission are the only earnings.

---

### 3.16a `assets/digital.js` — the Digital Services engine

Not a screen, but the calculation core all five digital pages (plus the dashboard, finance and reports) depend on. Documented here because production must reimplement it exactly.

**Constants.**

```js
var KEY = "msos-digital-services-v1";
var SERVICES = ["JazzCash","Easypaisa","Bank Transfer","Utility Bill","Jazz Load","Zong Load","Other"];
var DIRECTIONS = { SENT: "SENT_FROM_SHOP", RECEIVED: "RECEIVED_INTO_SHOP" };
var STATUSES = ["SUCCESSFUL","PENDING","FAILED","REVERSED","DISPUTED"];
var BALANCE_KEYS = {
  "JazzCash": "jazzCashFloat", "Easypaisa": "easypaisaFloat", "Bank Transfer": "bankBalance",
  "Utility Bill": "utilityBillFloat", "Jazz Load": "jazzLoadFloat", "Zong Load": "zongLoadFloat",
  "Other": "bankBalance"
};
var LOW_THRESHOLDS = {
  physicalCash: 50000, jazzCashFloat: 25000, easypaisaFloat: 25000, bankBalance: 50000,
  utilityBillFloat: 25000, jazzLoadFloat: 10000, zongLoadFloat: 10000
};
```

**Opening balances — `defaultBalances()`:** `physicalCash: 0`, `jazzCashFloat: 200000`, `easypaisaFloat: 200000`, `bankBalance: 300000`, `jazzLoadFloat: 50000`, `zongLoadFloat: 50000`, `utilityBillFloat: 100000`.

**Default fee rules — `defaultRules()`:**

| Services | Direction | Method | Params |
|---|---|---|---|
| JazzCash, Easypaisa, Bank Transfer | `SENT_FROM_SHOP` | `SLAB` | `blockSize: 1000, feePerBlock: 10, minimumFee: 10` |
| JazzCash, Easypaisa, Bank Transfer | `RECEIVED_INTO_SHOP` | `SLAB` | `blockSize: 1000, feePerBlock: 20, minimumFee: 20` |
| Utility Bill | `SENT_FROM_SHOP` | `FLAT` | `flatFee: 50` |
| Jazz Load, Zong Load, Other | `SENT_FROM_SHOP` | `FLAT` | `flatFee: 0` |
| Utility Bill, Jazz Load, Zong Load, Other | `RECEIVED_INTO_SHOP` | `FLAT` | `flatFee: 0` |

**`calcFee(amount, r)` — the four modes:**

```js
if (!amount || !r || r.active === false) return 0;
if (r.calculationMethod === "SLAB")         fee = Math.ceil(amount / (r.blockSize || 1000)) * (r.feePerBlock || 0);
else if (r.calculationMethod === "PROPORTIONAL") fee = amount * ((r.ratePct || 0) / 100);
else if (r.calculationMethod === "FLAT")    fee = r.flatFee || 0;
else                                        fee = 0;                    // NONE
if (r.minimumFee) fee = Math.max(fee, r.minimumFee);
if (r.maximumFee !== null && r.maximumFee !== undefined) fee = Math.min(fee, r.maximumFee);
return Math.round(fee);
```

> `PROPORTIONAL` here is a **percentage of principal** (`ratePct`), *not* a pro-rated block. No default rule uses it; it exists only so the structure supports it.

**`calculate(input, state)` — the money model.**

```js
providerNetCommission = grossCommission − commissionTax     // tax clamped: Math.min(tax, gross)
grossServiceEarnings  = fee + grossCommission
netServiceEarnings    = fee + providerNetCommission − otherCharges
settled = (status === "SUCCESSFUL")
```

*SENT_FROM_SHOP:* `customerCashPaid = principal + fee`; when settled → `physicalCashIn = principal + fee`, `providerFloatOut = principal`.

*RECEIVED_INTO_SHOP:*
- `Collect Separately` → `customerPayout = principal`, `customerCashReceived = fee`; when settled → `physicalCashIn = fee`, `physicalCashOut = principal`, `providerFloatIn = principal`.
- `Deduct from Customer Payout` (default) → `customerPayout = max(0, principal − fee)`; when settled → `physicalCashOut = customerPayout`, `providerFloatIn = principal`.

**When `!settled`, `grossServiceEarnings` and `netServiceEarnings` are forced to `0`** — but the cash/float fields were never populated for unsettled rows in the first place.

**`recomputeBalances(s)`.** Replays **every** transaction (including `PENDING`/`FAILED`/`DISPUTED`, whose cash/float fields are all zero) over a clone of the opening balances:
```js
b.physicalCash += (t.physicalCashIn || 0) − (t.physicalCashOut || 0);
var key = BALANCE_KEYS[t.service] || "bankBalance";
b[key] += (t.providerFloatIn || 0) − (t.providerFloatOut || 0);
```
Because `physicalCash` opens at `0`, the "Physical Cash" balance is a **net delta**, not an absolute drawer count.

**`reverseTransaction(id, cashier)`.** Guards: `if (!orig || orig.status !== "SUCCESSFUL")` → `{ ok:false, message:"Only successful transactions can be reversed." }`; `if (some(t => t.reversalOfTransactionId === id))` → `{ ok:false, message:"This transaction has already been reversed." }`. Otherwise clones the original, assigns a new id, sets `status:"REVERSED"`, `reversalOfTransactionId: orig.id`, and **negates all 15 numeric fields**: `principalAmount, customerServiceFee, providerGrossCommission, providerCommissionTax, providerNetCommission, otherDirectCharges, grossServiceEarnings, netServiceEarnings, customerCashPaid, customerCashReceived, customerPayout, physicalCashIn, physicalCashOut, providerFloatIn, providerFloatOut`. The original stays visible.

**`updateStatus(id, status, extra)`.** Assigns the status + extras, then **recalculates unless the new status is `DISPUTED`** (`if (status !== "DISPUTED") Object.assign(tx, calculate(tx, s))`) — so a disputed row freezes its last computed figures.

**`totals(filter)`.** Filter keys: `settledOnly` (keeps `SUCCESSFUL` **and `REVERSED`**), `status`, `service`, `direction`, `cashier`. Accumulates `sent, received, sentFees, receivedFees, grossCommission, commissionTax, netCommission, otherCharges, grossEarnings, netEarnings` plus the matching `rows`.

**`balanceSummary()`.** One row per key in `digitalServiceOpeningBalances`, each with `{ key, service, opening, sent, received, current, pending, low, last }`. `low` = `b[key] < (LOW_THRESHOLDS[key] || 0)`. `pending` = Σ `principalAmount` of `PENDING` rows for that key. `last` = `tx[0].createdAt`.

**`migrate(raw)` + `seedIfNeeded(s)`.** `migrate` back-fills any missing top-level key and any missing balance key from the defaults, and repairs non-array collections — implementing *"Handle missing old localStorage fields safely."* `seedIfNeeded` runs once (guarded by `s.seeded`) and inserts five sample transactions, then sets `nextSeq = max(nextSeq, 1006)`.

**Seed transactions (exact):**

| id | Service | Direction | Principal | Status | Notes |
|---|---|---|---|---|---|
| `DST-1001` | JazzCash | SENT | 10,000 | SUCCESSFUL | ref `JC-EXT-1001`; Walk-in `0301-1112233` → fee 100 |
| `DST-1002` | Easypaisa | RECEIVED | 5,000 | SUCCESSFUL | `Deduct from Customer Payout`; ref `EP-EXT-1002`; Ayesha → fee 100, payout 4,900 |
| `DST-1003` | Utility Bill | SENT | 8,500 | SUCCESSFUL | `Electricity` / `LESCO` / `LESCO-998877`; ref `LESCO-EXT-1003` → flat fee 50 |
| `DST-1004` | Jazz Load | SENT | 1,000 | SUCCESSFUL | `providerGrossCommission: 14`; ref `JL-EXT-1004` → fee 0 |
| `DST-1005` | Bank Transfer | SENT | 25,000 | **PENDING** | **`providerTransactionId: ""`** — deliberately violates the "successful needs a reference" rule by being pending |

> `DST-1005` is the fixture that makes the dashboard's *"Pending digital transactions"* queue item and the reconciliation's pending counter non-zero on a fresh load.

---

### 3.17 `digital-history.html` — Digital Services: Transaction History

| | |
|---|---|
| **File** | `prototype/digital-history.html` |
| **`data-page`** | `digital-history` · **`<title>`** `Digital Transaction History · MobileShop OS` |
| **Purpose** | The manual provider-transaction log with pending, dispute and reversal controls. |
| **Proposed production route** | `/(app)/digital/history` |
| **Inferred roles** | Cashier (own rows), Manager, Owner. Reversal is a privileged action. |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

> **Formatting note.** This file and the other four digital pages are written in a **compressed style** — the layout wrappers are on one line (`<div class="layout"><aside id="sidebar"></aside>…`) and the scripts use minified-ish spacing. They still honour the `_CONTRACT.md` structure.

**Page head.** `<h1>` `"Digital Services — Transaction History"`; subtitle *"Manual records for external provider transactions, with pending, dispute and reversal controls."* Actions: `New transaction` (`.btn-primary`) → `digital-services.html`; `Reconcile` → `digital-reconciliation.html`.

**Filter card — 5 fields, all live (`input` + `change` → `render()`).**

| Field id | Type | Label | Options |
|---|---|---|---|
| `#fDate` | `input.input[type=date]` | `Date` | Matches `t.createdAt.slice(0,10)` |
| `#fService` | `select.input` | `Service` | `All` + `Digital.SERVICES` |
| `#fDirection` | `select.input` | `Direction` | `All` / `Amount Sent` (`SENT_FROM_SHOP`) / `Amount Received` (`RECEIVED_INTO_SHOP`) |
| `#fStatus` | `select.input` | `Status` | `All` + all 5 `Digital.STATUSES` |
| `#fCashier` | `input.input` | `Cashier` | placeholder `Any`; case-insensitive substring |

**Table — 12 columns.**

| Column | Cell |
|---|---|
| `Transaction ID` | `.mono` `t.id` |
| `Date and Time` | `.muted` `Digital.dateText(t.createdAt)` |
| `Service` | `t.service` |
| `Direction` | `dir(t.direction)` → `Amount Sent` / `Amount Received` |
| `Principal` (`.num`) | `Digital.pkr(t.principalAmount)` |
| `Service Fee` (`.num`) | `Digital.pkr(t.customerServiceFee)` |
| `Provider Commission` (`.num`) | `Digital.pkr(t.providerNetCommission)` |
| `Net Earnings` (`.num`) | `Digital.pkr(t.netServiceEarnings)`, `.pos-text` when `>= 0` else `.neg-text` |
| `Provider Reference` | `.mono` `t.providerTransactionId` or `<span class="badge warn">Missing</span>` |
| `Cashier` | `t.cashierName` |
| `Status` | `badge(t.status)` |
| `Action` | See below |

`badge(s)` mapping: `SUCCESSFUL` → `pos`; `PENDING` → `warn`; `FAILED` **or** `REVERSED` → `neg`; else (`DISPUTED`) → `info`.

Hint `#count` = `"{shown} of {total}"`. Empty → `<tr><td colspan="12" class="empty">No transactions match these filters.</td></tr>`.

**Row actions — `actions(t)`, conditional:**

| Button | Shown when | Handler |
|---|---|---|
| `View Details` | always | `viewTx(id)` |
| `Mark Successful` (`.btn-pos`) | `t.status === "PENDING"` | `markSuccess(id)` |
| `Reverse` (`.btn-danger`) | `t.status === "SUCCESSFUL"` **and** not already reversed | `reverseTx(id)` |
| `Dispute` (`.btn-ghost`) | `t.status !== "DISPUTED"` | `markDisputed(id)` |

`reversed` is computed per row as `state.digitalServiceTransactions.some(x => x.reversalOfTransactionId === t.id)`.

**`markSuccess(id)`** — uses a **native browser `prompt()`**:
```js
var ref = prompt("Provider Transaction ID required to mark successful:", t.providerTransactionId || "");
if (!ref) { Shell.toast("Provider Transaction ID is required.", false); return; }
Digital.updateStatus(id, "SUCCESSFUL", { providerTransactionId: ref });
```
> The only `prompt()` in the entire prototype, and the only place a modal is not built from the design system. Production must replace it with a proper dialog.

**`markDisputed(id)`** → `Digital.updateStatus(id, "DISPUTED")` → re-render → toast `"{id} marked disputed"`.

**`reverseTx(id)`** → `Digital.reverseTransaction(id, DB.SHOP.owner)`; on `!r.ok` toasts the guard message (*"Only successful transactions can be reversed."* / *"This transaction has already been reversed."*), else re-renders and toasts `"Reversal recorded · {r.tx.id}"`.

**Drawer `#detailDrawer`.** Title `"{id} · {service}"`. `.kv` rows, in order: `Status` (badge), `Direction`, `Principal`, `Customer service fee` (`.pos-text`), `Customer cash paid`, `Customer payout`, `Provider float in` (`.pos-text`), `Provider float out` (`.neg-text`), `Physical cash in` (`.pos-text`), `Physical cash out` (`.neg-text`), `Provider net commission` (`.pos-text`), `Net service earnings`, `Provider reference` (or `Missing`), `Customer` (`"{name} {phone}".trim()` or `—`), `Reversal of` (or `—`), `Notes` (or `—`).

**Data entities consumed:** `Digital` state, `DB.SHOP.owner`.

**Business rules visible:**
- **A pending row cannot become successful without a Provider Transaction ID.**
- **Reversal is once-only** and only from `SUCCESSFUL`; the original stays visible.
- Missing provider references are surfaced as a `warn` badge in the table (and counted on the dashboard and reconciliation).

---

### 3.18 `digital-balances.html` — Digital Services: Service Balances

| | |
|---|---|
| **File** | `prototype/digital-balances.html` |
| **`data-page`** | `digital-balances` · **`<title>`** `Digital Service Balances · MobileShop OS` |
| **Purpose** | Per-service float position: opening, settled movement, current, pending exposure, low-balance warnings. |
| **Proposed production route** | `/(app)/digital/balances` |
| **Inferred roles** | Cashier, Manager, Owner. |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |
| **Size** | The smallest screen in the prototype (2,476 bytes). |

**Page head.** `<h1>` `"Digital Services — Service Balances"`; subtitle *"Opening balances, settled movements, current float and pending exposure by service."* Actions: `New transaction` (`.btn-primary`) → `digital-services.html`; `Reconcile` → `digital-reconciliation.html`.

**KPI cards `#cards` — `.grid.cols-4`**, one per `Digital.balanceSummary()` row (**7 tiles**: Physical Cash, JazzCash, Easypaisa, Bank Transfer, Jazz Load, Zong Load, Utility Bill — ordered by `Object.keys(defaultBalances())`).

| Part | Value |
|---|---|
| class | `.kpi` + `.accent` **when `b.low`** |
| `.label` | `b.service` |
| `.value` | `Digital.pkr(b.current)`, `.neg-text` when `b.low` |
| `.meta` | `"Low balance warning"` when low, else `"opening {Digital.pkr(b.opening)}"` |

**Table "Balance movement" — 7 columns.** Hint: *"Pending transactions are shown separately, not in current balance."*

| Column | Cell |
|---|---|
| `Service` | `.strong` `b.service` + `<span class="badge neg">Low</span>` when `b.low` |
| `Opening Balance` (`.num`) | `Digital.pkr(b.opening)` |
| `Amount Sent Today` (`.num`) | `Digital.pkr(b.sent)` |
| `Amount Received Today` (`.num`) | `Digital.pkr(b.received)` |
| `Current Balance` (`.num`) | `.strong` `Digital.pkr(b.current)` |
| `Pending Amount` (`.num`) | `Digital.pkr(b.pending)` — class **`warn-text`, which does not exist in `styles.css`** |
| `Last Transaction` | `.muted` `Digital.dateText(b.last)` |

**No forms, no modals, no drawers, no row clicks.** The screen is read-only.

**Low thresholds** (from `digital.js` `LOW_THRESHOLDS`): Physical Cash **50,000**; JazzCash **25,000**; Easypaisa **25,000**; Bank Balance **50,000**; Utility Bill **25,000**; Jazz Load **10,000**; Zong Load **10,000**.

**Business rules visible:**
- **Pending amounts are excluded from the current balance** and reported separately as exposure.
- Each service maps to exactly one float bucket; `Bank Transfer` and `Other` **share `bankBalance`**.
- Low float is an operational alarm that propagates to the dashboard action queue.

---

### 3.19 `digital-commission.html` — Digital Services: Commission Report

| | |
|---|---|
| **File** | `prototype/digital-commission.html` |
| **`data-page`** | `digital-commission` · **`<title>`** `Digital Commission Report · MobileShop OS` |
| **Purpose** | Earnings analysis with grouping. Keeps principal rigorously separate from earnings. |
| **Proposed production route** | `/(app)/digital/commission` |
| **Inferred roles** | Owner, Manager, Accountant (`Finance & reports` = `View`). |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Digital Services — Commission Report"`; subtitle *"Principal stays separate from earnings. Net earnings are customer fees plus provider net commission minus direct charges."* Actions: `History` → `digital-history.html`; `New transaction` (`.btn-primary`) → `digital-services.html`.

**Form — one field.**

| Field id | Type | Label | Options |
|---|---|---|---|
| `#groupBy` | `select.input` | `Group by` | `service`, `direction`, `cashier`, `day`, `week`, `month` |

**Population.** `tx = state.digitalServiceTransactions.filter(t => t.status === "SUCCESSFUL" || t.status === "REVERSED")` — **reversals are included** so their negatives cancel the original.

**Service cards `#serviceCards` — `.grid.cols-4`, 6 tiles**, one per hardcoded service in `["JazzCash","Easypaisa","Bank Transfer","Utility Bill","Jazz Load","Zong Load"]` — label `"{service} Net Earnings"`, value `Digital.pkr(m.net)`, class `.pos-text`/`.neg-text`. **`Other` is omitted** even though it is a valid `Digital.SERVICES` entry.

**Summary cards `#summaryCards` — `.grid.cols-4`, 8 tiles** (all with meta `settled digital services only`):

| Tile | Value |
|---|---|
| Total principal sent | `total.sent` |
| Total principal received | `total.received` |
| Customer fees | `total.sentFees + total.receivedFees` (`.pos-text`) |
| Net digital-service earnings | `total.net` (`.pos-text` / `.neg-text`) |
| Provider gross commission | `total.grossCommission` |
| Commission tax | `total.tax` (`.neg-text`) |
| Provider net commission | `total.netCommission` (`.pos-text`) |
| Other direct charges | `total.charges` (`.neg-text`) |

**Table "Grouped earnings" — 10 columns**, rows sorted by group key (`Object.keys(groups).sort()`):

`Group` | `Sent Principal` | `Received Principal` | `Sent Fees` | `Received Fees` | `Gross Commission` | `Tax` | `Net Commission` | `Direct Charges` | `Net Earnings` (`.strong`) — all money columns `.num`.

**`keyFor(t, g)` — the grouping function:**

```js
if (g === "service")   return t.service;
if (g === "direction") return t.direction === "SENT_FROM_SHOP" ? "Amount Sent" : "Amount Received";
if (g === "cashier")   return t.cashierName || "Cashier";
if (g === "day")       return (t.createdAt || "").slice(0, 10);
if (g === "month")     return (t.createdAt || "").slice(0, 7);
if (g === "week")      { var onejan = new Date(d.getFullYear(), 0, 1);
                         return d.getFullYear() + " W" + Math.ceil((((d - onejan)/86400000) + onejan.getDay() + 1) / 7); }
return "All";
```

**`add(a, t)` — the accumulator** (identical shape to `Digital.totals`): splits `principalAmount`/`customerServiceFee` into `sent`/`sentFees` or `received`/`receivedFees` by direction, then adds `grossCommission`, `tax`, `netCommission`, `charges`, `net`.

**No modals, no drawers, no row clicks.**

**Business rules visible:**
- **Principal is never earnings** — the two are reported in separate tiles and separate columns.
- `Net earnings = customer fees + provider net commission − direct charges` (stated in the subtitle and implemented in `digital.js`).
- **Only settled (`SUCCESSFUL` + `REVERSED`) rows count.**

---

### 3.20 `digital-reconciliation.html` — Digital Services: Reconciliation

| | |
|---|---|
| **File** | `prototype/digital-reconciliation.html` |
| **`data-page`** | `digital-recon` · **`<title>`** `Digital Reconciliation · MobileShop OS` |
| **Purpose** | Compare counted cash and counted provider-app balances against the prototype's records; record variances with a reason. |
| **Proposed production route** | `/(app)/digital/reconciliation` |
| **Inferred roles** | Cashier (`Cash session & drawer` = `Full`), Manager, Owner. |
| **Scripts** | `data.js` → `digital.js` → `shell.js` → inline |

**Page head.** `<h1>` `"Digital Services — Reconciliation"`; subtitle *"Compare counted cash and provider app balances against prototype records."* Actions: `Balances` → `digital-balances.html`; `New transaction` (`.btn-primary`) → `digital-services.html`.

**Summary `#summary` — `.grid.cols-4`, but 6 tiles rendered** (all meta `digital services only`):

| Tile | Value |
|---|---|
| Expected physical cash impact | `Digital.pkr((cash.received \|\| 0) − (cash.sent \|\| 0))` where `cash` = the `physicalCash` balance row |
| Successful transactions | count `status === "SUCCESSFUL"` |
| Pending transactions | count `status === "PENDING"` · class `warn-text` **(undefined class)** |
| Reversed transactions | count `status === "REVERSED"` · `.neg-text` when > 0 |
| Missing provider references | count `SUCCESSFUL && !providerTransactionId` · `.neg-text` when > 0 |
| Calculated service earnings | `Digital.totals({settledOnly:true}).netEarnings` · `.pos-text` / `.neg-text` |

**Card "Counted balances".** Hint: *"Variance reason is required before saving if any row does not match."*

`#countRows` renders **one row per balance key** (7), each a `.kv`:
- Left: `"{b.service} expected <b>{Digital.pkr(b.current)}</b>"`
- Right: `<input class="input count-input" data-key="{b.key}" type="number" min="0" value="{b.current}">` — **pre-filled with the expected value**, so an untouched form always balances
- Plus a live badge `#var-{key}`

| Field id | Type | Label | Notes |
|---|---|---|---|
| `.count-input[data-key]` × 7 | `input[type=number][min=0]` | `{service} expected {amount}` | Live `input` → `updateVariance()` |
| `#reason` | `textarea.input[rows=2]` | `Reason for variance` | |
| `#cashier` | `input.input` | `Cashier` | Pre-filled `DB.SHOP.owner` |
| `#saveBtn` | `.btn.btn-primary` | `Save reconciliation` | → the save handler |

**`collect()`** builds `variances[key] = { expected: b.current, counted, variance: counted − b.current }` and sets `any = true` if any variance ≠ 0.

**`updateVariance()`** per key: `v === 0` → badge `pos` `"Balanced"`; `v > 0` → badge `warn` `"Over {amount}"`; `v < 0` → badge `neg` `"Short {amount}"`. Same over/short semantics as `closing.html`.

**Save handler.**
```js
var c = collect(), reason = $("reason").value.trim();
if (c.any && !reason) { Shell.toast("Variance reason is required.", false); $("reason").focus(); return; }
Digital.saveReconciliation({ cashierName: $("cashier").value || DB.SHOP.owner,
                             reason: reason || "Balanced", variances: c.variances });
```
Then reload state, clear `#reason`, re-render, toast `"Digital reconciliation saved"`. `Digital.saveReconciliation` assigns `id: "DSR-" + Date.now()`, `createdAt: nowIso()`, and unshifts into `digitalServiceReconciliations` (**persisted to localStorage**).

> Saving a reconciliation is what clears the dashboard's *"Digital reconciliation incomplete"* queue item (which fires on `digitalServiceReconciliations.length === 0`).

**Table "Saved reconciliations" — 5 columns.**

| Column | Cell |
|---|---|
| `ID` | `.mono` `r.id` |
| `Timestamp` | `Digital.dateText(r.createdAt)` |
| `Cashier` | `r.cashierName` |
| `Reason` | `r.reason` |
| `Variances` | Non-zero variances as `"{key}: {amount}"` joined by `", "`, else `"Balanced"` |

Empty → `<tr><td colspan="5" class="empty">No reconciliations saved yet.</td></tr>`.

**Business rules visible:**
- **A variance requires a reason** — the same hard rule as the cash `closing.html`.
- Reconciliation captures **reason + cashier + timestamp**.
- Every float (not just cash) is counted against the provider's own app.
- **Physical cash here is an *impact*, not a drawer count** — it opens at `0` and reconciles the digital-service delta only.

---

*(Intelligence 3.21–3.23, System 3.24, and sections 4–5 continue below.)*
