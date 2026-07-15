# Mobile Shop Automation System
**Working name:** MobileShop OS  
**Primary market:** Lahore, Pakistan  
**Document version:** 1.0  
**Prepared:** 2026-07-13

## 1. Product vision

Build one reliable operating system for a mobile shop that records and connects:

- customer demand
- product catalog
- suppliers and purchases
- IMEI/serial-level inventory
- sales, returns and exchanges
- cash, bank, receivables, payables and expenses
- warranty, used-device intake and optional repairs
- profitability and inventory performance
- reorder recommendations
- owner alerts and daily tasks

The system must answer four practical questions every day:

1. What happened in the shop?
2. Are we making or losing money?
3. What is customers' unmet demand?
4. What should we purchase next, in what quantity, and why?

## 2. Most important product decision

Start with a **deterministic retail intelligence engine**, not an AI-first system.

The reorder engine should calculate recommendations from sales velocity, missed customer demand, stockouts, lead time, margins, returns, available capital and aging stock. An LLM can later explain these numbers in simple Urdu or English, but it must not invent sales, demand, profit or purchase quantities.

## 3. Recommended build strategy

Use a **modular monolith** in one monorepo:

- Next.js PWA for the shop interface
- NestJS API for business logic
- PostgreSQL as the source of truth
- Prisma for schema and migrations
- Redis/BullMQ only when background jobs are required
- S3-compatible object storage for invoices, device photos and documents
- Docker Compose for local and production deployment

Do not begin with microservices, native mobile apps, machine learning, multi-branch complexity or full statutory accounting.

## 4. Documents in this package

1. `01_PRD.md` - product requirements
2. `02_DESIGN.md` - UX and screen design
3. `03_ARCHITECTURE.md` - technical architecture
4. `04_DATA_MODEL.md` - database model and relationships
5. `05_RULES.md` - business, data and engineering rules
6. `06_PHASES.md` - phased delivery roadmap
7. `07_MEMORY.md` - project execution memory
8. `08_CATALOG.md` - Lahore/Pakistan shop catalog
9. `09_ANALYTICS_AND_REORDERING.md` - formulas and recommendations
10. `10_TESTING_AND_RELEASE.md` - testing, security and release plan
11. `12_RESEARCH_NOTES.md` - current research basis and compliance notes

## 5. Definition of success

The first usable version is successful when the owner can:

- receive stock with IMEI or batch tracking
- complete a sale and print/share a receipt
- see current stock and stock value
- record a customer request for an unavailable item
- see daily gross profit, expenses and cash position
- see low-stock, stockout and dead-stock alerts
- receive an explainable next-purchase recommendation
- trace every stock and money change through an audit log

## 6. Scope boundary

This product is a shop operations and management-intelligence system. It should produce accountant-friendly exports but should not claim to replace a qualified accountant, tax adviser, PTA process or Punjab Police process.
