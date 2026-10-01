// Minimale statische webserver voor Railway — geen dependencies nodig.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ===== bezoekersteller =====
// Op Railway: koppel een volume, dan zet Railway RAILWAY_VOLUME_MOUNT_PATH en
// blijft de teller bewaard na een nieuwe deploy. Anders komt hij in ./data.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, 'data');
const TELLER_BESTAND = path.join(DATA_DIR, 'bezoekers.json');

let bezoekers = 0;
try {
  bezoekers = JSON.parse(fs.readFileSync(TELLER_BESTAND, 'utf8')).aantal || 0;
} catch (e) {}

let bezigMetSchrijven = false;
let nogEenKeer = false;
function bewaarTeller() {
  if (bezigMetSchrijven) { nogEenKeer = true; return; }
  bezigMetSchrijven = true;
  const tijdelijk = TELLER_BESTAND + '.tmp';
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(tijdelijk, JSON.stringify({ aantal: bezoekers }), err => {
      const klaar = () => {
        bezigMetSchrijven = false;
        if (nogEenKeer) { nogEenKeer = false; bewaarTeller(); }
      };
      if (err) { console.error('Teller niet bewaard:', err.message); return klaar(); }
      fs.rename(tijdelijk, TELLER_BESTAND, klaar);
    });
  });
}

function stuurJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/api/bezoekers') {
    // POST = er komt iemand binnen (tel +1), GET = alleen kijken
    if (req.method === 'POST') {
      bezoekers++;
      bewaarTeller();
    }
    return stuurJson(res, { aantal: bezoekers });
  }

  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.startsWith('/data/')) urlPath = '/bestaat-niet';

  // Voorkom directory-traversal
  const filePath = path.join(__dirname, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Pagina niet gevonden');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zomerboekje draait op poort ${PORT}`);
});
