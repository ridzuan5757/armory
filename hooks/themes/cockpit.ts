// Theme 5, cockpit: a mobile suit cockpit display. For now it shows the nodes
// only. The panel is one large circle: each hub has a sector of the edge, its
// items sit on the edge in that sector, and their children sit on rings
// further in. The whole circle turns slowly, so children stay with their
// parents.
import type { Theme } from '../web'
import { COCKPIT_FONT_WOFF2 } from './cockpit-font'
import { COCKPIT_DIGICODE_WOFF2 } from './cockpit-digicode'

export const COCKPIT: Theme = {
  name: 'cockpit',
  legend: 'hover a marker for details · a slash command starts Trans-Am',
  script: `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = false, MAP_VIEW = { pitch: 0 };
  // The view stays where the person put it: events do not move the camera.
  const FOCUS_CAM = false;
  // The panel always shows the whole circle: no drag, zoom or pan.
  const FIXED_VIEW = true;

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
          nextPlaces.set(c.id, { angle: x + w / 2, depth: d, parent: id });
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

  // Trans-Am: when a slash command runs (any command, built in or not: the
  // data names the last one of this session and its time), the panel goes
  // into a Marut mode (the colors of Gundam Harute's Marut mode panel) for TA_MS: the cyan parts turn
  // pink-red and a plum fill covers the circle, the circle and the outer rings
  // turn three times faster, the markers leave pink-red afterimages, the command
  // name shows in the center in heavy capitals with SYSTEM and three terms
  // about the command under it, and the command's marker
  // pulses. The mode eases in over TA_IN and out over TA_OUT.
  // The Trans-Am lettering: "Cockpit Display", a wide, heavy subset of
  // Orbitron that ships with the theme (see cockpit-font.ts). Until it loads,
  // the text falls back to the system's heavy sans-serif.
  const TA_FONT = '"Cockpit Display", ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif';
  try {
    new FontFace('Cockpit Display', 'url(data:font/woff2;base64,${COCKPIT_FONT_WOFF2})', { weight: '900' })
      .load().then(f => document.fonts.add(f)).catch(() => {});
  } catch {}
  // The three terms under SYSTEM use "Cockpit Digicode", the English Digicode
  // letters of the Digimoji fan font (see cockpit-digicode.ts). A character
  // that it does not have, such as a digit, uses TA_FONT.
  const TA_TERMS_FONT = '"Cockpit Digicode", ' + TA_FONT;
  try {
    new FontFace('Cockpit Digicode', 'url(data:font/woff2;base64,${COCKPIT_DIGICODE_WOFF2})', { weight: '900' })
      .load().then(f => document.fonts.add(f)).catch(() => {});
  } catch {}
  // Three terms for each built-in command, which has no description file.
  const BUILTIN_TERMS = {
    'add-dir': ['FOLDER', 'ACCESS', 'WORKSPACE'], agents: ['SUBAGENT', 'ROSTER', 'CONFIG'],
    clear: ['CONTEXT', 'RESET', 'HISTORY'], compact: ['CONTEXT', 'SUMMARY', 'TOKENS'],
    config: ['SETTINGS', 'OPTIONS', 'PANEL'], context: ['TOKENS', 'WINDOW', 'USAGE'],
    cost: ['TOKENS', 'SPEND', 'SESSION'], doctor: ['HEALTH', 'CHECK', 'INSTALL'],
    export: ['TRANSCRIPT', 'SAVE', 'SHARE'], fast: ['SPEED', 'OUTPUT', 'MODE'],
    help: ['GUIDE', 'COMMANDS', 'USAGE'], hooks: ['EVENTS', 'AUTOMATION', 'CONFIG'],
    ide: ['EDITOR', 'LINK', 'INTEGRATION'], init: ['PROJECT', 'MEMORY', 'SETUP'],
    login: ['ACCOUNT', 'AUTH', 'ACCESS'], logout: ['ACCOUNT', 'AUTH', 'EXIT'],
    mcp: ['SERVERS', 'TOOLS', 'CONNECT'], memory: ['NOTES', 'CONTEXT', 'RECALL'],
    model: ['ENGINE', 'SWITCH', 'TIER'], permissions: ['ACCESS', 'RULES', 'TOOLS'],
    plugin: ['MODS', 'MARKETPLACE', 'INSTALL'], 'reload-plugins': ['MODS', 'HOOKS', 'RESTART'],
    'reload-skills': ['SKILLS', 'INDEX', 'REFRESH'], resume: ['SESSION', 'HISTORY', 'RETURN'],
    review: ['CODE', 'DIFF', 'FINDINGS'], rewind: ['CHECKPOINT', 'UNDO', 'HISTORY'],
    status: ['ACCOUNT', 'MODEL', 'STATE'], statusline: ['FOOTER', 'DISPLAY', 'SETUP'],
    theme: ['COLORS', 'STYLE', 'DISPLAY'], usage: ['LIMITS', 'QUOTA', 'PLAN'],
  };
  const TA_MS = 8000, TA_IN = 600, TA_OUT = 1500, TA_COLOR = '#e43565', CYAN = '#7fd8ff';
  // The other colors of the Marut mode panel of Gundam Harute.
  const TA_FILL = '#7a2f5f', TA_LIGHT = '#f3b8d7', TA_SHADOW = '#4a193b', TA_TERMS = '#d63a72';
  let ta, lastCommandAt;
  function taLevel(now) {
    if (!ta) return 0;
    const t = now - ta.start;
    if (t >= TA_MS) { ta = undefined; return 0; }
    return ease(Math.max(0, Math.min(1, t / TA_IN, (TA_MS - t) / TA_OUT)));
  }
  function mixHex(a, b, k) {
    const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
    const ch = sh => Math.round(((p >> sh) & 255) + (((q >> sh) & 255) - ((p >> sh) & 255)) * k);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  // The engine passes each data update here, with the last commands of this
  // session. Each new one, in order, starts the mode or restarts it: a ring
  // spreads from the center and the name grows for a moment. The same
  // command again during the mode counts up (x2, x3). The first update only
  // sets the baseline, so old commands do not start the mode on a page load.
  function onData(d) {
    const list = (d.snapshot && d.snapshot.commands) || [];
    const first = lastCommandAt === undefined;
    for (const c of list) {
      if (!first && c.at > lastCommandAt) {
        const now = performance.now(), on = !!ta;
        const count = on && ta.name === c.name ? ta.count + 1 : 1;
        // A restart keeps the mode at full strength: no new fade in.
        ta = { name: c.name, count, at: c.at, start: on ? now - TA_IN : now, pop: now };
        if (nodes.has('skill:' + c.name)) pulses.push({ id: 'skill:' + c.name, born: now, color: TA_COLOR });
      }
      lastCommandAt = Math.max(lastCommandAt || 0, c.at);
    }
    if (first) lastCommandAt = lastCommandAt || 0;
  }
  let spin = 0, lastSim = 0, placed = false;

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
    if (gen !== layoutGen || nodes.size !== layoutSize) {
      const old = places;
      layout();
      if (gen !== layoutGen) gitEvents(old);
      layoutGen = gen; layoutSize = nodes.size;
    }
    const now = performance.now();
    const dt = lastSim ? Math.min(0.5, (now - lastSim) / 1000) : 0;
    lastSim = now;
    if (!calm && !hover) spin = (spin + dt * TURN_PX * (1 + 2 * taLevel(now)) / (R * cam.s * view.zoom)) % 6.2832;
    alpha *= 0.95;
    // On the first layout the markers go to their places at once, so the
    // circle fades in already in place; later markers move there.
    const k = placed ? 0.18 : 1;
    for (const n of nodes.values()) {
      const q = target(n);
      if (!q) continue;
      n.x += (q.x - n.x) * k; n.y += (q.y - n.y) * k; n.z = 0;
    }
    if (nodes.size) placed = true;
  }

  // The circle always turns, so the page never drops to 1 frame a second.
  function MAP_AWAKE() { return !calm || links.size > 0 || !!ta; }

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
  // Git events. The theme compares the git items of each data update with
  // the last one:
  //   a change that is gone   a sector from where it was to the new commit
  //                           of its repo (a commit), or to the repo
  //   a new commit            a short pulse on its marker
  //   a commit that is gone   a sector from where it was to its repo (a push)
  // A gone item has no node, so its end of the sector keeps its last place
  // on the circle (angle and depth). These sectors hold for EVENT_HOLD_MS.
  const EVENT_HOLD_MS = 6000, PULSE_MS = 1500;
  const pulses = [];
  let lastGit;
  function gitEvents(old) {
    const now = performance.now();
    const cur = { change: new Set(), commit: new Set() };
    for (const n of nodes.values()) if (!n.dying && (n.type === 'change' || n.type === 'commit')) cur[n.type].add(n.id);
    const prev = lastGit;
    lastGit = cur;
    if (!prev) return;
    const added = [...cur.commit].filter(id => !prev.commit.has(id));
    for (const id of added) pulses.push({ id, born: now });
    const fixed = id => { const at = old.get(id); return at && { angle: at.angle, depth: at.depth }; };
    const event = (from, toId, color, key) => {
      if (!from || !nodes.has(toId) || !places.has(toId)) return;
      const to = { id: toId };
      const l = { ea: from, eb: to, ga: 0, gb: 0, c: 0, q: 0, dir: 1, event: true, until: now + EVENT_HOLD_MS, color };
      l.span = spanFrom(from.angle, places.get(toId).angle); l.lane = laneFor(l.span);
      links.set('ev:' + key + ':' + now, l);
    };
    for (const id of prev.change) {
      if (cur.change.has(id)) continue;
      const repo = old.get(id)?.parent;
      const commit = added.find(c => places.get(c)?.parent === repo);
      event(fixed(id), commit || repo, HUB.git, id);
    }
    for (const id of prev.commit) {
      if (cur.commit.has(id)) continue;
      event(fixed(id), old.get(id)?.parent, '#f2c230', id);
    }
  }
  function spanFrom(a1, a2) {
    const sweep = ((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return sweep >= 0 ? [a1, sweep] : [a1 + sweep, -sweep];
  }

  function stepLinks(dt) {
    const hot = [...nodes.values()].filter(n => n.kind !== 'hub' && !n.dying && places.has(n.id) && own(n) && heatOf(n) > 0.02)
      .sort((a, b) => a.at - b.at).slice(-10);
    const want = new Map();
    for (let i = 1; i < hot.length; i++) want.set(hot[i - 1].id + '|' + hot[i].id, [hot[i - 1], hot[i]]);
    // A used file that also has a git change (the data links the two by
    // their path) links up with that change too: a sector from FILES to GIT.
    const hotIds = new Set(hot.map(n => n.id));
    for (const e of edges.values()) {
      if (!e.link || e.dying || e.rel !== 'same' || !e.a.startsWith('change:') || !hotIds.has(e.b)) continue;
      const file = nodes.get(e.b), change = nodes.get(e.a);
      if (file && change && places.has(change.id)) want.set(file.id + '|' + change.id, [change, file]);
    }
    for (const [key, [a, b]] of want) {
      let l = links.get(key);
      if (!l) {
        l = { a: a.id, b: b.id, ea: { id: a.id }, eb: { id: b.id }, ga: 0, gb: 0, c: 0, q: 0 };
        l.span = spanOf(a.id, b.id); l.lane = l.span ? laneFor(l.span) : 0;
        links.set(key, l);
      }
      l.dir = 1;
      l.color = OP[b.op] || '#ffffff';
    }
    const step = (v, s, up) => Math.max(0, Math.min(1, v + (up ? 1 : -1) * dt / s));
    for (const [key, l] of links) {
      if (l.event) { if (performance.now() > l.until) l.dir = -1; }
      else if (!want.has(key)) l.dir = -1;
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
    if (pulses.length || ta) return true;
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
    // Trans-Am: the cyan parts turn pink-red, and a plum fill covers the circle.
    const tk = taLevel(now), cyan = mixHex(CYAN, TA_COLOR, tk);
    if (tk > 0) {
      ctx.fillStyle = rgba(TA_FILL, 0.35 * tk);
      ctx.beginPath(); ctx.arc(cx, cy, Rp * 1.02, 0, 6.2832); ctx.fill();
      ctx.lineWidth = Math.max(4, Rp * 0.03);
      ctx.strokeStyle = rgba(TA_COLOR, 0.22 * tk);
      ctx.beginPath(); ctx.arc(cx, cy, Rp * 1.035, 0, 6.2832); ctx.stroke();
      // A faint globe grid inside the circle, tilted about 20 degrees: four
      // meridians whose widths change as the globe turns, and three
      // latitude lines.
      const turn = (now - ta.start) / 1000 * 0.5, tilt = -0.35;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(TA_COLOR, 0.2 * tk);
      for (let i = 0; i < 4; i++) {
        const rx = Rp * 0.98 * Math.abs(Math.sin(turn + i * Math.PI / 4));
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Rp * 0.98, tilt, 0, 6.2832); ctx.stroke();
      }
      for (const lat of [-0.5, 0, 0.5]) {
        const w = Rp * 0.98 * Math.cos(Math.asin(lat)), y = Rp * 0.98 * lat;
        ctx.beginPath();
        ctx.ellipse(cx - Math.sin(tilt) * y, cy + Math.cos(tilt) * y, w, w * 0.16, tilt, 0, 6.2832);
        ctx.stroke();
      }
      // Two thick bracket arcs on opposite sides, just outside the bands,
      // each in three parts with small notches between them. They turn
      // slowly while the mode lasts.
      const br = Rp * 1.15, bw = Math.max(5, Rp * 0.045), base = -2.35 + (now - ta.start) / 1000 * 0.12;
      ctx.lineWidth = bw;
      ctx.strokeStyle = rgba(TA_LIGHT, 0.6 * tk);
      for (const side of [0, Math.PI]) {
        for (const [a0, a1] of [[0, 0.55], [0.6, 0.95], [1.0, 1.25]]) {
          ctx.beginPath(); ctx.arc(cx, cy, br, base + side + a0, base + side + a1); ctx.stroke();
        }
      }
      // A thin inner line along each bracket.
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(TA_LIGHT, 0.5 * tk);
      for (const side of [0, Math.PI]) {
        ctx.beginPath(); ctx.arc(cx, cy, br - bw * 0.9, base + side - 0.05, base + side + 1.3); ctx.stroke();
      }
    }
    // The inner levels: one faint dashed ring each, in one color.
    let deepest = 1;
    for (const sg of segments) deepest = Math.max(deepest, sg.depth);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = rgba(cyan, 0.1);
    for (let d = 2; d <= Math.min(deepest, 7); d++) {
      ctx.beginPath(); ctx.arc(cx, cy, Rp * RING(d), 0, 6.2832); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Ticks inside the edge: 180 of them, longer at each 5th and each 15th.
    // They turn with the circle.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(cyan, 0.22);
    ctx.beginPath();
    for (let i = 0; i < 180; i++) {
      const a = spin + i * 6.2832 / 180, long = i % 15 === 0 ? 0.04 : i % 5 === 0 ? 0.022 : 0.012;
      ctx.moveTo(cx + Math.cos(a) * Rp * 0.985, cy + Math.sin(a) * Rp * 0.985);
      ctx.lineTo(cx + Math.cos(a) * Rp * (0.985 - long), cy + Math.sin(a) * Rp * (0.985 - long));
    }
    ctx.stroke();
    // Outer rings: dashes with one gap in each six.
    ctx.strokeStyle = rgba(cyan, 0.18);
    for (const ring of rings) {
      const rr = Rp * ring.r;
      if (!calm) ring.a = (ring.a + dt * ring.px * (1 + 2 * tk) / rr) % 6.2832;
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
      // An end is a node, or (for a gone git item) a fixed place on the
      // circle that turns with it.
      const endOf = e => {
        if (!e.id) return { t: e.angle + spin, r: Rp * RING(e.depth) };
        const n = nodes.get(e.id);
        return n && { t: Math.atan2(n.sy - cy, n.sx - cx), r: Math.hypot(n.sx - cx, n.sy - cy) };
      };
      const pa = endOf(l.ea), pb = endOf(l.eb);
      if (!pa || !pb) { links.delete(key); continue; }
      const ta = pa.t, ra = pa.r, tb = pb.t, rb = pb.r;
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
        spoke(tb, rb, l.gb);
        ctx.stroke();
        continue;
      }
      // The sector: the shorter way around from A to B.
      // The outer arc moves between the center and the top of the lane, and
      // the inner arc between the center and the bottom of the lane.
      const top = Rp * (LANE_TOP - (l.lane || 0) * LANE_W);
      const ro = top * ease(l.c), ri = (top - Rp * LANE_W * LANE_FILL) * ease(l.q);
      const sweep = ((tb - ta + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const back = sweep < 0;
      ctx.fillStyle = rgba(l.color, 0.14);
      // While the outer arc moves, a line runs from each item down to it, so
      // the lines from the center turn into the sector without a jump. The
      // lines fade out as the outer arc reaches its lane: at rest a sector
      // shows only its own shape.
      if (l.c < 1) {
        ctx.strokeStyle = rgba(l.color, 0.75 * (1 - ease(l.c)));
        ctx.beginPath();
        for (const [t, r] of [[ta, ra], [tb, rb]]) if (r > ro) {
          ctx.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
          ctx.lineTo(cx + Math.cos(t) * ro, cy + Math.sin(t) * ro);
        }
        ctx.stroke();
        ctx.strokeStyle = rgba(l.color, 0.75);
      }
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
      // Trans-Am afterimages: pink-red copies just behind the marker, along the
      // turn of the circle.
      if (tk > 0.05 && !calm) {
        const dx = n.sx - cx, dy = n.sy - cy;
        for (let i = 1; i <= 3; i++) {
          const a = -0.018 * i * tk, ca = Math.cos(a), sa = Math.sin(a);
          ctx.fillStyle = rgba(TA_COLOR, 0.28 * tk * (1 - i / 4));
          ctx.fillRect(cx + dx * ca - dy * sa - r, cy + dx * sa + dy * ca - r, 2 * r, 2 * r);
        }
      }
      ctx.fillStyle = rgba(n.color, n.dim ? 0.45 : 0.9);
      ctx.beginPath();
      // An item with children is a diamond; a leaf is a square.
      if (n.kind === 'group' || (n.type === 'file' && n.data && n.data.kind === 'dir')) {
        const d = r * 1.3;
        ctx.moveTo(n.sx, n.sy - d); ctx.lineTo(n.sx + d, n.sy); ctx.lineTo(n.sx, n.sy + d); ctx.lineTo(n.sx - d, n.sy); ctx.closePath();
      } else ctx.rect(n.sx - r, n.sy - r, 2 * r, 2 * r);
      ctx.fill();
    }
    // Pulses: a ring that spreads from a new commit and fades.
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i], n = nodes.get(pl.id), k = (now - pl.born) / PULSE_MS;
      if (k >= 1 || !n) { pulses.splice(i, 1); continue; }
      ctx.strokeStyle = rgba(pl.color || '#f2c230', 0.8 * (1 - k));
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, 4 + 26 * ease(k), 0, 6.2832); ctx.stroke();
    }
    // Trans-Am: the command name in heavy capitals in the center, with a
    // dark plum shadow offset behind it, and two small lines under it, as on
    // the Trans-Am screen of the game.
    if (tk > 0) {
      const size = Math.max(16, Math.min(64, Rp * 0.17)), off = Math.max(2, size * 0.07);
      // A (re)start: the name grows by a quarter and settles in 0.4 s, and a
      // ring spreads from the center over 0.7 s.
      const since = now - ta.pop, grow = 1 + 0.25 * (1 - ease(Math.min(1, since / 400)));
      const name = ta.name.toUpperCase() + (ta.count > 1 ? ' \u00d7' + ta.count : '');
      if (since < 700) {
        const k = ease(since / 700);
        ctx.strokeStyle = rgba(TA_COLOR, 0.8 * (1 - k) * tk);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, Rp * k, 0, 6.2832); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // A long name shrinks so that it stays inside 85 % of the circle.
      ctx.font = '900 ' + Math.round(size) + 'px ' + TA_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * 0.04) + 'px';
      const fit = Math.min(1, Rp * 1.7 / Math.max(1, ctx.measureText(name).width));
      ctx.font = '900 ' + Math.round(size * fit * grow) + 'px ' + TA_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * fit * grow * 0.04) + 'px';
      ctx.fillStyle = rgba(TA_SHADOW, 0.9 * tk);
      ctx.fillText(name, cx + off, cy - size * 0.25 + off);
      ctx.fillStyle = rgba(TA_COLOR, 0.95 * tk);
      ctx.fillText(name, cx, cy - size * 0.25);
      const small = Math.max(9, size * 0.3);
      ctx.font = '900 ' + small + 'px ' + TA_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(small * 0.15) + 'px';
      // SYSTEM, then three terms about the command: from the data for a
      // skill or plugin command, from BUILTIN_TERMS for a built-in one.
      const sk = nodes.get('skill:' + ta.name), data = sk && sk.data;
      const terms = (data && data.terms) || BUILTIN_TERMS[ta.name] || ['CLAUDE', 'CODE', 'COMMAND'];
      ctx.fillStyle = rgba('#ffffff', 0.92 * tk);
      ctx.fillText('SYSTEM', cx, cy + size * 0.5);
      // The Digicode letters are 35 % larger than SYSTEM, and a long line
      // shrinks to stay inside 85 % of the circle. The font has one thin
      // weight, so a stroke of the same color makes the lines as thick as
      // the lines of SYSTEM.
      const line = terms.join('  ');
      let tsz = small * 1.35;
      ctx.font = '900 ' + tsz + 'px ' + TA_TERMS_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(tsz * 0.3) + 'px';
      tsz *= Math.min(1, Rp * 1.7 / Math.max(1, ctx.measureText(line).width));
      ctx.font = '900 ' + tsz + 'px ' + TA_TERMS_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(tsz * 0.3) + 'px';
      const ty = cy + size * 0.5 + small * 0.6 + tsz * 0.75;
      ctx.fillStyle = ctx.strokeStyle = rgba(TA_TERMS, 0.95 * tk);
      ctx.lineWidth = tsz * 0.07;
      ctx.lineJoin = 'miter';
      ctx.fillText(line, cx, ty);
      ctx.strokeText(line, cx, ty);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
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
