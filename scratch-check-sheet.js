const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/edit?usp=sharing', res => {
  let html = '';
  res.on('data', chunk => html += chunk);
  res.on('end', () => {
    console.log('HTML Length:', html.length);
    // Find all sheet names in bootstrap data
    // Usually Google Sheets has sheet names in WIZ_global_data or bootstrap data like: [null,null,"SheetName",...
    const matches = html.match(/\[\d+,"([^"]+)",\d+,\d+,/g) || [];
    console.log('Matches:', matches.slice(0, 30));

    // Try finding strings that look like sheet names
    const regex = /"([A-Za-z0-9\s_\u0980-\u09FF\-\(\)]+)"/g;
    let m;
    const candidates = new Set();
    while ((m = regex.exec(html)) !== null) {
      const s = m[1];
      if (s.includes('Para') || s.includes('Collection') || s.includes('Expense') || s.includes('Overview') || s.includes('Summary') || s.includes('পাড়া')) {
        candidates.add(s);
      }
    }
    console.log('Interesting sheet strings:', Array.from(candidates));
  });
}).on('error', err => console.error(err));
