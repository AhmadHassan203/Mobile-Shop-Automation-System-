# Database Implementation Map

**Status: PLAN ONLY. No migration has been generated, and none has been applied.**

At the time of writing, `database/` does not exist in the repository, there is no `schema.prisma`, and Prisma is not installed in any workspace package. Nothing in this document describes working software. Every table below is **Not started**. The only production code that exists and is verified is `shared/` (money, imei, phone, enums, permissions, errors, datetime, fee-rules, constants — 153 unit tests passing, lint 0, typecheck 0).

The blocker preventing schema work from proceeding to a real migration is recorded in [§9](#9-migration-and-seed-strategy).

**Sources read for this document** (no claim below comes from anywhere else):

| Source | Used for |
|---|---|
| `mobile-shop-automation-blueprint/04_DATA_MODEL.md` | Entity list, `InventoryUnit` fields, movement types, audit fields, indexing priorities |
| `mobile-shop-automation-blueprint/05_RULES.md` | Non-negotiable rules, serialized states, finance rules, engineering rules |
| `mobile-shop-automation-blueprint/13_PRODUCTION_MASTER_BUILD_PROMPT.md` | §10, §11, §13, §16, §19, §22, §23, plus §25 slice numbering and §26 seed list |
| `mobile-shop-automation-blueprint/09_ANALYTICS_AND_REORDERING.md` | Metric, recommendation, decision and evaluation fields |
| `prototype/assets/data.js` | Seed shapes the UI actually consumes |
| `shared/src/*.ts` | Enum values, permission keys, sequence keys, fee-rule shape, `Minor` type |

---

## 1. Modeling principles

These restate `04_DATA_MODEL.md` §1 and `13_` §19 as concrete database decisions.

### 1.1 Money is integer minor units

All money columns are `BIGINT NOT NULL` holding **PKR paisa**, named with a `_minor` suffix without exception. This matches `shared/src/money.ts`, whose `Minor` type is a branded integer, and `05_RULES.md` §7 ("Store money as integer minor units") and `13_` §23.11 ("never floating point").

`BIGINT` rather than `INTEGER` is a deliberate choice. `prototype/assets/data.js` `KPI.inventoryValue` is `8940000` (Rs 8.94M) = 894,000,000 paisa. PostgreSQL `integer` tops out at 2,147,483,647 = Rs 21,474,836.47. A single inventory-valuation or annual-revenue aggregate would sit within one order of magnitude of overflow. `BIGINT` removes the question.

`NUMERIC`, `FLOAT` and `MONEY` are prohibited for amounts. Rates that are genuinely fractional (`external_fee_rules.percentage_rate`, recommendation scores, weights) use `NUMERIC(p,s)` because they are ratios, not amounts, and are never summed as money.

### 1.2 Catalog definition is not a physical unit

`product_variants` is a *sellable definition*. `serialized_inventory_units` is *one physical device* with its own IMEI, its own actual cost and its own state (`04_DATA_MODEL.md` §3; `13_` §9: "A catalog variant is not a physical phone"). The prototype already models this split: `data.js` `variants[]` carries `avgCost`/`price`, while `units[]` carries per-device `cost`, `list`, `state`, `battery`, `risk`.

Consequence: `product_variants.condition` and `pta_status` exist for sellable grouping, **and** `serialized_inventory_units.condition` / `pta_status` exist as the verified physical truth. `04_DATA_MODEL.md` §3 requires both: "PTA status and condition may be variant-level for sellable grouping, but final verified status must also exist on the physical inventory unit." They are allowed to disagree; the unit wins for any sale decision.

### 1.3 Movements are append-only; balances are derived

`inventory_movements` is an append-only ledger. It has no `UPDATE` or `DELETE` path in any domain service, and the database blocks both (§7.3). `04_DATA_MODEL.md` §5: "The movement ledger remains authoritative."

`stock_balances` is a transactionally-maintained read model, not a source of truth — it must be rebuildable from `inventory_movements` alone, and a rebuild script plus a drift-detection check are part of Slice 3. `13_` §23.8 ("Direct stock-counter editing is prohibited") is enforced by giving no module write access to `stock_balances` except the inventory movement service.

### 1.4 Posted records are immutable snapshots

`sale_lines` stores product name, SKU, IMEI/serial, unit price, discount, tax, actual COGS, gross profit and warranty terms **copied at posting time** (`04_DATA_MODEL.md` §6). It does not join to the catalog to render a historical receipt. This is what makes `05_RULES.md` §1.11 ("Profit is based on recorded COGS, not current catalog cost") true rather than aspirational, and it survives a later catalog rename.

The same applies to `external_transactions` (fee-rule snapshot columns, so re-pricing a rule never rewrites posted fee history — this is exactly why `shared/src/fee-rules.ts` documents `FeeRule` as "Snapshotted onto each transaction"), and to `recommendation_runs.configuration_snapshot`.

Immutability is enforced in the database, not only in services — see §7.3.

### 1.5 Org / branch / location keys exist from day one

`organization_id` is on every tenant-scoped table. `branch_id` is on every operational and financial table. `location_id` is on every table describing physical stock placement. Launch is one organization, one branch, one location (`13_` §3), and `13_` §8 says "The launch UI is single-branch. Do not add an unnecessary branch selector, but include branch/location keys in the correct database entities."

Adding a scope column to a populated financial table later is a data-backfill migration with ambiguous answers. Adding it now costs 4 bytes and nothing else. Every unique constraint on business data is therefore scoped by `organization_id` from the start, so multi-branch does not later break uniqueness semantics.

Reference/lookup tables (`permissions`, `number_sequences` definitions) are the exception where noted.

### 1.6 Conventions applied to every table

| Concern | Decision |
|---|---|
| Primary key | `id UUID PRIMARY KEY`, application-generated **UUIDv7** for index locality on append-heavy tables. Sequential integers are avoided — they leak volume and are guessable in URLs. |
| Human-facing numbers | Separate column (`invoice_number`, `po_number`), allocated from `number_sequences` (§5.5). Never the PK. |
| Timestamps | `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Stored UTC-consistent, displayed `Asia/Karachi` (`05_RULES.md` §9). |
| Business day | `business_date DATE` where a report groups by shop day, computed via `shared/src/datetime.ts` `toBusinessDate()`. A timestamp alone cannot answer "what happened today" correctly across the UTC+05:00 boundary. |
| Controlled vocabularies | **Native PostgreSQL enums**, generated 1:1 from `shared/src/enums.ts`. That file already states "Values are snake_case and are persisted, so renaming one is a migration" — PG enum semantics match that contract exactly. Configurable vocabularies (service types, expense categories) are **lookup tables**, not enums. **Gap:** several enum-typed columns in §2 have no vocabulary in `enums.ts` yet — `ownership_state` (required by `04` §4), `identifier_type`, `equity_type`, `payment_source`, `barcode_type`, `location_kind`, `check_type`, `severity`, `task_type`, `account_type`/`account_subtype`. Each must be added to `enums.ts` *before* the migration that uses it, or the 1:1 rule is already broken on day one. `rounding` is the exception: its vocabulary is `RoundingMode` in `shared/src/money.ts`, not `enums.ts`. |
| Soft delete | Master data: `is_active BOOLEAN` / `deleted_at TIMESTAMPTZ` (`04_DATA_MODEL.md` §11, `05_RULES.md` §2 "Inactive products remain visible in historical records"). Posted records: never deleted. |
| Delete behavior | `ON DELETE RESTRICT` everywhere by default. `CASCADE` only on pure join tables (§6.4). |
| Optimistic concurrency | `version INTEGER NOT NULL DEFAULT 0` on mutable drafts only (§7.2). |
| Naming | Tables `snake_case` plural; columns `snake_case`; money `*_minor`; FKs `<entity>_id`; booleans `is_*`/`has_*`. |

---

## 2. Table-by-table map

Every entity in `13_` §19 is covered. Slice numbers refer to `13_` §25.

**Legend.** "Uniques / indexes / FK" lists only the non-obvious; `organization_id` FK → `organizations(id)` RESTRICT and the `created_at`/`updated_at` pair are implied on every row.

### 2.1 Organization and access — Slice 1

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `organizations` | Tenant root. One row at launch ("Al-Madina Mobiles", `data.js` `SHOP.name`). | `id`, `name`, `legal_name`, `currency_code` (default `PKR`), `timezone` (default `Asia/Karachi`), `is_active` | `UNIQUE(name)` | 1 |
| `branches` | Physical branch ("Hall Road, Lahore", `SHOP.branch`). | `id`, `organization_id`, `code`, `name`, `address`, `is_active` | `UNIQUE(organization_id, code)`; FK org RESTRICT | 1 |
| `stock_locations` | Stock placement within a branch. Prototype `units[].location`: "Store — Display", "Store — Safe", "Store — Counter", "Intake — Quarantine". | `id`, `organization_id`, `branch_id`, `code`, `name`, `location_kind`, `is_default`, `is_active` | `UNIQUE(organization_id, branch_id, code)`; partial `UNIQUE(branch_id) WHERE is_default`; FK branch RESTRICT | 1 |
| `users` | Login identity. | `id`, `organization_id`, `email`, `phone_e164`, `full_name`, `password_hash`, `is_active`, `last_login_at`, `failed_login_count`, `locked_until` | `UNIQUE(organization_id, lower(email))`; `password_hash` is argon2 0.44.0, never logged (`05_RULES.md` §9) | 1 |
| `roles` | 7 role codes from `shared/src/permissions.ts` `ROLES`. | `id`, `organization_id`, `code`, `name`, `is_system` | `UNIQUE(organization_id, code)` | 1 |
| `permissions` | Permission key registry — the 73 keys in `PERMISSIONS`. Global, not org-scoped. | `id`, `key`, `resource`, `action`, `description` | `UNIQUE(key)` | 1 |
| `role_permissions` | Grants. Seeded from `DEFAULT_ROLE_PERMISSIONS`. | `role_id`, `permission_id` | `PK(role_id, permission_id)`; FK both **CASCADE** | 1 |
| `user_roles` | Role assignment. | `user_id`, `role_id`, `assigned_by_user_id`, `assigned_at` | `PK(user_id, role_id)`; FK user/role **CASCADE** | 1 |
| `user_scope_access` | Which branches/locations a user may touch. Enforces `13_` §23.21 "Cross-scope data access is blocked". | `id`, `user_id`, `branch_id`, `location_id` (nullable = whole branch) | `UNIQUE(user_id, branch_id, location_id)`; FK CASCADE on user | 1 |
| `user_sessions` | Server-side session records for HTTP-only cookies (`13_` §8). Addition — see §8, D-6. | `id`, `user_id`, `token_hash`, `issued_at`, `expires_at`, `revoked_at`, `ip`, `user_agent` | `UNIQUE(token_hash)`; `INDEX(user_id, expires_at)`; FK user CASCADE | 1 |

### 2.2 Catalog and pricing — Slice 2

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `categories` | Category tree (`13_` §9 "categories and subcategories"). | `id`, `organization_id`, `parent_category_id`, `name`, `slug`, `is_active` | `UNIQUE(organization_id, slug)`; self-FK RESTRICT; `INDEX(parent_category_id)` | 2 |
| `brands` | 10–15 brands (`13_` §26). Prototype: Apple, Samsung, Infinix, Tecno, Xiaomi, Vivo, Oppo, Baseus, Ugreen, Anker, JBL, Spigen. | `id`, `organization_id`, `name`, `slug`, `is_active` | `UNIQUE(organization_id, slug)` | 2 |
| `product_models` | e.g. "iPhone 17 Pro Max". | `id`, `organization_id`, `brand_id`, `category_id`, `name`, `canonical_name`, `is_active` | `UNIQUE(organization_id, brand_id, canonical_name)`; FK brand/category RESTRICT | 2 |
| `product_variants` | Sellable definition. `data.js` `variants[]`. | `id`, `organization_id`, `product_model_id`, `sku`, `name`, `tracking_type` (enum), `condition` (enum), `pta_status` (enum), `ram`, `storage`, `color`, `region`, `warranty_type` (enum), `warranty_months`, `attributes JSONB`, `default_price_minor`, `min_price_minor`, `reorder_point`, `case_pack_size`, `is_active`, `version` | `UNIQUE(organization_id, sku)`; `INDEX(organization_id, product_model_id)`; trigram index on `name` for search; `CHECK (sku = upper(sku))`; `CHECK (min_price_minor IS NULL OR min_price_minor >= 0)` | 2 |
| `product_aliases` | Misspellings/local names (`05_RULES.md` §2). | `id`, `organization_id`, `product_variant_id`, `alias`, `normalized_alias`, `source` | `UNIQUE(organization_id, normalized_alias)`; FK variant RESTRICT | 2 |
| `product_barcodes` | 0..n barcodes per variant (`13_` §9). | `id`, `organization_id`, `product_variant_id`, `barcode`, `barcode_type`, `is_primary` | `UNIQUE(organization_id, barcode)`; partial `UNIQUE(product_variant_id) WHERE is_primary`; FK variant RESTRICT | 2 |
| `price_lists` | Named price list (retail/wholesale). Not in §19; required by the Pricing module (`13_` §7). | `id`, `organization_id`, `code`, `name`, `effective_from`, `effective_to`, `is_active` | `UNIQUE(organization_id, code)` | 2 |
| `price_entries` | Price per variant per list, versioned by date. | `id`, `organization_id`, `price_list_id`, `product_variant_id`, `price_minor`, `min_price_minor`, `effective_from`, `effective_to` | `UNIQUE(price_list_id, product_variant_id, effective_from)`; `CHECK (effective_to IS NULL OR effective_to > effective_from)`; `CHECK (price_minor >= 0)` | 2 |
| `compatibility_rules` | Accessory ↔ model fit (`04_DATA_MODEL.md` §2). Deferred: no prototype screen consumes it. | `id`, `organization_id`, `accessory_variant_id`, `compatible_model_id`, `note` | `UNIQUE(accessory_variant_id, compatible_model_id)` | 14 |

### 2.3 Inventory — Slice 3

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `serialized_inventory_units` | One physical device. `data.js` `units[]`. Detailed in §2.3.1. | See §2.3.1 | See §2.3.1 and §5.1 | 3 |
| `device_identifiers` | The IMEI/serial uniqueness authority. See §5.1 and deviation D-1. | `id`, `organization_id`, `serialized_inventory_unit_id`, `identifier_type` (enum `imei1`/`imei2`/`serial`), `normalized_value`, `raw_value` | `UNIQUE(organization_id, normalized_value)`; `UNIQUE(serialized_inventory_unit_id, identifier_type)`; FK unit **CASCADE** | 3 |
| `stock_batches` | Cost layers for quantity items (`04_DATA_MODEL.md` §5). | `id`, `organization_id`, `branch_id`, `location_id`, `product_variant_id`, `batch_code`, `goods_receipt_line_id`, `quantity_received`, `quantity_remaining`, `unit_cost_minor`, `landed_cost_minor`, `received_at` | `INDEX(organization_id, product_variant_id, location_id)`; `CHECK (quantity_remaining >= 0)`; `CHECK (quantity_remaining <= quantity_received)`; FK RESTRICT | 3 |
| `inventory_movements` | Append-only ledger. Detailed in §2.3.2. | See §2.3.2 | See §2.3.2 | 3 |
| `stock_balances` | Derived read model. Rebuildable from movements. | `id`, `organization_id`, `branch_id`, `location_id`, `product_variant_id`, `quantity_on_hand`, `quantity_reserved`, `quantity_inbound`, `updated_at` | `UNIQUE(organization_id, branch_id, location_id, product_variant_id)`; **`CHECK (quantity_on_hand >= 0)`** ← this is where `13_` §23.2 is actually enforced; `CHECK (quantity_reserved >= 0)`; `CHECK (quantity_reserved <= quantity_on_hand)` | 3 |
| `reservations` | Held stock. Prototype `units[].state = "reserved"`, task T-04 "Reservation INV-1044 expires — pickup Tue". | `id`, `organization_id`, `branch_id`, `product_variant_id`, `serialized_inventory_unit_id` (nullable), `customer_id`, `quantity`, `status`, `expires_at`, `sale_id` (nullable), `created_by_user_id` | partial `UNIQUE(serialized_inventory_unit_id) WHERE status='active'`; `INDEX(organization_id, expires_at) WHERE status='active'`; `CHECK (quantity > 0)` | 3 |
| `stock_counts` | Count sessions (`13_` §10 "stock count and reconciliation"). | `id`, `organization_id`, `branch_id`, `location_id`, `count_number`, `status`, `started_by_user_id`, `started_at`, `completed_at`, `approved_by_user_id`, `version` | `UNIQUE(organization_id, count_number)` | 3 |
| `stock_count_lines` | Expected vs counted per variant. | `id`, `stock_count_id`, `product_variant_id`, `serialized_inventory_unit_id`, `expected_quantity`, `counted_quantity`, `variance_quantity`, `note` | `UNIQUE(stock_count_id, product_variant_id, serialized_inventory_unit_id)`; FK count **CASCADE** (a draft count owns its lines) | 3 |
| `stock_adjustments` | Reason-bearing correction (`05_RULES.md` §1.9 "All stock adjustments require a reason and audit entry"). | `id`, `organization_id`, `branch_id`, `location_id`, `adjustment_number`, `product_variant_id`, `serialized_inventory_unit_id`, `quantity_delta`, `reason` (enum `AdjustmentReason`), `reason_note`, `stock_count_id`, `created_by_user_id`, `approved_by_user_id`, `posted_at` | `UNIQUE(organization_id, adjustment_number)`; **`CHECK (reason_note IS NOT NULL AND length(btrim(reason_note)) > 0)`**; `CHECK (quantity_delta <> 0)` | 3 |
| `device_checks` | PTA / police / inspection check history per unit. Merge of `DeviceVerification` + `DeviceInspection` — deviation D-2. | `id`, `organization_id`, `serialized_inventory_unit_id`, `check_type`, `result`, `reference`, `checked_by_user_id`, `checked_at`, `integration_attempt_id`, `details JSONB` | `INDEX(serialized_inventory_unit_id, checked_at DESC)`; FK unit RESTRICT | 3 (PTA/police) · 14 (full inspection) |

#### 2.3.1 `serialized_inventory_units`

Follows `04_DATA_MODEL.md` §4, with two changes: identifiers (`imei1`/`imei2`/`serial_number`) move to `device_identifiers` (D-1), and `barcode` is dropped — a barcode identifies a *variant*, not a physical device, so it lives on `product_barcodes` (§5.3). `supplier_id` and `current_sale_line_id` are additions, noted below.

| Column | Type | Note |
|---|---|---|
| `id` | `UUID PK` | |
| `organization_id`, `branch_id`, `location_id` | `UUID` | `location_id` nullable only when `stock_state='sold'` — prototype `units[]` INV-1032 has `location: "—"` once sold |
| `product_variant_id` | `UUID NOT NULL` | FK RESTRICT |
| `sku` | `TEXT` | Denormalized snapshot at receipt |
| `condition` | `product_condition` enum | Physical truth, may differ from variant |
| `stock_state` | `serialized_stock_state` enum NOT NULL | The 12 values in `SERIALIZED_STOCK_STATES` |
| `ownership_state` | `ownership_state` enum | `owned` / `consignment` / `customer_owned` (repairs) |
| `pta_status` | `pta_status` enum | `PTA_STATUSES` |
| `pta_verified_at` | `TIMESTAMPTZ` | |
| `pta_verification_reference` | `TEXT` | |
| `police_verification_status` | `police_verification_status` enum | |
| `police_verification_reference` | `TEXT` | |
| `purchase_order_line_id`, `goods_receipt_line_id` | `UUID` | Nullable — opening stock has neither |
| `supplier_id` | `UUID` | Denormalized for "source" display: `units[].source = "PO-2041 · TechSource Intl"` |
| `acquired_at` | `TIMESTAMPTZ` | |
| `unit_cost_minor`, `landed_cost_minor`, `list_price_minor` | `BIGINT` | `CHECK (unit_cost_minor >= 0)`; `CHECK (landed_cost_minor >= unit_cost_minor)` |
| `warranty_type` | `warranty_type` enum | |
| `warranty_start`, `warranty_end` | `DATE` | `CHECK (warranty_end IS NULL OR warranty_end >= warranty_start)` |
| `battery_health_percent` | `SMALLINT` | `CHECK (BETWEEN 0 AND 100)`. Prototype `"88%"`, `"100%"` |
| `grade` | `TEXT` | Prototype `"New"`, `"Grade A"` |
| `risk_flags` | `TEXT[]` | Prototype `risk: ["Police e-Gadget check pending", "Battery health below 90%"]` |
| `current_sale_line_id` | `UUID` | Nullable; set at posting, cleared on return-to-stock |
| `version` | `INTEGER NOT NULL DEFAULT 0` | Per `04_DATA_MODEL.md` §4 |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | |

Indexes: `INDEX(organization_id, stock_state, product_variant_id)` (the "available/reserved/sold" views of `13_` §10); `INDEX(organization_id, location_id) WHERE stock_state <> 'sold'`; `INDEX(organization_id, product_variant_id, acquired_at)` for aging (`data.js` `stock[].ageDays`, attention card #3 "iPhone 15 (used) — 41 days in stock").

Checks: `CHECK (stock_state <> 'sold' OR current_sale_line_id IS NOT NULL)` — a sold unit must name its sale. `CHECK (stock_state = 'sold' OR location_id IS NOT NULL)` — an on-hand unit has exactly one location (`05_RULES.md` §1.2, `13_` §23.3).

#### 2.3.2 `inventory_movements`

| Column | Type | Note |
|---|---|---|
| `id` | `UUID PK` | UUIDv7 — append-only, time-ordered |
| `organization_id`, `branch_id`, `location_id` | `UUID NOT NULL` | |
| `product_variant_id` | `UUID NOT NULL` | |
| `serialized_inventory_unit_id` | `UUID` | Null for quantity items |
| `stock_batch_id` | `UUID` | Null for serialized |
| `movement_type` | `movement_type` enum NOT NULL | The 14 values in `MOVEMENT_TYPES` |
| `quantity_delta` | `INTEGER NOT NULL` | Sign must agree with `MOVEMENT_ON_HAND_SIGN` |
| `unit_cost_minor` | `BIGINT` | Cost layer consumed/created |
| `source_type`, `source_id` | `TEXT` / `UUID` | Which document caused it |
| `reason`, `reason_note` | enum / `TEXT` | Required for adjustments |
| `occurred_at` | `TIMESTAMPTZ NOT NULL` | |
| `business_date` | `DATE NOT NULL` | Asia/Karachi day |
| `actor_user_id` | `UUID NOT NULL` | |

Constraints: `CHECK (quantity_delta <> 0)`; `CHECK ((serialized_inventory_unit_id IS NOT NULL) <> (stock_batch_id IS NOT NULL))` — exactly one side; `CHECK (serialized_inventory_unit_id IS NULL OR abs(quantity_delta) = 1)` — a serialized movement moves exactly one device. Sign-vs-type agreement is a `CHECK` enumerating the 14 types (`MOVEMENT_ON_HAND_SIGN`; `reserve`/`release` are handled as reserved-column moves, so they are excluded from the on-hand ledger and carry `quantity_delta` against `quantity_reserved` — recorded with `movement_type` and a zero on-hand effect).

Indexes: `INDEX(organization_id, product_variant_id, location_id, occurred_at DESC)` (`04_DATA_MODEL.md` §12 "movement product/location/date"); `INDEX(serialized_inventory_unit_id, occurred_at)` for the unit timeline (`13_` §10 "movement timeline"); `INDEX(source_type, source_id)` for drill-down (`13_` §17).

No `updated_at`. The table is append-only and the trigger in §7.3 rejects `UPDATE`/`DELETE`.

### 2.4 Customers and demand — Slices 2/9

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `customers` | `data.js` `customers[]`. Walk-in is **not** a row — see D-5. | `id`, `organization_id`, `customer_number`, `full_name`, `phone_e164`, `phone_raw`, `email`, `credit_limit_minor`, `notes`, `is_active`, `version` | partial `UNIQUE(organization_id, phone_e164) WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL` (§5.4); `UNIQUE(organization_id, customer_number)`; trigram index on `full_name` | 2 |
| `customer_addresses` | Optional address (`13_` §15). | `id`, `customer_id`, `label`, `line1`, `line2`, `city`, `is_default` | FK customer CASCADE; partial `UNIQUE(customer_id) WHERE is_default` | 9 |
| `customer_consents` | Contact consent — `05_RULES.md` §6 "Contact follow-up requires consent". Prototype `customers[].consent: "Yes"/"Pending"`. | `id`, `customer_id`, `consent_type`, `granted`, `granted_at`, `revoked_at`, `source`, `evidence_document_id` | `INDEX(customer_id, consent_type)`; FK customer CASCADE | 9 |
| `customer_identity_documents` | Restricted CNIC/reference. Isolated table — D-4. | `id`, `customer_id`, `document_type`, `document_id`, `masked_value`, `retention_expires_at` | FK customer RESTRICT; row-level restricted to `customers.view_sensitive` | 14 |
| `customer_demand_requests` | `data.js` `demand[]`. The interaction. | `id`, `organization_id`, `branch_id`, `request_number`, `customer_id` (nullable = anonymous), `contact_phone_e164`, `raw_request_text`, `channel` (enum), `urgency` (enum), `status` (enum), `outcome` (enum), `lost_reason`, `available_at_request`, `quoted_price_minor`, `dedupe_group_id`, `follow_up_date`, `converted_sale_id`, `salesperson_user_id`, `version` | `UNIQUE(organization_id, request_number)`; `INDEX(organization_id, status, follow_up_date)`; `INDEX(dedupe_group_id)`; `INDEX(organization_id, created_at DESC)`; `CHECK (raw_request_text <> '')` | 9 |
| `demand_request_items` | Requested product detail (`04_DATA_MODEL.md` §8). | `id`, `demand_request_id`, `matched_product_variant_id` (**nullable**), `matched_product_model_id`, `desired_brand`, `desired_model`, `ram`, `storage`, `color`, `condition_preference`, `pta_preference`, `budget_min_minor`, `budget_max_minor`, `quantity` | FK demand **CASCADE**; FK variant **SET NULL**; `INDEX(matched_product_variant_id)`; `CHECK (budget_max_minor IS NULL OR budget_min_minor IS NULL OR budget_max_minor >= budget_min_minor)` | 9 |
| `quotations` | `demand[].outcome = "Quotation sent"`; `13_` §15 conversion target. Not in §19 — see D-7. | `id`, `organization_id`, `branch_id`, `quotation_number`, `customer_id`, `demand_request_id`, `status`, `valid_until`, `subtotal_minor`, `discount_minor`, `total_minor`, `version` | `UNIQUE(organization_id, quotation_number)` | 9 |
| `quotation_lines` | | `id`, `quotation_id`, `product_variant_id`, `quantity`, `unit_price_minor`, `discount_minor` | FK quotation CASCADE | 9 |

`raw_request_text` is `NOT NULL` and never overwritten by a later catalog match: `04_DATA_MODEL.md` §8 — "A later catalog match should not erase the original wording." `matched_product_variant_id` is nullable and `ON DELETE SET NULL` because `05_RULES.md` §1.12 requires demand to be recordable with no catalog match at all (`data.js` DM-5009: `variantId: null`, "Unavailable — not in catalog").

### 2.5 Suppliers and purchasing — Slice 4

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `suppliers` | `data.js` `suppliers[]`. | `id`, `organization_id`, `code`, `name`, `payment_terms_days`, `lead_time_days`, `on_time_rate_percent`, `rating`, `is_active`, `version` | `UNIQUE(organization_id, code)`; `CHECK (lead_time_days >= 0)` | 4 |
| `supplier_contacts` | `suppliers[].contact = "Rana Waqas · 0321-4455667"`. | `id`, `supplier_id`, `name`, `phone_e164`, `email`, `is_primary` | FK supplier CASCADE; partial `UNIQUE(supplier_id) WHERE is_primary` | 4 |
| `supplier_products` | Which supplier sells which variant, at what cost. | `id`, `organization_id`, `supplier_id`, `product_variant_id`, `supplier_sku`, `last_cost_minor`, `min_order_quantity`, `case_pack_size`, `lead_time_days`, `is_preferred` | `UNIQUE(supplier_id, product_variant_id)`; partial `UNIQUE(product_variant_id) WHERE is_preferred` | 4 |
| `supplier_price_history` | `05_RULES.md` §5 "Supplier price history is preserved". Append-only. | `id`, `supplier_product_id`, `cost_minor`, `effective_from`, `source_type`, `source_id` | `INDEX(supplier_product_id, effective_from DESC)` | 4 |
| `supplier_quotes` | Quoted cost before a PO (`13_` §11). | `id`, `organization_id`, `supplier_id`, `quote_number`, `product_variant_id`, `quoted_cost_minor`, `quantity`, `valid_until`, `status` | `UNIQUE(organization_id, quote_number)` | 4 |
| `purchase_orders` | `data.js` `purchaseOrders[]`. **A PO never creates stock** (`13_` §23.5). | `id`, `organization_id`, `branch_id`, `po_number`, `supplier_id`, `status` (enum `PURCHASE_ORDER_STATUSES`), `order_date`, `expected_date`, `subtotal_minor`, `discount_minor`, `tax_minor`, `total_minor`, `note`, `created_by_user_id`, `approved_by_user_id`, `approved_at`, `recommendation_id`, `version` | `UNIQUE(organization_id, po_number)`; `INDEX(organization_id, status, order_date DESC)`; `CHECK (status <> 'approved' OR approved_by_user_id IS NOT NULL)` | 4 |
| `purchase_order_lines` | | `id`, `purchase_order_id`, `product_variant_id`, `quantity_ordered`, `quantity_received`, `unit_cost_minor`, `discount_minor`, `line_total_minor` | FK PO CASCADE (draft-owned); `CHECK (quantity_ordered > 0)`; `CHECK (unit_cost_minor >= 0)` (`05_RULES.md` §5); `CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered * tolerance)` — tolerance resolved at service level, see §10 | 4 |
| `goods_receipts` | Actual arrival. **This** creates stock (`13_` §23.6). Prototype PO-2043 `status: "partially_received"`, `received: 2` of 12. | `id`, `organization_id`, `branch_id`, `location_id`, `receipt_number`, `purchase_order_id`, `supplier_id`, `supplier_invoice_reference`, `received_at`, `business_date`, `freight_cost_minor`, `other_cost_minor`, `landed_cost_method`, `received_by_user_id`, `posted_at` | `UNIQUE(organization_id, receipt_number)`; `INDEX(purchase_order_id)` | 4 |
| `goods_receipt_lines` | | `id`, `goods_receipt_id`, `purchase_order_line_id`, `product_variant_id`, `quantity_received`, `unit_cost_minor`, `allocated_landed_cost_minor`, `stock_batch_id` | FK receipt RESTRICT (posted); `CHECK (quantity_received > 0)` | 4 |
| `purchase_returns` | Reversing stock + payable (`05_RULES.md` §5). | `id`, `organization_id`, `branch_id`, `return_number`, `supplier_id`, `goods_receipt_id`, `reason`, `status`, `total_minor`, `posted_at` | `UNIQUE(organization_id, return_number)` | 4 |
| `purchase_return_lines` | | `id`, `purchase_return_id`, `product_variant_id`, `serialized_inventory_unit_id`, `quantity`, `unit_cost_minor` | FK return RESTRICT | 4 |
| `payables` | `suppliers[].payable`; attention card #6 "TechSource Rs 452,000". | `id`, `organization_id`, `branch_id`, `supplier_id`, `goods_receipt_id`, `supplier_invoice_reference`, `amount_minor`, `paid_minor`, `balance_minor`, `due_date`, `status` | `INDEX(organization_id, status, due_date)`; `CHECK (paid_minor >= 0 AND paid_minor <= amount_minor)`; `CHECK (balance_minor = amount_minor - paid_minor)` | 4 |
| `supplier_payments` | | `id`, `organization_id`, `branch_id`, `payment_number`, `supplier_id`, `amount_minor`, `payment_method` (enum), `financial_account_id`, `paid_at`, `business_date`, `reference`, `cash_session_id`, `created_by_user_id` | `UNIQUE(organization_id, payment_number)`; `CHECK (amount_minor > 0)` | 4 |
| `supplier_payment_allocations` | Payment → payable, many-to-many. | `id`, `supplier_payment_id`, `payable_id`, `amount_minor` | `UNIQUE(supplier_payment_id, payable_id)`; `CHECK (amount_minor > 0)` | 4 |

### 2.6 Sales, payments, returns — Slices 5/6

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `sales` | `data.js` `sales[]`. Immutable once `status='posted'`. | `id`, `organization_id`, `branch_id`, `location_id`, `invoice_number`, `customer_id` (**nullable = walk-in**), `customer_name_snapshot`, `salesperson_user_id`, `cashier_user_id`, `cash_session_id`, `status` (enum `SALE_STATUSES`), `subtotal_minor`, `discount_minor`, `tax_minor`, `total_minor`, `cogs_minor`, `gross_profit_minor`, `discount_reason`, `discount_approved_by_user_id`, `return_window_days`, `posted_at`, `business_date`, `idempotency_key`, `version` | partial `UNIQUE(organization_id, invoice_number) WHERE invoice_number IS NOT NULL`; `INDEX(organization_id, business_date, posted_at DESC)`; `INDEX(customer_id, posted_at DESC)`; see §2.6.1 for checks | 5 |
| `sale_lines` | Immutable snapshot (§1.4). | `id`, `sale_id`, `line_number`, `product_variant_id`, `serialized_inventory_unit_id`, `product_name_snapshot`, `sku_snapshot`, `imei_snapshot`, `quantity`, `unit_price_minor`, `discount_minor`, `tax_minor`, `line_total_minor`, `cogs_minor`, `gross_profit_minor`, `warranty_type_snapshot`, `warranty_months_snapshot`, `is_manual_line`, `unit_sale_active` | `UNIQUE(sale_id, line_number)`; **partial `UNIQUE(serialized_inventory_unit_id) WHERE unit_sale_active`** (§5.1, §7.1); FK variant RESTRICT; `CHECK (quantity > 0)`; `CHECK (serialized_inventory_unit_id IS NULL OR quantity = 1)` (`05_RULES.md` §4) | 5 |
| `payments` | Split payment supported: one sale → many payments. | `id`, `organization_id`, `branch_id`, `payment_number`, `customer_id`, `payment_method` (enum `PAYMENT_METHODS`), `amount_minor`, `financial_account_id`, `reference`, `received_at`, `business_date`, `cash_session_id`, `received_by_user_id`, `idempotency_key` | `UNIQUE(organization_id, payment_number)`; `CHECK (amount_minor > 0)`; `INDEX(cash_session_id)` | 5 |
| `payment_allocations` | Payment → sale/receivable. Must reconcile exactly (`13_` §23.14). | `id`, `payment_id`, `sale_id`, `receivable_id`, `amount_minor` | `UNIQUE(payment_id, sale_id)`; `CHECK (amount_minor > 0)`; `CHECK ((sale_id IS NOT NULL) <> (receivable_id IS NOT NULL))` | 5 |
| `returns` | `data.js` `returns[]`. | `id`, `organization_id`, `branch_id`, `return_number`, `sale_id`, `customer_id`, `status` (enum `RETURN_STATUSES`), `reason`, `total_refund_minor`, `restocking_fee_minor`, `exchange_sale_id`, `approved_by_user_id`, `posted_at`, `business_date` | `UNIQUE(organization_id, return_number)`; FK sale RESTRICT — `05_RULES.md` §1.19 requires a return to reference its sale; `INDEX(sale_id)` | 6 |
| `return_lines` | | `id`, `return_id`, `sale_line_id`, `product_variant_id`, `serialized_inventory_unit_id`, `quantity`, `refund_amount_minor`, `cogs_reversal_minor`, `outcome` (enum `RETURN_OUTCOMES`), `condition_note` | `CHECK (quantity > 0)`; FK sale_line RESTRICT | 6 |
| `refunds` | Money actually going back. | `id`, `organization_id`, `branch_id`, `refund_number`, `return_id`, `amount_minor`, `refund_method` (enum), `financial_account_id`, `cash_session_id`, `refunded_at`, `business_date`, `processed_by_user_id` | `UNIQUE(organization_id, refund_number)`; `CHECK (amount_minor > 0)` | 6 |
| `receivables` | `customers[].credit` (C-203: 45000, C-205: 100000). | `id`, `organization_id`, `branch_id`, `customer_id`, `sale_id`, `amount_minor`, `paid_minor`, `balance_minor`, `due_date`, `status`, `approved_by_user_id` | `INDEX(organization_id, status, due_date)`; `CHECK (paid_minor >= 0 AND paid_minor <= amount_minor)`; `CHECK (balance_minor = amount_minor - paid_minor)` | 10 |

#### 2.6.1 `sales` integrity checks

- `CHECK (status <> 'posted' OR (invoice_number IS NOT NULL AND posted_at IS NOT NULL))` — a posted sale always has both. A draft has neither, so the invoice sequence is not consumed by abandoned carts.
- `CHECK (total_minor = subtotal_minor - discount_minor + tax_minor)` — arithmetic identity held by the database, not trusted from the frontend (`13_` §22: "Never rely on frontend totals").
- `CHECK (gross_profit_minor = total_minor - cogs_minor)` — subject to the tax-inclusive question in §10.
- `CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor)`.
- `CHECK (customer_id IS NOT NULL OR customer_name_snapshot IS NOT NULL)` — walk-in still names the buyer as "Walk-in" (prototype `sales[].customer`).
- Payment + receivable = total (`05_RULES.md` §4, `13_` §23.14) is **not** a single-row check; it spans `payment_allocations` and `receivables`. It is enforced inside the posting transaction and covered by an integration test (`13_` §24 "payment mismatch rejection"). See §6.5.

### 2.7 External money services — Slice 7

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `external_service_providers` | Prototype `digital.js` `SERVICES`: JazzCash, Easypaisa, Bank Transfer, Utility Bill, Jazz Load, Zong Load, Other. | `id`, `organization_id`, `code`, `name`, `float_account_id`, `low_balance_threshold_minor`, `is_active` | `UNIQUE(organization_id, code)`; FK `float_account_id` → `financial_accounts` RESTRICT | 7 |
| `external_service_types` | Configurable service catalogue (`13_` §13 "configurable additional service types"). Each row pins a fixed `service_kind`. | `id`, `organization_id`, `code`, `name`, `service_kind` (enum `send`/`withdrawal`), `principal_affects_cash`, `fee_affects_cash`, `cash_direction` (enum `CASH_DIRECTIONS`), `is_active` | `UNIQUE(organization_id, code)` | 7 |
| `external_fee_rules` | `13_` §13 rule fields; shape mirrors `shared/src/fee-rules.ts` `FeeRule`. | `id`, `organization_id`, `branch_id` (**nullable = org default; non-null = branch override**), `provider_id`, `service_type_id`, `calculation_mode` (enum `FEE_CALCULATION_MODES`), `block_amount_minor`, `fee_per_block_minor`, `percentage_rate NUMERIC(6,3)`, `min_fee_minor`, `max_fee_minor`, `rounding` (enum), `effective_from`, `effective_to`, `is_active`, `version` | See §2.7.1 | 7 |
| `external_transactions` | The recorded transaction. **Principal is never revenue** (`13_` §23.15). | `id`, `organization_id`, `branch_id`, `transaction_number`, `provider_id`, `service_type_id`, `customer_id` (nullable), `counterparty_phone_e164`, `counterparty_account_reference`, `external_reference`, `principal_minor`, `customer_fee_minor`, `provider_charge_minor`, `other_expense_minor`, `service_profit_minor`, `cash_direction` (enum), `cash_amount_minor`, `payment_method` (enum), `status` (enum `EXTERNAL_TRANSACTION_STATUSES`), `fee_rule_id`, **fee snapshot columns**, `cash_session_id`, `cashier_user_id`, `occurred_at`, `business_date`, `proof_document_id`, `note`, `idempotency_key`, `version` | See §2.7.2 | 7 |
| `provider_float_movements` | Per-provider float change per transaction. Prototype tracks per-provider float balances with low thresholds. | `id`, `organization_id`, `provider_id`, `external_transaction_id`, `direction`, `amount_minor`, `occurred_at` | `UNIQUE(external_transaction_id, provider_id)`; `INDEX(provider_id, occurred_at DESC)` | 7 |

#### 2.7.1 `external_fee_rules` constraints

Mode-dependent checks, mirroring the validation `calculateFee()` already performs in `shared/src/fee-rules.ts`:

- `CHECK (calculation_mode <> 'percentage' OR (percentage_rate IS NOT NULL AND percentage_rate >= 0))`
- `CHECK (calculation_mode NOT IN ('per_started_block','proportional_block') OR (block_amount_minor > 0 AND fee_per_block_minor >= 0))`
- `CHECK (calculation_mode <> 'fixed' OR fee_per_block_minor >= 0)`
- `CHECK (min_fee_minor IS NULL OR max_fee_minor IS NULL OR min_fee_minor <= max_fee_minor)`
- `CHECK (effective_to IS NULL OR effective_to > effective_from)`

Overlap prevention: no two active rules may cover the same provider+type+branch at the same instant. Enforced with a PostgreSQL **exclusion constraint** using `btree_gist` over `(organization_id, provider_id, service_type_id, branch_id)` `WITH =` and a `tstzrange(effective_from, effective_to)` `WITH &&`, `WHERE is_active`. This is a genuine database guarantee rather than a service-level scan, and it makes rule resolution deterministic (exactly one rule matches). It is the one place a raw-SQL block inside the Prisma migration is required — Prisma does not model exclusion constraints.

Seeded defaults (`13_` §13, matching `DEFAULT_SEND_FEE_PER_BLOCK_MINOR = 1_000` and `DEFAULT_WITHDRAWAL_FEE_PER_BLOCK_MINOR = 2_000`): send = `per_started_block`, block 100000 minor (PKR 1,000), fee 1000 minor (PKR 10), min 1000 minor; withdrawal = same block, fee 2000 minor (PKR 20), min 2000 minor. These are **seed rows, not code** (`13_` §13: "Do not permanently hardcode these rules").

#### 2.7.2 `external_transactions` constraints and fee snapshot

Snapshot columns copied from the rule at posting: `fee_mode_snapshot`, `fee_block_amount_minor_snapshot`, `fee_per_block_minor_snapshot`, `fee_percentage_rate_snapshot`, `fee_min_minor_snapshot`, `fee_max_minor_snapshot`, `fee_blocks_charged_snapshot`, `fee_explanation_snapshot`. The last two come straight from `FeeCalculationResult.blocksCharged` / `.explanation`, so the receipt and the audit trail can show *why* a fee was what it was after the rule changes.

- `CHECK (principal_minor >= 0)` — matches `calculateFee()` rejecting negative principal.
- `CHECK (customer_fee_minor >= 0)`, `CHECK (provider_charge_minor >= 0)`, `CHECK (other_expense_minor >= 0)`.
- `CHECK (service_profit_minor = customer_fee_minor - provider_charge_minor - other_expense_minor)` — the `13_` §13 formula, held by the database. Deliberately **not** `>= 0`: `calculateServiceProfit()` documents that a negative result "is a real (and reportable) loss, not an error".
- `CHECK (status <> 'successful' OR transaction_number IS NOT NULL)`.
- Uniques: `UNIQUE(organization_id, transaction_number)`; partial `UNIQUE(organization_id, provider_id, external_reference) WHERE external_reference IS NOT NULL AND status <> 'draft'` (§5.6).
- Indexes: `INDEX(organization_id, business_date, occurred_at DESC)`; `INDEX(cash_session_id)`; `INDEX(provider_id, status, occurred_at DESC)`.

### 2.8 Cash sessions and expenses — Slice 8

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `cash_sessions` | `data.js` `SHOP.cashSession`, audit "CS-0714", opening float 20000. | `id`, `organization_id`, `branch_id`, `session_number`, `cashier_user_id`, `status` (enum `CASH_SESSION_STATUSES`), `opening_cash_minor`, `opened_at`, `opened_by_user_id`, `closed_at`, `business_date`, `version` | `UNIQUE(organization_id, session_number)`; **partial `UNIQUE(branch_id, cashier_user_id) WHERE status IN ('open','closing_pending')`** — one open drawer per cashier per branch; `INDEX(organization_id, business_date)` | 8 |
| `cash_reconciliations` | One row **per close attempt**. Append-only. Kept separate — D-3. | `id`, `cash_session_id`, `attempt_number`, `expected_cash_minor`, `counted_cash_minor`, `variance_minor`, `variance_reason`, `cash_sales_minor`, `cash_refunds_minor`, `service_cash_in_minor`, `service_cash_out_minor`, `fees_collected_minor`, `service_profit_minor`, `expenses_from_drawer_minor`, `deposits_minor`, `removals_minor`, `submitted_by_user_id`, `submitted_at`, `reviewed_by_user_id`, `reviewed_at`, `review_outcome` | `UNIQUE(cash_session_id, attempt_number)`; **`CHECK (variance_minor = counted_cash_minor - expected_cash_minor)`**; **`CHECK (variance_minor = 0 OR variance_reason IS NOT NULL)`** ← `05_RULES.md` §1.17 / `13_` §23.16 in the schema; FK session RESTRICT | 8 |
| `cash_movements` | Drawer in/out that is not a sale: deposits, removals, drawer expenses. | `id`, `organization_id`, `branch_id`, `cash_session_id`, `movement_type`, `direction` (enum), `amount_minor`, `financial_account_id`, `reason`, `source_type`, `source_id`, `occurred_at`, `business_date`, `created_by_user_id`, `approved_by_user_id` | `INDEX(cash_session_id, occurred_at)`; `CHECK (amount_minor > 0)` | 8 |
| `owner_equity_movements` | Capital in / withdrawal out. Kept separate from `cash_movements` — D-8. | `id`, `organization_id`, `branch_id`, `movement_number`, `equity_type` (`capital_injection`/`withdrawal`), `amount_minor`, `financial_account_id`, `occurred_at`, `business_date`, `note`, `created_by_user_id` | `UNIQUE(organization_id, movement_number)`; `CHECK (amount_minor > 0)` | 10 |
| `expense_categories` | `finance.expenses[].category`: Shop rent, Electricity, Staff tea / misc, Packaging / bags, Internet / DSL. | `id`, `organization_id`, `code`, `name`, `parent_category_id`, `requires_evidence`, `requires_approval`, `is_active` | `UNIQUE(organization_id, code)` | 8 |
| `expenses` | `finance.expenses[]`. | `id`, `organization_id`, `branch_id`, `expense_number`, `expense_category_id`, `amount_minor`, `payment_source` (enum), `financial_account_id`, `cash_session_id`, `incurred_at`, `business_date`, `note`, `evidence_document_id`, `created_by_user_id`, `approved_by_user_id`, `approved_at`, `version` | `UNIQUE(organization_id, expense_number)`; `INDEX(organization_id, business_date)`; `CHECK (amount_minor > 0)`; `CHECK (approved_at IS NULL) = (approved_by_user_id IS NULL)` | 8 |

`cash_sessions` deliberately carries **no** `counted_cash_minor` / `variance_minor` columns. Because `CASH_SESSION_STATUSES` includes `reopened_with_authorization`, a session can legitimately be closed, reopened and closed again — a single set of columns on the session would silently overwrite the first count, which is precisely the manipulation `13_` §14 forbids ("Never manipulate sales records to hide a cash mismatch"). Each attempt is its own immutable `cash_reconciliations` row. This is D-3.

### 2.9 Financial ledger — Slice 10

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `financial_accounts` | Chart of accounts **and** the balance-bearing accounts in `EXTERNAL_BALANCE_ACCOUNTS`: `physical_cash`, `jazzcash_float`, `easypaisa_float`, `bank_balance`, `utility_bill_float`, `jazz_load_float`, `zong_load_float`. | `id`, `organization_id`, `branch_id`, `code`, `name`, `account_type` (`asset`/`liability`/`equity`/`revenue`/`expense`), `account_subtype` (`cash`/`bank`/`provider_float`/…), `normal_balance` (enum `LEDGER_DIRECTIONS`), `low_balance_threshold_minor`, `is_active` | `UNIQUE(organization_id, code)`; `INDEX(organization_id, account_subtype)` | 10 |
| `financial_entries` | Immutable ledger legs. Detailed in §2.9.1. | See §2.9.1 | See §2.9.1 and §5.5 | 10 |

#### 2.9.1 `financial_entries`

`13_` §16 requires every entry to link to source type, source ID, account, amount, direction, branch, date, actor, description and an idempotency/source key.

| Column | Type | Note |
|---|---|---|
| `id` | `UUID PK` | UUIDv7 |
| `organization_id`, `branch_id` | `UUID NOT NULL` | |
| `entry_group_id` | `UUID NOT NULL` | Groups the legs of one balanced posting |
| `source_type` | `ledger_source_type` enum NOT NULL | The 15 values in `LEDGER_SOURCE_TYPES` |
| `source_id` | `UUID` | Nullable only for `opening_balance` (§10) |
| `source_key` | `TEXT NOT NULL` | Deterministic natural key — §5.5 |
| `financial_account_id` | `UUID NOT NULL` | FK RESTRICT |
| `direction` | `ledger_direction` enum NOT NULL | `debit` / `credit` |
| `amount_minor` | `BIGINT NOT NULL` | `CHECK (amount_minor > 0)` — sign lives in `direction`, never in the amount |
| `description` | `TEXT NOT NULL` | |
| `occurred_at` | `TIMESTAMPTZ NOT NULL` | |
| `business_date` | `DATE NOT NULL` | |
| `actor_user_id` | `UUID NOT NULL` | |
| `created_at` | `TIMESTAMPTZ` | No `updated_at` — append-only |

- **`UNIQUE(organization_id, source_key)`** — the duplicate-posting guard (`13_` §16 "Prevent duplicate posting"). §5.5.
- `INDEX(organization_id, financial_account_id, business_date)` — account balances.
- `INDEX(source_type, source_id)` — drill-down (`13_` §17 "Every dashboard metric must drill down to source records").
- `INDEX(entry_group_id)`.
- Balance per group (Σ debits = Σ credits) is a deferred constraint candidate but is **not** expressible as a row `CHECK`; it is asserted in the posting service and by an integration test, and by a nightly reconciliation job. Recorded as an honest gap in §6.5.

Account balances (`KPI.cashPosition`, `KPI.bankPosition`) are **derived** from this table, not stored as a mutable counter — the same principle as §1.3.

### 2.10 Intelligence — Slice 11

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `daily_product_metrics` | Pre-aggregated per variant per day. Feeds `09_ANALYTICS` §2 metrics and `data.js` `stock[]` (`sold30`, `unmet`, `coverDays`, `ageDays`, `returns`). | `id`, `organization_id`, `branch_id`, `product_variant_id`, `metric_date`, `units_sold`, `net_revenue_minor`, `cogs_minor`, `gross_profit_minor`, `discount_minor`, `units_received`, `units_returned`, `opening_units`, `closing_units`, `reserved_units`, `inbound_units`, `was_stocked_out`, `qualified_unmet_units NUMERIC(10,3)`, `computed_at` | **`UNIQUE(organization_id, branch_id, product_variant_id, metric_date)`** — makes the nightly job idempotent by upsert (`05_RULES.md` §9 "Background jobs must be idempotent"); `INDEX(organization_id, metric_date)` | 11 |
| `recommendation_runs` | `04_DATA_MODEL.md` §9. | `id`, `organization_id`, `branch_id`, `scope`, `period_start`, `period_end`, `algorithm_version`, `configuration_snapshot JSONB`, `budget_minor`, `liquidity_buffer_minor`, `generated_by_user_id`, `generated_at`, `status` | `INDEX(organization_id, generated_at DESC)`; `algorithm_version` seeded from `RECOMMENDATION_ALGORITHM_VERSION` (`'v1.0.0'`) | 11 |
| `purchase_recommendations` | `data.js` `recommendations[]`. | `id`, `recommendation_run_id`, `product_variant_id`, `product_model_id`, `available_units`, `reserved_units`, `inbound_units`, `units_sold_7`, `units_sold_30`, `units_sold_90`, `qualified_unmet_units NUMERIC(10,3)`, `stockout_days`, `lead_time_days`, `forecast_daily_demand NUMERIC(10,4)`, `safety_stock NUMERIC(10,3)`, `target_stock NUMERIC(10,3)`, `suggested_quantity`, `estimated_cost_minor`, `expected_selling_price_minor`, `expected_gross_profit_minor`, `expected_days_to_sell`, `score NUMERIC(5,2)`, `confidence_percent NUMERIC(5,2)`, `confidence_label` (enum), `suggested_supplier_id`, `reasons JSONB`, `risks JSONB`, `feature_values JSONB` | `UNIQUE(recommendation_run_id, product_variant_id)`; `INDEX(recommendation_run_id, score DESC)`; `CHECK (suggested_quantity >= 0)`; `CHECK (score BETWEEN 0 AND 100)`; `CHECK (confidence_percent BETWEEN 0 AND 100)` | 11 |
| `recommendation_decisions` | Owner action. `13_` §23.19: no auto-approve. | `id`, `purchase_recommendation_id`, `decision` (enum `RECOMMENDATION_DECISIONS`), `final_quantity`, `reason`, `decided_by_user_id`, `decided_at`, `purchase_order_id` | `UNIQUE(purchase_recommendation_id)`; FK PO RESTRICT; `CHECK (final_quantity >= 0)` | 11 |
| `recommendation_evaluations` | `09_ANALYTICS` §9 post-hoc tracking. | `id`, `purchase_recommendation_id`, `actual_purchase_quantity`, `received_date`, `sell_through_7`, `sell_through_30`, `sell_through_60`, `realized_gross_profit_minor`, `days_to_sell`, `stockout_avoided`, `aged_stock_created`, `forecast_error NUMERIC(8,4)`, `evaluated_at` | `UNIQUE(purchase_recommendation_id, evaluated_at)` | 11 |

`reasons`/`risks` are `JSONB` arrays of `{code, message, values}` rather than free text, so `09_ANALYTICS` §7 reasons stay structured and translatable (the §10 LLM layer may only render them; it may not alter numbers).

### 2.11 System — Slices 0/1/12

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `number_sequences` | Gapless document numbers. Keys from `SEQUENCE_KEYS`. §5.5. | `id`, `organization_id`, `branch_id`, `sequence_key`, `period_key`, `prefix`, `next_value`, `padding` | **`UNIQUE(organization_id, branch_id, sequence_key, period_key)`**; `CHECK (next_value >= 1)` | 1 |
| `application_settings` | Runtime config (`05_RULES.md` §9: "configuration is named and versioned"). | `id`, `organization_id`, `branch_id`, `key`, `value JSONB`, `value_type`, `description`, `updated_by_user_id`, `version` | `UNIQUE(organization_id, branch_id, key)` (branch NULL = org default) | 1 |
| `audit_events` | `04_DATA_MODEL.md` §10. Append-only, long retention. | `id`, `occurred_at`, `actor_user_id`, `organization_id`, `branch_id`, `action`, `entity_type`, `entity_id`, `before_snapshot JSONB`, `after_snapshot JSONB`, `before_hash`, `after_hash`, `reason`, `request_id`, `ip`, `user_agent`, `sensitivity` | `INDEX(organization_id, entity_type, entity_id, occurred_at DESC)`; `INDEX(organization_id, occurred_at DESC)`; `INDEX(actor_user_id, occurred_at DESC)`; `INDEX(request_id)`; FK actor **RESTRICT** — a user with audit history can never be deleted | 1 |
| `outbox_events` | Transactional outbox for notifications/integrations. `13_` §19 says "where justified"; justified once notification adapters exist (Slice 14) — created earlier only if a real consumer exists. | `id`, `organization_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload JSONB`, `occurred_at`, `published_at`, `attempts`, `last_error` | `INDEX(published_at) WHERE published_at IS NULL`; UUIDv7 PK for ordered draining | 12 |
| `notifications` | `data.js` `notifications[]`. | `id`, `organization_id`, `branch_id`, `user_id` (nullable = broadcast), `severity`, `title`, `body`, `link_route`, `source_type`, `source_id`, `read_at`, `created_at` | `INDEX(user_id, read_at, created_at DESC)` | 12 |
| `tasks` | `data.js` `tasks[]` — types Reorder, Follow-up, Used intake, Reservation, Payable, Purchase. Absorbs `FollowUp` — D-9. | `id`, `organization_id`, `branch_id`, `task_type`, `title`, `description`, `priority`, `status`, `due_date`, `assigned_to_user_id`, `customer_id`, `source_type`, `source_id`, `link_route`, `completed_at`, `completed_by_user_id`, `version` | `INDEX(organization_id, status, due_date)` (`04_DATA_MODEL.md` §12 "task status/due date"); `INDEX(assigned_to_user_id, status)` | 12 |
| `documents` | Storage-adapter metadata. Absorbs `InventoryPhoto` — D-10. | `id`, `organization_id`, `branch_id`, `document_type`, `entity_type`, `entity_id`, `storage_key`, `file_name`, `mime_type`, `byte_size`, `checksum_sha256`, `sensitivity`, `retention_expires_at`, `uploaded_by_user_id`, `uploaded_at` | `UNIQUE(storage_key)`; `INDEX(entity_type, entity_id)`; `INDEX(retention_expires_at) WHERE retention_expires_at IS NOT NULL` | 4 |
| `integration_attempts` | `05_RULES.md` §1.20: "Every external integration response must be stored with status and trace reference." | `id`, `organization_id`, `adapter`, `operation`, `request_summary JSONB`, `response_status`, `response_summary JSONB`, `trace_reference`, `attempt_number`, `succeeded`, `error_code`, `started_at`, `finished_at`, `duration_ms` | `INDEX(adapter, started_at DESC)`; `INDEX(trace_reference)`. Summaries are **redacted** — never full documents or secrets (`04_DATA_MODEL.md` §10) | 3 |
| `idempotency_records` | Request-level idempotency (`13_` §12, §20). Addition — D-6. | `id`, `organization_id`, `idempotency_key`, `endpoint`, `request_hash`, `status`, `response_status_code`, `response_body JSONB`, `resource_type`, `resource_id`, `created_at`, `expires_at` | **`UNIQUE(organization_id, endpoint, idempotency_key)`**; `INDEX(expires_at)`. §5.7 | 5 |

### 2.12 Used devices, warranty, repairs — Slice 14

Behind feature flags per `13_` §7 ("may be implemented after the core operational system"). Prototype has screens for all three (`data.js` `usedIntakes[]`, `returns[]` WAR-044, `repairs[]`), so the shapes are known, but no table is created before the core is stable.

| Table | Purpose | Key columns | Uniques / indexes / FK | Slice |
|---|---|---|---|---|
| `used_device_intakes` | `usedIntakes[]` UDI-311/UDI-310. | `id`, `organization_id`, `branch_id`, `intake_number`, `seller_customer_id`, `product_variant_id`, `serialized_inventory_unit_id`, `quoted_price_minor`, `approved_price_minor`, `expected_resale_minor`, `battery_health_percent`, `grade`, `status`, `gates_passed JSONB`, `created_by_user_id` | `UNIQUE(organization_id, intake_number)`; `CHECK (status <> 'cleared' OR all gates passed)` — expressed as a generated boolean column + check | 14 |
| `seller_declarations` | Sensitive identity record. Isolated — D-4. | `id`, `used_device_intake_id`, `declared_name`, `cnic_document_id`, `cnic_masked`, `declaration_text`, `signed_at`, `retention_expires_at` | `UNIQUE(used_device_intake_id)`; restricted to `customers.view_sensitive` | 14 |
| `warranty_claims` | `returns[]` WAR-044. | `id`, `organization_id`, `branch_id`, `claim_number`, `sale_id`, `serialized_inventory_unit_id`, `claim_type` (`customer`/`supplier`), `reason`, `status`, `opened_at`, `resolved_at`, `outcome` | `UNIQUE(organization_id, claim_number)` | 14 |
| `repair_jobs` | `repairs[]` REP-016..018. | `id`, `organization_id`, `branch_id`, `job_number`, `customer_id`, `serialized_inventory_unit_id`, `device_description`, `issue`, `technician_user_id`, `stage`, `promised_date`, `quoted_cost_minor`, `final_cost_minor`, `warranty_claim_id`, `version` | `UNIQUE(organization_id, job_number)`; `INDEX(technician_user_id, stage)` | 14 |
| `repair_parts` | `repairs[].parts`. | `id`, `repair_job_id`, `product_variant_id`, `serialized_inventory_unit_id`, `quantity`, `unit_cost_minor`, `issued_at` | FK job CASCADE | 14 |
| `repair_status_history` | Append-only stage log. | `id`, `repair_job_id`, `from_stage`, `to_stage`, `changed_by_user_id`, `changed_at`, `note` | `INDEX(repair_job_id, changed_at)` | 14 |

### 2.13 §19 coverage check

| `13_` §19 entity | Table(s) | §19 entity | Table(s) |
|---|---|---|---|
| organizations | `organizations` | external_service_providers | `external_service_providers` |
| branches | `branches` | external_service_types | `external_service_types` |
| stock_locations | `stock_locations` | external_fee_rules | `external_fee_rules` |
| users | `users` | external_transactions | `external_transactions` |
| roles | `roles` | cash_sessions | `cash_sessions` |
| permissions | `permissions` | cash_movements/session entries | `cash_movements` |
| user_roles | `user_roles` | cash_reconciliations | `cash_reconciliations` |
| role_permissions | `role_permissions` | expense_categories | `expense_categories` |
| user_scope_access | `user_scope_access` | expenses | `expenses` |
| categories | `categories` | receivables | `receivables` |
| brands | `brands` | payables | `payables` |
| product_models | `product_models` | customer_demand_requests | `customer_demand_requests` |
| product_variants | `product_variants` | demand_items/follow-ups | `demand_request_items` + `tasks` (D-9) |
| product_aliases | `product_aliases` | financial_accounts | `financial_accounts` |
| product_barcodes | `product_barcodes` | financial_entries | `financial_entries` |
| customers | `customers` | daily_product_metrics | `daily_product_metrics` |
| suppliers | `suppliers` | recommendation_runs | `recommendation_runs` |
| supplier_products | `supplier_products` | purchase_recommendations | `purchase_recommendations` |
| supplier_quotes | `supplier_quotes` | recommendation_decisions | `recommendation_decisions` |
| purchase_orders | `purchase_orders` | notifications | `notifications` |
| purchase_order_lines | `purchase_order_lines` | tasks | `tasks` |
| goods_receipts | `goods_receipts` | documents/attachments | `documents` |
| goods_receipt_lines | `goods_receipt_lines` | number_sequences | `number_sequences` |
| serialized_inventory_units | `serialized_inventory_units` + `device_identifiers` (D-1) | application_settings | `application_settings` |
| stock_batches | `stock_batches` | audit_events | `audit_events` |
| inventory_movements | `inventory_movements` | outbox_events (where justified) | `outbox_events` (Slice 12+) |
| stock_balances/read models | `stock_balances` | sales | `sales` |
| reservations | `reservations` | sale_lines | `sale_lines` |
| stock_counts | `stock_counts` + `stock_count_lines` | payments | `payments` |
| stock_adjustments | `stock_adjustments` | payment_allocations | `payment_allocations` |
| returns | `returns` | return_lines | `return_lines` |
| refunds | `refunds` | | |

All 63 §19 entities are mapped. Tables added beyond §19: `user_sessions`, `price_lists`, `price_entries`, `compatibility_rules`, `device_identifiers`, `device_checks`, `stock_count_lines`, `customer_addresses`, `customer_consents`, `customer_identity_documents`, `quotations`, `quotation_lines`, `supplier_contacts`, `supplier_price_history`, `purchase_returns`, `purchase_return_lines`, `supplier_payments`, `supplier_payment_allocations`, `provider_float_movements`, `owner_equity_movements`, `recommendation_evaluations`, `integration_attempts`, `idempotency_records`, plus the six Slice-14 tables. Each is required by `04_DATA_MODEL.md` §2 or by an explicit `13_` requirement, and is justified where non-obvious in §8.

---

## 3. Slice-by-slice creation order

| Slice | Migration | Tables created |
|---|---|---|
| 1 | `0001_identity_and_access` | organizations, branches, stock_locations, users, roles, permissions, role_permissions, user_roles, user_scope_access, user_sessions, number_sequences, application_settings, audit_events |
| 2 | `0002_catalog` | categories, brands, product_models, product_variants, product_aliases, product_barcodes, price_lists, price_entries, customers |
| 3 | `0003_inventory` | serialized_inventory_units, device_identifiers, stock_batches, inventory_movements, stock_balances, reservations, stock_counts, stock_count_lines, stock_adjustments, device_checks, integration_attempts |
| 4 | `0004_purchasing` | suppliers, supplier_contacts, supplier_products, supplier_price_history, supplier_quotes, purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, purchase_returns, purchase_return_lines, payables, supplier_payments, supplier_payment_allocations, documents |
| 5 | `0005_sales` | financial_accounts (see the forward-reference note below), sales, sale_lines, payments, payment_allocations, idempotency_records |
| 6 | `0006_returns` | returns, return_lines, refunds |
| 7 | `0007_external_services` | external_service_providers, external_service_types, external_fee_rules (+ exclusion constraint), external_transactions, provider_float_movements |
| 8 | `0008_cash_and_expenses` | cash_sessions, cash_reconciliations, cash_movements, expense_categories, expenses |
| 9 | `0009_demand` | customer_demand_requests, demand_request_items, customer_addresses, customer_consents, quotations, quotation_lines |
| 10 | `0010_finance` | financial_entries, receivables, owner_equity_movements (`financial_accounts` already created in `0005`) |
| 11 | `0011_intelligence` | daily_product_metrics, recommendation_runs, purchase_recommendations, recommendation_decisions, recommendation_evaluations |
| 12 | `0012_command_center` | notifications, tasks, outbox_events |
| 14 | `0014_advanced_modules` | used_device_intakes, seller_declarations, warranty_claims, repair_jobs, repair_parts, repair_status_history, compatibility_rules, customer_identity_documents |

Slice 0 creates **no tables** — it establishes the workspace, `database/` structure, Prisma wiring and the connection check. Slice 13 (launch hardening) adds no tables; it exercises `13_` §31's migrate-from-zero rehearsal.

Forward-reference note: `financial_accounts` is needed by `payments.financial_account_id` (Slice 5) and `external_service_providers.float_account_id` (Slice 7), but the ledger lands in Slice 10. Resolution: create `financial_accounts` in migration `0005` and only `financial_entries` in `0010`. The §19 grouping is by concern, not by creation order, and a FK cannot point at a table that does not exist yet.

---

## 4. Deferred and derived

- `stock_balances` and `daily_product_metrics` are **derived**. Both must be reproducible from `inventory_movements` / `sale_lines` alone. Rebuild scripts live in `database/scripts/` and a drift check runs in CI.
- Cached account balances are **not** stored. `KPI.cashPosition` etc. are aggregates over `financial_entries`. If profiling later shows a problem, a materialized balance is added with the same rebuildable-read-model discipline — not before.

---

## 5. Uniqueness and constraint strategy

### 5.1 Normalized IMEI1 / IMEI2 / serial per organization

`04_DATA_MODEL.md` §4 asks for three unique constraints on `InventoryUnit`: org+IMEI1, org+IMEI2 when present, org+serial when present. **Three partial unique indexes cannot express the actual rule.** They permit unit A's IMEI1 to equal unit B's IMEI2 — a real duplicate device that the schema would accept. `13_` §23.1 says "No duplicate normalized IMEI or required serial", unqualified by slot.

Design (deviation D-1): the authority is the child table `device_identifiers`.

```sql
CREATE UNIQUE INDEX ux_device_identifiers_org_value
  ON device_identifiers (organization_id, normalized_value);
CREATE UNIQUE INDEX ux_device_identifiers_unit_type
  ON device_identifiers (serialized_inventory_unit_id, identifier_type);
```

- `UNIQUE(organization_id, normalized_value)` makes **any** collision across any slot impossible, including IMEI1-vs-IMEI2 and IMEI-vs-serial.
- `UNIQUE(serialized_inventory_unit_id, identifier_type)` keeps exactly one IMEI1, one IMEI2 and one serial per unit.
- `normalized_value` is written by `shared/src/imei.ts` `normalizeImei()` / `normalizeSerial()` — never by hand. The raw operator input is kept in `raw_value` for audit.
- A `CHECK` restricts `identifier_type` to `imei1`/`imei2`/`serial`; `imei2` and `serial` rows are simply absent when the device has none (prototype INV-1090 has `imei2: ""`, which normalizes to `NULL` → no row).

This is where `13_` §23.1 and `05_RULES.md` §1.1 are enforced, and it is what makes `05_RULES.md` §5 "Duplicate IMEI blocks receiving" a rollback (`13_` §11: "Duplicate IMEI ... must safely roll back the affected receiving transaction") rather than a hopeful service check: the `INSERT` raises `23505` and the enclosing transaction aborts.

Bulk paste (`13_` §10, `LIMITS.MAX_BULK_IMEI_ROWS = 500`) validates in two stages — `parseBulkImeiInput()` catches within-paste duplicates and Luhn failures before any write, and the unique index catches collisions against stock already in the database. The second stage is the one that is safe under concurrency.

Trade-off accepted: unit list/search queries join to `device_identifiers` instead of reading three columns. The join is on an indexed FK. `PERFORMANCE_TARGETS.PRODUCT_SEARCH_MS` (500 ms) is asserted by test; if the join ever threatens it, a denormalized cache column can be added then — with measurement, not in advance.

### 5.2 SKU

`UNIQUE(organization_id, sku)` on `product_variants`, plus `CHECK (sku = upper(sku))` so `PH-APPLE-IP17PM-256-BLK-NEW-PTA` and its lowercase twin cannot coexist. Case-folding at the constraint level rather than trusting every write path. Prototype SKUs are already uppercase.

### 5.3 Barcodes

`UNIQUE(organization_id, barcode)` on `product_barcodes` — one barcode resolves to exactly one variant, which is what makes POS scanning unambiguous. A variant may have many barcodes (`04_DATA_MODEL.md` §3), and `13_` §9 requires products **without** barcodes to stay sellable — hence a child table with zero rows, never a nullable column with a unique index over sparse values.

### 5.4 Customer normalized phone

`customers.phone_e164` is written by `shared/src/phone.ts` `normalizePakistanPhone()` (prototype `"0301-4567890"` → `+923014567890`), with `phone_raw` kept for display.

```sql
CREATE UNIQUE INDEX ux_customers_org_phone
  ON customers (organization_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
```

Partial on three counts: walk-in and anonymous customers have no phone (`13_` §15, `05_RULES.md` §6 "Anonymous demand is allowed"), `NULL`s must not collide, and a soft-deleted record must not block reuse of the number. Whether two customers may legitimately share one phone (a family handset) is an open question — see §10.

### 5.5 Invoice numbers, sequences, and ledger idempotency

**Document numbers.** `05_RULES.md` §4: "Receipt numbers are unique and sequential according to configured policy." A PostgreSQL `SEQUENCE` is fast but **gap-prone** — it does not roll back — so it cannot satisfy "sequential" if the policy means gapless. Design: a `number_sequences` counter row per `(organization_id, branch_id, sequence_key, period_key)`, allocated inside the posting transaction with `SELECT ... FOR UPDATE`. Keys come from `SEQUENCE_KEYS` in `shared/src/constants.ts` (`sale_invoice`, `purchase_order`, `goods_receipt`, `return`, `external_transaction`, `expense`, `cash_session`, `stock_adjustment`). `period_key` is the year, matching the prototype's `INV-2026-0714`.

The number is allocated **only at posting**, never when a cart is opened, so abandoned carts consume nothing. The document table also carries `UNIQUE(organization_id, invoice_number)` as a backstop — the sequence generates it, the unique index proves it.

Cost, stated plainly: the row lock serializes posting per branch per document type for the duration of the transaction. With one branch and one counter this is a non-issue; if it ever became one, the policy (not the mechanism) would have to change to permit gaps.

**Ledger idempotency.** Every `financial_entries` row carries a deterministic `source_key`, and `UNIQUE(organization_id, source_key)` prevents double-posting (`13_` §16 "Prevent duplicate posting"). The key is derived, never random:

```text
sale:{sale_id}:revenue
sale:{sale_id}:cogs
sale:{sale_id}:line:{sale_line_id}:cogs
payment:{payment_id}:cash
external_transaction:{txn_id}:fee_revenue
external_transaction:{txn_id}:provider_charge
goods_receipt:{receipt_id}:inventory_asset
```

Because the key is a pure function of the source record and the leg, a retried or replayed posting produces the identical key and `ON CONFLICT (organization_id, source_key) DO NOTHING` makes the repost a no-op. This is what makes the `13_` §24 "financial-entry idempotency" integration test meaningful. `source_type`/`source_id` remain as indexed columns for drill-down; `source_key` is the guard.

Each `LEDGER_SOURCE_TYPE` maps to exactly one source table — this 1:1 invariant is why `owner_equity_movements` stays separate (D-8). The single exception is `opening_balance`, which has no operational source row; see §10.

### 5.6 External provider reference

```sql
CREATE UNIQUE INDEX ux_external_txn_provider_reference
  ON external_transactions (organization_id, provider_id, external_reference)
  WHERE external_reference IS NOT NULL AND status <> 'draft';
```

`13_` §13: "Use idempotency and unique provider/reference constraints where appropriate." Scoped by provider because a JazzCash reference and an Easypaisa reference may legitimately collide. Partial because the cashier may genuinely not have a reference yet — `EXTERNAL_TRANSACTION_STATUSES` includes `pending`, which `shared/src/enums.ts` describes as a real operational state ("the provider transaction may not settle immediately, and the shop must be able to record that without faking success"). Forcing a reference would push staff to invent one. Drafts are excluded so a half-typed record cannot block the real one.

### 5.7 Request idempotency

`UNIQUE(organization_id, endpoint, idempotency_key)` on `idempotency_records`, keyed off the `IDEMPOTENCY_KEY_HEADER` (`idempotency-key`) constant. `request_hash` detects a client reusing one key with a different body — that is a client bug and must return a stable error, not silently replay the wrong response. Scoped by endpoint so one key cannot leak across operations. Covers `13_` §24's "duplicate sale idempotency" test. §7.4.

---

## 6. What the database enforces, and how

This section is the honest split between "the database guarantees this" and "a service guarantees this". `13_` §4 requires "database constraints in addition to API validation" — *in addition to*, not instead of. A constraint that only lives in a service is one bad code path away from being false.

### 6.1 Unique indexes (DB-enforced)

| Rule | Mechanism |
|---|---|
| `13_` §23.1 no duplicate normalized IMEI/serial | `UNIQUE(organization_id, normalized_value)` on `device_identifiers` |
| One IMEI1/IMEI2/serial per unit | `UNIQUE(serialized_inventory_unit_id, identifier_type)` |
| `13_` §23.4 a sold unit cannot be sold again | partial `UNIQUE(serialized_inventory_unit_id) WHERE unit_sale_active` on `sale_lines` |
| One active reservation per unit | partial `UNIQUE(serialized_inventory_unit_id) WHERE status='active'` on `reservations` |
| Unique SKU / barcode / alias | `UNIQUE(organization_id, …)` on variants / barcodes / aliases |
| Unique customer phone | partial unique (§5.4) |
| Unique invoice/PO/receipt/return/expense numbers | `UNIQUE(organization_id, <number>)` per document table |
| `13_` §16 no duplicate ledger posting | `UNIQUE(organization_id, source_key)` on `financial_entries` |
| `13_` §13 provider reference | partial unique (§5.6) |
| `13_` §12 duplicate sale submission | `UNIQUE(organization_id, endpoint, idempotency_key)` |
| One open drawer per cashier | partial `UNIQUE(branch_id, cashier_user_id) WHERE status IN ('open','closing_pending')` |
| Idempotent metrics job | `UNIQUE(organization_id, branch_id, product_variant_id, metric_date)` |

### 6.2 Check constraints (DB-enforced)

| Rule | Mechanism |
|---|---|
| **`13_` §23.2 no negative stock** | `CHECK (quantity_on_hand >= 0)` on `stock_balances`; `CHECK (quantity_remaining >= 0)` on `stock_batches` |
| Reserved cannot exceed on-hand | `CHECK (quantity_reserved <= quantity_on_hand)` |
| `13_` §23.3 one active state, one location | single `stock_state` + `location_id` column (structural) + `CHECK (stock_state = 'sold' OR location_id IS NOT NULL)` |
| A sold unit names its sale | `CHECK (stock_state <> 'sold' OR current_sale_line_id IS NOT NULL)` |
| `05_RULES.md` §4 serialized line = 1 unit | `CHECK (serialized_inventory_unit_id IS NULL OR quantity = 1)` on `sale_lines` |
| Serialized movement moves one device | `CHECK (serialized_inventory_unit_id IS NULL OR abs(quantity_delta) = 1)` |
| Movement targets exactly one of unit/batch | `CHECK ((serialized_inventory_unit_id IS NOT NULL) <> (stock_batch_id IS NOT NULL))` |
| Sale arithmetic | `CHECK (total_minor = subtotal_minor - discount_minor + tax_minor)` |
| `13_` §13 service profit formula | `CHECK (service_profit_minor = customer_fee_minor - provider_charge_minor - other_expense_minor)` |
| **`05_RULES.md` §1.17 cash variance is explained, not hidden** | `CHECK (variance_minor = 0 OR variance_reason IS NOT NULL)` on `cash_reconciliations` |
| Variance arithmetic | `CHECK (variance_minor = counted_cash_minor - expected_cash_minor)` |
| **`05_RULES.md` §1.9 adjustments require a reason** | `CHECK (reason_note IS NOT NULL AND length(btrim(reason_note)) > 0)` on `stock_adjustments` |
| `05_RULES.md` §5 no negative purchase qty/cost | `CHECK (quantity_ordered > 0)`, `CHECK (unit_cost_minor >= 0)` |
| Ledger amounts are positive; sign is in `direction` | `CHECK (amount_minor > 0)` on `financial_entries` |
| Fee-rule mode coherence | §2.7.1 |
| Payable/receivable arithmetic | `CHECK (balance_minor = amount_minor - paid_minor)` |
| Date ranges | `CHECK (effective_to IS NULL OR effective_to > effective_from)` |

### 6.3 Exclusion constraint (DB-enforced)

Overlapping active fee rules for the same provider+type+branch are impossible (§2.7.1, `btree_gist` + `tstzrange`). Requires a raw-SQL block in the migration.

### 6.4 Foreign keys and delete behavior (DB-enforced)

Default is **`ON DELETE RESTRICT`**. This is the mechanism behind `13_` §10 "deleting units with history" being prevented and `05_RULES.md` §1.6 "A posted sale cannot be edited or deleted".

| Behavior | Applied to | Why |
|---|---|---|
| `RESTRICT` | Everything not listed below | Master data referenced by history is inactivated, never deleted (`04_DATA_MODEL.md` §11) |
| `CASCADE` | `role_permissions`, `user_roles`, `user_scope_access`, `user_sessions`, `device_identifiers`, `supplier_contacts`, `customer_addresses`, `customer_consents`, `repair_parts` | Pure join rows or wholly-owned children with no independent meaning |
| `CASCADE` | `purchase_order_lines`, `stock_count_lines`, `quotation_lines`, `demand_request_items` | Owned by a **draft** parent. Once the parent is posted, the parent itself is `RESTRICT`-protected, so the cascade is unreachable |
| `SET NULL` | `demand_request_items.matched_product_variant_id` | `05_RULES.md` §1.12 — losing a catalog match must never destroy the demand record |
| `RESTRICT` | `audit_events.actor_user_id` | A user with audit history cannot be deleted, ever |

`sale_lines` are **not** cascade-deleted from `sales`: a posted sale is never deleted, so the cascade would only ever fire on a draft — and drafts are cancelled (`SALE_STATUSES` includes `cancelled`, `13_` §12 "cancellation before posting"), not deleted. `RESTRICT` here makes the intent unambiguous.

### 6.5 Enforced in the service layer only — and why

Stated plainly, because these are the gaps a reader should know about:

| Rule | Why not a DB constraint | Compensating control |
|---|---|---|
| `13_` §23.14 payment + receivable = sale total | Spans three tables; PostgreSQL has no multi-table `CHECK`. A trigger could, but a trigger firing mid-transaction on partially-inserted rows is fragile and order-dependent | Recalculated server-side inside the posting transaction; `13_` §24 "payment mismatch rejection" integration test |
| Σ debits = Σ credits per `entry_group_id` | Same reason | Asserted in the posting service; integration test; nightly reconciliation job that raises a data-quality exception (`13_` §17) |
| `05_RULES.md` §3 serialized state transitions | A `CHECK` sees only the new row, not the old value. A trigger could compare `OLD`/`NEW` | `isTransitionAllowed()` from `shared/src/enums.ts` — already implemented and unit-tested — called inside the transaction while holding the row lock. `05_RULES.md` §3 "State transitions must be explicit and tested" |
| Received qty within tolerance | Tolerance is configurable per `application_settings`; a `CHECK` cannot read another table | Service validation + `13_` §24 "partial receiving" test |
| `05_RULES.md` §4 minimum margin / discount threshold | Configurable thresholds | Service + `PRICING_OVERRIDE_MIN_MARGIN` / `SALES_DISCOUNT_OVERRIDE` permission checks |
| `13_` §23.20 authorization | Not a data constraint | NestJS guards; `user_scope_access` supplies the scope |

A database trigger enforcing state transitions is a reasonable future addition; it is **not** planned for v1 because the transition table already lives in tested shared code and duplicating it in PL/pgSQL creates two definitions that can drift.

---

## 7. Concurrency strategy

Isolation level: **READ COMMITTED** (PostgreSQL default). `SERIALIZABLE` is not used — it would push serialization failures into every POS write and force retry logic everywhere. Explicit row locks plus the `CHECK` constraints in §6.2 give the same guarantees with predictable behavior.

### 7.1 Pessimistic row locks for serialized units

`13_` §22: "Use safe row locks, atomic updates or unique constraints to prevent two users from selling/reserving the same IMEI." `13_` §24 requires a "simultaneous same-IMEI sale" integration test.

Sale posting, inside one transaction:

```sql
SELECT id, stock_state, version, unit_cost_minor
  FROM serialized_inventory_units
 WHERE id = ANY($1)
 ORDER BY id
   FOR UPDATE;
```

- `FOR UPDATE` blocks the second concurrent seller until the first commits; it then re-reads `stock_state = 'sold'` and fails with a stable error code rather than double-selling.
- **`ORDER BY id` is mandatory.** Two carts containing the same two units in opposite order will deadlock without a consistent lock order. Ascending `id` is the convention for every multi-row lock in the codebase.
- `FOR UPDATE` (not `FOR NO KEY UPDATE`) because the state genuinely changes.
- The check is re-read **after** acquiring the lock, never before — a state read outside the lock is stale by definition.

Belt and braces: even if a code path forgot the lock, the partial unique index on `sale_lines (serialized_inventory_unit_id) WHERE unit_sale_active` makes a second active sale of the same unit a `23505` violation. The lock gives a clean error; the index guarantees correctness.

**Quantity items** do not use `FOR UPDATE`. They use a conditional atomic update, which is cheaper and equally safe:

```sql
UPDATE stock_balances
   SET quantity_on_hand = quantity_on_hand - $2
 WHERE id = $1 AND quantity_on_hand >= $2;
```

Zero rows affected = insufficient stock → abort. The `CHECK (quantity_on_hand >= 0)` is the final backstop if the `WHERE` were ever wrong.

**Other locks:** `number_sequences` row (§5.5) for number allocation; `cash_sessions` row during closing so two devices cannot submit two counts.

### 7.2 Optimistic version columns for mutable drafts

`13_` §19: "optimistic version fields for mutable drafts". `version INTEGER NOT NULL DEFAULT 0` on: `serialized_inventory_units` (per `04_DATA_MODEL.md` §4), `product_variants`, `customers`, `suppliers`, `purchase_orders`, `sales` (draft), `quotations`, `stock_counts`, `expenses`, `cash_sessions`, `external_transactions`, `external_fee_rules`, `customer_demand_requests`, `tasks`, `repair_jobs`, `application_settings`.

```sql
UPDATE purchase_orders
   SET status = $2, version = version + 1
 WHERE id = $1 AND version = $3;
```

Zero rows = someone else edited it → HTTP 409 with a stable error code. Optimistic, not pessimistic, because a purchaser may hold a PO form open for minutes; a row lock across a human think-time window is unacceptable. Posted records get no `version` — they are immutable, so there is nothing to race.

### 7.3 Append-only enforcement

`inventory_movements`, `financial_entries` and `audit_events` are append-only. This is enforced with a `BEFORE UPDATE OR DELETE` trigger raising an exception, plus a least-privilege grant (`13_` §27) that withholds `UPDATE`/`DELETE` from the application role on those tables. Two mechanisms because the grant protects against a bug and the trigger produces a clear error message.

This is the mechanism behind `05_RULES.md` §1.6–1.8 and `13_` §23.9: corrections happen through reversal, return, refund or adjustment — never by mutating history.

### 7.4 Idempotency

Three independent layers, deliberately not collapsed into one:

1. **Request layer** — `idempotency_records` (§5.7). The client retries a POST after a timeout; the stored response replays instead of a second sale. Insert the key row *first*, in the same transaction as the work: `INSERT ... ON CONFLICT DO NOTHING` returning zero rows means a concurrent identical request is already in flight.
2. **Ledger layer** — `financial_entries.source_key` (§5.5). Protects against re-posting from any path, including a background retry or a manual replay.
3. **External-reference layer** — provider reference unique index (§5.6). Protects against recording the same real-world provider transaction twice from two devices.

Layer 1 stops the double request; layer 2 stops the double posting even if layer 1 is bypassed; layer 3 stops the double record even if the requests are genuinely distinct. `05_RULES.md` §9: "Use idempotency for retried writes. Background jobs must be idempotent."

### 7.5 Transaction boundaries

`13_` §22 mandates one transaction for each of: purchase receiving, sale posting, return/refund/exchange, external service posting, cash-session closing. Each maps to a single `prisma.$transaction()` in the owning domain service. `13_` §7: "one module must not bypass another module's domain service to mutate its tables" — so, for example, Sales calls Inventory's movement service inside the shared transaction rather than writing `inventory_movements` directly.

---

## 8. Deviations from `04_DATA_MODEL.md`

`13_` §19 permits this explicitly: "You may rename or combine entities when the result is cleaner and remains normalized, but do not remove required behavior." Each deviation below states the behavior preserved.

| ID | Change | Justification |
|---|---|---|
| **D-1** | `InventoryUnit.imei1/imei2/serial_number` columns → child table **`device_identifiers`**. Table renamed to `serialized_inventory_units` per §19. | The three partial unique indexes `04` §4 asks for cannot prevent unit A's IMEI1 from equalling unit B's IMEI2 — a real duplicate the schema would accept. One `UNIQUE(organization_id, normalized_value)` prevents every collision across every slot. `13_` §23.1 is unqualified by slot. Behavior preserved and strengthened; identifiers are still per-unit and per-slot via `UNIQUE(unit_id, identifier_type)`. Cost: a join on unit search (§5.1). |
| **D-2** | `DeviceVerification` + `DeviceInspection` → **`device_checks`** with a `check_type` discriminator. | Identical shape: unit, type, result, reference, actor, timestamp, details. Two tables with one schema is duplication, and a single timeline query ("what has been checked on this device?") is what the UI actually needs — `data.js` `usedIntakes[].gates[]` is already a flat list of `{name, ok}`. Current PTA/police *status* stays denormalized on the unit per `04` §4; `device_checks` is the history behind it. Neither entity is in §19. |
| **D-3** | `cash_reconciliations` kept **separate** from `cash_sessions` (not merged). | `CASH_SESSION_STATUSES` includes `reopened_with_authorization`, so a session can be closed, reopened and re-closed. Columns on the session would overwrite the first count — exactly what `13_` §14 forbids. One immutable row per attempt preserves the full record. §19 lists both tables anyway. |
| **D-4** | `SellerDeclaration` and customer CNIC kept in **separate tables** (`seller_declarations`, `customer_identity_documents`) rather than columns on the intake/customer. | `04` §11 and `05_RULES.md` §1.16 require CNIC data to be restricted, encrypted and minimally retained. Isolating it in its own table makes a per-table grant, a targeted retention job and a "never join this in reports" rule enforceable. Sensitive columns mixed into a hot operational table leak through every `SELECT *`. |
| **D-5** | Walk-in customer is **`customers.customer_id IS NULL`** + a `customer_name_snapshot`, not a sentinel row. | `13_` §12 requires walk-in sales; `05_RULES.md` §6 allows anonymous demand. A magic "Walk-in" customer row would accumulate a false purchase history, break the `UNIQUE(org, phone_e164)` intent, and make "how many customers do we have?" wrong. Prototype `sales[].customer: "Walk-in"` is display text, not an entity. |
| **D-6** | **Added** `user_sessions` and `idempotency_records` (not in §19). | `13_` §8 requires server-side session expiry/revocation, which a stateless cookie cannot do. `13_` §12/§20 require request idempotency, and `IDEMPOTENCY_KEY_HEADER` already exists in `shared/src/constants.ts`. Neither is expressible without storage. |
| **D-7** | **Kept** `quotations`/`quotation_lines` (in `04` §2, absent from §19). | `13_` §15 lists "quotation or reservation" as a demand conversion target; `09_ANALYTICS` §2 counts quotations as a demand metric; prototype `demand[]` DM-5010 has `outcome: "Quotation sent"`. §19's omission would remove required behavior. |
| **D-8** | `OwnerEquityMovement` → `owner_equity_movements`, **not merged** into `cash_movements`. | `LEDGER_SOURCE_TYPES` lists `owner_capital` and `owner_withdrawal` as distinct from `cash_movement`. Keeping the 1:1 source_type→table invariant (§5.5) means drill-down never needs a discriminator to find the source row. It also keeps `05_RULES.md` §7 structural: "Owner withdrawal is not a shop expense. Owner capital injection is not sales revenue." |
| **D-9** | `FollowUp` → merged into **`tasks`** with `task_type='follow_up'`. | `data.js` `tasks[]` already does this: T-02 "Follow up Faizan (0301-2233445) — Hot 50 arrival", `type: "Follow-up"`, alongside Reorder/Payable/Reservation tasks in one list. A separate table would need its own due-date index, assignment and completion — identical to `tasks`. `customer_demand_requests.follow_up_date` stays denormalized for the demand-screen filter. §19 says "demand_items/follow-ups", permitting either. |
| **D-10** | `InventoryPhoto` → merged into **`documents`** with `document_type='inventory_photo'`, polymorphic on `(entity_type, entity_id)`. | §19 lists "documents/attachments". A dedicated photo table would duplicate storage key, mime type, checksum, sensitivity and retention. One storage adapter (`13_` §4) means one metadata table. |
| **D-11** | `ProductAttribute` → typed columns (`ram`, `storage`, `color`, `region`) + `attributes JSONB` for the long tail. | `05_RULES.md` §2: "Storage/RAM/color are attributes, not free-form text when known." An EAV table makes every variant query a multi-join and gives no type safety or usable index. Typed columns match `data.js` `variants[]` exactly (`storage: "256 GB"`, `color: "Black"`, `ram: "8 GB"`). `ProductAttribute` is not in §19. |
| **D-12** | `Payment`/`Receivable`/`Payable` gain `*_allocations` child tables. | `05_RULES.md` §4: "Split payment allocation must reconcile exactly", and `04` §6 already models `PAYMENT_ALLOCATION` for sales. Supplier payments need the symmetric structure — one payment settling several invoices is normal with `suppliers[].terms: "30-day credit"`. |
| **D-13** | `Reservation` is its own table, not a `stock_state` alone. | The unit's `reserved` state says *that* it is held; `reservations` says *for whom*, *until when* and *for which sale*. Prototype task T-04 ("Reservation INV-1044 expires — pickup Tue") and DM-5011 ("Reserved INV-1044, pickup Tue") both need the expiry and the customer link. Both are kept, consistent (`stock_state='reserved'` ⟺ an active reservation row). |

Nothing in `04_DATA_MODEL.md` §2 is dropped. `Role`, `Permission`, `UserRole`, `CashSession`, `Category`, `Brand`, `ProductModel`, `ProductVariant`, `ProductAlias`, `ProductBarcode`, `CompatibilityRule`, `PriceList`, `PriceEntry`, `StockBatch`, `InventoryMovement`, `StockCount`, `StockAdjustment`, `Customer`, `CustomerAddress`, `CustomerConsent`, `DemandRequest`, `DemandRequestItem`, `Quotation`, `Supplier`, `SupplierContact`, `SupplierProduct`, `SupplierQuote`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `PurchaseReturn`, `SupplierPayment`, `Payable`, `Sale`, `SaleLine`, `Payment`, `PaymentAllocation`, `Return`, `ReturnLine`, `Refund`, `Expense`, `ExpenseCategory`, `Receivable`, `CashMovement`, `UsedDeviceIntake`, `WarrantyClaim`, `RepairJob`, `RepairPart`, `RepairStatusHistory`, `DailyProductMetric`, `RecommendationRun`, `PurchaseRecommendation`, `RecommendationDecision`, `Notification`, `Task`, `IntegrationAttempt`, `Document`, `AuditEvent` and `OutboxEvent` all map to a table in §2.

---

## 9. Migration and seed strategy

### 9.1 BLOCKER — no migration has been generated or applied

**Database credentials are not available.** This blocks every step that needs a live connection:

| Blocked | Why |
|---|---|
| `prisma migrate dev` | Needs `DATABASE_URL` **and** a shadow database to diff against |
| `prisma migrate deploy` | Needs `DATABASE_URL` |
| `prisma db seed` | Needs `DATABASE_URL` |
| Integration tests (`13_` §24 — all 15) | Every one requires a real PostgreSQL |
| `13_` §24 migrate-from-clean-database test | Requires a database to create and drop |
| `13_` §31 steps 3–6 | Requires Docker Compose PostgreSQL |

Compounding it: **Docker is not installed**, so the `13_` §31.3 path ("start PostgreSQL and required services through Docker Compose") is unavailable. PostgreSQL 18.4 *is* running locally on port 5432 (service `postgresql-x64-18`) and `psql` exists at `D:\postgresql\bin\psql.exe`, so a local database is reachable **the moment credentials exist** — Docker is not on the critical path.

**Current state: `database/` does not exist. `schema.prisma` does not exist. Zero migrations authored, zero applied, zero seeds run.**

### 9.2 What proceeds without credentials

Schema work is not blocked; only *applying* it is. Without any connection:

- Author `database/prisma/schema.prisma` in full.
- `prisma format` and `prisma validate` — pure syntax/semantic checks, no connection.
- `prisma generate` — emits the client from the schema file alone.
- **`prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`** — renders the initial migration SQL **without connecting to anything**. This is the key unblock: the SQL can be written and reviewed now, and applied unchanged later.
- Hand-write the raw-SQL blocks Prisma cannot model: the §6.3 exclusion constraint, the §7.3 append-only triggers, `CHECK` constraints beyond Prisma's expressiveness, and partial/trigram indexes. These live in `database/prisma/migrations/*/migration.sql` alongside the generated DDL.
- Write seed scripts and fixtures (they run later).

Caveat: **Prisma is not installed yet.** There is no `prisma` or `@prisma/client` entry in any workspace package or in `pnpm-lock.yaml`, and the `database/` workspace package that would carry the dependency does not exist. `pnpm-workspace.yaml` already lists `database`, so installing it is a one-step change — but nothing above has been executed. Whether Prisma's `migrate diff` flags match the commands written here is **UNKNOWN — to be confirmed against the CLI once it is installed**, not from memory.

### 9.3 Unblocking requirements

Needed from the product owner (`13_` §27 "least-privilege DB account"):

1. `DATABASE_URL` for an application role owning the app schema — **not** a superuser.
2. `SHADOW_DATABASE_URL` for `migrate dev` (may be a second local database).
3. Confirmation of the target database name and whether the existing local PostgreSQL 18.4 instance may host development data.
4. Confirmation that no existing database may be reset (`13_` §23.24).

Credentials go in `.env` (gitignored) with placeholders in `.env.example`. `05_RULES.md` §9 / `13_` §23.23: "Secrets never enter Git."

### 9.4 Migration discipline

- One migration per slice (§3), reviewed before it runs (`05_RULES.md` §9: "Database migrations are reviewed and reversible where practical").
- Never edit an applied migration. Corrections are new migrations.
- Each migration is tested from an **empty** database, per `13_` §24's migrate-from-clean-database requirement — the only way to catch a migration that depends on ambient state.
- A down/rollback script accompanies each migration where practical; for destructive changes the runbook documents the restore path instead of pretending a rollback is safe.
- The Prisma-generated DDL and the hand-written constraint SQL live in the same migration file so a single `migrate deploy` produces a fully-constrained schema. A constraint added in a later migration is a window where bad data can land.

### 9.5 Seed strategy

Deterministic and re-runnable (`13_` §4 "deterministic seed scripts"), sourced from the `13_` §26 list and shaped by `prototype/assets/data.js`.

**Determinism.** Every seeded row gets a **UUIDv5** derived from a fixed namespace plus a stable natural key (e.g. `uuid5(SEED_NS, 'variant:PH-APPLE-IP17PM-256-BLK-NEW-PTA')`). Re-running the seed upserts the same IDs instead of duplicating. Random UUIDs would make the seed non-idempotent and break `13_` §24's repeatable integration tests.

**Order** (FK-safe): organization → branches → stock_locations → permissions → roles → role_permissions → users → user_roles → user_scope_access → number_sequences → application_settings → financial_accounts → categories → brands → product_models → product_variants → product_barcodes → product_aliases → price_lists → price_entries → suppliers → supplier_contacts → supplier_products → customers → external_service_providers → external_service_types → external_fee_rules → expense_categories → purchase_orders → purchase_order_lines → goods_receipts → goods_receipt_lines → serialized_inventory_units → device_identifiers → stock_batches → inventory_movements → stock_balances → cash_sessions → sales → sale_lines → payments → payment_allocations → external_transactions → expenses → demand_requests → demand_request_items → daily_product_metrics → recommendation_runs → purchase_recommendations → tasks → notifications.

**Seeded IMEIs must be generated, not copied — verified.** Running the Luhn check from `shared/src/imei.ts` against every IMEI in `prototype/assets/data.js`:

| Result | Count |
|---|---|
| Luhn-valid | **1 of 22** (only `356789012345672`) |
| Luhn-invalid | **21 of 22** |

(22 distinct IMEI values across 25 occurrences — `units[].imei1`/`imei2`, `sales[].items[].imei`, `returns[].imei`, `usedIntakes[].imei`.)

`352094561230417`, `352094561230511`, `356789012345671`, `354001234567891`, `353012786541239`, `358900112233445` and the rest all **fail** the checksum that `validateImei()` enforces. Copying prototype IMEIs into seeds would fail validation on insert. Seeds therefore build each IMEI as a 14-digit synthetic body plus `computeImeiCheckDigit()`, keeping the prototype's TAC prefixes for realism. This is a genuine prototype→production gap: the prototype never validates IMEIs because it has no backend.

**Other seed rules:**

- Money converted to minor units: prototype `price: 489000` (whole PKR) → `48900000` paisa. `data.js` states "All money is whole PKR (rupees) for readability in this prototype" — every value needs ×100.
- Phones normalized via `normalizePakistanPhone()`: `"0301-4567890"` → `+923014567890`.
- Fee rules seeded as **rows** from §2.7.1's defaults, never as constants in code (`13_` §13).
- Dates seeded relative to "today", not the prototype's hardcoded `businessDate: "14 Jul 2026"` — otherwise 7/30/90-day analytics windows are empty on any other day.
- **Never** real CNICs, real customer data or production secrets (`13_` §26). Prototype CNICs are already masked (`"35202-•••••••-1"`) and are not carried over at all.
- Development passwords are generated per-environment, documented locally, and cannot be enabled unchanged in production (`13_` §26).
- Seeds are development-only and refuse to run against a production `NODE_ENV`.

Rows follow `13_` §26: Lahore shop, six role users (owner/manager/salesperson/cashier/purchaser/accountant), phone and accessory categories, 10–15 brands, realistic variants, serialized phones with synthetic IMEIs, quantity accessories, suppliers, customers with synthetic Pakistan numbers, purchases, goods receipts, sales, payments, external providers and fee rules, send/withdrawal samples, cash sessions, expenses, demand requests and recommendation data.

### 9.6 Opening stock import

`13_` §25 (Slice 13 — launch hardening) requires an opening-stock import template and dry run. Opening stock enters through `stock_adjustments` with `reason='opening_balance'` and matching `inventory_movements`, never by direct `INSERT` into `stock_balances` — the same rule as every other stock change (`13_` §23.7: "Every stock change creates a movement"). The dry run validates IMEI uniqueness and Luhn across the whole file **before** any write.

---

## 10. Open questions

Recorded rather than guessed. Each needs a product-owner decision and belongs in `docs/ASSUMPTIONS.md` / `docs/REQUIREMENT_CONFLICTS_AND_DECISIONS.md`.

| # | Question | Impact | Current state |
|---|---|---|---|
| 1 | Is tax included in or excluded from `sales.total_minor`? `05_RULES.md` §7 requires reports to state which; `13_` §16's `sales_gross_profit = net_sales_revenue - COGS` does not say whether net sales is pre- or post-tax. | The `CHECK (gross_profit_minor = total_minor - cogs_minor)` in §2.6.1 is wrong if tax is inclusive. | **UNKNOWN — not determinable from the repository.** `data.js` `finance.pnl` has no tax line at all. Tax columns are modeled as `tax_minor` defaulting to 0 pending the decision. |
| 2 | May two customers share one phone number (family handset)? | Decides whether §5.4's unique index is correct or must become non-unique with a merge workflow. | **UNKNOWN.** Unique partial index planned; `data.js` `customers[]` has no duplicate numbers, which is not evidence either way. |
| 3 | Receiving over-quantity tolerance (`05_RULES.md` §5 "permitted tolerance"). | The `purchase_order_lines` received-quantity check. | **UNKNOWN — no percentage anywhere in the blueprint.** Modeled as an `application_settings` key, service-enforced (§6.5). |
| 4 | Landed-cost allocation method (`05_RULES.md` §5 "documented"; `13_` §11 "landed-cost allocation"). | Whether `goods_receipt_lines.allocated_landed_cost_minor` is by value, by quantity, or by weight. `allocateByWeights()` already exists in `shared/src/money.ts` and handles the remainder distribution. | **UNKNOWN — method not specified.** Modeled as `goods_receipts.landed_cost_method` so the choice is data, and the chosen method is snapshotted per receipt. |
| 5 | What source row does `LEDGER_SOURCE_TYPES.opening_balance` point to? | The only exception to the 1:1 source_type→table invariant (§5.5) and to `financial_entries.source_id NOT NULL`. | Modeled as `source_id NULL` with `source_key = 'opening_balance:{account_id}'`. Needs confirmation. |
| 6 | Does `05_RULES.md` §4 "sequential" mean **gapless**? | If gaps are acceptable, §5.5's row lock can become a PostgreSQL `SEQUENCE` and posting stops serializing per branch. | Assumed **gapless** (the stricter reading). Prototype `INV-2026-0710..0714` is consecutive, which is consistent with but does not prove gaplessness. |
| 7 | Retention periods (`04_DATA_MODEL.md` §11 "according to legal/accounting policy"). | `documents.retention_expires_at` and the expiry job need concrete durations. | **UNKNOWN — no durations in the repository.** `13_` §2 forbids inventing legal behavior; columns exist, values are configuration. |

---

## 11. Status summary

| Item | Status |
|---|---|
| `database/` directory | **Does not exist** |
| `schema.prisma` | **Does not exist** |
| Migrations authored | **0** |
| Migrations applied | **0** |
| Seeds run | **0** |
| Tables created | **0** |
| Integration tests | **0** — blocked on credentials |
| `shared/` package | Built and verified: 153 unit tests pass, lint 0, typecheck 0 |
| This document | Plan only |

Next executable step: create the `database/` workspace package and install Prisma (it is not installed yet — §9.2), author `database/prisma/schema.prisma` for Slice 1, then render its SQL with `prisma migrate diff --from-empty`, which needs no connection — then stop at the credential blocker before `migrate deploy`.
