# 🌺 Neighbourhood Club Kali Puja Accounts & Audit — Setup & Deployment Guide

This guide walks you through configuring **Google Sheets API v4 integration** and deploying the website to a public URL with a custom or free domain (Railway, Render, or Vercel).

---

## 📋 Table of Contents
1. [Overview](#1-overview)
2. [Demo Mode vs Live Mode](#2-demo-mode-vs-live-mode)
3. [Step 1: Create a Google Cloud Service Account](#3-step-1-create-a-google-cloud-service-account)
4. [Step 2: Enable Google Sheets API](#4-step-2-enable-google-sheets-api)
5. [Step 3: Share Spreadsheet with the Service Account](#5-step-3-share-spreadsheet-with-the-service-account)
6. [Step 4: Generate Private Key & Configure `.env`](#6-step-4-generate-private-key--configure-env)
7. [Step 5: Run Locally](#7-step-5-run-locally)
8. [Step 6: Deploy to Public Domain (Railway / Render / Vercel)](#8-step-6-deploy-to-public-domain-railway--render--vercel)
9. [User Roles & Security Reference](#9-user-roles--security-reference)

---

## 1. Overview

The Kali Puja Accounts & Audit application is designed for neighbourhood clubs to track collections, expenses, and net cash in hand transparently.

- **Spreadsheet ID**: `1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE`
- **Spreadsheet URL**: [Open Kali Puja Spreadsheet](https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE)
- **Cell Mapping**:
  - **Overview**: Row 6 (`B6` = Total Income, `D6` = Total Expenses, `F6` = Net Balance)
  - **Income Breakdown**: Rows 11–17 (7 Para and Spot collections)
    - `C11:C17` = Target / Demand (₹)
    - `D11:D17` = Collected (₹)
    - `E11:E17` = Pending Due (₹)
  - **Expense Breakdown**: Rows 23–34 (12 Categories: Light, Pandal, Idol, Sound, Bhog, etc.)
    - `C23:C34` = Estimated / Budget (₹)
    - `D23:D34` = Advance Paid (₹)
    - `E23:E34` = Total Paid (₹)
    - `F23:F34` = Pending Due (₹)

---

## 2. Demo Mode vs Live Mode

The server has **zero-friction automatic fallback**:
- **Demo Mode (Default out-of-the-box)**: If Google Cloud credentials are not yet configured or if the spreadsheet is inaccessible, the app automatically runs in **Demo Mode**. All 7 collections and 12 expense categories are pre-populated with realistic club data. All CRUD updates persist smoothly in local storage (`demo-data.json`).
- **Live Mode**: Once you place valid Google Cloud Service Account credentials in `.env`, the server automatically connects to Google Sheets and syncs all edits in real time!

---

## 3. Step 1: Create a Google Cloud Service Account

A **Google Cloud Service Account** is a special bot identity used by server-side apps to securely access Google APIs without needing browser popups.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your standard Google Account.
3. In the top navigation bar, click the **Project Dropdown** and select **New Project**.
4. Name the project `Kali-Puja-Accounts` and click **Create**.
5. Ensure the new project is selected in the project dropdown.
6. Open the navigation menu (≡) on the top-left and select **IAM & Admin** > **Service Accounts**.
7. Click **+ Create Service Account** at the top.
8. Fill in:
   - **Service account name**: `kali-puja-sheets-service`
   - **Service account ID**: (automatically filled, e.g., `kali-puja-sheets-service@kali-puja-accounts.iam.gserviceaccount.com`)
   - **Service account description**: `Service account to read and write Kali Puja audit sheets`
9. Click **Create and Continue**.
10. Role assignment is optional (project roles can be left blank). Click **Continue**, then click **Done**.
11. **Copy the generated email address** (e.g., `kali-puja-sheets-service@...iam.gserviceaccount.com`). You will need this in Step 3 and Step 4.

---

## 4. Step 2: Enable Google Sheets API

1. In Google Cloud Console, open the top navigation menu (≡) and go to **APIs & Services** > **Library**.
2. In the search box, search for:
   ```
   Google Sheets API
   ```
3. Click on **Google Sheets API** from the results.
4. Click the blue **Enable** button.
5. Wait a few seconds until the API status confirms it is enabled.

---

## 5. Step 3: Share Spreadsheet with the Service Account

Because the Google Sheet is private by default, you must share it with the service account bot email:

1. Open your Kali Puja Google Sheet:
   👉 [https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE](https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE)
2. Click the green **Share** button in the top-right corner.
3. In the "Add people and groups" box, paste your service account email from Step 1:
   ```
   kali-puja-sheets-service@your-project-id.iam.gserviceaccount.com
   ```
4. Change the dropdown permission on the right from *Viewer* to **Editor** (this allows the website to update collections and expenses).
5. Uncheck the "Notify people" checkbox (since service accounts do not have an inbox).
6. Click **Share** (or **Send**).

---

## 6. Step 4: Generate Private Key & Configure `.env`

1. Go back to [Google Cloud Console > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Click on the service account you created (`kali-puja-sheets-service`).
3. Click on the **Keys** tab at the top.
4. Click **Add Key** > **Create new key**.
5. Choose **JSON** format and click **Create**.
6. A `.json` key file will download to your computer. Open this file in any text editor (Notepad, VS Code).
7. Notice two fields in the JSON file:
   - `client_email`
   - `private_key`
8. Open your `.env` file at `C:\Users\rajib\.gemini\antigravity\scratch\kali-puja-website\.env`.
9. Fill in the values:
   ```env
   GOOGLE_SERVICE_ACCOUNT_EMAIL=kali-puja-sheets-service@your-project-id.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
   SPREADSHEET_ID=1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE
   JWT_SECRET=kali-puja-neighbourhood-club-secret-key-2026
   PORT=3000
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   ```
   > [!IMPORTANT]
   > Keep the double quotes `"` around `GOOGLE_PRIVATE_KEY` and keep `\n` linebreaks intact as given in the JSON key. The server handles newline replacement automatically.

---

## 7. Step 5: Run Locally

1. Open your terminal in the project directory:
   ```powershell
   cd C:\Users\rajib\.gemini\antigravity\scratch\kali-puja-website
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and visit:
   ```
   http://localhost:3000
   ```
5. Log in with the default administrator credentials:
   - **Username**: `admin`
   - **Password**: `admin123`

---

## 8. Step 6: Deploy to Public Domain (Railway / Render / Vercel)

To allow committee members and neighbourhood residents to access the dashboard on their phones and computers, deploy the app to one of the following free/low-cost cloud platforms.

### Option A: Deploy to Railway (Recommended — 2 Minutes)
Railway is optimal for Node.js apps with persistent background servers and environment variables.

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial Kali Puja Accounts App"
   git branch -M main
   # Add your github remote and push
   git remote add origin https://github.com/<your-username>/kali-puja-website.git
   git push -u origin main
   ```
2. Visit [railway.app](https://railway.app) and sign in with GitHub.
3. Click **+ New Project** > **Deploy from GitHub repo**.
4. Select your `kali-puja-website` repository.
5. In the project dashboard, go to the **Variables** tab and add the environment variables:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SPREADSHEET_ID`
   - `JWT_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `PORT` = `3000` (or Railway auto-assigns `$PORT`)
6. Go to **Settings** > **Networking** > Click **Generate Domain**.
7. Railway will provide a live HTTPS link (e.g. `kali-puja-production.up.railway.app`). You can also link a custom domain (e.g., `audit.ourclub.org`) with free SSL.

---

### Option B: Deploy to Render (Free Tier)
1. Go to [render.com](https://render.com) and create an account.
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Set configuration:
   - **Name**: `kali-puja-accounts`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Click **Advanced** > **Add Environment Variable** to add:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SPREADSHEET_ID`
   - `JWT_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
6. Click **Create Web Service**. Render builds and deploys your site to `https://kali-puja-accounts.onrender.com`.

---

### Option C: Deploy to Vercel
1. Install Vercel CLI or import the Git repo on [vercel.com](https://vercel.com).
2. Because Vercel uses serverless routing, create a `vercel.json` file in the root directory:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "server.js"
       }
     ]
   }
   ```
3. Under Project Settings > **Environment Variables**, add the same variables from `.env`.
4. Deploy with `vercel --prod` or git push.

---

## 9. User Roles & Security Reference

| Role | Permissions | Use Case |
|---|---|---|
| **Admin** (`admin`) | Full Access: View summary, update collections, update expenses, create/edit/delete users. | Puja Secretary / Treasurer / President |
| **Collector** (`collector`) | View summary, view collections & expenses, update collection amounts for paras. | Field youth & para collection representatives |
| **Viewer** (`viewer`) | Read-only access to live financial summaries, collections, and audit logs. | Club general members, auditors, and residents |

### Pre-Configured Test Accounts (in Demo Mode):
- **Admin**: `admin` / `admin123`
- **Collector**: `collector1` / `collector123`
- **Viewer**: `viewer1` / `viewer123`

---
*Developed for Neighbourhood Club Kali Puja Accounts & Audit Committee.*
