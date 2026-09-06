/* Car Towels Trading — Frontend Application (vanilla JS, no build step) */

const API = "/api";
const fmtMoney = (n, currency = "PKR") => {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n, digits = 2) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
const todayISO = () => new Date().toISOString().slice(0, 10);

let CURRENCY = "PKR";
let currentPage = "dashboard";
let currentSort = { field: "date", order: "desc" };
let currentSearch = "";
let currentFilters = {};

// ---------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}
async function apiSend(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}
const apiPost = (path, body) => apiSend(path, "POST", body);
const apiPut = (path, body) => apiSend(path, "PUT", body);
async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = "toast"), 2600);
}

// ---------------------------------------------------------------------
// Table configuration: describes each entity for generic CRUD rendering
// ---------------------------------------------------------------------
const TABLE_CONFIGS = {
  "local-purchases": {
    title: "Local Purchases",
    subtitle: "Products purchased locally from suppliers",
    idKey: "id",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "product_name", label: "Product", type: "text", required: true },
      { key: "supplier_name", label: "Supplier", type: "text" },
      { key: "quantity_kg", label: "Qty (KG)", type: "number", step: "0.01" },
      { key: "rate_per_kg", label: "Rate/KG", type: "number", step: "0.01", currency: true },
      { key: "total_cost", label: "Total Cost", type: "computed", currency: true },
      { key: "payment_status", label: "Payment", type: "select", options: ["Cash", "Bank", "Online"] },
      { key: "misc", label: "Misc.", type: "number", step: "0.01", currency: true },
      { key: "remarks", label: "Remarks", type: "text", full: true },
    ],
    totals: ["quantity_kg", "total_cost", "misc"],
  },
  "cargo-purchases": {
    title: "Cargo Purchases",
    subtitle: "Products imported via cargo / mercury cargo route",
    idKey: "id",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "cargo_company", label: "Cargo Company", type: "text" },
      { key: "from_location", label: "From", type: "text" },
      { key: "to_location", label: "To", type: "text" },
      { key: "product_name", label: "Product", type: "text", required: true },
      { key: "quantity_kg", label: "Qty (KG)", type: "number", step: "0.01" },
      { key: "rate_per_kg", label: "Rate/KG", type: "number", step: "0.01", currency: true },
      { key: "cargo_cost", label: "Cargo Cost", type: "computed", currency: true },
      { key: "paid", label: "Paid", type: "select", options: ["Yes", "No"] },
    ],
    totals: ["quantity_kg", "cargo_cost"],
  },
  sales: {
    title: "Sales",
    subtitle: "Products sold to customers",
    idKey: "id",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "customer_name", label: "Customer", type: "text", required: true },
      { key: "product_name", label: "Product", type: "text", required: true },
      { key: "quantity_kg", label: "Qty (KG)", type: "number", step: "0.01" },
      { key: "rate_per_kg", label: "Rate/KG", type: "number", step: "0.01", currency: true },
      { key: "sub_total", label: "Sub Total", type: "computed", currency: true },
      { key: "discount", label: "Discount", type: "number", step: "0.01", currency: true },
      { key: "sell_total", label: "Sell Total", type: "computed", currency: true },
      { key: "cash_received", label: "Cash Received", type: "number", step: "0.01", currency: true },
      { key: "balance_due", label: "Balance Due", type: "computed", currency: true },
      { key: "payment_mode", label: "Mode", type: "select", options: ["Cash", "Bank", "Online"] },
      { key: "payment_status", label: "Status", type: "select", options: ["Paid", "Unpaid", "Partial"], pill: true },
    ],
    totals: ["quantity_kg", "sub_total", "sell_total", "cash_received", "balance_due"],
  },
  revenue: {
    title: "Revenue",
    subtitle: "Money received from market / dealers",
    idKey: "id",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "sender_name", label: "Sender", type: "text" },
      { key: "receiver_name", label: "Receiver", type: "text" },
      { key: "amount", label: "Amount", type: "number", step: "0.01", currency: true, required: true },
      { key: "product_name", label: "Product", type: "text" },
      { key: "product_original_rate", label: "Original Rate", type: "number", step: "0.01", currency: true },
      { key: "remarks", label: "Remarks", type: "text", full: true },
    ],
    totals: ["amount"],
  },
  investments: {
    title: "Investments",
    subtitle: "Capital contributed by each partner",
    idKey: "id",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "partner", label: "Partner", type: "partner-select", required: true },
      { key: "amount", label: "Amount", type: "number", step: "0.01", currency: true, required: true },
      { key: "note", label: "Note", type: "text", full: true },
    ],
    totals: ["amount"],
  },
};

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    navigate(btn.dataset.page);
  });
});
document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

function navigate(page) {
  currentPage = page;
  currentSearch = "";
  currentFilters = {};
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  document.getElementById("sidebar").classList.remove("open");
  const titles = {
    dashboard: "Dashboard",
    "local-purchases": "Local Purchases",
    "cargo-purchases": "Cargo Purchases",
    sales: "Sales",
    revenue: "Revenue",
    investments: "Investments",
    settings: "Settings",
  };
  document.getElementById("pageTitle").textContent = titles[page] || page;
  render();
}

async function render() {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="empty-note">Loading…</div>`;
  try {
    if (currentPage === "dashboard") return renderDashboard();
    if (currentPage === "settings") return renderSettings();
    return renderTablePage(currentPage);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">⚠️ ${e.message}</div>`;
  }
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
function barList(items, currency = false) {
  if (!items || items.length === 0) return `<div class="empty-note">No data yet</div>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="chart-bars">${items
    .map(
      (i) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label || "—")}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.max((i.value / max) * 100, 2)}%"></div></div>
        <div class="chart-bar-value">${currency ? fmtMoney(i.value, CURRENCY) : fmtNum(i.value)}</div>
      </div>`
    )
    .join("")}</div>`;
}

async function renderDashboard() {
  const data = await apiGet("/dashboard");
  CURRENCY = data.settings.currency || "PKR";
  const k = data.kpis;
  const p1 = data.partners.partner1;
  const p2 = data.partners.partner2;

  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Purchase</div>
        <div class="kpi-value">${fmtMoney(k.total_purchase, CURRENCY)}</div>
        <div class="kpi-sub">Local ${fmtMoney(k.total_local_purchase_cost, CURRENCY)} + Cargo ${fmtMoney(k.total_cargo_cost, CURRENCY)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Selling</div>
        <div class="kpi-value">${fmtMoney(k.total_selling, CURRENCY)}</div>
        <div class="kpi-sub">Cash received ${fmtMoney(k.total_cash_received, CURRENCY)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Profit</div>
        <div class="kpi-value ${k.profit >= 0 ? "positive" : "negative"}">${fmtMoney(k.profit, CURRENCY)}</div>
        <div class="kpi-sub">Selling − Purchase</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Investment Profit Pool</div>
        <div class="kpi-value">${fmtMoney(k.investment_profit_pool, CURRENCY)}</div>
        <div class="kpi-sub">${data.settings.investment_profit_percent}% of profit</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Profit (Partners)</div>
        <div class="kpi-value">${fmtMoney(k.net_profit, CURRENCY)}</div>
        <div class="kpi-sub">Split 50 / 50</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Balance Due from Customers</div>
        <div class="kpi-value ${k.total_balance_due > 0 ? "negative" : ""}">${fmtMoney(k.total_balance_due, CURRENCY)}</div>
        <div class="kpi-sub">Outstanding receivables</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Received From Market</div>
        <div class="kpi-value">${fmtMoney(k.total_received_market, CURRENCY)}</div>
        <div class="kpi-sub">via Revenue records</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Remaining in Market</div>
        <div class="kpi-value ${k.remaining_to_dealers > 0 ? "negative" : ""}">${fmtMoney(k.remaining_to_dealers, CURRENCY)}</div>
        <div class="kpi-sub">Selling − Received</div>
      </div>
    </div>

    <div class="section-title">Profit Distribution</div>
    <div class="panels-grid">
      <div class="panel">
        <h3>${escapeHtml(p1.name)}</h3>
        <div class="partner-card">
          <div class="partner-row"><span>Half Profit (50%)</span><span>${fmtMoney(p1.half_profit, CURRENCY)}</span></div>
          <div class="partner-row"><span>Invested Capital</span><span>${fmtMoney(p1.invested, CURRENCY)} (${fmtNum(p1.invested_percent)}%)</span></div>
          <div class="partner-row"><span>Investment Profit</span><span>${fmtMoney(p1.investment_profit, CURRENCY)}</span></div>
          <div class="partner-row"><span>Total Overall Profit</span><span>${fmtMoney(p1.total_overall_profit, CURRENCY)}</span></div>
        </div>
      </div>
      <div class="panel">
        <h3>${escapeHtml(p2.name)}</h3>
        <div class="partner-card">
          <div class="partner-row"><span>Half Profit (50%)</span><span>${fmtMoney(p2.half_profit, CURRENCY)}</span></div>
          <div class="partner-row"><span>Invested Capital</span><span>${fmtMoney(p2.invested, CURRENCY)} (${fmtNum(p2.invested_percent)}%)</span></div>
          <div class="partner-row"><span>Investment Profit</span><span>${fmtMoney(p2.investment_profit, CURRENCY)}</span></div>
          <div class="partner-row"><span>Total Overall Profit</span><span>${fmtMoney(p2.total_overall_profit, CURRENCY)}</span></div>
        </div>
      </div>
    </div>

    <div class="section-title">Insights</div>
    <div class="panels-grid">
      <div class="panel">
        <h3>Top 5 Customers</h3>
        ${barList(data.charts.top_customers, true)}
      </div>
      <div class="panel">
        <h3>Top 5 Selling Products (by KG)</h3>
        ${barList(data.charts.top_products, false)}
      </div>
      <div class="panel">
        <h3>Stock Available (KG)</h3>
        ${barList(data.charts.stock_available.slice(0, 8), false)}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
async function renderSettings() {
  const settings = await apiGet("/settings");
  CURRENCY = settings.currency || "PKR";
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="panel settings-card">
      <h3>Business Settings</h3>
      <form id="settingsForm" class="form-grid">
        <div class="form-field full">
          <label>Business Name</label>
          <input class="input" name="business_name" value="${escapeAttr(settings.business_name)}" />
        </div>
        <div class="form-field">
          <label>Partner 1 Name</label>
          <input class="input" name="partner1_name" value="${escapeAttr(settings.partner1_name)}" required />
        </div>
        <div class="form-field">
          <label>Partner 2 Name</label>
          <input class="input" name="partner2_name" value="${escapeAttr(settings.partner2_name)}" required />
        </div>
        <div class="form-field">
          <label>Investment Profit Share (%)</label>
          <input class="input" type="number" step="0.01" name="investment_profit_percent" value="${escapeAttr(settings.investment_profit_percent)}" />
        </div>
        <div class="form-field">
          <label>Currency Code</label>
          <input class="input" name="currency" value="${escapeAttr(settings.currency)}" />
        </div>
        <div class="form-actions full">
          <button type="submit" class="btn">Save Settings</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await apiPost("/settings", payload);
      toast("Settings saved", "success");
      renderSettings();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ---------------------------------------------------------------------
// Generic table pages (CRUD + search + sort + filter + export)
// ---------------------------------------------------------------------
async function renderTablePage(key) {
  const cfg = TABLE_CONFIGS[key];
  const settings = await apiGet("/settings");
  CURRENCY = settings.currency || "PKR";

  const params = new URLSearchParams();
  if (currentSearch) params.set("search", currentSearch);
  params.set("sort", currentSort.field);
  params.set("order", currentSort.order);
  Object.entries(currentFilters).forEach(([k, v]) => v && params.set(k, v));

  const rows = await apiGet(`/${key}?${params.toString()}`);

  const content = document.getElementById("content");
  const filterCol = cfg.columns.find((c) => c.type === "select" || c.type === "partner-select");

  content.innerHTML = `
    <div class="toolbar">
      <input id="searchInput" class="input search-input" placeholder="Search ${cfg.title.toLowerCase()}…" value="${escapeAttr(currentSearch)}" />
      ${
        filterCol
          ? `<select id="filterSelect" class="input" style="max-width:180px">
              <option value="">All ${filterCol.label}</option>
              ${filterOptions(filterCol, settings)
                .map((o) => `<option value="${escapeAttr(o)}" ${currentFilters[filterCol.key] === o ? "selected" : ""}>${escapeHtml(o)}</option>`)
                .join("")}
            </select>`
          : ""
      }
      <button class="btn secondary" id="exportBtn">⬇ Export CSV</button>
      <button class="btn" id="addBtn">+ Add ${cfg.title.replace(/s$/, "")}</button>
    </div>
    <div class="table-wrap">
      ${rows.length ? buildTable(cfg, rows, settings) : emptyState(cfg)}
    </div>
  `;

  document.getElementById("searchInput").addEventListener("input", debounce((e) => {
    currentSearch = e.target.value;
    renderTablePageKeepFocus(key);
  }, 350));

  const filterSelect = document.getElementById("filterSelect");
  if (filterSelect) {
    filterSelect.addEventListener("change", (e) => {
      currentFilters[filterCol.key] = e.target.value;
      renderTablePage(key);
    });
  }

  document.getElementById("exportBtn").addEventListener("click", () => {
    window.location.href = `${API}/export/${key}.csv`;
  });

  document.getElementById("addBtn").addEventListener("click", () => openForm(key, null, settings));

  content.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
      } else {
        currentSort = { field, order: "desc" };
      }
      renderTablePage(key);
    });
  });

  content.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => String(r.id) === btn.dataset.edit);
      openForm(key, row, settings);
    });
  });
  content.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this record? This cannot be undone.")) return;
      try {
        await apiDelete(`/${key}/${btn.dataset.delete}`);
        toast("Record deleted", "success");
        renderTablePage(key);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

// keep focus in the search box while typing (avoid full re-render feel bad)
async function renderTablePageKeepFocus(key) {
  const active = document.activeElement;
  const cursorPos = active && active.id === "searchInput" ? active.selectionStart : null;
  await renderTablePage(key);
  const el = document.getElementById("searchInput");
  if (el) {
    el.focus();
    if (cursorPos !== null) el.setSelectionRange(cursorPos, cursorPos);
  }
}

function filterOptions(col, settings) {
  if (col.type === "partner-select") return [settings.partner1_name, settings.partner2_name];
  return col.options || [];
}

function emptyState(cfg) {
  return `<div class="empty-state"><div class="big">🗂️</div>No ${cfg.title.toLowerCase()} yet.<br/>Click "Add" above to create your first record.</div>`;
}

function buildTable(cfg, rows, settings) {
  const cols = cfg.columns;
  const totals = {};
  cfg.totals.forEach((t) => (totals[t] = rows.reduce((s, r) => s + (Number(r[t]) || 0), 0)));

  const thead = `<thead><tr>
    ${cols
      .map(
        (c) => `<th data-sort="${c.type === "computed" ? "" : c.key}">${c.label}${
          currentSort.field === c.key ? `<span class="sort-arrow">${currentSort.order === "asc" ? "▲" : "▼"}</span>` : ""
        }</th>`
      )
      .join("")}
    <th>Actions</th>
  </tr></thead>`;

  const tbody = `<tbody>${rows
    .map(
      (r) => `<tr>
        ${cols.map((c) => `<td>${renderCell(c, r, settings)}</td>`).join("")}
        <td class="row-actions">
          <button class="btn secondary small" data-edit="${r.id}">Edit</button>
          <button class="btn danger small" data-delete="${r.id}">Delete</button>
        </td>
      </tr>`
    )
    .join("")}</tbody>`;

  const totalsBar = `<div class="totals-bar">${cfg.totals
    .map((t) => {
      const col = cols.find((c) => c.key === t);
      const label = col ? col.label : t;
      const val = col && col.currency ? fmtMoney(totals[t], settings.currency) : fmtNum(totals[t]);
      return `<span>${label} Total: <b>${val}</b></span>`;
    })
    .join("")}<span>Records: <b>${rows.length}</b></span></div>`;

  return `<table class="data-table">${thead}${tbody}</table>${totalsBar}`;
}

function renderCell(col, row, settings) {
  const val = row[col.key];
  if (col.key === "partner" && (row.partner === "partner1" || row.partner === "partner2")) {
    return escapeHtml(row.partner === "partner1" ? settings.partner1_name : settings.partner2_name);
  }
  if (col.currency) return fmtMoney(val, settings.currency);
  if (col.type === "number" || col.type === "computed") return val === undefined || val === null ? "-" : fmtNum(val);
  if (col.pill) {
    const map = { Paid: "green", Unpaid: "red", Partial: "amber", Yes: "green", No: "red" };
    const cls = map[val] || "gray";
    return `<span class="pill ${cls}">${escapeHtml(val || "-")}</span>`;
  }
  return escapeHtml(val === undefined || val === null || val === "" ? "-" : String(val));
}

// ---------------------------------------------------------------------
// Add / Edit modal form
// ---------------------------------------------------------------------
function openForm(key, row, settings) {
  const cfg = TABLE_CONFIGS[key];
  const isEdit = !!row;
  document.getElementById("modalTitle").textContent = isEdit ? `Edit ${cfg.title.replace(/s$/, "")}` : `Add ${cfg.title.replace(/s$/, "")}`;

  const editableCols = cfg.columns.filter((c) => c.type !== "computed");

  const fieldsHtml = editableCols
    .map((c) => {
      const val = row ? row[c.key] : c.type === "date" ? todayISO() : "";
      const fullClass = c.full ? "full" : "";
      if (c.type === "select") {
        return `<div class="form-field ${fullClass}">
          <label>${c.label}${c.required ? " *" : ""}</label>
          <select class="input" name="${c.key}" ${c.required ? "required" : ""}>
            ${c.options.map((o) => `<option value="${o}" ${val === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </div>`;
      }
      if (c.type === "partner-select") {
        const options = [
          { v: "partner1", l: settings.partner1_name },
          { v: "partner2", l: settings.partner2_name },
        ];
        return `<div class="form-field ${fullClass}">
          <label>${c.label}${c.required ? " *" : ""}</label>
          <select class="input" name="${c.key}" ${c.required ? "required" : ""}>
            ${options.map((o) => `<option value="${o.v}" ${val === o.v ? "selected" : ""}>${escapeHtml(o.l)}</option>`).join("")}
          </select>
        </div>`;
      }
      if (c.type === "date") {
        return `<div class="form-field ${fullClass}">
          <label>${c.label}${c.required ? " *" : ""}</label>
          <input class="input" type="date" name="${c.key}" value="${escapeAttr(val)}" ${c.required ? "required" : ""} />
        </div>`;
      }
      if (c.type === "number") {
        return `<div class="form-field ${fullClass}">
          <label>${c.label}${c.required ? " *" : ""}</label>
          <input class="input" type="number" step="${c.step || "1"}" name="${c.key}" value="${escapeAttr(val ?? 0)}" ${c.required ? "required" : ""} />
        </div>`;
      }
      return `<div class="form-field ${fullClass}">
        <label>${c.label}${c.required ? " *" : ""}</label>
        <input class="input" type="text" name="${c.key}" value="${escapeAttr(val ?? "")}" ${c.required ? "required" : ""} />
      </div>`;
    })
    .join("");

  document.getElementById("modalBody").innerHTML = `
    <form id="entityForm" class="form-grid">
      ${fieldsHtml}
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn">${isEdit ? "Save Changes" : "Add Record"}</button>
      </div>
    </form>
  `;

  openModal();

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      if (isEdit) {
        await apiPut(`/${key}/${row.id}`, payload);
        toast("Record updated", "success");
      } else {
        await apiPost(`/${key}`, payload);
        toast("Record added", "success");
      }
      closeModal();
      renderTablePage(key);
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function openModal() {
  document.getElementById("modalOverlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
navigate("dashboard");
