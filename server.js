// Minimale statische webserver voor Railway — geen dependencies nodig.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ===== opslag voor de bezoekersteller en de likes =====
// Op Railway: koppel een volume, dan zet Railway RAILWAY_VOLUME_MOUNT_PATH en
// blijft alles bewaard na een nieuwe deploy. Anders komt het in ./data.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, 'data');
const TELLER_BESTAND = path.join(DATA_DIR, 'bezoekers.json');
const LIKES_BESTAND = path.join(DATA_DIR, 'likes.json');

function lees(bestand, standaard) {
  try { return JSON.parse(fs.readFileSync(bestand, 'utf8')); } catch (e) { return standaard; }
}

// Schrijft veilig (eerst naar .tmp, dan hernoemen) en nooit twee keer tegelijk hetzelfde bestand.
const schrijvers = {};
function bewaar(bestand, geefInhoud) {
  const w = schrijvers[bestand] || (schrijvers[bestand] = { bezig: false, nogEenKeer: false });
  if (w.bezig) { w.nogEenKeer = true; return; }
  w.bezig = true;
  const tijdelijk = bestand + '.tmp';
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(tijdelijk, JSON.stringify(geefInhoud()), err => {
      const klaar = () => {
        w.bezig = false;
        if (w.nogEenKeer) { w.nogEenKeer = false; bewaar(bestand, geefInhoud); }
      };
      if (err) { console.error('Niet bewaard:', bestand, err.message); return klaar(); }
      fs.rename(tijdelijk, bestand, klaar);
    });
  });
}

let bezoekers = lees(TELLER_BESTAND, {}).aantal || 0;
const likes = lees(LIKES_BESTAND, {});

// Alleen spellen die echt bestaan kunnen likes krijgen (bijv. "paard-en-hond" → paard-en-hond.html)
function bestaatSpel(id) {
  return /^[a-z0-9-]{1,40}$/.test(id) && id !== 'index' && fs.existsSync(path.join(__dirname, id + '.html'));
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
      bewaar(TELLER_BESTAND, () => ({ aantal: bezoekers }));
    }
    return stuurJson(res, { aantal: bezoekers });
  }

  if (urlPath === '/api/likes') {
    // GET = alle likes, POST ?spel=…&actie=like|weg = één like erbij of eraf
    if (req.method === 'POST') {
      const zoek = new URLSearchParams(req.url.split('?')[1] || '');
      const spel = zoek.get('spel') || '';
      const actie = zoek.get('actie');
      if (!bestaatSpel(spel) || (actie !== 'like' && actie !== 'weg')) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Onbekend spel of actie');
      }
      likes[spel] = Math.max(0, (likes[spel] || 0) + (actie === 'like' ? 1 : -1));
      bewaar(LIKES_BESTAND, () => likes);
    }
    return stuurJson(res, likes);
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
