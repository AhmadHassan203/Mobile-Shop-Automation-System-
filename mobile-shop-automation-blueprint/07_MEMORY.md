# Project Memory

> This file is the execution source of truth for coding agents. Update it only after work is verified in the repository and tests. Never mark an item complete from an assumption or an untested response.

## 1. Current objective

Build Phase 0 and Phase 1 of MobileShop OS for a single Lahore shop while preserving future multi-user, multi-location support.

## 2. Current status

- Project state: Audit completed, scope reduced
- Current phase: Phase 0 (Completing Prerequisites)
- Current milestone: Requirements and repository foundation
- Production status: Not deployed
- Last verified date: 2026-07-13
- Last verified commit: Not available

## 3. Confirmed decisions

- Architecture: modular monolith
- Frontend: Next.js PWA with TypeScript
- Backend: NestJS with TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Initial currency: PKR
- Business timezone: Asia/Karachi
- Inventory: serialized phones plus batch accessories
- Buying intelligence: deterministic first
- AI: explanation layer later
- Autonomous purchasing: prohibited
- Posted transaction editing: prohibited
- Multi-branch: data model ready, UI deferred
- Native app: deferred
- Microservices: rejected for initial system
- Release 1 scope: Strictly limited to Phases 1 & 2 to meet the 1-month deadline
- Features explicitly deferred to Month 2+: AI, advanced intelligence, used phones, customer demand, and repair workflows
- Background jobs: Redis and BullMQ deferred; initial system will use synchronous processing or simple in-memory queues

## 4. Assumptions requiring owner confirmation

- Does the shop sell new phones, used phones, accessories, or all?
- Are repairs offered?
- Is installment/credit sale offered?
- Is the business sales-tax registered?
- Which FBR integration obligations apply?
- Which used-device verification steps are currently followed?
- Which printers/scanners are available?
- What are initial suppliers and their lead times?
- Is one stock location enough for launch?
- Which payment methods are accepted?
- Is WhatsApp notification required at launch?
- Is Urdu UI required at launch or later?
- Has the owner explicitly agreed to drop Phases 3-7 from the Month 1 deadline?
- Is FBR tax integration legally required for Month 1 launch?
- Which exact receipt printer model will be used for PDF/HTML print formatting?
- What is the operational fallback for offline mode (e.g. manual paper receipts if internet drops)?
- Who will provide the CSV export of current inventory to prepare the import script?

## 5. Completed

- [x] Product blueprint created
- [x] PRD created
- [x] UX design specification created
- [x] Architecture created
- [x] Data model created
- [x] Business and engineering rules created
- [x] Delivery phases created
- [x] Lahore/Pakistan catalog strategy created
- [x] Reorder formula specification created
- [x] Testing/release strategy created
- [x] Master coding-agent prompt created

## 6. In progress

- [ ] Owner review of assumptions
- [ ] Repository creation
- [ ] Phase 0 architecture decision records
- [ ] Initial schema implementation
- [ ] First catalog seed

## 7. Next tasks

1. Confirm critical assumptions with owner (FBR tax, offline mode, receipt printer).
2. Obtain CSV of opening inventory to prepare the import script.
3. Create monorepo and CI.
4. Configure PostgreSQL and Prisma.
5. Implement Auth, Organization, Branch, Location, and User entities.
6. Implement Catalog (Category, Brand, Model, Variant).
7. Implement Inventory (Stock batches, Serialized units, Movement logic).
8. Implement Purchasing (Goods receipt workflow).
9. Implement POS and Sale posting.
10. Implement Cash Sessions (Opening/Closing).

## 8. Known risks

- Incorrect legal assumptions for FBR, PTA or used-device records
- Poor opening inventory data
- Duplicate or malformed IMEIs
- Scope expansion before POS is stable
- Attempting offline sales too early
- Treating purchase cash outflow as immediate loss
- AI being used before reliable metrics
- Sensitive identity documents being stored insecurely
- Supplier cost and sale price changes corrupting historical profit
- One-person development causing incomplete documentation/tests
- Lack of an inventory import script breaking the Day 1 launch
- Unexpected FBR digital invoicing mandate blocking launch
- No offline tolerance built into the technical design, causing counter halts during internet outages

## 9. Known issues

None yet. Add issues with:

- ID
- severity
- module
- reproduction
- expected behavior
- actual behavior
- root cause
- fix commit
- regression test
- status

## 10. Environment status

### Local
- API: Not configured
- Web: Not configured
- PostgreSQL: Not configured
- Redis: Deferred
- Object storage: Not configured

### Staging
Not configured.

### Production
Not configured.

## 11. Data and migrations

- Latest migration: None
- Seed version: None
- Opening stock import: Not prepared
- Backup restore test: Not run

## 12. Test status

- Unit: 0
- Integration: 0
- E2E: 0
- Critical flows passing: 0
- Last full test run: Never

## 13. Release checklist

- [ ] migrations applied safely
- [ ] secrets configured
- [ ] admin account secured
- [ ] permissions tested
- [ ] opening inventory approved
- [ ] receipt format approved
- [ ] cash opening entered
- [ ] backup works
- [ ] restore tested
- [ ] monitoring works
- [ ] critical E2E flows pass
- [ ] rollback plan exists
- [ ] staff/owner training completed

## 14. Agent update protocol

After each meaningful implementation:

1. Record files changed.
2. Record migration changes.
3. Record commands/tests run.
4. Record exact pass/fail result.
5. Move only verified items to Completed.
6. Add discovered risks/issues.
7. Set the next smallest executable task.
8. Never remove historical decisions without an ADR or explicit owner instruction.
