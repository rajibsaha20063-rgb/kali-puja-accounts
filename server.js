/**
 * Neighbourhood Club Kali Puja Accounts & Audit Backend Server
 * Node.js + Express with Google Sheets API v4 Integration & Demo Mode Fallback
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();

// ==========================================
// CONFIGURATION & ENVIRONMENT
// ==========================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kali-puja-neighbourhood-club-secret-key-2026';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY
  ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
  : '';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const USERS_FILE = path.join(__dirname, 'users.json');
const DEMO_DATA_FILE = path.join(__dirname, 'demo-data.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ==========================================
// DEFAULT DEMO DATA TEMPLATE
// ==========================================
const INITIAL_DEMO_DATA = {
  income: [
    { id: 1, source: 'Para 1 Collection (পাড়া ১)', target: 25000, collected: 22000, pending: 3000 },
    { id: 2, source: 'Para 2 Collection (পাড়া ২)', target: 30000, collected: 28500, pending: 1500 },
    { id: 3, source: 'Para 3 Collection (পাড়া ৩)', target: 20000, collected: 17000, pending: 3000 },
    { id: 4, source: 'Para 4 Collection (পাড়া ৪)', target: 22000, collected: 21000, pending: 1000 },
    { id: 5, source: 'Para 5 Collection (পাড়া ৫)', target: 18000, collected: 15500, pending: 2500 },
    { id: 6, source: 'Shop & Market Collection (দোকান কালেকশন)', target: 35000, collected: 31000, pending: 4000 },
    { id: 7, source: 'Road & Night Collection (রোড ও স্পট কালেকশন)', target: 15000, collected: 14200, pending: 800 }
  ],
  expenses: [
    { id: 1, category: 'লাইট (Light)', estimated: 4500, advance: 2000, paid: 4500, pending: 0 },
    { id: 2, category: 'প্যান্ডেল (Pandal)', estimated: 15000, advance: 5000, paid: 12000, pending: 3000 },
    { id: 3, category: 'ঠাকুর (Thakur / Idol)', estimated: 7500, advance: 3000, paid: 7500, pending: 0 },
    { id: 4, category: 'সাউন্ড সিস্টেম (Sound System)', estimated: 8000, advance: 2500, paid: 6000, pending: 2000 },
    { id: 5, category: 'দশকর্মা (Dashakarma)', estimated: 3500, advance: 1000, paid: 3200, pending: 300 },
    { id: 6, category: 'পূজারী (Pujari / Purohit)', estimated: 3000, advance: 1000, paid: 3000, pending: 0 },
    { id: 7, category: 'ভোগ (Bhog)', estimated: 6000, advance: 2000, paid: 5500, pending: 500 },
    { id: 8, category: 'ভোগ রান্না করার মাসি (Cook / Bhog Ranna)', estimated: 2500, advance: 500, paid: 2500, pending: 0 },
    { id: 9, category: 'প্রোগ্রাম (Program)', estimated: 10000, advance: 3000, paid: 8500, pending: 1500 },
    { id: 10, category: 'মিসলেনিয়াস ১ (Miscellaneous 1)', estimated: 2000, advance: 500, paid: 1800, pending: 200 },
    { id: 11, category: 'মিসলেনিয়াস ২ (Miscellaneous 2)', estimated: 1500, advance: 0, paid: 1200, pending: 300 },
    { id: 12, category: 'মিসলেনিয়াস ৩ (Miscellaneous 3)', estimated: 1500, advance: 0, paid: 1000, pending: 500 }
  ]
};

// ==========================================
// DEMO DATA MANAGEMENT
// ==========================================
function loadDemoData() {
  try {
    if (!fs.existsSync(DEMO_DATA_FILE)) {
      saveDemoData(INITIAL_DEMO_DATA);
      return INITIAL_DEMO_DATA;
    }
    const raw = fs.readFileSync(DEMO_DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading demo-data.json, using defaults:', err.message);
    return INITIAL_DEMO_DATA;
  }
}

function saveDemoData(data) {
  try {
    fs.writeFileSync(DEMO_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving demo-data.json:', err.message);
  }
}

function calculateSummary(demoData) {
  const totalIncome = demoData.income.reduce((sum, item) => sum + (Number(item.collected) || 0), 0);
  const totalTarget = demoData.income.reduce((sum, item) => sum + (Number(item.target) || 0), 0);
  const pendingIncome = Math.max(0, totalTarget - totalIncome);

  const totalExpenses = demoData.expenses.reduce((sum, item) => sum + (Number(item.paid) || 0), 0);
  const totalBudget = demoData.expenses.reduce((sum, item) => sum + (Number(item.estimated) || 0), 0);
  const totalAdvance = demoData.expenses.reduce((sum, item) => sum + (Number(item.advance) || 0), 0);
  const pendingExpenses = Math.max(0, totalBudget - totalExpenses);

  const netBalance = totalIncome - totalExpenses;

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    totalTarget,
    pendingIncome,
    totalBudget,
    totalAdvance,
    pendingExpenses
  };
}

// ==========================================
// USER DATABASE (users.json)
// ==========================================
function initUsersDatabase() {
  if (!fs.existsSync(USERS_FILE)) {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, salt);
    const initialUsers = [
      {
        username: DEFAULT_ADMIN_USERNAME,
        password: hashedPassword,
        role: 'admin',
        name: 'Super Admin',
        createdAt: new Date().toISOString()
      },
      {
        username: 'collector1',
        password: bcrypt.hashSync('collector123', salt),
        role: 'collector',
        name: 'Para Collector 1',
        createdAt: new Date().toISOString()
      },
      {
        username: 'viewer1',
        password: bcrypt.hashSync('viewer123', salt),
        role: 'viewer',
        name: 'Audit Viewer',
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf8');
    console.log(`[Auth] Created initial users.json with admin (${DEFAULT_ADMIN_USERNAME}), collector1, viewer1.`);
  }
}

function getUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      initUsersDatabase();
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading users.json:', err.message);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving users.json:', err.message);
    return false;
  }
}

initUsersDatabase();

// ==========================================
// GOOGLE SHEETS CLIENT & REPOSITORY
// ==========================================
let sheetsClient = null;
let isGoogleConfigured = false;
let cachedSheetTitle = null;

function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function isCredentialsPlaceholder() {
  if (!SERVICE_ACCOUNT_EMAIL || SERVICE_ACCOUNT_EMAIL.includes('your-service-account')) return true;
  if (!PRIVATE_KEY || PRIVATE_KEY.includes('YOUR_KEY_HERE')) return true;
  return false;
}

async function getSheetsInstance() {
  if (isCredentialsPlaceholder()) {
    return null;
  }
  if (sheetsClient) {
    return sheetsClient;
  }

  try {
    const auth = new google.auth.JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const client = google.sheets({ version: 'v4', auth });
    // Verify connection by getting sheet metadata
    const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    cachedSheetTitle = meta.data.sheets[0].properties.title || 'Sheet1';
    sheetsClient = client;
    isGoogleConfigured = true;
    console.log(`[Google Sheets] Connected successfully! Primary sheet: "${cachedSheetTitle}"`);
    return sheetsClient;
  } catch (err) {
    console.warn(`[Google Sheets] Connection test failed (${err.message}). Defaulting to DEMO MODE.`);
    sheetsClient = null;
    isGoogleConfigured = false;
    return null;
  }
}

// Read all data from Google Sheets
async function fetchGoogleSheetsData() {
  const client = await getSheetsInstance();
  if (!client) {
    return null;
  }

  const sheet = cachedSheetTitle || 'Sheet1';
  // Exact cell ranges specified in instructions
  // Summary: B6:F6
  // Income rows: A11:E17 (Rows 11-17)
  // Income totals: C18:E18
  // Expense rows: A23:F34 (Rows 23-34)
  // Expense totals: C35:F35
  const ranges = [
    `'${sheet}'!B6:F6`,
    `'${sheet}'!A11:E17`,
    `'${sheet}'!C18:E18`,
    `'${sheet}'!A23:F34`,
    `'${sheet}'!C35:F35`
  ];

  try {
    const response = await client.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
      valueRenderOption: 'FORMATTED_VALUE'
    });

    const valRanges = response.data.valueRanges || [];

    // Summary row: B6=Total Income, D6=Total Expenses, F6=Net Balance
    const summaryRow = valRanges[0]?.values?.[0] || [];
    const rawTotalIncome = parseNumeric(summaryRow[0]); // B6
    const rawTotalExpenses = parseNumeric(summaryRow[2]); // D6
    const rawNetBalance = parseNumeric(summaryRow[4]); // F6

    // Income rows: A11:E17
    const incomeRows = valRanges[1]?.values || [];
    const income = INITIAL_DEMO_DATA.income.map((defaultItem, idx) => {
      const row = incomeRows[idx] || [];
      const source = row[1] || defaultItem.source;
      const target = row[2] !== undefined ? parseNumeric(row[2]) : defaultItem.target;
      const collected = row[3] !== undefined ? parseNumeric(row[3]) : defaultItem.collected;
      const pending = row[4] !== undefined ? parseNumeric(row[4]) : Math.max(0, target - collected);

      return {
        id: idx + 1,
        source,
        target,
        collected,
        pending
      };
    });

    // Expense rows: A23:F34
    const expenseRows = valRanges[3]?.values || [];
    const expenses = INITIAL_DEMO_DATA.expenses.map((defaultItem, idx) => {
      const row = expenseRows[idx] || [];
      const category = row[1] || defaultItem.category;
      const estimated = row[2] !== undefined ? parseNumeric(row[2]) : defaultItem.estimated;
      const advance = row[3] !== undefined ? parseNumeric(row[3]) : defaultItem.advance;
      const paid = row[4] !== undefined ? parseNumeric(row[4]) : defaultItem.paid;
      const pending = row[5] !== undefined ? parseNumeric(row[5]) : Math.max(0, estimated - paid);

      return {
        id: idx + 1,
        category,
        estimated,
        advance,
        paid,
        pending
      };
    });

    // Reconcile totals
    const calcSummary = calculateSummary({ income, expenses });
    const summary = {
      totalIncome: rawTotalIncome || calcSummary.totalIncome,
      totalExpenses: rawTotalExpenses || calcSummary.totalExpenses,
      netBalance: (rawNetBalance !== 0 ? rawNetBalance : (calcSummary.totalIncome - calcSummary.totalExpenses)),
      totalTarget: calcSummary.totalTarget,
      pendingIncome: calcSummary.pendingIncome,
      totalBudget: calcSummary.totalBudget,
      totalAdvance: calcSummary.totalAdvance,
      pendingExpenses: calcSummary.pendingExpenses
    };

    return {
      summary,
      income,
      expenses,
      source: 'google_sheets'
    };
  } catch (err) {
    console.error('[Google Sheets] Read error:', err.message);
    return null;
  }
}

// Write Collection to Google Sheets
async function writeGoogleSheetCollection(id, target, collected) {
  const client = await getSheetsInstance();
  if (!client) return false;

  const row = 10 + Number(id); // id 1-7 -> row 11-17
  const sheet = cachedSheetTitle || 'Sheet1';

  try {
    const values = [];
    if (target !== undefined && collected !== undefined) {
      values.push([Number(target), Number(collected)]);
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheet}'!C${row}:D${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    } else if (collected !== undefined) {
      values.push([Number(collected)]);
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheet}'!D${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    } else if (target !== undefined) {
      values.push([Number(target)]);
      await client.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheet}'!C${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    }
    return true;
  } catch (err) {
    console.error(`[Google Sheets] Error writing collection row ${row}:`, err.message);
    return false;
  }
}

// Write Expense to Google Sheets
async function writeGoogleSheetExpense(id, estimated, advance, paid) {
  const client = await getSheetsInstance();
  if (!client) return false;

  const row = 22 + Number(id); // id 1-12 -> row 23-34
  const sheet = cachedSheetTitle || 'Sheet1';

  try {
    const rowValues = [
      Number(estimated || 0),
      Number(advance || 0),
      Number(paid || 0)
    ];

    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheet}'!C${row}:E${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValues]
      }
    });
    return true;
  } catch (err) {
    console.error(`[Google Sheets] Error writing expense row ${row}:`, err.message);
    return false;
  }
}

// Unified Data Fetcher: Tries Google Sheets, seamlessly falls back to Demo Mode
async function getApplicationData() {
  const liveData = await fetchGoogleSheetsData();
  if (liveData) {
    return liveData;
  }

  // Demo Mode Fallback
  const demoData = loadDemoData();
  const summary = calculateSummary(demoData);
  return {
    summary,
    income: demoData.income,
    expenses: demoData.expenses,
    source: 'demo_mode'
  };
}

// ==========================================
// AUTHENTICATION & ACCESS CONTROL MIDDLEWARE
// ==========================================
function authMiddleware(req, res, next) {
  let token = req.cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session. Please log in again.'
    });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Admin access required.'
    });
  }
  next();
}

function collectorOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'collector')) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Collector or Admin access required.'
    });
  }
  next();
}

// ==========================================
// API ROUTES: AUTHENTICATION
// ==========================================

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.'
    });
  }

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password.'
    });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password.'
    });
  }

  const payload = {
    username: user.username,
    role: user.role,
    name: user.name || user.username
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.json({
    success: true,
    message: 'Login successful.',
    user: payload,
    token
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Logged out successfully.'
  });
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// ==========================================
// API ROUTES: SYSTEM & AUDIT STATUS
// ==========================================
app.get('/api/system/status', (req, res) => {
  const isDemo = isCredentialsPlaceholder() || !isGoogleConfigured;
  return res.json({
    success: true,
    mode: isDemo ? 'demo' : 'live',
    isDemoMode: isDemo,
    spreadsheetId: SPREADSHEET_ID,
    connectedSheet: cachedSheetTitle || 'Default',
    serviceAccountConfigured: !isCredentialsPlaceholder(),
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// API ROUTES: FINANCIAL DATA
// ==========================================

// GET /api/data/summary
app.get('/api/data/summary', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({
      success: true,
      summary: data.summary,
      source: data.source
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve financial summary: ' + err.message
    });
  }
});

// GET /api/data/collections
app.get('/api/data/collections', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    const totals = {
      target: data.income.reduce((s, i) => s + (Number(i.target) || 0), 0),
      collected: data.income.reduce((s, i) => s + (Number(i.collected) || 0), 0),
      pending: data.income.reduce((s, i) => s + (Number(i.pending) || 0), 0)
    };

    return res.json({
      success: true,
      collections: data.income,
      totals,
      source: data.source
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve collections: ' + err.message
    });
  }
});

// GET /api/data/expenses
app.get('/api/data/expenses', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    const totals = {
      estimated: data.expenses.reduce((s, e) => s + (Number(e.estimated) || 0), 0),
      advance: data.expenses.reduce((s, e) => s + (Number(e.advance) || 0), 0),
      paid: data.expenses.reduce((s, e) => s + (Number(e.paid) || 0), 0),
      pending: data.expenses.reduce((s, e) => s + (Number(e.pending) || 0), 0)
    };

    return res.json({
      success: true,
      expenses: data.expenses,
      totals,
      source: data.source
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve expenses: ' + err.message
    });
  }
});

// POST /api/data/collections (admin or collector)
app.post('/api/data/collections', authMiddleware, collectorOrAdmin, async (req, res) => {
  try {
    const { id, target, collected } = req.body;

    if (id === undefined || id === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: id (1-7)'
      });
    }

    const itemId = parseInt(id, 10);
    if (isNaN(itemId) || itemId < 1 || itemId > 7) {
      return res.status(400).json({
        success: false,
        error: 'Invalid collection id. Must be between 1 and 7.'
      });
    }

    // Always update local demo-data cache for consistency & offline resiliency
    const demoData = loadDemoData();
    const itemIndex = demoData.income.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
      if (target !== undefined) demoData.income[itemIndex].target = Number(target);
      if (collected !== undefined) demoData.income[itemIndex].collected = Number(collected);
      demoData.income[itemIndex].pending = Math.max(
        0,
        (demoData.income[itemIndex].target || 0) - (demoData.income[itemIndex].collected || 0)
      );
      saveDemoData(demoData);
    }

    // If Google Sheets is configured, also update the remote spreadsheet
    let sheetWritten = false;
    if (!isCredentialsPlaceholder()) {
      sheetWritten = await writeGoogleSheetCollection(itemId, target, collected);
    }

    const updatedItem = itemIndex !== -1 ? demoData.income[itemIndex] : null;

    return res.json({
      success: true,
      message: `Collection "${updatedItem ? updatedItem.source : 'Item ' + itemId}" updated successfully.`,
      item: updatedItem,
      syncedWithGoogleSheets: sheetWritten
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update collection: ' + err.message
    });
  }
});

// POST /api/data/expenses (admin only)
app.post('/api/data/expenses', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id, estimated, advance, paid } = req.body;

    if (id === undefined || id === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: id (1-12)'
      });
    }

    const itemId = parseInt(id, 10);
    if (isNaN(itemId) || itemId < 1 || itemId > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid expense id. Must be between 1 and 12.'
      });
    }

    // Always update local demo-data cache for consistency & offline resiliency
    const demoData = loadDemoData();
    const itemIndex = demoData.expenses.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
      if (estimated !== undefined) demoData.expenses[itemIndex].estimated = Number(estimated);
      if (advance !== undefined) demoData.expenses[itemIndex].advance = Number(advance);
      if (paid !== undefined) demoData.expenses[itemIndex].paid = Number(paid);
      demoData.expenses[itemIndex].pending = Math.max(
        0,
        (demoData.expenses[itemIndex].estimated || 0) - (demoData.expenses[itemIndex].paid || 0)
      );
      saveDemoData(demoData);
    }

    // If Google Sheets is configured, update the remote spreadsheet
    let sheetWritten = false;
    if (!isCredentialsPlaceholder()) {
      sheetWritten = await writeGoogleSheetExpense(itemId, estimated, advance, paid);
    }

    const updatedItem = itemIndex !== -1 ? demoData.expenses[itemIndex] : null;

    return res.json({
      success: true,
      message: `Expense "${updatedItem ? updatedItem.category : 'Item ' + itemId}" updated successfully.`,
      item: updatedItem,
      syncedWithGoogleSheets: sheetWritten
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update expense: ' + err.message
    });
  }
});

// ==========================================
// API ROUTES: ADMIN USER MANAGEMENT
// ==========================================

// GET /api/admin/users
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const users = getUsers();
  const safeUsers = users.map(u => ({
    username: u.username,
    role: u.role,
    name: u.name || u.username,
    createdAt: u.createdAt || null
  }));
  return res.json({
    success: true,
    users: safeUsers
  });
});

// POST /api/admin/users
app.post('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, role, name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({
      success: false,
      error: 'Username, password, and role are required.'
    });
  }

  const validRoles = ['admin', 'collector', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role. Allowed roles are: ${validRoles.join(', ')}`
    });
  }

  const trimmedUsername = username.trim().toLowerCase();
  const users = getUsers();

  if (users.some(u => u.username.toLowerCase() === trimmedUsername)) {
    return res.status(409).json({
      success: false,
      error: `Username "${username}" already exists.`
    });
  }

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const newUser = {
    username: trimmedUsername,
    password: hashedPassword,
    role,
    name: (name && name.trim()) || username,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  return res.status(201).json({
    success: true,
    message: `User "${trimmedUsername}" created successfully.`,
    user: {
      username: newUser.username,
      role: newUser.role,
      name: newUser.name,
      createdAt: newUser.createdAt
    }
  });
});

// DELETE /api/admin/users/:username
app.delete('/api/admin/users/:username', authMiddleware, adminOnly, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();

  if (targetUsername === DEFAULT_ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: 'Primary admin user cannot be deleted.'
    });
  }

  if (req.user.username.toLowerCase() === targetUsername) {
    return res.status(400).json({
      success: false,
      error: 'You cannot delete your own active admin account.'
    });
  }

  let users = getUsers();
  const initialLength = users.length;
  users = users.filter(u => u.username.toLowerCase() !== targetUsername);

  if (users.length === initialLength) {
    return res.status(404).json({
      success: false,
      error: `User "${req.params.username}" not found.`
    });
  }

  saveUsers(users);
  return res.json({
    success: true,
    message: `User "${req.params.username}" deleted successfully.`
  });
});

// PUT /api/admin/users/:username/role
app.put('/api/admin/users/:username/role', authMiddleware, adminOnly, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();
  const { role } = req.body;

  const validRoles = ['admin', 'collector', 'viewer'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Valid role is required (${validRoles.join(', ')}).`
    });
  }

  if (targetUsername === DEFAULT_ADMIN_USERNAME.toLowerCase() && role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Primary admin role cannot be changed.'
    });
  }

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === targetUsername);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: `User "${req.params.username}" not found.`
    });
  }

  user.role = role;
  saveUsers(users);

  return res.json({
    success: true,
    message: `Role for user "${req.params.username}" updated to ${role}.`,
    user: {
      username: user.username,
      role: user.role,
      name: user.name
    }
  });
});

// Alias routes for frontend compatibility (/api/users)
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = getUsers();
  const safeUsers = users.map(u => ({
    id: u.username,
    username: u.username,
    role: u.role,
    name: u.name || u.username,
    createdAt: u.createdAt || null
  }));
  return res.json({
    success: true,
    users: safeUsers
  });
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Username, password, and role are required.' });
  }
  const validRoles = ['admin', 'collector', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
  }
  const trimmed = username.trim().toLowerCase();
  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === trimmed)) {
    return res.status(409).json({ success: false, error: `Username "${username}" already exists.` });
  }
  const salt = bcrypt.genSaltSync(10);
  const newUser = {
    username: trimmed,
    password: bcrypt.hashSync(password, salt),
    role,
    name: (name && name.trim()) || username,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  return res.status(201).json({
    success: true,
    message: `User "${trimmed}" created successfully.`,
    user: { id: newUser.username, username: newUser.username, role: newUser.role, name: newUser.name }
  });
});

app.put('/api/users/:username', authMiddleware, adminOnly, (req, res) => {
  const target = req.params.username.trim().toLowerCase();
  const { role } = req.body;
  const validRoles = ['admin', 'collector', 'viewer'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `Valid role is required.` });
  }
  if (target === DEFAULT_ADMIN_USERNAME.toLowerCase() && role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Primary admin role cannot be changed.' });
  }
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === target);
  if (!user) {
    return res.status(404).json({ success: false, error: `User "${req.params.username}" not found.` });
  }
  user.role = role;
  saveUsers(users);
  return res.json({
    success: true,
    message: `Role updated to ${role}.`,
    user: { id: user.username, username: user.username, role: user.role }
  });
});

app.delete('/api/users/:username', authMiddleware, adminOnly, (req, res) => {
  const target = req.params.username.trim().toLowerCase();
  if (target === DEFAULT_ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Primary admin user cannot be deleted.' });
  }
  if (req.user.username.toLowerCase() === target) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own active admin account.' });
  }
  let users = getUsers();
  const len = users.length;
  users = users.filter(u => u.username.toLowerCase() !== target);
  if (users.length === len) {
    return res.status(404).json({ success: false, error: `User "${req.params.username}" not found.` });
  }
  saveUsers(users);
  return res.json({ success: true, message: `User "${req.params.username}" deleted.` });
});

// Sync & Refresh endpoints
app.post('/api/sync', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({
      success: true,
      message: 'Data synced successfully.',
      source: data.source,
      summary: data.summary
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/data/refresh', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({
      success: true,
      message: 'Data refreshed successfully.',
      source: data.source,
      summary: data.summary
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// FRONTEND ROUTING & STATIC ASSETS
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// Root route redirects based on authentication status
app.get('/', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect('/login.html');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    return res.redirect('/dashboard.html');
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login.html');
  }
});

// Global 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route ${req.method} ${req.originalUrl} not found.`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error: ' + (err.message || 'Unknown error')
  });
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=====================================================`);
  console.log(` Kali Puja Accounts & Audit Server running on port ${PORT}`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Default Admin: ${DEFAULT_ADMIN_USERNAME} / ${DEFAULT_ADMIN_PASSWORD}`);
  console.log(` Initializing Google Sheets verification...`);

  const sheets = await getSheetsInstance();
  if (sheets) {
    console.log(` [STATUS] Google Sheets LIVE mode active.`);
  } else {
    console.log(` [STATUS] Running in DEMO MODE with realistic pre-populated data.`);
    console.log(`          (Set valid credentials in .env to enable live Google Sheets sync)`);
  }
  console.log(`=====================================================`);
});
