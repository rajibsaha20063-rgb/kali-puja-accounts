const https = require('https');

function fetchWithRedirect(url) {
  https.get(url, res => {
    console.log('Status code:', res.statusCode);
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log('Redirecting to:', res.headers.location);
      fetchWithRedirect(res.headers.location);
      return;
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('--- CONTENT START ---');
      console.log(data);
      console.log('--- CONTENT END ---');
    });
  }).on('error', err => console.error(err));
}

fetchWithRedirect('https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/export?format=csv');
