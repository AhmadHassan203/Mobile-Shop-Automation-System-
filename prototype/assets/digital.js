/* ==========================================================================
   MobileShop OS — Digital Services prototype state + calculations
   Manual records only. No provider APIs are called from this prototype.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "msos-digital-services-v1";
  var SERVICES = ["JazzCash", "Easypaisa", "Bank Transfer", "Utility Bill", "Jazz Load", "Zong Load", "Other"];
  var DIRECTIONS = { SENT: "SENT_FROM_SHOP", RECEIVED: "RECEIVED_INTO_SHOP" };
  var STATUSES = ["SUCCESSFUL", "PENDING", "FAILED", "REVERSED", "DISPUTED"];
  var BALANCE_KEYS = {
    "JazzCash": "jazzCashFloat",
    "Easypaisa": "easypaisaFloat",
    "Bank Transfer": "bankBalance",
    "Utility Bill": "utilityBillFloat",
    "Jazz Load": "jazzLoadFloat",
    "Zong Load": "zongLoadFloat",
    "Other": "bankBalance"
  };
  var LOW_THRESHOLDS = {
    physicalCash: 50000,
    jazzCashFloat: 25000,
    easypaisaFloat: 25000,
    bankBalance: 50000,
    utilityBillFloat: 25000,
    jazzLoadFloat: 10000,
    zongLoadFloat: 10000
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function nowIso() { return new Date().toISOString(); }
  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.round(v) : 0; }
  function signed(n) { return n >= 0 ? n : n; }
  function pkr(n) { return window.fmt ? fmt.pkr(n) : ("Rs " + Math.round(n || 0).toLocaleString("en-PK")); }
  function dateText(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return iso; }
  }

  function defaultBalances() {
    return {
      physicalCash: 0,
      jazzCashFloat: 200000,
      easypaisaFloat: 200000,
      bankBalance: 300000,
      jazzLoadFloat: 50000,
      zongLoadFloat: 50000,
      utilityBillFloat: 100000
    };
  }

  function rule(service, direction, method, opts) {
    opts = opts || {};
    return {
      service: service,
      direction: direction,
      calculationMethod: method,
      blockSize: opts.blockSize || 0,
      feePerBlock: opts.feePerBlock || 0,
      ratePct: opts.ratePct || 0,
      flatFee: opts.flatFee || 0,
      minimumFee: opts.minimumFee || 0,
      maximumFee: opts.maximumFee || null,
      active: opts.active !== false
    };
  }

  function defaultRules() {
    var rules = [];
    ["JazzCash", "Easypaisa", "Bank Transfer"].forEach(function (s) {
      rules.push(rule(s, DIRECTIONS.SENT, "SLAB", { blockSize: 1000, feePerBlock: 10, minimumFee: 10 }));
      rules.push(rule(s, DIRECTIONS.RECEIVED, "SLAB", { blockSize: 1000, feePerBlock: 20, minimumFee: 20 }));
    });
    ["Utility Bill", "Jazz Load", "Zong Load", "Other"].forEach(function (s) {
      rules.push(rule(s, DIRECTIONS.SENT, "FLAT", { flatFee: s === "Utility Bill" ? 50 : 0 }));
      rules.push(rule(s, DIRECTIONS.RECEIVED, "FLAT", { flatFee: 0 }));
    });
    return rules;
  }

  function calcFee(amount, r) {
    amount = num(amount);
    if (!amount || !r || r.active === false) return 0;
    var fee = 0;
    if (r.calculationMethod === "SLAB") fee = Math.ceil(amount / (r.blockSize || 1000)) * (r.feePerBlock || 0);
    else if (r.calculationMethod === "PROPORTIONAL") fee = amount * ((r.ratePct || 0) / 100);
    else if (r.calculationMethod === "FLAT") fee = r.flatFee || 0;
    else fee = 0;
    if (r.minimumFee) fee = Math.max(fee, r.minimumFee);
    if (r.maximumFee !== null && r.maximumFee !== undefined) fee = Math.min(fee, r.maximumFee);
    return Math.round(fee);
  }

  function defaultState() {
    return {
      version: 1,
      seeded: false,
      nextSeq: 1006,
      digitalServiceTransactions: [],
      digitalServiceFeeRules: defaultRules(),
      digitalServiceOpeningBalances: defaultBalances(),
      digitalServiceBalances: defaultBalances(),
      digitalServiceReconciliations: []
    };
  }

  function findRule(state, service, direction) {
    return (state.digitalServiceFeeRules || []).find(function (r) {
      return r.service === service && r.direction === direction && r.active !== false;
    }) || rule(service, direction, "NONE");
  }

  function feeSnapshot(r) {
    return {
      calculationMethod: r.calculationMethod || "NONE",
      blockSize: r.blockSize || 0,
      feePerBlock: r.feePerBlock || 0,
      flatFee: r.flatFee || 0,
      ratePct: r.ratePct || 0,
      minimumFee: r.minimumFee || 0,
      maximumFee: r.maximumFee === undefined ? null : r.maximumFee
    };
  }

  function calculate(input, state) {
    input = input || {};
    state = state || load();
    var principal = num(input.principalAmount);
    var service = input.service || "JazzCash";
    var direction = input.direction || DIRECTIONS.SENT;
    var status = input.status || "SUCCESSFUL";
    var feeMethod = input.feeCollectionMethod || "Deduct from Customer Payout";
    var grossCommission = num(input.providerGrossCommission);
    var commissionTax = Math.min(num(input.providerCommissionTax), grossCommission);
    var otherCharges = num(input.otherDirectCharges);
    var r = findRule(state, service, direction);
    var fee = calcFee(principal, r);
    var providerNetCommission = grossCommission - commissionTax;
    var grossServiceEarnings = fee + grossCommission;
    var netServiceEarnings = fee + providerNetCommission - otherCharges;
    var settled = status === "SUCCESSFUL";
    var out = {
      principalAmount: principal,
      feeRuleSnapshot: feeSnapshot(r),
      customerServiceFee: fee,
      providerGrossCommission: grossCommission,
      providerCommissionTax: commissionTax,
      providerNetCommission: providerNetCommission,
      otherDirectCharges: otherCharges,
      grossServiceEarnings: grossServiceEarnings,
      netServiceEarnings: netServiceEarnings,
      customerCashPaid: 0,
      customerCashReceived: 0,
      customerPayout: 0,
      physicalCashIn: 0,
      physicalCashOut: 0,
      providerFloatIn: 0,
      providerFloatOut: 0
    };
    if (direction === DIRECTIONS.SENT) {
      out.customerCashPaid = principal + fee;
      if (settled) {
        out.physicalCashIn = principal + fee;
        out.providerFloatOut = principal;
      }
    } else {
      out.feeCollectionMethod = feeMethod;
      if (feeMethod === "Collect Separately") {
        out.customerPayout = principal;
        out.customerCashReceived = fee;
        if (settled) { out.physicalCashIn = fee; out.physicalCashOut = principal; out.providerFloatIn = principal; }
      } else {
        out.customerPayout = Math.max(0, principal - fee);
        if (settled) { out.physicalCashOut = out.customerPayout; out.providerFloatIn = principal; }
      }
    }
    if (!settled) {
      out.grossServiceEarnings = 0;
      out.netServiceEarnings = 0;
    }
    return out;
  }

  function migrate(raw) {
    var s = raw || defaultState();
    var d = defaultState();
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined || s[k] === null) s[k] = clone(d[k]);
    });
    Object.keys(d.digitalServiceOpeningBalances).forEach(function (k) {
      if (s.digitalServiceOpeningBalances[k] === undefined) s.digitalServiceOpeningBalances[k] = d.digitalServiceOpeningBalances[k];
      if (s.digitalServiceBalances[k] === undefined) s.digitalServiceBalances[k] = s.digitalServiceOpeningBalances[k];
    });
    if (!Array.isArray(s.digitalServiceFeeRules) || !s.digitalServiceFeeRules.length) s.digitalServiceFeeRules = defaultRules();
    if (!Array.isArray(s.digitalServiceTransactions)) s.digitalServiceTransactions = [];
    if (!Array.isArray(s.digitalServiceReconciliations)) s.digitalServiceReconciliations = [];
    return s;
  }

  function seedIfNeeded(s) {
    if (s.seeded) return s;
    var samples = [
      { id: "DST-1001", service: "JazzCash", direction: DIRECTIONS.SENT, principalAmount: 10000, providerTransactionId: "JC-EXT-1001", status: "SUCCESSFUL", customerName: "Walk-in", customerPhone: "0301-1112233" },
      { id: "DST-1002", service: "Easypaisa", direction: DIRECTIONS.RECEIVED, principalAmount: 5000, feeCollectionMethod: "Deduct from Customer Payout", providerTransactionId: "EP-EXT-1002", status: "SUCCESSFUL", customerName: "Ayesha", customerPhone: "0345-2223344" },
      { id: "DST-1003", service: "Utility Bill", subService: "Electricity", billType: "Electricity", billCompany: "LESCO", consumerReference: "LESCO-998877", direction: DIRECTIONS.SENT, principalAmount: 8500, providerTransactionId: "LESCO-EXT-1003", status: "SUCCESSFUL", customerReference: "LESCO-998877" },
      { id: "DST-1004", service: "Jazz Load", network: "Jazz", packageName: "Standard load", direction: DIRECTIONS.SENT, principalAmount: 1000, providerGrossCommission: 14, providerTransactionId: "JL-EXT-1004", status: "SUCCESSFUL", customerPhone: "0300-4455667" },
      { id: "DST-1005", service: "Bank Transfer", bankName: "HBL", beneficiaryName: "Usman Ali", accountReference: "PK**7788", direction: DIRECTIONS.SENT, principalAmount: 25000, providerTransactionId: "", status: "PENDING", customerName: "Usman Ali" }
    ];
    samples.forEach(function (x) { s.digitalServiceTransactions.push(buildTransaction(x, s, x.id)); });
    s.seeded = true;
    s.nextSeq = Math.max(s.nextSeq || 0, 1006);
    recomputeBalances(s);
    return s;
  }

  function buildTransaction(input, state, forcedId) {
    var calc = calculate(input, state);
    var createdAt = input.createdAt || nowIso();
    return Object.assign({
      id: forcedId || ("DST-" + String(state.nextSeq++).padStart(4, "0")),
      service: input.service || "JazzCash",
      subService: input.subService || "",
      direction: input.direction || DIRECTIONS.SENT,
      feeCollectionMethod: input.feeCollectionMethod || "Deduct from Customer Payout",
      customerName: input.customerName || "",
      customerPhone: input.customerPhone || "",
      customerReference: input.customerReference || "",
      billType: input.billType || "",
      billCompany: input.billCompany || "",
      consumerReference: input.consumerReference || "",
      bankName: input.bankName || "",
      beneficiaryName: input.beneficiaryName || "",
      accountReference: input.accountReference || "",
      network: input.network || "",
      packageName: input.packageName || "",
      providerTransactionId: input.providerTransactionId || "",
      externalTransactionAt: input.externalTransactionAt || createdAt,
      status: input.status || "SUCCESSFUL",
      notes: input.notes || "",
      cashierName: input.cashierName || ((window.DB && DB.SHOP && DB.SHOP.owner) || "Cashier"),
      createdAt: createdAt,
      reversalOfTransactionId: input.reversalOfTransactionId || ""
    }, calc);
  }

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    s = seedIfNeeded(migrate(s));
    save(s);
    return s;
  }

  function save(s) {
    recomputeBalances(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  function recomputeBalances(s) {
    var b = clone(s.digitalServiceOpeningBalances || defaultBalances());
    (s.digitalServiceTransactions || []).forEach(function (t) {
      b.physicalCash += (t.physicalCashIn || 0) - (t.physicalCashOut || 0);
      var key = BALANCE_KEYS[t.service] || "bankBalance";
      b[key] += (t.providerFloatIn || 0) - (t.providerFloatOut || 0);
    });
    s.digitalServiceBalances = b;
    return b;
  }

  function addTransaction(input) {
    var s = load();
    var tx = buildTransaction(input, s);
    s.digitalServiceTransactions.unshift(tx);
    save(s);
    return tx;
  }

  function updateStatus(id, status, extra) {
    var s = load();
    var tx = s.digitalServiceTransactions.find(function (t) { return t.id === id; });
    if (!tx) return null;
    tx.status = status;
    Object.assign(tx, extra || {});
    if (status !== "DISPUTED") Object.assign(tx, calculate(tx, s));
    save(s);
    return tx;
  }

  function reverseTransaction(id, cashier) {
    var s = load();
    var orig = s.digitalServiceTransactions.find(function (t) { return t.id === id; });
    if (!orig || orig.status !== "SUCCESSFUL") return { ok: false, message: "Only successful transactions can be reversed." };
    if (s.digitalServiceTransactions.some(function (t) { return t.reversalOfTransactionId === id; })) {
      return { ok: false, message: "This transaction has already been reversed." };
    }
    var rev = clone(orig);
    rev.id = "DST-" + String(s.nextSeq++).padStart(4, "0");
    rev.status = "REVERSED";
    rev.createdAt = nowIso();
    rev.cashierName = cashier || orig.cashierName;
    rev.reversalOfTransactionId = orig.id;
    ["principalAmount","customerServiceFee","providerGrossCommission","providerCommissionTax","providerNetCommission","otherDirectCharges","grossServiceEarnings","netServiceEarnings","customerCashPaid","customerCashReceived","customerPayout","physicalCashIn","physicalCashOut","providerFloatIn","providerFloatOut"].forEach(function (k) {
      rev[k] = -(orig[k] || 0);
    });
    s.digitalServiceTransactions.unshift(rev);
    save(s);
    return { ok: true, tx: rev };
  }

  function totals(filter) {
    var s = load();
    filter = filter || {};
    var rows = s.digitalServiceTransactions.filter(function (t) {
      if (filter.settledOnly && t.status !== "SUCCESSFUL" && t.status !== "REVERSED") return false;
      if (filter.status && t.status !== filter.status) return false;
      if (filter.service && t.service !== filter.service) return false;
      if (filter.direction && t.direction !== filter.direction) return false;
      if (filter.cashier && t.cashierName !== filter.cashier) return false;
      return true;
    });
    return rows.reduce(function (a, t) {
      if (t.direction === DIRECTIONS.SENT) { a.sent += t.principalAmount || 0; a.sentFees += t.customerServiceFee || 0; }
      if (t.direction === DIRECTIONS.RECEIVED) { a.received += t.principalAmount || 0; a.receivedFees += t.customerServiceFee || 0; }
      a.grossCommission += t.providerGrossCommission || 0;
      a.commissionTax += t.providerCommissionTax || 0;
      a.netCommission += t.providerNetCommission || 0;
      a.otherCharges += t.otherDirectCharges || 0;
      a.netEarnings += t.netServiceEarnings || 0;
      a.grossEarnings += t.grossServiceEarnings || 0;
      return a;
    }, { rows: rows, sent: 0, received: 0, sentFees: 0, receivedFees: 0, grossCommission: 0, commissionTax: 0, netCommission: 0, otherCharges: 0, grossEarnings: 0, netEarnings: 0 });
  }

  function balanceSummary() {
    var s = load(), b = s.digitalServiceBalances, opening = s.digitalServiceOpeningBalances;
    var keys = Object.keys(opening);
    return keys.map(function (key) {
      var service = Object.keys(BALANCE_KEYS).find(function (k) { return BALANCE_KEYS[k] === key; }) || "Physical Cash";
      var tx = s.digitalServiceTransactions.filter(function (t) { return key === "physicalCash" || BALANCE_KEYS[t.service] === key; });
      var sent = tx.reduce(function (a, t) { return a + (key === "physicalCash" ? (t.physicalCashOut || 0) : (t.providerFloatOut || 0)); }, 0);
      var received = tx.reduce(function (a, t) { return a + (key === "physicalCash" ? (t.physicalCashIn || 0) : (t.providerFloatIn || 0)); }, 0);
      var pending = s.digitalServiceTransactions.filter(function (t) {
        return t.status === "PENDING" && (key === "physicalCash" || BALANCE_KEYS[t.service] === key);
      }).reduce(function (a, t) { return a + (t.principalAmount || 0); }, 0);
      return { key: key, service: key === "physicalCash" ? "Physical Cash" : service, opening: opening[key], sent: sent, received: received, current: b[key], pending: pending, low: b[key] < (LOW_THRESHOLDS[key] || 0), last: tx[0] ? tx[0].createdAt : "" };
    });
  }

  function saveReconciliation(input) {
    var s = load();
    var rec = Object.assign({ id: "DSR-" + Date.now(), createdAt: nowIso(), cashierName: (window.DB && DB.SHOP && DB.SHOP.owner) || "Cashier" }, input || {});
    s.digitalServiceReconciliations.unshift(rec);
    save(s);
    return rec;
  }

  window.Digital = {
    KEY: KEY, SERVICES: SERVICES, DIRECTIONS: DIRECTIONS, STATUSES: STATUSES, BALANCE_KEYS: BALANCE_KEYS,
    load: load, save: save, calculate: calculate, calcFee: calcFee, findRule: findRule,
    addTransaction: addTransaction, updateStatus: updateStatus, reverseTransaction: reverseTransaction,
    totals: totals, balanceSummary: balanceSummary, saveReconciliation: saveReconciliation,
    pkr: pkr, dateText: dateText, num: num, lowThresholds: LOW_THRESHOLDS
  };
})();
