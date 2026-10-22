// Theme 5, caravan: a world first, then the colonies on it. A diamond-square
// height map and a moisture map make one island continent with seas, beaches,
// deserts, plains, grassland, forests, hills, mountains, snow peaks and a
// volcano on the highest peak. Rivers flow from the heights to the sea. Each
// colony gets a city on good land and grows a territory by travel cost, so
// borders follow coasts and bend around mountains. Horses plan routes with A*
// over the terrain, take boats over water, carry crates from city to city,
// bring a red envelope to each file a tool uses, and swarm to a glowing file
// in shades. At each file write the volcano erupts.
import type { Theme } from '../web'

import { HORSE_KIT } from './horse'

export const CARAVAN: Theme = {
  name: 'caravan',
  legend: 'a fractal world · one territory per colony · house size = data · horses plan routes over the terrain, take boats, bring envelopes to the files tools use and swarm there in shades · the volcano erupts at each write · drag to turn · pinch or scroll to zoom',
  script: HORSE_KIT + `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false;
  const CITIES = ['hub:skills', 'hub:files', 'hub:jobs', 'hub:memory', 'hub:sessions'];
  function anchor(id) {
    const c = owner.get(id);
    return c ? tileCenter(c.q, c.r) : { x: 0, y: 0, z: 0 };
  }

  // The hex map, in axial coordinates (q, r).
  const TILE = 13, GAP = 2;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const tileCenter = (q, r) => ({ x: TILE * Math.sqrt(3) * (q + r / 2), y: TILE * 1.5 * r, z: 0 });
  const tkey = (q, r) => q + ',' + r;
  const tdist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
  const unkey = k => k.split(',').map(Number);
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

  // A small priority queue, for Dijkstra and A*.
  function heap() {
    const a = [];
    return {
      get size() { return a.length; },
      push(k, p) {
        a.push([p, k]);
        let i = a.length - 1;
        while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      },
    };
  }

  // Fractal terrain by diamond-square on a (2^k + 1) grid: the corners get
  // random heights; then, level by level, each square's middle gets the
  // mean of its corners plus a random offset (the diamond step), each
  // diamond's middle the mean of its neighbors plus an offset (the square
  // step), and the offset shrinks by rough at each level. A fixed seed (2026,
  // the Year of the Horse) gives the same world at each reload.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function diamondSquare(k, rough, seed) {
    const n = (1 << k) + 1, g = new Float32Array(n * n), rnd = rng(seed);
    const at = (x, y) => g[y * n + x];
    const set = (x, y, v) => { g[y * n + x] = v; };
    set(0, 0, rnd()); set(n - 1, 0, rnd()); set(0, n - 1, rnd()); set(n - 1, n - 1, rnd());
    let step = n - 1, amp = 1;
    while (step > 1) {
      const half = step / 2;
      for (let y = half; y < n; y += step) {
        for (let x = half; x < n; x += step) {
          set(x, y, (at(x - half, y - half) + at(x + half, y - half) + at(x - half, y + half) + at(x + half, y + half)) / 4 + (rnd() - 0.5) * amp);
        }
      }
      for (let y = 0; y < n; y += half) {
        for (let x = (y / half) % 2 === 0 ? half : 0; x < n; x += step) {
          let sum = 0, c = 0;
          if (x - half >= 0) { sum += at(x - half, y); c++; }
          if (x + half < n) { sum += at(x + half, y); c++; }
          if (y - half >= 0) { sum += at(x, y - half); c++; }
          if (y + half < n) { sum += at(x, y + half); c++; }
          set(x, y, sum / c + (rnd() - 0.5) * amp);
        }
      }
      step = half;
      amp *= rough;
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of g) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < g.length; i++) g[i] = (g[i] - lo) / (hi - lo || 1);
    return { n, g };
  }
  function sample(map, u, v) {
    const x = Math.max(0, Math.min(1, u)) * (map.n - 1), y = Math.max(0, Math.min(1, v)) * (map.n - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(map.n - 1, x0 + 1), y1 = Math.min(map.n - 1, y0 + 1);
    const fx = x - x0, fy = y - y0, g = map.g, n = map.n;
    return (g[y0 * n + x0] * (1 - fx) + g[y0 * n + x1] * fx) * (1 - fy) + (g[y1 * n + x0] * (1 - fx) + g[y1 * n + x1] * fx) * fy;
  }
  const SEED = 2026, SPAN = TILE * Math.sqrt(3) * 34;
  const HEIGHT = diamondSquare(7, 0.55, SEED), MOIST = diamondSquare(7, 0.6, SEED + 7);

  const TERRAIN = {
    deep: '#1f3f5c', water: '#2f5c7a', sand: '#c2b280', desert: '#b8955a', plains: '#7d8a45', grass: '#4f7a3f',
    forest: '#3d6136', hills: '#7a6a48', mountain: '#6c6c6c', snow: '#d8dde3', volcano: '#4a3a35',
  };
  const WET = { deep: 1, water: 1 };
  // Land a colony may hold: not water, snow or the volcano.
  const HOLDABLE = { sand: 1, desert: 1, plains: 1, grass: 1, forest: 1, hills: 1, mountain: 1 };

  // The world: every tile within a hex radius R of the middle. Height from
  // the fractal map, pulled down toward the edge so the land is an island;
  // the sea level makes about 55 % land. Height and moisture set the biome.
  let tiles = new Map(), volcano = '', worldR = 0, rivers = [], riverSet = new Set();
  function buildWorld(R) {
    worldR = R;
    tiles = new Map();
    const raw = [];
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        const c = tileCenter(q, r);
        const u = (c.x / SPAN + 1) / 2, v = (c.y / SPAN + 1) / 2;
        const d = tdist([q, r], [0, 0]) / R;
        raw.push({ q, r, e: sample(HEIGHT, u, v) - 0.9 * d * d, m: sample(MOIST, u, v) });
      }
    }
    const es = raw.map(t => t.e).sort((a, b) => a - b);
    const sea = es[Math.floor(es.length * 0.45)], top = es[es.length - 1];
    // Moisture limits by share of the land, so every world has all four
    // lowland biomes: the driest 12 % desert, then 30 % plains, 30 %
    // grassland, and the wettest 28 % forest.
    const ms = raw.filter(t => t.e >= sea).map(t => t.m).sort((a, b) => a - b);
    const mq = f => ms[Math.min(ms.length - 1, Math.floor(ms.length * f))] ?? 0.5;
    const dry = mq(0.12), mid = mq(0.42), wet = mq(0.72);
    for (const t of raw) {
      const h = (t.e - sea) / (top - sea || 1);
      let terrain;
      if (h < -0.25) terrain = 'deep';
      else if (h < 0) terrain = 'water';
      else if (h < 0.06) terrain = 'sand';
      else if (h > 0.9) terrain = 'snow';
      else if (h > 0.78) terrain = 'mountain';
      else if (h > 0.6) terrain = 'hills';
      else terrain = t.m < dry ? 'desert' : t.m < mid ? 'plains' : t.m < wet ? 'grass' : 'forest';
      tiles.set(tkey(t.q, t.r), { q: t.q, r: t.r, h, m: t.m, terrain, city: '' });
    }
    let vh = -1;
    for (const [k, tl] of tiles) if (tl.h > vh) { vh = tl.h; volcano = k; }
    tiles.get(volcano).terrain = 'volcano';
    // Rivers: from up to four high tiles at least five apart, downhill to the
    // sea. In a hollow the river takes the lowest way on, three times at most.
    rivers = [];
    riverSet = new Set();
    const highs = [...tiles.entries()].filter(([, tl]) => tl.h > 0.55 && tl.terrain !== 'volcano').sort((a, b) => b[1].h - a[1].h);
    for (const [sk] of highs) {
      if (rivers.length >= 4) break;
      if ([...riverSet, volcano].some(k => tdist(unkey(k), unkey(sk)) < 5)) continue;
      const path = [sk];
      let cur = unkey(sk), pits = 0;
      for (let step = 0; step < 40; step++) {
        let best, low = Infinity;
        for (const [dq, dr] of DIRS) {
          const k = tkey(cur[0] + dq, cur[1] + dr);
          if (!tiles.has(k) || path.includes(k)) continue;
          // A small random push, so the river changes direction now and then.
          const v = tiles.get(k).h + 0.06 * hash('flow' + k);
          if (v < low) { low = v; best = k; }
        }
        if (!best) break;
        if (low >= tiles.get(tkey(...cur)).h + 0.03 && ++pits > 3) break;
        path.push(best);
        cur = unkey(best);
        if (WET[tiles.get(best).terrain]) break;
      }
      if (path.length >= 4) { rivers.push(path); path.forEach(k => riverSet.add(k)); }
    }
    // Land by a river is wetter: a desert there turns to plains.
    for (const k of riverSet) {
      for (const [dq, dr] of [[0, 0], ...DIRS]) {
        const [q, r] = unkey(k), tl = tiles.get(tkey(q + dq, r + dr));
        if (tl && tl.terrain === 'desert') tl.terrain = 'plains';
      }
    }
  }

  // The cost of entering a tile. Roads are fast; water needs a boat; a river
  // costs extra to cross, except over a bridge (a road tile).
  const COST = { deep: 2, water: 1.5, sand: 1, desert: 1.5, plains: 1, grass: 1, forest: 2, hills: 3, mountain: 6, snow: 8, volcano: 10 };
  let roads = [], roadSet = new Set();
  function costOf(k) {
    const tl = tiles.get(k);
    if (!tl) return Infinity;
    if (WET[tl.terrain]) return COST[tl.terrain];
    if (roadSet.has(k)) return 0.5;
    return COST[tl.terrain] + (riverSet.has(k) ? 1.5 : 0);
  }
  // Dijkstra from one tile: the travel cost to every tile.
  function costsFrom(start) {
    const dist = new Map([[start, 0]]), q = heap();
    q.push(start, 0);
    while (q.size) {
      const [d, k] = q.pop();
      if (d > dist.get(k)) continue;
      const [x, y] = unkey(k);
      for (const [dq, dr] of DIRS) {
        const nk = tkey(x + dq, y + dr);
        if (!tiles.has(nk)) continue;
        const nd = d + costOf(nk);
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); q.push(nk, nd); }
      }
    }
    return dist;
  }
  // A* over the tiles. Plans are kept until the map changes.
  const plans = new Map();
  function findPath(from, to) {
    const memo = plans.get(from + '>' + to);
    if (memo) return memo;
    const goal = unkey(to), cost = new Map([[from, 0]]), came = new Map(), q = heap();
    q.push(from, 0);
    let path = [from];
    while (q.size) {
      const [, cur] = q.pop();
      if (cur === to) {
        let k = cur;
        path = [k];
        while (came.has(k)) { k = came.get(k); path.push(k); }
        path.reverse();
        break;
      }
      const [x, y] = unkey(cur);
      for (const [dq, dr] of DIRS) {
        const nk = tkey(x + dq, y + dr);
        if (!tiles.has(nk)) continue;
        const g = cost.get(cur) + costOf(nk);
        if (g < (cost.get(nk) ?? Infinity)) { cost.set(nk, g); came.set(nk, cur); q.push(nk, g + 0.5 * tdist([x + dq, y + dr], goal)); }
      }
    }
    plans.set(from + '>' + to, path);
    return path;
  }

  // Colonies on the world. The world grows with the data (more items, a
  // larger island). City sites: the best land for a city (good biome, by a
  // river, on the coast, with room around it), five tiles or more apart.
  // The largest colony gets the best site. Then the colonies take turns, one
  // item each: an item takes the free tile near its parent's tile that is
  // cheapest to reach from its city, and no tile within GAP of another
  // colony; so a folder and its files form one district, and borders follow
  // the land.
  let owner = new Map(), sizes = new Map(), layoutGen = -1, layoutSize = -1;
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
    const cities = CITIES.filter(c => nodes.has(c));
    const items = cities.reduce((s, c) => s + count(c), 0);
    let R = 10;
    while (R < 30 && 0.5 * (1 + 3 * R * (R + 1)) < items * 2.2 + 40) R++;
    if (R !== worldR) buildWorld(R);
    roads = []; roadSet = new Set(); plans.clear();
    for (const tl of tiles.values()) tl.city = '';

    // City sites.
    const score = new Map();
    for (const [k, tl] of tiles) {
      if (!HOLDABLE[tl.terrain] || tl.terrain === 'mountain' || riverSet.has(k)) continue;
      const [q, r] = unkey(k);
      let s = { grass: 3, plains: 3, forest: 2, sand: 2, desert: 1, hills: 1.5 }[tl.terrain] || 0;
      if ([[0, 0], ...DIRS].some(([dq, dr]) => riverSet.has(tkey(q + dq, r + dr)))) s += 3;
      if (DIRS.some(([dq, dr]) => { const n = tiles.get(tkey(q + dq, r + dr)); return n && WET[n.terrain]; })) s += 2;
      let room = 0;
      for (let d = 1; d <= 3; d++) for (const c of ringAround(q, r, d)) { const n = tiles.get(tkey(...c)); if (n && HOLDABLE[n.terrain]) room++; }
      score.set(k, s + 0.15 * room + 0.01 * hash(k));
    }
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    let sites = [];
    for (let gap = Math.max(5, Math.round(R * 0.55)); gap >= 2 && sites.length < cities.length; gap--) {
      sites = [];
      for (const k of ranked) {
        if (sites.length >= cities.length) break;
        if (sites.every(s => tdist(unkey(s), unkey(k)) >= gap)) sites.push(k);
      }
    }
    const bySize = cities.slice().sort((a, b) => count(b) - count(a));
    const next = new Map(), land = new Map();
    bySize.forEach((city, i) => {
      const k = sites[i] || ranked[i];
      const [q, r] = unkey(k);
      next.set(city, { q, r, city });
      land.set(k, city);
    });
    const cost = new Map(bySize.map(city => [city, costsFrom(tkey(next.get(city).q, next.get(city).r))]));

    // Territories, by turns.
    const nearOther = (cell, city) => {
      for (let d = 1; d <= GAP; d++) for (const c of ringAround(cell[0], cell[1], d)) {
        const o = land.get(tkey(...c));
        if (o && o !== city) return true;
      }
      return false;
    };
    const cols = bySize.map(city => {
      const order = [];
      const walk = id => {
        for (const c of (kids.get(id) || []).slice().sort((p, q) => count(q.id) - count(p.id) || p.id.localeCompare(q.id))) { order.push([c.id, id]); walk(c.id); }
      };
      walk(city);
      return { city, order, i: 0 };
    });
    for (let left = true; left;) {
      left = false;
      for (const col of cols) {
        if (col.i >= col.order.length) continue;
        left = true;
        const [id, parent] = col.order[col.i++];
        const pc = next.get(parent) || next.get(col.city);
        const toCity = cost.get(col.city);
        let best;
        // First within the rules; then without the gap; then any free tile.
        for (const strict of [2, 1, 0]) {
          let bs = Infinity;
          for (let k = 1; k <= (strict ? 10 : R * 2); k++) {
            for (const cell of ringAround(pc.q, pc.r, k)) {
              const ck = tkey(...cell), tl = tiles.get(ck);
              if (!tl || land.has(ck)) continue;
              if (strict && (!HOLDABLE[tl.terrain] || riverSet.has(ck))) continue;
              if (strict === 2 && nearOther(cell, col.city)) continue;
              const s = k + 0.25 * (toCity.get(ck) ?? 99) + 0.001 * hash(id + ck);
              if (s < bs) { bs = s; best = cell; }
            }
            if (best && k > 2) break;
          }
          if (best) break;
        }
        if (!best) continue;
        land.set(tkey(...best), col.city);
        next.set(id, { q: best[0], r: best[1], city: col.city });
      }
    }
    for (const [k, city] of land) { const tl = tiles.get(k); if (tl) tl.city = city; }
    owner = next;

    // Roads: around the cities in order of angle, each the cheapest route on
    // land (water tiles on a road are a ferry).
    const ring = cities.filter(c => next.has(c)).sort((a, b) => {
      const pa = tileCenter(next.get(a).q, next.get(a).r), pb = tileCenter(next.get(b).q, next.get(b).r);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    });
    for (let i = 0; i < ring.length; i++) {
      const a = next.get(ring[i]), b = next.get(ring[(i + 1) % ring.length]);
      const path = findPath(tkey(a.q, a.r), tkey(b.q, b.r));
      roads.push(path);
    }
    for (const path of roads) for (const k of path) if (!WET[tiles.get(k).terrain]) roadSet.add(k);
    plans.clear();
    sizes = bodySizes();
    for (const n of nodes.values()) if (owner.has(n.id)) n.settle = 0;
  }

  // The tile under a point, or the nearest tile on the map.
  function tileAt(x, y) {
    const k = tkey(...toHex(x, y));
    if (tiles.has(k)) return k;
    let best, bd = Infinity;
    for (const [tk, tl] of tiles) { const c = tileCenter(tl.q, tl.r), d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = tk; } }
    return best;
  }
  const centerOf = k => { const [q, r] = unkey(k); return tileCenter(q, r); };

  // Caravans: one horse per city and one per running job or busy session.
  // Each plans its route with A* and walks it tile by tile, at a speed that
  // follows each tile's cost: on a road it trots, in the mountains it crawls,
  // and on water it sits in a boat. It travels from city to city and rests in
  // each; the files city's horse brings an envelope to each new file use; in
  // a swarm every horse plans a route to the glowing house.
  const horses = new Map();
  let lastSim = 0, rest = 0, lastWrite = 0;
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
      // The newest write or new file, for the volcano.
      if (n.type === 'file' && (n.op === 'write' || n.op === 'new') && n.at > lastWrite) lastWrite = n.at;
    }
    const cities = CITIES.filter(c => owner.has(c));
    if (!cities.length || !tiles.size) return;
    const t = now / 1000;
    const target = hotFile();
    const extra = [...nodes.values()].filter(n => (n.type === 'job' || n.type === 'session') && n.live && !n.dying).length;
    const want = cities.length + extra;
    const seen = new Set();
    let slot = 0;
    for (let i = 0; i < want; i++) {
      const key = 'c' + i;
      seen.add(key);
      let h = horses.get(key);
      if (!h) {
        const c = owner.get(cities[i % cities.length]), p = tileCenter(c.q, c.r);
        h = { x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, seed: hash(key), city: (i + 1) % cities.length, path: [], pi: 0, u: 0, wait: 0 };
        horses.set(key, h);
      }
      // The files city's horse takes each new file use as a trip.
      if (i === 1) {
        for (const n of nodes.values()) {
          if (n.type !== 'file' || !n.data || n.data.kind !== 'file') continue;
          if (n.caravanAt === undefined) { n.caravanAt = n.at || 0; continue; }
          if (n.at > n.caravanAt) { n.caravanAt = n.at; if (Date.now() - n.at < GLOW_MS) h.trip = { id: n.id, until: now + 8000 }; }
        }
        if (h.trip && (now > h.trip.until || !owner.has(h.trip.id))) h.trip = undefined;
      }
      // The goal tile: the swarm's house, a trip's house, or the next city.
      let goal, mode;
      if (target && owner.has(target.id)) { const o = owner.get(target.id); goal = tkey(o.q, o.r); mode = 'swarm'; }
      else if (h.trip) { const o = owner.get(h.trip.id); goal = tkey(o.q, o.r); mode = 'trip'; }
      else { const o = owner.get(cities[h.city % cities.length]); goal = tkey(o.q, o.r); mode = 'travel'; }
      if (h.goal !== goal || h.gen !== layoutGen) {
        h.goal = goal; h.gen = layoutGen;
        h.path = findPath(tileAt(h.x, h.y), goal);
        h.pi = 0; h.u = 0;
      }
      // Walk the plan: one tile at a time, slower on costly tiles.
      let px, py;
      if (h.pi < h.path.length - 1) {
        if (h.wait > 0) h.wait -= dt;
        else {
          h.u += dt * 1.3 * (1 - 0.4 * rest) / costOf(h.path[h.pi + 1]);
          while (h.u >= 1 && h.pi < h.path.length - 1) { h.u -= 1; h.pi++; }
        }
        const a = centerOf(h.path[h.pi]), b = centerOf(h.path[Math.min(h.pi + 1, h.path.length - 1)]);
        const u = h.pi < h.path.length - 1 ? h.u : 0;
        px = a.x + (b.x - a.x) * u; py = a.y + (b.y - a.y) * u;
      } else {
        const end = centerOf(h.path[h.path.length - 1] || goal);
        px = end.x; py = end.y;
        if (mode === 'travel') { h.city = (h.city + 1) % cities.length; h.wait = 1 + 2 * h.seed; }
        if (mode === 'swarm') { const s = swarmSlot(slot++, target, t); px = s.x; py = s.y; }
      }
      const k = mode === 'swarm' && h.pi >= h.path.length - 1 ? 0.12 : 1;
      const nx = h.x + (px - h.x) * k, ny = h.y + (py - h.y) * k;
      h.vx = (nx - h.x) / Math.max(dt, 0.001); h.vy = (ny - h.y) / Math.max(dt, 0.001);
      h.x = nx; h.y = ny;
      const here = tiles.get(tileAt(h.x, h.y));
      h.boat = !!here && !!WET[here.terrain];
      h.carry = mode === 'trip' ? 'envelope' : 'crate';
      const arrived = mode === 'swarm' && h.pi >= h.path.length - 1;
      h.shade = (h.shade || 0) + ((arrived ? 1 : 0) - (h.shade || 0)) * Math.min(1, dt * 2.5);
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

  // A small mark for the terrain of a tile. Waves move with time.
  function terrainMark(kind, x, y, f, fade, seed, t) {
    const u = TILE * f;
    if (kind === 'forest') {
      ctx.fillStyle = rgba('#2a4a26', 0.9 * fade);
      for (const [dx, dy] of [[-0.3, 0.1], [0.25, -0.1], [0, 0.35]]) {
        ctx.beginPath(); ctx.moveTo(x + dx * u, y + (dy - 0.3) * u); ctx.lineTo(x + (dx - 0.15) * u, y + dy * u); ctx.lineTo(x + (dx + 0.15) * u, y + dy * u); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'hills') {
      ctx.strokeStyle = rgba('#5a4a30', 0.9 * fade); ctx.lineWidth = Math.max(0.6, 0.08 * u);
      for (const dx of [-0.25, 0.2]) { ctx.beginPath(); ctx.arc(x + dx * u, y + 0.15 * u, 0.22 * u, Math.PI, 0); ctx.stroke(); }
    } else if (kind === 'water' || kind === 'deep') {
      const ph = calm ? 0 : Math.sin(t * 1.3 + seed * 6.28) * 0.12;
      ctx.strokeStyle = rgba('#a9cbe6', (kind === 'deep' ? 0.3 : 0.5) * fade); ctx.lineWidth = Math.max(0.6, 0.06 * u);
      for (const dy of [-0.15, 0.15]) {
        const o = (dy + ph) * u;
        ctx.beginPath(); ctx.moveTo(x - 0.35 * u, y + o); ctx.quadraticCurveTo(x - 0.1 * u, y + o - 0.12 * u, x + 0.1 * u, y + o); ctx.quadraticCurveTo(x + 0.25 * u, y + o + 0.12 * u, x + 0.35 * u, y + o); ctx.stroke();
      }
    } else if (kind === 'mountain' || kind === 'snow') {
      ctx.fillStyle = rgba(kind === 'snow' ? '#a8adb3' : '#8c8c8c', 0.95 * fade);
      ctx.beginPath(); ctx.moveTo(x - 0.45 * u, y + 0.3 * u); ctx.lineTo(x - 0.05 * u, y - 0.45 * u); ctx.lineTo(x + 0.4 * u, y + 0.3 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#f4f7fa', 0.95 * fade);
      const cap = kind === 'snow' ? 0.05 : -0.22;
      ctx.beginPath(); ctx.moveTo(x - 0.05 * u - (cap + 0.45) * 0.53 * u, y + cap * u); ctx.lineTo(x - 0.05 * u, y - 0.45 * u); ctx.lineTo(x - 0.05 * u + (cap + 0.45) * 0.6 * u, y + cap * u); ctx.closePath(); ctx.fill();
    } else if (kind === 'desert') {
      ctx.strokeStyle = rgba('#8a6a38', 0.8 * fade); ctx.lineWidth = Math.max(0.6, 0.06 * u);
      for (const dy of [-0.1, 0.2]) { ctx.beginPath(); ctx.arc(x, y + dy * u + 0.3 * u, 0.35 * u, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
    } else if (kind === 'sand') {
      ctx.fillStyle = rgba('#9a8a5a', 0.7 * fade);
      for (const [dx, dy] of [[-0.2, -0.1], [0.15, 0.05], [-0.05, 0.25]]) { ctx.beginPath(); ctx.arc(x + dx * u, y + dy * u, Math.max(0.5, 0.05 * u), 0, 6.2832); ctx.fill(); }
    } else if (kind === 'grass' || kind === 'plains') {
      ctx.strokeStyle = rgba(kind === 'grass' ? '#3c6430' : '#5f6a33', 0.8 * fade); ctx.lineWidth = Math.max(0.5, 0.05 * u);
      for (const dx of [-0.2, 0.15]) { ctx.beginPath(); ctx.moveTo(x + dx * u, y + 0.15 * u); ctx.lineTo(x + (dx - 0.05) * u, y - 0.05 * u); ctx.moveTo(x + dx * u, y + 0.15 * u); ctx.lineTo(x + (dx + 0.06) * u, y - 0.03 * u); ctx.stroke(); }
    }
  }

  // The volcano: a dark cone with a glowing crater and a column of smoke.
  // At each file write it erupts: lava bursts from the crater for 4 s.
  function drawVolcano(t) {
    if (!volcano) return;
    const c = centerOf(volcano), base = screen(c.x, c.y, 0), u = TILE * base.f;
    const burst = Math.max(0, 1 - (Date.now() - lastWrite) / 4000);
    ctx.fillStyle = 'rgba(64,52,48,0.98)';
    ctx.beginPath(); ctx.moveTo(base.x - 0.75 * u, base.y + 0.4 * u); ctx.lineTo(base.x - 0.18 * u, base.y - 0.75 * u); ctx.lineTo(base.x + 0.18 * u, base.y - 0.75 * u); ctx.lineTo(base.x + 0.75 * u, base.y + 0.4 * u); ctx.closePath(); ctx.fill();
    const cx = base.x, cy = base.y - 0.75 * u;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * (0.6 + 1.6 * burst));
    glow.addColorStop(0, 'rgba(255,120,40,' + (0.6 + 0.4 * burst) + ')');
    glow.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, u * (0.6 + 1.6 * burst), 0, 6.2832); ctx.fill();
    if (calm) return;
    // Smoke: puffs that rise, grow and fade.
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.25 + i / 5) % 1;
      ctx.fillStyle = 'rgba(150,150,150,' + (0.35 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(cx + Math.sin(k * 4 + i) * u * 0.4, cy - k * u * 2.6, u * (0.18 + 0.4 * k), 0, 6.2832); ctx.fill();
    }
    // Lava: bright drops thrown up and out, falling back down the cone.
    if (burst > 0) {
      for (let i = 0; i < 16; i++) {
        const k = (t * 0.9 + i / 16) % 1, a = (hash('lava' + i) - 0.5) * 2.2;
        const x = cx + Math.sin(a) * k * u * 1.6, y = cy - (k * 2.4 - k * k * 3.2) * u;
        ctx.fillStyle = 'rgba(255,' + Math.round(90 + 120 * (1 - k)) + ',30,' + burst + ')';
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, u * 0.09), 0, 6.2832); ctx.fill();
      }
    }
  }

  // Clouds drift over the map from west to east, with soft shadows below.
  function drawClouds(t) {
    if (!worldR) return;
    const w = TILE * Math.sqrt(3) * (worldR + 4);
    for (let i = 0; i < 5; i++) {
      const sx = ((hash('cx' + i) * 2 - 1) * w + t * (4 + 3 * hash('cv' + i)) + w * 3) % (2 * w) - w;
      const sy = (hash('cy' + i) * 2 - 1) * w * 0.8;
      const shade = screen(sx + 10, sy + 14, 0), top = screen(sx, sy, 60);
      const r = TILE * (1.6 + 1.4 * hash('cr' + i));
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.beginPath(); ctx.ellipse(shade.x, shade.y, r * shade.f * 1.4, r * shade.f * 0.6, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(240,244,248,0.16)';
      for (const [dx, dy, s] of [[-0.6, 0.1, 0.7], [0, -0.15, 1], [0.6, 0.1, 0.75]]) {
        ctx.beginPath(); ctx.ellipse(top.x + dx * r * top.f, top.y + dy * r * top.f, r * top.f * s, r * top.f * s * 0.55, 0, 0, 6.2832); ctx.fill();
      }
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

    // Tiles: terrain, a tint of the owner's color, and a terrain mark.
    const list = [...tiles.entries()].map(([k, tl]) => ({ k, tl, c: tileCenter(tl.q, tl.r) }));
    for (const { k, tl, c } of list) {
      const pts = tilePath(c, 0.97);
      const s = screen(c.x, c.y, 0);
      const city = tl.city && nodes.get(tl.city);
      const dim = city ? (inFocus(city) ? 1 : 0.5) : 0.8;
      fillPath(pts);
      ctx.fillStyle = rgba(TERRAIN[tl.terrain], 0.8 * dim * s.fog);
      ctx.fill();
      if (city) { ctx.fillStyle = rgba(city.color, 0.16 * dim * s.fog); ctx.fill(); }
      if (tl.terrain !== 'volcano') terrainMark(tl.terrain, s.x, s.y, s.f, dim * s.fog, hash(k), t);
    }

    // Rivers have their own tiles: ground, a water channel, ground. In each
    // river tile the channel runs from the edge it shares with the previous
    // river tile, through the middle, to the edge it shares with the next,
    // so the channels join into one river; it starts as a spring in its
    // first tile and runs into the sea tile at its mouth. Dark banks line
    // both sides of the water.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const river of rivers) {
      for (let j = 0; j < river.length; j++) {
        const tl = tiles.get(river[j]);
        if (!tl || WET[tl.terrain]) continue;
        const c = centerOf(river[j]), mid = k => { const o = centerOf(k); return { x: (c.x + o.x) / 2, y: (c.y + o.y) / 2 }; };
        const from = j > 0 ? mid(river[j - 1]) : c;
        const to = j < river.length - 1 ? mid(river[j + 1]) : c;
        // The channel bends to one side of the middle, so the river meanders.
        const bend = (hash('bend' + river[j]) - 0.5) * TILE * 0.7;
        const dx = to.x - from.x, dy = to.y - from.y, dl = Math.hypot(dx, dy) || 1;
        const a = screen(from.x, from.y, 0), b = screen(to.x, to.y, 0);
        const m = screen(c.x - dy / dl * bend, c.y + dx / dl * bend, 0);
        const w = TILE * 0.46 * m.f;
        const city = tl.city && nodes.get(tl.city);
        const dim = city ? (inFocus(city) ? 1 : 0.5) : 0.8;
        const stroke = (width, color) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, b.x, b.y); ctx.stroke();
        };
        stroke(w * 2, rgba('#4a3d26', 0.9 * dim * m.fog));
        stroke(w * 1.55, rgba('#8c7a50', 0.9 * dim * m.fog));
        stroke(w, rgba('#4f9fd0', 0.97 * dim * m.fog));
        if (!calm) {
          ctx.setLineDash([w * 0.6, w * 1.4]);
          ctx.lineDashOffset = -t * 6;
          stroke(Math.max(0.6, w * 0.25), rgba('#d6ecf8', 0.55 * dim * m.fog));
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
        if (j === 0) {
          const sp = screen(c.x, c.y, 0);
          ctx.fillStyle = rgba('#8c7a50', 0.9 * dim * m.fog);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, w * 1.1, 0, 6.2832); ctx.fill();
          ctx.fillStyle = rgba('#4f9fd0', 0.97 * dim * m.fog);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, w * 0.8, 0, 6.2832); ctx.fill();
        }
      }
    }

    // Borders: a thick line in the owner's color on each tile edge that
    // meets another owner or unheld land.
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
        const other = tiles.get(tkey(...toHex(c.x + mx * TILE * 2, c.y + my * TILE * 2)));
        if (other && other.city === tl.city) continue;
        const a = pts[i], b = pts[(i + 1) % 6];
        ctx.strokeStyle = rgba(city.color, 0.9 * (inFocus(city) ? 1 : 0.45) * a.fog);
        ctx.lineWidth = Math.max(1.5, 2.6 * a.f);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // Roads: a dirt band with ruts on land; a dashed ferry line over water.
    for (const road of roads) {
      for (let j = 1; j < road.length; j++) {
        const a = centerOf(road[j - 1]), b = centerOf(road[j]);
        const pa = screen(a.x, a.y, 0), pb = screen(b.x, b.y, 0);
        const wet = WET[tiles.get(road[j - 1]).terrain] || WET[tiles.get(road[j]).terrain];
        ctx.setLineDash(wet ? [3, 4] : []);
        ctx.strokeStyle = wet ? 'rgba(220,230,240,0.55)' : 'rgba(160,125,80,0.8)';
        ctx.lineWidth = wet ? 1 : Math.max(2, 4 * pa.f);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Bridges: wooden planks where a road crosses a river.
    for (const k of roadSet) {
      if (!riverSet.has(k)) continue;
      const c = centerOf(k), s = screen(c.x, c.y, 0), u = TILE * s.f;
      ctx.fillStyle = 'rgba(120,85,50,0.98)';
      ctx.fillRect(s.x - u * 0.4, s.y - u * 0.14, u * 0.8, u * 0.28);
      ctx.strokeStyle = 'rgba(70,50,30,0.95)'; ctx.lineWidth = 1;
      ctx.strokeRect(s.x - u * 0.4, s.y - u * 0.14, u * 0.8, u * 0.28);
      for (const dx of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(s.x + dx * u, s.y - u * 0.14); ctx.lineTo(s.x + dx * u, s.y + u * 0.14); ctx.stroke(); }
    }

    drawVolcano(t);

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

    // Each horse's plan: a faint dotted line along the tiles still ahead.
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(242,230,200,0.4)';
    for (const h of horses.values()) {
      if (h.pi >= h.path.length - 1) continue;
      const pts = [screen(h.x, h.y, 0), ...h.path.slice(h.pi + 1).map(k => { const c = centerOf(k); return screen(c.x, c.y, 0); })];
      ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horses, far ones first, with their load; in a swarm they wear shades.
    // On water a horse sits in a small boat.
    const herd = [...horses.values()].map(h => ({ h, d: screen(h.x, h.y, h.z).depth })).sort((p, q) => p.d - q.d);
    for (const { h } of herd) {
      paintHorse(h, t, 1, Object.assign({ shades: h.shade || 0, carry: h.carry }, h.boat ? { run: 0 } : {}));
      if (h.boat) {
        const s = screen(h.x, h.y, h.z), R = 6 * Math.max(1, s.f), rock = calm ? 0 : Math.sin(t * 3 + h.seed * 9) * 0.08;
        ctx.save(); ctx.translate(s.x, s.y + R * 0.55); ctx.rotate(rock);
        ctx.fillStyle = 'rgba(122,82,48,0.98)';
        ctx.beginPath(); ctx.moveTo(-R * 1.6, -R * 0.2); ctx.lineTo(R * 1.9, -R * 0.2); ctx.lineTo(R * 1.4, R * 0.5); ctx.lineTo(-R * 1.2, R * 0.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(169,203,230,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-R * 1.9, R * 0.55); ctx.quadraticCurveTo(0, R * 0.8, R * 2.1, R * 0.55); ctx.stroke();
        ctx.restore();
      }
    }

    drawClouds(t);
    drawLabels(order, near, fc, inFocus, now, n => (n.kind === 'hub' ? 26 : 12) * n.sf);
  }

`,
}
