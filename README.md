# Car Towels Trading — Business Manager

A full, persistent web application that replaces the `Car_Towels_Sheet_P_S.xlsm`
workbook. It reproduces every calculation, KPI, and the dashboard from the
spreadsheet as a real multi-page app backed by a SQLite database — no more
broken formulas, no more manually dragging cells down.

No external dependencies are required — the backend uses **only the Python
standard library** (`http.server`, `sqlite3`) and the frontend is plain
HTML/CSS/JavaScript with no build step and no CDN dependency, so everything
works fully offline.

---

## 1. What this app replicates from the Excel workbook

| Excel sheet | App page | Logic preserved |
|---|---|---|
| Purchase Product (Table3) | **Local Purchases** | `Total Cost = Qty (KG) × Rate/KG` |
| Purchase Product (Table35) | **Cargo Purchases** | `Cargo Cost = Qty (KG) × Rate/Kg` |
| Selling products (Table37) | **Sales** | `Sub Total = Qty × Rate`, `Sell Total = Sub Total − Discount`, `Balance Due = Sell Total − Cash Received` |
| Revenue (Table12) | **Revenue** | Tracks cash collected from the market; `Remaining in Market = Total Selling − Total Received` |
| Investment | **Investments** | Per-partner capital ledger; investment % = partner's capital ÷ total capital |
| Total Profit Distribution + Dashboard | **Dashboard** | `Profit = Total Selling − Total Purchase`<br>`Investment Profit Pool = Profit × Investment % (default 30%, editable in Settings)`<br>`Net Profit = Profit − Investment Profit Pool`<br>`Each partner's Half Profit = Net Profit ÷ 2`<br>`Each partner's Investment Profit = Investment Profit Pool × their investment %`<br>`Total Overall Profit = Half Profit + Investment Profit` |
| Dashboard charts | **Dashboard** | Top 5 Customers (by sales value), Top 5 Selling Products (by KG sold), Stock Available (Purchased KG − Sold KG per product) — the original workbook's charts had no data bound to them, so these are rebuilt from the underlying tables using the same business logic |

The app starts **completely empty** — every table has 0 records and every KPI
reads 0 until you add data.

---

## 2. Requirements

- **Python 3.8 or newer** (comes pre-installed on macOS/Linux; on Windows,
  install from [python.org](https://www.python.org/downloads/) and check
  "Add Python to PATH" during setup).
- A modern web browser (Chrome, Edge, Firefox, Safari).
- No internet connection needed, no `pip install`, no `npm install`.

## 3. How to run it

1. Unzip/copy the `car-towels-app` folder anywhere on your computer.
2. Open a terminal (Command Prompt / PowerShell / Terminal) in that folder.
3. Start the server:

   ```bash
   python3 app.py
   ```
   (On Windows, use `python app.py` if `python3` isn't recognized.)

4. You should see:

   ```
   Car Towels Trading App running at http://localhost:8000
   Database file: /.../car-towels-app/data/app.db
   ```

5. Open your browser and go to **http://localhost:8000**

6. To stop the server, go back to the terminal and press `Ctrl+C`.

To use a different port (e.g. if 8000 is already taken):

```bash
PORT=9090 python3 app.py         # macOS/Linux
set PORT=9090 && python app.py   # Windows (cmd)
```

## 4. Where your data lives

All data is stored in a single SQLite database file:

```
car-towels-app/data/app.db
```

This file is created automatically the first time you run the app and
**persists across restarts and browser refreshes**. To back up your data,
just copy this file. To reset the app to a completely empty state, stop the
server and delete `data/app.db` — it will be recreated empty the next time
you start the app.

## 5. Using the app

- **Dashboard** — live KPI cards (Total Purchase, Total Selling, Profit,
  Investment Profit Pool, Net Profit, Balance Due, Revenue received/remaining),
  a profit-distribution breakdown per partner, and the Top 5 Customers / Top 5
  Selling Products / Stock Available charts.
- **Local Purchases / Cargo Purchases / Sales / Revenue / Investments** —
  each page has:
  - **Add** button (top right) to open a form and create a new record
  - **Search box** to find records by any text field
  - A **filter dropdown** where relevant (payment status, paid, partner)
  - **Sortable columns** — click any column header to sort, click again to
    reverse order
  - **Edit / Delete** buttons on every row
  - **Export CSV** button to download the table (opens directly in Excel)
- **Settings** — change the two partners' names, the investment-profit
  percentage (defaults to 30%, matching the original workbook), the currency
  code, and the business name. All dashboard math updates immediately.

## 6. Project structure

```
car-towels-app/
├── app.py                # Backend: HTTP server, REST API, business logic, SQLite
├── data/
│   └── app.db             # SQLite database (created on first run, starts empty)
├── static/
│   ├── index.html          # App shell
│   ├── css/style.css       # Styling (responsive, mobile-friendly)
│   └── js/app.js           # Frontend logic (pages, CRUD, charts, forms)
└── README.md              # This file
```

## 7. API reference (for reference / integration)

All endpoints return JSON and live under `/api`:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | All KPIs, partner profit breakdown, chart data |
| GET | `/api/settings` | Current settings |
| POST | `/api/settings` | Update settings |
| GET | `/api/{table}` | List rows (supports `?search=`, `?sort=`, `?order=`, plus column filters) |
| POST | `/api/{table}` | Create a row |
| PUT | `/api/{table}/{id}` | Update a row |
| DELETE | `/api/{table}/{id}` | Delete a row |
| GET | `/api/export/{table}.csv` | Download the table as CSV |

Where `{table}` is one of: `local-purchases`, `cargo-purchases`, `sales`,
`revenue`, `investments`.

## 8. Notes on design decisions

- The original workbook's three Dashboard charts ("Top 5 Customers", "Top 5
  Selling Products", "Stock Available") had **no data actually bound to
  them** when inspected — they were empty chart placeholders. The app
  reconstructs the clearly-intended logic for each from the source tables
  (sales revenue by customer, quantity sold by product, and purchased-minus-sold
  per product respectively).
- The profit-split model (30% to an "investment profit" pool distributed by
  ownership %, 70% split 50/50 between exactly two partners) is preserved
  exactly as in the `Total Profit Distribution` sheet. The investment-profit
  percentage is configurable in Settings instead of hardcoded, so you can
  adjust it without editing code.
- Currency defaults to PKR (as in the original file's number formats) and is
  editable in Settings.
