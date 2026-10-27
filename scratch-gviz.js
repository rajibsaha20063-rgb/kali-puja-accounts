const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/gviz/tq?tqx=out:json', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('GViz Response length:', data.length);
    console.log('First 500 chars:', data.slice(0, 500));
  });
}).on('error', err => console.error(err));
