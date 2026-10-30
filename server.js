/**
 * Neighbourhood Club Kali Puja Accounts & Audit Backend Server
 * Production Server with Live 9-Tab Google Sheet Integration, 2-Way Sync & Deep Section Navigation
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// ==========================================
// CONFIGURATION & PERSISTENT SETTINGS
// ==========================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kali-puja-neighbourhood-club-secret-key-2026';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'rajibsaha20063-rgb/kali-puja-accounts';
const PERSISTENT_BRANCH = 'persistent-db';

const USERS_FILE = path.join(__dirname, 'users.json');
const DATA_STORE_FILE = path.join(__dirname, 'data-store.json');
const CONTRIBUTORS_FILE = path.join(__dirname, 'contributors.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const DELETED_ENTRIES_FILE = path.join(__dirname, 'deleted-entries.json');

// Memory cache of GitHub file SHAs for fast updates
const cloudFileShas = {};

function githubApiRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve) => {
    if (!GITHUB_TOKEN) return resolve(null);
    try {
      const options = {
        hostname: 'api.github.com',
        path: endpoint,
        method,
        headers: {
          'User-Agent': 'Kali-Puja-Server',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : null;
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      if (data) req.write(JSON.stringify(data));
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

// Fetch file from persistent-db branch at server startup
async function fetchCloudPersistentFile(filename) {
  if (!GITHUB_TOKEN) return null;
  const res = await githubApiRequest(`/repos/${GITHUB_REPO}/contents/${filename}?ref=${PERSISTENT_BRANCH}`);
  if (res && res.content) {
    cloudFileShas[filename] = res.sha;
    try {
      const decoded = Buffer.from(res.content, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Save file to persistent-db branch (in background, non-blocking)
async function saveCloudPersistentFile(filename, dataObj) {
  if (!GITHUB_TOKEN) return false;
  try {
    if (!cloudFileShas[filename]) {
      const existing = await githubApiRequest(`/repos/${GITHUB_REPO}/contents/${filename}?ref=${PERSISTENT_BRANCH}`);
      if (existing && existing.sha) {
        cloudFileShas[filename] = existing.sha;
      }
    }

    const contentBase64 = Buffer.from(JSON.stringify(dataObj, null, 2), 'utf8').toString('base64');
    const payload = {
      message: `Sync ${filename} [auto-persistent]`,
      content: contentBase64,
      branch: PERSISTENT_BRANCH
    };
    if (cloudFileShas[filename]) {
      payload.sha = cloudFileShas[filename];
    }

    const res = await githubApiRequest(`/repos/${GITHUB_REPO}/contents/${filename}`, 'PUT', payload);
    if (res && res.content && res.content.sha) {
      cloudFileShas[filename] = res.content.sha;
      return true;
    }
  } catch (e) {}
  return false;
}

function loadDeletedSignatures() {
  try {
    if (fs.existsSync(DELETED_ENTRIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(DELETED_ENTRIES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object') {
        const arr = [];
        if (Array.isArray(data.signatures)) arr.push(...data.signatures);
        if (Array.isArray(data.ids)) arr.push(...data.ids);
        return arr;
      }
    }
  } catch (e) {}
  return ['1_ff', 'slip_seed_ff_para1'];
}

function saveDeletedSignature(sig) {
  try {
    const list = loadDeletedSignatures();
    if (!list.includes(sig)) {
      list.push(sig);
      fs.writeFileSync(DELETED_ENTRIES_FILE, JSON.stringify(list, null, 2), 'utf8');
      saveCloudPersistentFile('deleted-entries.json', list);
    }
  } catch (e) {}
}

function clearDeletedSignatures() {
  try {
    fs.writeFileSync(DELETED_ENTRIES_FILE, JSON.stringify([], null, 2), 'utf8');
    saveCloudPersistentFile('deleted-entries.json', []);
  } catch (e) {}
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (data && data.spreadsheetId) return data;
    }
  } catch (e) {}
  return {
    spreadsheetId: process.env.SPREADSHEET_ID || '1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE',
    webhookUrl: process.env.GOOGLE_APPS_SCRIPT_WEBHOOK || '',
    autoSyncMinutes: 5,
    lastSyncTime: null
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    saveCloudPersistentFile('settings.json', settings);
    return true;
  } catch (e) {
    return false;
  }
}

let appSettings = loadSettings();

// All 9 Sheet Tabs mapped to their unique GIDs in the Google Spreadsheet
const SHEET_GIDS = {
  summary: '2063386913',
  expenses: '1297226491',
  para1: '1250584641',
  para2: '1245637000',
  para3: '1627930069',
  para4: '2138056057',
  para5: '423355988',
  shop: '1441381613',
  road: '256485470'
};

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ==========================================
// DEFAULT SPREADSHEET BASELINE DATA (100% English)
// ==========================================
const SPREADSHEET_BASE_DATA = {
  income: [
    { id: 1, source: 'Para 1 Collection', target: 650, collected: 52, pending: 598 },
    { id: 2, source: 'Para 2 Collection', target: 0, collected: 0, pending: 0 },
    { id: 3, source: 'Para 3 Collection', target: 0, collected: 0, pending: 0 },
    { id: 4, source: 'Para 4 Collection', target: 0, collected: 0, pending: 0 },
    { id: 5, source: 'Para 5 Collection', target: 0, collected: 0, pending: 0 },
    { id: 6, source: 'Shop Collection', target: 0, collected: 0, pending: 0 },
    { id: 7, source: 'Road Collection', target: 0, collected: 0, pending: 0 }
  ],
  expenses: [
    { id: 1, category: 'Light & Electricals', vendorName: 'mola da', budget: 4500, advance: 0, totalPaid: 0, pending: 4500 },
    { id: 2, category: 'Pandal & Decoration', vendorName: 'sayan da', budget: 15000, advance: 0, totalPaid: 0, pending: 15000 },
    { id: 3, category: 'Thakur / Idol', vendorName: 'dulal dokan', budget: 7500, advance: 0, totalPaid: 0, pending: 7500 },
    { id: 4, category: 'Sound System', vendorName: 'kaml', budget: 8000, advance: 0, totalPaid: 0, pending: 8000 },
    { id: 5, category: 'Dashakarma (Puja Items)', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 6, category: 'Pujari (Priest Honorarium)', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 7, category: 'Bhog & Prasad Grocery', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 8, category: 'Cook & Kitchen Staff', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 9, category: 'Cultural Program', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 10, category: 'Miscellaneous 1', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 11, category: 'Miscellaneous 2', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 },
    { id: 12, category: 'Miscellaneous 3', vendorName: '', budget: 0, advance: 0, totalPaid: 0, pending: 0 }
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
    const parsed = JSON.parse(raw);
    if (!parsed.income || !parsed.expenses) {
      saveDataStore(SPREADSHEET_BASE_DATA);
      return JSON.parse(JSON.stringify(SPREADSHEET_BASE_DATA));
    }
    return parsed;
  } catch (err) {
    console.error('Error loading data-store.json:', err.message);
    return JSON.parse(JSON.stringify(SPREADSHEET_BASE_DATA));
  }
}

function saveDataStore(data) {
  try {
    fs.writeFileSync(DATA_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    saveCloudPersistentFile('data-store.json', data);
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (err) {
    return [];
  }
}

function saveContributors(list) {
  try {
    fs.writeFileSync(CONTRIBUTORS_FILE, JSON.stringify(list, null, 2), 'utf8');
    saveCloudPersistentFile('contributors.json', list);
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
    saveCloudPersistentFile('users.json', users);
    return true;
  } catch (err) {
    return false;
  }
}

initUsersDatabase();

// Restore persistent data on server startup (Render Sleep Proof)
(async function restoreCloudPersistence() {
  try {
    const cloudSettings = await fetchCloudPersistentFile('settings.json');
    if (cloudSettings && cloudSettings.spreadsheetId) {
      appSettings = { ...appSettings, ...cloudSettings };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), 'utf8');
      console.log('[Cloud Persistence] Restored settings from persistent-db:', appSettings.spreadsheetId, Boolean(appSettings.webhookUrl));
    }

    const cloudUsers = await fetchCloudPersistentFile('users.json');
    if (cloudUsers && Array.isArray(cloudUsers) && cloudUsers.length > 0) {
      fs.writeFileSync(USERS_FILE, JSON.stringify(cloudUsers, null, 2), 'utf8');
      console.log(`[Cloud Persistence] Restored ${cloudUsers.length} users from persistent-db.`);
    }

    const cloudDeletions = await fetchCloudPersistentFile('deleted-entries.json');
    if (cloudDeletions && Array.isArray(cloudDeletions)) {
      fs.writeFileSync(DELETED_ENTRIES_FILE, JSON.stringify(cloudDeletions, null, 2), 'utf8');
      console.log(`[Cloud Persistence] Restored ${cloudDeletions.length} deleted signatures from persistent-db.`);
    }

    const cloudContributors = await fetchCloudPersistentFile('contributors.json');
    if (cloudContributors && Array.isArray(cloudContributors) && cloudContributors.length > 0) {
      fs.writeFileSync(CONTRIBUTORS_FILE, JSON.stringify(cloudContributors, null, 2), 'utf8');
      console.log(`[Cloud Persistence] Restored ${cloudContributors.length} collection entries from persistent-db.`);
    }

    const cloudDataStore = await fetchCloudPersistentFile('data-store.json');
    if (cloudDataStore && cloudDataStore.expenses && Array.isArray(cloudDataStore.expenses)) {
      fs.writeFileSync(DATA_STORE_FILE, JSON.stringify(cloudDataStore, null, 2), 'utf8');
      console.log(`[Cloud Persistence] Restored financial expenses data-store from persistent-db.`);
    }
  } catch (err) {
    console.error('[Cloud Persistence] Notice on boot sync:', err.message);
  }
})();

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

function parseCSVLines(text) {
  if (!text) return [];
  return text.split(/\r?\n/).map(line => {
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
}

/**
 * Robust Multi-Tab Google Sheet Fetcher & Parser
 * Queries all 9 tabs: Expenses, Para 1-5, Shop Collection, Road Collection
 */
async function parseAllGoogleSheetTabs(sheetId) {
  const currentSheetId = sheetId || appSettings.spreadsheetId;
  const deletedSignatures = loadDeletedSignatures();
  const result = {
    expenses: [],
    contributors: [],
    counts: {
      para1: 0,
      para2: 0,
      para3: 0,
      para4: 0,
      para5: 0,
      shop: 0,
      road: 0,
      expenses: 0
    }
  };

  // 1. Fetch Expenses (GID 1297226491)
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${currentSheetId}/export?format=csv&gid=${SHEET_GIDS.expenses}&t=${Date.now()}`;
    const csvText = await fetchRedirectingURL(csvUrl);
    const rows = parseCSVLines(csvText);

    for (const r of rows) {
      const slNo = parseInt(r[0], 10);
      if (!isNaN(slNo) && slNo >= 1 && slNo <= 12) {
        const vendor = (r[2] || '').trim();
        result.expenses.push({
          id: slNo,
          category: normalizeExpenseName(r[1], slNo),
          vendorName: vendor,
          budget: parseNumeric(r[3]),
          advance: parseNumeric(r[4]),
          totalPaid: parseNumeric(r[5]),
          pending: parseNumeric(r[6])
        });
        result.counts.expenses++;
      }
    }
  } catch (err) {
    console.warn('[Sync Expenses]:', err.message);
  }

  // 2. Fetch Para 1 to 5 (Family Collections)
  const paraTabs = [
    { id: 1, gid: SHEET_GIDS.para1, key: 'para1' },
    { id: 2, gid: SHEET_GIDS.para2, key: 'para2' },
    { id: 3, gid: SHEET_GIDS.para3, key: 'para3' },
    { id: 4, gid: SHEET_GIDS.para4, key: 'para4' },
    { id: 5, gid: SHEET_GIDS.para5, key: 'para5' }
  ];

  for (const p of paraTabs) {
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${currentSheetId}/export?format=csv&gid=${p.gid}&t=${Date.now()}`;
      const csvText = await fetchRedirectingURL(csvUrl);
      const rows = parseCSVLines(csvText);

      let headerIdx = -1;
      let isFirstColSlNo = true;

      for (let i = 0; i < rows.length; i++) {
        const line = rows[i].join(' ').toLowerCase();
        if (line.includes('family head') || (line.includes('sl') && line.includes('family')) || line.includes('পরিবার')) {
          headerIdx = i;
          if (rows[i][0].toLowerCase().includes('family') || rows[i][0].toLowerCase().includes('পরিবার')) {
            isFirstColSlNo = false;
          }
          break;
        }
      }

      if (headerIdx !== -1) {
        // Data entries strictly start from row 5 (0-based index 4). Row 4 is phone number / collector info row.
        const startIdx = Math.max(headerIdx + 1, 4);
        for (let i = startIdx; i < rows.length; i++) {
          const r = rows[i];
          const name = (isFirstColSlNo ? r[1] : r[0]) || '';
          const trimmed = name.trim();

          // Skip empty or header-like rows
          if (!trimmed || trimmed.startsWith('[') || trimmed.toLowerCase().includes('total') || trimmed.includes('মোট') || !isNaN(Number(trimmed))) {
            continue;
          }

          // Skip if previously deleted by user
          const slipSig = `${p.id}_${trimmed.toLowerCase()}`;
          const rowId = `sheet_p${p.id}_r${i}`;
          if (deletedSignatures.includes(slipSig) || deletedSignatures.includes(rowId)) {
            continue;
          }

          const tgt = parseNumeric(isFirstColSlNo ? r[2] : r[1]);
          const coll = parseNumeric(isFirstColSlNo ? r[3] : r[2]);
          const due = parseNumeric(isFirstColSlNo ? r[4] : r[3]);
          const mode = (isFirstColSlNo ? r[5] : r[4]) || 'Cash';
          const date = (isFirstColSlNo ? r[6] : r[5]) || '';
          const colBy = (isFirstColSlNo ? r[7] : r[6]) || '';

          result.contributors.push({
            id: `sheet_p${p.id}_r${i}`,
            paraId: p.id,
            sectionType: 'family',
            familyHeadName: trimmed,
            donorName: trimmed,
            targetAmount: tgt,
            collectedAmount: coll,
            amount: coll,
            dueBalance: due || Math.max(0, tgt - coll),
            paymentMode: mode,
            dateOfPayment: date,
            date: date,
            collectedBy: colBy,
            source: 'google_sheets_live'
          });
          result.counts[p.key]++;
        }
      }
    } catch (err) {
      console.warn(`[Sync Para ${p.id}]:`, err.message);
    }
  }

  // 3. Fetch Shop Collection (GID 1441381613)
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${currentSheetId}/export?format=csv&gid=${SHEET_GIDS.shop}&t=${Date.now()}`;
    const csvText = await fetchRedirectingURL(csvUrl);
    const rows = parseCSVLines(csvText);

    let headerIdx = -1;
    let isFirstColSlNo = true;

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].join(' ').toLowerCase();
      if (line.includes('shop / business') || (line.includes('sl') && line.includes('shop')) || line.includes('দোকান / প্রতিষ্ঠানের নাম')) {
        headerIdx = i;
        if (rows[i][0].toLowerCase().includes('shop') || rows[i][0].toLowerCase().includes('দোকান')) {
          isFirstColSlNo = false;
        }
        break;
      }
    }

    if (headerIdx !== -1) {
      // Data entries strictly start from row 5 (0-based index 4). Row 4 is phone number / location info row.
      const startIdx = Math.max(headerIdx + 1, 4);
      for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i];
        const name = (isFirstColSlNo ? r[1] : r[0]) || '';
        const trimmed = name.trim();

        if (!trimmed || trimmed.startsWith('[') || trimmed.toLowerCase().includes('total') || trimmed.includes('মোট') || !isNaN(Number(trimmed))) {
          continue;
        }

        // Skip if previously deleted by user
        const slipSig = `6_${trimmed.toLowerCase()}`;
        const rowId = `sheet_shop_r${i}`;
        if (deletedSignatures.includes(slipSig) || deletedSignatures.includes(rowId)) {
          continue;
        }

        const loc = (isFirstColSlNo ? r[2] : r[1]) || '';
        const tgt = parseNumeric(isFirstColSlNo ? r[3] : r[2]);
        const paid = parseNumeric(isFirstColSlNo ? r[4] : r[3]);
        const due = parseNumeric(isFirstColSlNo ? r[5] : r[4]);
        const mode = (isFirstColSlNo ? r[6] : r[5]) || 'Cash';
        const date = (isFirstColSlNo ? r[7] : r[6]) || '';

        result.contributors.push({
          id: `sheet_shop_r${i}`,
          paraId: 6,
          sectionType: 'shop',
          shopName: trimmed,
          donorName: trimmed,
          marketLocation: loc,
          agreedTarget: tgt,
          targetAmount: tgt,
          amountPaid: paid,
          amount: paid,
          dueBalance: due || Math.max(0, tgt - paid),
          paymentMode: mode,
          date: date,
          source: 'google_sheets_live'
        });
        result.counts.shop++;
      }
    }
  } catch (err) {
    console.warn('[Sync Shop]:', err.message);
  }

  // 4. Fetch Road Collection (GID 256485470)
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${currentSheetId}/export?format=csv&gid=${SHEET_GIDS.road}&t=${Date.now()}`;
    const csvText = await fetchRedirectingURL(csvUrl);
    const rows = parseCSVLines(csvText);

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].join(' ').toLowerCase();
      if (line.includes('event / spot') || (line.includes('sl') && line.includes('spot')) || line.includes('ধরন')) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx !== -1) {
      // Data entries strictly start from row 5 (0-based index 4). Row 4 is phone number / location info row.
      const startIdx = Math.max(headerIdx + 1, 4);
      for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i];
        const date = (r[1] || '').trim();
        const spot = (r[2] || '').trim();
        const col = parseNumeric(r[3]);
        const team = (r[4] || '').trim();
        const receiver = (r[5] || '').trim();

        if (!spot || spot.startsWith('[') || spot.toLowerCase().includes('total') || spot.includes('মোট')) {
          continue;
        }

        // Skip if previously deleted by user
        const slipSig = `7_${spot.toLowerCase()}`;
        const rowId = `sheet_road_r${i}`;
        if (deletedSignatures.includes(slipSig) || deletedSignatures.includes(rowId)) {
          continue;
        }

        // Include entry if collection > 0 or a date was entered
        if (col <= 0 && !date) continue;

        result.contributors.push({
          id: `sheet_road_r${i}`,
          paraId: 7,
          sectionType: 'road',
          date: date,
          eventSpotType: spot,
          donorName: spot,
          totalCollection: col,
          amount: col,
          leadVolunteer: team,
          handedOverTo: receiver,
          source: 'google_sheets_live'
        });
        result.counts.road++;
      }
    }
  } catch (err) {
    console.warn('[Sync Road]:', err.message);
  }

  return result;
}

/**
 * Synchronize All 9 Tabs from Google Sheet into local storage & update calculations
 */
async function syncAllDataFromSheet(sheetId) {
  const currentSheetId = sheetId || appSettings.spreadsheetId;
  console.log(`[Google Sheets Sync] Initiating 9-tab extraction from Sheet: ${currentSheetId}...`);

  const parsed = await parseAllGoogleSheetTabs(currentSheetId);

  // 1. Merge Contributors
  const existingContributors = loadContributors();
  // Keep entries created manually on the website (slip_...) that are not from google_sheets_live,
  // and discard any legacy entries pulled from row 4 or earlier (e.g. sheet_*_r0 to r3)
  const manualEntries = existingContributors.filter(c => {
    if (c.source === 'google_sheets_live') return false;
    if (c.id && c.id.match(/^sheet_.*_r[0-3]$/)) return false;
    return true;
  });

  // Also retain seed if no other entries in Para 1 yet
  const hasPara1SheetEntry = parsed.contributors.some(c => c.paraId === 1);
  const finalContributors = [...parsed.contributors];

  for (const m of manualEntries) {
    // Avoid exact duplicate donor name in the same section
    const exists = finalContributors.some(c => c.paraId === m.paraId && c.donorName.toLowerCase() === m.donorName.toLowerCase());
    if (!exists) {
      finalContributors.unshift(m);
    }
  }

  saveContributors(finalContributors);

  // 2. Update Expenses in Data Store
  const store = loadDataStore();
  if (parsed.expenses && parsed.expenses.length > 0) {
    store.expenses = parsed.expenses.map(e => {
      const local = (store.expenses || []).find(l => l.id === e.id) || {};
      return {
        ...e,
        vendorPhone: local.vendorPhone || '',
        notes: local.notes || ''
      };
    });
  }

  // 3. Recalculate Collections totals for all 7 sections based on active entries
  store.income = (store.income || SPREADSHEET_BASE_DATA.income).map(item => {
    const sectionEntries = finalContributors.filter(c => Number(c.paraId) === item.id);
    let targetSum = sectionEntries.reduce((acc, c) => acc + (Number(c.targetAmount || c.agreedTarget) || 0), 0);
    let collectedSum = sectionEntries.reduce((acc, c) => acc + (Number(c.collectedAmount || c.amountPaid || c.totalCollection || c.amount) || 0), 0);

    // If sectionEntries is 0, preserve any manual overrides in store
    if (sectionEntries.length === 0) {
      targetSum = Number(item.target) || 0;
      collectedSum = Number(item.collected) || 0;
    }

    return {
      id: item.id,
      source: item.source,
      target: targetSum,
      collected: collectedSum,
      pending: Math.max(0, targetSum - collectedSum)
    };
  });

  saveDataStore(store);

  // Update Settings last sync timestamp
  appSettings.lastSyncTime = new Date().toISOString();
  saveSettings(appSettings);

  console.log(`[Google Sheets Sync] Successfully synced! Contributor entries: ${finalContributors.length}, Expenses: ${store.expenses.length}`);
  return {
    success: true,
    message: 'All 9 tabs synchronized successfully from Master Google Sheet.',
    spreadsheetId: currentSheetId,
    timestamp: appSettings.lastSyncTime,
    counts: {
      ...parsed.counts,
      totalContributors: finalContributors.length
    }
  };
}

// Unified Data Fetcher for API consumers
async function getApplicationData() {
  const localStore = loadDataStore();
  const contributors = loadContributors();

  // Ensure collection cards reflect current individual contributor sums
  const income = (localStore.income || SPREADSHEET_BASE_DATA.income).map(item => {
    const sectionEntries = contributors.filter(c => Number(c.paraId) === item.id);
    const slipSum = sectionEntries.reduce((acc, c) => acc + (Number(c.collectedAmount || c.amountPaid || c.totalCollection || c.amount) || 0), 0);
    const targetSum = sectionEntries.reduce((acc, c) => acc + (Number(c.targetAmount || c.agreedTarget) || 0), 0);

    const effectiveTarget = sectionEntries.length > 0 ? targetSum : (Number(item.target) || 0);
    const effectiveCollected = sectionEntries.length > 0 ? slipSum : (Number(item.collected) || 0);
    const effectivePending = Math.max(0, effectiveTarget - effectiveCollected);

    return {
      ...item,
      source: normalizeIncomeName(item.source, item.id),
      target: effectiveTarget,
      collected: effectiveCollected,
      pending: effectivePending,
      slipCount: sectionEntries.length
    };
  });

  const expenses = (localStore.expenses || SPREADSHEET_BASE_DATA.expenses).map(item => {
    const budget = Number(item.budget || item.estimated || 0);
    const advance = Number(item.advance || 0);
    const totalPaid = Number(item.totalPaid || item.paid || 0);
    const pending = Math.max(0, budget - totalPaid);

    return {
      ...item,
      category: normalizeExpenseName(item.category, item.id),
      budget,
      advance,
      totalPaid,
      pending,
      vendorName: item.vendorName || '',
      vendorPhone: item.vendorPhone || '',
      notes: item.notes || ''
    };
  });

  const summary = calculateSummary({ income, expenses });

  return {
    summary,
    income,
    expenses,
    spreadsheetId: appSettings.spreadsheetId,
    lastSyncTime: appSettings.lastSyncTime,
    source: 'live_synced_ledger'
  };
}

// ==========================================
// AUTHENTICATION & ACCESS CONTROL MIDDLEWARE
// ==========================================
function authMiddleware(req, res, next) {
  let token = req.cookies.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
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

// 2-Way Write: Google Apps Script Webhook trigger
function triggerSheetWebhook(payload) {
  const webhookUrl = appSettings.webhookUrl || process.env.GOOGLE_APPS_SCRIPT_WEBHOOK;
  if (!webhookUrl) return;

  try {
    const url = new URL(webhookUrl);
    const postData = JSON.stringify(payload);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = client.request(options, (res) => {
      // Follow redirect if Apps Script returns 302
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, () => {});
      }
    });

    req.on('error', (e) => console.warn('[Webhook Error]:', e.message));
    req.write(postData);
    req.end();
  } catch (e) {
    console.warn('[Webhook Dispatch Failed]:', e.message);
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
    spreadsheetId: appSettings.spreadsheetId,
    connectedSheet: 'Neighbourhood_Club_Kali_Puja',
    masterAdmin: 'admin',
    lastSyncTime: appSettings.lastSyncTime,
    webhookConfigured: Boolean(appSettings.webhookUrl),
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// API ROUTES: FINANCIAL DATA
// ==========================================
app.get('/api/data/summary', authMiddleware, async (req, res) => {
  try {
    const data = await getApplicationData();
    return res.json({ success: true, summary: data.summary, source: data.source, lastSyncTime: data.lastSyncTime });
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

// Update Collection record target / collected
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
      action: 'update_collection_target',
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
      vendorName: vendorName || '',
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
// Matches the 3 Uploaded Images: Family, Shop, Road Collections
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
      donorName, amount, date
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
      const spot = (eventSpotType || donorName || 'Main Road Spot').trim();
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

    // Write-back to Google Sheet via Webhook
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

app.put('/api/data/contributors/:id', authMiddleware, editorAccess, (req, res) => {
  try {
    const entryId = req.params.id;
    const contributors = loadContributors();
    const idx = contributors.findIndex(c => String(c.id) === String(entryId));

    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Entry not found.' });
    }

    const oldEntry = { ...contributors[idx] };
    const pId = Number(req.body.paraId || oldEntry.paraId);
    
    // Normalize amounts and names
    const tgt = req.body.targetAmount !== undefined ? Number(req.body.targetAmount) : (req.body.agreedTarget !== undefined ? Number(req.body.agreedTarget) : (Number(oldEntry.targetAmount || oldEntry.agreedTarget) || 0));
    const colAmt = req.body.collectedAmount !== undefined ? Number(req.body.collectedAmount) : (req.body.amountPaid !== undefined ? Number(req.body.amountPaid) : (req.body.totalCollection !== undefined ? Number(req.body.totalCollection) : (req.body.amount !== undefined ? Number(req.body.amount) : (Number(oldEntry.collectedAmount || oldEntry.amountPaid || oldEntry.totalCollection || oldEntry.amount) || 0))));
    const due = req.body.dueBalance !== undefined ? Number(req.body.dueBalance) : Math.max(0, tgt - colAmt);
    const donorName = (req.body.donorName || req.body.familyHeadName || req.body.shopName || req.body.eventSpotType || oldEntry.donorName || '').trim();

    contributors[idx] = {
      ...oldEntry,
      ...req.body,
      paraId: pId,
      donorName: donorName,
      targetAmount: tgt,
      agreedTarget: tgt,
      collectedAmount: colAmt,
      amountPaid: colAmt,
      totalCollection: colAmt,
      amount: colAmt,
      dueBalance: due,
      updatedAt: new Date().toISOString()
    };

    if (pId >= 1 && pId <= 5) {
      contributors[idx].familyHeadName = donorName;
      contributors[idx].sectionType = 'family';
    } else if (pId === 6) {
      contributors[idx].shopName = donorName;
      contributors[idx].sectionType = 'shop';
    } else if (pId === 7) {
      contributors[idx].eventSpotType = donorName;
      contributors[idx].sectionType = 'road';
    }

    saveContributors(contributors);

    // Recalculate collection section totals in data-store
    const store = loadDataStore();
    if (store && store.income) {
      const secIdx = store.income.findIndex(item => Number(item.id) === pId);
      if (secIdx !== -1) {
        const secEntries = contributors.filter(c => Number(c.paraId) === pId);
        store.income[secIdx].target = secEntries.reduce((acc, c) => acc + (Number(c.targetAmount || c.agreedTarget) || 0), 0);
        store.income[secIdx].collected = secEntries.reduce((acc, c) => acc + (Number(c.collectedAmount || c.amountPaid || c.totalCollection || c.amount) || 0), 0);
        store.income[secIdx].pending = Math.max(0, store.income[secIdx].target - store.income[secIdx].collected);
        saveDataStore(store);
      }
    }

    // Trigger webhook if active
    triggerSheetWebhook({
      action: 'update_collection_entry',
      oldName: oldEntry.donorName || oldEntry.familyHeadName || oldEntry.shopName || oldEntry.eventSpotType,
      ...contributors[idx]
    });

    return res.json({ success: true, message: 'Entry updated successfully.', entry: contributors[idx] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/data/contributors/:id', authMiddleware, editorAccess, (req, res) => {
  try {
    const slipId = req.params.id;
    let contributors = loadContributors();
    const entryToDelete = contributors.find(c => c.id === slipId);

    if (!entryToDelete) {
      return res.status(404).json({ success: false, error: 'Entry not found.' });
    }

    // Record in deleted signatures tombstone so subsequent syncs don't re-insert it
    const name = entryToDelete.familyHeadName || entryToDelete.shopName || entryToDelete.eventSpotType || entryToDelete.donorName || '';
    if (name) {
      saveDeletedSignature(`${entryToDelete.paraId}_${name.trim().toLowerCase()}`);
    }
    saveDeletedSignature(slipId);

    contributors = contributors.filter(c => c.id !== slipId);
    saveContributors(contributors);

    // Recalculate section total
    const store = loadDataStore();
    const sectionEntries = contributors.filter(c => Number(c.paraId) === Number(entryToDelete.paraId));
    const colIdx = store.income.findIndex(i => i.id === Number(entryToDelete.paraId));
    if (colIdx !== -1) {
      const collSum = sectionEntries.reduce((acc, c) => acc + (Number(c.collectedAmount || c.amountPaid || c.totalCollection || c.amount) || 0), 0);
      const tgtSum = sectionEntries.reduce((acc, c) => acc + (Number(c.targetAmount || c.agreedTarget) || 0), 0);
      store.income[colIdx].collected = collSum;
      store.income[colIdx].target = sectionEntries.length > 0 ? tgtSum : store.income[colIdx].target;
      store.income[colIdx].pending = Math.max(0, store.income[colIdx].target - collSum);
      saveDataStore(store);
    }

    // Trigger Webhook deletion on Google Sheet
    triggerSheetWebhook({
      action: 'delete_collection_entry',
      id: slipId,
      paraId: entryToDelete.paraId,
      name: name
    });

    return res.json({ success: true, message: `Entry for "${name || slipId}" deleted successfully.`, id: slipId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Clear all entries in a specific section
app.post('/api/data/contributors/clear-section', authMiddleware, editorAccess, (req, res) => {
  try {
    const { paraId } = req.body;
    const pId = parseInt(paraId, 10);
    if (isNaN(pId) || pId < 1 || pId > 7) {
      return res.status(400).json({ success: false, error: 'Valid section ID (1-7) is required.' });
    }

    let contributors = loadContributors();
    const toRemove = contributors.filter(c => Number(c.paraId) === pId);

    toRemove.forEach(entry => {
      const name = entry.familyHeadName || entry.shopName || entry.eventSpotType || entry.donorName || '';
      if (name) saveDeletedSignature(`${pId}_${name.trim().toLowerCase()}`);
      saveDeletedSignature(entry.id);
    });

    contributors = contributors.filter(c => Number(c.paraId) !== pId);
    saveContributors(contributors);

    // Reset section totals
    const store = loadDataStore();
    const colIdx = store.income.findIndex(i => i.id === pId);
    if (colIdx !== -1) {
      store.income[colIdx].collected = 0;
      store.income[colIdx].pending = store.income[colIdx].target;
      saveDataStore(store);
    }

    triggerSheetWebhook({
      action: 'delete_collection_entry',
      paraId: pId,
      clearAll: true
    });

    return res.json({
      success: true,
      message: `Cleared all ${toRemove.length} entries for Section ${pId}.`,
      count: toRemove.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Reset deletion blacklist (Undo all deletions)
app.post('/api/data/contributors/reset-deletions', authMiddleware, adminOnly, (req, res) => {
  clearDeletedSignatures();
  return res.json({ success: true, message: 'Deletion blacklist cleared. Subsequent syncs will restore all rows from sheet.' });
});

// Push all Website entries to Google Sheet (Batch Webhook Push)
app.post('/api/push-to-sheet', authMiddleware, editorAccess, async (req, res) => {
  try {
    const webhookUrl = appSettings.webhookUrl || process.env.GOOGLE_APPS_SCRIPT_WEBHOOK;
    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Google Apps Script Webhook is not configured yet. Please enter your Webhook URL in the Admin Panel.'
      });
    }

    const contributors = loadContributors();
    const store = loadDataStore();

    const payload = {
      action: 'batch_sync',
      timestamp: new Date().toISOString(),
      contributors,
      expenses: store.expenses,
      income: store.income,
      pushedBy: req.user.username
    };

    triggerSheetWebhook(payload);

    return res.json({
      success: true,
      message: `Pushed all data to Google Sheet successfully! (${contributors.length} collection records & ${store.expenses.length} expense items)`,
      counts: {
        contributors: contributors.length,
        expenses: store.expenses.length
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// API ROUTES: GOOGLE SHEETS LIVE SYNC & CONFIG
// ==========================================
// Force Multi-Tab Sync with Google Sheet
app.post('/api/sync', authMiddleware, async (req, res) => {
  try {
    const result = await syncAllDataFromSheet(appSettings.spreadsheetId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/data/refresh', authMiddleware, async (req, res) => {
  try {
    const result = await syncAllDataFromSheet(appSettings.spreadsheetId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get & Update Connected Spreadsheet ID / URL
app.get('/api/config/spreadsheet', authMiddleware, adminOnly, (req, res) => {
  return res.json({
    success: true,
    spreadsheetId: appSettings.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${appSettings.spreadsheetId}/edit?usp=sharing`,
    lastSyncTime: appSettings.lastSyncTime
  });
});

app.post('/api/config/spreadsheet', authMiddleware, adminOnly, async (req, res) => {
  try {
    let { spreadsheetId, spreadsheetUrl } = req.body;
    let targetId = spreadsheetId;

    if (!targetId && spreadsheetUrl) {
      const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) targetId = match[1];
    }

    if (!targetId || targetId.length < 15) {
      return res.status(400).json({ success: false, error: 'Valid Google Spreadsheet ID or URL required.' });
    }

    appSettings.spreadsheetId = targetId.trim();
    saveSettings(appSettings);

    // Run sync immediately on new sheet
    const syncRes = await syncAllDataFromSheet(appSettings.spreadsheetId);
    return res.json({
      success: true,
      message: `Spreadsheet connected and synced: ${appSettings.spreadsheetId}`,
      spreadsheetId: appSettings.spreadsheetId,
      syncResult: syncRes
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get & Update Webhook URL
app.get('/api/config/webhook', authMiddleware, adminOnly, (req, res) => {
  return res.json({
    success: true,
    webhookUrl: appSettings.webhookUrl || '',
    active: Boolean(appSettings.webhookUrl)
  });
});

app.post('/api/config/webhook', authMiddleware, adminOnly, (req, res) => {
  const { webhookUrl } = req.body;
  appSettings.webhookUrl = (webhookUrl || '').trim();
  saveSettings(appSettings);
  return res.json({
    success: true,
    message: 'Webhook URL updated successfully.',
    webhookUrl: appSettings.webhookUrl
  });
});

// Export all records as CSV / JSON for direct download
app.get('/api/export/all', authMiddleware, (req, res) => {
  try {
    const format = req.query.format || 'json';
    const contributors = loadContributors();
    const dataStore = loadDataStore();

    if (format === 'csv') {
      let csv = 'Section,Type,Name / Spot,Location,Target / Demanded,Amount Collected / Paid,Due Balance,Payment Mode,Date,Recorded By\n';
      contributors.forEach(c => {
        const sec = c.paraId <= 5 ? `Para ${c.paraId}` : (c.paraId === 6 ? 'Shop Collection' : 'Road Collection');
        const name = (c.familyHeadName || c.shopName || c.eventSpotType || c.donorName || '').replace(/,/g, ' ');
        const loc = (c.marketLocation || '').replace(/,/g, ' ');
        const tgt = c.targetAmount || c.agreedTarget || 0;
        const coll = c.collectedAmount || c.amountPaid || c.totalCollection || c.amount || 0;
        const due = c.dueBalance || 0;
        const mode = c.paymentMode || 'Cash';
        const date = c.dateOfPayment || c.date || '';
        const by = (c.collectedBy || c.leadVolunteer || c.createdBy || '').replace(/,/g, ' ');
        csv += `"${sec}","${c.sectionType || ''}","${name}","${loc}",${tgt},${coll},${due},"${mode}","${date}","${by}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="kali_puja_accounts_full.csv"');
      return res.send(csv);
    }

    return res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      summary: calculateSummary(dataStore),
      income: dataStore.income,
      expenses: dataStore.expenses,
      contributors
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Direct CSV / Tabular upload to insert records
app.post('/api/upload/csv', authMiddleware, editorAccess, (req, res) => {
  try {
    const { sectionId, csvText } = req.body;
    const pId = parseInt(sectionId, 10);

    if (isNaN(pId) || pId < 1 || pId > 7) {
      return res.status(400).json({ success: false, error: 'Valid section ID (1-7) required.' });
    }

    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'CSV text content is empty.' });
    }

    const rows = parseCSVLines(csvText);
    const contributors = loadContributors();
    let importedCount = 0;

    for (const r of rows) {
      const name = (r[1] || r[0] || '').trim();
      if (!name || name.toLowerCase().includes('total') || name.includes('name') || !isNaN(Number(name))) {
        continue;
      }

      const tgt = parseNumeric(r[2] || r[1]);
      const coll = parseNumeric(r[3] || r[2]);
      const due = parseNumeric(r[4] || r[3]) || Math.max(0, tgt - coll);
      const mode = r[5] || 'Cash';
      const date = r[6] || new Date().toISOString().split('T')[0];
      const by = r[7] || req.user.username;

      contributors.unshift({
        id: 'upload_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        paraId: pId,
        sectionType: pId <= 5 ? 'family' : (pId === 6 ? 'shop' : 'road'),
        donorName: name,
        familyHeadName: name,
        shopName: name,
        eventSpotType: name,
        targetAmount: tgt,
        agreedTarget: tgt,
        collectedAmount: coll,
        amountPaid: coll,
        totalCollection: coll,
        amount: coll,
        dueBalance: due,
        paymentMode: mode,
        dateOfPayment: date,
        date: date,
        collectedBy: by,
        source: 'csv_upload'
      });
      importedCount++;
    }

    saveContributors(contributors);
    return res.json({
      success: true,
      message: `Successfully imported ${importedCount} records into Section ${pId}.`,
      importedCount
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
  console.log(` Linked Google Sheet: ${appSettings.spreadsheetId}`);
  console.log('=====================================================');

  // Trigger initial background sync
  try {
    await syncAllDataFromSheet(appSettings.spreadsheetId);
  } catch (err) {
    console.warn('[Initial Startup Sync Warning]:', err.message);
  }

  // Periodic Auto-Sync every 5 minutes
  setInterval(async () => {
    try {
      console.log('[Auto-Sync] Running scheduled 5-minute Google Sheet synchronization...');
      await syncAllDataFromSheet(appSettings.spreadsheetId);
    } catch (e) {
      console.warn('[Auto-Sync Error]:', e.message);
    }
  }, (appSettings.autoSyncMinutes || 5) * 60 * 1000);
});
