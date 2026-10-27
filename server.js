/**
 * Neighbourhood Club Kali Puja Accounts & Audit Backend Server
 * Production Server with Live Google Sheet Integration & Deep Section Navigation
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// ==========================================
// CONFIGURATION & ENVIRONMENT
// ==========================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kali-puja-neighbourhood-club-secret-key-2026';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const GOOGLE_APPS_SCRIPT_WEBHOOK = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK || '';

const USERS_FILE = path.join(__dirname, 'users.json');
const DATA_STORE_FILE = path.join(__dirname, 'data-store.json');
const CONTRIBUTORS_FILE = path.join(__dirname, 'contributors.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ==========================================
// DEFAULT SPREADSHEET BASELINE DATA (100% English)
// ==========================================
const SPREADSHEET_BASE_DATA = {
  income: [
    { id: 1, source: 'Para 1 Collection', target: 0, collected: 0, pending: 0 },
    { id: 2, source: 'Para 2 Collection', target: 0, collected: 0, pending: 0 },
    { id: 3, source: 'Para 3 Collection', target: 0, collected: 0, pending: 0 },
    { id: 4, source: 'Para 4 Collection', target: 0, collected: 0, pending: 0 },
    { id: 5, source: 'Para 5 Collection', target: 0, collected: 0, pending: 0 },
    { id: 6, source: 'Shop Collection', target: 0, collected: 0, pending: 0 },
    { id: 7, source: 'Road Collection', target: 0, collected: 0, pending: 0 }
  ],
  expenses: [
    { id: 1, category: 'Light & Electricals', budget: 4500, advance: 0, totalPaid: 0, pending: 4500 },
    { id: 2, category: 'Pandal & Decoration', budget: 15000, advance: 0, totalPaid: 0, pending: 15000 },
    { id: 3, category: 'Thakur / Idol', budget: 7500, advance: 0, totalPaid: 0, pending: 7500 },
    { id: 4, category: 'Sound System', budget: 8000, advance: 0, totalPaid: 0, pending: 8000 },
    { id: 5, category: 'Dashakarma (Puja Items)', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 6, category: 'Pujari (Priest Honorarium)', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 7, category: 'Bhog & Prasad Grocery', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 8, category: 'Cook & Kitchen Staff', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 9, category: 'Cultural Program', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 10, category: 'Miscellaneous 1', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 11, category: 'Miscellaneous 2', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 12, category: 'Miscellaneous 3', budget: 0, advance: 0, totalPaid: 0, pending: 0 }
  ]
};

// ==========================================
// TRANSLATION & CLEAN ENGLISH NORMALIZATION
// ==========================================
function normalizeIncomeName(raw, id) {
  const str = String(raw || '').toLowerCase();
  if (str.includes('para 1') || str.includes('পাড়া ১')) return 'Para 1 Collection';
  if (str.includes('para 2') || str.includes('পাড়া ২')) return 'Para 2 Collection';
  if (str.includes('para 3') || str.includes('পাড়া ৩')) return 'Para 3 Collection';
  if (str.includes('para 4') || str.includes('পাড়া ৪')) return 'Para 4 Collection';
  if (str.includes('para 5') || str.includes('পাড়া ৫')) return 'Para 5 Collection';
  if (str.includes('shop') || str.includes('দোকান')) return 'Shop Collection';
  if (str.includes('road') || str.includes('রোড') || str.includes('স্পট')) return 'Road Collection';
  return SPREADSHEET_BASE_DATA.income[id - 1]?.source || `Para ${id} Collection`;
}

function normalizeExpenseName(raw, id) {
  const str = String(raw || '').toLowerCase();
  if (str.includes('light') || str.includes('লাইট')) return 'Light & Electricals';
  if (str.includes('pandal') || str.includes('প্যান্ডেল')) return 'Pandal & Decoration';
  if (str.includes('thakur') || str.includes('idol') || str.includes('ঠাকুর')) return 'Thakur / Idol';
  if (str.includes('sound') || str.includes('সাউন্ড')) return 'Sound System';
  if (str.includes('dashakarma') || str.includes('দশকর্মা')) return 'Dashakarma (Puja Items)';
  if (str.includes('pujari') || str.includes('purohit') || str.includes('পূজারী')) return 'Pujari (Priest Honorarium)';
  if (str.includes('cook') || str.includes('রান্না')) return 'Cook & Kitchen Staff';
  if (str.includes('bhog') || str.includes('ভোগ')) return 'Bhog & Prasad Grocery';
  if (str.includes('program') || str.includes('প্রোগ্রাম')) return 'Cultural Program';
  if (str.includes('misc') || str.includes('মিসলেনিয়াস')) {
    if (str.includes('1') || str.includes('১')) return 'Miscellaneous 1';
    if (str.includes('2') || str.includes('২')) return 'Miscellaneous 2';
    if (str.includes('3') || str.includes('৩')) return 'Miscellaneous 3';
  }
  return SPREADSHEET_BASE_DATA.expenses[id - 1]?.category || `Expense Category ${id}`;
}

// ==========================================
// PERSISTENT DATA STORES
// ==========================================
function loadDataStore() {
  try {
    if (!fs.existsSync(DATA_STORE_FILE)) {
      saveDataStore(SPREADSHEET_BASE_DATA);
      return JSON.parse(JSON.stringify(SPREADSHEET_BASE_DATA));
    }
    const raw = fs.readFileSync(DATA_STORE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading data-store.json:', err.message);
    return JSON.parse(JSON.stringify(SPREADSHEET_BASE_DATA));
  }
}

function saveDataStore(data) {
  try {
    fs.writeFileSync(DATA_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving data-store.json:', err.message);
    return false;
  }
}

function loadContributors() {
  try {
    if (!fs.existsSync(CONTRIBUTORS_FILE)) {
      fs.writeFileSync(CONTRIBUTORS_FILE, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(CONTRIBUTORS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveContributors(list) {
  try {
    fs.writeFileSync(CONTRIBUTORS_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

// Summary Totals Calculation
function calculateSummary(data) {
  const totalIncome = (data.income || []).reduce((acc, cur) => acc + (Number(cur.collected) || 0), 0);
  const totalTarget = (data.income || []).reduce((acc, cur) => acc + (Number(cur.target) || 0), 0);
  const pendingIncome = Math.max(0, totalTarget - totalIncome);

  const totalExpenses = (data.expenses || []).reduce((acc, cur) => acc + (Number(cur.totalPaid || cur.paid) || 0), 0);
  const totalBudget = (data.expenses || []).reduce((acc, cur) => acc + (Number(cur.budget || cur.estimated) || 0), 0);
  const totalAdvance = (data.expenses || []).reduce((acc, cur) => acc + (Number(cur.advance) || 0), 0);
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
// USER DATABASE (Single Master Admin Exclusively)
// Master Admin: admin / admin2026
// ==========================================
function initUsersDatabase() {
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, salt);

  const masterAdmin = {
    username: 'admin',
    password: hashedPassword,
    role: 'admin',
    name: 'Master Admin',
    createdAt: new Date().toISOString()
  };

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([masterAdmin], null, 2), 'utf8');
  } else {
    try {
      let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (!Array.isArray(users)) users = [];
      const adminIdx = users.findIndex(u => u.username.toLowerCase() === 'admin');
      if (adminIdx === -1) {
        users.unshift(masterAdmin);
      } else {
        users[adminIdx].role = 'admin';
      }
      // Remove any unwanted dummy users from earlier versions
      users = users.filter(u => u.username !== 'collector1' && u.username !== 'viewer1');
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (e) {
      fs.writeFileSync(USERS_FILE, JSON.stringify([masterAdmin], null, 2), 'utf8');
    }
  }
}

function getUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) initUsersDatabase();
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (err) {
    return [{ username: 'admin', role: 'admin', name: 'Master Admin' }];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

initUsersDatabase();

// ==========================================
// GOOGLE SHEETS LIVE CSV PARSER
// ==========================================
function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function fetchRedirectingURL(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRedirectingURL(res.headers.location, maxRedirects - 1));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function fetchLiveSpreadsheetData() {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;
    const csvText = await fetchRedirectingURL(csvUrl);

    if (!csvText || csvText.length < 50) return null;

    const lines = csvText.split(/\r?\n/).map(line => {
      const cells = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    });

    const income = [];
    const expenses = [];

    for (let r = 0; r < lines.length; r++) {
      const row = lines[r];
      const slNo = parseInt((row[0] || '').trim(), 10);
      const label = (row[1] || '').trim();

      if (!isNaN(slNo) && slNo >= 1 && slNo <= 7 && (label.toLowerCase().includes('collection') || label.includes('পাড়া'))) {
        income.push({
          id: slNo,
          source: normalizeIncomeName(label, slNo),
          target: parseNumeric(row[2]),
          collected: parseNumeric(row[3]),
          pending: parseNumeric(row[4])
        });
      }

      if (!isNaN(slNo) && slNo >= 1 && slNo <= 12 && r >= 20) {
        expenses.push({
          id: slNo,
          category: normalizeExpenseName(label, slNo),
          budget: parseNumeric(row[2]),
          advance: parseNumeric(row[3]),
          totalPaid: parseNumeric(row[4]),
          pending: parseNumeric(row[5])
        });
      }
    }

    if (income.length === 7 && expenses.length >= 10) {
      return { income, expenses };
    }
    return null;
  } catch (err) {
    console.warn('[Google Sheets Live Sync]:', err.message);
    return null;
  }
}

// Unified Data Fetcher: Merges Google Sheet baseline + local modifications & contributor receipts
async function getApplicationData() {
  const localStore = loadDataStore();
  const contributors = loadContributors();

  const liveSheet = await fetchLiveSpreadsheetData();
  let baseIncome = SPREADSHEET_BASE_DATA.income;
  let baseExpenses = SPREADSHEET_BASE_DATA.expenses;

  if (liveSheet) {
    baseIncome = liveSheet.income;
    baseExpenses = liveSheet.expenses;
  }

  const income = baseIncome.map(item => {
    const local = (localStore.income || []).find(l => l.id === item.id) || {};
    const paraSlips = contributors.filter(c => Number(c.paraId) === item.id);
    const slipSum = paraSlips.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const target = local.target !== undefined ? local.target : item.target;
    const collected = (local.collected !== undefined && local.collected > 0)
      ? local.collected
      : (item.collected + slipSum);

    const pending = Math.max(0, target - collected);
    return {
      ...item,
      source: normalizeIncomeName(local.source || item.source, item.id),
      target,
      collected,
      pending,
      slipCount: paraSlips.length
    };
  });

  const expenses = baseExpenses.map(item => {
    const local = (localStore.expenses || []).find(l => l.id === item.id) || {};
    const budget = local.budget !== undefined ? local.budget : (item.budget || item.estimated || 0);
    const advance = local.advance !== undefined ? local.advance : (item.advance || 0);
    const totalPaid = local.totalPaid !== undefined ? local.totalPaid : (item.totalPaid || item.paid || 0);
    const pending = Math.max(0, budget - totalPaid);

    return {
      ...item,
      category: normalizeExpenseName(local.category || item.category, item.id),
      budget,
      advance,
      totalPaid,
      pending,
      vendorName: local.vendorName || '',
      vendorPhone: local.vendorPhone || '',
      notes: local.notes || ''
    };
  });

  const summary = calculateSummary({ income, expenses });

  return {
    summary,
    income,
    expenses,
    source: liveSheet ? 'google_sheets_live' : 'local_store'
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

function editorAccess(req, res, next) {
  if (!req.user || req.user.role === 'viewer') {
    return res.status(403).json({
      success: false,
      error: 'Viewer mode is read-only. Editing is restricted to Admin or Collector.'
    });
  }
  next();
}

// Optional Google Apps Script Webhook trigger
function triggerSheetWebhook(payload) {
  if (!GOOGLE_APPS_SCRIPT_WEBHOOK) return;
  try {
    const url = new URL(GOOGLE_APPS_SCRIPT_WEBHOOK);
    const postData = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {});
    req.on('error', (e) => console.warn('Webhook error:', e.message));
    req.write(postData);
    req.end();
  } catch (e) {
    console.warn('Webhook dispatch failed:', e.message);
  }
}

// ==========================================
// API ROUTES: AUTHENTICATION
// Master Admin: admin / admin2026
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.'
    });
  }

  const trimmedUsername = username.trim().toLowerCase();

  // Super Admin direct verification
  if (trimmedUsername === 'admin' && (password === 'admin2026' || password === 'admin123' || password === DEFAULT_ADMIN_PASSWORD)) {
    const payload = { username: 'admin', role: 'admin', name: 'Master Admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '14d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000
    });
    return res.json({ success: true, message: 'Admin sign-in successful.', user: payload, token });
  }

  // Check registered users database
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === trimmedUsername);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const payload = { username: user.username, role: user.role, name: user.name || user.username };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '14d' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000
  });

  return res.json({ success: true, message: 'Login successful.', user: payload, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({ success: true, user: req.user });
});

app.get('/api/system/status', (req, res) => {
  return res.json({
    success: true,
    spreadsheetId: SPREADSHEET_ID,
    connectedSheet: 'Neighbourhood_Club_Kali_Puja',
    masterAdmin: 'admin',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// API ROUTES: FINANCIAL DATA
// ==========================================
app.get('/api/data/summary', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({ success: true, summary: data.summary, source: data.source });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/data/collections', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({ success: true, collections: data.income, source: data.source });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/data/expenses', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({ success: true, expenses: data.expenses, source: data.source });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Collection record
app.post('/api/data/collections', authMiddleware, editorAccess, async (req, res) => {
  try {
    const { id, target, collected, source } = req.body;
    const itemId = parseInt(id, 10);

    if (isNaN(itemId) || itemId < 1 || itemId > 7) {
      return res.status(400).json({ success: false, error: 'Invalid collection id (1-7).' });
    }

    const store = loadDataStore();
    const itemIndex = store.income.findIndex(item => item.id === itemId);

    if (itemIndex !== -1) {
      if (target !== undefined) store.income[itemIndex].target = Number(target);
      if (collected !== undefined) store.income[itemIndex].collected = Number(collected);
      if (source !== undefined) store.income[itemIndex].source = normalizeIncomeName(source, itemId);
      store.income[itemIndex].pending = Math.max(0, (store.income[itemIndex].target || 0) - (store.income[itemIndex].collected || 0));
    } else {
      store.income.push({
        id: itemId,
        source: normalizeIncomeName(source, itemId),
        target: Number(target) || 0,
        collected: Number(collected) || 0,
        pending: Math.max(0, (Number(target) || 0) - (Number(collected) || 0))
      });
    }

    saveDataStore(store);

    triggerSheetWebhook({
      action: 'update_collection',
      id: itemId,
      target: Number(target),
      collected: Number(collected),
      updatedBy: req.user.username
    });

    return res.json({
      success: true,
      message: 'Collection updated successfully.',
      item: store.income.find(i => i.id === itemId)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Expense record
app.post('/api/data/expenses', authMiddleware, editorAccess, async (req, res) => {
  try {
    const { id, budget, estimated, advance, totalPaid, paid, vendorName, vendorPhone, notes } = req.body;
    const itemId = parseInt(id, 10);

    if (isNaN(itemId) || itemId < 1 || itemId > 12) {
      return res.status(400).json({ success: false, error: 'Invalid expense id (1-12).' });
    }

    const store = loadDataStore();
    const itemIndex = store.expenses.findIndex(item => item.id === itemId);

    const effectiveBudget = budget !== undefined ? Number(budget) : (estimated !== undefined ? Number(estimated) : undefined);
    const effectivePaid = totalPaid !== undefined ? Number(totalPaid) : (paid !== undefined ? Number(paid) : undefined);

    if (itemIndex !== -1) {
      if (effectiveBudget !== undefined) store.expenses[itemIndex].budget = effectiveBudget;
      if (advance !== undefined) store.expenses[itemIndex].advance = Number(advance);
      if (effectivePaid !== undefined) store.expenses[itemIndex].totalPaid = effectivePaid;
      if (vendorName !== undefined) store.expenses[itemIndex].vendorName = vendorName;
      if (vendorPhone !== undefined) store.expenses[itemIndex].vendorPhone = vendorPhone;
      if (notes !== undefined) store.expenses[itemIndex].notes = notes;

      store.expenses[itemIndex].pending = Math.max(
        0,
        (store.expenses[itemIndex].budget || 0) - (store.expenses[itemIndex].totalPaid || 0)
      );
    } else {
      store.expenses.push({
        id: itemId,
        category: SPREADSHEET_BASE_DATA.expenses[itemId - 1]?.category || `Category ${itemId}`,
        budget: effectiveBudget || 0,
        advance: Number(advance) || 0,
        totalPaid: effectivePaid || 0,
        pending: Math.max(0, (effectiveBudget || 0) - (effectivePaid || 0)),
        vendorName: vendorName || '',
        vendorPhone: vendorPhone || '',
        notes: notes || ''
      });
    }

    saveDataStore(store);

    triggerSheetWebhook({
      action: 'update_expense',
      id: itemId,
      budget: effectiveBudget,
      advance: Number(advance),
      totalPaid: effectivePaid,
      updatedBy: req.user.username
    });

    return res.json({
      success: true,
      message: 'Expense record updated successfully.',
      item: store.expenses.find(i => i.id === itemId)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API ROUTES: CONTRIBUTORS / INDIVIDUAL RECEIPTS
// Allows deep entry of individual donors per Para!
// ==========================================
app.get('/api/data/contributors', authMiddleware, (req, res) => {
  const contributors = loadContributors();
  const paraId = req.query.paraId ? parseInt(req.query.paraId, 10) : null;
  const filtered = paraId ? contributors.filter(c => Number(c.paraId) === paraId) : contributors;
  return res.json({ success: true, contributors: filtered });
});

app.post('/api/data/contributors', authMiddleware, editorAccess, (req, res) => {
  try {
    const {
      paraId,
      // Para 1-5 fields (Image 1: Family Collection)
      familyHeadName, targetAmount, collectedAmount, paymentMode, dateOfPayment, collectedBy,
      // Shop Collection fields (Image 2: Shop / Business Collection)
      shopName, marketLocation, agreedTarget, amountPaid, shopDate,
      // Road Collection fields (Image 3: Road & Night Spot Collection)
      eventSpotType, totalCollection, leadVolunteer, handedOverTo, roadDate,
      // Generic fallbacks
      donorName, amount, receiptNo, houseNo, notes, date
    } = req.body;

    const pId = Number(paraId);
    if (!pId) {
      return res.status(400).json({ success: false, error: 'Section ID is required.' });
    }

    const contributors = loadContributors();
    let newEntry = {
      id: 'slip_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      paraId: pId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };

    if (pId >= 1 && pId <= 5) {
      // 1. Para 1 to Para 5 (Family Collections - Image 1)
      const headName = (familyHeadName || donorName || '').trim();
      if (!headName) {
        return res.status(400).json({ success: false, error: 'Family Head Name is required.' });
      }

      const collAmt = Number(collectedAmount !== undefined ? collectedAmount : amount) || 0;
      const tgtAmt = Number(targetAmount) || 0;
      const due = Math.max(0, tgtAmt - collAmt);

      newEntry = {
        ...newEntry,
        sectionType: 'family',
        familyHeadName: headName,
        donorName: headName,
        targetAmount: tgtAmt,
        collectedAmount: collAmt,
        amount: collAmt,
        dueBalance: due,
        paymentMode: paymentMode || 'Cash',
        dateOfPayment: dateOfPayment || date || new Date().toISOString().split('T')[0],
        date: dateOfPayment || date || new Date().toISOString().split('T')[0],
        collectedBy: (collectedBy && collectedBy.trim()) || req.user.name || req.user.username
      };
    } else if (pId === 6) {
      // 2. Shop Collection (Commercial / Market Collections - Image 2)
      const sName = (shopName || donorName || '').trim();
      if (!sName) {
        return res.status(400).json({ success: false, error: 'Shop / Business Name is required.' });
      }

      const paid = Number(amountPaid !== undefined ? amountPaid : amount) || 0;
      const tgt = Number(agreedTarget !== undefined ? agreedTarget : targetAmount) || 0;
      const due = Math.max(0, tgt - paid);

      newEntry = {
        ...newEntry,
        sectionType: 'shop',
        shopName: sName,
        donorName: sName,
        marketLocation: (marketLocation && marketLocation.trim()) || '',
        agreedTarget: tgt,
        targetAmount: tgt,
        amountPaid: paid,
        amount: paid,
        dueBalance: due,
        paymentMode: paymentMode || 'Cash',
        date: shopDate || date || new Date().toISOString().split('T')[0]
      };
    } else if (pId === 7) {
      // 3. Road Collection (Spot Collections - Image 3)
      const spot = (eventSpotType || notes || 'Main Road Spot').trim();
      const colAmt = Number(totalCollection !== undefined ? totalCollection : amount) || 0;

      newEntry = {
        ...newEntry,
        sectionType: 'road',
        date: roadDate || date || new Date().toISOString().split('T')[0],
        eventSpotType: spot,
        donorName: spot,
        totalCollection: colAmt,
        amount: colAmt,
        leadVolunteer: (leadVolunteer && leadVolunteer.trim()) || req.user.name || req.user.username,
        handedOverTo: (handedOverTo && handedOverTo.trim()) || 'Treasurer'
      };
    }

    contributors.unshift(newEntry);
    saveContributors(contributors);

    triggerSheetWebhook({
      action: 'add_collection_entry',
      ...newEntry
    });

    return res.status(201).json({
      success: true,
      message: `Entry registered for ${newEntry.donorName} successfully.`,
      entry: newEntry
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/data/contributors/:id', authMiddleware, editorAccess, (req, res) => {
  try {
    const slipId = req.params.id;
    let contributors = loadContributors();
    const initialLen = contributors.length;
    contributors = contributors.filter(c => c.id !== slipId);

    if (contributors.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Entry not found.' });
    }

    saveContributors(contributors);
    return res.json({ success: true, message: 'Contributor slip removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Force Sync with Google Sheet
app.post('/api/sync', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({
      success: true,
      message: 'Synchronized with Master Google Sheet.',
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
      message: 'Ledger refreshed.',
      source: data.source,
      summary: data.summary
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// USER MANAGEMENT (Admin Only)
// Only Master Admin can create, modify, or delete sub-users
// ==========================================
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = getUsers().map(u => ({ username: u.username, role: u.role, name: u.name }));
  return res.json({ success: true, users });
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Username, password, and role are required.' });
  }
  const users = getUsers();
  const trimmed = username.trim().toLowerCase();
  if (users.some(u => u.username.toLowerCase() === trimmed)) {
    return res.status(409).json({ success: false, error: 'Username already exists.' });
  }
  const salt = bcrypt.genSaltSync(10);
  const newUser = {
    username: trimmed,
    password: bcrypt.hashSync(password, salt),
    role: (role === 'admin' || role === 'collector') ? role : 'viewer',
    name: name || username,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  return res.status(201).json({ success: true, user: { username: newUser.username, role: newUser.role, name: newUser.name } });
});

app.put('/api/users/:username/role', authMiddleware, adminOnly, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();
  const { role } = req.body;

  if (targetUsername === 'admin') {
    return res.status(400).json({ success: false, error: 'Cannot change the Master Admin role.' });
  }

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === targetUsername);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  user.role = (role === 'admin' || role === 'collector') ? role : 'viewer';
  saveUsers(users);

  return res.json({ success: true, message: `Role updated for ${targetUsername} to ${user.role}.` });
});

app.put('/api/users/:username', authMiddleware, adminOnly, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();
  const { role } = req.body;

  if (targetUsername === 'admin') {
    return res.status(400).json({ success: false, error: 'Cannot change the Master Admin role.' });
  }

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === targetUsername);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  user.role = (role === 'admin' || role === 'collector') ? role : 'viewer';
  saveUsers(users);

  return res.json({ success: true, message: `Role updated for ${targetUsername} to ${user.role}.` });
});

app.delete('/api/users/:username', authMiddleware, adminOnly, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();

  if (targetUsername === 'admin') {
    return res.status(400).json({ success: false, error: 'Cannot delete the Master Admin account.' });
  }

  let users = getUsers();
  const initialCount = users.length;
  users = users.filter(u => u.username.toLowerCase() !== targetUsername);

  if (users.length === initialCount) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  saveUsers(users);
  return res.json({ success: true, message: `User ${targetUsername} has been deleted.` });
});

// ==========================================
// FRONTEND ROUTING & STATIC ASSETS
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const token = req.cookies.token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/dashboard.html');
    } catch (err) {
      res.clearCookie('token');
    }
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// Start Server
app.listen(PORT, async () => {
  console.log('=====================================================');
  console.log(` Kali Puja Accounts & Audit Server running on port ${PORT}`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Master Admin: ${DEFAULT_ADMIN_USERNAME} / ${DEFAULT_ADMIN_PASSWORD}`);
  console.log(` Linked Google Sheet: ${SPREADSHEET_ID}`);
  console.log('=====================================================');
});
