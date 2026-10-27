const https = require('https');

function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchCSV(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseSpreadsheetCSV(csvText) {
  const lines = csvText.split(/\r?\n/).map(line => {
    // Simple CSV parser handling quotes
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

  console.log('Total CSV lines:', lines.length);

  // Rows 10-16: Income
  // Rows 22-33: Expenses
  const income = [];
  const expenses = [];

  // Parse Income
  // Headers row ~9: Sl No, Source, Target, Collected, Due
  for (let r = 0; r < lines.length; r++) {
    const row = lines[r];
    const firstCell = (row[0] || '').trim();
    const slNo = parseInt(firstCell, 10);
    const label = (row[1] || '').trim();

    if (!isNaN(slNo) && slNo >= 1 && slNo <= 7 && label.toLowerCase().includes('collection')) {
      income.push({
        id: slNo,
        source: label.replace(/\s*\([^)]*\)/g, '').trim(), // e.g. "Para 1 Collection"
        originalLabel: label,
        target: parseNumeric(row[2]),
        collected: parseNumeric(row[3]),
        pending: parseNumeric(row[4])
      });
    }

    if (!isNaN(slNo) && slNo >= 1 && slNo <= 12 && (r > 18 || label.includes('Light') || label.includes('লাইট') || label.includes('Pandal') || label.includes('প্যান্ডেল') || label.includes('Thakur') || label.includes('ঠাকুর'))) {
      expenses.push({
        id: slNo,
        category: label.replace(/\s*\([^)]*\)/g, '').trim(),
        originalLabel: label,
        budget: parseNumeric(row[2]),
        advance: parseNumeric(row[3]),
        totalPaid: parseNumeric(row[4]),
        pending: parseNumeric(row[5])
      });
    }
  }

  console.log('Parsed Income (' + income.length + '):', income);
  console.log('Parsed Expenses (' + expenses.length + '):', expenses);
}

async function test() {
  const csv = await fetchCSV('https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/export?format=csv');
  parseSpreadsheetCSV(csv);
}

test();
