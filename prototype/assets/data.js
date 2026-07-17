/* ==========================================================================
   MobileShop OS — Prototype seed data
   Single source of truth for every screen. Read-only mock data + formatters.
   All money is whole PKR (rupees) for readability in this prototype.
   ========================================================================== */
(function () {
  "use strict";

  // ---- Shop context ------------------------------------------------------
  const SHOP = {
    name: "Al-Madina Mobiles",
    branch: "Hall Road, Lahore",
    businessDate: "14 Jul 2026",
    timezone: "Asia/Karachi",
    currency: "PKR",
    owner: "Haseeb Shahid",
    cashSession: { state: "open", openedAt: "10:12 AM", openingFloat: 20000 }
  };

  // ---- KPIs (today) ------------------------------------------------------
  const KPI = {
    salesToday: 612500,
    grossProfitToday: 71400,
    expensesToday: 9800,
    netOperatingToday: 61600,
    cashPosition: 384200,
    bankPosition: 1120000,
    inventoryValue: 8940000,
    receivables: 145000,
    payables: 620000,
    grossMarginPct: 11.7,
    salesTrendPct: +8.4,
    profitTrendPct: +3.1
  };

  // ---- Catalog: brands / models / variants -------------------------------
  // A variant is a sellable definition. Physical phones are inventory units.
  const variants = [
    { id: "V-IP17PM-256-BLK", sku: "PH-APPLE-IP17PM-256-BLK-NEW-PTA", brand: "Apple", model: "iPhone 17 Pro Max", storage: "256 GB", color: "Black", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Premium", price: 489000, avgCost: 452000, serialized: true },
    { id: "V-IP17-128-BLU", sku: "PH-APPLE-IP17-128-BLU-NEW-PTA", brand: "Apple", model: "iPhone 17", storage: "128 GB", color: "Blue", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Premium", price: 329000, avgCost: 305000, serialized: true },
    { id: "V-A55-256-NVY", sku: "PH-SAMSUNG-A55-256-NVY-NEW-PTA", brand: "Samsung", model: "Galaxy A55", storage: "256 GB", color: "Navy", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Upper-mid", price: 118000, avgCost: 104500, serialized: true },
    { id: "V-A16-128-BLK", sku: "PH-SAMSUNG-A16-128-BLK-NEW-PTA", brand: "Samsung", model: "Galaxy A16", storage: "128 GB", color: "Black", ram: "6 GB", condition: "New", pta: "PTA Approved", band: "Value", price: 52500, avgCost: 46800, serialized: true },
    { id: "V-HOT50-256-GRN", sku: "PH-INFINIX-HOT50-256-GRN-NEW-PTA", brand: "Infinix", model: "Hot 50", storage: "256 GB", color: "Green", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Value", price: 44900, avgCost: 39200, serialized: true },
    { id: "V-SPARK30-128-BLK", sku: "PH-TECNO-SPARK30-128-BLK-NEW-PTA", brand: "Tecno", model: "Spark 30", storage: "128 GB", color: "Black", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Entry", price: 33500, avgCost: 29100, serialized: true },
    { id: "V-RED14C-128-BLU", sku: "PH-XIAOMI-RED14C-128-BLU-NEW-PTA", brand: "Xiaomi", model: "Redmi 14C", storage: "128 GB", color: "Blue", ram: "6 GB", condition: "New", pta: "PTA Approved", band: "Entry", price: 31900, avgCost: 27800, serialized: true },
    { id: "V-Y29-256-CYN", sku: "PH-VIVO-Y29-256-CYN-NEW-PTA", brand: "Vivo", model: "Y29", storage: "256 GB", color: "Cyan", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Value", price: 54900, avgCost: 48600, serialized: true },
    { id: "V-A60-128-BLK", sku: "PH-OPPO-A60-128-BLK-NEW-PTA", brand: "Oppo", model: "A60", storage: "128 GB", color: "Black", ram: "8 GB", condition: "New", pta: "PTA Approved", band: "Value", price: 49900, avgCost: 44200, serialized: true },
    { id: "V-IP15-128-BLK-USED", sku: "PH-APPLE-IP15-128-BLK-USED-PTA", brand: "Apple", model: "iPhone 15", storage: "128 GB", color: "Black", ram: "6 GB", condition: "Used (Grade A)", pta: "PTA Approved", band: "Upper-mid", price: 218000, avgCost: 189000, serialized: true },
    // Non-serialized accessories (batch stock)
    { id: "V-CHG-BASEUS-20W", sku: "AC-CHARGER-BASEUS-20W-WHT", brand: "Baseus", model: "20W PD Charger", storage: "—", color: "White", ram: "—", condition: "New", pta: "—", band: "Accessory", price: 2200, avgCost: 1350, serialized: false },
    { id: "V-CBL-TYPEC-1M", sku: "AC-CABLE-UGREEN-TYPEC-1M-BLK", brand: "Ugreen", model: "USB-C Cable 1m", storage: "—", color: "Black", ram: "—", condition: "New", pta: "—", band: "Accessory", price: 900, avgCost: 420, serialized: false },
    { id: "V-PB-ANKER-20K", sku: "AC-POWERBANK-ANKER-20K-BLK", brand: "Anker", model: "PowerCore 20000", storage: "—", color: "Black", ram: "—", condition: "New", pta: "—", band: "Accessory", price: 8900, avgCost: 6100, serialized: false },
    { id: "V-EAR-JBL-T230", sku: "AC-EARBUDS-JBL-T230-BLK", brand: "JBL", model: "Tune 230NC TWS", storage: "—", color: "Black", ram: "—", condition: "New", pta: "—", band: "Accessory", price: 12900, avgCost: 9200, serialized: false },
    { id: "V-CASE-A55-CLR", sku: "AC-CASE-SPIGEN-A55-CLR", brand: "Spigen", model: "Galaxy A55 Case", storage: "—", color: "Clear", ram: "—", condition: "New", pta: "—", band: "Accessory", price: 1600, avgCost: 650, serialized: false }
  ];

  // ---- Per-variant stock rollup + performance metrics --------------------
  // available / reserved / inbound / 30d sales / unmet demand / days cover / aging
  const stock = {
    "V-IP17PM-256-BLK": { available: 2, reserved: 1, inbound: 0, sold30: 4, unmet: 6, coverDays: 12, ageDays: 8, returns: 0 },
    "V-IP17-128-BLU":   { available: 3, reserved: 0, inbound: 2, sold30: 5, unmet: 2, coverDays: 16, ageDays: 14, returns: 0 },
    "V-A55-256-NVY":    { available: 1, reserved: 0, inbound: 0, sold30: 9, unmet: 5, coverDays: 3,  ageDays: 5,  returns: 1 },
    "V-A16-128-BLK":    { available: 6, reserved: 1, inbound: 10, sold30: 22, unmet: 3, coverDays: 8, ageDays: 4, returns: 0 },
    "V-HOT50-256-GRN":  { available: 0, reserved: 0, inbound: 0, sold30: 14, unmet: 8, coverDays: 0, ageDays: 0, returns: 1 },
    "V-SPARK30-128-BLK":{ available: 4, reserved: 0, inbound: 0, sold30: 11, unmet: 2, coverDays: 11, ageDays: 6, returns: 0 },
    "V-RED14C-128-BLU": { available: 7, reserved: 0, inbound: 0, sold30: 13, unmet: 1, coverDays: 16, ageDays: 9, returns: 0 },
    "V-Y29-256-CYN":    { available: 3, reserved: 1, inbound: 0, sold30: 7, unmet: 4, coverDays: 13, ageDays: 7, returns: 0 },
    "V-A60-128-BLK":    { available: 2, reserved: 0, inbound: 0, sold30: 6, unmet: 2, coverDays: 10, ageDays: 22, returns: 1 },
    "V-IP15-128-BLK-USED": { available: 1, reserved: 0, inbound: 0, sold30: 2, unmet: 3, coverDays: 15, ageDays: 41, returns: 0 },
    "V-CHG-BASEUS-20W": { available: 34, reserved: 0, inbound: 0, sold30: 61, unmet: 0, coverDays: 17, ageDays: 12, returns: 2 },
    "V-CBL-TYPEC-1M":   { available: 88, reserved: 0, inbound: 0, sold30: 120, unmet: 0, coverDays: 22, ageDays: 10, returns: 1 },
    "V-PB-ANKER-20K":   { available: 5, reserved: 0, inbound: 0, sold30: 8, unmet: 1, coverDays: 19, ageDays: 30, returns: 0 },
    "V-EAR-JBL-T230":   { available: 9, reserved: 0, inbound: 0, sold30: 12, unmet: 2, coverDays: 22, ageDays: 18, returns: 1 },
    "V-CASE-A55-CLR":   { available: 3, reserved: 0, inbound: 0, sold30: 18, unmet: 4, coverDays: 5, ageDays: 3, returns: 0 }
  };

  // ---- Serialized inventory units (IMEI-level) ---------------------------
  const units = [
    { id: "INV-1042", variantId: "V-IP17PM-256-BLK", imei1: "352094561230417", imei2: "352094561230418", serial: "F2LXPQ9ABC", state: "available", location: "Store — Display", pta: "PTA Approved", ptaVerifiedAt: "12 Jul 2026", cost: 452000, list: 489000, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "12 Jul 2026", source: "PO-2041 · TechSource Intl", risk: [] },
    { id: "INV-1043", variantId: "V-IP17PM-256-BLK", imei1: "352094561230511", imei2: "352094561230512", serial: "F2LXPQ9DEF", state: "available", location: "Store — Safe", pta: "PTA Approved", ptaVerifiedAt: "12 Jul 2026", cost: 452000, list: 489000, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "12 Jul 2026", source: "PO-2041 · TechSource Intl", risk: [] },
    { id: "INV-1044", variantId: "V-IP17PM-256-BLK", imei1: "352094561230777", imei2: "352094561230778", serial: "F2LXPQ9GHI", state: "reserved", location: "Store — Safe", pta: "PTA Approved", ptaVerifiedAt: "12 Jul 2026", cost: 452000, list: 489000, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "12 Jul 2026", source: "PO-2041 · TechSource Intl", risk: [] },
    { id: "INV-1051", variantId: "V-A55-256-NVY", imei1: "356789012345671", imei2: "356789012345672", serial: "RZ8W12ABCD", state: "available", location: "Store — Counter", pta: "PTA Approved", ptaVerifiedAt: "11 Jul 2026", cost: 104500, list: 118000, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "10 Jul 2026", source: "PO-2039 · Galaxy Distributors", risk: [] },
    { id: "INV-1061", variantId: "V-A16-128-BLK", imei1: "354001234567891", imei2: "354001234567892", serial: "R9AW56XYZ0", state: "available", location: "Store — Counter", pta: "PTA Approved", ptaVerifiedAt: "09 Jul 2026", cost: 46800, list: 52500, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "08 Jul 2026", source: "PO-2039 · Galaxy Distributors", risk: [] },
    { id: "INV-1090", variantId: "V-IP15-128-BLK-USED", imei1: "353012786541239", imei2: "", serial: "DX3G7788UZ", state: "pending_verification", location: "Intake — Quarantine", pta: "PTA Approved", ptaVerifiedAt: "", cost: 189000, list: 218000, battery: "88%", grade: "Grade A", warranty: "Shop 7-day", acquired: "13 Jul 2026", source: "Used intake UDI-311", risk: ["Police e-Gadget check pending", "Battery health below 90%"] },
    { id: "INV-1032", variantId: "V-HOT50-256-GRN", imei1: "358900112233445", imei2: "358900112233446", serial: "IX50GRN0091", state: "sold", location: "—", pta: "PTA Approved", ptaVerifiedAt: "01 Jul 2026", cost: 39200, list: 44900, battery: "100%", grade: "New", warranty: "Official 1 yr", acquired: "28 Jun 2026", source: "PO-2033 · Infinix Wholesale", risk: [] }
  ];

  // ---- Sales (posted) ----------------------------------------------------
  const sales = [
    { id: "INV-2026-0714", time: "Today · 03:42 PM", customer: "Walk-in", salesperson: "Bilal", items: [{ name: "Samsung Galaxy A55 256GB Navy", imei: "356789012345671", qty: 1, price: 118000 }, { name: "Spigen A55 Case Clear", qty: 1, price: 1600 }], subtotal: 119600, discount: 1600, total: 118000, cogs: 105150, profit: 12850, method: "Cash", status: "Posted" },
    { id: "INV-2026-0713", time: "Today · 02:15 PM", customer: "Imran Yousaf", salesperson: "Bilal", items: [{ name: "Infinix Hot 50 256GB Green", imei: "358900112233445", qty: 1, price: 44900 }], subtotal: 44900, discount: 0, total: 44900, cogs: 39200, profit: 5700, method: "JazzCash", status: "Posted" },
    { id: "INV-2026-0712", time: "Today · 12:50 PM", customer: "Walk-in", salesperson: "Owner", items: [{ name: "Ugreen USB-C Cable 1m", qty: 2, price: 900 }, { name: "Baseus 20W Charger", qty: 1, price: 2200 }], subtotal: 4000, discount: 200, total: 3800, cogs: 2190, profit: 1610, method: "Cash", status: "Posted" },
    { id: "INV-2026-0711", time: "Today · 11:30 AM", customer: "Sana Malik", salesperson: "Bilal", items: [{ name: "Redmi 14C 128GB Blue", imei: "351114455667788", qty: 1, price: 31900 }, { name: "JBL Tune 230NC TWS", qty: 1, price: 12900 }], subtotal: 44800, discount: 900, total: 43900, cogs: 37000, profit: 6900, method: "Card", status: "Posted" },
    { id: "INV-2026-0710", time: "Today · 10:48 AM", customer: "Walk-in", salesperson: "Owner", items: [{ name: "iPhone 17 Pro Max 256GB Black", imei: "352094561230300", qty: 1, price: 489000 }], subtotal: 489000, discount: 4000, total: 485000, cogs: 452000, profit: 33000, method: "Bank Transfer", status: "Posted" },
    { id: "INV-2026-0702", time: "Yesterday · 05:20 PM", customer: "Ahsan Raza", salesperson: "Bilal", items: [{ name: "Tecno Spark 30 128GB Black", imei: "357700998877665", qty: 1, price: 33500 }], subtotal: 33500, discount: 0, total: 33500, cogs: 29100, profit: 4400, method: "Cash", status: "Posted" }
  ];

  // ---- Customer demand / missed sales ------------------------------------
  const demand = [
    { id: "DM-5012", date: "Today · 03:10 PM", customer: "Faizan (0301-2233445)", request: "Infinix Hot 50 256GB", variantId: "V-HOT50-256-GRN", budget: "40k–46k", pta: "PTA only", qty: 1, urgency: "High", outcome: "Unavailable — out of stock", available: false, followUp: "14 Jul 2026", channel: "Walk-in", note: "Wants green, ready to buy today" },
    { id: "DM-5011", date: "Today · 01:22 PM", customer: "Walk-in (anonymous)", request: "iPhone 17 Pro Max 256 Black", variantId: "V-IP17PM-256-BLK", budget: "480k–500k", pta: "PTA only", qty: 1, urgency: "Medium", outcome: "Reserved", available: true, followUp: "15 Jul 2026", channel: "Walk-in", note: "Reserved INV-1044, pickup Tue" },
    { id: "DM-5010", date: "Today · 12:05 PM", customer: "Nadia (0333-9988776)", request: "Samsung Galaxy A55 256GB", variantId: "V-A55-256-NVY", budget: "110k–120k", pta: "PTA only", qty: 1, urgency: "Medium", outcome: "Quotation sent", available: true, followUp: "16 Jul 2026", channel: "WhatsApp", note: "Comparing with Vivo Y29" },
    { id: "DM-5009", date: "Yesterday · 06:40 PM", customer: "Walk-in (anonymous)", request: "iPhone 16 Pro 256 (any color)", variantId: null, budget: "up to 380k", pta: "PTA only", qty: 1, urgency: "Low", outcome: "Unavailable — not in catalog", available: false, followUp: "—", channel: "Walk-in", note: "Older model, source on demand" },
    { id: "DM-5008", date: "Yesterday · 04:12 PM", customer: "Kamran (0300-1112223)", request: "Infinix Hot 50 256GB", variantId: "V-HOT50-256-GRN", budget: "42k", pta: "PTA only", qty: 2, urgency: "High", outcome: "Unavailable — out of stock", available: false, followUp: "14 Jul 2026", channel: "Phone", note: "Needs 2 units for gift" },
    { id: "DM-5007", date: "Yesterday · 11:50 AM", customer: "Walk-in (anonymous)", request: "Redmi 14C cheaper price", variantId: "V-RED14C-128-BLU", budget: "under 29k", pta: "PTA only", qty: 1, urgency: "Low", outcome: "Price too high — bought elsewhere", available: true, followUp: "—", channel: "Walk-in", note: "Price objection" }
  ];

  // ---- Suppliers ---------------------------------------------------------
  const suppliers = [
    { id: "SUP-01", name: "TechSource Intl", contact: "Rana Waqas · 0321-4455667", terms: "30-day credit", leadTime: 5, onTime: 92, payable: 452000, rating: "A", brands: "Apple, Samsung" },
    { id: "SUP-02", name: "Galaxy Distributors", contact: "Sheikh Adnan · 0300-7788990", terms: "15-day credit", leadTime: 3, onTime: 88, payable: 168000, rating: "A", brands: "Samsung, Oppo" },
    { id: "SUP-03", name: "Infinix Wholesale", contact: "Malik Tariq · 0345-1122334", terms: "Cash on delivery", leadTime: 4, onTime: 74, payable: 0, rating: "B", brands: "Infinix, Tecno, itel" },
    { id: "SUP-04", name: "AccessoryHub Lahore", contact: "Junaid · 0311-5566778", terms: "7-day credit", leadTime: 2, onTime: 96, payable: 0, rating: "A", brands: "Accessories" }
  ];

  // ---- Purchase orders ---------------------------------------------------
  const purchaseOrders = [
    { id: "PO-2041", supplier: "TechSource Intl", date: "12 Jul 2026", status: "received", lines: 3, units: 3, total: 1356000, received: 3, note: "iPhone 17 Pro Max batch" },
    { id: "PO-2042", supplier: "Infinix Wholesale", date: "13 Jul 2026", status: "ordered", lines: 2, units: 12, total: 470400, received: 0, note: "Hot 50 restock (stockout)" },
    { id: "PO-2043", supplier: "Galaxy Distributors", date: "13 Jul 2026", status: "partially_received", lines: 2, units: 12, total: 561600, received: 2, note: "Galaxy A16 + A55" },
    { id: "PO-2044", supplier: "AccessoryHub Lahore", date: "11 Jul 2026", status: "approved", lines: 4, units: 150, total: 118500, received: 0, note: "Cables, cases, chargers" },
    { id: "PO-2045", supplier: "TechSource Intl", date: "13 Jul 2026", status: "draft", lines: 1, units: 3, total: 1467000, received: 0, note: "Draft from reorder recommendation R-08" }
  ];

  // ---- Reorder recommendations (deterministic engine output) -------------
  const recommendations = [
    { id: "R-01", variantId: "V-HOT50-256-GRN", qty: 12, cost: 470400, expProfit: 68400, roi: 14.5, score: 91, confidence: "High", confPct: 88, supplier: "Infinix Wholesale", daysCover: 0,
      reasons: ["Sold 14 units in last 30 days", "8 qualified requests recorded while out of stock", "Currently 0 days of cover (stockout)", "Supplier delivers in ~4 days", "Expected gross margin 12.7%"],
      risks: ["Supplier on-time rate is 74%"] },
    { id: "R-02", variantId: "V-A55-256-NVY", qty: 6, cost: 627000, expProfit: 81000, roi: 12.9, score: 84, confidence: "High", confPct: 81, supplier: "Galaxy Distributors", daysCover: 3,
      reasons: ["Sold 9 units in last 30 days", "5 qualified requests while low", "Only 3 days of cover remaining", "Reliable supplier, 3-day lead"],
      risks: [] },
    { id: "R-03", variantId: "V-A16-128-BLK", qty: 10, cost: 468000, expProfit: 57000, roi: 12.2, score: 79, confidence: "High", confPct: 84, supplier: "Galaxy Distributors", daysCover: 8,
      reasons: ["Fastest mover: 22 units in 30 days", "Strong accessory attachment rate", "10 units already inbound on PO-2043"],
      risks: ["Inbound stock already covers part of demand"] },
    { id: "R-04", variantId: "V-CASE-A55-CLR", qty: 40, cost: 26000, expProfit: 38000, roi: 146, score: 76, confidence: "High", confPct: 90, supplier: "AccessoryHub Lahore", daysCover: 5,
      reasons: ["High attachment to A55 sales", "18 sold in 30 days, 4 unmet", "Very high return on investment"],
      risks: [] },
    { id: "R-05", variantId: "V-Y29-256-CYN", qty: 4, cost: 194400, expProfit: 25200, roi: 13.0, score: 64, confidence: "Medium", confPct: 61, supplier: "Galaxy Distributors", daysCover: 13,
      reasons: ["Steady demand, 7 sold in 30 days", "4 unmet requests", "Healthy 13-day cover"],
      risks: ["Color preference uncertain across requests"] },
    { id: "R-06", variantId: "V-IP17PM-256-BLK", qty: 3, cost: 1356000, expProfit: 111000, roi: 8.2, score: 58, confidence: "Medium", confPct: 55, supplier: "TechSource Intl", daysCover: 12,
      reasons: ["6 qualified premium requests recorded", "Sold 4 in 30 days at strong margin"],
      risks: ["High capital lock-up per unit", "Quantity capped at 3: premium, medium confidence"] },
    { id: "R-07", variantId: "V-PB-ANKER-20K", qty: 6, cost: 36600, expProfit: 16800, roi: 45.9, score: 41, confidence: "Low", confPct: 44, supplier: "AccessoryHub Lahore", daysCover: 19,
      reasons: ["Sparse data — only 8 sold in 30 days", "Stock already aging at 30 days"],
      risks: ["Low data confidence — use a test quantity", "Aged stock present in same family"] }
  ];

  // Budget panel for the intelligence screen
  const budget = { total: 2500000, liquidityBuffer: 300000, selected: 1591400, expectedReturn: 214800, cashRemaining: 908600 };

  // ---- Customers ---------------------------------------------------------
  const customers = [
    { id: "C-201", name: "Imran Yousaf", phone: "0301-4567890", purchases: 4, spend: 178400, lastVisit: "Today", credit: 0, consent: "Yes" },
    { id: "C-202", name: "Sana Malik", phone: "0333-1234567", purchases: 2, spend: 88700, lastVisit: "Today", credit: 0, consent: "Yes" },
    { id: "C-203", name: "Ahsan Raza", phone: "0300-7654321", purchases: 6, spend: 341000, lastVisit: "Yesterday", credit: 45000, consent: "Yes" },
    { id: "C-204", name: "Nadia Kamal", phone: "0333-9988776", purchases: 1, spend: 0, lastVisit: "Today", credit: 0, consent: "Pending" },
    { id: "C-205", name: "Kamran Ali", phone: "0300-1112223", purchases: 3, spend: 132000, lastVisit: "Yesterday", credit: 100000, consent: "Yes" }
  ];

  // ---- Returns / warranty ------------------------------------------------
  const returns = [
    { id: "RTN-091", sale: "INV-2026-0688", item: "Baseus 20W Charger", imei: "—", reason: "Not charging (DOA)", condition: "Faulty", outcome: "Supplier warranty", status: "In progress", date: "Today" },
    { id: "RTN-090", sale: "INV-2026-0671", item: "Samsung Galaxy A55 256GB", imei: "356789012340021", reason: "Customer changed mind", condition: "Like new", outcome: "Restock after inspection", status: "Inspection", date: "Yesterday" },
    { id: "WAR-044", sale: "INV-2026-0590", item: "iPhone 15 128GB", imei: "353012700011223", reason: "Battery draining fast", condition: "Used", outcome: "Customer warranty claim", status: "Open", date: "2 days ago" }
  ];

  // ---- Repairs -----------------------------------------------------------
  const repairs = [
    { id: "REP-018", device: "Galaxy A16 128GB", imei: "354001299887766", issue: "Cracked screen", technician: "Usman", stage: "In repair", parts: "A16 display assembly", promised: "14 Jul 2026", cost: 8500 },
    { id: "REP-017", device: "iPhone 14 128GB", imei: "353900112230011", issue: "Charging port", technician: "Usman", stage: "Awaiting parts", parts: "Lightning flex", promised: "16 Jul 2026", cost: 6500 },
    { id: "REP-016", device: "Redmi 12 128GB", imei: "351100223344551", issue: "Software / setup", technician: "Bilal", stage: "Ready", parts: "—", promised: "13 Jul 2026", cost: 1500 }
  ];

  // ---- Used-device intakes ----------------------------------------------
  const usedIntakes = [
    { id: "UDI-311", device: "iPhone 15 128GB Black", seller: "Waleed Ahmed", cnic: "35202-•••••••-1", imei: "353012786541239", quoted: 195000, approved: 189000, resale: 218000, battery: "88%", grade: "Grade A",
      gates: [ { name: "Seller identity + consent", ok: true }, { name: "IMEI / PTA verification", ok: true }, { name: "Police e-Gadget reference", ok: false }, { name: "Physical inspection checklist", ok: true }, { name: "Battery health ≥ threshold", ok: false } ],
      status: "Quarantined" },
    { id: "UDI-310", device: "Samsung S23 256GB", seller: "Hassan Iqbal", cnic: "35201-•••••••-7", imei: "356701122334455", quoted: 165000, approved: 158000, resale: 182000, battery: "94%", grade: "Grade A",
      gates: [ { name: "Seller identity + consent", ok: true }, { name: "IMEI / PTA verification", ok: true }, { name: "Police e-Gadget reference", ok: true }, { name: "Physical inspection checklist", ok: true }, { name: "Battery health ≥ threshold", ok: true } ],
      status: "Cleared — saleable" }
  ];

  // ---- Finance -----------------------------------------------------------
  const finance = {
    pnl: {
      salesRevenue: 612500, discounts: 10700, returns: 2200, netSales: 599600,
      cogs: 528200, grossProfit: 71400, grossMarginPct: 11.9,
      operatingExpenses: 9800, netOperating: 61600
    },
    cash: { opening: 20000, cashSales: 121800, cashRefunds: 0, expensesFromDrawer: 4800, deposited: 0, expectedClosing: 137000, counted: 0, variance: null },
    expenses: [
      { id: "EXP-071", category: "Shop rent (daily accrual)", amount: 4000, source: "Bank", date: "Today", note: "Monthly rent / 30" },
      { id: "EXP-072", category: "Electricity", amount: 2800, source: "Cash", date: "Today", note: "WAPDA bill share" },
      { id: "EXP-073", category: "Staff tea / misc", amount: 800, source: "Cash", date: "Today", note: "" },
      { id: "EXP-074", category: "Packaging / bags", amount: 1200, source: "Cash", date: "Today", note: "Carry bags restock" },
      { id: "EXP-075", category: "Internet / DSL", amount: 1000, source: "Bank", date: "Today", note: "Monthly / 30" }
    ]
  };

  // ---- Tasks / follow-ups ------------------------------------------------
  const tasks = [
    { id: "T-01", title: "Restock Infinix Hot 50 — 8 customers waiting", type: "Reorder", due: "Today", priority: "High", link: "intelligence.html" },
    { id: "T-02", title: "Follow up Faizan (0301-2233445) — Hot 50 arrival", type: "Follow-up", due: "14 Jul", priority: "High", link: "demand.html" },
    { id: "T-03", title: "Complete Police e-Gadget check for UDI-311", type: "Used intake", due: "Today", priority: "High", link: "used-intake.html" },
    { id: "T-04", title: "Reservation INV-1044 expires — pickup Tue", type: "Reservation", due: "15 Jul", priority: "Medium", link: "inventory.html" },
    { id: "T-05", title: "Supplier payment due — TechSource (Rs 452,000)", type: "Payable", due: "16 Jul", priority: "Medium", link: "finance.html" },
    { id: "T-06", title: "Approve draft PO-2045 (3× iPhone 17 Pro Max)", type: "Purchase", due: "Today", priority: "Medium", link: "purchases.html" }
  ];

  // ---- Owner attention cards (dashboard) ---------------------------------
  const attention = [
    { rank: 1, title: "Out of stock with active demand", detail: "Infinix Hot 50 256GB — 8 qualified requests", severity: "critical", link: "intelligence.html" },
    { rank: 2, title: "Reorder recommendations awaiting approval", detail: "7 recommendations · Rs 1.59M selected", severity: "attention", link: "intelligence.html" },
    { rank: 3, title: "High-value aged stock", detail: "iPhone 15 (used) — 41 days in stock", severity: "attention", link: "inventory.html" },
    { rank: 4, title: "Used device pending verification", detail: "UDI-311 — Police e-Gadget check pending", severity: "critical", link: "used-intake.html" },
    { rank: 5, title: "Supplier orders in transit", detail: "PO-2042 Hot 50 — ordered, ~4 days", severity: "info", link: "purchases.html" },
    { rank: 6, title: "Payables due this week", detail: "TechSource Rs 452,000 · Galaxy Rs 168,000", severity: "attention", link: "finance.html" },
    { rank: 7, title: "Returns / warranty pending", detail: "2 returns in inspection · 1 warranty open", severity: "info", link: "returns.html" }
  ];

  // ---- Notifications -----------------------------------------------------
  const notifications = [
    { icon: "alert", text: "Infinix Hot 50 is out of stock with 8 waiting customers", time: "10m ago" },
    { icon: "box", text: "PO-2043 partially received (2 of 12 units)", time: "1h ago" },
    { icon: "money", text: "Supplier payment to TechSource due in 3 days", time: "2h ago" },
    { icon: "shield", text: "UDI-311 blocked from sale — verification incomplete", time: "3h ago" }
  ];

  // ---- Reports catalogue -------------------------------------------------
  const reports = [
    { name: "Daily sales & profit", group: "Sales", desc: "Revenue, discounts, COGS and gross profit for the day." },
    { name: "Sales by product / brand", group: "Sales", desc: "Ranked by units and profit across category and price band." },
    { name: "Gross margin by product", group: "Sales", desc: "Where the profit actually comes from." },
    { name: "Inventory valuation", group: "Inventory", desc: "Current stock value at recorded cost." },
    { name: "Inventory aging", group: "Inventory", desc: "Capital tied up by days-in-stock buckets." },
    { name: "Stock movement ledger", group: "Inventory", desc: "Every quantity change with reason and audit link." },
    { name: "Stockout & lost sales", group: "Demand", desc: "Where demand was missed and why." },
    { name: "Customer demand report", group: "Demand", desc: "Requested variants, budgets and conversion." },
    { name: "Reorder recommendations", group: "Intelligence", desc: "What to buy next, quantity, cost and reasons." },
    { name: "Cash flow", group: "Finance", desc: "Cash in and out, separated from profit." },
    { name: "Receivables / payables", group: "Finance", desc: "Who owes the shop and who the shop owes." },
    { name: "Returns & warranty", group: "Service", desc: "Return reasons, outcomes and defect rate." },
    { name: "Audit report", group: "System", desc: "Immutable trail of every critical action." }
  ];

  // ---- Audit sample (for unit / product detail) --------------------------
  const audit = [
    { time: "Today · 03:42 PM", actor: "Bilal", action: "Sale posted", entity: "INV-2026-0714", detail: "A55 removed from available; Rs 118,000 revenue" },
    { time: "Today · 11:20 AM", actor: "Owner", action: "PO approved", entity: "PO-2042", detail: "Hot 50 restock, 12 units" },
    { time: "Today · 09:30 AM", actor: "Owner", action: "Cash session opened", entity: "CS-0714", detail: "Opening float Rs 20,000" },
    { time: "Yesterday · 06:10 PM", actor: "Bilal", action: "Demand recorded", entity: "DM-5008", detail: "Hot 50 ×2 unavailable" }
  ];

  // ---- Formatters --------------------------------------------------------
  const fmt = {
    pkr(n) {
      if (n === null || n === undefined || isNaN(n)) return "—";
      const sign = n < 0 ? "-" : "";
      return sign + "Rs " + Math.abs(Math.round(n)).toLocaleString("en-PK");
    },
    pkrShort(n) {
      const a = Math.abs(n);
      if (a >= 1e7) return "Rs " + (n / 1e7).toFixed(2) + " Cr";
      if (a >= 1e5) return "Rs " + (n / 1e5).toFixed(2) + " Lac";
      if (a >= 1e3) return "Rs " + (n / 1e3).toFixed(0) + "k";
      return "Rs " + n;
    },
    num(n) { return Number(n).toLocaleString("en-PK"); },
    pct(n) { return (n > 0 ? "+" : "") + n + "%"; },
    variant(id) { return variants.find(v => v.id === id) || null; },
    variantName(id) { const v = variants.find(x => x.id === id); return v ? (v.brand + " " + v.model + (v.storage !== "—" ? " " + v.storage : "") + (v.color !== "—" ? " " + v.color : "")) : "Unknown"; }
  };

  // ---- Expose ------------------------------------------------------------
  window.DB = {
    SHOP, KPI, variants, stock, units, sales, demand, suppliers,
    purchaseOrders, recommendations, budget, customers, returns, repairs,
    usedIntakes, finance, tasks, attention, notifications, reports, audit
  };
  window.fmt = fmt;
})();
