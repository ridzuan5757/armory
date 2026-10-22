// Theme 5, caravan: each colony is a town of small houses around its square,
// and dirt roads join the towns. Horses carry crates from town to town. A
// file use sends a horse to that house with a red envelope, and a glowing
// house pulls every horse there, in shades.
import type { Theme } from '../web'

import { HORSE_KIT } from './horse'

export const CARAVAN: Theme = {
  name: 'caravan',
  legend: 'one town per colony · house size = data · horses carry crates between towns, bring envelopes to the files tools use and swarm there in shades · drag to turn · pinch or scroll to zoom',
  script: HORSE_KIT + `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false;
  const ANGLE = { 'hub:skills': -90, 'hub:files': -18, 'hub:jobs': 54, 'hub:memory': 126, 'hub:sessions': 198 };
  const TOWNS = ['hub:skills', 'hub:files', 'hub:jobs', 'hub:memory', 'hub:sessions'];
  let spread = 220;
  function anchor(id) {
    const a = ANGLE[id] * Math.PI / 180;
    return { x: Math.cos(a) * spread, y: Math.sin(a) * spread, z: 0 };
  }

  // Each town packs its houses on a hex grid around the square: a house takes
  // the free spot nearest its parent's, so a folder and its files form one
  // street. Towns sit far enough apart for the largest.
  const LOT = 13;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const lotXY = (q, r) => ({ x: LOT * Math.sqrt(3) * (q + r / 2), y: LOT * 1.5 * r });
  const lotDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
  function ringAround(q, r, k) {
    const out = [];
    let cq = q + DIRS[4][0] * k, cr = r + DIRS[4][1] * k;
    for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([cq, cr]); cq += DIRS[i][0]; cr += DIRS[i][1]; }
    return out;
  }
  let lots = new Map(), sizes = new Map(), layoutGen = -1, layoutSize = -1;
  function layout() {
    const kids = childrenMap();
    const next = new Map();
    let widest = 0;
    for (const town of TOWNS) {
      if (!nodes.has(town)) continue;
      const used = new Set(['0,0']);
      next.set(town, { q: 0, r: 0, town });
      const place = (id, at) => {
        for (const c of kids.get(id) || []) {
          let best;
          for (let k = 1; k < 40 && !best; k++) {
            let score = Infinity;
            for (const cell of ringAround(at[0], at[1], k)) {
              if (used.has(cell[0] + ',' + cell[1])) continue;
              const s = lotDist(cell, [0, 0]) + 0.001 * hash(c.id + cell);
              if (s < score) { score = s; best = cell; }
            }
          }
          if (!best) continue;
          used.add(best[0] + ',' + best[1]);
          next.set(c.id, { q: best[0], r: best[1], town });
          const p = lotXY(best[0], best[1]);
          widest = Math.max(widest, Math.hypot(p.x, p.y) + LOT);
          place(c.id, best);
        }
      };
      place(town, [0, 0]);
    }
    // Neighbors on the pentagon are 1.176 spreads apart.
    spread = Math.max(160, (2 * widest + 70) / 1.176);
    lots = next;
    sizes = bodySizes();
    for (const n of nodes.values()) if (lots.has(n.id)) n.settle = 0;
  }
  const lotCenter = l => { const a = anchor(l.town), p = lotXY(l.q, l.r); return { x: a.x + p.x, y: a.y + p.y, z: 0 }; };

  // Caravans: one horse per town, and one more per running job or busy
  // session. A horse walks the road to the next town, rests on its square,
  // and goes on. Roads join each town to its two neighbors.
  const horses = new Map();
  let lastSim = 0, rest = 0;
  function simulate() {
    if (gen !== layoutGen || nodes.size !== layoutSize) { layout(); layoutGen = gen; layoutSize = nodes.size; }
    const now = performance.now();
    const dt = lastSim ? Math.min(0.1, (now - lastSim) / 1000) : 0;
    lastSim = now;
    alpha *= 0.988;
    rest = !calm && view.auto > 0 ? Math.min(1, rest + 0.01) : Math.max(0, rest - 0.05);
    faceFront(rest, 0, 0.5);
    for (const n of nodes.values()) {
      const l = lots.get(n.id);
      if (!l) continue;
      const c = lotCenter(l);
      n.settle = Math.min(1, (n.settle || 0) + 0.04);
      const k = 0.12 + 0.88 * n.settle;
      n.x += (c.x - n.x) * k; n.y += (c.y - n.y) * k; n.z += (c.z - n.z) * k;
    }
    const t = now / 1000;
    const target = hotFile();
    const extra = [...nodes.values()].filter(n => (n.type === 'job' || n.type === 'session') && n.live && !n.dying).length;
    const want = TOWNS.length + extra;
    const seen = new Set();
    let slot = 0;
    for (let i = 0; i < want; i++) {
      const key = 'c' + i;
      seen.add(key);
      let h = horses.get(key);
      if (!h) {
        const a = anchor(TOWNS[i % TOWNS.length]);
        h = { x: a.x, y: a.y, z: 0, vx: 0, vy: 0, vz: 0, seed: hash(key), from: i % TOWNS.length, leg: hash(key + 'l'), wait: 0 };
        horses.set(key, h);
      }
      // The road leg: from one town square to the next, then a rest.
      const from = anchor(TOWNS[h.from]), to = anchor(TOWNS[(h.from + 1) % TOWNS.length]);
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      if (h.wait > 0) h.wait -= dt;
      else {
        h.leg += dt * (14 + 6 * h.seed) * (1 - 0.4 * rest) / len;
        if (h.leg >= 1) { h.leg = 0; h.from = (h.from + 1) % TOWNS.length; h.wait = 1 + 2 * h.seed; }
      }
      const u = h.leg * h.leg * (3 - 2 * h.leg);
      const road = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * 6, z: 0, key: 'road' };
      // The files town's horse brings an envelope to each new file use.
      if (i === 1) {
        for (const n of nodes.values()) {
          if (n.type !== 'file' || !n.data || n.data.kind !== 'file') continue;
          if (n.caravanAt === undefined) { n.caravanAt = n.at || 0; continue; }
          if (n.at > n.caravanAt) { n.caravanAt = n.at; if (Date.now() - n.at < GLOW_MS) h.trip = { id: n.id, until: now + 4000 }; }
        }
        if (h.trip && (now > h.trip.until || !nodes.has(h.trip.id))) h.trip = undefined;
      }
      let goal = road, follow = true;
      h.carry = 'crate';
      if (target) { const s = swarmSlot(slot++, target, t); goal = { ...s, key: 'swarm' + target.id }; follow = false; }
      else if (h.trip) { const n = nodes.get(h.trip.id); goal = { x: n.x, y: n.y + 9, z: 0, key: 'trip' + n.id }; follow = false; h.carry = 'envelope'; }
      const dist = steer(h, goal, dt, follow);
      h.shade = (h.shade || 0) + ((target && dist < 20 ? 1 : 0) - (h.shade || 0)) * Math.min(1, dt * 2.5);
    }
    for (const key of [...horses.keys()]) if (!seen.has(key)) horses.delete(key);
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The background matches the terminal, so the pane looks transparent.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#292c33';
    ctx.fillRect(0, 0, W, H);
    for (const n of nodes.values()) project(n);
    const ft = focus && nodes.get(focus.id);
    const fc = ft && (ft.kind === 'hub' ? ft.id : ft.colony);
    const inFocus = n => !fc || n.id === fc || n.colony === fc;
    const near = hover ? new Set([hover.id]) : undefined;
    if (hover) for (const e of edges.values()) {
      if (e.a === hover.id) near.add(e.b);
      if (e.b === hover.id) near.add(e.a);
    }

    // Roads between neighboring towns: a dirt band with wheel ruts.
    for (let i = 0; i < TOWNS.length; i++) {
      const a = anchor(TOWNS[i]), b = anchor(TOWNS[(i + 1) % TOWNS.length]);
      const pts = [];
      for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push(screen(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * 6, 0)); }
      const band = (w, color) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); };
      ctx.lineCap = 'round';
      band(9 * pts[12].f, 'rgba(150,115,70,0.28)');
      ctx.setLineDash([3, 5]);
      band(1, 'rgba(90,65,40,0.5)');
      ctx.setLineDash([]);
    }

    // Town squares, then houses, far ones first. A house is a box with a
    // roof, sized by its data; a used house glows and lights its window.
    const order = [...nodes.values()].filter(n => lots.has(n.id)).sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      if (n.kind !== 'hub') continue;
      const pts = [];
      for (let k = 0; k <= 24; k++) { const a = k / 24 * 2 * Math.PI; pts.push(screen(n.x + Math.cos(a) * LOT * 0.9, n.y + Math.sin(a) * LOT * 0.9, 0)); }
      ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      ctx.fillStyle = rgba(n.color, 0.25 * (inFocus(n) ? 1 : 0.4) * n.fog);
      ctx.fill();
      ctx.strokeStyle = rgba(n.color, 0.8 * n.fog);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const n of order) {
      if (n.kind === 'hub') continue;
      const g = ease(grown(n.born, now, 600)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.6 : 1) * (lit ? 1 : 0.35) * (inFocus(n) ? 1 : 0.3) * n.fog;
      const s = (sizes.get(n.id) || 0.8) * 9 * n.sf * g;
      const x = n.sx, y = n.sy;
      if (heat > 0.01) {
        const hot = OP[n.op] || '#ffffff';
        const glow = ctx.createRadialGradient(x, y - s * 0.5, 0, x, y - s * 0.5, s * (2 + 3 * heat));
        glow.addColorStop(0, rgba(hot, 0.5 * heat * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y - s * 0.5, s * (2 + 3 * heat), 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = rgba(n.color, 0.75 * fade);
      ctx.fillRect(x - s * 0.6, y - s * 0.8, s * 1.2, s * 0.8);
      ctx.fillStyle = rgba('#8a3b2e', 0.9 * fade);
      ctx.beginPath(); ctx.moveTo(x - s * 0.75, y - s * 0.78); ctx.lineTo(x, y - s * 1.35); ctx.lineTo(x + s * 0.75, y - s * 0.78); ctx.closePath(); ctx.fill();
      ctx.fillStyle = heat > 0.05 ? rgba('#ffe08a', Math.min(1, 0.4 + heat) * n.fog) : rgba('#1f2229', 0.7 * fade);
      ctx.fillRect(x - s * 0.18, y - s * 0.6, s * 0.36, s * 0.3);
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.beginPath(); ctx.arc(x, y - s * 0.5, s + k * 12 * n.sf, 0, 6.2832); ctx.stroke();
      }
    }

    // Memory links and job–session links: dashed lines between houses.
    for (const e of edges.values()) {
      if (!e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      ctx.setLineDash(e.solid ? [] : [2, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(e.color || '#cfe0ff', (e.solid ? 0.5 : 0.22) * (inFocus(a) ? 1 : 0.3) * (a.fog + b.fog) / 2);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horses, far ones first, with their load; in a swarm they wear shades.
    const herd = [...horses.values()].map(h => ({ h, d: screen(h.x, h.y, h.z).depth })).sort((p, q) => p.d - q.d);
    for (const { h } of herd) paintHorse(h, t, 1, { shades: h.shade || 0, carry: h.carry });

    drawLabels(order, near, fc, inFocus, now, n => (n.kind === 'hub' ? 14 : 12) * n.sf);
  }

`,
}
