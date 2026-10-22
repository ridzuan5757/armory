// Theme 2, orbit: a solar system. Hubs are stars; each child orbits its
// parent on a ring it shares with its siblings, and their children orbit them
// as moons. Rings tilt in 3D, and outer rings turn more slowly.
import type { Theme } from '../web'

export const ORBIT: Theme = {
  name: 'orbit',
  legend: 'orbits turn around their parent · idle: Newtonian gravity · drag to turn · pinch or scroll to zoom · hover to stop the orbits',
  script: `
  const BUNDLE = false, NODE_DRAG = false, AUTO_TURN = true;

  // Hubs are stars on a pentagon in the z = 0 plane, spaced so that their
  // systems never touch.
  const ANGLE = { 'hub:skills': -90, 'hub:files': -39, 'hub:git': 13, 'hub:mcp': 64, 'hub:jobs': 116, 'hub:memory': 167, 'hub:sessions': 219 };
  let spread = 280;
  // During idle the pentagon of stars turns slowly about its center (spin).
  let spin = 0;
  function anchor(id) {
    const a = ANGLE[id] * Math.PI / 180 + spin;
    return { x: Math.cos(a) * spread, y: Math.sin(a) * spread, z: 0 };
  }

  // The orbit of each body: around its parent, on a ring it shares with its
  // siblings. Each ring holds as many bodies as fit around it. A child's own
  // system is a copy at SUB of the size, as a moon system is small next to a
  // planet's orbit: it always fits inside its ring, and a deep chain of
  // folders grows only a little at each level. Sizes are first worked out in
  // each body's own units, then scaled down level by level from the stars.
  const SUB = 0.55;
  let orbits = new Map(), rings = new Map(), bodies = [], layoutGen = -1, layoutSize = -1;
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
    const ext = new Map();
    const next = new Map(), nextRings = new Map();
    const room = c => SUB * extent(c) + 3;
    const extent = n => {
      if (ext.has(n.id)) return ext.get(n.id);
      ext.set(n.id, n.r * 1.6 + 2);
      const list = (kids.get(n.id) || []).slice().sort((p, q) => room(q) - room(p) || p.id.localeCompare(q.id));
      if (list.length === 0) return ext.get(n.id);
      let radius = n.r * 2.2 + 8, i = 0, ring = 0;
      while (i < list.length) {
        const thick = room(list[i]);
        radius += thick;
        const cap = Math.max(1, Math.floor(2 * Math.PI * radius / (2 * thick + 10)));
        const members = list.slice(i, i + cap);
        const key = n.id + '#' + ring;
        const h = hash(key);
        nextRings.set(key, {
          key, parent: n.id, local: radius, radius,
          tilt: (hash(key + 't') - 0.5) * 1.1,
          node: hash(key + 'n') * 6.2832,
          phase: hash(key + 'p') * 6.2832,
          spin: (h < 0.15 ? -1 : 1) * (0.25 + 0.2 * hash(key + 'w')),
        });
        members.forEach((c, j) => next.set(c.id, { ring: key, slot: j / members.length }));
        radius += thick + 6;
        i += members.length;
        ring++;
      }
      ext.set(n.id, radius);
      return radius;
    };
    // Each star system is scaled to about one size, so a deep file tree does
    // not dwarf the jobs. The stars sit far enough apart for the widest.
    const starScale = n => Math.min(2, Math.max(0.3, 150 / extent(n)));
    let widest = 0;
    for (const n of nodes.values()) if (n.kind === 'hub') widest = Math.max(widest, extent(n) * starScale(n));
    // Neighbors on the pentagon are 2·sin(36°) = 1.176 spreads apart.
    spread = Math.max(120, (2 * widest + 60) / 1.176);
    // A body whose ring changed eases to its new orbit from where it is.
    for (const [id, o] of next) {
      const old = orbits.get(id);
      if (!old || old.ring !== o.ring || old.slot !== o.slot) {
        const n = nodes.get(id);
        if (n) n.settle = 0;
      }
    }
    orbits = next;
    rings = nextRings;
    // Parents before children, so a moon follows the planet it orbits.
    // Parents before children, so a moon follows the planet it orbits. Each
    // level down is SUB of the size of the one above it.
    bodies = [];
    const walk = (id, scale) => {
      for (const ring of rings.values()) {
        if (ring.parent !== id) continue;
        ring.radius = ring.local * scale;
        // Smaller orbits turn faster, as in a real system.
        ring.omega = ring.spin * Math.sqrt(40 / Math.max(4, ring.radius));
      }
      for (const c of kids.get(id) || []) {
        c.bodyScale = Math.min(1.2, Math.max(0.45, scale * SUB));
        bodies.push(c.id);
        // A floor on the scale keeps the deepest moons on orbits wide enough
        // to draw and to integrate.
        walk(c.id, Math.max(0.15, scale * SUB));
      }
    };
    for (const n of nodes.values()) if (n.kind === 'hub') walk(n.id, starScale(n));
  }

  // A point on a ring at angle a, relative to the ring's parent: a circle in
  // the z = 0 plane, tilted about x, then turned about z.
  function ringPoint(ring, a) {
    const x = Math.cos(a) * ring.radius, y = Math.sin(a) * ring.radius;
    const y1 = y * Math.cos(ring.tilt), z1 = y * Math.sin(ring.tilt);
    const cn = Math.cos(ring.node), sn = Math.sin(ring.node);
    return { x: x * cn - y1 * sn, y: x * sn + y1 * cn, z: z1 };
  }

  // Two layers of motion. On rails, each body moves on its ring at a fixed
  // speed: the layout stays readable while the person works with it. After
  // 4 s with no input (view.auto), the bodies change smoothly to Newtonian
  // gravity, F = G M m / r^2, in layers:
  //   parent    full strength: each body falls around its parent
  //   siblings  SIBLING of it: bodies of one parent pull on each other, so
  //             orbits turn elliptical, precess and nudge their neighbors
  //   stars     pull on each other and turn about their common center; a
  //             spring to their place on the pentagon keeps them from drifting
  // A body's state is relative to its parent, so a moon keeps its planet.
  // The integrator is leapfrog, which keeps orbits stable for a long time.
  // At the next input, every body eases back to its rail.
  const SIBLING = 0.005, SOFT2 = 9, STEPS = 4;
  let orbitT = 0, lastSim = 0, grav = 0;

  // The pull of a parent: chosen so that a circular orbit at its innermost
  // ring keeps the speed of the rail there.
  const gmOf = new Map();
  function parentGM(id) {
    if (gmOf.has(id)) return gmOf.get(id);
    let inner;
    for (const ring of rings.values()) if (ring.parent === id && (!inner || ring.radius < inner.radius)) inner = ring;
    const gm = inner ? inner.omega * inner.omega * Math.pow(inner.radius, 3) : 1;
    gmOf.set(id, gm);
    return gm;
  }

  // Puts a body on a circular orbit where its rail has it now.
  function launch(n, ring, p) {
    const q = ringPoint(ring, n.angle);
    const ahead = ringPoint(ring, n.angle + 0.01 * Math.sign(ring.omega || 1));
    const d = Math.hypot(ahead.x - q.x, ahead.y - q.y, ahead.z - q.z) || 1;
    const v = Math.sqrt(parentGM(ring.parent) / Math.max(1, ring.radius));
    n.ph = { x: q.x, y: q.y, z: q.z, vx: (ahead.x - q.x) / d * v, vy: (ahead.y - q.y) / d * v, vz: (ahead.z - q.z) / d * v };
  }

  // The pull on a body at (x, y, z) relative to its parent.
  function pull(n, parentId, x, y, z, ringRadius) {
    // The parent pulls through a soft core 5 % of the ring wide: a fixed core
    // would weaken the pull on small moon orbits and throw them out.
    const gm = parentGM(parentId);
    let r2 = x * x + y * y + z * z + Math.pow(0.05 * ringRadius, 2), f = -gm / (r2 * Math.sqrt(r2));
    let ax = x * f, ay = y * f, az = z * f;
    // Siblings pull through a soft core a quarter of the ring wide, so close
    // neighbors on a crowded ring only nudge each other.
    const soft = SOFT2 + Math.pow(ringRadius * 0.25, 2);
    for (const id of siblingsOf.get(parentId) || []) {
      const s = nodes.get(id);
      if (s === n || !s || !s.ph) continue;
      const dx = s.ph.x - x, dy = s.ph.y - y, dz = s.ph.z - z;
      r2 = dx * dx + dy * dy + dz * dz + soft;
      f = SIBLING * gm * Math.min(1, (s.r * s.r) / 16) / (r2 * Math.sqrt(r2));
      ax += dx * f; ay += dy * f; az += dz * f;
    }
    return { x: ax, y: ay, z: az };
  }
  const siblingsOf = new Map();

  function stepGravity(dt) {
    siblingsOf.clear();
    for (const id of bodies) {
      const o = orbits.get(id), ring = o && rings.get(o.ring);
      if (!ring) continue;
      const list = siblingsOf.get(ring.parent) || [];
      list.push(id);
      siblingsOf.set(ring.parent, list);
    }
    const h = dt / STEPS;
    for (let k = 0; k < STEPS; k++) {
      // Kick half, drift, kick half: leapfrog.
      for (const id of bodies) {
        const n = nodes.get(id), o = orbits.get(id), ring = o && rings.get(o.ring);
        if (!n || !n.ph || !ring) continue;
        const a = pull(n, ring.parent, n.ph.x, n.ph.y, n.ph.z, ring.radius);
        n.ph.vx += a.x * h / 2; n.ph.vy += a.y * h / 2; n.ph.vz += a.z * h / 2;
        n.ph.x += n.ph.vx * h; n.ph.y += n.ph.vy * h; n.ph.z += n.ph.vz * h;
      }
      for (const id of bodies) {
        const n = nodes.get(id), o = orbits.get(id), ring = o && rings.get(o.ring);
        if (!n || !n.ph || !ring) continue;
        const a = pull(n, ring.parent, n.ph.x, n.ph.y, n.ph.z, ring.radius);
        n.ph.vx += a.x * h / 2; n.ph.vy += a.y * h / 2; n.ph.vz += a.z * h / 2;
        // A body thrown far out or deep in goes back on a fresh circular orbit.
        const d = Math.hypot(n.ph.x, n.ph.y, n.ph.z);
        if (d > ring.radius * 2.5 || d < ring.radius * 0.25) launch(n, ring, nodes.get(ring.parent));
      }
    }
  }

  // The stars: gravity between them, a spring to their turning place on the
  // pentagon, and a little drag so the dance does not grow.
  const STAR_GM = 600000, STAR_K = 0.6, STAR_DRAG = 0.4;
  function stepStars(dt) {
    const stars = [...nodes.values()].filter(n => n.kind === 'hub');
    for (const n of stars) if (!n.sv) n.sv = { x: 0, y: 0, z: 0 };
    for (const n of stars) {
      const a = anchor(n.id);
      let ax = (a.x - n.x) * STAR_K - n.sv.x * STAR_DRAG, ay = (a.y - n.y) * STAR_K - n.sv.y * STAR_DRAG, az = (a.z - n.z) * STAR_K - n.sv.z * STAR_DRAG;
      for (const o of stars) {
        if (o === n) continue;
        const dx = o.x - n.x, dy = o.y - n.y, dz = o.z - n.z, r2 = dx * dx + dy * dy + dz * dz + 400;
        const f = STAR_GM / (r2 * Math.sqrt(r2));
        ax += dx * f; ay += dy * f; az += dz * f;
      }
      n.sv.x += ax * dt; n.sv.y += ay * dt; n.sv.z += az * dt;
    }
    for (const n of stars) { n.x += n.sv.x * dt; n.y += n.sv.y * dt; n.z += n.sv.z * dt; }
  }

  // Orbit time stops while the pointer is on a body, so its tooltip stays put.
  function simulate() {
    if (gen !== layoutGen || nodes.size !== layoutSize) { layout(); layoutGen = gen; layoutSize = nodes.size; gmOf.clear(); }
    const now = performance.now();
    const dt = lastSim ? Math.min(0.1, (now - lastSim) / 1000) : 0;
    lastSim = now;
    const frozen = calm || !!hover;
    if (!frozen) orbitT += dt;
    alpha *= 0.988;
    // Gravity eases in during idle and out at the next input; a hover only
    // freezes it, so a tooltip does not send the bodies back to their rails.
    const idle = !calm && (view.auto > 0 || (hover && grav > 0));
    grav = idle ? Math.min(1, grav + 0.01) : Math.max(0, grav - 0.05);

    if (grav > 0 && !frozen) {
      spin += dt * 0.04 * grav;
      stepStars(dt);
    } else {
      for (const n of nodes.values()) {
        if (n.kind !== 'hub') continue;
        const a = anchor(n.id);
        n.x += (a.x - n.x) * 0.1; n.y += (a.y - n.y) * 0.1; n.z += (a.z - n.z) * 0.1;
        n.sv = undefined;
      }
    }
    // Rail angles always move on, so a body eases back to where its rail is now.
    for (const id of bodies) {
      const n = nodes.get(id), o = orbits.get(id), ring = o && rings.get(o.ring);
      if (!n || !ring) continue;
      n.angle = ring.phase + o.slot * 6.2832 + orbitT * ring.omega;
      if (grav > 0 && !n.ph) launch(n, ring, nodes.get(ring.parent));
      if (grav === 0) n.ph = undefined;
    }
    if (grav > 0 && !frozen) stepGravity(dt);

    for (const id of bodies) {
      const n = nodes.get(id), o = orbits.get(id);
      const ring = o && rings.get(o.ring), p = ring && nodes.get(ring.parent);
      if (!n || !p) continue;
      const q = ringPoint(ring, n.angle);
      const w = n.ph ? grav * grav * (3 - 2 * grav) : 0;
      const tx = p.x + q.x * (1 - w) + (n.ph ? n.ph.x : 0) * w;
      const ty = p.y + q.y * (1 - w) + (n.ph ? n.ph.y : 0) * w;
      const tz = p.z + q.z * (1 - w) + (n.ph ? n.ph.z : 0) * w;
      n.settle = Math.min(1, (n.settle || 0) + 0.03);
      const k = 0.12 + 0.88 * n.settle;
      n.x += (tx - n.x) * k; n.y += (ty - n.y) * k; n.z += (tz - n.z) * k;
      // The path behind the body, for its trail.
      const tail = n.tail || (n.tail = []);
      const last = tail[tail.length - 1];
      if (!last || Math.hypot(n.x - last.x, n.y - last.y, n.z - last.z) > 1.5) {
        tail.push({ x: n.x, y: n.y, z: n.z });
        if (tail.length > 10) tail.shift();
      }
    }
  }

  // Faint star dust, drawn once per pane size.
  let dust, dustW = 0, dustH = 0;
  function starDust() {
    if (dust && dustW === W && dustH === H) return dust;
    dust = document.createElement('canvas');
    dust.width = W * dpr; dust.height = H * dpr;
    dustW = W; dustH = H;
    const d = dust.getContext('2d');
    d.scale(dpr, dpr);
    const count = Math.round(W * H / 2600);
    for (let i = 0; i < count; i++) {
      const x = hash('dx' + i) * W, y = hash('dy' + i) * H, b = hash('db' + i);
      d.fillStyle = 'rgba(232,236,216,' + (0.04 + 0.14 * b * b) + ')';
      d.fillRect(x, y, b > 0.92 ? 1.6 : 1, b > 0.92 ? 1.6 : 1);
    }
    return dust;
  }

  // Projects a world point that is not a node.
  const spot = { x: 0, y: 0, z: 0 };
  function projectPoint(x, y, z) {
    spot.x = x; spot.y = y; spot.z = z;
    project(spot);
    return spot;
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The background matches the terminal, so the pane looks transparent.
    ctx.fillStyle = '#292c33';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(starDust(), 0, 0, W, H);
    for (const n of nodes.values()) project(n);
    // During a focus, the other systems dim, so the active one stands out.
    const ft = focus && nodes.get(focus.id);
    const fc = ft && (ft.kind === 'hub' ? ft.id : ft.colony);
    const inFocus = n => !fc || n.id === fc || n.colony === fc;
    const near = hover ? new Set([hover.id]) : undefined;
    if (hover) for (const e of edges.values()) {
      if (e.a === hover.id) near.add(e.b);
      if (e.b === hover.id) near.add(e.a);
    }

    // Orbit paths: one faint ellipse per ring. A ring with a hot body on it
    // glows in the color of that use.
    ctx.lineWidth = 1;
    const ringHeat = new Map();
    for (const id of bodies) {
      const n = nodes.get(id), o = orbits.get(id);
      if (!n || !o) continue;
      const h = heatOf(n);
      if (h > (ringHeat.get(o.ring)?.h || 0)) ringHeat.set(o.ring, { h, op: n.op });
    }
    for (const ring of rings.values()) {
      const p = nodes.get(ring.parent);
      if (!p || p.dying) continue;
      const hot = ringHeat.get(ring.key);
      // Under gravity the rails matter less, so their rings fade.
      const fade = (inFocus(p) ? 1 : 0.3) * (hover && !near.has(p.id) && hover.id !== p.id ? 0.4 : 1) * (1 - 0.7 * grav);
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const q = ringPoint(ring, i / 64 * 6.2832);
        const s = projectPoint(p.x + q.x, p.y + q.y, p.z + q.z);
        if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
      }
      ctx.strokeStyle = hot && hot.h > 0.01
        ? rgba(OP[hot.op] || '#ffffff', (0.12 + 0.45 * hot.h) * fade * p.fog)
        : rgba(p.color, 0.11 * fade * p.fog);
      ctx.stroke();
    }

    // Links: memory [[links]] and job-session links are faint dashed lines;
    // a job and its own session have a solid one.
    for (const e of edges.values()) {
      if (!e.link || e.dying) continue;
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (!a || !b) continue;
      const lit = !hover || (near.has(e.a) && near.has(e.b));
      ctx.setLineDash(e.solid ? [] : [2, 5]);
      ctx.strokeStyle = rgba(e.color || '#cfe0ff', (e.solid ? 0.45 : 0.22) * (lit ? 1 : 0.3) * (inFocus(a) ? 1 : 0.3) * (a.fog + b.fog) / 2);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Trails: the path each body took, fading behind it. On rails it is an
    // arc of the ring; under gravity it shows the real curve.
    ctx.lineCap = 'round';
    if (!calm) for (const id of bodies) {
      const n = nodes.get(id);
      if (!n || n.dying || !n.tail || n.tail.length < 2 || grown(n.born, now, 500) < 1) continue;
      const fade = (n.dim ? 0.4 : 1) * (inFocus(n) ? 1 : 0.3) * n.fog;
      const pts = n.tail.map(q => { const s = projectPoint(q.x, q.y, q.z); return { x: s.sx, y: s.sy }; });
      pts.push({ x: n.sx, y: n.sy });
      for (let i = 1; i < pts.length; i++) {
        const k = i / (pts.length - 1);
        ctx.strokeStyle = rgba(n.color, 0.3 * k * fade);
        ctx.lineWidth = Math.max(0.6, n.r * (n.bodyScale || 1) * n.sf * 0.7 * k);
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
    }

    // Bodies, far ones first. Stars have a corona; planets are lit spheres.
    const order = [...nodes.values()].sort((p, q) => p.depth - q.depth);
    for (const n of order) {
      const g = ease(grown(n.born, now, 500)) * (n.dying ? 1 - grown(n.dying, now, 600) : 1);
      if (g <= 0) continue;
      const heat = heatOf(n);
      const lit = !hover || near.has(n.id);
      const fade = (n.dim && heat < 0.05 ? 0.5 : 1) * (lit ? 1 : 0.3) * (inFocus(n) ? 1 : 0.3) * g * n.fog;
      const r = n.r * (n.bodyScale || 1) * n.sf * g;
      if (n.kind === 'hub') {
        const flicker = calm ? 1 : 1 + 0.05 * Math.sin(t * 2.3 + n.phase);
        const corona = ctx.createRadialGradient(n.sx, n.sy, r * 0.3, n.sx, n.sy, r * 6 * flicker);
        corona.addColorStop(0, rgba(n.color, 0.55 * fade));
        corona.addColorStop(0.25, rgba(n.color, 0.18 * fade));
        corona.addColorStop(1, rgba(n.color, 0));
        ctx.fillStyle = corona;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 6 * flicker, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.9 * fade);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 0.75, 0, 6.2832); ctx.fill();
        continue;
      }
      if (n.kind === 'joint') continue;
      // A used body glows in the color of the use, with a ring that spreads.
      if (heat > 0.01) {
        const hot = OP[n.op] || '#ffffff';
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * (3 + 6 * heat));
        glow.addColorStop(0, rgba(hot, 0.6 * heat * g * n.fog));
        glow.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * (3 + 6 * heat), 0, 6.2832); ctx.fill();
        if (!calm) {
          const k = (t * 0.9) % 1;
          ctx.strokeStyle = rgba(hot, 0.7 * heat * (1 - k) * n.fog);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(n.sx, n.sy, r + k * 14 * n.sf, 0, 6.2832); ctx.stroke();
        }
      }
      const color = heat > 0.01 ? (OP[n.op] || n.color) : n.color;
      ctx.fillStyle = rgba(color, 0.95 * fade);
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, 6.2832); ctx.fill();
      // Light from the upper left, shadow to the lower right.
      const light = ctx.createRadialGradient(n.sx - r * 0.35, n.sy - r * 0.35, 0, n.sx, n.sy, r);
      light.addColorStop(0, 'rgba(255,255,255,' + 0.55 * fade + ')');
      light.addColorStop(0.5, 'rgba(255,255,255,0)');
      light.addColorStop(1, 'rgba(0,0,0,' + 0.35 * fade + ')');
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, 6.2832); ctx.fill();
      if (n.live && !calm) {
        const k = (t * 0.8 + n.phase) % 1;
        ctx.strokeStyle = rgba(n.color, 0.6 * (1 - k) * n.fog);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r + k * 16 * n.sf, 0, 6.2832); ctx.stroke();
      }
    }

    // Labels keep one screen size, with a halo of the background.
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of order) {
      if (n.kind === 'joint') continue;
      // A small body shows its name only when it glows, when the pointer is
      // on it or a neighbor, or when a focus is on its system.
      const show = n.kind !== 'leaf' || heatOf(n) > 0.2 || n === hover || (hover && near.has(n.id)) || (fc && n.showLabel && inFocus(n));
      if (!show || grown(n.born, now, 500) < 1) continue;
      if (!inFocus(n) && n.kind !== 'hub' && n !== hover) continue;
      const hub = n.kind === 'hub';
      ctx.font = (hub ? '600 11px' : '10.5px') + ' ui-sans-serif, -apple-system, sans-serif';
      const text = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      const y = n.sy - n.r * (n.bodyScale || 1) * n.sf * (hub ? 2.2 : 1) - 6;
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
