import type { Snapshot } from '../types'

import { HIVE } from './themes/hive'
import { MOLD } from './themes/mold'
import { ORBIT } from './themes/orbit'

// The page loads data.js again every pollMs with a script tag, so it works
// from file:// with no server. data.js calls window.armoryData(payload).
//
// One page per theme. The shared engine holds the data, the 3D camera, the
// pointer, auto-rotate, focus, glow and growth; a theme adds its own layout
// (simulate), its own drawing (draw) and two flags:
//   BUNDLE     split more than six children into bundles on joints
//   NODE_DRAG  a drag on a node moves it (else the drag turns the view)
//   AUTO_TURN  the view turns slowly at rest
export type Theme = { name: string; legend: string; script: string }

export const THEMES: Record<string, Theme> = { mold: MOLD, orbit: ORBIT, hive: HIVE }
export const DEFAULT_THEME = 'mold'

export const pageOf = (name: string) => {
  const theme = THEMES[name] ?? MOLD

  return HEAD + `
  <span>${theme.legend}</span>
  <span id="errors"></span>
</footer>
<script>
  const THEME = '${theme.name}';
` + SHARED_A + theme.script + SHARED_B + `
</script>
</body>
</html>
`
}

const HEAD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Armory</title>
<style>
  :root {
    --bg: #292c33; --text: #e8ecd8; --dim: #8b927c; --faint: #6a7062; --card: rgba(33, 36, 42, .92);
    --edge: #2c3226; --mold: #d8e85a; --amber: #f5b94a; --blue: #7aa2ff; --red: #ff6b6b;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--text); overflow: hidden;
    font: 12px/1.45 ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }
  header { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: baseline; gap: 14px;
    padding: 14px 16px 0; flex-wrap: wrap; pointer-events: none; z-index: 2; }
  h1 { margin: 0; font-size: 15px; letter-spacing: .2em; color: var(--mold); font-weight: 600; }
  .stat { color: var(--dim); } .stat b { color: var(--text); font-weight: 600; }
  #focus { color: var(--mold); }
  #pulse { margin-left: auto; color: var(--faint); font: 11px ui-monospace, monospace; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: move; }
  #tip { position: fixed; z-index: 3; max-width: 260px; padding: 8px 10px; border-radius: 8px;
    background: var(--card); border: 1px solid var(--edge); pointer-events: none; display: none;
    backdrop-filter: blur(4px); }
  #tip .k { color: var(--dim); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  #tip .n { font-weight: 600; margin: 2px 0; overflow-wrap: anywhere; }
  #tip .d { color: var(--dim); overflow-wrap: anywhere; }
  footer { position: fixed; left: 16px; right: 16px; bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap;
    color: var(--faint); font-size: 11px; pointer-events: none; z-index: 2; }
  footer i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
  #errors { color: var(--red); }
</style>
</head>
<body>
<canvas id="net"></canvas>
<header>
  <h1>ARMORY</h1>
  <span class="stat" id="stats"></span>
  <span class="stat" id="focus"></span>
  <span id="pulse">waiting for data…</span>
</header>
<div id="tip"></div>
<footer>
  <span><i style="background:#d8e85a"></i>skills</span>
  <span><i style="background:#f5b94a"></i>jobs</span>
  <span><i style="background:#7aa2ff"></i>memory</span>
  <span><i style="background:#e8ecd8"></i>files</span>
  <span><i style="background:#7fd8ff"></i>read</span>
  <span><i style="background:#ff9a4d"></i>write</span>
  <span><i style="background:#5fd38d"></i>new</span>`

const SHARED_A = `
  const MODEL = { opus: '#b48cff', sonnet: '#5ab0ff', haiku: '#5fd38d', fable: '#ff9a4d' };
  const STATE = { running: '#f5b94a', working: '#f5b94a', blocked: '#ff6b6b', done: '#5fd38d', failed: '#ff6b6b' };
  const GROUP = { project: '#7aa2ff', feedback: '#f08bb4', user: '#5fd38d', reference: '#4fd6c8' };
  const HUB = { skills: '#d8e85a', jobs: '#f5b94a', memory: '#7aa2ff', files: '#e8ecd8' };
  const OP = { read: '#7fd8ff', write: '#ff9a4d', new: '#5fd38d' };
  const GLOW_MS = 30000;
  const MASS = { hub: 4, group: 2, joint: 1.5, leaf: 1 };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const modelColor = m => Object.entries(MODEL).find(([k]) => m.toLowerCase().includes(k))?.[1];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A stable number in [0, 1) for a string, so curves and phases do not jump.
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return ((h >>> 0) % 100000) / 100000;
  }
  function rgba(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return 'rgba(' + (v >> 16) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  }

  const canvas = document.getElementById('net');
  const ctx = canvas.getContext('2d');
  const tip = document.getElementById('tip');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  addEventListener('resize', resize);
  resize();

  // Graph state. Nodes and edges keep their place between data updates; only
  // a change in the set of nodes or edges heats the simulation again.
  const nodes = new Map(), edges = new Map();
  let alpha = 1, gen = 0, firstLoad = true;
  // Focus: after an event, the camera goes to the colony where it happened.
  let focus, fresh = [], lastFileAt = 0;
  const jobStates = new Map();
  const FOCUS_MS = 6000, HANDS_OFF_MS = 8000;
  const cam = { x: 0, y: 0, z: 0, s: 1, r: 300 };

  function node(id, props, parent, delay) {
    let n = nodes.get(id);
    if (!n) {
      const p = nodes.get(parent);
      const a = hash(id) * 6.2832;
      const z = (hash(id + '^') - 0.5) * 120;
      n = { id, x: (p ? p.x : 0) + Math.cos(a) * 24, y: (p ? p.y : 0) + Math.sin(a) * 24, z: (p ? p.z : 0) + z,
        vx: 0, vy: 0, vz: 0,
        phase: hash(id + '~') * 6.2832, born: performance.now() + delay, colony: p ? p.colony || p.id : id };
      nodes.set(id, n);
      alpha = Math.max(alpha, 0.8);
      if (!firstLoad) fresh.push(n);
    }
    Object.assign(n, props);
    n.seen = gen;
    n.dying = 0;
    return n;
  }
  function edge(a, b, props, delay) {
    const key = a + '>' + b;
    let e = edges.get(key);
    if (!e) {
      e = { key, a, b, bend: (hash(key) - 0.5) * 0.7, born: performance.now() + delay };
      edges.set(key, e);
      alpha = Math.max(alpha, 0.8);
    }
    Object.assign(e, props);
    e.seen = gen;
    e.dying = 0;
  }

  // Links a parent to its items. More than six items split into bundles of
  // about five, each on its own joint, so a thick trunk forks into thin veins
  // the way a mold network does. A trunk is as wide as its veins together.
  function branch(parent, color, items, delay, step) {
    const bundles = BUNDLE && items.length > 6 ? Math.ceil(items.length / 5) : 1;
    const size = Math.ceil(items.length / bundles);
    for (let c = 0; c < bundles; c++) {
      const part = items.slice(c * size, (c + 1) * size);
      let via = parent;
      if (bundles > 1) {
        via = parent + '/joint' + c;
        const w = Math.sqrt(part.reduce((sum, it) => sum + it.w * it.w, 0));
        node(via, { kind: 'joint', label: '', color, r: 1 + w * 0.25 }, parent, step * (delay + 150 + c * 70));
        edge(parent, via, { w, rest: 48, k: 0.08 }, step * (delay + c * 70));
      }
      part.forEach((it, i) => {
        node(it.id, Object.assign({ kind: 'leaf' }, it.props), via, step * (delay + 450 + c * 70 + i * 30));
        edge(via, it.id, { w: it.w, rest: it.rest, k: 0.09 }, step * (delay + 300 + c * 70 + i * 30));
      });
    }
  }

  // The FILES colony: one node per path segment, so a used file deep in a
  // tree pulls its folders out with it. Each node keeps the latest use of any
  // file below it (at, op), which lights the whole branch.
  function buildFiles(rows, step) {
    const info = new Map();
    const kids = new Map();
    const parentOf = key => {
      const cut = key.lastIndexOf('/');
      return cut > 0 ? key.slice(0, cut) : cut === 0 && key !== '/' ? '/' : '';
    };
    const ensure = (key, kind) => {
      let it = info.get(key);
      if (!it) {
        it = { key, kind, at: 0, op: '', count: 0, size: 0 };
        info.set(key, it);
        const up = parentOf(key);
        if (up) ensure(up, 'dir');
        const list = kids.get(up) || [];
        list.push(it);
        kids.set(up, list);
      }
      return it;
    };
    for (const row of rows) {
      const it = ensure(row.path, row.kind);
      it.kind = row.kind;
      it.size = row.size || 0;
      if (row.at > it.at) { it.at = row.at; it.op = row.op; }
    }
    // A folder's size is the total of the files shown below it.
    for (const it of info.values()) {
      if (it.kind !== 'file' || !it.size) continue;
      for (let up = parentOf(it.key); up; up = parentOf(up)) info.get(up).size += it.size;
    }
    // Lift each use up to every folder above it.
    for (const it of info.values()) {
      if (!it.at) continue;
      for (let up = parentOf(it.key); up; up = parentOf(up)) {
        const dir = info.get(up);
        dir.count++;
        if (it.at > dir.at) { dir.at = it.at; dir.op = it.op; }
      }
    }
    const spec = it => {
      const name = it.key === '/' ? '/' : it.key.slice(it.key.lastIndexOf('/') + 1);
      const open = (kids.get(it.key) || []).length > 0;
      const used = it.at > 0;
      return {
        id: 'file:' + it.key,
        w: it.kind === 'dir' ? Math.min(3, 0.8 + 0.5 * Math.sqrt(it.count)) : used ? 1.2 : 0.7,
        rest: it.kind === 'dir' && open ? 34 : 22,
        props: { type: 'file', data: it, label: name, color: HUB.files, at: it.at, op: it.op,
          r: it.kind === 'dir' ? (open ? 3.6 : 2.4) : used ? 3.2 : 2.2,
          dim: !used && !open, showLabel: used || open },
      };
    };
    const walk = (parent, key, depth) => {
      const list = (kids.get(key) || []).slice().sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
      if (list.length === 0) return;
      branch(parent, HUB.files, list.map(spec), 150 + depth * 200, step);
      for (const it of list) walk('file:' + it.key, it.key, depth + 1);
    };
    walk('hub:files', '', 0);
  }

  // Picks the event to focus on from what changed since the last snapshot:
  // a job that started or changed state, then a file a tool used, then a
  // node that grew in, then one that is shrinking out (its parent).
  function noticeEvents(s, now) {
    let target, why;
    for (const j of s.jobs) {
      if (jobStates.get(j.id) !== j.state && !target) { target = 'job:' + j.id; why = 'jobs · ' + j.name + ' ' + j.state; }
      jobStates.set(j.id, j.state);
    }
    const newest = (s.files || []).reduce((best, f) => f.at > (best ? best.at : 0) ? f : best, undefined);
    if (newest && newest.at > lastFileAt) {
      lastFileAt = newest.at;
      if (!target) { target = 'file:' + newest.path; why = 'files · ' + newest.path.slice(newest.path.lastIndexOf('/') + 1) + ' ' + newest.op; }
    }
    const grown = fresh.find(n => n.kind !== 'joint' && n.kind !== 'hub');
    if (!target && grown) { target = grown.id; why = 'grew · ' + grown.label; }
    if (!target) {
      const gone = [...nodes.values()].find(n => n.dying === now && n.kind === 'leaf');
      const up = gone && [...edges.values()].find(e => e.b === gone.id);
      if (up) { target = up.a; why = 'removed · ' + gone.label; }
    }
    if (!target || performance.now() - view.idle < HANDS_OFF_MS) return;
    focus = { id: target, why, until: performance.now() + FOCUS_MS };
  }

  // How much a node glows: full when a tool used it, gone after GLOW_MS.
  const heatOf = n => n.at ? Math.pow(Math.max(0, 1 - (Date.now() - n.at) / GLOW_MS), 2) : 0;

  function build(s) {
    gen++;
    fresh = [];
    const step = firstLoad ? 1 : 0;
    const maxUse = Math.max(1, ...s.skills.map(k => k.uses));
    const active = s.jobs.filter(j => j.state !== 'done').length;

    node('hub:skills', { kind: 'hub', label: 'SKILLS ' + s.skills.length, color: HUB.skills, r: 9 }, '', 0);
    node('hub:jobs', { kind: 'hub', label: 'JOBS ' + active + '/' + s.jobs.length, color: HUB.jobs, r: 9 }, '', 0);
    node('hub:memory', { kind: 'hub', label: 'MEMORY ' + s.memory.length, color: HUB.memory, r: 9 }, '', 0);
    edge('hub:skills', 'hub:memory', { w: 3.2, rest: 400, k: 0 }, 0);
    edge('hub:memory', 'hub:jobs', { w: 2.6, rest: 400, k: 0 }, 0);
    edge('hub:jobs', 'hub:skills', { w: 2.6, rest: 400, k: 0 }, 0);
    const used = (s.files || []).filter(f => f.at > 0).length;
    node('hub:files', { kind: 'hub', label: 'FILES ' + used, color: HUB.files, r: 9 }, '', 0);
    edge('hub:skills', 'hub:files', { w: 2, rest: 400, k: 0 }, 0);
    edge('hub:memory', 'hub:files', { w: 2, rest: 400, k: 0 }, 0);
    edge('hub:jobs', 'hub:files', { w: 2, rest: 400, k: 0 }, 0);

    s.skills.forEach(k => {
      const f = Math.sqrt(k.uses / maxUse);
      k.f = f;
    });
    branch('hub:skills', HUB.skills, s.skills.map(k => ({
      id: 'skill:' + k.name, w: 0.6 + 3.6 * k.f, rest: 26 + 20 * (1 - k.f),
      props: { type: 'skill', data: k, label: k.name, color: modelColor(k.model) || HUB.skills,
        r: 2.4 + 5 * k.f, dim: k.uses === 0, showLabel: k.uses > 0 },
    })), 150, step);

    branch('hub:jobs', HUB.jobs, s.jobs.map(j => {
      const live = j.state === 'running' || j.state === 'working';
      return { id: 'job:' + j.id, w: live ? 2.6 : 1.2, rest: 40,
        props: { type: 'job', data: j, label: j.name, color: STATE[j.state] || '#8b927c', r: live ? 6 : 4.5,
          live, dim: j.state === 'done', showLabel: true } };
    }), 150, step);

    const groups = [...new Set(s.memory.map(m => m.group))];
    groups.forEach((g, i) => {
      const items = s.memory.filter(m => m.group === g);
      const color = GROUP[g] || '#8b927c';
      node('group:' + g, { kind: 'group', label: g + ' ' + items.length, color, r: 5.5 },
        'hub:memory', step * (250 + i * 60));
      edge('hub:memory', 'group:' + g, { w: 1.4 + Math.min(2.4, items.length / 6), rest: 70, k: 0.08 }, step * (100 + i * 60));
      branch('group:' + g, color, items.map(m => {
        const deg = m.in + m.out;
        return { id: 'mem:' + m.slug, w: 0.7 + Math.min(1.6, 0.4 * m.in), rest: 24,
          props: { type: 'memory', data: m, label: m.title, color,
            r: 2.6 + Math.min(4.5, 1.3 * Math.sqrt(deg)), dim: deg === 0, showLabel: deg > 1 } };
      }), 450 + i * 60, step);
    });
    const bySlug = new Map(s.memory.map(m => [m.slug, m]));
    s.memory.forEach((m, i) => {
      for (const l of m.links || []) {
        if (l === m.slug || !bySlug.has(l)) continue;
        edge('mem:' + m.slug, 'mem:' + l, { w: 1, rest: 80, k: 0.025, link: true }, step * (1200 + i * 18));
      }
    });

    buildFiles(s.files || [], step);

    // Gone nodes and edges shrink out before they are removed (see purge).
    const now = performance.now();
    for (const n of nodes.values()) if (n.seen !== gen && !n.dying) { n.dying = now; alpha = Math.max(alpha, 0.3); }
    for (const e of edges.values()) if (e.seen !== gen && !e.dying) e.dying = now;
    if (!firstLoad) noticeEvents(s, now);
    else {
      lastFileAt = Math.max(0, ...(s.files || []).map(f => f.at));
      for (const j of s.jobs) jobStates.set(j.id, j.state);
    }
    firstLoad = false;
  }

`

const SHARED_B = `
  // The view turns the network by yaw and pitch, then projects it with a
  // little perspective. The camera fits a sphere around the nodes, so the
  // zoom stays the same while the network turns.
  const view = { yaw: 0.3, pitch: 0.2, vyaw: 0, vpitch: 0, zoom: 1, idle: 0, auto: 0 };
  const DIST = 1600, TOP = 56, BOTTOM = 44, SIDE = 24;
  // With a focus, only the colony of the focus counts, and the center moves
  // halfway to the node itself. The camera eases there and back.
  function fit() {
    if (drag || nodes.size === 0) return;
    const now = performance.now();
    if (focus && (now > focus.until || !nodes.has(focus.id))) focus = undefined;
    const label = document.getElementById('focus');
    const text = focus ? '◎ ' + focus.why : '';
    if (label.textContent !== text) label.textContent = text;
    const target = focus && nodes.get(focus.id);
    const colony = target && (target.kind === 'hub' ? target.id : target.colony);
    const list = [...nodes.values()].filter(n => !n.dying && (!colony || n.id === colony || n.colony === colony));
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const n of list) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); z0 = Math.min(z0, n.z);
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); z1 = Math.max(z1, n.z);
    }
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r = 1;
    for (const n of list) r = Math.max(r, Math.hypot(n.x - cx, n.y - cy, n.z - cz) + n.r);
    if (target) {
      cx = (cx + target.x) / 2; cy = (cy + target.y) / 2; cz = (cz + target.z) / 2;
      r = Math.max(150, r);
    }
    const s = Math.min((W - 2 * SIDE) / (2 * r), (H - TOP - BOTTOM) / (2 * r), 2.4) * 1.12 * (DIST - r) / DIST;
    const k = target ? 0.05 : 0.04;
    cam.s += (s - cam.s) * k; cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k;
    cam.z += (cz - cam.z) * k; cam.r += (r - cam.r) * k;
  }
  function project(n) {
    const x = n.x - cam.x, y = n.y - cam.y, z = n.z - cam.z;
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = DIST / (DIST - z2) * cam.s * view.zoom;
    n.sx = W / 2 + x1 * f; n.sy = (H + TOP - BOTTOM) / 2 + y2 * f; n.sf = f; n.depth = z2;
    // Far nodes are darker, near nodes are at full strength.
    n.fog = 0.45 + 0.55 * Math.max(0, Math.min(1, (z2 + cam.r) / (2 * cam.r || 1)));
  }
  // The inverse of project at a fixed depth: the world point under the pointer.
  function unproject(px, py, depth) {
    const f = DIST / (DIST - depth) * cam.s * view.zoom;
    const x1 = (px - W / 2) / f, y2 = (py - (H + TOP - BOTTOM) / 2) / f;
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const y = y2 * cp + depth * sp, z1 = -y2 * sp + depth * cp;
    return { x: x1 * cy - z1 * sy + cam.x, y: y + cam.y, z: x1 * sy + z1 * cy + cam.z };
  }

  let hover, drag, turn;
  const grown = (born, now, ms) => Math.max(0, Math.min(1, (now - born) / ms));
  const ease = t => 1 - Math.pow(1 - t, 3);

  // Pointer: hover shows details, drag on a node moves it, drag on the
  // background turns the network. A turn keeps some spin after release.
  function pick(px, py) {
    let best;
    for (const n of nodes.values()) {
      if (n.kind === 'joint' || n.dying || n.sx === undefined) continue;
      const d = Math.hypot(n.sx - px, n.sy - py);
      if (d < n.r * n.sf + 9 && (!best || n.depth > best.depth)) best = n;
    }
    return best;
  }
  function describe(n) {
    const d = n.data;
    if (n.kind === 'hub') return '<div class="k">hub</div><div class="n">' + esc(n.label) + '</div>';
    if (n.kind === 'group') return '<div class="k">memory group</div><div class="n">' + esc(n.label) + '</div>';
    if (n.type === 'skill') return '<div class="k">skill · ' + esc(d.source) + '</div><div class="n">/' + esc(d.name) +
      '</div><div class="d">' + d.uses + ' uses' + (d.model !== '-' ? ' · model ' + esc(d.model) : '') + '</div>';
    if (n.type === 'file') {
      const age = d.at ? Math.round((Date.now() - d.at) / 1000) : 0;
      return '<div class="k">' + (d.kind === 'dir' ? 'folder' : 'file') + (d.op ? ' · ' + esc(d.op) : '') + '</div><div class="n">' +
        esc(d.key) + '</div>' + (d.at ? '<div class="d">' + (d.kind === 'dir' ? 'last use below it ' : 'used ') + age + ' s ago</div>' : '');
    }
    if (n.type === 'job') return '<div class="k">job · ' + esc(d.state) + '</div><div class="n">' + esc(d.name) +
      '</div>' + (d.detail ? '<div class="d">' + esc(d.detail) + '</div>' : '');
    return '<div class="k">memory · ' + esc(d.group) + '</div><div class="n">' + esc(d.title) +
      '</div><div class="d">↓' + d.in + ' inbound · ↑' + d.out + ' outbound</div>';
  }
  const clampPitch = p => Math.max(-1.45, Math.min(1.45, p));
  const touch = () => { view.idle = performance.now(); view.auto = 0; };
  canvas.addEventListener('pointermove', ev => {
    if (drag || turn) touch();
    if (drag) {
      const p = unproject(ev.clientX, ev.clientY, drag.depth);
      drag.x = p.x; drag.y = p.y; drag.z = p.z;
      alpha = Math.max(alpha, 0.25);
      return;
    }
    if (turn) {
      const dx = ev.clientX - turn.x, dy = ev.clientY - turn.y;
      turn.x = ev.clientX; turn.y = ev.clientY;
      view.vyaw = dx * 0.008; view.vpitch = -dy * 0.008;
      view.yaw += view.vyaw; view.pitch = clampPitch(view.pitch + view.vpitch);
      return;
    }
    hover = pick(ev.clientX, ev.clientY);
    canvas.style.cursor = hover ? 'grab' : 'move';
    if (!hover) { tip.style.display = 'none'; return; }
    tip.innerHTML = describe(hover);
    tip.style.display = 'block';
    const left = Math.min(ev.clientX + 14, W - tip.offsetWidth - 8);
    const top = ev.clientY + 14 + tip.offsetHeight > H ? ev.clientY - tip.offsetHeight - 10 : ev.clientY + 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = top + 'px';
  });
  canvas.addEventListener('pointerdown', ev => {
    touch();
    canvas.setPointerCapture(ev.pointerId);
    tip.style.display = 'none';
    drag = NODE_DRAG ? pick(ev.clientX, ev.clientY) : undefined;
    if (drag) { canvas.style.cursor = 'grabbing'; return; }
    turn = { x: ev.clientX, y: ev.clientY };
    view.vyaw = view.vpitch = 0;
  });
  canvas.addEventListener('pointerup', () => {
    drag = undefined; turn = undefined;
    if (calm) view.vyaw = view.vpitch = 0;
    canvas.style.cursor = hover ? 'grab' : 'move';
  });
  // A pinch arrives as a wheel event with ctrlKey; a two-finger scroll as a
  // plain wheel event. Both zoom around the center of the pane.
  addEventListener('wheel', ev => {
    ev.preventDefault();
    touch();
    view.zoom = Math.max(0.4, Math.min(4, view.zoom * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.002))));
  }, { passive: false });
  canvas.addEventListener('pointerleave', () => { if (!drag && !turn) { hover = undefined; tip.style.display = 'none'; } });

  // The frame rate drops when nothing moves, as each frame the terminal
  // shows costs a full repaint of the pane.
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const spin = Math.abs(view.vyaw) + Math.abs(view.vpitch) > 0.0005;
    // After 4 s with no input, the network turns slowly; the speed eases in.
    // It stops while the pointer is on a node, so the tooltip stays put.
    const idle = !calm && !drag && !turn && !spin && !hover && now - view.idle > 4000;
    view.auto = idle ? Math.min(1, view.auto + 0.02) : 0;
    const busy = alpha > 0.004 || drag || turn || spin || focus || view.auto > 0 || now - lastData < 1500;
    if (now - last < (busy ? 33 : calm ? 1000 : 66)) return;
    last = now;
    if (view.auto > 0) {
      if (AUTO_TURN) view.yaw += 0.0035 * view.auto;
      // The zoom goes slowly back to the size that fits the pane.
      view.zoom += (1 - view.zoom) * 0.012 * view.auto;
    }
    if (!turn && spin) {
      view.yaw += view.vyaw; view.pitch = clampPitch(view.pitch + view.vpitch);
      view.vyaw *= 0.93; view.vpitch *= 0.93;
    }
    simulate();
    fit();
    draw(now);
    purge(now);
  }
  function purge(now) {
    for (const [id, n] of nodes) if (n.dying && now - n.dying > 600) nodes.delete(id);
    for (const [key, e] of edges) {
      if ((e.dying && now - e.dying > 600) || !nodes.has(e.a) || !nodes.has(e.b)) edges.delete(key);
    }
  }

  let pollMs = 1000, lastSeq = -1, frames = 0, windowStart = performance.now(), lastData = 0;
  window.armoryData = d => {
    // A theme change rewrites index.html; the old page reloads to show it.
    if (d.theme && d.theme !== THEME) { location.reload(); return; }
    if (d.seq === lastSeq) return;
    lastSeq = d.seq; pollMs = d.pollMs || 1000; frames++;
    const s = d.snapshot;
    const active = s.jobs.filter(j => j.state !== 'done').length;
    const slugs = new Set(s.memory.map(m => m.slug));
    const links = s.memory.reduce((sum, m) => sum + (m.links || []).filter(l => slugs.has(l) && l !== m.slug).length, 0);
    document.getElementById('stats').innerHTML =
      '<b>' + s.skills.length + '</b> skills · <b>' + active + '/' + s.jobs.length + '</b> jobs · <b>' +
      s.memory.length + '</b> memories · <b>' + links + '</b> links · <b>' +
      (s.files || []).filter(f => f.at > 0).length + '</b> files';
    document.getElementById('errors').textContent = s.errors.join(' · ');
    build(s);
    lastData = performance.now();
  };

  function poll() {
    const tag = document.createElement('script');
    tag.src = 'data.js?t=' + Date.now();
    tag.onload = tag.onerror = () => tag.remove();
    document.head.appendChild(tag);
    setTimeout(poll, pollMs);
  }
  setInterval(() => {
    const now = performance.now();
    const rate = frames * 1000 / (now - windowStart); frames = 0; windowStart = now;
    document.getElementById('pulse').textContent = 'poll ' + pollMs + ' ms · ' + rate.toFixed(1) + ' updates/s';
  }, 1000);
  requestAnimationFrame(frame);
  poll();
`

export const dataScript = (snapshot: Snapshot, seq: number, pollMs: number, theme: string) =>
  `window.armoryData(${JSON.stringify({ seq, pollMs, theme, snapshot })})\n`
