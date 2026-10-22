// Theme 5, caravan: a hex map, as in a strategy game. Each colony is a
// territory with a city (the hub) and one tile per item, inside a border in
// its color. Two tiles of open land lie between territories, with terrain:
// grassland, plains, forest, hills, water and mountains. Roads run tile by
// tile from city to city; horses carry crates along them, bring a red
// envelope to each file a tool uses, and swarm to a glowing file in shades.
import type { Theme } from '../web'

import { HORSE_KIT } from './horse'

export const CARAVAN: Theme = {
  name: 'caravan',
  legend: 'one territory per colony · house size = data · horses carry crates between cities, bring envelopes to the files tools use and swarm there in shades · drag to turn · pinch or scroll to zoom',
  script: HORSE_KIT + `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false;
  const ANGLE = { 'hub:skills': -90, 'hub:files': -18, 'hub:jobs': 54, 'hub:memory': 126, 'hub:sessions': 198 };
  const CITIES = ['hub:skills', 'hub:files', 'hub:jobs', 'hub:memory', 'hub:sessions'];
  function anchor(id) {
    const c = owner.get(id);
    return c ? tileCenter(c.q, c.r) : { x: 0, y: 0, z: 0 };
  }

  // The hex map, in axial coordinates (q, r).
  const TILE = 14, GAP = 2;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const tileCenter = (q, r) => ({ x: TILE * Math.sqrt(3) * (q + r / 2), y: TILE * 1.5 * r, z: 0 });
  const tkey = (q, r) => q + ',' + r;
  const tdist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
  function ringAround(q, r, k) {
    const out = [];
    let cq = q + DIRS[4][0] * k, cr = r + DIRS[4][1] * k;
    for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([cq, cr]); cq += DIRS[i][0]; cr += DIRS[i][1]; }
    return out;
  }
  function toHex(x, y) {
    const q = (Math.sqrt(3) / 3 * x - y / 3) / TILE, r = (2 / 3 * y) / TILE;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return [rq, rr];
  }
  // The hex tiles on a straight line between two tiles.
  function hexLine(a, b) {
    const n = tdist(a, b), out = [];
    for (let i = 0; i <= n; i++) {
      const u = n ? i / n : 0;
      const p = tileCenter(a[0] + (b[0] - a[0]) * u + 1e-6, a[1] + (b[1] - a[1]) * u + 1e-6);
      const h = toHex(p.x, p.y);
      if (!out.length || tkey(...out[out.length - 1]) !== tkey(...h)) out.push(h);
    }
    return out;
  }

  // Terrain from a fixed pattern of the tile's place: smooth enough that
  // forests and hills come in patches. Water and mountains only in open land.
  function terrainOf(q, r, open) {
    const p = tileCenter(q, r);
    const v = Math.sin(p.x * 0.021 + 1.3) * Math.cos(p.y * 0.024 - 0.7) + 0.6 * Math.sin((p.x + p.y) * 0.013 + 2.1) + 0.25 * (hash(tkey(q, r)) - 0.5);
    if (open && v < -0.95) return 'water';
    if (open && v > 1.05) return 'mountain';
    if (v > 0.55) return 'hills';
    if (v > 0.1) return 'forest';
    if (v > -0.45) return 'grass';
    return 'plains';
  }
  const TERRAIN = { grass: '#4f7a3f', plains: '#7d8a45', forest: '#3d6136', hills: '#7a6a48', water: '#2f5c7a', mountain: '#6c6c6c' };

  // Territories. Each city sits out from the middle by the size of its
  // colony; colonies take turns, one tile each, and a tile within GAP of
  // another colony's land stays open, so two tiles of open land lie between
  // borders. A tile takes the free tile nearest its parent's, then nearest
  // its city and the middle, so a folder and its files form one district.
  let owner = new Map(), tiles = new Map(), roads = [], sizes = new Map(), layoutGen = -1, layoutSize = -1;
  function layout() {
    const kids = childrenMap();
    const size = new Map();
    const count = id => {
      if (size.has(id)) return size.get(id);
      size.set(id, 1);
      let c = 1;
      for (const k of kids.get(id) || []) c += count(k.id);
      size.set(id, c);
      return c;
    };
    const rings = n => { let k = 0; while (1 + 3 * k * (k + 1) < n) k++; return k; };
    const land = new Map();
    const near = (cell, colony) => {
      for (let k = 1; k <= GAP; k++) for (const c of ringAround(cell[0], cell[1], k)) {
        const o = land.get(tkey(c[0], c[1]));
        if (o && o !== colony) return true;
      }
      return false;
    };
    const next = new Map(), cols = [];
    for (const city of CITIES) {
      if (!nodes.has(city)) continue;
      const a = ANGLE[city] * Math.PI / 180, d = TILE * Math.sqrt(3) * (rings(count(city)) + GAP + 1);
      const at = toHex(Math.cos(a) * d, Math.sin(a) * d);
      land.set(tkey(...at), city);
      next.set(city, { q: at[0], r: at[1], city });
      const order = [];
      const walk = id => {
        for (const c of (kids.get(id) || []).slice().sort((p, q) => count(q.id) - count(p.id) || p.id.localeCompare(q.id))) { order.push([c.id, id]); walk(c.id); }
      };
      walk(city);
      cols.push({ city, at, order, i: 0 });
    }
    for (let left = true; left;) {
      left = false;
      for (const col of cols) {
        if (col.i >= col.order.length) continue;
        left = true;
        const [id, parent] = col.order[col.i++];
        const pc = next.get(parent);
        if (!pc) continue;
        let best;
        for (let k = 1; k < 60 && !best; k++) {
          let score = Infinity;
          for (const cell of ringAround(pc.q, pc.r, k)) {
            if (land.has(tkey(...cell)) || near(cell, col.city)) continue;
            const s = tdist(cell, col.at) + 0.4 * tdist(cell, [0, 0]) + 0.001 * hash(id + cell);
            if (s < score) { score = s; best = cell; }
          }
        }
        if (!best) continue;
        land.set(tkey(...best), col.city);
        next.set(id, { q: best[0], r: best[1], city: col.city });
      }
    }
    owner = next;
    // Every tile on the map: the land, and open land GAP + 1 rings around it.
    tiles = new Map();
    for (const [k, city] of land) { const [q, r] = k.split(',').map(Number); tiles.set(k, { q, r, city, terrain: terrainOf(q, r, false) }); }
    for (const [k, city] of land) {
      const [q, r] = k.split(',').map(Number);
      for (let d = 1; d <= GAP + 1; d++) for (const c of ringAround(q, r, d)) {
        const ck = tkey(...c);
        if (!tiles.has(ck)) tiles.set(ck, { q: c[0], r: c[1], city: '', terrain: terrainOf(c[0], c[1], true) });
      }
    }
    // Roads: from each city to the next one round the pentagon, tile by tile.
    roads = [];
    const at = CITIES.map(c => next.get(c)).filter(Boolean);
    for (let i = 0; i < at.length; i++) {
      const a = at[i], b = at[(i + 1) % at.length];
      roads.push(hexLine([a.q, a.r], [b.q, b.r]).map(([q, r]) => tileCenter(q, r)));
    }
    sizes = bodySizes();
    for (const n of nodes.values()) if (owner.has(n.id)) n.settle = 0;
  }

  // A point at s (0 to 1) along a road.
  function along(road, s) {
    const segs = road.length - 1;
    if (segs < 1) return { ...road[0] };
    const f = Math.min(segs - 1e-6, Math.max(0, s * segs)), i = Math.floor(f), u = f - i;
    const a = road[i], b = road[i + 1];
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: 0 };
  }

  // Caravans: one horse per city and one per running job or busy session.
  // A horse walks the road to the next city, rests there, and goes on.
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
      const o = owner.get(n.id);
      if (!o) continue;
      const c = tileCenter(o.q, o.r);
      n.settle = Math.min(1, (n.settle || 0) + 0.04);
      const k = 0.12 + 0.88 * n.settle;
      n.x += (c.x - n.x) * k; n.y += (c.y - n.y) * k; n.z += (c.z - n.z) * k;
    }
    if (!roads.length) return;
    const t = now / 1000;
    const target = hotFile();
    const extra = [...nodes.values()].filter(n => (n.type === 'job' || n.type === 'session') && n.live && !n.dying).length;
    const want = roads.length + extra;
    const seen = new Set();
    let slot = 0;
    for (let i = 0; i < want; i++) {
      const key = 'c' + i;
      seen.add(key);
      let h = horses.get(key);
      if (!h) {
        const road = roads[i % roads.length];
        h = { x: road[0].x, y: road[0].y, z: 0, vx: 0, vy: 0, vz: 0, seed: hash(key), road: i % roads.length, leg: hash(key + 'l'), wait: 0 };
        horses.set(key, h);
      }
      const road = roads[h.road % roads.length];
      const len = road.length * TILE * 1.5;
      if (h.wait > 0) h.wait -= dt;
      else {
        h.leg += dt * (14 + 6 * h.seed) * (1 - 0.4 * rest) / Math.max(len, 1);
        if (h.leg >= 1) { h.leg = 0; h.road = (h.road + 1) % roads.length; h.wait = 1 + 2 * h.seed; }
      }
      const p = along(road, h.leg);
      const onRoad = { x: p.x, y: p.y, z: 0, key: 'road' };
      // The files city's horse brings an envelope to each new file use.
      if (i === 1) {
        for (const n of nodes.values()) {
          if (n.type !== 'file' || !n.data || n.data.kind !== 'file') continue;
          if (n.caravanAt === undefined) { n.caravanAt = n.at || 0; continue; }
          if (n.at > n.caravanAt) { n.caravanAt = n.at; if (Date.now() - n.at < GLOW_MS) h.trip = { id: n.id, until: now + 4000 }; }
        }
        if (h.trip && (now > h.trip.until || !nodes.has(h.trip.id))) h.trip = undefined;
      }
      let goal = onRoad, follow = true;
      h.carry = 'crate';
      if (target) { const s = swarmSlot(slot++, target, t); goal = { ...s, key: 'swarm' + target.id }; follow = false; }
      else if (h.trip) { const n = nodes.get(h.trip.id); goal = { x: n.x, y: n.y + 9, z: 0, key: 'trip' + n.id }; follow = false; h.carry = 'envelope'; }
      const dist = steer(h, goal, dt, follow);
      h.shade = (h.shade || 0) + ((target && dist < 20 ? 1 : 0) - (h.shade || 0)) * Math.min(1, dt * 2.5);
    }
    for (const key of [...horses.keys()]) if (!seen.has(key)) horses.delete(key);
  }

  // The outline of a tile on screen.
  function tilePath(c, scale) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      pts.push(screen(c.x + Math.cos(a) * TILE * scale, c.y + Math.sin(a) * TILE * scale, 0));
    }
    return pts;
  }
  const fillPath = pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };

  // A small mark for the terrain of a tile.
  function terrainMark(kind, x, y, f, fade, seed) {
    const u = TILE * f;
    if (kind === 'forest') {
      ctx.fillStyle = rgba('#2a4a26', 0.9 * fade);
      for (const [dx, dy] of [[-0.3, 0.1], [0.25, -0.1], [0, 0.35]]) {
        ctx.beginPath(); ctx.moveTo(x + dx * u, y + (dy - 0.3) * u); ctx.lineTo(x + (dx - 0.15) * u, y + dy * u); ctx.lineTo(x + (dx + 0.15) * u, y + dy * u); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'hills') {
      ctx.strokeStyle = rgba('#5a4a30', 0.9 * fade); ctx.lineWidth = Math.max(0.6, 0.08 * u);
      for (const dx of [-0.25, 0.2]) { ctx.beginPath(); ctx.arc(x + dx * u, y + 0.15 * u, 0.22 * u, Math.PI, 0); ctx.stroke(); }
    } else if (kind === 'water') {
      ctx.strokeStyle = rgba('#a9cbe6', 0.5 * fade); ctx.lineWidth = Math.max(0.6, 0.06 * u);
      for (const dy of [-0.15, 0.15]) { ctx.beginPath(); ctx.moveTo(x - 0.35 * u, y + dy * u); ctx.quadraticCurveTo(x - 0.1 * u, y + (dy - 0.12) * u, x + 0.1 * u, y + dy * u); ctx.quadraticCurveTo(x + 0.25 * u, y + (dy + 0.12) * u, x + 0.35 * u, y + dy * u); ctx.stroke(); }
    } else if (kind === 'mountain') {
      ctx.fillStyle = rgba('#8c8c8c', 0.95 * fade);
      ctx.beginPath(); ctx.moveTo(x - 0.45 * u, y + 0.3 * u); ctx.lineTo(x - 0.05 * u, y - 0.45 * u); ctx.lineTo(x + 0.4 * u, y + 0.3 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#e8ecf0', 0.9 * fade);
      ctx.beginPath(); ctx.moveTo(x - 0.17 * u, y - 0.22 * u); ctx.lineTo(x - 0.05 * u, y - 0.45 * u); ctx.lineTo(x + 0.08 * u, y - 0.22 * u); ctx.closePath(); ctx.fill();
    }
  }

  // A house: a box with a roof, sized by its data; a used one lights its window.
  function house(x, y, s, color, fade, lit) {
    ctx.fillStyle = rgba(color, 0.9 * fade);
    ctx.fillRect(x - s * 0.55, y - s * 0.7, s * 1.1, s * 0.7);
    ctx.fillStyle = rgba('#8a3b2e', 0.95 * fade);
    ctx.beginPath(); ctx.moveTo(x - s * 0.7, y - s * 0.68); ctx.lineTo(x, y - s * 1.2); ctx.lineTo(x + s * 0.7, y - s * 0.68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lit > 0.05 ? rgba('#ffe08a', Math.min(1, 0.4 + lit) * fade) : rgba('#1f2229', 0.7 * fade);
    ctx.fillRect(x - s * 0.16, y - s * 0.52, s * 0.32, s * 0.26);
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

    // Tiles: terrain, a tint of the owner's color, and a terrain mark. Open
    // land is darker, and fades out toward the map's edge.
    const list = [...tiles.values()].map(tl => ({ tl, c: tileCenter(tl.q, tl.r) }));
    for (const { tl, c } of list) {
      const pts = tilePath(c, 0.97);
      const s = screen(c.x, c.y, 0);
      const city = tl.city && nodes.get(tl.city);
      const dim = city ? (inFocus(city) ? 1 : 0.45) : 0.55;
      let edge = 1;
      if (!tl.city) {
        let d = 9;
        for (const [, o] of owner) d = Math.min(d, tdist([tl.q, tl.r], [o.q, o.r]));
        edge = d >= GAP + 1 ? 0.45 : 1;
      }
      fillPath(pts);
      ctx.fillStyle = rgba(TERRAIN[tl.terrain], 0.75 * dim * edge * s.fog);
      ctx.fill();
      if (city) { ctx.fillStyle = rgba(city.color, 0.16 * dim * s.fog); ctx.fill(); }
      terrainMark(tl.terrain, s.x, s.y, s.f, dim * edge * s.fog, hash(tkey(tl.q, tl.r)));
    }

    // Borders: a thick line in the owner's color on each tile edge that
    // meets another owner or open land.
    ctx.lineCap = 'round';
    for (const { tl, c } of list) {
      if (!tl.city) continue;
      const city = nodes.get(tl.city);
      if (!city) continue;
      const pts = tilePath(c, 0.9);
      for (let i = 0; i < 6; i++) {
        // Edge i joins corners i and i + 1. The neighbor across it sits at
        // twice the edge's middle from this tile's center.
        const mx = (Math.cos(Math.PI / 6 + i * Math.PI / 3) + Math.cos(Math.PI / 6 + (i + 1) * Math.PI / 3)) / 2;
        const my = (Math.sin(Math.PI / 6 + i * Math.PI / 3) + Math.sin(Math.PI / 6 + (i + 1) * Math.PI / 3)) / 2;
        const nb = toHex(c.x + mx * TILE * 2, c.y + my * TILE * 2);
        const other = tiles.get(tkey(...nb));
        if (other && other.city === tl.city) continue;
        const a = pts[i], b = pts[(i + 1) % 6];
        ctx.strokeStyle = rgba(city.color, 0.9 * (inFocus(city) ? 1 : 0.45) * a.fog);
        ctx.lineWidth = Math.max(1.5, 2.6 * a.f);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // Roads: a dirt band with ruts, tile by tile from city to city.
    for (const road of roads) {
      const pts = road.map(p => screen(p.x, p.y, 0));
      const stroke = (w, color, dash) => { ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); };
      stroke(Math.max(2, 4 * (pts[0] ? pts[0].f : 1)), 'rgba(160,125,80,0.75)', []);
      stroke(1, 'rgba(90,65,40,0.7)', [3, 4]);
    }
    ctx.setLineDash([]);

    // Cities and houses, far ones first.
    const order = [...nodes.values()].filter(n => owner.has(n.id)).sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      const g = ease(grown(n.born, now, 600)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.65 : 1) * (lit ? 1 : 0.35) * (inFocus(n) ? 1 : 0.35) * n.fog;
      const x = n.sx, y = n.sy + TILE * 0.35 * n.sf;
      if (heat > 0.01) {
        const hot = OP[n.op] || '#ffffff';
        const glow = ctx.createRadialGradient(x, y - TILE * 0.4 * n.sf, 0, x, y - TILE * 0.4 * n.sf, TILE * n.sf * (1.2 + 2 * heat));
        glow.addColorStop(0, rgba(hot, 0.55 * heat * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y - TILE * 0.4 * n.sf, TILE * n.sf * (1.2 + 2 * heat), 0, 6.2832); ctx.fill();
      }
      if (n.kind === 'hub') {
        // The city: a wall, three houses and a banner in its color.
        const s = TILE * 0.55 * n.sf;
        ctx.strokeStyle = rgba('#c9b48a', 0.9 * fade);
        ctx.lineWidth = Math.max(1, 1.6 * n.sf);
        ctx.beginPath(); ctx.ellipse(x, y - s * 0.3, s * 1.45, s * 0.8, 0, 0, 6.2832); ctx.stroke();
        house(x - s * 0.7, y, s * 0.8, '#d9c8a0', fade, 0);
        house(x + s * 0.7, y, s * 0.8, '#d9c8a0', fade, 0);
        house(x, y - s * 0.35, s, '#e8dcc0', fade, 0);
        ctx.strokeStyle = rgba('#5a4a30', fade); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + s * 1.1, y); ctx.lineTo(x + s * 1.1, y - s * 2.2); ctx.stroke();
        ctx.fillStyle = rgba(n.color, fade);
        ctx.beginPath(); ctx.moveTo(x + s * 1.1, y - s * 2.2); ctx.lineTo(x + s * 2, y - s * 1.9); ctx.lineTo(x + s * 1.1, y - s * 1.6); ctx.closePath(); ctx.fill();
        continue;
      }
      const s = (sizes.get(n.id) || 0.8) * TILE * 0.7 * n.sf * g;
      house(x, y, s, n.color, fade, heat);
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y - s * 0.5, s + k * 12 * n.sf, 0, 6.2832); ctx.stroke();
      }
    }

    // Memory links and job–session links: dashed lines between tiles.
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

    drawLabels(order, near, fc, inFocus, now, n => (n.kind === 'hub' ? 26 : 12) * n.sf);
  }

`,
}
