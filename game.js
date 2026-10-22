// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('iz-game');
// Gösteri ve otopilot kipleri Türkçe içerik videoları içindir: adreste dil yoksa Türkçe açılır (dil.js adresi
// yüklenirken okur, o yüzden içe aktarmadan önce). Normal oyunda dil seçimi standarttaki sırayla yapılır.
try {
  const q = new URLSearchParams(location.search);
  if ((q.has('gosteri') || q.has('otopilot')) && !q.has('dil') && !q.has('lang')) {
    q.set('dil', 'tr'); history.replaceState(history.state, '', location.pathname + '?' + q + location.hash);
  }
} catch { /* yok */ }
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  let yazi = 'Kasaba yüklenemedi.';
  try { const { t } = await import('./src/dil.js'); yazi = t('sayfa.yuklenemedi'); } catch { /* sözlük de yüklenemedi */ }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#162e29;color:#eee5cf;font:16px Segoe UI,system-ui;padding:24px;text-align:center;z-index:99';
  el.textContent = yazi + ' ' + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
