# Prototype build contract — READ FULLY before writing a page

You are building ONE screen of the **MobileShop OS** clickable prototype: a
static, front-end-only website (opened via `file://`, no server, no build step,
no external network) that lets the shop owner walk the **flow** of the system.

Every page MUST look and behave like it belongs to the same product. Follow this
contract exactly. Do not invent your own CSS framework, colors, or nav.

## 1. Page skeleton (copy `_TEMPLATE.html` exactly)

- Full HTML document. `<link rel="stylesheet" href="assets/styles.css">` in head.
- `<body data-page="...">` — set the id so the correct sidebar item highlights.
- Structure is fixed: `.layout > (#sidebar + .main > (#topbar + main.content))`.
- Put your screen markup inside `<main class="content">`.
- Put drawers/modals as `.overlay` elements AFTER `.layout` (siblings), before scripts.
- Scripts in this order at end of body: `data.js`, `shell.js`, then your inline `<script>`.
- The sidebar and topbar render themselves from `shell.js` — **do not** write nav markup.

## 2. `data-page` id per page (must match exactly)

`index.html`→`dashboard` · `pos.html`→`pos` · `demand.html`→`demand` ·
`customers.html`→`customers` · `inventory.html`→`inventory` ·
`product.html`→`inventory` · `unit.html`→`inventory` · `purchases.html`→`purchases` ·
`purchase-order.html`→`purchases` · `suppliers.html`→`suppliers` ·
`returns.html`→`returns` · `repairs.html`→`repairs` · `used-intake.html`→`used` ·
`finance.html`→`finance` · `closing.html`→`closing` ·
`intelligence.html`→`intelligence` · `reports.html`→`reports` · `tasks.html`→`tasks` ·
`settings.html`→`settings`

## 3. Data — use the shared seed, do NOT invent numbers

`data.js` exposes globals `DB` and `fmt`. Read the actual file for exact fields.
Key collections: `DB.SHOP, DB.KPI, DB.variants, DB.stock, DB.units, DB.sales,
DB.demand, DB.suppliers, DB.purchaseOrders, DB.recommendations, DB.budget,
DB.customers, DB.returns, DB.repairs, DB.usedIntakes, DB.finance, DB.tasks,
DB.attention, DB.notifications, DB.reports, DB.audit`.

Formatters: `fmt.pkr(612500)`→"Rs 612,500", `fmt.pkrShort(8940000)`→"Rs 89.40 Lac",
`fmt.num(n)`, `fmt.pct(8.4)`→"+8.4%", `fmt.variant(id)`, `fmt.variantName(id)`.

Render tables/lists by iterating these arrays. You MAY compute derived values
(totals, counts) in JS. Keep money via `fmt.pkr`. Do not hard-code contradictory figures.

## 4. Design language (from the blueprint)

- Clean retail-ops interface. Neutral surface, ONE accent (indigo, `--accent`).
- **Green = confirmed positive only. Red = loss / blocking only. Amber = attention.**
- **Status is never conveyed by color alone** — every badge has text (and often an icon).
- Money: always `Rs` with thousands separators, tabular numerals, right-aligned in tables.
- Dense, compact data tables. Plain language over accounting jargon.
- **Explain every number:** metrics/rows should be clickable and drill down (navigate to
  the relevant page or open a detail drawer). Use `class="row-link"` + an `onclick` that
  navigates or opens a drawer.
- **Confirmation = impact summary, not "Are you sure?"** Use the `.impact` box to state
  the concrete effect (e.g. "Posting removes IMEI X from stock, records Rs 118,000 revenue,
  Rs 12,850 profit."). See POS/intelligence.
- Every screen needs a **page header**: `.page-head` with `<h1>`, a `.subtitle`, and
  `.actions` (buttons) on the right. Detail pages add a `.breadcrumb` above it.
- Provide empty/success states where relevant (`.empty`, `.callout`, toasts).

## 5. Component classes available (see styles.css for the full set)

- Cards: `.card`, `.card-head`(h3 + `.actions`/`.hint`), `.card-pad`.
- Grid: `.grid.cols-2/3/4/6` (auto-responsive).
- KPI tile: `.kpi` with `.label`,`.value`,`.meta` (+`.trend.up/.down`); add `.accent` for a top border.
- Buttons: `.btn`, `.btn-primary`, `.btn-pos`, `.btn-danger`, `.btn-ghost`, `.btn-sm`, `.btn-lg`, `.btn-block`.
  Icons in buttons via `Shell.svg('name')` (names: sell, demand, inventory, purchases, check, bell, search, settings…).
- Badges: `.badge` + `.pos/.neg/.warn/.info/.accent/.plain`. Include text; optionally a leading `<span class="dot-i"></span>`.
- Tables: `.table-wrap > table.data` with `th`/`td`; `.num` for numeric right-align; `.mono` for IMEI/SKU; `.row-link` for clickable rows.
- Meters: `.meter`(+`.pos/.warn/.neg`)`> span[style=width:NN%]`; `.confbar` wraps a meter + label for confidence.
- Attention cards: `.attn-card`(+`.critical/.attention`) with `.rankdot`,`.t`,`.d`,`.chev`.
- Tabs: `.tabs > .tab(.active)` + `.tab-panel(.active)`; wire with a tiny click handler.
- Forms: `.field > label + .input` (or `select.input`/`textarea.input`), `.field-row`, `.seg` (segmented control), `.help`.
- Timeline: `.timeline > .tl-item(.done)` with `.tl-time`,`.tl-title`,`.tl-desc`.
- Drawer/modal: `.overlay(.open)(.center) > .drawer|.modal > .drawer-head|.modal-head + .drawer-body|.modal-body + .drawer-foot|.modal-foot`. Open/close with `Shell.open('id')` / `Shell.close('id')`. Close button `<div class="x-close" onclick="Shell.close('id')">✕</div>`.
- Confirmation impact: `.impact` (with `<ul>`).
- Empty/callout: `.empty`(`.icn`,h4,p), `.callout.info/.warn/.neg/.pos`.
- Misc: `.kv`(`.k`/`.v`) key-value rows, `.divider`, `.spread`, `.row`, `.stack.g6/g10/g16`, `.tag-list`, `.thumb`, `.avatar-sm`, `.small/.tiny/.muted`, `.mono`, `.pos-text/.neg-text`, `.breadcrumb`.

## 6. Shell helpers (`shell.js`, global `Shell`)

`Shell.svg(name[,cls])` returns an inline `<svg>` string ·
`Shell.open(id)` / `Shell.close(id)` open/close an `.overlay` by id ·
`Shell.toast(msg[,positive=true])` bottom toast ·
`Shell.notifications()` opens the notifications drawer. Esc closes overlays automatically.

## 7. Interactivity rules

- Everything is a prototype: destructive/backend actions just show a toast and/or
  update the DOM locally (e.g. add a cart row, tick a checklist gate). Never require a server.
- Cross-page links use real hrefs (e.g. `href="intelligence.html"`), so the flow is walkable.
- Keep inline JS small, vanilla, dependency-free. No frameworks, no CDN, no external fonts/images.
- Use emoji/`Shell.svg` for any imagery — no `<img>` with remote src.

## 8. Quality bar

Faithful to the blueprint's flow, realistic Lahore mobile-shop content (already in
`DB`), visually consistent with sibling pages, and genuinely clickable where the
flow matters. Aim for a screen a shop owner could actually read and understand.
