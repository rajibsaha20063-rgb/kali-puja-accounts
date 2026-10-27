# 🪔 Neighbourhood Club Kali Puja Accounts & Audit Web Application

A full-stack, production-ready web application for neighbourhood clubs to manage **Kali Puja collections, expenditure, budget audits, and cash in hand**, connected seamlessly to Google Sheets.

---

## 🌟 Key Features

1. **Google Sheets v4 Integration & Dual-Mode Execution**:
   - Reads directly from Google Sheet (`1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE`).
   - Automatically writes updates back into Google Sheets cells with formula preservation.
   - Built-in **Demo Mode**: If Google Cloud service account keys are not yet configured or offline, it runs smoothly in-memory with pre-loaded realistic data and persistent local caching (`demo-data.json`).
2. **Real-time Financial Overview**:
   - **Total Income / Collection** (Cell B6)
   - **Total Expenses / Kharcha** (Cell D6)
   - **Net Balance / Cash in Hand** (Cell F6)
   - Total Target / Demand vs Pending Collections
   - Total Budget vs Advance Paid vs Pending Expense Balances
3. **Role-Based Access Control (RBAC)**:
   - **Admin** (`admin`): Full read/write access to all collections and expenses, plus user administration.
   - **Collector** (`collector`): Can view summaries and update Para collection amounts.
   - **Viewer** (`viewer`): Read-only transparent audit view for club members and donors.
4. **Bilingual User Experience (English + Bengali)**:
   - Clean Indian currency formatting (e.g., `₹ 1,49,200`).
   - Bengali labels for all 7 collection paras and 12 expense categories.
5. **Security & Production Best Practices**:
   - HTTP-only JWT cookies + Bearer token fallback.
   - Salted `bcrypt` password hashing.
   - Comprehensive error handling and input validation.

---

## 📁 Project Structure

```
kali-puja-website/
├── server.js            # Complete Express server & Google Sheets v4 engine
├── package.json         # Node.js dependencies and scripts
├── .env                 # Environment variables & Google API keys
├── .env.example         # Template for environment configuration
├── setup-guide.md       # Complete step-by-step Google Cloud & cloud deployment guide
├── users.json           # Local user database (auto-created on first run)
├── demo-data.json       # Demo data cache for offline/testing mode
└── public/              # Static frontend assets
    ├── index.html       # Entry redirector
    ├── login.html       # Festive authentication portal
    ├── dashboard.html   # Main accounts & audit dashboard
    ├── app.js           # Client-side data fetching and modals
    └── style.css        # Responsive, festival-themed styles
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd C:\Users\rajib\.gemini\antigravity\scratch\kali-puja-website
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start at:
👉 **`http://localhost:3000`**

### 3. Default Login Credentials
- **Admin**: `admin` / `admin123`
- **Collector**: `collector1` / `collector123`
- **Viewer**: `viewer1` / `viewer123`

---

## 📊 Google Sheets Cell Coordinates

| Section | Sheet Cell Range | Description |
|---|---|---|
| **Summary Row** | `B6:F6` | `B6` = Total Income, `D6` = Total Expenses, `F6` = Net Balance |
| **Collections (7 Items)** | `A11:E17` | `B` = Source, `C` = Target, `D` = Collected, `E` = Pending |
| **Collection Totals** | `C18:E18` | Total Target, Total Collected, Total Pending |
| **Expenses (12 Items)** | `A23:F34` | `B` = Category, `C` = Budget, `D` = Advance, `E` = Paid, `F` = Pending |
| **Expense Totals** | `C35:F35` | Total Budget, Total Advance, Total Paid, Total Pending |

---

## 🛠️ REST API Reference

### Authentication
- `POST /api/auth/login` — Sign in with username & password (sets HTTP-only cookie).
- `POST /api/auth/logout` — Clear session cookie.
- `GET /api/auth/me` — Retrieve current authenticated user profile.

### Financial Data
- `GET /api/data/summary` — Overview metrics (income, expense, net balance).
- `GET /api/data/collections` — 7 income sources with targets & collected sums.
- `GET /api/data/expenses` — 12 expense categories with budget, advance & total paid.
- `POST /api/data/collections` — Update collection entry by `id` (1-7) (Admin or Collector).
- `POST /api/data/expenses` — Update expense entry by `id` (1-12) (Admin only).

### User Management (Admin Only)
- `GET /api/admin/users` — List all users and roles.
- `POST /api/admin/users` — Create user (`username`, `password`, `role`, `name`).
- `PUT /api/admin/users/:username/role` — Update a user's role.
- `DELETE /api/admin/users/:username` — Delete user account.

### System
- `GET /api/system/status` — Returns server mode (`live` or `demo`), connection health, and spreadsheet ID.

---

## ☁️ Deployment Guide

Refer to [`setup-guide.md`](./setup-guide.md) for full instructions on creating a Google Cloud service account, sharing the spreadsheet, and deploying to **Railway**, **Render**, or **Vercel** with custom or free domains.
