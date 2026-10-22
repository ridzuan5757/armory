// Theme 1, mold: a slime-mold network. A 3D force simulation places the
// nodes; veins grow from parent to child, carry particles, and fork at joints.
import type { Theme } from '../web'

export const MOLD: Theme = {
  name: 'mold',
  legend: 'vein width = use · idle: pulses, shuttle flow, searching tendrils · drag to turn · pinch or scroll to zoom · drag a node to move it',
  script: `
  const BUNDLE = true, NODE_DRAG = true, AUTO_TURN = true;

  // Each hub has a fixed place on a pentagon in the z = 0 plane, so the five
  // colonies grow apart. The other nodes spread into depth by repulsion.
  const ANGLE = { 'hub:skills': -90, 'hub:files': -30, 'hub:git': 30, 'hub:jobs': 90, 'hub:memory': 150, 'hub:sessions': 210 };
  function anchor(id) {
    const a = ANGLE[id] * Math.PI / 180;
    return { x: Math.cos(a) * 280, y: Math.sin(a) * 280, z: 0 };
  }

  // One step of the force simulation in 3D: repulsion between all nodes,
  // springs on edges, and a pull to the colony anchor. alpha cools to zero.
  // Idle life of the mold, after 4 s with no input (view.auto), as a real
  // Physarum does at rest. rest eases in and goes at the next input.
  //   pulse     a contraction wave runs out from each hub along the veins
  //             every PULSE_S; veins swell and brighten, nodes swell
  //   shuttle   the flow in the veins slows, turns back and returns, with a
  //             period of SHUTTLE_S (flow is the integrated stream position)
  //   tendrils  thin branches grow out from leaf tips, fork, and draw back,
  //             as the mold searches; they are drawn only, not nodes
  const PULSE_S = 5, SHUTTLE_S = 24, MAX_TENDRILS = 6;
  let rest = 0, flow = 0, lastIdle = 0, depthGen = -1, maxDepth = 1, nextTendril = 0;
  const depthOf = new Map(), tendrils = [];

  // How many veins each node is from its hub, for the pulse wave.
  function depths() {
    if (depthGen === gen) return;
    depthGen = gen;
    depthOf.clear();
    const kids = new Map();
    for (const e of edges.values()) {
      if (e.link || e.k === 0) continue;
      const list = kids.get(e.a) || [];
      list.push(e.b);
      kids.set(e.a, list);
    }
    maxDepth = 1;
    const walk = (id, d) => {
      depthOf.set(id, d);
      maxDepth = Math.max(maxDepth, d);
      for (const c of kids.get(id) || []) if (!depthOf.has(c)) walk(c, d + 1);
    };
    for (const n of nodes.values()) if (n.kind === 'hub') walk(n.id, 0);
  }

  // The swell of the pulse at a depth: a soft bump that runs outward.
  function pulseAt(id, t) {
    if (rest <= 0 || calm) return 0;
    const front = (t / PULSE_S % 1) * (maxDepth + 2) - 0.5;
    const d = depthOf.get(id) ?? 0;
    return rest * Math.exp(-((d - front) * (d - front)) / 0.7);
  }

  function idleStep(now) {
    const dt = lastIdle ? Math.min(0.1, (now - lastIdle) / 1000) : 0;
    lastIdle = now;
    rest = !calm && view.auto > 0 ? Math.min(1, rest + 0.01) : Math.max(0, rest - 0.05);
    const t = now / 1000;
    // At rest the stream turns back and forth; else it runs outward.
    flow += dt * ((1 - rest) + rest * 1.4 * Math.cos(2 * Math.PI * t / SHUTTLE_S));
    depths();
    // Tendrils: start a new one now and then from a leaf tip.
    if (rest > 0.5 && now > nextTendril && tendrils.length < MAX_TENDRILS) {
      nextTendril = now + 1200 + hash('nt' + Math.floor(now)) * 1500;
      const tips = [...nodes.values()].filter(n => n.kind === 'leaf' && !n.dying && grown(n.born, now, 500) >= 1);
      const n = tips[Math.floor(hash('tp' + Math.floor(now)) * tips.length)];
      const up = n && [...edges.values()].find(e => e.b === n.id && !e.link);
      const p = up && nodes.get(up.a);
      if (n && p) {
        let dx = n.x - p.x, dy = n.y - p.y, dz = n.z - p.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const j = id => (hash(id + Math.floor(now)) - 0.5) * 0.9;
        dx = dx / d + j('x'); dy = dy / d + j('y'); dz = dz / d + j('z');
        const k = Math.hypot(dx, dy, dz) || 1;
        tendrils.push({ from: n.id, dx: dx / k, dy: dy / k, dz: dz / k, len: 22 + 22 * hash('tl' + now),
          bend: (hash('tb' + now) - 0.5) * 0.8, born: now, life: 7000 + 3000 * hash('tf' + now) });
      }
    }
    for (let i = tendrils.length - 1; i >= 0; i--) {
      const td = tendrils[i];
      if (now - td.born > td.life || !nodes.has(td.from)) tendrils.splice(i, 1);
    }
  }

  // Tendril reach over its life: grows for 40 %, holds, draws back at the end.
  function reach(td, now) {
    const k = (now - td.born) / td.life;
    return k < 0.4 ? ease(k / 0.4) : k < 0.65 ? 1 : 1 - ease((k - 0.65) / 0.35);
  }
  const tp = { x: 0, y: 0, z: 0 };
  function screenOf(x, y, z) { tp.x = x; tp.y = y; tp.z = z; project(tp); return { x: tp.sx, y: tp.sy, f: tp.sf, fog: tp.fog }; }

  function simulate() {
    idleStep(performance.now());
    if (alpha < 0.004) return;
    const list = [...nodes.values()];
    for (let i = 0; i < list.length; i++) {
      const n = list[i], mn = MASS[n.kind];
      for (let j = i + 1; j < list.length; j++) {
        const o = list[j], mo = MASS[o.kind];
        let dx = n.x - o.x, dy = n.y - o.y, dz = n.z - o.z;
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 30);
        const f = 900 * mn * mo * alpha / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d; dz /= d;
        n.vx += dx * f / mn; n.vy += dy * f / mn; n.vz += dz * f / mn;
        o.vx -= dx * f / mo; o.vy -= dy * f / mo; o.vz -= dz * f / mo;
      }
    }
    for (const e of edges.values()) {
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = (d - e.rest) * e.k * alpha;
      const ma = MASS[a.kind], mb = MASS[b.kind];
      const fa = f * mb / (ma + mb) * 2 / d, fb = f * ma / (ma + mb) * 2 / d;
      a.vx += dx * fa; a.vy += dy * fa; a.vz += dz * fa;
      b.vx -= dx * fb; b.vy -= dy * fb; b.vz -= dz * fb;
    }
    for (const n of list) {
      // Hubs hold their anchors; every other node stays near its colony.
      // Only hubs are held to z = 0, so colonies grow out into depth.
      const a = anchor(n.kind === 'hub' ? n.id : n.colony);
      const pull = (n.kind === 'hub' ? 0.05 : 0.01) * alpha;
      n.vx += (a.x - n.x) * pull; n.vy += (a.y - n.y) * pull;
      n.vz += (a.z - n.z) * (n.kind === 'hub' ? pull : 0.001 * alpha);
      if (n === drag) { n.vx = n.vy = n.vz = 0; continue; }
      n.vx *= 0.55; n.vy *= 0.55; n.vz *= 0.55;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
    }
    alpha *= 0.988;
  }

  // A point at t on the curve of an edge on screen: a quadratic Bezier with a
  // control point to one side, so veins bend like grown tissue.
  function curve(a, b, bend) {
    const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
    return { x0: a.sx, y0: a.sy, cx: mx - (b.sy - a.sy) * bend, cy: my + (b.sx - a.sx) * bend, x1: b.sx, y1: b.sy };
  }
  function at(c, t) {
    const u = 1 - t;
    return { x: u * u * c.x0 + 2 * u * t * c.cx + t * t * c.x1, y: u * u * c.y0 + 2 * u * t * c.cy + t * t * c.y1 };
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The background matches the terminal, so the pane looks transparent.
    ctx.fillStyle = '#292c33';
    ctx.fillRect(0, 0, W, H);
    for (const n of nodes.values()) project(n);
    // During a focus, the other colonies dim, so the active one stands out.
    const ft = focus && nodes.get(focus.id);
    const fc = ft && (ft.kind === 'hub' ? ft.id : ft.colony);
    const inFocus = n => !fc || n.id === fc || n.colony === fc;
    const near = hover ? new Set([hover.id]) : undefined;
    if (hover) for (const e of edges.values()) {
      if (e.a === hover.id) near.add(e.b);
      if (e.b === hover.id) near.add(e.a);
    }

    // Veins, far ones first: a wide faint pass for the glow, then the core.
    // The curve grows from the parent to the child when an edge first appears.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const veins = [...edges.values()].filter(e => nodes.has(e.a) && nodes.has(e.b));
    veins.sort((p, q) => nodes.get(p.a).depth + nodes.get(p.b).depth - nodes.get(q.a).depth - nodes.get(q.b).depth);
    for (const e of veins) {
      const a = nodes.get(e.a), b = nodes.get(e.b);
      const g = ease(grown(e.born, now, 700)) * (e.dying ? 1 - grown(e.dying, now, 600) : 1);
      if (g <= 0) continue;
      const c = curve(a, b, e.bend);
      const p01x = c.x0 + (c.cx - c.x0) * g, p01y = c.y0 + (c.cy - c.y0) * g;
      const end = at(c, g);
      const lit = !hover || (near.has(e.a) && near.has(e.b));
      const color = e.link ? e.color || '#cfe0ff' : b.color;
      const fade = (b.dim ? 0.45 : 1) * (lit ? 1 : 0.25) * (inFocus(a) && inFocus(b) ? 1 : 0.3) * (a.fog + b.fog) / 2;
      const swell = pulseAt(e.b, t);
      const w = e.w * (a.sf + b.sf) / 2 * (1 + 0.8 * swell);
      ctx.beginPath();
      ctx.moveTo(c.x0, c.y0);
      ctx.quadraticCurveTo(p01x, p01y, end.x, end.y);
      ctx.strokeStyle = rgba(color, 0.07 * fade);
      ctx.lineWidth = w * 4;
      ctx.stroke();
      ctx.strokeStyle = rgba(color, Math.min(1, (e.link ? 0.35 : 0.55) + 0.35 * swell) * fade);
      ctx.lineWidth = w;
      if (e.link && !e.solid) ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // A vein to a used file glows in the color of the use.
      const heat = heatOf(b);
      if (heat > 0.01) {
        ctx.strokeStyle = rgba(OP[b.op] || '#ffffff', 0.7 * heat * (a.fog + b.fog) / 2);
        ctx.lineWidth = w * (1 + heat);
        ctx.stroke();
      }

      // Streams of small particles move from parent to child along each vein.
      if (!calm && g === 1 && !e.link) {
        const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0) / ((a.sf + b.sf) / 2) + 1;
        const count = Math.max(1, Math.round(e.w + 3 * heat));
        ctx.fillStyle = heat > 0.01 ? rgba(OP[b.op] || color, (0.5 + 0.5 * heat) * fade) : rgba(color, 0.75 * fade);
        for (let i = 0; i < count; i++) {
          // flow runs outward when busy and shuttles back and forth at rest.
          const s = (flow * 26 + t * 60 * heat) / len + i / count + hash(e.key);
          const p = at(c, s - Math.floor(s));
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.7, w * 0.45), 0, 6.2832);
          ctx.fill();
        }
      }
    }

    // Tendrils: thin searching branches from leaf tips, with one fork.
    if (rest > 0) for (const td of tendrils) {
      const n = nodes.get(td.from);
      if (!n) continue;
      const k = reach(td, now) * rest;
      if (k <= 0.01) continue;
      const L = td.len * k;
      const ex = n.x + td.dx * L, ey = n.y + td.dy * L, ez = n.z + td.dz * L;
      const s0 = screenOf(n.x, n.y, n.z), s1 = screenOf(ex, ey, ez);
      const mx = (s0.x + s1.x) / 2 - (s1.y - s0.y) * td.bend, my = (s0.y + s1.y) / 2 + (s1.x - s0.x) * td.bend;
      const fade = 0.45 * k * (inFocus(n) ? 1 : 0.3) * s1.fog;
      ctx.strokeStyle = rgba(n.color, fade);
      ctx.lineWidth = Math.max(0.5, 0.9 * s0.f);
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.quadraticCurveTo(mx, my, s1.x, s1.y); ctx.stroke();
      // The fork: a short side branch from 60 % along.
      const fx = s0.x + (s1.x - s0.x) * 0.6, fy = s0.y + (s1.y - s0.y) * 0.6;
      const side = td.bend > 0 ? 1 : -1;
      ctx.lineWidth = Math.max(0.4, 0.6 * s0.f);
      ctx.beginPath(); ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (s1.x - s0.x) * 0.35 - (s1.y - s0.y) * 0.3 * side, fy + (s1.y - s0.y) * 0.35 + (s1.x - s0.x) * 0.3 * side);
      ctx.stroke();
      ctx.fillStyle = rgba(n.color, fade * 1.4);
      ctx.beginPath(); ctx.arc(s1.x, s1.y, Math.max(0.8, 1.2 * s1.f), 0, 6.2832); ctx.fill();
    }

    // Nodes, far ones first: a soft glow and a bright core that breathes.
    const order = [...nodes.values()].sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      const g = ease(grown(n.born, now, 500)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.5 : 1) * (lit ? 1 : 0.3) * (inFocus(n) ? 1 : 0.3) * g * n.fog;
      const r = n.r * n.sf * g * (calm ? 1 : 1 + 0.06 * Math.sin(t * 1.6 + n.phase)) * (1 + 0.25 * pulseAt(n.id, t));
      const halo = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 3.2);
      halo.addColorStop(0, rgba(n.color, 0.35 * fade));
      halo.addColorStop(1, rgba(n.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 3.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(n.color, 0.9 * fade);
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, 6.2832); ctx.fill();
      // A used file glows in the color of the use; the glow fades over GLOW_MS.
      if (heat > 0.01) {
        const hot = OP[n.op] || '#ffffff';
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * (3 + 6 * heat));
        glow.addColorStop(0, rgba(hot, 0.65 * heat * g * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * (3 + 6 * heat), 0, 6.2832); ctx.fill();
        // The core is painted over, not added, so the color stays clear.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(hot, Math.min(1, 0.4 + heat) * g * n.fog);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * (1 + 0.4 * heat), 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
      if (n.kind === 'hub' || n === hover) {
        ctx.fillStyle = 'rgba(255,255,255,' + 0.55 * fade + ')';
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 0.4, 0, 6.2832); ctx.fill();
      }
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r + k * 16 * n.sf, 0, 6.2832); ctx.stroke();
      }
    }

    // Labels keep one screen size, with a halo of the background.
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of order) {
      if (n.kind === 'joint') continue;
      // Labels of far leaves hide, so a turned network does not fill with text.
      const show = n.kind !== 'leaf' || (n.showLabel && n.fog > 0.62) || heatOf(n) > 0.2 || n === hover || (hover && near.has(n.id));
      if (!show || grown(n.born, now, 500) < 1) continue;
      if (!inFocus(n) && n.kind !== 'hub' && n !== hover) continue;
      const hub = n.kind === 'hub';
      ctx.font = (hub ? '600 11px' : '10.5px') + ' ui-sans-serif, -apple-system, sans-serif';
      const text = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      const y = n.sy - n.r * n.sf - 6;
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
