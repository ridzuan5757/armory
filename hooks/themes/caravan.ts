// Theme 4, caravan: a world first, then the colonies on it. A diamond-square
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
  legend: 'the Earth, with fractal terrain · one territory per colony · house size = data · horses plan routes over the terrain, take boats, bring envelopes to the files tools use and swarm there in shades · the volcano erupts at each write · 1 hour = 1 year: each season brings floods, wildfires, storms, blizzards or earthquakes that slow the horses · clouds follow the wind belts · drag, two fingers or arrow keys to move the map · pinch or + and - to zoom',
  script: HORSE_KIT + `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false, MAP_VIEW = { pitch: 0.6 };
  const CITIES = ['hub:skills', 'hub:files', 'hub:git', 'hub:jobs', 'hub:memory', 'hub:sessions'];
  function anchor(id) {
    const c = owner.get(id);
    return c ? tileCenter(c.q, c.r) : { x: 0, y: 0, z: 0 };
  }

  // The hex map, in axial coordinates (q, r).
  const TILE = 13, GAP = 2, COLS = 72, ROWS = 36;
  // The map's middle is the world origin.
  const OX = TILE * Math.sqrt(3) * (COLS - 0.5) / 2, OY = TILE * 1.5 * (ROWS - 1) / 2;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const tileCenter = (q, r) => ({ x: TILE * Math.sqrt(3) * (q + r / 2) - OX, y: TILE * 1.5 * r - OY, z: 0 });
  // The map is a cylinder, as the Earth is round: east of the last column
  // is the first one again. tkey gives each tile one key (its column taken
  // modulo COLS), so every neighbor lookup wraps; tdist takes the shorter
  // way around. WW is the width of the map; nearX gives the copy of an x
  // nearest the middle of the view, so the map shows no edge.
  const tkey = (q, r) => {
    const off = (r - (r & 1)) / 2, col = (((q + off) % COLS) + COLS) % COLS;
    return (col - off) + ',' + r;
  };
  const tdist = (a, b) => {
    let best = Infinity;
    for (const sh of [-COLS, 0, COLS]) {
      const bq = b[0] + sh;
      best = Math.min(best, (Math.abs(a[0] - bq) + Math.abs(a[0] + a[1] - bq - b[1]) + Math.abs(a[1] - b[1])) / 2);
    }
    return best;
  };
  const WW = TILE * Math.sqrt(3) * COLS;
  const wrapDelta = dx => dx - WW * Math.round(dx / WW);
  const nearX = x => { const cx = cam.x + view.px; return cx + wrapDelta(x - cx); };
  const unkey = k => k.split(',').map(Number);
  const canon = cell => unkey(tkey(...cell));
  function ringAround(q, r, k) {
    const out = [];
    let cq = q + DIRS[4][0] * k, cr = r + DIRS[4][1] * k;
    for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([cq, cr]); cq += DIRS[i][0]; cr += DIRS[i][1]; }
    return out;
  }
  function toHex(x, y) {
    x += OX; y += OY;
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
  // The Earth: a land mask of 72 x 36 tiles, 5 degrees of longitude each,
  // from 80 N to 60 S, from the Natural Earth 1:110m land (public domain).
  // Odd rows move half a tile east, as on a hex map. '#' is land.
  const EARTH =
    '.............#..#..#############.......##...............................' +
    '...........#............#######...............#......####...............' +
    '....##....#..###.#.###...######..........#.......###################....' +
    '#.#################..##..###....#.....####.############################.' +
    '...###############.##.#...#..........##################################.' +
    '...##...#########...###...........#...#.########################...#....' +
    '..........##############..........##...########################....#....' +
    '..........##############...........#############################........' +
    '...........############.............#######.#####################.......' +
    '...........##########.............##...##...#.################..........' +
    '...........##########.............##....######.#############.#..........' +
    '...........#########..............####..#..################...##........' +
    '.............#######..............#####.#..#################............' +
    '.............###.................#########.##.##############............' +
    '...............#.................##########.####..#########.............' +
    '....#.........##.#..............###########.###...###.####..............' +
    '.................#...............###########.#.....#....##..............' +
    '..................#..#..........############............#...#...........' +
    '....................####.........#############.....#........#...........' +
    '....................#####............########.............#.............' +
    '....................######............#######...........#.##............' +
    '...................#########..........#####.............#.##..##........' +
    '....................#########..........#####.............##.....#.......' +
    '....................########..........######............................' +
    '.....................#######..........######.#...............##.#.......' +
    '.....................#######..........#####.#...............#####.......' +
    '......................#####............####..#.............#######......' +
    '.....................#####.............###................########......' +
    '......................####..............##.................########.....' +
    '.....................####..............#.......................###......' +
    '.....................###...............................................#' +
    '.....................##.................................................' +
    '.....................##.................................................' +
    '....................##..................................................' +
    '.....................##.................................................' +
    '........................................................................';
  const SEED = 2026;
  const HEIGHT = diamondSquare(7, 0.55, SEED), MOIST = diamondSquare(7, 0.6, SEED + 7);
  const axial = (col, row) => [col - (row - (row & 1)) / 2, row];

  const TERRAIN = {
    deep: '#1f3f5c', water: '#2f5c7a', sand: '#c2b280', desert: '#b8955a', plains: '#7d8a45', grass: '#4f7a3f',
    forest: '#3d6136', jungle: '#2c5a30', tundra: '#7f8c7a', hills: '#7a6a48', mountain: '#6c6c6c', snow: '#d8dde3',
    ice: '#e4ebf0', volcano: '#4a3a35',
  };
  const WET = { deep: 1, water: 1 };
  // Land a colony may hold: not water, snow, ice or the volcano.
  const HOLDABLE = { sand: 1, desert: 1, plains: 1, grass: 1, forest: 1, jungle: 1, tundra: 1, hills: 1, mountain: 1 };

  // The world: land from the mask, sea elsewhere. Height comes from the
  // fractal map and rises with the distance from the coast; the highest
  // tiles are hills, mountains and snow peaks. The climate follows the
  // latitude: ice and tundra near the poles, deserts near the tropics, jungle
  // at the equator. Moisture from the fractal map, plus a wet or dry belt
  // for the latitude, sets the biome of the lowland.
  let tiles = new Map(), volcano = '', rivers = [], riverSet = new Set();
  function buildWorld() {
    tiles = new Map();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const [q, r] = axial(col, row);
        tiles.set(tkey(q, r), { q, r, col, row, land: EARTH[row * COLS + col] === '#', h: 0, m: 0, terrain: '', city: '' });
      }
    }
    // Steps from the coast: inland on land, offshore at sea.
    const coast = new Map(), todo = [];
    const around = tl => DIRS.map(([dq, dr]) => tkey(tl.q + dq, tl.r + dr)).filter(k => tiles.has(k));
    for (const [k, tl] of tiles) if (around(tl).some(n => tiles.get(n).land !== tl.land)) { coast.set(k, 1); todo.push(k); }
    for (let i = 0; i < todo.length; i++) {
      const tl = tiles.get(todo[i]);
      for (const n of around(tl)) if (tiles.get(n).land === tl.land && !coast.has(n)) { coast.set(n, coast.get(todo[i]) + 1); todo.push(n); }
    }
    const land = [];
    for (const [k, tl] of tiles) {
      const u = tl.col / (COLS - 1), v = tl.row / (ROWS - 1), d = coast.get(k) || 9;
      tl.lat = 80 - (tl.row + 0.5) * 140 / ROWS;
      tl.coast = d;
      if (!tl.land) { tl.h = -0.1 * d; tl.terrain = d <= 2 ? 'water' : 'deep'; continue; }
      const a = Math.abs(tl.lat);
      const belt = a < 10 ? 0.35 : a < 18 ? 0.1 : a < 35 ? -0.35 : a < 55 ? 0.1 : 0;
      tl.e = 0.75 * sample(HEIGHT, u, v) + 0.25 * Math.min(1, (d - 1) / 3);
      tl.m = sample(MOIST, u, v) + belt - 0.03 * Math.min(d, 6);
      land.push(tl);
    }
    // Height by rank among the land tiles: 0 is the lowest, 1 the highest.
    land.sort((p, q) => p.e - q.e).forEach((tl, i) => { tl.h = i / (land.length - 1); });
    const low = land.filter(tl => Math.abs(tl.lat) < 58 && tl.h <= 0.8);
    const ms = low.map(tl => tl.m).sort((a, b) => a - b);
    const mq = f => ms[Math.min(ms.length - 1, Math.floor(ms.length * f))] ?? 0.5;
    const dry = mq(0.15), mid = mq(0.4), wet = mq(0.68);
    for (const tl of land) {
      const a = Math.abs(tl.lat), k = tkey(tl.q, tl.r);
      if (a >= 68) tl.terrain = 'ice';
      else if (tl.h > 0.98) tl.terrain = 'snow';
      else if (tl.h > 0.92) tl.terrain = a >= 50 ? 'snow' : 'mountain';
      else if (tl.h > 0.8) tl.terrain = 'hills';
      else if (a >= 58) tl.terrain = tl.m > wet ? 'forest' : 'tundra';
      else if (coast.get(k) === 1 && tl.h < 0.15 && tl.m < wet) tl.terrain = 'sand';
      else if (tl.m < dry) tl.terrain = 'desert';
      else if (tl.m < mid) tl.terrain = 'plains';
      else if (tl.m < wet) tl.terrain = 'grass';
      else tl.terrain = a < 15 ? 'jungle' : 'forest';
    }
    // The volcano: the highest tile out of the cold.
    let vh = -1;
    for (const tl of land) if (Math.abs(tl.lat) < 55 && tl.h > vh) { vh = tl.h; volcano = tkey(tl.q, tl.r); }
    tiles.get(volcano).terrain = 'volcano';
    // Rivers: from up to seven high tiles at least six apart, downhill to the
    // sea. In a hollow the river takes the lowest way on, three times at most.
    rivers = [];
    riverSet = new Set();
    const highs = land.filter(tl => tl.h > 0.6 && tl.terrain !== 'ice' && tl.terrain !== 'volcano').sort((p, q) => q.h - p.h).map(tl => tkey(tl.q, tl.r));
    for (const sk of highs) {
      if (rivers.length >= 7) break;
      if ([...riverSet, volcano].some(k => tdist(unkey(k), unkey(sk)) < 6)) continue;
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
      if (path.length >= 4 && WET[tiles.get(path[path.length - 1]).terrain]) { rivers.push(path); path.forEach(k => riverSet.add(k)); }
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
  const COST = { deep: 2, water: 1.5, sand: 1, desert: 1.5, plains: 1, grass: 1, forest: 2, jungle: 2.5, tundra: 1.5, hills: 3, mountain: 6, snow: 8, ice: 8, volcano: 10 };
  let roads = [], roadSet = new Set();
  function baseCost(k) {
    const tl = tiles.get(k);
    if (!tl) return Infinity;
    if (WET[tl.terrain]) return COST[tl.terrain];
    if (roadSet.has(k)) return 0.5;
    return COST[tl.terrain] + (riverSet.has(k) ? 1.5 : 0);
  }
  // A disaster on a tile multiplies its cost (see hazard). Cities and
  // territories use the base cost, so a disaster moves no house.
  const costOf = k => baseCost(k) * (hazard.get(k) || 1);
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
        const nd = d + baseCost(nk);
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

  // Colonies on the world, as in a strategy game: houses keep their tiles,
  // a colony grows at its border and keeps the land of removed items.
  //
  // The first layout (and a layout after a city comes or goes) places all.
  // City sites: the best land for a city (good biome, by a river, on the
  // coast, with room around it), far apart; the largest colony gets the best
  // site. Then the colonies take turns, one item each: an item takes the free
  // tile near its parent's tile that is cheapest to reach from its city, and
  // no tile within GAP of another colony; so a folder and its files form one
  // district, and borders follow the land.
  //
  // After that, a removed item leaves its tile empty: the land stays with the
  // colony, and no house moves. A new item first takes an empty tile of its
  // colony (near its parent). Only when there is none does the colony take a
  // new tile next to its land, near the colony's newest tile while that is
  // recent (so new tiles join each other), else near the parent.
  let owner = new Map(), held = new Map(), cityCost = new Map(), cityKey = '';
  let sizes = new Map(), layoutGen = -1, layoutSize = -1, mapGen = 0;
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
    if (!tiles.size) buildWorld();
    mapGen++;
    const bySize = cities.slice().sort((a, b) => count(b) - count(a));
    const cols = bySize.map(city => {
      const order = [];
      const walk = id => {
        for (const c of (kids.get(id) || []).slice().sort((p, q) => count(q.id) - count(p.id) || p.id.localeCompare(q.id))) { order.push([c.id, id]); walk(c.id); }
      };
      walk(city);
      return { city, order, i: 0 };
    });
    const moved = new Set();
    const full = cities.join(',') !== cityKey;
    if (full) { cityKey = cities.join(','); placeAll(bySize, cols, moved); }
    else noteEvents(grow(cols, moved));
    for (const [k, tl] of tiles) tl.city = held.get(k) || '';
    sizes = bodySizes();
    for (const id of moved) { const n = nodes.get(id); if (n) n.settle = 0; }
  }

  // No tile within GAP of another colony's land.
  function nearOther(cell, city) {
    for (let d = 1; d <= GAP; d++) for (const c of ringAround(cell[0], cell[1], d)) {
      const o = held.get(tkey(...c));
      if (o && o !== city) return true;
    }
    return false;
  }

  function placeAll(bySize, cols, moved) {
    // City sites.
    const score = new Map();
    for (const [k, tl] of tiles) {
      if (!HOLDABLE[tl.terrain] || tl.terrain === 'mountain' || riverSet.has(k)) continue;
      const [q, r] = unkey(k);
      let s = { grass: 3, plains: 3, forest: 2, sand: 2, jungle: 1.5, desert: 1, hills: 1.5, tundra: 0.5 }[tl.terrain] || 0;
      if ([[0, 0], ...DIRS].some(([dq, dr]) => riverSet.has(tkey(q + dq, r + dr)))) s += 3;
      if (DIRS.some(([dq, dr]) => { const n = tiles.get(tkey(q + dq, r + dr)); return n && WET[n.terrain]; })) s += 2;
      let room = 0;
      for (let d = 1; d <= 3; d++) for (const c of ringAround(q, r, d)) { const n = tiles.get(tkey(...c)); if (n && HOLDABLE[n.terrain]) room++; }
      score.set(k, s + 0.15 * room + 0.01 * hash(k));
    }
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    // GIT works on the same files as FILES, so its city takes the site
    // nearest the FILES city (with room for territories between the cities).
    const near = bySize.includes('hub:git') && bySize.includes('hub:files');
    const rest = near ? bySize.filter(c => c !== 'hub:git') : bySize;
    let sites = [], gap = 14;
    for (; gap >= 2 && sites.length < rest.length; gap--) {
      sites = [];
      for (const k of ranked) {
        if (sites.length >= rest.length) break;
        if (sites.every(s => tdist(unkey(s), unkey(k)) >= gap)) sites.push(k);
      }
    }
    owner = new Map();
    held = new Map();
    rest.forEach((city, i) => {
      const k = sites[i] || ranked[i];
      const [q, r] = unkey(k);
      owner.set(city, { q, r, city });
      held.set(k, city);
    });
    if (near) {
      const f = owner.get('hub:files'), room = Math.max(6, Math.round(gap * 0.6));
      let best, bd = Infinity;
      for (const k of ranked.slice(0, 600)) {
        const c = unkey(k);
        if (sites.some(s => tdist(unkey(s), c) < room)) continue;
        const d = tdist(c, [f.q, f.r]) - 0.05 * (score.get(k) || 0);
        if (d < bd) { bd = d; best = k; }
      }
      const k = best || ranked.find(x => !held.has(x));
      const [q, r] = unkey(k);
      owner.set('hub:git', { q, r, city: 'hub:git' });
      held.set(k, 'hub:git');
    }
    cityCost = new Map(bySize.map(city => [city, costsFrom(tkey(owner.get(city).q, owner.get(city).r))]));

    // Territories, by turns.
    for (let left = true; left;) {
      left = false;
      for (const col of cols) {
        if (col.i >= col.order.length) continue;
        left = true;
        const [id, parent] = col.order[col.i++];
        const pc = owner.get(parent) || owner.get(col.city);
        const toCity = cityCost.get(col.city);
        let best;
        // First within the rules; then without the gap; then any free tile.
        for (const strict of [2, 1, 0]) {
          let bs = Infinity;
          for (let k = 1; k <= (strict ? 10 : 40); k++) {
            for (const cell of ringAround(pc.q, pc.r, k)) {
              const ck = tkey(...cell), tl = tiles.get(ck);
              if (!tl || held.has(ck)) continue;
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
        best = canon(best);
        held.set(tkey(...best), col.city);
        owner.set(id, { q: best[0], r: best[1], city: col.city });
      }
    }
    for (const id of owner.keys()) moved.add(id);

    // Roads: around the cities in order of angle, each the cheapest route on
    // land (water tiles on a road are a ferry).
    roads = []; roadSet = new Set(); plans.clear();
    const ring = bySize.slice().sort((a, b) => {
      const pa = tileCenter(owner.get(a).q, owner.get(a).r), pb = tileCenter(owner.get(b).q, owner.get(b).r);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    });
    for (let i = 0; i < ring.length; i++) {
      const a = owner.get(ring[i]), b = owner.get(ring[(i + 1) % ring.length]);
      roads.push(findPath(tkey(a.q, a.r), tkey(b.q, b.r)));
    }
    for (const path of roads) for (const k of path) if (!WET[tiles.get(k).terrain]) roadSet.add(k);
    plans.clear();
  }

  // Returns the events: 'gain' (a new tile), 'fill' (a house on an empty
  // tile) and 'lose' (a house gone, the tile kept).
  const lastGain = new Map();
  function grow(cols, moved) {
    const want = new Map(), events = [];
    for (const col of cols) for (const [id, parent] of col.order) want.set(id, { parent, city: col.city });
    for (const [id, o] of [...owner]) {
      if (o.city === id) continue;
      const w = want.get(id);
      if (w && w.city === o.city) continue;
      owner.delete(id);
      events.push({ k: tkey(o.q, o.r), kind: 'lose', city: o.city });
    }
    const used = new Set([...owner.values()].map(o => tkey(o.q, o.r)));
    const now = performance.now();
    for (const [id, w] of want) {
      if (owner.has(id)) continue;
      const pc = owner.get(w.parent) || owner.get(w.city);
      // An empty tile of the colony, nearest the parent.
      let cell, kind = 'fill', bd = Infinity;
      for (const [k, c] of held) {
        if (c !== w.city || used.has(k)) continue;
        const d = (pc ? tdist(unkey(k), [pc.q, pc.r]) : 0) + 0.001 * hash(id + k);
        if (d < bd) { bd = d; cell = unkey(k); }
      }
      if (!cell) {
        const g = lastGain.get(w.city);
        const near = g && now - g.at < CHANGE_MS ? { q: unkey(g.k)[0], r: unkey(g.k)[1] } : pc;
        cell = frontier(id, w.city, near);
        kind = 'gain';
      }
      if (!cell) continue;
      const k = tkey(...cell);
      held.set(k, w.city);
      used.add(k);
      owner.set(id, { q: cell[0], r: cell[1], city: w.city });
      moved.add(id);
      events.push({ k, kind, city: w.city });
      if (kind === 'gain') lastGain.set(w.city, { k, at: now });
    }
    return events;
  }

  // The best free tile next to the colony's land: near a given tile, cheap
  // to reach from the city. First within the rules, then without the gap, then
  // any land or water tile.
  function frontier(id, city, pc) {
    const toCity = cityCost.get(city) || new Map();
    for (const strict of [2, 1, 0]) {
      let best, bs = Infinity;
      for (const [k, c] of held) {
        if (c !== city) continue;
        const [q, r] = unkey(k);
        for (const [dq, dr] of DIRS) {
          const cell = [q + dq, r + dr], ck = tkey(...cell), tl = tiles.get(ck);
          if (!tl || held.has(ck)) continue;
          if (strict && (!HOLDABLE[tl.terrain] || riverSet.has(ck))) continue;
          if (strict === 2 && nearOther(cell, city)) continue;
          const s = 1.2 * (pc ? tdist(cell, [pc.q, pc.r]) : 0) + 0.25 * (toCity.get(ck) ?? 99) + 0.001 * hash(id + ck);
          if (s < bs) { bs = s; best = cell; }
        }
      }
      if (best) return canon(best);
    }
    return undefined;
  }

  // The camera shows the whole Earth when nothing has the focus.
  function fitBounds() {
    return { x: 0, y: 0, z: 0, r: OX, w: 2 * OX + 2 * TILE, h: (2 * OY + 2 * TILE) * Math.max(0.4, Math.cos(view.pitch)), wrap: WW };
  }

  // Changes, as a strategy game shows them: each tile that a colony gains,
  // fills or empties flashes for CHANGE_MS, and the city shows the count of
  // houses (+2, -1). A layout that places all (the first one) shows none.
  const CHANGE_MS = 5000;
  const changes = new Map(), tally = new Map();
  function noteEvents(events) {
    const at = performance.now();
    for (const e of events) {
      changes.set(e.k, { kind: e.kind, city: e.city, at });
      const v = tally.get(e.city);
      const t = v && at - v.at < CHANGE_MS ? v : { gain: 0, lose: 0 };
      t[e.kind === 'lose' ? 'lose' : 'gain']++; t.at = at;
      tally.set(e.city, t);
    }
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

  // Time: one year of the world is one hour of real time, so a season is 15
  // minutes. The date comes from the clock, so every session and every
  // reload agree. The south has the opposite season. clockShift moves the
  // clock, for a preview.
  const YEAR_MS = 3600000, SEASON_MS = YEAR_MS / 4, EPOCH = Date.UTC(2026, 0, 1);
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const SEASON_COLOR = ['#7fd36a', '#ffd27a', '#e08a3a', '#cfe3f2'];
  let clockShift = 0;
  const worldNow = () => Date.now() + clockShift;
  const seasonAt = (lat, north) => (lat < 0 ? (north + 2) % 4 : north);
  function calendar() {
    const t = worldNow() - EPOCH, n = Math.floor(t / SEASON_MS);
    return { year: Math.floor(t / YEAR_MS) + 1, n, season: ((n % 4) + 4) % 4,
      day: Math.floor((t - n * SEASON_MS) / SEASON_MS * 90) + 1, frac: (t / YEAR_MS) % 1 };
  }

  // Natural disasters. Each season starts five to eight, at any time in the
  // season, from a seed of the season's number; six in ten come within four
  // tiles of a road. About two are active at a time. A kind needs its
  // local season and its land: floods on rivers in spring, wildfires in
  // forest, jungle and grassland in summer, tropical storms at sea near the
  // coast in autumn, blizzards at high latitudes in winter; earthquakes in
  // hills and mountains at any time, less often. Each lasts three to six real
  // minutes. Inside one, a tile costs mult times more to cross.
  const HAZARD = {
    flood: { name: 'Flood', season: 0, mult: 3, color: '#4f9fd0', r: [1, 2], land: true,
      place: tl => tl.land && (riverSet.has(tkey(tl.q, tl.r)) || DIRS.some(([dq, dr]) => riverSet.has(tkey(tl.q + dq, tl.r + dr)))) },
    wildfire: { name: 'Wildfire', season: 1, mult: 5, color: '#ff6a2a', r: [1, 2], land: true,
      place: tl => tl.terrain === 'forest' || tl.terrain === 'jungle' || tl.terrain === 'grass' },
    storm: { name: 'Tropical storm', season: 2, mult: 3, color: '#c3cdd8', r: [2, 3], land: false,
      place: tl => WET[tl.terrain] && tl.coast <= 3 && Math.abs(tl.lat) > 8 && Math.abs(tl.lat) < 35 },
    blizzard: { name: 'Blizzard', season: 3, mult: 4, color: '#eef4f8', r: [1, 2], land: true,
      place: tl => tl.land && Math.abs(tl.lat) > 38 && tl.terrain !== 'ice' },
    quake: { name: 'Earthquake', season: -1, mult: 2.5, color: '#c9a06a', r: [1, 1], land: true,
      place: tl => tl.terrain === 'hills' || tl.terrain === 'mountain' || tl.terrain === 'snow' },
  };
  const seasonDisasters = new Map();
  function disastersOf(n) {
    if (seasonDisasters.has(n)) return seasonDisasters.get(n);
    const rnd = rng(n * 7919 + 13), north = ((n % 4) + 4) % 4, kinds = Object.keys(HAZARD), out = [];
    const count = 5 + Math.floor(rnd() * 4);
    for (let tries = 0; out.length < count && tries < 60; tries++) {
      const kind = kinds[Math.floor(rnd() * kinds.length)], hz = HAZARD[kind];
      if (kind === 'quake' && rnd() > 0.4) continue;
      const spots = [...tiles.values()].filter(tl => hz.place(tl) && (hz.season < 0 || seasonAt(tl.lat, north) === hz.season)
        && out.every(d => tdist([d.q, d.r], [tl.q, tl.r]) > 5));
      if (!spots.length) continue;
      // Most disasters come near a road, where the caravans travel.
      const near = spots.filter(tl => [...roadSet].some(k => tdist(unkey(k), [tl.q, tl.r]) <= 4));
      const pool = near.length && rnd() < 0.6 ? near : spots;
      const at = pool[Math.floor(rnd() * pool.length)];
      const start = EPOCH + n * SEASON_MS + rnd() * SEASON_MS;
      out.push({ id: n + ':' + out.length, kind, q: at.q, r: at.r, radius: hz.r[0] + Math.floor(rnd() * (hz.r[1] - hz.r[0] + 1)),
        start, end: start + 180000 + rnd() * 180000 });
    }
    seasonDisasters.set(n, out);
    return out;
  }
  // The disasters now (this season's and the last one's), and the cost
  // multiplier of each tile they cover. When the set changes, the plans go
  // and every horse plans its route again.
  let hazard = new Map(), hazardKey = '', hazardGen = 0, active = [];
  function updateHazards() {
    if (!tiles.size) return;
    const now = worldNow(), { n } = calendar();
    active = [...disastersOf(n - 1), ...disastersOf(n)].filter(d => now >= d.start && now < d.end);
    const key = active.map(d => d.id).join(',');
    if (key === hazardKey) return;
    hazardKey = key; hazardGen++;
    hazard = new Map();
    for (const d of active) {
      const hz = HAZARD[d.kind];
      d.tiles = [];
      for (let k = 0; k <= d.radius; k++) {
        for (const c of k ? ringAround(d.q, d.r, k) : [[d.q, d.r]]) {
          const ck = tkey(...c), tl = tiles.get(ck);
          if (!tl || (hz.land && WET[tl.terrain])) continue;
          d.tiles.push(ck);
          hazard.set(ck, Math.max(hazard.get(ck) || 1, hz.mult));
        }
      }
    }
    plans.clear();
  }

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
    updateHazards();
    const now = performance.now();
    const dt = lastSim ? Math.min(0.1, (now - lastSim) / 1000) : 0;
    lastSim = now;
    alpha *= 0.988;
    rest = !calm && view.auto > 0 ? Math.min(1, rest + 0.01) : Math.max(0, rest - 0.05);
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
      if (h.goal !== goal || h.gen !== layoutGen || h.hz !== hazardGen) {
        h.goal = goal; h.gen = layoutGen; h.hz = hazardGen;
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
        px = a.x + wrapDelta(b.x - a.x) * u; py = a.y + (b.y - a.y) * u;
      } else {
        const end = centerOf(h.path[h.path.length - 1] || goal);
        px = end.x; py = end.y;
        if (mode === 'travel') { h.city = (h.city + 1) % cities.length; h.wait = 1 + 2 * h.seed; }
        if (mode === 'swarm') { const s = swarmSlot(slot++, target, t); px = s.x; py = s.y; }
      }
      const k = mode === 'swarm' && h.pi >= h.path.length - 1 ? 0.12 : 1;
      const mx = wrapDelta(px - h.x) * k, ny = h.y + (py - h.y) * k;
      h.vx = mx / Math.max(dt, 0.001); h.vy = (ny - h.y) / Math.max(dt, 0.001);
      h.x = wrapDelta(h.x + mx); h.y = ny;
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
    const pts = [], cx = nearX(c.x);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      pts.push(screenRaw(cx + Math.cos(a) * TILE * scale, c.y + Math.sin(a) * TILE * scale, 0));
    }
    return pts;
  }
  const fillPath = pts => { pen.beginPath(); pts.forEach((p, i) => (i ? pen.lineTo(p.x, p.y) : pen.moveTo(p.x, p.y))); pen.closePath(); };

  let pen = ctx;

  // A small mark for the terrain of a tile. Waves move with time.
  function terrainMark(kind, x, y, f, fade, seed, t) {
    const u = TILE * f;
    if (kind === 'forest' || kind === 'jungle') {
      pen.fillStyle = rgba(kind === 'jungle' ? '#1d4422' : '#2a4a26', 0.9 * fade);
      for (const [dx, dy] of [[-0.3, 0.1], [0.25, -0.1], [0, 0.35]]) {
        pen.beginPath(); pen.moveTo(x + dx * u, y + (dy - 0.3) * u); pen.lineTo(x + (dx - 0.15) * u, y + dy * u); pen.lineTo(x + (dx + 0.15) * u, y + dy * u); pen.closePath(); pen.fill();
      }
    } else if (kind === 'hills') {
      pen.strokeStyle = rgba('#5a4a30', 0.9 * fade); pen.lineWidth = Math.max(0.6, 0.08 * u);
      for (const dx of [-0.25, 0.2]) { pen.beginPath(); pen.arc(x + dx * u, y + 0.15 * u, 0.22 * u, Math.PI, 0); pen.stroke(); }
    } else if (kind === 'water' || kind === 'deep') {
      const ph = calm ? 0 : Math.sin(t * 1.3 + seed * 6.28) * 0.12;
      pen.strokeStyle = rgba('#a9cbe6', (kind === 'deep' ? 0.3 : 0.5) * fade); pen.lineWidth = Math.max(0.6, 0.06 * u);
      for (const dy of [-0.15, 0.15]) {
        const o = (dy + ph) * u;
        pen.beginPath(); pen.moveTo(x - 0.35 * u, y + o); pen.quadraticCurveTo(x - 0.1 * u, y + o - 0.12 * u, x + 0.1 * u, y + o); pen.quadraticCurveTo(x + 0.25 * u, y + o + 0.12 * u, x + 0.35 * u, y + o); pen.stroke();
      }
    } else if (kind === 'mountain' || kind === 'snow') {
      pen.fillStyle = rgba(kind === 'snow' ? '#a8adb3' : '#8c8c8c', 0.95 * fade);
      pen.beginPath(); pen.moveTo(x - 0.45 * u, y + 0.3 * u); pen.lineTo(x - 0.05 * u, y - 0.45 * u); pen.lineTo(x + 0.4 * u, y + 0.3 * u); pen.closePath(); pen.fill();
      pen.fillStyle = rgba('#f4f7fa', 0.95 * fade);
      const cap = kind === 'snow' ? 0.05 : -0.22;
      pen.beginPath(); pen.moveTo(x - 0.05 * u - (cap + 0.45) * 0.53 * u, y + cap * u); pen.lineTo(x - 0.05 * u, y - 0.45 * u); pen.lineTo(x - 0.05 * u + (cap + 0.45) * 0.6 * u, y + cap * u); pen.closePath(); pen.fill();
    } else if (kind === 'desert') {
      pen.strokeStyle = rgba('#8a6a38', 0.8 * fade); pen.lineWidth = Math.max(0.6, 0.06 * u);
      for (const dy of [-0.1, 0.2]) { pen.beginPath(); pen.arc(x, y + dy * u + 0.3 * u, 0.35 * u, Math.PI * 1.2, Math.PI * 1.8); pen.stroke(); }
    } else if (kind === 'tundra') {
      pen.fillStyle = rgba('#c9d2c6', 0.7 * fade);
      for (const [dx, dy] of [[-0.25, 0], [0.2, -0.15], [0.05, 0.25]]) { pen.fillRect(x + dx * u, y + dy * u, Math.max(1, 0.12 * u), Math.max(0.6, 0.05 * u)); }
    } else if (kind === 'sand') {
      pen.fillStyle = rgba('#9a8a5a', 0.7 * fade);
      for (const [dx, dy] of [[-0.2, -0.1], [0.15, 0.05], [-0.05, 0.25]]) { pen.beginPath(); pen.arc(x + dx * u, y + dy * u, Math.max(0.5, 0.05 * u), 0, 6.2832); pen.fill(); }
    } else if (kind === 'grass' || kind === 'plains') {
      pen.strokeStyle = rgba(kind === 'grass' ? '#3c6430' : '#5f6a33', 0.8 * fade); pen.lineWidth = Math.max(0.5, 0.05 * u);
      for (const dx of [-0.2, 0.15]) { pen.beginPath(); pen.moveTo(x + dx * u, y + 0.15 * u); pen.lineTo(x + (dx - 0.05) * u, y - 0.05 * u); pen.moveTo(x + dx * u, y + 0.15 * u); pen.lineTo(x + (dx + 0.06) * u, y - 0.03 * u); pen.stroke(); }
    }
  }

  // The volcano: a dark cone with a glowing crater and a column of smoke.
  // At each file write it erupts: lava bursts from the crater for 4 s.
  function drawVolcano(t) {
    if (!volcano) return;
    const c = centerOf(volcano), base = screen(c.x, c.y, 0), u = TILE * base.f;
    const burst = Math.max(0, 1 - (Date.now() - lastWrite) / 4000);
    pen.fillStyle = 'rgba(64,52,48,0.98)';
    pen.beginPath(); pen.moveTo(base.x - 0.75 * u, base.y + 0.4 * u); pen.lineTo(base.x - 0.18 * u, base.y - 0.75 * u); pen.lineTo(base.x + 0.18 * u, base.y - 0.75 * u); pen.lineTo(base.x + 0.75 * u, base.y + 0.4 * u); pen.closePath(); pen.fill();
    const cx = base.x, cy = base.y - 0.75 * u;
    const glow = pen.createRadialGradient(cx, cy, 0, cx, cy, u * (0.6 + 1.6 * burst));
    glow.addColorStop(0, 'rgba(255,120,40,' + (0.6 + 0.4 * burst) + ')');
    glow.addColorStop(1, 'rgba(255,60,20,0)');
    pen.fillStyle = glow;
    pen.beginPath(); pen.arc(cx, cy, u * (0.6 + 1.6 * burst), 0, 6.2832); pen.fill();
    if (calm) return;
    // Smoke: puffs that rise, grow and fade.
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.25 + i / 5) % 1;
      pen.fillStyle = 'rgba(150,150,150,' + (0.35 * (1 - k)) + ')';
      pen.beginPath(); pen.arc(cx + Math.sin(k * 4 + i) * u * 0.4, cy - k * u * 2.6, u * (0.18 + 0.4 * k), 0, 6.2832); pen.fill();
    }
    // Lava: bright drops thrown up and out, falling back down the cone.
    if (burst > 0) {
      for (let i = 0; i < 16; i++) {
        const k = (t * 0.9 + i / 16) % 1, a = (hash('lava' + i) - 0.5) * 2.2;
        const x = cx + Math.sin(a) * k * u * 1.6, y = cy - (k * 2.4 - k * k * 3.2) * u;
        pen.fillStyle = 'rgba(255,' + Math.round(90 + 120 * (1 - k)) + ',30,' + burst + ')';
        pen.beginPath(); pen.arc(x, y, Math.max(0.8, u * 0.09), 0, 6.2832); pen.fill();
      }
    }
  }

  // Wind follows the Earth's belts: trade winds blow west between the
  // equator and 30 degrees, the westerlies blow east from 30 to 60 degrees,
  // and the polar easterlies blow west above 60. The belts move up to 8
  // degrees north in the northern summer and south in its winter.
  const beltShift = () => 8 * Math.sin(2 * Math.PI * (calendar().frac - 0.125));
  function windAt(lat) {
    const a = Math.abs(lat - beltShift());
    return a < 30 ? -1 : a < 60 ? 1.3 : -0.7;
  }
  const latToY = lat => TILE * 1.5 * ((80 - lat) / 140 * ROWS - 0.5) - OY;

  // Clouds ride the wind of their latitude, and their band moves with the
  // belts. They are larger where the season brings rain: mid-latitude
  // winters and tropical summers (the monsoon). Faint streaks on the sea
  // show the wind. Storms and blizzards have their own dark clouds.
  const CLOUD_LATS = [-48, -40, -22, -14, -6, 4, 10, 18, 26, 38, 44, 50, 56, 66];
  const clouds = CLOUD_LATS.map((lat, i) => ({ lat, x: (hash('cx' + i) * 2 - 1) * OX, r: 2 + 2 * hash('cr' + i) }));
  let cloudT = 0;
  function drawClouds(t) {
    const w = OX + TILE * 6, dt = cloudT ? Math.min(0.2, t - cloudT) : 0, cal = calendar(), shift = beltShift();
    cloudT = t;
    if (!calm) {
      // Wind streaks: short dashes that move with the wind, on the sea.
      pen.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const lat = 70 - (i % 13) * 10.5 + hash('sl' + i) * 4, v = windAt(lat);
        const x = ((hash('sx' + i) * 2 - 1) * w + v * t * 10 + 8 * w) % (2 * w) - w, y = latToY(lat);
        const k = tiles.get(tileAt(x, y));
        if (!k || !WET[k.terrain]) continue;
        const sx = nearX(x), a = screenRaw(sx, y, 0), b = screenRaw(sx + v * TILE * 1.6, y, 0);
        pen.strokeStyle = 'rgba(214,236,248,0.22)';
        pen.beginPath(); pen.moveTo(a.x, a.y); pen.lineTo(b.x, b.y); pen.stroke();
      }
    }
    clouds.forEach((c, i) => {
      const lat = c.lat + shift, v = windAt(lat);
      c.x = wrapDelta(c.x + v * (5 + 3 * hash('cv' + i)) * dt);
      const local = seasonAt(lat, cal.season), a = Math.abs(lat);
      const wet = (local === 3 && a > 30 && a < 62) || (local === 1 && a < 25);
      const r = TILE * c.r * (wet ? 1.45 : 0.85);
      drawCloud(c.x, latToY(lat), r, wet ? 0.22 : 0.13, '240,244,248');
    });
    for (const d of active) {
      if (d.kind !== 'storm' && d.kind !== 'blizzard') continue;
      const c = tileCenter(d.q, d.r), fade = Math.max(0, Math.min(1, (worldNow() - d.start) / 4000, (d.end - worldNow()) / 4000));
      drawCloud(c.x, c.y - TILE, TILE * (2 + d.radius), 0.3 * fade, d.kind === 'storm' ? '120,128,140' : '220,228,236');
    }
  }
  function drawCloud(x, y, r, alpha, rgb) {
    const shade = screen(x + 10, y + 14, 0), top = screen(x, y, 60);
    pen.fillStyle = 'rgba(0,0,0,' + (alpha * 0.45) + ')';
    pen.beginPath(); pen.ellipse(shade.x, shade.y, r * shade.f * 1.4, r * shade.f * 0.6, 0, 0, 6.2832); pen.fill();
    pen.fillStyle = 'rgba(' + rgb + ',' + alpha + ')';
    for (const [dx, dy, s] of [[-0.6, 0.1, 0.7], [0, -0.15, 1], [0.6, 0.1, 0.75]]) {
      pen.beginPath(); pen.ellipse(top.x + dx * r * top.f, top.y + dy * r * top.f, r * top.f * s, r * top.f * s * 0.55, 0, 0, 6.2832); pen.fill();
    }
  }

  // Gained and filled tiles pulse in the colony's color with a solid edge
  // (a gained tile also sends out a ring); a tile whose house is gone
  // flashes red with a dashed edge. A file in use outlines its tile in the
  // color of the tool's work (read, write, new). Over each city, the count
  // of tiles it gained and lost rises and fades (drawTally).
  function drawChanges(now, t) {
    const pulse = calm ? 1 : 0.5 + 0.5 * Math.sin(t * 7);
    const outline = (k, color, alpha, dash) => {
      const pts = tilePath(centerOf(k), 0.97);
      fillPath(pts);
      pen.fillStyle = rgba(color, (0.2 + 0.3 * pulse) * alpha);
      pen.fill();
      pen.setLineDash(dash ? [3, 3] : []);
      pen.strokeStyle = rgba(color, 0.95 * alpha);
      pen.lineWidth = Math.max(1.5, 3 * pts[0].f);
      pen.stroke();
      pen.setLineDash([]);
    };
    for (const [k, c] of changes) {
      const age = (now - c.at) / CHANGE_MS;
      if (age >= 1) { changes.delete(k); continue; }
      const city = nodes.get(c.city);
      outline(k, c.kind === 'lose' ? '#ff4d4d' : (city ? city.color : '#ffffff'), 1 - age, c.kind === 'lose');
      // A gained tile also sends out one ring as it joins.
      if (c.kind === 'gain' && age < 0.3 && !calm) {
        const s = screen(centerOf(k).x, centerOf(k).y, 0);
        pen.strokeStyle = rgba(city ? city.color : '#ffffff', 1 - age / 0.3);
        pen.lineWidth = 2;
        pen.beginPath(); pen.arc(s.x, s.y, TILE * s.f * (0.6 + 2.5 * age), 0, 6.2832); pen.stroke();
      }
    }
    for (const n of nodes.values()) {
      if (n.type !== 'file' || n.dying || !owner.has(n.id)) continue;
      const heat = heatOf(n);
      if (heat < 0.05) continue;
      const o = owner.get(n.id);
      outline(tkey(o.q, o.r), OP[n.op] || '#ffffff', heat, false);
    }
  }
  // The tile count over each city: a dark tag above the city's label.
  function drawTally(now) {
    pen.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    pen.textAlign = 'left';
    pen.textBaseline = 'middle';
    for (const [city, v] of tally) {
      const age = (now - v.at) / CHANGE_MS;
      if (age >= 1 || !owner.has(city)) { tally.delete(city); continue; }
      const fade = Math.min(1, 4 * (1 - age));
      const o = owner.get(city), c = tileCenter(o.q, o.r), s = screen(c.x, c.y, 0);
      const parts = [];
      if (v.gain) parts.push(['+' + v.gain, '#7be08a']);
      if (v.lose) parts.push(['\u2212' + v.lose, '#ff6b6b']);
      const widths = parts.map(([text]) => pen.measureText(text).width);
      const w = widths.reduce((a, b) => a + b, 0) + 8 * (parts.length - 1) + 16;
      const y = s.y - 26 * s.f - 30 - 10 * age;
      let x = s.x - w / 2;
      pen.fillStyle = rgba('#14161b', 0.85 * fade);
      pen.beginPath(); pen.roundRect(x, y - 11, w, 22, 6); pen.fill();
      x += 8;
      parts.forEach(([text, color], i) => {
        pen.fillStyle = rgba(color, fade);
        pen.fillText(text, x, y + 1);
        x += widths[i] + 8;
      });
    }
    pen.textBaseline = 'alphabetic';
  }

  // Disasters on the map. Each fades in and out over 4 s. A flood is blue
  // water with rings, a wildfire flickering flames and smoke, a storm a
  // turning spiral, a blizzard drifting snow, an earthquake cracks that
  // shake. Over the middle, its name and the time left.
  function drawDisasters(t) {
    const now = worldNow();
    pen.textAlign = 'center';
    for (const d of active) {
      const hz = HAZARD[d.kind];
      const fade = Math.max(0, Math.min(1, (now - d.start) / 4000, (d.end - now) / 4000));
      for (const k of d.tiles || []) {
        const c = centerOf(k), s = screen(c.x, c.y, 0), u = TILE * s.f, sd = hash(d.id + k), wob = calm ? 0 : 1;
        fillPath(tilePath(c, 0.97));
        pen.fillStyle = rgba(d.kind === 'wildfire' ? '#7a1e0e' : hz.color, (d.kind === 'quake' ? 0.15 : 0.32) * fade * s.fog);
        pen.fill();
        if (d.kind === 'flood') {
          pen.strokeStyle = rgba('#d6ecf8', 0.6 * fade);
          pen.lineWidth = Math.max(0.6, u * 0.06);
          const ph = (t * 0.6 * wob + sd) % 1;
          pen.beginPath(); pen.ellipse(s.x, s.y, u * (0.15 + 0.5 * ph), u * (0.08 + 0.25 * ph), 0, 0, 6.2832); pen.stroke();
        } else if (d.kind === 'wildfire') {
          for (let i = 0; i < 3; i++) {
            const fx = s.x + (i - 1) * u * 0.32, h = u * (0.35 + 0.2 * Math.sin(t * 9 * wob + sd * 20 + i * 2));
            pen.fillStyle = rgba(i === 1 ? '#ffd23a' : '#ff6a2a', 0.9 * fade);
            pen.beginPath(); pen.moveTo(fx - u * 0.13, s.y + u * 0.2); pen.quadraticCurveTo(fx - u * 0.1, s.y - h * 0.5, fx, s.y + u * 0.2 - h - u * 0.1); pen.quadraticCurveTo(fx + u * 0.1, s.y - h * 0.5, fx + u * 0.13, s.y + u * 0.2); pen.fill();
          }
          const k2 = (t * 0.4 * wob + sd) % 1;
          pen.fillStyle = rgba('#5a5a5a', 0.35 * (1 - k2) * fade);
          pen.beginPath(); pen.arc(s.x + u * 0.2 * Math.sin(sd * 9), s.y - u * (0.5 + 1.2 * k2), u * (0.15 + 0.25 * k2), 0, 6.2832); pen.fill();
        } else if (d.kind === 'blizzard') {
          pen.fillStyle = rgba('#ffffff', 0.85 * fade);
          for (let i = 0; i < 4; i++) {
            const ph = (t * 0.5 * wob + hash(k + i)) % 1;
            pen.beginPath(); pen.arc(s.x + (hash(k + i + 'x') - 0.5) * u * 1.2 + ph * u * 0.4, s.y - u * 0.5 + ph * u, Math.max(0.7, u * 0.05), 0, 6.2832); pen.fill();
          }
        } else if (d.kind === 'quake') {
          const jx = calm ? 0 : Math.sin(t * 40 + sd * 9) * u * 0.04;
          pen.strokeStyle = rgba('#2a1d12', 0.85 * fade);
          pen.lineWidth = Math.max(0.8, u * 0.07);
          pen.beginPath(); pen.moveTo(s.x - u * 0.45 + jx, s.y - u * 0.1);
          pen.lineTo(s.x - u * 0.15 + jx, s.y + u * 0.08); pen.lineTo(s.x + u * 0.05 + jx, s.y - u * 0.12); pen.lineTo(s.x + u * 0.4 + jx, s.y + u * 0.1); pen.stroke();
        }
      }
      const c = tileCenter(d.q, d.r), s = screen(c.x, c.y, 0), u = TILE * s.f;
      if (d.kind === 'storm') {
        // Spiral arms that turn around the eye.
        pen.strokeStyle = rgba('#eef2f6', 0.7 * fade);
        pen.lineWidth = Math.max(1.2, u * 0.12);
        const turn = calm ? 0 : -t * 1.2, R = u * (d.radius + 0.6);
        for (let arm = 0; arm < 3; arm++) {
          pen.beginPath();
          for (let i = 0; i <= 20; i++) {
            const f = i / 20, a = turn + arm * 2.094 + f * 3.2, r = R * (0.15 + 0.85 * f);
            const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.75;
            i ? pen.lineTo(x, y) : pen.moveTo(x, y);
          }
          pen.stroke();
        }
      }
      const left = Math.max(0, Math.round((d.end - now) / 1000));
      pen.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      const text = hz.name + ' \u00b7 ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      const y = s.y - u * (d.radius + 1.2);
      pen.lineWidth = 3; pen.strokeStyle = rgba('#14161b', 0.85 * fade);
      pen.strokeText(text, s.x, y);
      pen.fillStyle = rgba(hz.color, fade);
      pen.fillText(text, s.x, y);
    }
  }

  // The calendar, at the top right: a year wheel with its four seasons and a
  // hand, the year, the season and day in the north, and the disasters now.
  function drawCalendar() {
    const cal = calendar(), x = W - 30, y = TOP + 26, R = 14;
    for (let i = 0; i < 4; i++) {
      pen.fillStyle = rgba(SEASON_COLOR[i], i === cal.season ? 0.9 : 0.35);
      pen.beginPath(); pen.moveTo(x, y); pen.arc(x, y, R, -Math.PI / 2 + i * Math.PI / 2, -Math.PI / 2 + (i + 1) * Math.PI / 2); pen.closePath(); pen.fill();
    }
    const a = -Math.PI / 2 + cal.frac * 6.2832;
    pen.strokeStyle = '#14161b'; pen.lineWidth = 2;
    pen.beginPath(); pen.moveTo(x, y); pen.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); pen.stroke();
    pen.textAlign = 'right';
    pen.textBaseline = 'middle';
    pen.font = '700 12px ui-sans-serif, system-ui, sans-serif';
    pen.fillStyle = SEASON_COLOR[cal.season];
    pen.fillText('Year ' + cal.year + ' \u00b7 ' + SEASONS[cal.season] + ' (north) \u00b7 day ' + cal.day, x - R - 8, y - 6);
    pen.font = '11px ui-sans-serif, system-ui, sans-serif';
    pen.fillStyle = 'rgba(210,214,222,0.75)';
    pen.fillText('south: ' + SEASONS[(cal.season + 2) % 4] + ' \u00b7 1 hour = 1 year', x - R - 8, y + 9);
    const now = worldNow();
    if (!active.length) {
      // None now: the next one and the time until it starts.
      const next = [...disastersOf(cal.n), ...disastersOf(cal.n + 1)].filter(d => d.start > now).sort((p, q) => p.start - q.start)[0];
      if (next) {
        const wait = Math.round((next.start - now) / 1000);
        pen.fillStyle = 'rgba(210,214,222,0.75)';
        pen.fillText('No disaster now \u00b7 next: ' + HAZARD[next.kind].name + ' in ' + Math.floor(wait / 60) + ':' + String(wait % 60).padStart(2, '0'), x - R - 8, y + 30);
      }
    }
    active.forEach((d, i) => {
      const hz = HAZARD[d.kind], left = Math.max(0, Math.round((d.end - now) / 1000));
      const yy = y + 30 + i * 15;
      pen.fillStyle = hz.color;
      pen.beginPath(); pen.arc(x - R - 12 - 4, yy, 3.5, 0, 6.2832); pen.fill();
      pen.fillStyle = 'rgba(225,228,234,0.9)';
      pen.fillText(hz.name + ' \u00d7' + hz.mult + ' cost \u00b7 ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'), x - R - 26, yy);
    });
    pen.textBaseline = 'alphabetic';
  }

  // A house: a box with a roof, sized by its data; a used one lights its window.
  function house(x, y, s, color, fade, lit) {
    pen.fillStyle = rgba(color, 0.9 * fade);
    pen.fillRect(x - s * 0.55, y - s * 0.7, s * 1.1, s * 0.7);
    pen.fillStyle = rgba('#8a3b2e', 0.95 * fade);
    pen.beginPath(); pen.moveTo(x - s * 0.7, y - s * 0.68); pen.lineTo(x, y - s * 1.2); pen.lineTo(x + s * 0.7, y - s * 0.68); pen.closePath(); pen.fill();
    pen.fillStyle = lit > 0.05 ? rgba('#ffe08a', Math.min(1, 0.4 + lit) * fade) : rgba('#1f2229', 0.7 * fade);
    pen.fillRect(x - s * 0.16, y - s * 0.52, s * 0.32, s * 0.26);
  }

  // Rivers have their own tiles: ground, a water channel, ground. In each
  // river tile the channel runs from the edge it shares with the previous
  // river tile, through the middle, to the edge it shares with the next,
  // so the channels join into one river; it starts as a spring in its
  // first tile and runs into the sea tile at its mouth. Dark banks line
  // both sides of the water. With flow, only the moving ripples.
  function drawRivers(inFocus, t, flow) {
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    for (const river of rivers) {
      for (let j = 0; j < river.length; j++) {
        const tl = tiles.get(river[j]);
        if (!tl || WET[tl.terrain]) continue;
        const raw = centerOf(river[j]), c = { x: nearX(raw.x), y: raw.y };
        const mid = k => { const o = centerOf(k); return { x: c.x + wrapDelta(o.x - c.x) / 2, y: (c.y + o.y) / 2 }; };
        const from = j > 0 ? mid(river[j - 1]) : c;
        const to = j < river.length - 1 ? mid(river[j + 1]) : c;
        // The channel bends to one side of the middle, so the river meanders.
        const bend = (hash('bend' + river[j]) - 0.5) * TILE * 0.7;
        const dx = to.x - from.x, dy = to.y - from.y, dl = Math.hypot(dx, dy) || 1;
        const a = screenRaw(from.x, from.y, 0), b = screenRaw(to.x, to.y, 0);
        const m = screenRaw(c.x - dy / dl * bend, c.y + dx / dl * bend, 0);
        const w = TILE * 0.46 * m.f;
        const city = tl.city && nodes.get(tl.city);
        const dim = city ? (inFocus(city) ? 1 : 0.5) : 0.8;
        const stroke = (width, color) => {
          pen.strokeStyle = color;
          pen.lineWidth = width;
          pen.beginPath(); pen.moveTo(a.x, a.y); pen.quadraticCurveTo(m.x, m.y, b.x, b.y); pen.stroke();
        };
        if (flow) {
          if (calm) continue;
          pen.setLineDash([w * 0.6, w * 1.4]);
          pen.lineDashOffset = -t * 6;
          stroke(Math.max(0.6, w * 0.25), rgba('#d6ecf8', 0.55 * dim * m.fog));
          pen.setLineDash([]);
          pen.lineDashOffset = 0;
          continue;
        }
        stroke(w * 2, rgba('#4a3d26', 0.9 * dim * m.fog));
        stroke(w * 1.55, rgba('#8c7a50', 0.9 * dim * m.fog));
        stroke(w, rgba('#4f9fd0', 0.97 * dim * m.fog));
        if (j === 0) {
          const sp = screenRaw(c.x, c.y, 0);
          pen.fillStyle = rgba('#8c7a50', 0.9 * dim * m.fog);
          pen.beginPath(); pen.arc(sp.x, sp.y, w * 1.1, 0, 6.2832); pen.fill();
          pen.fillStyle = rgba('#4f9fd0', 0.97 * dim * m.fog);
          pen.beginPath(); pen.arc(sp.x, sp.y, w * 0.8, 0, 6.2832); pen.fill();
        }
      }
    }
  }

  // The map (tiles, rivers, borders, roads and bridges) changes only with
  // the camera, the layout or the focus. It is drawn into an image, and the
  // image is drawn again until one of these changes.
  let cache, cacheKey = '';
  function paintMap(t, inFocus) {
    if (!cache) cache = document.createElement('canvas');
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cache.width !== cw || cache.height !== ch) { cache.width = cw; cache.height = ch; }
    pen = cache.getContext('2d');
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, cw, ch);
    pen.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Tiles: terrain, a tint of the owner's color, the season, and a mark.
    const cal = calendar();
    const list = [...tiles.entries()].map(([k, tl]) => ({ k, tl, c: tileCenter(tl.q, tl.r) }));
    for (const { k, tl, c } of list) {
      const pts = tilePath(c, 0.97);
      const s = screen(c.x, c.y, 0);
      const city = tl.city && nodes.get(tl.city);
      const dim = city ? (inFocus(city) ? 1 : 0.5) : 0.8;
      fillPath(pts);
      pen.fillStyle = rgba(TERRAIN[tl.terrain], 0.8 * dim * s.fog);
      pen.fill();
      if (city) { pen.fillStyle = rgba(city.color, 0.16 * dim * s.fog); pen.fill(); }
      // The season: snow at high latitudes in winter, orange forests in
      // autumn, greener land in spring, brighter dry land in summer.
      if (tl.land && tl.terrain !== 'ice') {
        const local = seasonAt(tl.lat, cal.season), a = Math.abs(tl.lat);
        const tint = local === 3 && a > 40 ? ['#f2f6fa', Math.min(0.6, 0.2 + (a - 40) / 30)]
          : local === 2 && (tl.terrain === 'forest' || tl.terrain === 'grass') ? ['#d0782a', 0.35]
          : local === 0 && (tl.terrain === 'grass' || tl.terrain === 'plains' || tl.terrain === 'forest') ? ['#7fe36a', 0.14]
          : local === 1 && (tl.terrain === 'desert' || tl.terrain === 'plains' || tl.terrain === 'sand') ? ['#ffd27a', 0.14] : undefined;
        if (tint) { pen.fillStyle = rgba(tint[0], tint[1] * dim * s.fog); pen.fill(); }
      }
      if (tl.terrain !== 'volcano' && (tl.terrain !== 'deep' || hash(k) < 0.2)) terrainMark(tl.terrain, s.x, s.y, s.f, dim * s.fog, hash(k), t);
    }

    drawRivers(inFocus, t, false);

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
        pen.strokeStyle = rgba(city.color, 0.9 * (inFocus(city) ? 1 : 0.45) * a.fog);
        pen.lineWidth = Math.max(1.5, 2.6 * a.f);
        pen.beginPath(); pen.moveTo(a.x, a.y); pen.lineTo(b.x, b.y); pen.stroke();
      }
    }

    // Roads: a dirt band with ruts on land; a dashed ferry line over water.
    for (const road of roads) {
      for (let j = 1; j < road.length; j++) {
        const a = centerOf(road[j - 1]), b = centerOf(road[j]), ax = nearX(a.x);
        const pa = screenRaw(ax, a.y, 0), pb = screenRaw(ax + wrapDelta(b.x - a.x), b.y, 0);
        const wet = WET[tiles.get(road[j - 1]).terrain] || WET[tiles.get(road[j]).terrain];
        pen.setLineDash(wet ? [3, 4] : []);
        pen.strokeStyle = wet ? 'rgba(220,230,240,0.55)' : 'rgba(160,125,80,0.8)';
        pen.lineWidth = wet ? 1 : Math.max(2, 4 * pa.f);
        pen.beginPath(); pen.moveTo(pa.x, pa.y); pen.lineTo(pb.x, pb.y); pen.stroke();
      }
    }
    pen.setLineDash([]);
    // Bridges: wooden planks where a road crosses a river.
    for (const k of roadSet) {
      if (!riverSet.has(k)) continue;
      const c = centerOf(k), s = screen(c.x, c.y, 0), u = TILE * s.f;
      pen.fillStyle = 'rgba(120,85,50,0.98)';
      pen.fillRect(s.x - u * 0.4, s.y - u * 0.14, u * 0.8, u * 0.28);
      pen.strokeStyle = 'rgba(70,50,30,0.95)'; pen.lineWidth = 1;
      pen.strokeRect(s.x - u * 0.4, s.y - u * 0.14, u * 0.8, u * 0.28);
      for (const dx of [-0.2, 0, 0.2]) { pen.beginPath(); pen.moveTo(s.x + dx * u, s.y - u * 0.14); pen.lineTo(s.x + dx * u, s.y + u * 0.14); pen.stroke(); }
    }
    pen = ctx;
  }
  function mapKey(fc) {
    const q = p => Math.round(p.x * 4) + ':' + Math.round(p.y * 4);
    return [q(screenRaw(-OX, -OY, 0)), q(screenRaw(OX, -OY, 0)), q(screenRaw(-OX, OY, 0)), Math.round(cam.r), W, H, dpr, mapGen, fc || '', calendar().n].join(' ');
  }

  function draw(now) {
    const t = now / 1000;
    pen.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The background matches the terminal, so the pane looks transparent.
    pen.globalCompositeOperation = 'source-over';
    pen.fillStyle = '#292c33';
    pen.fillRect(0, 0, W, H);
    for (const n of nodes.values()) { const x = n.x; n.x = nearX(x); project(n); n.x = x; }
    const ft = focus && nodes.get(focus.id);
    const fc = ft && (ft.kind === 'hub' ? ft.id : ft.colony);
    const inFocus = n => !fc || n.id === fc || n.colony === fc;
    const near = hover ? new Set([hover.id]) : undefined;
    if (hover) for (const e of edges.values()) {
      if (e.a === hover.id) near.add(e.b);
      if (e.b === hover.id) near.add(e.a);
    }

    const key = mapKey(fc);
    if (key !== cacheKey) { paintMap(t, inFocus); cacheKey = key; }
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.drawImage(cache, 0, 0);
    pen.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRivers(inFocus, t, true);

    drawChanges(now, t);
    drawDisasters(t);
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
        const glow = pen.createRadialGradient(x, y - TILE * 0.4 * n.sf, 0, x, y - TILE * 0.4 * n.sf, TILE * n.sf * (1.2 + 2 * heat));
        glow.addColorStop(0, rgba(hot, 0.55 * heat * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        pen.fillStyle = glow;
        pen.beginPath(); pen.arc(x, y - TILE * 0.4 * n.sf, TILE * n.sf * (1.2 + 2 * heat), 0, 6.2832); pen.fill();
      }
      if (n.kind === 'hub') {
        // The city: a wall, three houses and a banner in its color.
        const s = TILE * 0.55 * n.sf;
        pen.strokeStyle = rgba('#c9b48a', 0.9 * fade);
        pen.lineWidth = Math.max(1, 1.6 * n.sf);
        pen.beginPath(); pen.ellipse(x, y - s * 0.3, s * 1.45, s * 0.8, 0, 0, 6.2832); pen.stroke();
        house(x - s * 0.7, y, s * 0.8, '#d9c8a0', fade, 0);
        house(x + s * 0.7, y, s * 0.8, '#d9c8a0', fade, 0);
        house(x, y - s * 0.35, s, '#e8dcc0', fade, 0);
        pen.strokeStyle = rgba('#5a4a30', fade); pen.lineWidth = 1;
        pen.beginPath(); pen.moveTo(x + s * 1.1, y); pen.lineTo(x + s * 1.1, y - s * 2.2); pen.stroke();
        pen.fillStyle = rgba(n.color, fade);
        pen.beginPath(); pen.moveTo(x + s * 1.1, y - s * 2.2); pen.lineTo(x + s * 2, y - s * 1.9); pen.lineTo(x + s * 1.1, y - s * 1.6); pen.closePath(); pen.fill();
        continue;
      }
      const s = (sizes.get(n.id) || 0.8) * TILE * 0.7 * n.sf * g;
      house(x, y, s, n.color, fade, heat);
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        pen.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        pen.lineWidth = 1;
        pen.beginPath(); pen.arc(x, y - s * 0.5, s + k * 12 * n.sf, 0, 6.2832); pen.stroke();
      }
    }

    // Memory links, job–session links and git–file links: lines between
    // tiles, the short way around the map.
    for (const e of edges.values()) {
      if (!e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      const end = screenRaw(nearX(a.x) + wrapDelta(b.x - a.x), b.y, b.z);
      pen.setLineDash(e.solid ? [] : [2, 4]);
      pen.lineWidth = 1;
      pen.strokeStyle = rgba(e.color || '#cfe0ff', (e.solid ? 0.5 : 0.22) * (inFocus(a) ? 1 : 0.3) * (a.fog + b.fog) / 2);
      pen.beginPath(); pen.moveTo(a.sx, a.sy); pen.lineTo(end.x, end.y); pen.stroke();
    }
    pen.setLineDash([]);

    // Each horse's plan: a faint dotted line along the tiles still ahead.
    pen.setLineDash([2, 4]);
    pen.lineWidth = 1;
    pen.strokeStyle = 'rgba(242,230,200,0.4)';
    for (const h of horses.values()) {
      if (h.pi >= h.path.length - 1) continue;
      let x = nearX(h.x);
      const pts = [screenRaw(x, h.y, 0), ...h.path.slice(h.pi + 1).map(k => { const c = centerOf(k); x += wrapDelta(c.x - x); return screenRaw(x, c.y, 0); })];
      pen.beginPath(); pts.forEach((p, j) => (j ? pen.lineTo(p.x, p.y) : pen.moveTo(p.x, p.y))); pen.stroke();
    }
    pen.setLineDash([]);

    // Horses, far ones first, with their load; in a swarm they wear shades.
    // On water a horse sits in a small boat.
    const herd = [...horses.values()].map(h => ({ h, d: screen(h.x, h.y, h.z).depth })).sort((p, q) => p.d - q.d);
    for (const { h } of herd) {
      paintHorse(h, t, 1, Object.assign({ shades: h.shade || 0, carry: h.carry }, h.boat ? { run: 0 } : {}));
      if (h.boat) {
        const s = screen(h.x, h.y, h.z), R = 6 * Math.max(1, s.f), rock = calm ? 0 : Math.sin(t * 3 + h.seed * 9) * 0.08;
        pen.save(); pen.translate(s.x, s.y + R * 0.55); pen.rotate(rock);
        pen.fillStyle = 'rgba(122,82,48,0.98)';
        pen.beginPath(); pen.moveTo(-R * 1.6, -R * 0.2); pen.lineTo(R * 1.9, -R * 0.2); pen.lineTo(R * 1.4, R * 0.5); pen.lineTo(-R * 1.2, R * 0.5); pen.closePath(); pen.fill();
        pen.strokeStyle = 'rgba(169,203,230,0.7)'; pen.lineWidth = 1;
        pen.beginPath(); pen.moveTo(-R * 1.9, R * 0.55); pen.quadraticCurveTo(0, R * 0.8, R * 2.1, R * 0.55); pen.stroke();
        pen.restore();
      }
    }

    drawClouds(t);
    drawLabels(order, near, fc, inFocus, now, n => (n.kind === 'hub' ? 26 : 12) * n.sf);
    drawTally(now);
    drawCalendar();
  }

`,
}
