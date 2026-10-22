// Shared by the race and caravan themes: the sad red horse, the steering
// that makes it glide, the hot file it swarms to, and its "deal with it"
// shades. Plain page code, put in front of each theme's own script.
export const HORSE_KIT = `
  // The sad red horse, after the plush the person chose: a red body, a white
  // muzzle with a frown, a blue eye, a brown mane, tail and hooves, and a
  // gold collar with a bell. Side view; dir < 0 faces left. run (0 to 1)
  // swings the legs. Small on screen, it keeps only its eye.
  function drawHorse(x, y, dir, t, fade, f, o) {
    o = o || {};
    const R = 6 * Math.max(1, f);
    const run = o.run || 0;
    const ph = t * (5 + 9 * run) + (o.seed || 0) * 9;
    const bob = Math.sin(ph * 2) * R * 0.07 * (0.3 + run);
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    // Tail.
    ctx.strokeStyle = '#7a4a2a';
    ctx.lineWidth = R * 0.3;
    ctx.beginPath(); ctx.moveTo(-R * 0.9, -R * 0.2);
    ctx.quadraticCurveTo(-R * 1.55, -R * 0.1 + Math.sin(ph) * R * 0.2, -R * 1.35, R * 0.5); ctx.stroke();
    // Legs, with brown hooves.
    for (const [lx, p0] of [[-0.6, 0], [-0.3, Math.PI], [0.35, Math.PI / 2], [0.65, Math.PI * 1.5]]) {
      ctx.save();
      ctx.translate(lx * R, R * 0.3);
      ctx.rotate(Math.sin(ph + p0) * 0.55 * run);
      ctx.fillStyle = '#c81f25'; ctx.fillRect(-R * 0.14, 0, R * 0.28, R * 0.6);
      ctx.fillStyle = '#6b3f22'; ctx.fillRect(-R * 0.17, R * 0.55, R * 0.34, R * 0.2);
      ctx.restore();
    }
    // Body and neck.
    ctx.fillStyle = '#d7262b';
    ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.58, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.moveTo(R * 0.4, -R * 0.3); ctx.lineTo(R * 0.85, -R * 1.05);
    ctx.lineTo(R * 1.3, -R * 0.8); ctx.lineTo(R * 0.85, -R * 0.02); ctx.closePath(); ctx.fill();
    // A load on the back: a crate, or a red envelope.
    if (o.carry === 'crate') {
      ctx.fillStyle = '#a8763e'; ctx.fillRect(-R * 0.55, -R * 1.0, R * 0.9, R * 0.5);
      ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = Math.max(0.6, R * 0.06);
      ctx.strokeRect(-R * 0.55, -R * 1.0, R * 0.9, R * 0.5);
    } else if (o.carry === 'envelope') {
      ctx.fillStyle = '#e8322e'; ctx.fillRect(-R * 0.45, -R * 1.05, R * 0.75, R * 0.5);
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(-R * 0.08, -R * 0.8, R * 0.11, 0, 6.2832); ctx.fill();
    }
    // Gold collar and bell.
    ctx.strokeStyle = '#e6b422'; ctx.lineWidth = R * 0.16;
    ctx.beginPath(); ctx.moveTo(R * 0.62, -R * 0.5); ctx.lineTo(R * 1.12, -R * 0.24); ctx.stroke();
    ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(R * 0.92, -R * 0.2, R * 0.13, 0, 6.2832); ctx.fill();
    // Head, ears, mane.
    const hx = R * 1.25, hy = -R * 1.2;
    ctx.fillStyle = '#d7262b';
    ctx.beginPath(); ctx.arc(hx, hy, R * 0.58, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx - R * 0.32, hy - R * 0.38); ctx.lineTo(hx - R * 0.2, hy - R * 0.9); ctx.lineTo(hx + R * 0.02, hy - R * 0.45); ctx.fill();
    ctx.fillStyle = '#f3e3e0';
    ctx.beginPath(); ctx.moveTo(hx - R * 0.26, hy - R * 0.45); ctx.lineTo(hx - R * 0.19, hy - R * 0.75); ctx.lineTo(hx - R * 0.07, hy - R * 0.47); ctx.fill();
    // Mane: a strip down the back of the neck and a small tuft on top.
    ctx.strokeStyle = '#7a4a2a';
    ctx.lineWidth = R * 0.22;
    ctx.beginPath(); ctx.moveTo(hx - R * 0.42, hy - R * 0.2); ctx.quadraticCurveTo(R * 0.55, -R * 0.75, R * 0.42, -R * 0.32); ctx.stroke();
    ctx.fillStyle = '#7a4a2a';
    ctx.beginPath(); ctx.ellipse(hx - R * 0.1, hy - R * 0.55, R * 0.2, R * 0.12, -0.5, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + R * 0.08, hy - R * 0.6, R * 0.16, R * 0.1, -0.2, 0, 6.2832); ctx.fill();
    // White muzzle with the frown.
    ctx.fillStyle = '#f3e9e4';
    ctx.beginPath(); ctx.ellipse(hx + R * 0.32, hy + R * 0.28, R * 0.32, R * 0.26, 0.2, 0, 6.2832); ctx.fill();
    // Eye: blue with a shine; a dot when small.
    const ex = hx + R * 0.02, ey = hy - R * 0.08;
    if (R >= 6.5) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex, ey, R * 0.17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#3f8fd9'; ctx.beginPath(); ctx.arc(ex + R * 0.03, ey, R * 0.12, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#1a2230'; ctx.beginPath(); ctx.arc(ex + R * 0.04, ey, R * 0.06, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + R * 0.07, ey - R * 0.05, R * 0.03, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#5a3418'; ctx.lineWidth = Math.max(0.7, R * 0.06);
      ctx.beginPath(); ctx.arc(hx + R * 0.34, hy + R * 0.42, R * 0.11, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = 'rgba(244,160,150,0.5)';
      ctx.beginPath(); ctx.ellipse(hx + R * 0.05, hy + R * 0.2, R * 0.12, R * 0.07, 0, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = '#1a2230'; ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.6, R * 0.1), 0, 6.2832); ctx.fill();
    }
    // Swarm shades, the "deal with it" meme: black pixels drop onto the eye.
    if (o.shades > 0) {
      const u = Math.max(0.6, R * 0.1);
      const ox = hx - 5 * u, oy = ey - 1.2 * u - (1 - o.shades) * R * 2;
      const px = (a, b, w = 1) => ctx.fillRect(ox + a * u, oy + b * u, w * u + 0.3, u + 0.3);
      ctx.globalAlpha = fade * o.shades;
      ctx.fillStyle = '#111111';
      px(0, 0, 10); px(2, 1, 4); px(7, 1, 3); px(3, 2, 2); px(7, 2, 2);
      ctx.fillStyle = '#ffffff'; px(3, 1); px(7, 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // The newest file use that still glows: where the horses swarm.
  const swarm = { on: false, target: undefined };
  function hotFile() {
    let hot, best = 0;
    for (const n of nodes.values()) {
      if (n.type !== 'file' || !n.data || n.data.kind !== 'file' || n.dying) continue;
      const h = heatOf(n);
      if (h > best) { best = h; hot = n; }
    }
    swarm.on = !!hot && best > 0.15 && !calm;
    if (swarm.on) swarm.target = hot.id;
    return swarm.on ? hot : undefined;
  }
  // A slot on a slow ring around the swarm's target.
  function swarmSlot(i, target, t) {
    const a = i * 2.39996 + t * 0.5, r = 14 + 5 * (i % 3);
    return { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r * 0.7, z: target.z + 4 };
  }

  // Steering, as the hive bees: a spring to the goal, drag, a top speed and
  // a sideways push that bends the path and fades near the end. A horse that
  // reached a goal it should follow (follow) locks on to it.
  const VMAX = 45;
  function steer(h, goal, dt, follow) {
    const dx = goal.x - h.x, dy = goal.y - h.y, dz = goal.z - h.z;
    const dist = Math.hypot(dx, dy, dz);
    const key = goal.key || '';
    if (h.goalKey !== key) { h.goalKey = key; h.start = Math.max(dist, 1); h.locked = false; }
    if (follow && (h.locked || dist < 1.5)) {
      h.locked = true;
      h.vx = (goal.x - h.x) / Math.max(dt, 0.001); h.vy = (goal.y - h.y) / Math.max(dt, 0.001); h.vz = 0;
      h.x = goal.x; h.y = goal.y; h.z = goal.z;
      return dist;
    }
    if (follow && dist < 10) {
      h.x += dx * 0.25; h.y += dy * 0.25; h.z += dz * 0.25;
      h.vx = dx * 0.25 / Math.max(dt, 0.001); h.vy = dy * 0.25 / Math.max(dt, 0.001);
      return dist;
    }
    const k = 1.1 * (0.7 + 0.6 * h.seed), drag = 1.5;
    const left = Math.min(1, dist / h.start);
    const side = (h.seed > 0.5 ? 1 : -1) * 30 * (0.6 + h.seed) * left * left;
    const nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0;
    h.vx += (dx * k - h.vx * drag + nx * side) * dt;
    h.vy += (dy * k - h.vy * drag + ny * side) * dt;
    h.vz += (dz * k - h.vz * drag) * dt;
    const v = Math.hypot(h.vx, h.vy, h.vz);
    if (v > VMAX) { h.vx *= VMAX / v; h.vy *= VMAX / v; h.vz *= VMAX / v; }
    h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
    return dist;
  }

  // Projects a world point that is not a node.
  const tp = { x: 0, y: 0, z: 0 };
  function screen(x, y, z) { tp.x = x; tp.y = y; tp.z = z; project(tp); return { x: tp.sx, y: tp.sy, f: tp.sf, fog: tp.fog, depth: tp.depth }; }

  // A flat theme faces the viewer at rest.
  function faceFront(rest, yaw, pitch) {
    if (rest <= 0) return;
    const back = (to, at) => at + Math.atan2(Math.sin(to - at), Math.cos(to - at)) * 0.02 * rest;
    view.yaw = back(yaw, view.yaw); view.pitch = back(pitch, view.pitch);
  }

  // Draws a horse from its state: screen place, facing and gait.
  function paintHorse(h, t, fade, opts) {
    const s = screen(h.x, h.y, h.z);
    const ahead = screen(h.x + h.vx * 0.05, h.y + h.vy * 0.05, h.z);
    if (Math.abs(ahead.x - s.x) > 0.3) h.dir = ahead.x > s.x ? 1 : -1;
    const run = Math.min(1, Math.hypot(h.vx, h.vy) / 30);
    drawHorse(s.x, s.y, h.dir || 1, t, fade * s.fog, s.f, Object.assign({ run, seed: h.seed }, opts));
  }

  // Shared label drawing: hubs always; small items when hot, hovered or in focus.
  function drawLabels(order, near, fc, inFocus, now, lift) {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of order) {
      if (n.kind === 'joint') continue;
      const show = n.kind !== 'leaf' || heatOf(n) > 0.2 || n === hover || (hover && near.has(n.id)) || (fc && n.showLabel && inFocus(n));
      if (!show || grown(n.born, now, 600) < 1) continue;
      if (!inFocus(n) && n.kind !== 'hub' && n !== hover) continue;
      const hub = n.kind === 'hub';
      ctx.font = (hub ? '600 11px' : '10.5px') + ' ui-sans-serif, -apple-system, sans-serif';
      const text = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      const y = n.sy - lift(n) - 5;
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

  // The children of each node, from the tree edges.
  function childrenMap() {
    const kids = new Map();
    for (const e of edges.values()) {
      if (e.link) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b || b.kind === 'hub') continue;
      const list = kids.get(e.a) || [];
      list.push(b);
      kids.set(e.a, list);
    }
    return kids;
  }

  // Body size from data, as in hive: a log scale against the largest of the
  // same kind in the colony.
  function bodySizes() {
    const valueOf = n => n.type === 'skill' ? n.data.uses : (n.type === 'memory' || n.type === 'file') ? (n.data.size || 0) : -1;
    const top = new Map();
    for (const n of nodes.values()) {
      const v = valueOf(n);
      if (v >= 0) top.set(n.colony + ':' + n.type, Math.max(top.get(n.colony + ':' + n.type) || 0, v));
    }
    const out = new Map();
    for (const n of nodes.values()) {
      const v = valueOf(n), max = top.get(n.colony + ':' + n.type) || 0;
      out.set(n.id, n.kind === 'hub' ? 1 : n.kind === 'group' ? 0.95 : v < 0 ? 0.85 : max > 0 ? 0.5 + 0.45 * Math.log1p(v) / Math.log1p(max) : 0.6);
    }
    return out;
  }
`
