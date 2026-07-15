# Assumptions Register

Safe assumptions applied to non-critical uncertainty so the build can continue (product-owner instruction 12). Each is reversible and recorded here with its rationale, blast radius and how to change it.

**Nothing legally sensitive is assumed.** PTA, FBR, Punjab Police e-Gadget and tax behavior are modelled as configurable fields and adapters only — no compliance behavior is invented (`13_` §2).

Status: **Applied** (in code) · **Proposed** (planned, not yet built) · **Confirmed** (validated against an approved source).

| ID | Assumption | Status |
|---|---|---|
| ASM-001 | Money uses PKR with 2 minor units (paisa) | Applied |
| ASM-002 | ADS uses three distinct 30-day windows | Applied |
| ASM-003 | Partial fee blocks are charged per started block | **Confirmed** |
| ASM-004 | Rounding is half-away-from-zero | Applied |
| ASM-005 | Accessory costing is moving weighted average | Proposed |
| ASM-006 | Landed cost allocates by value | Proposed |
| ASM-007 | IMEI checksum is enforced but overridable | Applied |
| ASM-008 | Serials are alphanumeric, IMEIs digits-only | Applied |
| ASM-009 | Customer phones are Pakistani mobiles only | Applied |
| ASM-010 | Business day boundary is local midnight | Applied |
| ASM-011 | Sessions are 12h, HTTP-only cookies | Applied (config) |
| ASM-012 | Password hashing is Argon2id | Proposed |
| ASM-013 | Reserved stock counts as on-hand | Applied |
| ASM-014 | Cash session review requires a different user | Applied (permissions) |
| ASM-015 | Tax is excluded from launch calculations | Proposed |
| ASM-016 | Only `successful` external transactions are revenue | Applied |
| ASM-017 | Single organization/branch/location seeded | Proposed |
| ASM-018 | Invoice numbers are per-branch sequential | Proposed |

---

## ASM-001 — Currency is PKR with 2 minor units

**Assumed:** money is stored as integer paisa (1 PKR = 100 paisa); currency code is persisted alongside every amount even though PKR is the only currency at launch.

**Why:** `13_` §3 fixes PKR; `05_RULES.md` §7 and `13_` §23.11 mandate integer minor units. `03_ARCHITECTURE.md` §8 requires storing the currency code "even if initial currency is PKR".

**Blast radius:** every money column and calculation.

**Change by:** adding the currency to `CURRENCY_MINOR_EXPONENT` in `shared/src/money.ts`. Adding a *second* currency additionally requires FX handling, which is out of scope (`01_PRD.md` §8).

**Where:** `shared/src/money.ts`, `.env.example` (`BUSINESS_CURRENCY`, `BUSINESS_CURRENCY_MINOR_UNITS`).

---

## ASM-002 — Average daily sales uses three distinct 30-day windows

**Assumed:** `ADS = 0.50·(days 1–30)/30 + 0.30·(days 31–60)/30 + 0.20·(days 61–90)/30`.

**Why:** `09_ANALYTICS_AND_REORDERING.md` §3 names `units_sold_previous_30` in both the 0.30 and 0.20 terms, which double-counts days 31–60 and ignores days 61–90. The weights decay and sum to 1.0, which is only coherent across three different windows, and 7/30/90-day metrics are required by §2 and `01_PRD.md` §5.10. Treated as a typo. See CON-002.

**Blast radius:** every reorder quantity and priority score (Slice 11).

**Risk if wrong:** moderate. Over-weighting mid-age sales makes recommendations lag real demand.

**Change by:** editing `ADS_WINDOW_WEIGHTS` in `shared/src/constants.ts` **and** bumping `RECOMMENDATION_ALGORITHM_VERSION` (`05_RULES.md` §8 forbids changing formulas without versioning).

**Confirm before:** Slice 11 ships.

---

## ASM-003 — Partial fee blocks are charged per started block — **CONFIRMED**

**Assumed:** a partial thousand is charged as a whole block (PKR 1,500 sent → 2 blocks → PKR 20).

**Why:** upgraded from assumption to **confirmed** by the approved prototype. `prototype/assets/digital.js:87` computes SLAB fees as `Math.ceil(amount / blockSize) * feePerBlock`, seeded with the exact `13_` §13 defaults (10/1,000 sent, 20/1,000 received). See CON-003.

**Blast radius:** every external service fee.

**Change by:** editing the seeded fee rule's `mode` (per provider/type/branch, with effective dates) — no code change. `proportional_block` is implemented and available.

**Where:** `shared/src/fee-rules.ts`; parity asserted in `shared/src/fee-rules.spec.ts`.

---

## ASM-004 — Rounding is half-away-from-zero

**Assumed:** money rounding defaults to `half_up` (2.5 → 3, −2.5 → −3).

**Why:** no blueprint document specifies a rounding mode. Half-away-from-zero is what a shop counter does and what staff expect on a receipt. Symmetric for negatives, so a refund rounds like the sale it reverses — asymmetric rounding would leak paisa on reversal.

**Blast radius:** percentage-based fees, discounts, tax, pro-rated allocation.

**Note:** exact multiplication (`multiplyByQuantity`) and largest-remainder allocation (`allocateByWeights`) never round, so line totals and landed-cost splits are exact regardless of this setting.

**Change by:** `RoundingMode` is a per-call/per-rule parameter; `half_even` (bankers) is implemented if an accountant prefers it.

**Where:** `shared/src/money.ts`.

---

## ASM-005 — Accessory (non-serialized) costing is moving weighted average

**Assumed:** quantity-tracked stock is valued using moving weighted average cost.

**Why:** `03_ARCHITECTURE.md` §8 — "use a documented valuation method, preferably moving weighted average initially". Serialized units are unaffected: each phone carries its own actual cost (`03_ARCHITECTURE.md` §8, `05_RULES.md` §7.11).

**Blast radius:** accessory COGS and gross profit; inventory valuation.

**Change by:** would require a costing-method setting plus a revaluation migration. Not planned for launch.

**Status:** Proposed — implemented in Slice 3/4.

---

## ASM-006 — Landed cost allocates by line value

**Assumed:** freight/duty/handling on a goods receipt is allocated across received lines in proportion to line **value** (not unit count or weight).

**Why:** `13_` §11 requires landed-cost allocation and `05_RULES.md` §5 requires the method be documented, but neither picks one. Value-proportional is the common default and is defensible for phones, where cost varies enormously per unit — allocating by unit count would load a PKR 15,000 feature phone with the same freight as a PKR 400,000 flagship.

**Blast radius:** per-unit landed cost → COGS → historical gross profit.

**Guarantee:** allocation uses largest-remainder (`allocateByWeights`), so shares always sum exactly to the cost allocated — no paisa lost or invented.

**Change by:** allocation method becomes a goods-receipt option (by value / by quantity / by weight). Recorded on the receipt so history stays reproducible.

**Status:** Proposed — implemented in Slice 4.

---

## ASM-007 — IMEI checksum enforced by default, overridable by configuration

**Assumed:** IMEIs must be 15 digits and pass the Luhn check; the check can be relaxed by configuration, and a relaxed acceptance should raise a data-quality exception.

**Why:** `05_RULES.md` §1.1 requires a unique IMEI before a device is saleable but does not mandate checksum validation. Enforcing Luhn catches real typos at receiving. A hard, non-overridable rule would be wrong: a minority of legitimate handsets carry non-Luhn IMEIs, and blocking them would stop real stock entering the system — which staff would work around by entering fake IMEIs, a far worse outcome.

**Also assumed:** an IMEI of a single repeated digit (e.g. `000000000000000`) is always rejected. It passes Luhn but is never a real device.

**Blast radius:** goods receiving, used-device intake.

**Where:** `shared/src/imei.ts` (`validateImei`, `requireChecksum`).

---

## ASM-008 — Serials are alphanumeric; IMEIs are digits-only

**Assumed:** IMEI normalization strips every non-digit. Serial normalization keeps letters, uppercases, and strips separators.

**Why:** IMEIs are numeric by GSM standard; serial numbers routinely contain letters (e.g. Apple `F2LX...`). Uniqueness must survive formatting differences: `356938-035643809` and `356938035643809` are one phone; `sn-abc 123` and `SNABC123` are one device.

**Blast radius:** duplicate-detection correctness (`13_` §23.1).

**Where:** `shared/src/imei.ts` (`normalizeImei`, `normalizeSerial`).

---

## ASM-009 — Customer phone numbers are Pakistani mobiles

**Assumed:** customer contact numbers normalize to Pakistani E.164 mobile format (`+923xxxxxxxxx`); landlines and non-`+92` numbers are rejected for the customer contact field.

**Why:** `01_PRD.md` §7 requires Pakistani phone formatting; follow-up workflows (demand capture, WhatsApp receipts, reservation expiry) target mobiles. Normalizing makes counter lookup work regardless of how staff typed the number.

**Risk:** a customer with only a landline, or an overseas buyer, cannot use the primary phone field.

**Change by:** add an optional free-text `alternate_contact` field. Cheap to add; deferred until asked for.

**Where:** `shared/src/phone.ts`.

---

## ASM-010 — Business day runs local midnight to local midnight

**Assumed:** a business day is `00:00:00`–`23:59:59.999` **Asia/Karachi**, so a day ends at 19:00 UTC the previous day. Ranges are half-open `[start, end)`.

**Why:** `05_RULES.md` §9 requires UTC storage and Asia/Karachi display. No document defines a trading-day cutover. Midnight-local is the least surprising default.

**Risk:** a shop trading past midnight would see a sale land on the next day's report and cash session. If that happens in practice, a configurable day-start offset is needed.

**Blast radius:** daily reports, cash sessions, stock aging, ADS windows.

**Where:** `shared/src/datetime.ts`.

---

## ASM-011 — Sessions last 12 hours in HTTP-only cookies

**Assumed:** server-side session with an opaque ID in a `HttpOnly`, `SameSite=Lax` cookie; 12-hour TTL; `Secure` off in development, on in production.

**Why:** `13_` §8 requires "secure HTTP-only session cookies or another approved secure session strategy" and session expiry, without fixing a duration. 12 hours covers a full shop day without a mid-shift logout, and a shift ends with a cash-session close anyway. Server-side sessions (not JWTs) make immediate revocation possible on deactivation — required by `13_` §8's user activation/deactivation.

**Change by:** `.env` (`SESSION_TTL_HOURS`, `SESSION_COOKIE_*`).

---

## ASM-012 — Password hashing is Argon2id

**Assumed:** Argon2id with sensible memory/time cost.

**Why:** `13_` §8/§27 require "secure password hashing" without naming an algorithm. Argon2id is the current best-practice default and resists both GPU and side-channel attacks.

**Status:** Proposed — implemented in Slice 1.

---

## ASM-013 — Reserved stock counts as physically on hand

**Assumed:** `reserved` units are included in on-hand/valuation totals but excluded from saleable/available.

**Why:** a reserved phone is still in the drawer and still owned, so it must be valued; but it is promised to a customer, so it must not be sold to someone else. `13_` §10 requires separate available/reserved views. `04_DATA_MODEL.md` §5 makes `reserve`/`release` on-hand-neutral movements.

**Where:** `shared/src/enums.ts` (`ON_HAND_STOCK_STATES`, `SALEABLE_STOCK_STATES`, `MOVEMENT_ON_HAND_SIGN`).

---

## ASM-014 — A cash session is reviewed by someone other than the cashier

**Assumed:** cashiers cannot review or reopen their own session; review requires Manager, reopen requires Owner.

**Why:** `13_` §14 has the manager review/approve and reopen "with authorization"; `13_` §8 gives the Manager cash-session review and withholds unrestricted override. Self-review would defeat the purpose of variance control — the whole reason the session exists is that cash is countable and mistakes must be visible.

**Where:** `shared/src/permissions.ts`; asserted by test (cashier lacks `CASH_SESSIONS_REVIEW`; only owner has `CASH_SESSIONS_REOPEN`).

---

## ASM-015 — Tax is excluded from launch calculations

**Assumed:** reports are management-level and tax-exclusive; sale records carry tax fields but no tax engine is built.

**Why:** `01_PRD.md` §8 puts "full general ledger and statutory accounting" out of scope; `05_RULES.md` §7 requires reports to *state* whether tax is included/excluded; `13_` §2 forbids inventing FBR/tax behavior. Building a tax engine would be inventing compliance behavior.

**Consequence:** every management report must display "Tax excluded". `01_PRD.md` §5.6 tax/invoice fields exist on the schema for later use.

**Status:** Proposed — enforced from Slice 10.

---

## ASM-016 — Only `successful` external transactions count as revenue

**Assumed:** `pending`, `failed`, `reversed` and `disputed` external transactions are recorded and reported but contribute no fee revenue or service profit.

**Why:** the prototype's status vocabulary includes all five; `13_` §13 requires a status field. Counting a pending or failed transfer as profit would overstate earnings — the exact confusion `13_` §17 warns against ("Do not confuse sales, cash and profit").

**Note:** cash impact is tracked separately from revenue. A pending transaction may still have moved cash, and the drawer must reconcile against physical reality (`13_` §14: never manipulate records to hide a mismatch).

**Where:** `shared/src/enums.ts` (`EXTERNAL_REVENUE_STATUSES`).

---

## ASM-017 — One organization, one branch, one stock location seeded

**Assumed:** seed data creates a single Lahore organization → branch → stock location; the UI exposes no branch selector.

**Why:** `13_` §3 describes one business, one branch, one primary stock location at launch. `13_` §8: "The launch UI is single-branch. Do not add an unnecessary branch selector, but include branch/location keys in the correct database entities."

**Consequence:** `organization_id` / `branch_id` / `location_id` appear on every scoped entity from day one and are enforced by scope guards, so multi-branch needs no data migration (`01_PRD.md` §7).

**Status:** Proposed — Slice 1.

---

## ASM-018 — Invoice numbers are per-branch sequential with a prefix

**Assumed:** human-facing document numbers are allocated from a `number_sequences` table, per branch per document type, formatted with a prefix (e.g. `INV-2026-000123`), gapless, allocated inside the posting transaction.

**Why:** `05_RULES.md` §4 requires receipt numbers be "unique and sequential according to configured policy" but does not define the policy. Per-branch sequences keep numbering meaningful when a second branch opens.

**Trade-off:** gapless sequencing requires a row lock on the sequence, which serialises posting for that document type. At this shop's volume (a few hundred sales/day) that is irrelevant, and gapless numbering is what an auditor expects.

**Change by:** the format is a setting; the gapless guarantee is structural.

**Status:** Proposed — Slice 5.
