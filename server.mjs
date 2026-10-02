import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/**
 * Yerel sunucu: yalnızca statik dosyalar (oyun tek oyunculudur, ağ odası yoktur). Proje klasörü ve three.js paketi
 * dışında hiçbir dosyaya erişim yok; three /vendor/ altından node_modules'tan verilir. HOST yalnızca Docker'da 0.0.0.0'dır,
 * yerelde oyun bu bilgisayarda kalır. Port doluysa ve orada zaten İz Peşinde çalışıyorsa yalnızca tarayıcı açılır.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
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
  if (rootFiles.includes(rel) || rel.startsWith('src' + path.sep) || rel.startsWith('src/')) {
    const file = path.join(root, rel);
    return file.startsWith(root) ? file : null;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': noStore }); res.end('iz-pesinde ' + stamp); return; }
  const file = resolveFile(pathname), type = file && types[path.extname(file)];
  if (!type) { res.writeHead(404); res.end('Bulunamadı'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': noStore });
    res.end(body);
  } catch { res.writeHead(404); res.end('Bulunamadı'); }
});

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
    if ((await r.text()).startsWith('iz-pesinde')) { ready(port); return; }
  } catch { /* başka bir sunucu */ }
  server.listen(0, host);
});
stamp = await buildStamp();
server.listen(port, host);
