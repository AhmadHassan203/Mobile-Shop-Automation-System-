/* ==========================================================================
   MobileShop OS — Prototype app shell
   Renders the sidebar + topbar consistently on every page and exposes small
   UI helpers. A page just sets <body data-page="inventory"> and writes its
   own <main class="content"> markup.
   ========================================================================== */
(function () {
  "use strict";

  // ---- Icon set (stroke, 24x24) -----------------------------------------
  const I = {
    dashboard: '<path d="M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zM13 3v6h8V3h-8z"/>',
    sell: '<path d="M3 3h2l2.4 12.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    demand: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v5M12 14.5v.5" />',
    inventory: '<path d="M20 7 12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
    purchases: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    suppliers: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    customers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    returns: '<path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8"/>',
    repairs: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18v3h3l6.4-6.4a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.4-.4-2.3z"/>',
    used: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2M9 6l2 2 4-4"/>',
    finance: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    digital: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h3M16 10l2 2-2 2"/>',
    closing: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 2v4M16 2v4M8 15l2 2 4-4"/>',
    intelligence: '<path d="M9.5 2A6.5 6.5 0 0 0 6 14v3h6v-3A6.5 6.5 0 0 0 9.5 2z" transform="translate(2.5 0)"/><path d="M9 20h6M10 22h4"/>',
    reports: '<path d="M4 4v16h16"/><path d="M8 16V9M12 16V5M16 16v-4"/>',
    tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 6.6h.09A1.65 1.65 0 0 0 10 3.6V3.5a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>'
  };
  function svg(name, cls) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="' + (cls||'') + '" stroke-linecap="round" stroke-linejoin="round">' + (I[name]||'') + '</svg>'; }

  // ---- Navigation model (matches the blueprint information architecture) --
  const NAV = [
    { group: null, items: [ { id: "dashboard", label: "Dashboard", href: "index.html", icon: "dashboard" } ] },
    { group: "Sell", items: [
      { id: "pos", label: "Sell (POS)", href: "pos.html", icon: "sell" },
      { id: "demand", label: "Demand", href: "demand.html", icon: "demand", count: "6" },
      { id: "customers", label: "Customers", href: "customers.html", icon: "customers" }
    ]},
    { group: "Stock", items: [
      { id: "inventory", label: "Inventory", href: "inventory.html", icon: "inventory" },
      { id: "purchases", label: "Purchases", href: "purchases.html", icon: "purchases" },
      { id: "suppliers", label: "Suppliers", href: "suppliers.html", icon: "suppliers" }
    ]},
    { group: "Service", items: [
      { id: "returns", label: "Returns / Warranty", href: "returns.html", icon: "returns" },
      { id: "repairs", label: "Repairs", href: "repairs.html", icon: "repairs" },
      { id: "used", label: "Used Intake", href: "used-intake.html", icon: "used", count: "1" }
    ]},
    { group: "Money", items: [
      { id: "finance", label: "Finance", href: "finance.html", icon: "finance" },
      { id: "closing", label: "Daily Closing", href: "closing.html", icon: "closing" }
    ]},
    { group: "Digital Services", items: [
      { id: "digital-new", label: "New Transaction", href: "digital-services.html", icon: "digital" },
      { id: "digital-history", label: "Transaction History", href: "digital-history.html", icon: "reports" },
      { id: "digital-balances", label: "Service Balances", href: "digital-balances.html", icon: "finance" },
      { id: "digital-commission", label: "Commission Report", href: "digital-commission.html", icon: "reports" },
      { id: "digital-recon", label: "Reconciliation", href: "digital-reconciliation.html", icon: "closing" }
    ]},
    { group: "Intelligence", items: [
      { id: "intelligence", label: "Intelligence", href: "intelligence.html", icon: "intelligence", count: "7" },
      { id: "reports", label: "Reports", href: "reports.html", icon: "reports" },
      { id: "tasks", label: "Tasks", href: "tasks.html", icon: "tasks", count: "6" }
    ]},
    { group: "System", items: [ { id: "settings", label: "Settings", href: "settings.html", icon: "settings" } ] }
  ];

  const S = window.DB ? window.DB.SHOP : { name: "MobileShop OS", branch: "Lahore", businessDate: "" };

  function renderSidebar(active) {
    let html = '<div class="brand"><div class="logo">M</div><div><div class="name">MobileShop OS</div><div class="sub">' + S.name + '</div></div></div>';
    NAV.forEach(function (grp) {
      html += '<div class="nav-group">';
      if (grp.group) html += '<div class="label">' + grp.group + '</div>';
      grp.items.forEach(function (it) {
        html += '<a class="nav-item' + (it.id === active ? ' active' : '') + '" href="' + it.href + '">'
          + svg(it.icon) + '<span>' + it.label + '</span>'
          + (it.count ? '<span class="badge-count">' + it.count + '</span>' : '')
          + '</a>';
      });
      html += '</div>';
    });
    return html;
  }

  function renderTopbar(active) {
    const cash = S.cashSession || { state: "closed" };
    const cashCls = cash.state === "open" ? "" : "closed";
    const cashTxt = cash.state === "open" ? "Cash session open" : "Cash session closed";
    return ''
      + '<button class="icon-btn menu-toggle" onclick="Shell.toggleSidebar()">' + svg("menu") + '</button>'
      + '<div class="topbar-date">' + S.businessDate + ' <span class="sub">· ' + (S.branch || "") + '</span></div>'
      + '<div class="searchbar">' + svg("search") + '<input placeholder="Search products, IMEI, customers, invoices…" onkeydown="if(event.key===\'Enter\')Shell.toast(\'Global search is illustrative in this prototype\')"></div>'
      + '<div class="topbar-right">'
      +   '<span class="cash-pill ' + cashCls + '"><span class="dot-i" style="width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block"></span>' + cashTxt + '</span>'
      +   '<button class="icon-btn" title="Toggle theme" onclick="Shell.toggleTheme()">' + svg("moon") + '</button>'
      +   '<button class="icon-btn" title="Notifications" onclick="Shell.notifications()">' + svg("bell") + '<span class="dot"></span></button>'
      +   '<div class="avatar" title="' + (S.owner || "Owner") + '">' + (S.owner ? S.owner.split(" ").map(function(w){return w[0];}).join("").slice(0,2) : "OW") + '</div>'
      + '</div>';
  }

  // ---- Overlay / drawer / modal helpers ---------------------------------
  function openOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add("open"); }
  function closeOverlay(id) {
    if (id) { const el = document.getElementById(id); if (el) el.classList.remove("open"); return; }
    document.querySelectorAll(".overlay.open").forEach(function (el) { el.classList.remove("open"); });
  }

  // ---- Toast -------------------------------------------------------------
  function toast(msg, positive) {
    let wrap = document.getElementById("toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast" + (positive ? " pos" : "");
    t.innerHTML = (positive ? svg("check") : "") + "<span>" + msg + "</span>";
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // ---- Notifications drawer (built on demand) ---------------------------
  function notifications() {
    let ov = document.getElementById("shell-notif");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "overlay"; ov.id = "shell-notif";
      ov.onclick = function (e) { if (e.target === ov) closeOverlay("shell-notif"); };
      const list = (window.DB && DB.notifications || []).map(function (n) {
        return '<div class="attn-card" style="cursor:default"><div class="rankdot">!</div><div><div class="t" style="font-weight:500;font-size:13px">' + n.text + '</div><div class="d">' + n.time + '</div></div></div>';
      }).join("");
      ov.innerHTML = '<div class="drawer"><div class="drawer-head"><h3>Notifications</h3><div class="x-close" onclick="Shell.close(\'shell-notif\')">✕</div></div><div class="drawer-body stack g10">' + list + '</div></div>';
      document.body.appendChild(ov);
    }
    openOverlay("shell-notif");
  }

  // ---- Theme -------------------------------------------------------------
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("msos-theme", next); } catch (e) {}
  }
  function toggleSidebar() { const sb = document.getElementById("sidebar"); if (sb) sb.classList.toggle("open"); }

  // ---- Boot --------------------------------------------------------------
  function boot() {
    try { const t = localStorage.getItem("msos-theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch (e) {}
    const active = document.body.getAttribute("data-page") || "";
    const sb = document.getElementById("sidebar");
    const tb = document.getElementById("topbar");
    if (sb) sb.innerHTML = renderSidebar(active);
    if (tb) tb.innerHTML = renderTopbar(active);
    // close overlays on Esc
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeOverlay(); });
  }

  window.Shell = {
    svg: svg, icon: svg, open: openOverlay, close: closeOverlay, closeAll: closeOverlay,
    toast: toast, notifications: notifications, toggleTheme: toggleTheme, toggleSidebar: toggleSidebar
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
