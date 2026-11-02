// Theme 5, cockpit: a mobile suit cockpit display. For now it shows the nodes
// only. The panel is one large circle: each hub has a sector of the edge, its
// items sit on the edge in that sector, and their children sit on rings
// further in. The whole circle turns slowly, so children stay with their
// parents.
import type { Theme } from '../web'

export const COCKPIT: Theme = {
  name: 'cockpit',
  legend: 'drag to move · pinch or scroll to zoom · 0 for the whole view',
  script: `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false, MAP_VIEW = { pitch: 0 };
  // The view stays where the person put it: events do not move the camera.
  const FOCUS_CAM = false;

  // The order of the sectors around the edge, from the top, clockwise.
  const ORDER = ['hub:files', 'hub:git', 'hub:mcp', 'hub:jobs', 'hub:schedule', 'hub:sessions', 'hub:usage', 'hub:machine', 'hub:plugins', 'hub:skills', 'hub:memory'];

  // The circle has a fixed radius R, so it never changes size. Depth 1 is on
  // the edge; each level further in is on a ring at RING(d) of R.
  const R = 420, GAP = 0.035, BAND = 1.06;
  const RING = d => 1 - 0.7 * (1 - Math.pow(0.8, d - 1));
  let sectors = new Map(), places = new Map(), segments = [], layoutGen = -1, layoutSize = -1;

  function layout() {
    const kids = new Map();
    for (const e of edges.values()) {
      if (e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b || b.kind === 'hub') continue;
      const list = kids.get(e.a) || [];
      list.push(b);
      kids.set(e.a, list);
    }
    // The weight of an item: 1, plus a part of the weight of its children.
    const weight = new Map();
    const weigh = n => {
      if (weight.has(n.id)) return weight.get(n.id);
      weight.set(n.id, 1);
      const w = 1 + 0.6 * (kids.get(n.id) || []).reduce((s, c) => s + weigh(c), 0);
      weight.set(n.id, w);
      return w;
    };
    const rank = id => (ORDER.indexOf(id) + 99) % 99;
    const hubs = [...nodes.values()].filter(n => n.kind === 'hub' && !n.dying)
      .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
    // A hub's share of the edge: its items' weight, with a floor.
    const share = new Map();
    for (const h of hubs) share.set(h.id, Math.max(6, (kids.get(h.id) || []).reduce((s, c) => s + Math.pow(weigh(c), 0.75), 0)));
    const total = [...share.values()].reduce((s, w) => s + w, 0) || 1;
    const free = 2 * Math.PI - GAP * hubs.length;
    const nextSectors = new Map(), nextPlaces = new Map(), nextSegments = [];
    let a = -Math.PI / 2;
    for (const h of hubs) {
      const from = a + GAP / 2, to = from + free * share.get(h.id) / total;
      nextSectors.set(h.id, { from, to, mid: (from + to) / 2 });
      const place = (id, lo, hi, d) => {
        const list = (kids.get(id) || []).slice().sort((p, q) => p.id.localeCompare(q.id));
        // The children of one parent form one segment on their ring.
        if (list.length) nextSegments.push({ parent: id, lo, hi, depth: d });
        const wOf = c => d === 1 ? Math.pow(weigh(c), 0.75) : weigh(c);
        const sum = list.reduce((s, c) => s + wOf(c), 0) || 1;
        let x = lo;
        for (const c of list) {
          const w = (hi - lo) * wOf(c) / sum;
          nextPlaces.set(c.id, { angle: x + w / 2, depth: d });
          place(c.id, x, x + w, d + 1);
          x += w;
        }
      };
      place(h.id, from, to, 1);
      a = to + GAP / 2;
    }
    sectors = nextSectors;
    places = nextPlaces;
    segments = nextSegments;
  }

  // The turn of the circle. Its speed at the edge is in screen pixels a second, so it
  // looks the same at any zoom: at 10 frames a second it moves about 0.3
  // pixel a frame, so the steps are hard to see. It stops while the pointer is on a node.
  const TURN_PX = 3;
  let spin = 0, lastSim = 0;

  // A hub sits just outside the edge, in the middle of its sector. All the
  // rings and the hubs turn by spin.
  function target(n) {
    if (n.kind === 'hub') {
      const s = sectors.get(n.id);
      return s && { x: Math.cos(s.mid + spin) * R * BAND, y: Math.sin(s.mid + spin) * R * BAND };
    }
    const at = places.get(n.id);
    if (!at) return undefined;
    const r = R * RING(at.depth), a = at.angle + spin;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function simulate() {
    if (gen !== layoutGen || nodes.size !== layoutSize) { layout(); layoutGen = gen; layoutSize = nodes.size; }
    const now = performance.now();
    const dt = lastSim ? Math.min(0.5, (now - lastSim) / 1000) : 0;
    lastSim = now;
    if (!calm && !hover) spin = (spin + dt * TURN_PX / (R * cam.s * view.zoom)) % 6.2832;
    alpha *= 0.95;
    for (const n of nodes.values()) {
      const q = target(n);
      if (!q) continue;
      n.x += (q.x - n.x) * 0.18; n.y += (q.y - n.y) * 0.18; n.z = 0;
    }
  }

  // The circle always turns, so the page never drops to 1 frame a second.
  function MAP_AWAKE() { return !calm || links.size > 0; }

  function fitBounds() {
    const r = R * 1.35;
    return { x: 0, y: 0, z: 0, r, w: 2 * r, h: 2 * r };
  }

  const spot = { x: 0, y: 0, z: 0 };

  // Links: the items that tools used one after the other link up, as an
  // annular sector (the area between two circles and two lines from the
  // center). Key 'a|b'. Each link has its own progress for each part, from
  // 0 (gone) to 1 (in place):
  //   ga, gb  the line from item a, and from item b, to the center
  //   c       the outer arc: 0 at the center, 1 at the top of the lane
  //   q       the inner arc: 0 at the center, 1 at the bottom of the lane
  // A link comes in: both lines grow to the center at the same time; then
  // the outer arc moves out to the top of the lane, so the area fills from
  // the center; then the inner arc moves out to the bottom of the lane. A
  // link goes out in the reverse order, with the same times.
  const LINE_S = 0.9, OUTER_S = 0.9, INNER_S = 1.8;
  // Lanes: each sector sits in its own band, so sectors at the same angles
  // do not overlap. Lane 0 is the outermost; each lane is LANE_W of the
  // radius, and a sector fills LANE_FILL of its lane.
  const LANES = 6, LANE_TOP = 0.93, LANE_W = 0.11, LANE_FILL = 0.8;
  // The arc a link covers (the shorter way around), from the layout angles.
  function spanOf(aId, bId) {
    const pa = places.get(aId), pb = places.get(bId);
    if (!pa || !pb) return undefined;
    const sweep = ((pb.angle - pa.angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return sweep >= 0 ? [pa.angle, sweep] : [pa.angle + sweep, -sweep];
  }
  const TAU = 2 * Math.PI, inSpan = (x, sp) => ((x - sp[0]) % TAU + TAU) % TAU <= sp[1];
  const overlap = (u, v) => inSpan(u[0], v) || inSpan(v[0], u);
  // The outermost lane that no other sector at the same angles uses.
  function laneFor(span) {
    const used = new Set();
    for (const o of links.values()) if (o.span && o.lane !== undefined && overlap(span, o.span)) used.add(o.lane);
    for (let k = 0; k < LANES; k++) if (!used.has(k)) return k;
    return links.size % LANES;
  }
  const links = new Map();
  // Only an item a tool used makes a link: a folder or an MCP server takes
  // the time of use of the newest item below it.
  const own = n => !(n.type === 'file' && n.data && n.data.kind === 'dir') && n.type !== 'mcp';
  function stepLinks(dt) {
    const hot = [...nodes.values()].filter(n => n.kind !== 'hub' && !n.dying && places.has(n.id) && own(n) && heatOf(n) > 0.02)
      .sort((a, b) => a.at - b.at).slice(-10);
    const want = new Map();
    for (let i = 1; i < hot.length; i++) want.set(hot[i - 1].id + '|' + hot[i].id, [hot[i - 1], hot[i]]);
    for (const [key, [a, b]] of want) {
      let l = links.get(key);
      if (!l) {
        l = { a: a.id, b: b.id, ga: 0, gb: 0, c: 0, q: 0 };
        l.span = spanOf(a.id, b.id); l.lane = l.span ? laneFor(l.span) : 0;
        links.set(key, l);
      }
      l.dir = 1;
      l.color = OP[b.op] || '#ffffff';
    }
    const step = (v, s, up) => Math.max(0, Math.min(1, v + (up ? 1 : -1) * dt / s));
    for (const [key, l] of links) {
      if (!want.has(key)) l.dir = -1;
      if (calm) {
        l.ga = l.gb = l.c = l.q = l.dir > 0 ? 1 : 0;
      } else if (l.dir > 0) {
        // In: both lines, then the outer arc, then the inner arc.
        if (l.ga < 1 || l.gb < 1) { l.ga = step(l.ga, LINE_S, true); l.gb = step(l.gb, LINE_S, true); }
        else if (l.c < 1) l.c = step(l.c, OUTER_S, true);
        else l.q = step(l.q, INNER_S, true);
      } else {
        // Out: the inner arc, then the outer arc, then both lines.
        if (l.q > 0) l.q = step(l.q, INNER_S, false);
        else if (l.c > 0) l.c = step(l.c, OUTER_S, false);
        else { l.ga = step(l.ga, LINE_S, false); l.gb = step(l.gb, LINE_S, false); }
      }
      l.moving = l.dir > 0 ? (l.ga < 1 || l.gb < 1 || l.c < 1 || l.q < 1) : true;
      if (l.dir < 0 && l.ga === 0 && l.gb === 0 && l.c === 0) links.delete(key);
    }
  }
  // A moving link asks for the full frame rate, so it grows smoothly.
  function MAP_BUSY() {
    for (const l of links.values()) if (l.moving) return true;
    return false;
  }
  // The two dashed rings outside the bands turn on their own, in opposite
  // directions, at a speed in screen pixels a second.
  const rings = [{ r: 1.25, n: 24, px: 3.75, width: 3, a: 0 }, { r: 1.29, n: 60, px: -2.25, width: 1.5, a: 0 }];
  let lastDraw = 0;

  function draw(now) {
    const dt = lastDraw ? Math.min(0.5, (now - lastDraw) / 1000) : 0;
    lastDraw = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#292c33';
    ctx.fillRect(0, 0, W, H);
    for (const n of nodes.values()) project(n);
    // Segments: one arc per group of siblings, on their ring, across the
    // part of the circle their parent owns, with a gap of about 3 pixels at
    // each end.
    const C = (spot.x = 0, spot.y = 0, spot.z = 0, project(spot), spot);
    const cx = C.sx, cy = C.sy, Rp = R * C.sf;
    ctx.lineCap = 'butt';
    // The inner levels: one faint dashed ring each, in one color.
    let deepest = 1;
    for (const sg of segments) deepest = Math.max(deepest, sg.depth);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = rgba('#7fd8ff', 0.1);
    for (let d = 2; d <= Math.min(deepest, 7); d++) {
      ctx.beginPath(); ctx.arc(cx, cy, Rp * RING(d), 0, 6.2832); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Ticks inside the edge: 180 of them, longer at each 5th and each 15th.
    // They turn with the circle.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba('#7fd8ff', 0.22);
    ctx.beginPath();
    for (let i = 0; i < 180; i++) {
      const a = spin + i * 6.2832 / 180, long = i % 15 === 0 ? 0.04 : i % 5 === 0 ? 0.022 : 0.012;
      ctx.moveTo(cx + Math.cos(a) * Rp * 0.985, cy + Math.sin(a) * Rp * 0.985);
      ctx.lineTo(cx + Math.cos(a) * Rp * (0.985 - long), cy + Math.sin(a) * Rp * (0.985 - long));
    }
    ctx.stroke();
    // Outer rings: dashes with one gap in each six.
    ctx.strokeStyle = rgba('#7fd8ff', 0.18);
    for (const ring of rings) {
      const rr = Rp * ring.r;
      if (!calm) ring.a = (ring.a + dt * ring.px / rr) % 6.2832;
      ctx.lineWidth = ring.width;
      for (let i = 0; i < ring.n; i++) {
        if (i % 6 === 5) continue;
        const a = ring.a + i * 6.2832 / ring.n;
        ctx.beginPath(); ctx.arc(cx, cy, rr, a, a + 6.2832 / ring.n * 0.6); ctx.stroke();
      }
    }
    // The edge: one colored band per hub.
    for (const sg of segments) {
      if (sg.depth !== 1) continue;
      const p = nodes.get(sg.parent);
      if (!p || p.dying) continue;
      // The edge segments sit just outside the edge ring, so the nodes do
      // not cover them.
      const r = Rp * (sg.depth === 1 ? 1.035 : RING(sg.depth)), gap = Math.min(3 / r, (sg.hi - sg.lo) * 0.2);
      // The edge band is thick: about 2.2 % of the radius.
      ctx.lineWidth = sg.depth === 1 ? Math.max(3, Rp * 0.022) : 1.5;
      ctx.strokeStyle = rgba(p.color, sg.depth === 1 ? 0.55 : 0.4);
      ctx.beginPath(); ctx.arc(cx, cy, r, sg.lo + spin + gap, sg.hi + spin - gap); ctx.stroke();
      // End marks: a short cross line at each end of a hub's sector, as on a
      // gauge.
      if (sg.depth === 1) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(p.color, 0.8);
        ctx.beginPath();
        for (const e of [sg.lo + spin, sg.hi + spin]) {
          ctx.moveTo(cx + Math.cos(e) * Rp, cy + Math.sin(e) * Rp);
          ctx.lineTo(cx + Math.cos(e) * Rp * 1.08, cy + Math.sin(e) * Rp * 1.08);
        }
        ctx.stroke();
      }
    }
    // Links, under the markers.
    stepLinks(dt);
    ctx.lineJoin = 'round';
    for (const [key, l] of links) {
      const A = nodes.get(l.a), B = nodes.get(l.b);
      if (!A || !B) { links.delete(key); continue; }
      const ta = Math.atan2(A.sy - cy, A.sx - cx), ra = Math.hypot(A.sx - cx, A.sy - cy);
      ctx.strokeStyle = rgba(l.color, 0.75);
      ctx.lineWidth = 1.2;
      const spoke = (t, r0, g) => {
        const r1 = r0 * (1 - ease(g));
        ctx.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0);
        ctx.lineTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1);
      };
      // No area yet (or no more): only the two lines.
      if (l.c === 0) {
        ctx.beginPath();
        spoke(ta, ra, l.ga);
        spoke(Math.atan2(B.sy - cy, B.sx - cx), Math.hypot(B.sx - cx, B.sy - cy), l.gb);
        ctx.stroke();
        continue;
      }
      // The sector: the shorter way around from A to B.
      const tb = Math.atan2(B.sy - cy, B.sx - cx), rb = Math.hypot(B.sx - cx, B.sy - cy);
      // The outer arc moves between the center and the top of the lane, and
      // the inner arc between the center and the bottom of the lane.
      const top = Rp * (LANE_TOP - (l.lane || 0) * LANE_W);
      const ro = top * ease(l.c), ri = (top - Rp * LANE_W * LANE_FILL) * ease(l.q);
      const sweep = ((tb - ta + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const back = sweep < 0;
      ctx.fillStyle = rgba(l.color, 0.14);
      // A line from each item down to the outer arc, so the source shows.
      // While the area closes up, the lines follow the outer arc down, so
      // they still meet at the center when the area is gone.
      ctx.beginPath();
      for (const [t, r] of [[ta, ra], [tb, rb]]) if (r > ro) {
        ctx.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
        ctx.lineTo(cx + Math.cos(t) * ro, cy + Math.sin(t) * ro);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, ro, ta, ta + sweep, back);
      ctx.arc(cx, cy, ri, ta + sweep, ta, !back);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    for (const n of nodes.values()) {
      if (n.kind === 'joint' || n.kind === 'hub') continue;
      const g = ease(grown(n.born, now, 500)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const r = Math.max(1.5, Math.min(4, n.r * 0.55)) * n.sf * g;
      ctx.fillStyle = rgba(n.color, n.dim ? 0.45 : 0.9);
      ctx.beginPath();
      // An item with children is a diamond; a leaf is a square.
      if (n.kind === 'group' || (n.type === 'file' && n.data && n.data.kind === 'dir')) {
        const d = r * 1.3;
        ctx.moveTo(n.sx, n.sy - d); ctx.lineTo(n.sx + d, n.sy); ctx.lineTo(n.sx, n.sy + d); ctx.lineTo(n.sx - d, n.sy); ctx.closePath();
      } else ctx.rect(n.sx - r, n.sy - r, 2 * r, 2 * r);
      ctx.fill();
    }
    // Hub labels: the hub name and its count, just outside its band. A label
    // shows only while the pointer is on the hub or on one of its items; the
    // circle stops then, so the label does not move.
    for (const n of nodes.values()) {
      if (n.kind !== 'hub' || n.dying || !hover || (hover.id !== n.id && hover.colony !== n.id)) continue;
      const sc = sectors.get(n.id);
      if (!sc) continue;
      const a = sc.mid + spin, ux = Math.cos(a), uy = Math.sin(a);
      const x = cx + ux * Rp * 1.1, y = cy + uy * Rp * 1.1;
      const [name, ...rest] = n.label.split(' ');
      const line = rest.join(' ');
      const tail = line.length > 14 ? line.slice(0, 13) + '\u2026' : line;
      ctx.textAlign = ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center';
      ctx.textBaseline = uy > 0.3 ? 'top' : uy < -0.3 ? 'bottom' : 'middle';
      const up = uy < -0.3 && tail ? -13 : 0;
      ctx.font = '600 11.5px ui-monospace, monospace';
      ctx.fillStyle = n.color;
      ctx.fillText(name, x, y + up);
      if (tail) {
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(232,236,216,0.75)';
        ctx.fillText(tail, x, y + up + 13);
      }
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

`,
}
