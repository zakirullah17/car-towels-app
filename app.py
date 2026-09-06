#!/usr/bin/env python3
"""
Car Towels / Trading Business Management App
-----------------------------------------------
A self-contained backend (Python standard library only - no pip installs
required) that recreates the business logic of the original
Car_Towels_Sheet_P_S.xlsm workbook as a real, persistent, multi-user-ready
web application.

Run:  python3 app.py
Then open http://localhost:8000 in your browser.

Data is stored in data/app.db (SQLite) and survives restarts.
"""
import http.server
import socketserver
import sqlite3
import json
import os
import re
import csv
import io
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "app.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")
PORT = int(os.environ.get("PORT", 8000))

os.makedirs(DATA_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS local_purchases (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    product_name   TEXT NOT NULL,
    supplier_name  TEXT,
    quantity_kg    REAL NOT NULL DEFAULT 0,
    rate_per_kg    REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'Cash',
    misc           REAL DEFAULT 0,
    remarks        TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cargo_purchases (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    cargo_company  TEXT,
    from_location  TEXT,
    to_location    TEXT,
    product_name   TEXT NOT NULL,
    quantity_kg    REAL NOT NULL DEFAULT 0,
    rate_per_kg    REAL NOT NULL DEFAULT 0,
    paid           TEXT DEFAULT 'No',
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    customer_name  TEXT NOT NULL,
    product_name   TEXT NOT NULL,
    quantity_kg    REAL NOT NULL DEFAULT 0,
    rate_per_kg    REAL NOT NULL DEFAULT 0,
    discount       REAL DEFAULT 0,
    cash_received  REAL DEFAULT 0,
    payment_mode   TEXT DEFAULT 'Cash',
    payment_status TEXT DEFAULT 'Unpaid',
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revenue (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    date                  TEXT NOT NULL,
    sender_name           TEXT,
    receiver_name         TEXT,
    amount                REAL NOT NULL DEFAULT 0,
    product_name          TEXT,
    product_original_rate REAL DEFAULT 0,
    remarks               TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    partner    TEXT NOT NULL,   -- 'partner1' or 'partner2'
    date       TEXT NOT NULL,
    amount     REAL NOT NULL DEFAULT 0,
    note       TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
"""

DEFAULT_SETTINGS = {
    "partner1_name": "Ghani",
    "partner2_name": "Aftab Ali",
    "investment_profit_percent": "30",
    "currency": "PKR",
    "business_name": "Car Towels Trading",
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    for k, v in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v)
        )
    conn.commit()
    conn.close()


def get_settings():
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


# ---------------------------------------------------------------------------
# Business logic / computed fields (mirrors the Excel formulas exactly)
# ---------------------------------------------------------------------------


def enrich_local_purchase(row):
    d = dict(row)
    d["total_cost"] = round((d.get("quantity_kg") or 0) * (d.get("rate_per_kg") or 0), 2)
    return d


def enrich_cargo_purchase(row):
    d = dict(row)
    d["cargo_cost"] = round((d.get("quantity_kg") or 0) * (d.get("rate_per_kg") or 0), 2)
    return d


def enrich_sale(row):
    d = dict(row)
    sub_total = (d.get("quantity_kg") or 0) * (d.get("rate_per_kg") or 0)
    sell_total = sub_total - (d.get("discount") or 0)
    balance_due = sell_total - (d.get("cash_received") or 0)
    d["sub_total"] = round(sub_total, 2)
    d["sell_total"] = round(sell_total, 2)
    d["balance_due"] = round(balance_due, 2)
    return d


def enrich_revenue(row):
    return dict(row)


def enrich_investment(row):
    return dict(row)


# ---------------------------------------------------------------------------
# Generic CRUD table configuration
# ---------------------------------------------------------------------------

TABLES = {
    "local-purchases": {
        "table": "local_purchases",
        "fields": [
            "date", "product_name", "supplier_name", "quantity_kg",
            "rate_per_kg", "payment_status", "misc", "remarks",
        ],
        "numeric": {"quantity_kg", "rate_per_kg", "misc"},
        "search_fields": ["product_name", "supplier_name", "payment_status", "remarks", "date"],
        "enrich": enrich_local_purchase,
    },
    "cargo-purchases": {
        "table": "cargo_purchases",
        "fields": [
            "date", "cargo_company", "from_location", "to_location", "product_name",
            "quantity_kg", "rate_per_kg", "paid",
        ],
        "numeric": {"quantity_kg", "rate_per_kg"},
        "search_fields": ["cargo_company", "from_location", "to_location", "product_name", "paid", "date"],
        "enrich": enrich_cargo_purchase,
    },
    "sales": {
        "table": "sales",
        "fields": [
            "date", "customer_name", "product_name", "quantity_kg", "rate_per_kg",
            "discount", "cash_received", "payment_mode", "payment_status",
        ],
        "numeric": {"quantity_kg", "rate_per_kg", "discount", "cash_received"},
        "search_fields": ["customer_name", "product_name", "payment_mode", "payment_status", "date"],
        "enrich": enrich_sale,
    },
    "revenue": {
        "table": "revenue",
        "fields": [
            "date", "sender_name", "receiver_name", "amount", "product_name",
            "product_original_rate", "remarks",
        ],
        "numeric": {"amount", "product_original_rate"},
        "search_fields": ["sender_name", "receiver_name", "product_name", "remarks", "date"],
        "enrich": enrich_revenue,
    },
    "investments": {
        "table": "investments",
        "fields": ["partner", "date", "amount", "note"],
        "numeric": {"amount"},
        "search_fields": ["partner", "note", "date"],
        "enrich": enrich_investment,
    },
}


def list_rows(key, qs):
    cfg = TABLES[key]
    table = cfg["table"]
    conn = get_conn()
    where = []
    params = []

    search = qs.get("search", [""])[0].strip()
    if search:
        likes = " OR ".join([f"{f} LIKE ?" for f in cfg["search_fields"]])
        where.append(f"({likes})")
        params.extend([f"%{search}%"] * len(cfg["search_fields"]))

    # generic column filters e.g. ?payment_status=Paid
    for f in cfg["fields"]:
        if f in qs and qs[f][0] != "":
            where.append(f"{f} = ?")
            params.append(qs[f][0])

    sql = f"SELECT * FROM {table}"
    if where:
        sql += " WHERE " + " AND ".join(where)

    sort = qs.get("sort", ["date"])[0]
    order = qs.get("order", ["desc"])[0]
    if sort not in cfg["fields"] + ["id"]:
        sort = "date"
    if order.lower() not in ("asc", "desc"):
        order = "desc"
    sql += f" ORDER BY {sort} {order}, id {order}"

    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [cfg["enrich"](r) for r in rows]


def create_row(key, payload):
    cfg = TABLES[key]
    table = cfg["table"]
    cols, vals = [], []
    for f in cfg["fields"]:
        if f in payload:
            v = payload[f]
            if f in cfg["numeric"]:
                v = float(v) if v not in (None, "") else 0
            cols.append(f)
            vals.append(v)
    conn = get_conn()
    placeholders = ",".join(["?"] * len(cols))
    sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
    cur = conn.execute(sql, vals)
    conn.commit()
    new_id = cur.lastrowid
    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (new_id,)).fetchone()
    conn.close()
    return cfg["enrich"](row)


def update_row(key, row_id, payload):
    cfg = TABLES[key]
    table = cfg["table"]
    cols, vals = [], []
    for f in cfg["fields"]:
        if f in payload:
            v = payload[f]
            if f in cfg["numeric"]:
                v = float(v) if v not in (None, "") else 0
            cols.append(f"{f}=?")
            vals.append(v)
    if not cols:
        return None
    cols.append("updated_at=datetime('now')")
    vals.append(row_id)
    conn = get_conn()
    sql = f"UPDATE {table} SET {','.join(cols)} WHERE id=?"
    conn.execute(sql, vals)
    conn.commit()
    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (row_id,)).fetchone()
    conn.close()
    return cfg["enrich"](row) if row else None


def delete_row(key, row_id):
    cfg = TABLES[key]
    table = cfg["table"]
    conn = get_conn()
    conn.execute(f"DELETE FROM {table} WHERE id=?", (row_id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Dashboard aggregation (mirrors Dashboard + Total Profit Distribution sheets)
# ---------------------------------------------------------------------------


def compute_dashboard():
    conn = get_conn()
    settings = get_settings()
    inv_percent = float(settings.get("investment_profit_percent", 30))
    p1_name = settings.get("partner1_name", "Ghani")
    p2_name = settings.get("partner2_name", "Zia ur Rahman")

    local_rows = conn.execute("SELECT * FROM local_purchases").fetchall()
    cargo_rows = conn.execute("SELECT * FROM cargo_purchases").fetchall()
    sale_rows = conn.execute("SELECT * FROM sales").fetchall()
    revenue_rows = conn.execute("SELECT * FROM revenue").fetchall()
    inv_rows = conn.execute("SELECT * FROM investments").fetchall()
    conn.close()

    total_local_cost = sum((r["quantity_kg"] or 0) * (r["rate_per_kg"] or 0) for r in local_rows)
    total_misc = sum((r["misc"] or 0) for r in local_rows)
    total_cargo_cost = sum((r["quantity_kg"] or 0) * (r["rate_per_kg"] or 0) for r in cargo_rows)
    total_purchase = total_local_cost + total_cargo_cost  # matches Purchase Product!J58+X58

    sales_enriched = [enrich_sale(r) for r in sale_rows]
    total_selling = sum(s["sell_total"] for s in sales_enriched)
    total_cash_received = sum((s["cash_received"] or 0) for s in sales_enriched)
    total_balance_due = sum(s["balance_due"] for s in sales_enriched)

    profit = total_selling - total_purchase
    investment_profit_pool = profit * (inv_percent / 100.0)
    net_profit = profit - investment_profit_pool
    p1_half = net_profit / 2.0
    p2_half = net_profit / 2.0

    p1_invested = sum((r["amount"] or 0) for r in inv_rows if r["partner"] == "partner1")
    p2_invested = sum((r["amount"] or 0) for r in inv_rows if r["partner"] == "partner2")
    total_invested = p1_invested + p2_invested
    p1_pct = (p1_invested / total_invested * 100.0) if total_invested else 0
    p2_pct = (p2_invested / total_invested * 100.0) if total_invested else 0

    p1_inv_profit = investment_profit_pool * (p1_pct / 100.0)
    p2_inv_profit = investment_profit_pool * (p2_pct / 100.0)

    p1_overall = p1_half + p1_inv_profit
    p2_overall = p2_half + p2_inv_profit

    total_received_market = sum((r["amount"] or 0) for r in revenue_rows)
    remaining_to_dealers = total_selling - total_received_market

    # Top 5 customers by total sell amount
    cust_totals = {}
    for s in sales_enriched:
        cust_totals[s["customer_name"]] = cust_totals.get(s["customer_name"], 0) + s["sell_total"]
    top_customers = sorted(cust_totals.items(), key=lambda x: x[1], reverse=True)[:5]

    # Top 5 selling products by quantity sold
    prod_qty = {}
    prod_revenue = {}
    for s in sales_enriched:
        prod_qty[s["product_name"]] = prod_qty.get(s["product_name"], 0) + (s["quantity_kg"] or 0)
        prod_revenue[s["product_name"]] = prod_revenue.get(s["product_name"], 0) + s["sell_total"]
    top_products = sorted(prod_qty.items(), key=lambda x: x[1], reverse=True)[:5]

    # Stock available per product = purchased (local+cargo) - sold
    purchased_qty = {}
    for r in local_rows:
        purchased_qty[r["product_name"]] = purchased_qty.get(r["product_name"], 0) + (r["quantity_kg"] or 0)
    for r in cargo_rows:
        purchased_qty[r["product_name"]] = purchased_qty.get(r["product_name"], 0) + (r["quantity_kg"] or 0)
    sold_qty = {}
    for s in sales_enriched:
        sold_qty[s["product_name"]] = sold_qty.get(s["product_name"], 0) + (s["quantity_kg"] or 0)
    all_products = set(list(purchased_qty.keys()) + list(sold_qty.keys()))
    stock = {p: round(purchased_qty.get(p, 0) - sold_qty.get(p, 0), 2) for p in all_products}
    stock_sorted = sorted(stock.items(), key=lambda x: x[1], reverse=True)

    return {
        "settings": settings,
        "kpis": {
            "total_local_purchase_cost": round(total_local_cost, 2),
            "total_misc": round(total_misc, 2),
            "total_cargo_cost": round(total_cargo_cost, 2),
            "total_purchase": round(total_purchase, 2),
            "total_selling": round(total_selling, 2),
            "total_cash_received": round(total_cash_received, 2),
            "total_balance_due": round(total_balance_due, 2),
            "profit": round(profit, 2),
            "investment_profit_pool": round(investment_profit_pool, 2),
            "net_profit": round(net_profit, 2),
            "total_received_market": round(total_received_market, 2),
            "remaining_to_dealers": round(remaining_to_dealers, 2),
            "total_invested": round(total_invested, 2),
        },
        "partners": {
            "partner1": {
                "name": p1_name,
                "half_profit": round(p1_half, 2),
                "invested": round(p1_invested, 2),
                "invested_percent": round(p1_pct, 2),
                "investment_profit": round(p1_inv_profit, 2),
                "total_overall_profit": round(p1_overall, 2),
            },
            "partner2": {
                "name": p2_name,
                "half_profit": round(p2_half, 2),
                "invested": round(p2_invested, 2),
                "invested_percent": round(p2_pct, 2),
                "investment_profit": round(p2_inv_profit, 2),
                "total_overall_profit": round(p2_overall, 2),
            },
        },
        "charts": {
            "top_customers": [{"label": k, "value": round(v, 2)} for k, v in top_customers],
            "top_products": [{"label": k, "value": round(v, 2)} for k, v in top_products],
            "stock_available": [{"label": k, "value": v} for k, v in stock_sorted],
        },
        "counts": {
            "local_purchases": len(local_rows),
            "cargo_purchases": len(cargo_rows),
            "sales": len(sale_rows),
            "revenue": len(revenue_rows),
            "investments": len(inv_rows),
        },
    }


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------


def export_csv(key):
    cfg = TABLES[key]
    rows = list_rows(key, {})
    output = io.StringIO()
    if not rows:
        conn = get_conn()
        cur = conn.execute(f"PRAGMA table_info({cfg['table']})")
        cols = [r["name"] for r in cur.fetchall()]
        conn.close()
        writer = csv.writer(output)
        writer.writerow(cols)
    else:
        cols = list(rows[0].keys())
        writer = csv.writer(output)
        writer.writerow(cols)
        for r in rows:
            writer.writerow([r.get(c, "") for c in cols])
    return output.getvalue()


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

ROUTE_TABLE_RE = re.compile(r"^/api/(local-purchases|cargo-purchases|sales|revenue|investments)(?:/(\d+))?$")
EXPORT_RE = re.compile(r"^/api/export/(local-purchases|cargo-purchases|sales|revenue|investments)\.csv$")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep console quiet

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_csv(self, text, filename):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/dashboard":
                return self._send_json(compute_dashboard())

            if path == "/api/settings":
                return self._send_json(get_settings())

            m = EXPORT_RE.match(path)
            if m:
                key = m.group(1)
                text = export_csv(key)
                return self._send_csv(text, f"{key}.csv")

            m = ROUTE_TABLE_RE.match(path)
            if m:
                key, row_id = m.group(1), m.group(2)
                if row_id:
                    rows = list_rows(key, {})
                    row = next((r for r in rows if str(r["id"]) == row_id), None)
                    if row is None:
                        return self._send_json({"error": "Not found"}, 404)
                    return self._send_json(row)
                return self._send_json(list_rows(key, qs))
        except Exception as e:
            return self._send_json({"error": str(e)}, 500)

        # fall back to static file serving (SPA)
        if path == "/" or not os.path.exists(os.path.join(STATIC_DIR, path.lstrip("/"))):
            if not path.startswith("/api"):
                self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        m = ROUTE_TABLE_RE.match(path)
        try:
            if m and m.group(2) is None:
                key = m.group(1)
                payload = self._read_json_body()
                row = create_row(key, payload)
                return self._send_json(row, 201)
            if path == "/api/settings":
                payload = self._read_json_body()
                conn = get_conn()
                for k, v in payload.items():
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k, str(v)),
                    )
                conn.commit()
                conn.close()
                return self._send_json(get_settings())
        except Exception as e:
            return self._send_json({"error": str(e)}, 500)
        return self._send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        m = ROUTE_TABLE_RE.match(path)
        try:
            if m and m.group(2):
                key, row_id = m.group(1), int(m.group(2))
                payload = self._read_json_body()
                row = update_row(key, row_id, payload)
                if row is None:
                    return self._send_json({"error": "Not found"}, 404)
                return self._send_json(row)
        except Exception as e:
            return self._send_json({"error": str(e)}, 500)
        return self._send_json({"error": "Not found"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        m = ROUTE_TABLE_RE.match(path)
        try:
            if m and m.group(2):
                key, row_id = m.group(1), int(m.group(2))
                delete_row(key, row_id)
                return self._send_json({"ok": True})
        except Exception as e:
            return self._send_json({"error": str(e)}, 500)
        return self._send_json({"error": "Not found"}, 404)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    init_db()
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Car Towels Trading App running at http://localhost:{PORT}")
        print(f"Database file: {DB_PATH}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")


if __name__ == "__main__":
    main()



# Now the problem arises with the investment percentage for the partners: we need a section in the investment that we can edit to change the percentage of the investment at any time, or by adding the amount added by the investor that could be added to the investment percentage based on the amount added. Also, there is a portion aside from the investment for the two partners that can be shared equally between them. But the investment will be 30% of the total profit, while the remaining 70%will be half of the two partners. In the final calculation of the revenue, add the percentage profit of each partner from both the investment and other profit.