// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('iz-game');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#162e29;color:#eee5cf;font:16px Segoe UI,system-ui;padding:24px;text-align:center;z-index:99';
  el.textContent = 'Kasaba yüklenemedi: tarayıcının donanım hızlandırmasını ve yerel sunucuyu kontrol et. ' + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
