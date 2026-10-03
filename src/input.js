import { CFG } from './config.js';
import { dist } from './physics.js';
import { active } from './roster.js';
import { createTouch, TOUCH } from './touch.js';

/**
 * Klavye ve fare. Basılı tuşlar (keys) hareket için her karede okunur; tek seferlik eylemler (zıpla, atıl, kutu,
 * çalış, öldür, sol tık hedefi) `pending` içinde biriktirilip bir sonraki simülasyon adımına verilir.
 * Sol tık ve Q (suçlunun kılığı) imlecin altındaki karakteri hedefler (pickHover: oyuncunun görüş alanındaki, imlece en yakın karakter; bina
 * arkasında kalsa bile seçilebilir, çünkü ekran konumuna bakılır).
 *
 * hooks: escape(), tab(down), blur(), map() (M: küçük haritayı büyüt / küçült), use() (imleçte hedef yokken uyarı),
 * sound(type), busy() (diyalog açık mı).
 *
 * **Dokunmatik** (touchRoot verilince, bkz. touch.js): sol yarıda joystick (sonuna kadar itmek koşu), dünyaya dokunmak
 * hedef seçer (app.target, görüş alanından çıkana ya da başkası seçilene kadar kalır), sağ alttaki düğmeler rolün
 * eylemi (seçili hedefe), Kılık (suçlu, seçili hedefe), Kutu, Çalış, Zıpla, Atıl; üstte Menü (Esc) ve Skor (Tab).
 */
const TOUCH_BUTTONS = [
  { id: 'use', label: 'İŞARETLE' }, { id: 'swap', label: 'KILIK', sub: '−1' }, { id: 'jump', label: 'ZIPLA' }, { id: 'dash', label: 'ATIL' },
  { id: 'carry', label: 'KUTU' }, { id: 'blend', label: 'ÇALIŞ' }, { id: 'menu', label: '☰' }, { id: 'score', label: 'SKOR' }, { id: 'map', label: 'HARİTA' },
];
const BINDS = { KeyE: 'carry', KeyF: 'blend', Space: 'jump' };

export function createInput(canvas, app, hooks, touchRoot = null) {
  const keys = new Set(), mouse = { x: -1, y: -1 };
  let pending = {}, touch = null;

  function command(type, value = true) {
    if (hooks.busy()) return;
    pending[type] = value;
    if (['use', 'jump', 'dash'].includes(type)) hooks.sound(type);
  }

  /** Ekran noktasının altındaki karakter (radius px içinde, oyuncunun görüş alanında, tanınan takım arkadaşları hariç). */
  function pickAt(x, y, radius) {
    const world = app.world, p = world.player;
    let best = radius, hit = null;
    for (const a of world.actors) {
      if (a === p || !active(a) || dist(a, p) > CFG.vision || p.known.has(a.id)) continue;
      const q = app.project(a.x, 1.1 + a.y, a.z), d = Math.hypot(q.x - x, q.y - y);
      if (d < best) { best = d; hit = a; }
    }
    return hit;
  }
  /** İmlecin altındaki karakter (44 px); dokunmatikte dokunarak seçilen hedef, hâlâ geçerliyse. */
  function pickHover() {
    app.hover = null;
    const world = app.world, p = world.player;
    if (!app.playing || app.paused || !active(p)) return;
    if (touch) {
      const t = app.target != null ? world.actors[app.target] : null;
      if (t && active(t) && dist(t, p) <= CFG.vision && !p.known.has(t.id)) app.hover = t; else app.target = null;
      return;
    }
    if (mouse.x >= 0) app.hover = pickAt(mouse.x, mouse.y, 44);
  }

  window.addEventListener('keydown', e => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { hooks.escape(); return; }
    if (e.code === 'Tab') { hooks.tab(true); return; }
    if (e.code === 'KeyM') { hooks.map(); return; }
    keys.add(e.code);
    if (e.code === 'KeyQ') { pickHover(); if (app.hover && app.world.player.role === 'criminal') command('swap', app.hover.id); return; }
    if (BINDS[e.code]) command(BINDS[e.code]);
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') hooks.tab(false); });
  window.addEventListener('blur', () => { keys.clear(); pending = {}; hooks.blur(); });
  canvas.tabIndex = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerleave', () => { mouse.x = -1; });
  canvas.addEventListener('pointerdown', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.button === 0) { pickHover(); if (app.hover) command('use', app.hover.id); else hooks.use(null); }
    if (e.button === 2) command('dash');
  });

  if (touchRoot) {
    touch = createTouch(touchRoot, TOUCH_BUTTONS, {
      tap(x, y) {
        if (!app.playing || app.paused || !active(app.world.player)) return;
        const hit = pickAt(x, y, 60);
        app.target = hit ? hit.id : null;
      },
      down(id) {
        if (id === 'menu') { hooks.escape(); return; }
        if (id === 'score') { hooks.tab(true); return; }
        if (id === 'map') { hooks.map(); return; }
        if (id === 'use' || id === 'swap') {
          pickHover();
          if (!app.hover) { hooks.use(null); return; }
          if (id === 'use') command('use', app.hover.id);
          else if (app.world.player.role === 'criminal') command('swap', app.hover.id);
          return;
        }
        command(id);
      },
      up(id) { if (id === 'score') hooks.tab(false); },
    });
  }

  return {
    keys, pickHover, command, touch,
    /** Dokunmatik düğmeleri role göre ayarla: büyük düğmenin adı ve Kılık yalnızca suçluda. */
    touchRole(role) {
      if (!touch) return;
      touch.button('use').firstElementChild.textContent = { detective: 'İŞARETLE', prosecutor: 'YAKALA', criminal: 'ÖLDÜR' }[role] || 'EYLEM';
      touch.button('swap').hidden = role !== 'criminal';
    },
    clear() { keys.clear(); pending = {}; touch?.clear(); },
    /** Bu karenin girdisi: kamera yönüne göre WASD + birikmiş eylemler (alındıktan sonra sıfırlanır). */
    take() {
      let forward = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0), right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      // Joystick ekran yönündedir (yukarı = W); sonuna kadar itmek koşudur.
      const stick = touch?.poll();
      if (stick && (stick.x || stick.z)) { forward = stick.z; right = stick.x; sprint ||= stick.push >= TOUCH.push; }
      const input = { ...pending, dx: (right + forward) * 0.707, dz: (forward - right) * 0.707, sprint };
      pending = {};
      return input;
    },
  };
}
