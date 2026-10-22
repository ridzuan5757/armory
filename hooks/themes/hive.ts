// Theme 3, hive: a bee colony. Each colony is a patch of honeycomb around
// its queen cell; an item is a hex cell next to its parent's cell. Bees fly
// to the cells that tools use, a running job has bees at work on its cell,
// and at rest bees wander, fan and dance.
import type { Theme } from '../web'

export const HIVE: Theme = {
  name: 'hive',
  legend: 'honey = use · bees fly to the files tools use, and swarm there in shades · idle: waggle dance, wandering bees · drag to turn · pinch or scroll to zoom',
  script: `
  // Combs are flat, so the view does not turn at rest: it eases back to
  // face them, and the bees are the motion.
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false;

  // Where each queen cell sits, as an angle out from the middle of the hive.
  const ANGLE = { 'hub:skills': -90, 'hub:files': -18, 'hub:jobs': 54, 'hub:memory': 126, 'hub:sessions': 198 };
  function anchor(id) {
    const c = cells.get(id);
    return c ? cellCenter(c) : { x: 0, y: 0, z: 0 };
  }

  // Hex grid in axial coordinates (q, r); HEX is the cell radius.
  const HEX = 11;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const hexXY = (q, r) => ({ x: HEX * Math.sqrt(3) * (q + r / 2), y: HEX * 1.5 * r });
  const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
  function ringAround(q, r, k) {
    const out = [];
    let cq = q + DIRS[4][0] * k, cr = r + DIRS[4][1] * k;
    for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([cq, cr]); cq += DIRS[i][0]; cr += DIRS[i][1]; }
    return out;
  }

  // One comb for the whole hive, on one hex grid. Each queen cell sits out
  // from the middle by about the size of its colony, so every colony grows
  // in to the middle and the colonies meet. A cell takes the free cell in the
  // nearest ring around its parent's cell, and of those the one that is near
  // its queen and near the middle: a folder and its files stay one cluster,
  // and the comb stays whole. Colonies take turns, one cell each, so no
  // colony takes the middle first.
  let cells = new Map(), layoutGen = -1, layoutSize = -1;
  function layout() {
    const kids = new Map();
    for (const e of edges.values()) {
      if (e.link) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b || b.kind === 'hub') continue;
      const list = kids.get(e.a) || [];
      list.push(b);
      kids.set(e.a, list);
    }
    const size = new Map();
    const count = id => {
      if (size.has(id)) return size.get(id);
      size.set(id, 1);
      let c = 1;
      for (const k of kids.get(id) || []) c += count(k.id);
      size.set(id, c);
      return c;
    };
    const used = new Set();
    const next = new Map();
    const hubs = [...nodes.values()].filter(n => n.kind === 'hub');
    // Rings a colony of n cells needs around its queen: 1 + 3k(k + 1) >= n.
    const rings = n => { let k = 0; while (1 + 3 * k * (k + 1) < n) k++; return k; };
    const queue = [];
    for (const hub of hubs) {
      const a = ANGLE[hub.id] * Math.PI / 180, d = HEX * Math.sqrt(3) * (rings(count(hub.id)) + 0.8);
      const at = pixelToHex(Math.cos(a) * d, Math.sin(a) * d);
      while (used.has(at[0] + ',' + at[1])) at[0]++;
      used.add(at[0] + ',' + at[1]);
      next.set(hub.id, { q: at[0], r: at[1], hub: hub.id });
      // Depth first order of this colony, so a subtree is placed together.
      const order = [];
      const walk = id => {
        for (const c of (kids.get(id) || []).slice().sort((p, q) => count(q.id) - count(p.id) || p.id.localeCompare(q.id))) {
          order.push([c.id, id]);
          walk(c.id);
        }
      };
      walk(hub.id);
      queue.push({ hub: hub.id, queen: at, order, i: 0 });
    }
    for (let left = true; left;) {
      left = false;
      for (const col of queue) {
        if (col.i >= col.order.length) continue;
        left = true;
        const [id, parent] = col.order[col.i++];
        const pc = next.get(parent);
        if (!pc) continue;
        let best;
        for (let k = 1; k < 60 && !best; k++) {
          let score = Infinity;
          for (const cell of ringAround(pc.q, pc.r, k)) {
            if (used.has(cell[0] + ',' + cell[1])) continue;
            const s = hexDist(cell, col.queen) + 0.5 * hexDist(cell, [0, 0]) + 0.001 * hash(id + cell);
            if (s < score) { score = s; best = cell; }
          }
        }
        if (!best) continue;
        used.add(best[0] + ',' + best[1]);
        next.set(id, { q: best[0], r: best[1], hub: col.hub });
      }
    }
    // Body sizes: each cell's body grows with its data, on a log scale
    // against the largest of its kind in its colony.
    const valueOf = n => n.type === 'skill' ? n.data.uses : (n.type === 'memory' || n.type === 'file') ? (n.data.size || 0) : -1;
    const top = new Map();
    for (const n of nodes.values()) {
      const v = valueOf(n);
      if (v < 0) continue;
      const key = n.colony + ':' + n.type;
      top.set(key, Math.max(top.get(key) || 0, v));
    }
    for (const [id, c] of next) {
      const n = nodes.get(id);
      if (!n) continue;
      const v = valueOf(n), max = top.get(n.colony + ':' + n.type) || 0;
      c.body = n.kind === 'hub' ? 1 : n.kind === 'group' ? 0.95 : v < 0 ? 0.85 : max > 0 ? 0.5 + 0.45 * Math.log1p(v) / Math.log1p(max) : 0.6;
      const old = cells.get(id);
      if (!old || old.q !== c.q || old.r !== c.r) n.settle = 0;
    }
    cells = next;
  }
  function pixelToHex(x, y) {
    const q = (Math.sqrt(3) / 3 * x - y / 3) / HEX, r = (2 / 3 * y) / HEX;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return [rq, rr];
  }
  const cellCenter = c => {
    const p = hexXY(c.q, c.r);
    return { x: p.x, y: p.y, z: 0 };
  };

  // Bees. A trip: fly from the queen cell to a cell, stay, fly back. Tools
  // send one bee per used file; a running job keeps a few bees at its cell;
  // at rest a few bees wander and one dances by each queen cell.
  const bees = [];
  let hum = 0, lastSim = 0, nextWander = 0;
  const FLY_MS = 1300, STAY_MS = 1600;
  function sendBee(hubId, targetId, kind, op) {
    const from = cells.get(hubId), to = cells.get(targetId);
    if (!from || !to) return;
    bees.push({ hub: hubId, target: targetId, kind, op, born: performance.now(), seed: hash(targetId + performance.now()), tail: [] });
  }
  function beePos(b, now) {
    const a = cellCenter(cells.get(b.hub)), tc = cells.get(b.target);
    if (!tc) return undefined;
    const t = cellCenter(tc);
    const k = now - b.born;
    // Out, stay, back; the path arcs up toward the viewer.
    let u, phase;
    if (k < FLY_MS) { u = ease(k / FLY_MS); phase = 'out'; }
    else if (k < FLY_MS + STAY_MS) { u = 1; phase = 'stay'; }
    else { u = 1 - ease(Math.min(1, (k - FLY_MS - STAY_MS) / FLY_MS)); phase = 'back'; }
    const lift = Math.sin(u * Math.PI) * (18 + 14 * b.seed);
    const jig = phase === 'stay' ? 3 : 0;
    return {
      x: a.x + (t.x - a.x) * u + Math.sin(k / 90 + b.seed * 9) * jig,
      y: a.y + (t.y - a.y) * u + Math.cos(k / 110 + b.seed * 7) * jig,
      z: a.z + lift + 4,
      phase,
    };
  }

  function simulate() {
    if (gen !== layoutGen || nodes.size !== layoutSize) { layout(); layoutGen = gen; layoutSize = nodes.size; }
    const now = performance.now();
    lastSim = now;
    alpha *= 0.988;
    hum = !calm && view.auto > 0 ? Math.min(1, hum + 0.01) : Math.max(0, hum - 0.05);
    if (hum > 0) {
      const back = (to, at) => { const d = Math.atan2(Math.sin(to - at), Math.cos(to - at)); return at + d * 0.02 * hum; };
      view.yaw = back(0.12, view.yaw); view.pitch = back(0.1, view.pitch);
    }
    for (const n of nodes.values()) {
      const c = cells.get(n.id);
      if (!c) continue;
      const t = cellCenter(c);
      n.settle = Math.min(1, (n.settle || 0) + 0.04);
      const k = 0.12 + 0.88 * n.settle;
      n.x += (t.x - n.x) * k; n.y += (t.y - n.y) * k; n.z += (t.z - n.z) * k;
      // A tool used this file just now: a bee flies to it.
      // Uses from before the page loaded send no bee: the first sight of a
      // file only notes its last use.
      if (n.type === 'file' && n.data && n.data.kind === 'file') {
        if (n.beeAt === undefined) n.beeAt = n.at || 0;
        else if (n.at > n.beeAt) {
          if (Date.now() - n.at < GLOW_MS) sendBee('hub:files', n.id, 'tool', n.op);
          n.beeAt = n.at;
        }
      }
    }
    // Bees at rest wander between cells of their colony.
    if (hum > 0.5 && now > nextWander && bees.filter(b => b.kind === 'wander').length < 4) {
      nextWander = now + 900 + 1400 * hash('w' + Math.floor(now));
      const list = [...nodes.values()].filter(n => n.kind !== 'hub' && cells.has(n.id) && !n.dying);
      const n = list[Math.floor(hash('wn' + Math.floor(now)) * list.length)];
      if (n) sendBee(cells.get(n.id).hub, n.id, 'wander');
    }
    for (let i = bees.length - 1; i >= 0; i--) {
      const b = bees[i];
      if (now - b.born > FLY_MS * 2 + STAY_MS || !cells.has(b.target)) bees.splice(i, 1);
    }
  }

  // The outline of a cell on screen, in its comb's plane.
  const tp = { x: 0, y: 0, z: 0 };
  function screen(x, y, z) { tp.x = x; tp.y = y; tp.z = z; project(tp); return { x: tp.sx, y: tp.sy, f: tp.sf, fog: tp.fog, depth: tp.depth }; }
  function hexPath(n, scale) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      pts.push(screen(n.x + Math.cos(a) * HEX * scale, n.y + Math.sin(a) * HEX * scale, n.z));
    }
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    return pts;
  }

  // One bee, after the sad bee plushie the person chose: a round fluffy body,
  // a big yellow front over a caramel band, pale blue wings on top, brown
  // stubby feet, and a sad face (eyes, blue tears, a frown, pink cheeks).
  // It sits upright, leans a little into its flight, and on a write trip
  // carries a bok choy. Small on screen, it keeps only its eyes.
  function drawBee(p, prev, t, fade, f, carry, shades) {
    const R = 5.5 * Math.max(1, f);
    const dx = prev ? p.x - prev.x : 0;
    const lean = Math.max(-0.35, Math.min(0.35, dx * 0.08));
    const flap = Math.sin(t * 40);
    const bob = Math.sin(t * 6) * R * 0.08;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(lean);
    ctx.globalAlpha = fade;
    // Wings, behind the body.
    ctx.fillStyle = '#a9cbe6';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * R * 0.28, -R * 0.95);
      ctx.rotate(side * (0.5 + 0.25 * flap));
      ctx.beginPath(); ctx.ellipse(0, -R * 0.25, R * 0.28, R * 0.48, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
    // Feet.
    ctx.fillStyle = '#a65a2e';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * R * 0.45, R * 0.92, R * 0.24, R * 0.16, 0, 0, 6.2832); ctx.fill(); }
    // Body: caramel, a yellow front over it, a yellow underside.
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832);
    ctx.fillStyle = '#d98a2b';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#f6dd4a';
    ctx.beginPath(); ctx.ellipse(0, -R * 0.12, R * 0.98, R * 0.8, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, R * 0.98, R * 0.75, R * 0.28, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    // Face.
    const eye = Math.max(0.6, R * 0.09);
    ctx.fillStyle = '#5a3418';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * R * 0.26, -R * 0.12, eye, 0, 6.2832); ctx.fill(); }
    if (R >= 6.5) {
      ctx.fillStyle = 'rgba(244,160,150,0.55)';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * R * 0.5, R * 0.16, R * 0.16, R * 0.1, 0, 0, 6.2832); ctx.fill(); }
      ctx.fillStyle = '#7ec8f0';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * R * 0.4, -R * 0.06);
        ctx.quadraticCurveTo(side * R * 0.5, R * 0.08, side * R * 0.4, R * 0.1);
        ctx.quadraticCurveTo(side * R * 0.3, R * 0.08, side * R * 0.4, -R * 0.06);
        ctx.fill();
      }
      ctx.strokeStyle = '#5a3418';
      ctx.lineWidth = Math.max(0.7, R * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, R * 0.2, R * 0.14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    // Swarm shades: black pixel sunglasses, the "deal with it" meme. They
    // drop onto the eyes as the bee arrives and lift as it leaves.
    if (shades > 0) {
      const u = Math.max(0.6, R * 0.13);
      const drop = (1 - shades) * R * 2.2;
      const ox = -5.5 * u, oy = -R * 0.12 - 1.5 * u - drop;
      const px = (x, y, w = 1) => ctx.fillRect(ox + x * u, oy + y * u, w * u + 0.3, u + 0.3);
      ctx.globalAlpha = fade * shades;
      ctx.fillStyle = '#111111';
      px(0, 0, 11);
      px(0, 1, 5); px(6, 1, 5);
      px(1, 2, 3); px(7, 2, 3);
      ctx.fillStyle = '#ffffff';
      px(1, 1); px(7, 1);
      ctx.globalAlpha = fade;
    }
    // The bok choy, held in front.
    if (carry) {
      ctx.fillStyle = '#eef3e6';
      ctx.beginPath(); ctx.ellipse(R * 0.15, R * 0.72, R * 0.14, R * 0.2, 0.3, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#7cc576';
      ctx.beginPath(); ctx.ellipse(R * 0.3, R * 0.42, R * 0.32, R * 0.24, -0.4, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // The swarm: while a file cell glows from a tool use, every resident bee
  // (the queen bees, the job workers, the wanderers) flies to that cell,
  // circles it and puts on shades. When the glow fades, they fly home.
  const swarm = { w: 0, target: undefined };
  function swarmUpdate(order) {
    let hot, best = 0;
    for (const n of order) {
      if (n.type !== 'file' || !n.data || n.data.kind !== 'file' || n.dying) continue;
      const h = heatOf(n);
      if (h > best) { best = h; hot = n; }
    }
    if (hot && best > 0.15 && !calm) {
      swarm.target = hot.id;
      swarm.w = Math.min(1, swarm.w + 0.03);
    } else {
      swarm.w = Math.max(0, swarm.w - 0.02);
    }
    return swarm.w > 0 ? nodes.get(swarm.target) : undefined;
  }
  // Each resident bee steers like a small flyer: a spring pulls it to where
  // it should be (its slot in the swarm, or its home), drag and a top speed
  // keep it slow, and a sideways push bends its path into a spiral that
  // fades near the end, so it glides in and settles. At home and not in a
  // swarm it sits exactly on its home path. Shades go on only once it has
  // arrived in the swarm, and come off before it leaves.
  const flyers = new Map();
  let flyFrame = 0, lastFly = 0;
  const VMAX = 40;
  function slotOf(i, target, t) {
    const a = i * 2.39996 + t * 0.6, r = HEX * (0.75 + 0.3 * (i % 3));
    return { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r * 0.8, z: target.z + 6 + 2 * Math.sin(t * 3 + i) };
  }
  function fly(key, home, i, target, t, dt) {
    let b = flyers.get(key);
    if (!b) {
      b = { x: home.x, y: home.y, z: home.z, vx: 0, vy: 0, vz: 0, shade: 0, seed: hash(key), home: true };
      flyers.set(key, b);
    }
    b.seen = flyFrame;
    const goal = target ? slotOf(i, target, t) : home;
    const dx = goal.x - b.x, dy = goal.y - b.y, dz = goal.z - b.z;
    const dist = Math.hypot(dx, dy, dz);
    // A new goal starts a new trip; the spiral is measured against its length.
    const goalKey = target ? target.id : 'home';
    if (b.goalKey !== goalKey) { b.goalKey = goalKey; b.start = Math.max(dist, 1); }
    if (!target && (b.home || dist < 1.5)) {
      // Back home: follow the home path exactly.
      b.x = home.x; b.y = home.y; b.z = home.z; b.vx = b.vy = b.vz = 0; b.home = true;
    } else if (!target && dist < HEX * 0.8) {
      // Nearly home: the home path moves (a dance), so ease onto it.
      b.x += (home.x - b.x) * 0.25; b.y += (home.y - b.y) * 0.25; b.z += (home.z - b.z) * 0.25;
      b.vx *= 0.7; b.vy *= 0.7; b.vz *= 0.7;
      b.home = Math.hypot(home.x - b.x, home.y - b.y, home.z - b.z) < 1.5;
    } else {
      b.home = false;
      const k = 1.1 * (0.7 + 0.6 * b.seed), drag = 1.5;
      // The spiral: a push across the line to the goal. It shrinks with the
      // square of the part of the trip still left, so the bee curves out at
      // the start and glides straight in at the end. Each bee turns its own way.
      const left = Math.min(1, dist / b.start);
      const side = (b.seed > 0.5 ? 1 : -1) * 30 * (0.6 + b.seed) * left * left;
      const nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0;
      b.vx += (dx * k - b.vx * drag + nx * side) * dt;
      b.vy += (dy * k - b.vy * drag + ny * side) * dt;
      b.vz += (dz * k - b.vz * drag + Math.sin(t * 2 + b.seed * 9) * 4) * dt;
      const v = Math.hypot(b.vx, b.vy, b.vz);
      if (v > VMAX) { b.vx *= VMAX / v; b.vy *= VMAX / v; b.vz *= VMAX / v; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
    const arrived = target && dist < HEX * 1.4;
    b.shade += ((arrived ? 1 : 0) - b.shade) * Math.min(1, dt * 2.5);
    return b;
  }
  // Forgets the bees that were not drawn this frame (a job ended, ...).
  function flyDone() {
    for (const [key, b] of flyers) if (b.seen !== flyFrame) flyers.delete(key);
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The background matches the terminal, so the pane looks transparent.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#292c33';
    ctx.fillRect(0, 0, W, H);
    for (const n of nodes.values()) project(n);
    // During a focus, the other combs dim, so the active one stands out.
    const ft = focus && nodes.get(focus.id);
    const fc = ft && (ft.kind === 'hub' ? ft.id : ft.colony);
    const inFocus = n => !fc || n.id === fc || n.colony === fc;
    const near = hover ? new Set([hover.id]) : undefined;
    if (hover) for (const e of edges.values()) {
      if (e.a === hover.id) near.add(e.b);
      if (e.b === hover.id) near.add(e.a);
    }
    const maxUse = Math.max(1, ...[...nodes.values()].filter(n => n.type === 'skill').map(n => n.data.uses));

    // Cells, far ones first.
    const order = [...nodes.values()].filter(n => cells.has(n.id)).sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      const g = ease(grown(n.born, now, 600)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.7 : 1) * (lit ? 1 : 0.35) * (inFocus(n) ? 1 : 0.3) * n.fog;
      const hub = n.kind === 'hub';
      // New wax grows out from the middle; a gone cell shrinks away. The
      // walls are the full cell; the body inside has the size of the data.
      const body = (cells.get(n.id).body || 0.8) * 0.92 * g;
      const pts = hexPath(n, body);
      // Fills are strong enough to read on the dark background, also when
      // the terminal dims the split.
      let fill = 0.28;
      if (hub) fill = 0.75;
      else if (n.kind === 'group') fill = 0.55;
      else if (n.type === 'job') fill = n.live ? 0.7 : 0.45;
      else if (n.type === 'memory') fill = 0.5;
      ctx.fillStyle = rgba(n.color, fill * fade);
      ctx.fill();
      // Honey: a skill cell fills from the bottom with its uses, and shines.
      if (n.type === 'skill' && n.data.uses > 0) {
        const lo = Math.max(...pts.map(p => p.y)), hi = Math.min(...pts.map(p => p.y));
        const level = Math.sqrt(n.data.uses / maxUse);
        ctx.save();
        ctx.clip();
        ctx.fillStyle = rgba('#f5b94a', 0.95 * fade);
        ctx.fillRect(n.sx - 40, lo - (lo - hi) * level, 80, (lo - hi) * level + 2);
        const shine = (t * 0.35 + n.phase) % 1;
        ctx.fillStyle = rgba('#fff4c8', 0.25 * hum * fade);
        ctx.fillRect(n.sx - 40, lo - (lo - hi) * level * shine - 1, 80, 1.2);
        ctx.restore();
      }
      // Capped memory: a lighter wax cap inside the cell.
      if (n.type === 'memory') {
        hexPath(n, body * 0.6);
        ctx.fillStyle = rgba('#f3e2b0', 0.4 * fade);
        ctx.fill();
      }
      // A used cell glows in the color of the use.
      if (heat > 0.01) {
        const hot = OP[n.op] || '#ffffff';
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, HEX * n.sf * (1.5 + 2.5 * heat));
        glow.addColorStop(0, rgba(hot, 0.5 * heat * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, HEX * n.sf * (1.5 + 2.5 * heat), 0, 6.2832); ctx.fill();
        hexPath(n, body);
        ctx.fillStyle = rgba(hot, 0.55 * heat * n.fog);
        ctx.fill();
      }
      // Wax walls; the queen cell has a heavy bright wall.
      hexPath(n, 0.98 * g);
      ctx.strokeStyle = hub ? rgba(n.color, fade) : rgba('#e3c06a', (n.dim ? 0.45 : 0.8) * fade);
      ctx.lineWidth = hub ? 2.2 : 1.4;
      ctx.stroke();
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        hexPath(n, 0.92 + k * 0.8);
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.stroke();
      }
    }

    // Links: faint dance lines between cells (memory [[links]], a job and the
    // sessions in its folder); a job and its own session have a solid one.
    ctx.lineWidth = 1;
    for (const e of edges.values()) {
      if (!e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      const lit = !hover || (near.has(e.a) && near.has(e.b));
      ctx.setLineDash(e.solid ? [] : [2, 4]);
      ctx.lineWidth = e.solid ? 1.6 : 1;
      ctx.strokeStyle = rgba(e.color || '#f3e2b0', (e.solid ? 0.6 : 0.3) * (lit ? 1 : 0.3) * (inFocus(a) ? 1 : 0.3) * (a.fog + b.fog) / 2);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    // Bees on trips, with a short trail. Wanderers join a swarm.
    const crowd = swarmUpdate(order);
    const dt = lastFly ? Math.min(0.1, (now - lastFly) / 1000) : 0;
    lastFly = now;
    flyFrame++;
    let slot = 0;
    for (const b of bees) {
      let p = beePos(b, now);
      if (!p) continue;
      if (b.kind === 'wander' && hum <= 0 && !crowd) continue;
      if (b.kind === 'wander') p = { ...fly('w' + b.seed, p, slot++, crowd, t, dt), phase: p.phase };
      const s = screen(p.x, p.y, p.z);
      b.tail.push({ x: s.x, y: s.y });
      if (b.tail.length > 6) b.tail.shift();
      const target = nodes.get(b.target);
      const fade = (b.kind === 'wander' ? Math.max(hum, swarm.w) : 1) * (target && !inFocus(target) ? 0.35 : 1) * s.fog;
      for (let i = 1; i < b.tail.length; i++) {
        ctx.strokeStyle = rgba('#f5b94a', 0.25 * (i / b.tail.length) * fade);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.tail[i - 1].x, b.tail[i - 1].y); ctx.lineTo(b.tail[i].x, b.tail[i].y); ctx.stroke();
      }
      // A tool bee at the swarm's cell wears shades while it stays there.
      const shades = b.kind === 'wander' ? p.shade : crowd && b.target === swarm.target && p.phase === 'stay' ? 1 : 0;
      drawBee({ x: s.x, y: s.y }, b.tail[b.tail.length - 2], t + b.seed, fade, s.f, b.op === 'write' && p.phase !== 'back', shades);
    }

    // Bees at work on each running job: three that circle close over it.
    if (!calm) for (const n of order) {
      if (!n.live || n.dying) continue;
      for (let i = 0; i < 3; i++) {
        const a = t * (1.8 + 0.4 * i) + i * 2.1 + n.phase;
        const home = { x: n.x + Math.cos(a) * HEX * 0.8, y: n.y + Math.sin(a * 1.3) * HEX * 0.6, z: n.z + 5 };
        const q = fly('j' + n.id + i, home, slot++, crowd, t, dt);
        const s = screen(q.x, q.y, q.z);
        const back = q.home ? { x: s.x - Math.sin(a), y: s.y + Math.cos(a) } : screen(q.x - q.vx * 0.05, q.y - q.vy * 0.05, q.z);
        const seen = !q.home && crowd ? crowd : n;
        drawBee({ x: s.x, y: s.y }, back, t + i, (inFocus(seen) ? 1 : 0.35) * s.fog, s.f, false, q.shade);
      }
    }

    // At rest, one bee dances a waggle figure-8 beside each queen cell: the
    // straight run shakes side to side, then it loops back. In a swarm the
    // queen bees fly to the crowd too, so it is never small.
    if (!calm) for (const n of order) {
      if (n.kind !== 'hub') continue;
      const u = t * 1.4 + n.phase;
      const run = Math.cos(u) > 0.3;
      const wag = run ? Math.sin(t * 40) * 1.6 : 0;
      const x = n.x + HEX * 1.9 + Math.sin(u) * HEX * 0.9 + wag;
      const y = n.y + Math.sin(u) * Math.cos(u) * HEX * 0.9;
      const q = fly('q' + n.id, { x, y, z: n.z + 5 }, slot++, crowd, t, dt);
      // A queen bee shows while it dances at rest, or while it is away.
      if (hum <= 0 && q.home) continue;
      const s = screen(q.x, q.y, q.z);
      const back = q.home ? screen(q.x - Math.cos(u) * 2, q.y - Math.cos(2 * u) * 2, q.z) : screen(q.x - q.vx * 0.05, q.y - q.vy * 0.05, q.z);
      const seen = !q.home && crowd ? crowd : n;
      drawBee({ x: s.x, y: s.y }, { x: back.x, y: back.y }, t, (q.home ? hum : 1) * (inFocus(seen) ? 1 : 0.35) * s.fog, s.f, false, q.shade);
    }
    flyDone();

    // Labels keep one screen size, with a halo of the background. A small
    // cell shows its name only when it glows, when the pointer is on it or a
    // neighbor, or when a focus is on its comb.
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of order) {
      const show = n.kind !== 'leaf' || heatOf(n) > 0.2 || n === hover || (hover && near.has(n.id)) || (fc && n.showLabel && inFocus(n));
      if (!show || grown(n.born, now, 600) < 1) continue;
      if (!inFocus(n) && n.kind !== 'hub' && n !== hover) continue;
      const hub = n.kind === 'hub';
      ctx.font = (hub ? '600 11px' : '10.5px') + ' ui-sans-serif, -apple-system, sans-serif';
      const text = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      const y = n.sy - HEX * n.sf - 5;
      ctx.globalAlpha = n.fog;
      ctx.strokeStyle = 'rgba(41,44,51,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(text, n.sx, y);
      const lit = !hover || near.has(n.id);
      ctx.fillStyle = hub ? n.color : lit ? 'rgba(232,236,216,0.9)' : 'rgba(232,236,216,0.3)';
      ctx.fillText(text, n.sx, y);
    }
    ctx.globalAlpha = 1;
  }

`,
}
