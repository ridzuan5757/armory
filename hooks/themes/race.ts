// Theme 4, race: one oval track with a lane per colony. Items are pennants on
// posts along the outer edge of their lane; runner horses gallop laps. A file
// use sends the files runner off the track to that post, and a glowing post
// pulls every horse there, in shades.
import type { Theme } from '../web'

import { HORSE_KIT } from './horse'

export const RACE: Theme = {
  name: 'race',
  legend: 'one lane per colony · pennant size = data · horses gallop laps, run to the files tools use and swarm there in shades · drag to turn · pinch or scroll to zoom',
  script: HORSE_KIT + `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false;
  const ANGLE = { 'hub:skills': -90, 'hub:files': -18, 'hub:jobs': 54, 'hub:memory': 126, 'hub:sessions': 198 };
  function anchor(id) {
    const s = spots.get(id);
    return s ? s : { x: 0, y: 0, z: 0 };
  }

  // Lanes from the inside out. Each colony's items, depth first, sit on posts
  // spread around the outer edge of its lane; the start gap at angle 0 holds
  // the lane's gate (the hub). The track grows so that posts do not crowd.
  const LANES = ['hub:sessions', 'hub:jobs', 'hub:skills', 'hub:memory', 'hub:files'];
  const LW = 24;
  let A = 150, B = 85, spots = new Map(), sizes = new Map(), layoutGen = -1, layoutSize = -1;
  const ell = (a, b, th) => ({ x: a * Math.cos(th), y: b * Math.sin(th), z: 0 });
  const laneOf = id => LANES.indexOf(id);
  function laneRadii(i) { return { a: A + i * LW, b: B + i * LW }; }
  function layout() {
    const kids = childrenMap();
    const lists = LANES.map(hub => {
      const out = [];
      const walk = (id, d) => { for (const c of kids.get(id) || []) { out.push([c, d]); walk(c.id, d + 1); } };
      walk(hub, 0);
      return out;
    });
    // Grow the track until the busiest lane has 10 units per post.
    A = 150; B = 85;
    for (let guard = 0; guard < 40; guard++) {
      const ok = lists.every((list, i) => {
        const { a, b } = laneRadii(i);
        const per = 2 * Math.PI * Math.sqrt(((a + LW / 2) ** 2 + (b + LW / 2) ** 2) / 2);
        return per * 0.92 >= list.length * 10;
      });
      if (ok) break;
      A += 12; B += 8;
    }
    spots = new Map();
    lists.forEach((list, i) => {
      const { a, b } = laneRadii(i);
      // The lane's name sits in the infield beside the start line, one under
      // the other; the gate itself is drawn on the lane.
      spots.set(LANES[i], { x: A * 0.62, y: (i - 2) * 16, z: 0 });
      list.forEach(([n, d], k) => {
        const th = 0.25 + (2 * Math.PI - 0.5) * (k + 0.5) / list.length;
        const p = ell(a + LW * 0.85, b + LW * 0.85, th);
        spots.set(n.id, { x: p.x, y: p.y, z: 2 + d * 3, th });
      });
    });
    sizes = bodySizes();
    for (const n of nodes.values()) if (spots.has(n.id)) n.settle = 0;
  }

  // Runners: one per lane, and for jobs and sessions one per running job or
  // busy session. Each keeps its own angle on the lane's center line.
  const horses = new Map();
  let lastSim = 0, rest = 0;
  function runnersOf() {
    const want = [];
    LANES.forEach((hub, i) => {
      let count = 1;
      if (hub === 'hub:jobs') count = Math.max(1, [...nodes.values()].filter(n => n.type === 'job' && n.live && !n.dying).length);
      if (hub === 'hub:sessions') count = Math.max(1, [...nodes.values()].filter(n => n.type === 'session' && n.live && !n.dying).length);
      for (let k = 0; k < count; k++) want.push({ key: hub + '#' + k, lane: i, k, count });
    });
    return want;
  }

  function simulate() {
    if (gen !== layoutGen || nodes.size !== layoutSize) { layout(); layoutGen = gen; layoutSize = nodes.size; }
    const now = performance.now();
    const dt = lastSim ? Math.min(0.1, (now - lastSim) / 1000) : 0;
    lastSim = now;
    alpha *= 0.988;
    rest = !calm && view.auto > 0 ? Math.min(1, rest + 0.01) : Math.max(0, rest - 0.05);
    faceFront(rest, 0, 0.55);
    for (const n of nodes.values()) {
      const s = spots.get(n.id);
      if (!s) continue;
      n.settle = Math.min(1, (n.settle || 0) + 0.04);
      const k = 0.12 + 0.88 * n.settle;
      n.x += (s.x - n.x) * k; n.y += (s.y - n.y) * k; n.z += (s.z - n.z) * k;
    }
    const t = now / 1000;
    const target = hotFile();
    const seen = new Set();
    let slot = 0;
    for (const r of runnersOf()) {
      seen.add(r.key);
      const { a, b } = laneRadii(r.lane);
      let h = horses.get(r.key);
      if (!h) {
        const th0 = (r.k / r.count) * 2 * Math.PI + 0.3;
        const p = ell(a + LW / 2, b + LW / 2, th0);
        h = { x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, th: th0, seed: hash(r.key), trip: undefined };
        horses.set(r.key, h);
      }
      // Laps: faster while the colony works, a jog at rest.
      const busy = r.lane === laneOf('hub:files') ? (target ? 1 : 0) : 0;
      h.th += dt * (0.35 + 0.15 * h.seed) * (1 - 0.5 * rest + 0.5 * busy);
      const lap = ell(a + LW / 2, b + LW / 2, h.th);
      lap.key = 'lap';
      // The files runner runs to each new file use, then back to its lane.
      if (r.lane === laneOf('hub:files')) {
        for (const n of nodes.values()) {
          if (n.type !== 'file' || !n.data || n.data.kind !== 'file') continue;
          if (n.raceAt === undefined) { n.raceAt = n.at || 0; continue; }
          if (n.at > n.raceAt) { n.raceAt = n.at; if (Date.now() - n.at < GLOW_MS) h.trip = { id: n.id, until: now + 3500 }; }
        }
        if (h.trip && (now > h.trip.until || !nodes.has(h.trip.id))) h.trip = undefined;
      }
      let goal = lap, follow = true;
      if (target) { const s = swarmSlot(slot++, target, t); goal = { ...s, key: 'swarm' + target.id }; follow = false; }
      else if (h.trip) { const n = nodes.get(h.trip.id); goal = { x: n.x, y: n.y + 8, z: n.z, key: 'trip' + n.id }; follow = false; }
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

    // The infield, then each lane as a band in its colony's color, with
    // white lane lines and a checkered start line at angle 0.
    const ring = (a, b) => { const pts = []; for (let i = 0; i <= 72; i++) { const p = ell(a, b, i / 72 * 2 * Math.PI); pts.push(screen(p.x, p.y, 0)); } return pts; };
    const path = pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
    path(ring(A, B));
    ctx.fillStyle = 'rgba(70,120,80,0.18)';
    ctx.fill();
    LANES.forEach((hub, i) => {
      const { a, b } = laneRadii(i);
      const n = nodes.get(hub);
      const outer = ring(a + LW, b + LW), inner = ring(a, b).reverse();
      ctx.beginPath();
      outer.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      inner.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = rgba(n ? n.color : '#888888', 0.13 * (n && inFocus(n) ? 1 : 0.4));
      ctx.fill();
      path(outer);
      ctx.strokeStyle = 'rgba(232,236,216,0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    for (let i = 0; i < 10; i++) {
      const a0 = A + (LANES.length * LW) * i / 10, a1 = A + (LANES.length * LW) * (i + 1) / 10;
      const p0 = screen(a0, -3, 0), p1 = screen(a1, 3, 0);
      ctx.fillStyle = i % 2 ? 'rgba(232,236,216,0.55)' : 'rgba(20,20,20,0.55)';
      ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x) + 1, Math.max(2, Math.abs(p1.y - p0.y)));
    }

    // Posts with pennants, far ones first. Pennant size follows the data;
    // a used item's pennant glows in the color of the use.
    const order = [...nodes.values()].filter(n => spots.has(n.id)).sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      const g = ease(grown(n.born, now, 600)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.55 : 1) * (lit ? 1 : 0.35) * (inFocus(n) ? 1 : 0.3) * n.fog;
      const base = screen(n.x, n.y, 0), top = screen(n.x, n.y, n.z + 14 * g);
      if (n.kind === 'hub') {
        // The lane's gate: two posts and a bar over the lane.
        const { a } = laneRadii(laneOf(n.id));
        const l = screen(a + 2, 0, 0), r = screen(a + LW - 2, 0, 0), lt = screen(a + 2, 0, 18), rt = screen(a + LW - 2, 0, 18);
        ctx.strokeStyle = rgba(n.color, 0.9 * fade);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(lt.x, lt.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(r.x, r.y); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = rgba('#d9c8a0', 0.7 * fade);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      const size = 7 * (sizes.get(n.id) || 0.8) * top.f * g;
      const color = heat > 0.01 ? OP[n.op] || n.color : n.color;
      const wave = calm ? 0 : Math.sin(t * 4 + n.phase) * 0.15;
      if (heat > 0.01) {
        const glow = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, size * (2 + 3 * heat));
        glow.addColorStop(0, rgba(color, 0.5 * heat * n.fog));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(top.x, top.y, size * (2 + 3 * heat), 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = rgba(color, Math.min(1, 0.75 + heat) * fade);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x + size * 1.6, top.y + size * (0.45 + wave));
      ctx.lineTo(top.x, top.y + size * 0.9);
      ctx.closePath();
      ctx.fill();
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.beginPath(); ctx.arc(top.x, top.y, size + k * 12 * top.f, 0, 6.2832); ctx.stroke();
      }
    }

    // Memory links and job–session links: dashed lines between posts.
    for (const e of edges.values()) {
      if (!e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      ctx.setLineDash(e.solid ? [] : [2, 4]);
      ctx.strokeStyle = rgba(e.color || '#cfe0ff', (e.solid ? 0.5 : 0.22) * (inFocus(a) ? 1 : 0.3) * (a.fog + b.fog) / 2);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horses, far ones first; in a swarm they wear shades.
    const herd = [...horses.values()].map(h => ({ h, d: screen(h.x, h.y, h.z).depth })).sort((p, q) => p.d - q.d);
    for (const { h } of herd) paintHorse(h, t, 1, { shades: h.shade || 0 });

    drawLabels(order, near, fc, inFocus, now, n => n.kind === 'hub' ? 22 * n.sf : 16 * n.sf);
  }

`,
}
