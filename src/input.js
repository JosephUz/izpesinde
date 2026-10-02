import { CFG } from './config.js';
import { dist } from './physics.js';
import { active } from './roster.js';

/**
 * Klavye ve fare. Basılı tuşlar (keys) hareket için her karede okunur; tek seferlik eylemler (zıpla, atıl, kutu,
 * çalış, öldür, sol tık hedefi) `pending` içinde biriktirilip bir sonraki simülasyon adımına verilir.
 * Sol tık imlecin altındaki karakteri hedefler (pickHover: oyuncunun görüş alanındaki, imlece en yakın karakter; bina
 * arkasında kalsa bile seçilebilir, çünkü ekran konumuna bakılır).
 *
 * hooks: escape(), tab(down), blur(), map() (M: küçük haritayı büyüt / küçült), use() (imleçte hedef yokken uyarı),
 * sound(type), busy() (diyalog açık mı).
 */
const BINDS = { KeyE: 'carry', KeyF: 'blend', KeyQ: 'kill', Space: 'jump' };

export function createInput(canvas, app, hooks) {
  const keys = new Set(), mouse = { x: -1, y: -1 };
  let pending = {};

  function command(type, value = true) {
    if (hooks.busy()) return;
    pending[type] = value;
    if (['use', 'jump', 'dash'].includes(type)) hooks.sound(type);
  }

  /** İmlecin altındaki karakter (44 px içinde, oyuncunun görüş alanında, tanınan takım arkadaşları hariç). */
  function pickHover() {
    app.hover = null;
    const world = app.world, p = world.player;
    if (!app.playing || app.paused || mouse.x < 0 || !active(p)) return;
    let best = 44;
    for (const a of world.actors) {
      if (a === p || !active(a) || dist(a, p) > CFG.vision || p.known.has(a.id)) continue;
      const q = app.project(a.x, 1.1 + a.y, a.z), d = Math.hypot(q.x - mouse.x, q.y - mouse.y);
      if (d < best) { best = d; app.hover = a; }
    }
  }

  window.addEventListener('keydown', e => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { hooks.escape(); return; }
    if (e.code === 'Tab') { hooks.tab(true); return; }
    if (e.code === 'KeyM') { hooks.map(); return; }
    keys.add(e.code);
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

  return {
    keys, pickHover, command,
    clear() { keys.clear(); pending = {}; },
    /** Bu karenin girdisi: kamera yönüne göre WASD + birikmiş eylemler (alındıktan sonra sıfırlanır). */
    take() {
      const forward = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0), right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const input = { ...pending, dx: (right + forward) * 0.707, dz: (forward - right) * 0.707, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') };
      pending = {};
      return input;
    },
  };
}
