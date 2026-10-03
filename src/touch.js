/**
 * Dokunmatik kontroller (telefon, tablet; masaüstünde `?touch` ile denenir). Çayır Muhafızı'nın düzeni: çoklu dokunuş
 * pointer olaylarıyla izlenir, her parmak ayrı iş görür:
 *  - Sol yarı: parmağın değdiği yerde beliren **joystick** (analog hareket; sonuna kadar itmek koşu).
 *  - Ekranın geri kalanı: kısa dokunuş `tap(x, y)` (dünyada **hedef seçer**; yanlış dokunuşla −1 yemeyesin diye eylem
 *    yapmaz, eylem düğmeyle yapılır). Joystick bölgesine kısa, hareketsiz dokunuş da seçimdir.
 *  - Sağ alttaki düğmeler (buttons: { id, label, sub? }): basınca down(id), kalkınca up(id).
 * DOM'u kendisi kurar (`#touch`), görünümü style.css'teki `.touch-*` / `.tbtn` kurallarıdır.
 *
 * hooks: down(id), up(id), tap(x, y)
 */
export const TOUCH = Object.freeze({ stick: 60, dead: 0.14, push: 0.94, tapTime: 280, tapMove: 14 });

export const touchDevice = () =>
  new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;

export function createTouch(parent, buttons, hooks) {
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.hidden = true;
  pad.innerHTML =
    '<div class="touch-zone left" data-t="stick"></div><div class="touch-zone right" data-t="tap"></div>' +
    '<div class="touch-stick" hidden><i></i></div><div class="touch-buttons">' +
    buttons.map(b => `<div class="tbtn" data-t="${b.id}" role="button" aria-label="${b.label}"><b>${b.label}</b>${b.sub ? `<small>${b.sub}</small>` : ''}</div>`).join('') +
    '</div>';
  parent.append(pad);
  const stick = pad.querySelector('.touch-stick'), knob = stick.firstElementChild, fingers = new Map();
  let axis = { x: 0, z: 0, push: 0 };

  const setStick = (x, z) => {
    const d = Math.hypot(x, z), k = d < TOUCH.dead ? 0 : Math.min(1, (d - TOUCH.dead) / (1 - TOUCH.dead)) / (d || 1);
    axis = { x: x * k, z: z * k, push: d };
  };
  function down(e) {
    const target = e.target.closest('[data-t]');
    if (!target) return;
    e.preventDefault();
    try { target.setPointerCapture?.(e.pointerId); } catch { /* yakalanamazsa olaylar yine pad'e gelir */ }
    const kind = target.dataset.t, f = { kind, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, at: performance.now(), target };
    if (kind === 'stick') {
      if ([...fingers.values()].some(o => o.kind === 'stick')) return;
      stick.hidden = false;
      const r = pad.getBoundingClientRect();
      stick.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`;
      knob.style.transform = '';
      setStick(0, 0);
    } else if (kind !== 'tap') {
      target.classList.add('on');
      hooks.down(kind);
    }
    fingers.set(e.pointerId, f);
  }
  function move(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    e.preventDefault();
    if (f.kind !== 'stick') return;
    let dx = e.clientX - f.x, dy = e.clientY - f.y;
    const d = Math.hypot(dx, dy);
    if (d > TOUCH.stick) { dx *= TOUCH.stick / d; dy *= TOUCH.stick / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    setStick(dx / TOUCH.stick, dy / TOUCH.stick);
  }
  function release(f, e) {
    const still = e && Math.hypot(e.clientX - f.x0, e.clientY - f.y0) < TOUCH.tapMove && performance.now() - f.at < TOUCH.tapTime;
    if (f.kind === 'stick') { stick.hidden = true; setStick(0, 0); if (still) hooks.tap(e.clientX, e.clientY); }
    else if (f.kind === 'tap') { if (still) hooks.tap(e.clientX, e.clientY); }
    else { f.target.classList.remove('on'); hooks.up(f.kind); }
  }
  function up(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    release(f, e.type === 'pointerup' ? e : null);
  }
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('contextmenu', e => e.preventDefault());

  return {
    el: pad,
    /** Joystick: x sağ, z aşağı (ekran yönünde, 0-1 analog), push: itme oranı (koşu için). */
    poll: () => axis,
    clear() { for (const f of fingers.values()) release(f, null); fingers.clear(); },
    show(on) { pad.hidden = !on; if (!on) this.clear(); },
    button: id => pad.querySelector(`[data-t="${id}"]`),
  };
}

/** Oyuna girerken tam ekran ve yatay yön; desteklenmezse sessizce geçer. */
export function enterFullscreen() {
  if (document.fullscreenElement) return;
  const go = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  Promise.resolve(go).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
