import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.mjs';

/**
 * Tek süreç, tek port: statik dosyalar (oyun) + WebSocket (çevrim içi odalar, otoriter simülasyon; server/rooms.mjs).
 * Cloudflare Tunnel bu portu izpesinde-sunucu.josephuz.com'a bağlar; oyun dosyaları Cloudflare'deki statik siteden
 * (izpesinde.josephuz.com, wrangler.jsonc) gelir ve tarayıcı bu adrese bağlanır. Yerelde sayfa da buradan açılır
 * (ws://aynı-adres). Proje klasörü ve three.js paketi dışında hiçbir dosyaya erişim yok; three /vendor/ altından
 * node_modules'tan verilir. HOST yalnızca Docker'da 0.0.0.0'dır. Port doluysa ve orada zaten İz Peşinde çalışıyorsa
 * yalnızca tarayıcı açılır.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};
const rootFiles = ['index.html', 'style.css', 'game.js'];
/** Oyun dosyaları önbelleğe alınmaz: tek bir sürüm vardır ve güncelleme anında geçmelidir. */
const noStore = 'no-store, no-cache, must-revalidate, max-age=0';

/** Sürüm damgası: en yeni oyun dosyasının değişme zamanı; /health ile hangi yapının ayakta olduğu görülür. */
async function buildStamp() {
  let newest = 0;
  const walk = async dir => {
    let list = []; try { list = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (/\.(js|css|html)$/.test(d.name)) { try { newest = Math.max(newest, (await stat(full)).mtimeMs); } catch { /* yok */ } }
    }
  };
  for (const f of rootFiles) { try { newest = Math.max(newest, (await stat(path.join(root, f))).mtimeMs); } catch { /* yok */ } }
  await walk(path.join(root, 'src'));
  await walk(path.join(root, 'server'));
  return new Date(newest).toISOString();
}
let stamp = 'bilinmiyor';

function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (rel.startsWith('vendor' + path.sep) || rel.startsWith('vendor/')) {
    const file = path.join(vendorDir, path.basename(rel));
    return file.startsWith(vendorDir) ? file : null;
  }
  // src/ (oyun kaynağı) ve muzik/ (oyun içi parçalar, src/muzik.js) dışında hiçbir klasör verilmez.
  if (rootFiles.includes(rel) || /^(src|muzik)[/\\]/.test(rel)) {
    const file = path.join(root, rel);
    return file.startsWith(root) ? file : null;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': noStore }); res.end(JSON.stringify({ oyun: 'iz-pesinde', ...rooms.stats(), surum: stamp })); return; }
  const file = resolveFile(pathname), type = file && types[path.extname(file)];
  if (!type) { res.writeHead(404); res.end('Bulunamadı'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': noStore });
    res.end(body);
  } catch { res.writeHead(404); res.end('Bulunamadı'); }
});

const rooms = createRooms({ log: (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a) });
/**
 * WebSocket yalnız bilinen sayfalardan: aynı adres (yerelde), *.josephuz.com (Cloudflare'deki statik site) ve localhost.
 * Origin'siz istemciler (testler, araçlar) kabul edilir.
 */
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { const u = new URL(origin); return u.host === req.headers.host || u.hostname === 'josephuz.com' || u.hostname.endsWith('.josephuz.com') || u.hostname === 'localhost' || u.hostname === '127.0.0.1'; } catch { return false; }
}
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024, verifyClient: ({ req }) => allowedOrigin(req) });
wss.on('connection', ws => rooms.attach(ws));
wss.on('error', () => {}); // port doluyken sunucunun hatası buraya da yansır; asıl işleyici server.on('error')
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(sig + ': kapanıyor.'); wss.close(); server.close(); process.exit(0); });

const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 5197), shouldOpen = process.argv.includes('--open');
function ready(actual) {
  const url = 'http://127.0.0.1:' + actual;
  console.log('İz Peşinde: ' + url);
  if (shouldOpen && process.platform === 'win32') {
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' })
      .on('error', () => console.log('Tarayıcıda bu adresi aç: ' + url));
  }
}
server.on('listening', () => ready(server.address().port));
server.on('error', async error => {
  if (error.code !== 'EADDRINUSE') { console.error(error.message); process.exitCode = 1; return; }
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(1500) });
    if ((await r.json()).oyun === 'iz-pesinde') { ready(port); return; }
  } catch { /* başka bir sunucu */ }
  server.listen(0, host);
});
stamp = await buildStamp();
server.listen(port, host);
