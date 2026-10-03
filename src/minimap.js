import { CFG } from './config.js';
import { REGIONS } from './environment.js';
import { circleOf, marksFor, revealedProsecutors } from './marks.js';
import { dist } from './physics.js';
import { active } from './roster.js';
import { spectate } from './world.js';

/**
 * Üstten 2B harita. Kasaba (yollar, binalar, ağaçlar, bölge adları) her karede yeniden çizilir. Üstünde:
 *  - oyundaki herkes (kasabalı, bot, insan) aynı renkte bir nokta: kimlik ve rol değil, yalnızca "orada birileri var"
 *    bilgisi; tenhaya sapan biri herkesin haritasında görünür (yakalanan ve ölenler çizilmez),
 *  - oyuncunun görebildiği işaret daireleri (yaklaşık bölge, kesin konum değil; aklanmışsa gri) ve kılık değişiminden
 *    sonra sönen daireler,
 *  - suçluysan ele verilmiş savcılar (kırmızı, haritanın her yerinde: hedef olsunlar),
 *  - kendi konumu ve görüş çemberi.
 * M tuşu haritayı büyütüp küçültür (toggle): büyükken kart iki kat boyda, tuval de iki kat çözünürlükte çizilir.
 */
const SMALL = { w: 240, h: 210 }, LARGE = { w: 480, h: 420 };

export function createMinimap(canvas, card, app, regionLabel) {
  const ctx = canvas.getContext('2d');
  let large = false;
  function resize() {
    const size = large ? LARGE : SMALL;
    canvas.width = size.w; canvas.height = size.h;
    card.classList.toggle('large', large);
  }
  resize();
  return {
    toggle() { large = !large; resize(); this.draw(); },
    get large() { return large; },
    draw() {
      const world = app.world, env = world.env, viewer = world.player;
      // Kasaba tuvalin ortasında kare bir alana sığar; k, küçük boya göre ölçektir (nokta ve yazı boyu).
      const w = canvas.width, h = canvas.height, side = Math.min(w, h) - 16, s = side / (CFG.half * 2 + 6), k = w / SMALL.w;
      const px = x => w / 2 + x * s, pz = z => h / 2 + z * s;
      const circle = (x, z, r) => { ctx.beginPath(); ctx.arc(px(x), pz(z), r, 0, 7); };
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#253e31'; ctx.fillRect(w / 2 - side / 2, h / 2 - side / 2, side, side);
      ctx.strokeStyle = '#859373'; ctx.lineWidth = 2 * k;
      for (const r of REGIONS.slice(1)) { ctx.beginPath(); ctx.moveTo(px(0), pz(0)); ctx.lineTo(px(r.x), pz(r.z)); ctx.stroke(); }
      ctx.fillStyle = '#7a8467';
      for (const b of env.buildings) ctx.fillRect(px(b.x - b.w / 2), pz(b.z - b.d / 2), b.w * s, b.d * s);
      ctx.fillStyle = '#42654c';
      for (const t of env.trees) { circle(t.x, t.z, 1.5 * k); ctx.fill(); }
      ctx.font = `${8 * k}px Segoe UI`; ctx.textAlign = 'center'; ctx.fillStyle = '#c0c5a2';
      for (const r of REGIONS) ctx.fillText(r.short, px(r.x), pz(r.z) - 12 * k);

      ctx.fillStyle = '#e6dfc2b0';
      const dot = 2 * k;
      for (const a of world.actors) if (active(a) && a !== viewer) ctx.fillRect(px(a.x) - dot / 2, pz(a.z) - dot / 2, dot, dot);

      ctx.lineWidth = 1.5 * k;
      for (const m of marksFor(world, viewer)) {
        if (!active(m.target)) continue;
        const q = circleOf(m, m.target);
        ctx.strokeStyle = m.cleared ? '#9aa39a90' : '#e5bd70'; ctx.fillStyle = m.cleared ? '#9aa39a18' : '#e5bd7026';
        circle(q.x, q.z, CFG.mapCircle * s); ctx.fill(); ctx.stroke();
      }
      if (viewer.role === 'criminal') {
        ctx.fillStyle = '#e2483a';
        for (const t of revealedProsecutors(world)) { circle(t.x, t.z, 3.5 * k); ctx.fill(); }
      }
      for (const g of world.ghosts) {
        ctx.strokeStyle = `rgba(229,189,112,${(((g.until - world.time) / CFG.mapFade) * 0.6).toFixed(2)})`;
        ctx.setLineDash([3 * k, 3 * k]); circle(g.x, g.z, CFG.mapCircle * s); ctx.stroke(); ctx.setLineDash([]);
      }
      const p = spectate(world, app.spectator) || viewer;
      ctx.fillStyle = '#fff0c5'; circle(p.x, p.z, 3 * k); ctx.fill();
      ctx.strokeStyle = '#fff0c540'; circle(p.x, p.z, CFG.vision * s); ctx.stroke();
      regionLabel.textContent = REGIONS.slice().sort((a, b) => dist(p, a) - dist(p, b))[0].name;
    },
  };
}
