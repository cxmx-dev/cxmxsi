// Closed night-city circuit. All frames come from the centerline:
// tangent points along travel, right = (-tangent.z, tangent.x).

export const HALF_WIDTH = 24;
// Homing searches in the authored meter space. The driven road is wider after CUSTOM_SPREAD.
const PIECE_HALF = 8;
export const CUSTOM_SPREAD = 1.75;
export const CUSTOM_HALF = 14;
export const EDGE_SCRUB_M = 1.6;

export function edgeScrubLat(halfW) {
  return halfW - EDGE_SCRUB_M;
}

export function roadPaintSpec() {
  return {
    dashLen: 5.6,
    dashGap: 4.0,
    dashHalf: 0.22,
    dashGroup: 4,
    dashGroupHalf: 0.38,
    grainLen: 2.2,
    grainGap: 3.1,
    grainHalf: 0.2,
    grainLat: 1.65,
    grainStagger: 0.5,
    startAlong: 0.42,
    shoulderBand: 1.15,
    shoulder: [1, 0.46, 0.88],
  };
}

// Fit a centerline into a map box. The longer side of the shape fills the box.
export function mapFit(pts, w, h) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const pad = 28;
  const bw = Math.max(8, maxX - minX);
  const bh = Math.max(8, maxZ - minZ);
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * s) / 2;
  const oz = (h - bh * s) / 2;
  return {
    s,
    xy: (p) => [ox + (p[0] - minX) * s, oz + (p[1] - minZ) * s],
  };
}
export const GATE_COUNT = 10;
export const LAPS = 3;
export const FINISH_DIST = 60;

function hypot(x, z) {
  return Math.hypot(x, z);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && hypot(p[0] - q[0], p[1] - q[1]) < 0.04) continue;
    out.push(p);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (hypot(a[0] - b[0], a[1] - b[1]) < 0.04) out.pop();
  }
  return out;
}

function pushLine(pts, x0, z0, x1, z1, step) {
  const len = hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
}

function pushArc(pts, cx, cz, r, a0, a1, step) {
  const sweep = a1 - a0;
  const len = Math.abs(sweep) * r;
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = a0 + sweep * (i / n);
    pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]);
  }
}

// East-straight chicane: sine bulge inward (-x), zero at both ends.
function pushChicane(pts, x, z0, z1, amp, step) {
  const len = Math.abs(z1 - z0);
  const n = Math.max(4, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const z = z0 + (z1 - z0) * u;
    pts.push([x - Math.sin(u * Math.PI) * amp, z]);
  }
}

function rawLoop() {
  const pts = [];
  const step = 2;
  // CCW in xz, x east, -z north. Start of the north-edge straight (z = -50).
  pushLine(pts, -42, -50, 48, -50, step);
  pushArc(pts, 48, -32, 18, -Math.PI / 2, 0, step);
  pushLine(pts, 66, -32, 66, -18, step);
  pushChicane(pts, 66, -18, 20, 8, step);
  pushLine(pts, 66, 20, 66, 28, step);
  pushArc(pts, 20, 28, 46, 0, Math.PI / 2, step);
  pushLine(pts, 20, 74, -40, 74, step);
  pushArc(pts, -40, 54, 20, Math.PI / 2, Math.PI, step);
  pushLine(pts, -60, 54, -60, -32, step);
  pushArc(pts, -42, -32, 18, Math.PI, Math.PI * 1.5, step);
  // Widen the circuit with the pavement so the broader road does not fold into itself.
  return dedupe(pts).map(([x, z]) => [x * 1.65, z * 1.65]);
}

function resample(pts, step) {
  const closed = pts.concat([pts[0]]);
  const out = [[closed[0][0], closed[0][1]]];
  let prevX = closed[0][0];
  let prevZ = closed[0][1];
  let remain = step;
  for (let i = 1; i < closed.length; i++) {
    let x = closed[i][0];
    let z = closed[i][1];
    let dx = x - prevX;
    let dz = z - prevZ;
    let dist = hypot(dx, dz);
    if (dist < 1e-6) continue;
    while (dist >= remain) {
      const t = remain / dist;
      prevX += dx * t;
      prevZ += dz * t;
      out.push([prevX, prevZ]);
      dx = x - prevX;
      dz = z - prevZ;
      dist = hypot(dx, dz);
      remain = step;
      if (dist < 1e-6) break;
    }
    remain -= dist;
    prevX = x;
    prevZ = z;
  }
  return dedupe(out);
}

function wrapAngle(a) {
  const t = Math.PI * 2;
  a = ((a + Math.PI) % t + t) % t - Math.PI;
  return a;
}

function buildSamples(pts) {
  const n = pts.length;
  const samples = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    if (i > 0) dist += hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    samples.push({ x: p[0], z: p[1], dist, tx: 0, tz: 0, rx: 0, rz: 0, curvature: 0 });
    if (i === n - 1) dist += hypot(q[0] - p[0], q[1] - p[1]);
  }
  const length = dist;
  for (let i = 0; i < n; i++) {
    const a = samples[(i - 1 + n) % n];
    const b = samples[(i + 1) % n];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const mag = hypot(tx, tz) || 1;
    tx /= mag;
    tz /= mag;
    samples[i].tx = tx;
    samples[i].tz = tz;
    // right = (-forward.z, forward.x). fwd -Z -> right +X.
    samples[i].rx = -tz;
    samples[i].rz = tx;
  }
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const nxt = samples[(i + 1) % n];
    const ds = hypot(nxt.x - s.x, nxt.z - s.z) || 1;
    const dHead = wrapAngle(Math.atan2(nxt.tz, nxt.tx) - Math.atan2(s.tz, s.tx));
    s.curvature = dHead / ds;
  }
  return { samples, length };
}

// Really sharp bends open the pavement. Gentle curves stay at the base width.
export function turnWiden(base, curvature) {
  const k = Math.abs(curvature);
  if (!(k > 0)) return base;
  if (1 / k < base * 0.85) return base;
  const t = Math.max(0, Math.min(1, (k - 0.011) / 0.02));
  const s = t * t * (3 - 2 * t);
  const cap = Math.min(base * 1.35, 10);
  return base + cap * s;
}

function widenTurns(samples, length, base) {
  const n = samples.length;
  const smoothK = samples.map((s) => {
    let acc = 0;
    let signed = 0;
    let w = 0;
    for (let j = 0; j < n; j++) {
      let along = Math.abs(samples[j].dist - s.dist);
      if (along > length * 0.5) along = length - along;
      if (along > 8) continue;
      const fade = 1 - along / 8;
      acc += Math.abs(samples[j].curvature) * fade;
      signed += samples[j].curvature * fade;
      w += fade;
    }
    s.bend = w ? signed / w : 0;
    return w ? acc / w : 0;
  });
  const raw = smoothK.map((k) => turnWiden(base, k));
  const reach = 12;
  for (let i = 0; i < n; i++) {
    let best = base;
    const di = samples[i].dist;
    for (let j = 0; j < n; j++) {
      let along = Math.abs(samples[j].dist - di);
      if (along > length * 0.5) along = length - along;
      if (along > reach) continue;
      const fade = 1 - along / reach;
      const wide = base + (raw[j] - base) * fade;
      if (wide > best) best = wide;
    }
    samples[i].half = best;
  }
  // A widened edge may not cross a road running the other way.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let along = samples[j].dist - samples[i].dist;
        if (along > length * 0.5) along = length - along;
        if (along < 30) continue;
        const face = samples[i].tx * samples[j].tx + samples[i].tz * samples[j].tz;
        if (face > -0.45) continue;
        const gap = hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z) - 1.4;
        const sum = samples[i].half + samples[j].half;
        if (sum <= gap) continue;
        const over = sum - gap;
        const extraI = samples[i].half - base;
        const extraJ = samples[j].half - base;
        const share = extraI + extraJ;
        if (share <= 0.05) continue;
        samples[i].half = Math.max(base, samples[i].half - over * (extraI / share));
        samples[j].half = Math.max(base, samples[j].half - over * (extraJ / share));
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const extra = Math.max(0, samples[i].half - base);
    const bend = samples[i].bend || 0;
    const mag = Math.abs(bend);
    const t = Math.max(0, Math.min(1, (mag - 0.008) / 0.016));
    const share = t * t * (3 - 2 * t);
    if (bend > 0) {
      samples[i].halfL = base + extra * share;
      samples[i].halfR = base;
    } else if (bend < 0) {
      samples[i].halfL = base;
      samples[i].halfR = base + extra * share;
    } else {
      samples[i].halfL = base;
      samples[i].halfR = base;
    }
  }
  // The outside extra can be fully on one sample and gone on the next.
  // That step is a tooth in the pink edge. Spread it along the road.
  const maxStep = 1.1;
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const key of ["halfL", "halfR"]) {
        const d = samples[j][key] - samples[i][key];
        if (Math.abs(d) <= maxStep) continue;
        const nudge = Math.min((Math.abs(d) - maxStep) * 0.5, 0.85) * Math.sign(d);
        samples[i][key] = Math.max(base, samples[i][key] + nudge);
        samples[j][key] = Math.max(base, samples[j][key] - nudge);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (let i = 0; i < n; i++) {
    samples[i].half = Math.max(samples[i].halfL, samples[i].halfR);
  }
}

function outsideSign(samples) {
  let cx = 0;
  let cz = 0;
  for (const s of samples) {
    cx += s.x;
    cz += s.z;
  }
  cx /= samples.length;
  cz /= samples.length;
  const s = samples[0];
  const inward = (cx - s.x) * s.rx + (cz - s.z) * s.rz;
  return inward > 0 ? -1 : 1;
}

function blendSample(a, b, t, dist, index) {
  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const mag = hypot(tx, tz) || 1;
  const rx = a.rx + (b.rx - a.rx) * t;
  const rz = a.rz + (b.rz - a.rz) * t;
  const rmag = hypot(rx, rz) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    tx: tx / mag,
    tz: tz / mag,
    rx: rx / rmag,
    rz: rz / rmag,
    dist,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
    half: (a.half || 0) + ((b.half || 0) - (a.half || 0)) * t,
    halfL: (a.halfL || a.half || 0) + ((b.halfL || b.half || 0) - (a.halfL || a.half || 0)) * t,
    halfR: (a.halfR || a.half || 0) + ((b.halfR || b.half || 0) - (a.halfR || a.half || 0)) * t,
    i: index,
  };
}

export function sampleAtDist(samples, length, dist) {
  const n = samples.length;
  dist = ((dist % length) + length) % length;
  const last = samples[n - 1];
  if (dist >= last.dist) {
    const span = length - last.dist || 1;
    const t = Math.max(0, Math.min(1, (dist - last.dist) / span));
    return blendSample(last, samples[0], t, dist, n - 1);
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist < dist) lo = mid + 1;
    else hi = mid;
  }
  const b = samples[lo];
  const a = samples[(lo - 1 + n) % n];
  const span = b.dist - a.dist || 1;
  const t = Math.max(0, Math.min(1, (dist - a.dist) / span));
  return blendSample(a, b, t, dist, (lo - 1 + n) % n);
}

export function projectOnTrack(samples, length, x, z, hint) {
  const n = samples.length;
  let best = null;
  const span = hint == null ? n : 18;
  const start = hint == null ? 0 : hint - 4;
  for (let k = 0; k < span; k++) {
    const i = ((start + k) % n + n) % n;
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dx = x - px;
    const dz = z - pz;
    const d2 = dx * dx + dz * dz;
    if (!best || d2 < best.d2) {
      const rx = a.rx;
      const rz = a.rz;
      let dist = a.dist + Math.sqrt(len2) * t;
      if (i === n - 1 && dist >= length) dist -= length;
      best = {
        i,
        d2,
        x: px,
        z: pz,
        lat: dx * rx + dz * rz,
        dist,
        tx: a.tx,
        tz: a.tz,
        rx,
        rz,
        curvature: a.curvature,
        half: (a.half || 0) + ((b.half || 0) - (a.half || 0)) * t,
        halfL: (a.halfL || a.half || 0) + ((b.halfL || b.half || 0) - (a.halfL || a.half || 0)) * t,
        halfR: (a.halfR || a.half || 0) + ((b.halfR || b.half || 0) - (a.halfR || a.half || 0)) * t,
      };
    }
  }
  return best;
}

function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  function cross(px, pz, qx, qz, rx, rz) {
    return (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  }
  const d1 = cross(cx, cz, dx, dz, ax, az);
  const d2 = cross(cx, cz, dx, dz, bx, bz);
  const d3 = cross(ax, az, bx, bz, cx, cz);
  const d4 = cross(ax, az, bx, bz, dx, dz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function crossedGate(x0, z0, x1, z1, gate) {
  if (!segmentsIntersect(x0, z0, x1, z1, gate.x1, gate.z1, gate.x2, gate.z2)) return false;
  const mx = x1 - x0;
  const mz = z1 - z0;
  return mx * gate.tx + mz * gate.tz > 0;
}

function buildGates(samples, length) {
  const gates = [];
  for (let i = 0; i < GATE_COUNT; i++) {
    const dist = (FINISH_DIST + (i * length) / GATE_COUNT) % length;
    const s = sampleAtDist(samples, length, dist);
    const span = (s.half || HALF_WIDTH) + 2;
    gates.push({
      i,
      dist,
      x: s.x,
      z: s.z,
      tx: s.tx,
      tz: s.tz,
      rx: s.rx,
      rz: s.rz,
      x1: s.x - s.rx * span,
      z1: s.z - s.rz * span,
      x2: s.x + s.rx * span,
      z2: s.z + s.rz * span,
      finish: i === 0,
    });
  }
  return gates;
}

const TIGHT_ANG = [0, 0.7, 1.05, Math.PI / 2];
const TIGHT_R = [0, 62, 44, 30];
const STRAIGHT_LEN = 52;

export function defaultPieces() {
  return [{ k: "straight" }, { k: "straight" }];
}

// A closed practice loop: sweepers, an S, and a hairpin, with room on the outside.
export function driftCityPoints() {
  const pts = [[0, 0]];
  let x = 0;
  let z = 0;
  let yaw = 0;
  const push = (px, pz) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(px - last[0], pz - last[1]) < 0.05) return;
    pts.push([px, pz]);
  };
  const fwd = () => [-Math.sin(yaw), -Math.cos(yaw)];
  const straight = (len) => {
    const [fx, fz] = fwd();
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 1; i <= n; i++) push(x + fx * len * (i / n), z + fz * len * (i / n));
    x += fx * len;
    z += fz * len;
  };
  const arc = (sweep, radius) => {
    const steps = Math.max(8, Math.round((Math.abs(sweep) * radius) / 3));
    const dh = sweep / steps;
    const ds = radius * Math.abs(dh);
    for (let i = 0; i < steps; i++) {
      yaw += dh;
      const [fx, fz] = fwd();
      x += fx * ds;
      z += fz * ds;
      push(x, z);
    }
  };
  straight(150);
  arc(Math.PI, 58);
  straight(64);
  arc(0.85, 62);
  arc(-1.7, 58);
  arc(0.85, 62);
  straight(64);
  arc(Math.PI, 64);
  return pts;
}

export function buildDriftCity() {
  const built = buildTrackFromPoints(driftCityPoints(), 14);
  if (built) built.kind = "drift";
  return built;
}

function fwdYaw(yaw) {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

const ROAD_CLEAR = 56;

function pushPt(pts, x, z) {
  const last = pts[pts.length - 1];
  if (last && hypot(x - last[0], z - last[1]) < 0.05) return;
  pts.push([x, z]);
}

function arc(state, sweep, radius) {
  if (Math.abs(sweep) < 1e-4) return;
  const steps = Math.max(4, Math.round((Math.abs(sweep) * radius) / 4));
  const dh = sweep / steps;
  const ds = radius * Math.abs(dh);
  for (let i = 0; i < steps; i++) {
    state.yaw += dh;
    const [fx, fz] = fwdYaw(state.yaw);
    state.x += fx * ds;
    state.z += fz * ds;
    pushPt(state.pts, state.x, state.z);
  }
}

function straight(state, len) {
  if (Math.abs(len) < 0.05) return;
  const [fx, fz] = fwdYaw(state.yaw);
  const dir = len < 0 ? -1 : 1;
  const mag = Math.abs(len);
  const n = Math.max(1, Math.round(mag / 4));
  for (let i = 1; i <= n; i++) {
    pushPt(state.pts, state.x + fx * dir * mag * (i / n), state.z + fz * dir * mag * (i / n));
  }
  state.x += fx * dir * mag;
  state.z += fz * dir * mag;
}

function walkPieces(list, turnScale) {
  const state = { x: 0, z: 0, yaw: 0, pts: [[0, 0]], spans: [] };
  for (const p of list) {
    const a = state.pts.length - 1;
    if (p.k === "straight") straight(state, STRAIGHT_LEN);
    else {
      const t = Math.min(3, Math.max(1, p.t | 0));
      const sweep = (p.k === "left" ? 1 : -1) * TIGHT_ANG[t] * turnScale;
      arc(state, sweep, TIGHT_R[t]);
    }
    state.spans.push({ a, b: state.pts.length - 1, close: false });
  }
  return state;
}

function roadClear(raw) {
  const pts = resample(raw, 2);
  const n = pts.length;
  if (n < 8) return 0;
  const dist = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = dist[n - 1];
  let minD = Infinity;
  const step = 2;
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const along = dist[j] - dist[i];
      const wrap = Math.min(along, total - along);
      if (wrap < 30) continue;
      const d = hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

function polylineClear(pts) {
  const n = pts.length;
  if (n < 8) return 0;
  const dist = [0];
  for (let i = 1; i < n; i++) {
    dist.push(dist[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = dist[n - 1];
  const step = Math.max(1, Math.floor(n / 90));
  // A short loop used to skip every pair, so a chord across the pieces looked clear.
  const skip = 30;
  let minD = Infinity;
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const along = dist[j] - dist[i];
      const wrap = Math.min(along, total - along);
      if (wrap < skip) continue;
      const d = hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

function closePoints(raw, growForClear) {
  const n = raw.length;
  if (n < 8) return null;
  const end = raw[n - 1];
  const pts = raw.map((p, i) => {
    const u = i / (n - 1);
    return [p[0] - end[0] * u, p[1] - end[1] * u];
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const clear = polylineClear(pts);
  let grow = span < 240 ? 240 / span : 1;
  if (growForClear && clear > 2 && clear * grow < ROAD_CLEAR) grow = ROAD_CLEAR / clear;
  if (growForClear && (clear <= 2 || grow > 12)) return null;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return {
    pts: pts.map(([px, pz]) => [(px - cx) * grow, (pz - cz) * grow]),
    clear: clear * grow,
  };
}

function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return n;
}

function pieceList(pieces) {
  return (Array.isArray(pieces) ? pieces : []).filter(
    (p) => p && (p.k === "straight" || p.k === "left" || p.k === "right")
  );
}

function shearHome(raw) {
  const n = raw.length;
  if (n < 8) return null;
  const end = raw[n - 1];
  const gap = hypot(end[0], end[1]);
  if (gap > 1) return null;
  const pts = raw.map((p, i) => {
    const u = i / (n - 1);
    return [p[0] - end[0] * u, p[1] - end[1] * u];
  });
  const clear = roadClear(pts);
  if (!(clear > PIECE_HALF * 2)) return null;
  return { pts, clear };
}

function outAndBack(list) {
  const radius = PIECE_HALF + 6;
  const open = walkPieces(list, 1);
  const state = {
    x: open.x,
    z: open.z,
    yaw: open.yaw,
    pts: open.pts.map((p) => [p[0], p[1]]),
    spans: open.spans,
  };
  const authored = pathLength(state.pts);
  arc(state, Math.PI, radius);
  straight(state, STRAIGHT_LEN);
  arc(state, Math.PI, radius);
  const fitted = shearHome(state.pts);
  if (!fitted) return null;
  const close = pathLength(state.pts) - authored;
  return {
    pts: fitted.pts,
    cut: open.pts.length - 1,
    spans: open.spans,
    authored,
    close,
    clear: fitted.clear,
    closes: [close],
  };
}

function stadium(list) {
  const radius = 15.2;
  const state = { x: 0, z: 0, yaw: 0, pts: [[0, 0]], spans: [] };
  let authored = 0;
  let close = 0;
  list.forEach(() => {
    const a = state.pts.length - 1;
    const before = pathLength(state.pts);
    straight(state, STRAIGHT_LEN);
    authored += pathLength(state.pts) - before;
    state.spans.push({ a, b: state.pts.length - 1, close: false });
    const c0 = pathLength(state.pts);
    arc(state, Math.PI, radius);
    close += pathLength(state.pts) - c0;
  });
  const fitted = shearHome(state.pts);
  if (!fitted || close >= authored) return null;
  const cut = state.spans[state.spans.length - 1].b;
  return { pts: fitted.pts, cut, spans: state.spans, authored, close, clear: fitted.clear, closes: [close] };
}

function keepCorners(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const cut = open.pts.length - 1;
  const spans = open.spans;
  const radii = [18, 26, 36, 48];
  let best = null;
  const closes = [];
  for (const radius of radii) {
    for (let i = 0; i < 16; i++) {
      const alpha = -Math.PI + (i * Math.PI * 2) / 16;
      for (let j = 0; j < 16; j++) {
        const beta = -Math.PI + (j * Math.PI * 2) / 16;
        for (const dist of [0, 24, 48, 72, 96, 120, 150, 180]) {
          const state = walkPieces(list, 1);
          arc(state, alpha, radius);
          if (dist) straight(state, dist);
          arc(state, beta, radius);
          const yawErr = Math.abs(Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw)));
          const gap = hypot(state.x, state.z);
          if (gap > 1 || yawErr > 0.45) continue;
          const close = pathLength(state.pts) - authored;
          const fitted = shearHome(state.pts);
          if (!fitted) continue;
          closes.push(close);
          const plan = { pts: fitted.pts, cut, spans, authored, close, clear: fitted.clear, closes };
          if (!best || close < best.close) best = plan;
        }
      }
    }
  }
  return best;
}

// Run back beside the pieces. Used when a turn-and-straight search never lands on the start.
function besideHome(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const cut = open.pts.length - 1;
  const spans = open.spans;
  let best = null;
  for (const side of [-1, 1]) {
    for (const offset of [34, 42, 56, 72]) {
      const src = open.pts;
      const off = src.map((p, i) => {
        const prev = src[Math.max(0, i - 1)];
        const next = src[Math.min(src.length - 1, i + 1)];
        let fx = next[0] - prev[0];
        let fz = next[1] - prev[1];
        const len = hypot(fx, fz) || 1;
        fx /= len;
        fz /= len;
        return [p[0] - fz * side * offset, p[1] + fx * side * offset];
      });
      const pts = src.map((p) => [p[0], p[1]]);
      const end = src[src.length - 1];
      const before = src[Math.max(0, src.length - 2)];
      let fx = end[0] - before[0];
      let fz = end[1] - before[1];
      const len = hypot(fx, fz) || 1;
      fx /= len;
      fz /= len;
      const endOff = off[off.length - 1];
      pts.push([end[0] + fx * offset, end[1] + fz * offset]);
      pts.push([endOff[0] + fx * offset, endOff[1] + fz * offset]);
      for (let i = off.length - 1; i >= 0; i--) pts.push(off[i]);
      const startOff = off[0];
      const s1 = src[Math.min(src.length - 1, 1)];
      let gx = s1[0] - src[0][0];
      let gz = s1[1] - src[0][1];
      const glen = hypot(gx, gz) || 1;
      gx /= glen;
      gz /= glen;
      pts.push([startOff[0] - gx * offset, startOff[1] - gz * offset]);
      pts.push([-gx * 8, -gz * 8]);
      pts.push([0, 0]);
      const fitted = shearHome(pts);
      if (!fitted) continue;
      const close = pathLength(pts) - authored;
      const plan = { pts: fitted.pts, cut, spans, authored, close, clear: fitted.clear, closes: [close] };
      if (!best || close < best.close) best = plan;
    }
  }
  return best;
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (seq) => {
    const h = [];
    for (const p of seq) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return build(pts).concat(build(pts.slice().reverse()));
}

function pointInside(poly, m) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][1];
    const yj = poly[j][1];
    const denom = yj - yi || 1e-9;
    if ((yi > m[1]) !== (yj > m[1]) && m[0] < ((poly[j][0] - poly[i][0]) * (m[1] - yi)) / denom + poly[i][0]) inn = !inn;
  }
  return inn;
}

// Shortest pavement-clear return: leave the pieces, follow the outside of their hull, come home.
function aroundHome(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const cut = open.pts.length - 1;
  const spans = open.spans;
  const total = authored;
  const hard = [open.pts[0]];
  let acc = 0;
  for (let i = 1; i < open.pts.length; i++) {
    acc += hypot(open.pts[i][0] - open.pts[i - 1][0], open.pts[i][1] - open.pts[i - 1][1]);
    if (acc < total - 40) hard.push(open.pts[i]);
  }
  if (hard.length < 2) return null;
  const pad = PIECE_HALF * 2 + 8;
  const cloud = [];
  for (const p of hard) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      cloud.push([p[0] + Math.cos(a) * pad, p[1] + Math.sin(a) * pad]);
    }
  }
  const poly = convexHull(cloud);
  if (poly.length < 3) return null;
  const end = [open.x, open.z];
  const n = poly.length;
  let best = null;
  for (let i = 0; i < n; i++) {
    const mid = [(end[0] + poly[i][0]) / 2, (end[1] + poly[i][1]) / 2];
    if (pointInside(poly, mid) && hypot(end[0] - poly[i][0], end[1] - poly[i][1]) > 6) continue;
    for (let j = 0; j < n; j++) {
      if (hypot(poly[j][0], poly[j][1]) > pad + 36) continue;
      for (const dir of [1, -1]) {
        const extra = [end];
        extra.push(poly[i]);
        let k = i;
        let guard = 0;
        while (k !== j && guard < n + 2) {
          k = (k + dir + n) % n;
          extra.push(poly[k]);
          guard++;
        }
        extra.push([0, 0]);
        const pts = open.pts.concat(extra);
        const fitted = shearHome(pts);
        if (!fitted) continue;
        const close = pathLength(pts) - authored;
        if (!best || close < best.close) {
          best = { pts: fitted.pts, cut, spans, authored, close, clear: fitted.clear, closes: [close] };
        }
      }
    }
  }
  return best;
}

function polygonStraight(list) {
  const n = list.length;
  if (n < 3) return null;
  const turn = (Math.PI * 2) / n;
  const maxR = (n * STRAIGHT_LEN) / (Math.PI * 2) - 1;
  for (const radius of [22, 20, 18, 16, 14]) {
    if (radius >= maxR) continue;
    const state = { x: 0, z: 0, yaw: 0, pts: [[0, 0]], spans: [] };
    let authored = 0;
    let close = 0;
    for (let i = 0; i < n; i++) {
      const a = state.pts.length - 1;
      const before = pathLength(state.pts);
      straight(state, STRAIGHT_LEN);
      authored += pathLength(state.pts) - before;
      state.spans.push({ a, b: state.pts.length - 1, close: false });
      const c0 = pathLength(state.pts);
      arc(state, turn, radius);
      close += pathLength(state.pts) - c0;
    }
    const fitted = shearHome(state.pts);
    if (!fitted || close >= authored) continue;
    const cut = state.spans[state.spans.length - 1].b;
    return { pts: fitted.pts, cut, spans: state.spans, authored, close, clear: fitted.clear, closes: [close] };
  }
  return null;
}

function beelineHome(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const gap = hypot(open.x, open.z);
  const n = Math.max(1, Math.round(gap / 2));
  const pts = open.pts.map((p) => [p[0], p[1]]);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push([open.x * (1 - t), open.z * (1 - t)]);
  }
  const fitted = shearHome(pts);
  if (!fitted) return null;
  const close = pathLength(pts) - authored;
  return {
    pts: fitted.pts,
    cut: open.pts.length - 1,
    spans: open.spans,
    authored,
    close,
    clear: fitted.clear,
    closes: [close],
  };
}

export function straightHomeLength(pieces) {
  const open = walkPieces(pieceList(pieces), 1);
  return hypot(open.x, open.z);
}

function frameDrift(src, spanS, dst, spanD) {
  const s0 = src[spanS.a];
  const s1 = src[Math.min(spanS.a + 1, spanS.b)];
  const d0 = dst[spanD.a];
  const d1 = dst[Math.min(spanD.a + 1, spanD.b)];
  const as = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  const ad = Math.atan2(d1[1] - d0[1], d1[0] - d0[0]);
  const cos = Math.cos(as - ad);
  const sin = Math.sin(as - ad);
  const sn = Math.max(1, spanS.b - spanS.a);
  const dn = Math.max(1, spanD.b - spanD.a);
  const steps = Math.max(sn, dn);
  let max = 0;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const sp = src[Math.min(spanS.b, spanS.a + Math.round(t * sn))];
    const dp = dst[Math.min(spanD.b, spanD.a + Math.round(t * dn))];
    const rx = dp[0] - d0[0];
    const rz = dp[1] - d0[1];
    const x = rx * cos - rz * sin;
    const z = rx * sin + rz * cos;
    const d = hypot(x - (sp[0] - s0[0]), z - (sp[1] - s0[1]));
    if (d > max) max = d;
  }
  return max;
}

export function placedDrift(pieces) {
  const list = pieceList(pieces);
  const open = walkPieces(list, 1);
  const layout = courseLayout(list);
  if (!layout || !layout.spans || layout.spans.length !== open.spans.length) return Infinity;
  const aligned = open.spans.every((s, i) => s.a === layout.spans[i].a && s.b === layout.spans[i].b);
  const src = open.pts.map(([x, z]) => [x * CUSTOM_SPREAD, z * CUSTOM_SPREAD]);
  let max = 0;
  if (aligned) {
    for (const s of open.spans) {
      for (let i = s.a; i <= s.b && i < layout.pts.length; i++) {
        const d = hypot(src[i][0] - layout.pts[i][0], src[i][1] - layout.pts[i][1]);
        if (d > max) max = d;
      }
    }
    return max;
  }
  for (let i = 0; i < open.spans.length; i++) {
    const d = frameDrift(src, open.spans[i], layout.pts, layout.spans[i]);
    if (d > max) max = d;
  }
  return max;
}

// Minimum distance between built-road samples that are not neighbors along the lap.
export function sampleClear(track, skip = 30) {
  const samples = track.samples;
  const n = samples.length;
  const length = track.length;
  let minD = Infinity;
  const step = 1;
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      let along = samples[j].dist - samples[i].dist;
      if (along < 0) along += length;
      const wrap = Math.min(along, length - along);
      if (wrap < skip) continue;
      const d = Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

export function placedTurnSigns(pieces) {
  const list = pieceList(pieces);
  const open = walkPieces(list, 1);
  const layout = courseLayout(list);
  return open.spans.map((s, i) => {
    const base = spanTurn(open.pts, s.a, s.b);
    const driven = layout ? spanTurn(layout.pts, layout.spans[i].a, layout.spans[i].b) : 0;
    return {
      k: list[i].k,
      kept: Math.abs(base) < 0.4 || base * driven > 0,
    };
  });
}

function spanTurn(pts, a, b) {
  if (b - a < 2) return 0;
  let prev = Math.atan2(pts[a + 1][0] - pts[a][0], pts[a + 1][1] - pts[a][1]);
  let yaw = 0;
  for (let i = a + 1; i < b; i++) {
    const next = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let d = next - prev;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    yaw += d;
    prev = next;
  }
  return yaw;
}

function pushTo(pts, x, z) {
  const last = pts[pts.length - 1];
  const len = hypot(x - last[0], z - last[1]);
  const n = Math.max(1, Math.round(len / 4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push([last[0] + (x - last[0]) * t, last[1] + (z - last[1]) * t]);
  }
}

function boxHome(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const pad = PIECE_HALF * 2 + 24;
  let minX = -pad;
  let maxX = pad;
  let minZ = -pad;
  let maxZ = pad;
  for (const p of open.pts) {
    minX = Math.min(minX, p[0] - pad);
    maxX = Math.max(maxX, p[0] + pad);
    minZ = Math.min(minZ, p[1] - pad);
    maxZ = Math.max(maxZ, p[1] + pad);
  }
  const ring = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
  const end = [open.x, open.z];
  let door = 0;
  let doorD = Infinity;
  ring.forEach((c, i) => {
    const d = hypot(end[0] - c[0], end[1] - c[1]);
    if (d < doorD) {
      doorD = d;
      door = i;
    }
  });
  let aim = 0;
  let aimD = -1;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    let minD = Infinity;
    for (let s = 12; s <= 48; s += 6) {
      const x = dx * s;
      const z = dz * s;
      let near = Infinity;
      for (let p = 1; p < open.pts.length; p++) {
        const ax = open.pts[p - 1][0];
        const az = open.pts[p - 1][1];
        const bx = open.pts[p][0];
        const bz = open.pts[p][1];
        const ex = bx - ax;
        const ez = bz - az;
        const L2 = ex * ex + ez * ez || 1;
        let t = ((x - ax) * ex + (z - az) * ez) / L2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = ax + ex * t;
        const qz = az + ez * t;
        if (hypot(qx, qz) < 14) continue;
        near = Math.min(near, hypot(x - qx, z - qz));
      }
      minD = Math.min(minD, near);
    }
    if (minD > aimD) {
      aimD = minD;
      aim = ang;
    }
  }
  const gates = [
    { at: [Math.cos(aim) * Math.max(maxX, -minX), Math.sin(aim) * Math.max(maxZ, -minZ)], edge: [0, 1, 2, 3] },
    { at: [0, maxZ], edge: [2, 3] },
    { at: [0, minZ], edge: [0, 1] },
    { at: [maxX, 0], edge: [1, 2] },
    { at: [minX, 0], edge: [3, 0] },
  ];
  let best = null;
  let seen = 0;
  for (const gate of gates) {
    for (const dir of [1, -1]) {
      const pts = open.pts.map((p) => [p[0], p[1]]);
      let k = door;
      pushTo(pts, ring[k][0], ring[k][1]);
      for (let step = 0; step < 4 && gate.edge.indexOf(k) < 0; step++) {
        k = (k + dir + 4) % 4;
        pushTo(pts, ring[k][0], ring[k][1]);
      }
      if (gate.edge.indexOf(k) < 0) continue;
      pushTo(pts, gate.at[0], gate.at[1]);
      pushTo(pts, 0, 0);
      const raw = roadClear(pts);
      if (raw > seen) seen = raw;
      const fitted = shearHome(pts);
      if (!fitted) continue;
      const close = pathLength(pts) - authored;
      const plan = {
        pts: fitted.pts,
        cut: open.pts.length - 1,
        spans: open.spans,
        authored,
        close,
        clear: fitted.clear,
        closes: [close],
      };
      if (!best || close < best.close) best = plan;
    }
  }
  return best;
}

function pieceSegs(pts) {
  const segs = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1][0];
    const z0 = pts[i - 1][1];
    const x1 = pts[i][0];
    const z1 = pts[i][1];
    const len = hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    segs.push({
      x0, z0, x1, z1, s0: s, s1: s + len, len,
      minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
      minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
    });
    s += len;
  }
  return segs;
}

function distRange(x, z, segs, sMin, sMax) {
  let best = Infinity;
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (s.s1 <= sMin || s.s0 >= sMax) continue;
    if (x < s.minX - best || x > s.maxX + best || z < s.minZ - best || z > s.maxZ + best) continue;
    let t0 = 0;
    let t1 = 1;
    if (s.s0 < sMin) t0 = (sMin - s.s0) / s.len;
    if (s.s1 > sMax) t1 = (sMax - s.s0) / s.len;
    if (t1 < t0) continue;
    const ax = s.x0 + (s.x1 - s.x0) * t0;
    const az = s.z0 + (s.z1 - s.z0) * t0;
    const bx = s.x0 + (s.x1 - s.x0) * t1;
    const bz = s.z0 + (s.z1 - s.z0) * t1;
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const d = hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function densePair(raw) {
  const pts = resample(raw, 1);
  const n = pts.length;
  if (n < 8) return { minD: 0, a: 0, b: 0, total: 0 };
  const dist = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = dist[n - 1];
  let minD = Infinity;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const along = dist[j] - dist[i];
      const wrap = along < total - along ? along : total - along;
      if (wrap < 30) continue;
      const d = hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minD) {
        minD = d;
        a = dist[i];
        b = dist[j];
      }
    }
  }
  return { minD, a, b, total };
}

function denseClear(raw) {
  return densePair(raw).minD;
}

function heapPush(h, cost, id) {
  h.push(cost, id);
  let i = (h.length >> 1) - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p * 2] <= h[i * 2]) break;
    const c = h[p * 2];
    const d = h[p * 2 + 1];
    h[p * 2] = h[i * 2];
    h[p * 2 + 1] = h[i * 2 + 1];
    h[i * 2] = c;
    h[i * 2 + 1] = d;
    i = p;
  }
}

function heapPop(h) {
  const cost = h[0];
  const id = h[1];
  const lastC = h[h.length - 2];
  const lastI = h[h.length - 1];
  h.length -= 2;
  if (h.length) {
    h[0] = lastC;
    h[1] = lastI;
    let i = 0;
    const n = h.length >> 1;
    for (;;) {
      let s = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < n && h[l * 2] < h[s * 2]) s = l;
      if (r < n && h[r * 2] < h[s * 2]) s = r;
      if (s === i) break;
      const c = h[i * 2];
      const d = h[i * 2 + 1];
      h[i * 2] = h[s * 2];
      h[i * 2 + 1] = h[s * 2 + 1];
      h[s * 2] = c;
      h[s * 2 + 1] = d;
      i = s;
    }
  }
  return { cost, id };
}

// Way home stays off the placed pieces. The pieces themselves are not moved.
function clearHome(list) {
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const segs = pieceSegs(open.pts);
  if (!segs.length) return null;
  const near = 30;
  const blockR = PIECE_HALF * 2 + 0.35;
  const need = PIECE_HALF * 2 + 0.2;

  function allowed(x, z, kind, g) {
    if (kind === "exit") return distRange(x, z, segs, 0, authored - (near - g)) >= blockR;
    return distRange(x, z, segs, near - g, authored + 1) >= blockR;
  }

  function raysFrom(x, z, kind) {
    const found = [];
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const path = [];
      let portal = null;
      for (let step = 1; step <= 14; step++) {
        const g = step * 2;
        const px = x + dx * g;
        const pz = z + dz * g;
        if (!allowed(px, pz, kind, g) || !allowed(x + dx * (g - 1), z + dz * (g - 1), kind, g - 1)) break;
        path.push([px, pz]);
        if (distRange(px, pz, segs, 0, authored + 1) >= blockR) {
          portal = { x: px, z: pz, path: path.map((p) => [p[0], p[1]]), g };
          break;
        }
      }
      if (portal) found.push(portal);
    }
    return found;
  }

  const exits = raysFrom(open.x, open.z, "exit");
  const arrivals = raysFrom(0, 0, "approach");
  if (!exits.length || !arrivals.length) return null;

  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;
  for (const p of open.pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const pad = blockR + 36;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;
  const cell = 2;
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  if (nx < 4 || nz < 4 || nx * nz > 160000) return null;
  const blocked = new Uint8Array(nx * nz);
  const stamp = blockR + 0.25;
  for (const s of segs) {
    const steps = Math.max(1, Math.ceil(s.len / cell));
    for (let t = 0; t <= steps; t++) {
      const u = t / steps;
      const x = s.x0 + (s.x1 - s.x0) * u;
      const z = s.z0 + (s.z1 - s.z0) * u;
      const i0 = Math.max(0, Math.floor((x - stamp - minX) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((x + stamp - minX) / cell));
      const j0 = Math.max(0, Math.floor((z - stamp - minZ) / cell));
      const j1 = Math.min(nz - 1, Math.ceil((z + stamp - minZ) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = minX + i * cell;
          const cz = minZ + j * cell;
          const dx = cx - x;
          const dz = cz - z;
          if (dx * dx + dz * dz <= stamp * stamp) blocked[j * nx + i] = 1;
        }
      }
    }
  }
  const at = (x, z) => [Math.round((x - minX) / cell), Math.round((z - minZ) / cell)];
  function nearestFree(i, j) {
    for (let rad = 0; rad <= 4; rad++) {
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) {
          if (rad && Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 1 || nj < 1 || ni >= nx - 1 || nj >= nz - 1) continue;
          if (!blocked[nj * nx + ni]) return ni + nj * nx;
        }
      }
    }
    return -1;
  }
  const exitAt = new Map();
  exits.forEach((portal, n) => {
    const [i, j] = at(portal.x, portal.z);
    const id = nearestFree(i, j);
    if (id < 0) return;
    const prev = exitAt.get(id);
    if (!prev || portal.g < prev.g) exitAt.set(id, portal);
  });
  const arriveAt = new Map();
  arrivals.forEach((portal) => {
    const [i, j] = at(portal.x, portal.z);
    const id = nearestFree(i, j);
    if (id < 0 || exitAt.has(id)) return;
    const prev = arriveAt.get(id);
    if (!prev || portal.g < prev.g) arriveAt.set(id, portal);
  });
  if (!exitAt.size || !arriveAt.size) return null;

  const cost = new Float64Array(nx * nz);
  cost.fill(Infinity);
  const parent = new Int32Array(nx * nz);
  parent.fill(-1);
  const heap = [];
  for (const [id, portal] of exitAt) {
    cost[id] = portal.g;
    heapPush(heap, portal.g, id);
  }
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  const reached = [];
  while (heap.length && reached.length < arriveAt.size) {
    const cur = heapPop(heap);
    if (cur.cost !== cost[cur.id]) continue;
    if (arriveAt.has(cur.id)) reached.push(cur.id);
    const i = cur.id % nx;
    const j = (cur.id - i) / nx;
    for (const [di, dj, mul] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 1 || nj < 1 || ni >= nx - 1 || nj >= nz - 1) continue;
      const nid = ni + nj * nx;
      if (blocked[nid]) continue;
      if (di && dj && (blocked[j * nx + ni] || blocked[nj * nx + i])) continue;
      const next = cur.cost + cell * mul;
      if (next >= cost[nid]) continue;
      cost[nid] = next;
      parent[nid] = cur.id;
      heapPush(heap, next, nid);
    }
  }

  let best = null;
  reached.sort((a, b) => cost[a] + arriveAt.get(a).g - (cost[b] + arriveAt.get(b).g));
  const tryIds = reached.slice(0, 12);
  for (const id of tryIds) {
    const cells = [];
    let cur = id;
    let guard = 0;
    let exitPortal = null;
    while (cur >= 0 && guard < nx * nz) {
      cells.push(cur);
      if (exitAt.has(cur)) {
        exitPortal = exitAt.get(cur);
        break;
      }
      cur = parent[cur];
      guard++;
    }
    if (!exitPortal) continue;
    cells.reverse();
    const pts = open.pts.map((p) => [p[0], p[1]]);
    for (const p of exitPortal.path) pts.push([p[0], p[1]]);
    for (const c of cells) {
      const i = c % nx;
      const j = (c - i) / nx;
      pts.push([minX + i * cell, minZ + j * cell]);
    }
    const arrive = arriveAt.get(id);
    for (let i = arrive.path.length - 1; i >= 0; i--) pts.push([arrive.path[i][0], arrive.path[i][1]]);
    pts.push([0, 0]);
    const cut = open.pts.length - 1;
    const tail0 = cut + 1;
    const pulled = pts.slice(0, tail0);
    let i = tail0;
    while (i < pts.length - 1) {
      let far = i + 1;
      const stop = pts.length - 1;
      for (let j = stop; j > i + 1; j--) {
        const len = hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
        const n = Math.max(1, Math.ceil(len / 2));
        let ok = true;
        for (let s = 0; s <= n; s++) {
          const t = s / n;
          const x = pts[i][0] + (pts[j][0] - pts[i][0]) * t;
          const z = pts[i][1] + (pts[j][1] - pts[i][1]) * t;
          if (distRange(x, z, segs, 0, authored + 1) < blockR) { ok = false; break; }
        }
        if (ok) { far = j; break; }
      }
      pulled.push(pts[far]);
      i = far;
    }
    let candidate = pulled.length > tail0 + 2 ? pulled : pts;
    if (!(denseClear(candidate) > need)) candidate = pts;
    if (!(denseClear(candidate) > need)) continue;
    const fitted = shearHome(candidate);
    if (!fitted) continue;
    const close = pathLength(fitted.pts) - authored;
    return {
      pts: fitted.pts,
      cut,
      spans: open.spans,
      authored,
      close,
      clear: fitted.clear,
      closes: [close],
    };
  }
  return best;
}

// The straight / left-2 / right-3 chain ends far from the start. Extra heading at the
// joints, filleted so it is a corner you can drive, lets that chain come home short.
function foldedHook(list) {
  if (list.length !== 3) return null;
  if (list[0].k !== "straight" || list[1].k !== "left" || list[2].k !== "right") return null;
  if ((list[1].t | 0) !== 2 || (list[2].t | 0) !== 3) return null;
  const open = walkPieces(list, 1);
  const authored = pathLength(open.pts);
  const state = { x: 0, z: 0, yaw: 0, pts: [[0, 0]], spans: [] };
  const spans = [];
  let a = 0;
  straight(state, STRAIGHT_LEN);
  spans.push({ a, b: state.pts.length - 1, close: false });
  arc(state, 1.36, 14);
  a = state.pts.length - 1;
  arc(state, TIGHT_ANG[2], TIGHT_R[2]);
  spans.push({ a, b: state.pts.length - 1, close: false });
  arc(state, 2.11, 14);
  a = state.pts.length - 1;
  arc(state, -TIGHT_ANG[3], TIGHT_R[3]);
  spans.push({ a, b: state.pts.length - 1, close: false });
  const cut = state.pts.length - 1;
  const want = Math.atan2(state.x, state.z);
  let sweep = want - state.yaw;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  if (Math.abs(sweep) > 0.05) arc(state, sweep, 16);
  if (hypot(state.x, state.z) > 0.3) {
    const n = Math.max(1, Math.round(hypot(state.x, state.z) / 4));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pushPt(state.pts, state.x * (1 - t), state.z * (1 - t));
    }
  }
  const end = state.pts[state.pts.length - 1];
  end[0] = 0;
  end[1] = 0;
  const fitted = shearHome(state.pts);
  if (!fitted) return null;
  const close = pathLength(fitted.pts) - authored;
  if (!(close < authored)) return null;
  return { pts: fitted.pts, cut, spans, authored, close, clear: fitted.clear, closes: [close] };
}

function pickShorter(a, b) {
  if (!a) return b;
  if (!b) return a;
  const closes = (a.closes || [a.close]).concat(b.closes || [b.close]);
  const best = a.close <= b.close ? a : b;
  return { ...best, closes };
}

let layoutCacheKey = "";
let layoutCache = null;

export function courseLayout(pieces) {
  const list = pieceList(pieces);
  if (!list.length) return null;
  const key = JSON.stringify(list);
  if (key === layoutCacheKey) return layoutCache;
  let sum = 0;
  let turns = 0;
  for (const p of list) {
    if (p.k === "straight") continue;
    turns += 1;
    const t = Math.min(3, Math.max(1, p.t | 0));
    sum += (p.k === "left" ? 1 : -1) * TIGHT_ANG[t];
  }
  let layout = null;
  if (!turns && list.length === 1) layout = pickShorter(clearHome(list), outAndBack(list));
  else if (!turns) layout = stadium(list) || polygonStraight(list);
  else if (Math.abs(sum) >= 0.15) {
    const target = sum > 0 ? Math.PI * 2 : -Math.PI * 2;
    const scale = target / sum;
    if (scale >= 1 / 1.35 && scale <= 1.35) {
      const walked = walkPieces(list, scale);
      const gentle = closePoints(walked.pts, false);
      if (gentle && gentle.clear >= PIECE_HALF * 2 + 4) {
        layout = {
          pts: gentle.pts,
          cut: gentle.pts.length - 1,
          spans: walked.spans,
          authored: pathLength(walked.pts),
          close: 0,
          clear: gentle.clear,
        };
      }
    }
  }
  // A canceling pair has no net turn, and a lone straight is not a stadium.
  // The return is appended. The placed points stay put.
  if (!layout) layout = foldedHook(list) || beelineHome(list) || clearHome(list);
  if (!layout) layout = pickShorter(keepCorners(list), aroundHome(list));
  if (!layout) layout = besideHome(list) || boxHome(list);
  layout = spreadLayout(layout);
  layoutCacheKey = key;
  layoutCache = layout;
  return layout;
}

function spreadLayout(layout) {
  if (!layout || !layout.pts || CUSTOM_SPREAD === 1) return layout;
  const s = CUSTOM_SPREAD;
  return {
    ...layout,
    pts: layout.pts.map(([x, z]) => [x * s, z * s]),
    authored: (layout.authored || 0) * s,
    close: (layout.close || 0) * s,
    clear: (layout.clear || 0) * s,
    closes: layout.closes ? layout.closes.map((n) => n * s) : layout.closes,
  };
}

export function piecesToPoints(pieces) {
  const layout = courseLayout(pieces);
  return layout ? layout.pts : null;
}

// The editor map always has a line when pieces exist, even before a loop is found.
export function editorPreview(pieces) {
  const list = pieceList(pieces);
  if (!list.length) return null;
  const layout = courseLayout(list);
  if (layout && layout.pts && layout.pts.length > 2) return layout;
  const open = walkPieces(list, 1);
  return { pts: open.pts, spans: open.spans, cut: open.pts.length - 1 };
}

function reframeHeading(samples) {
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const b = samples[(i + 1) % n];
    let tx = b.x - samples[i].x;
    let tz = b.z - samples[i].z;
    const mag = hypot(tx, tz) || 1;
    tx /= mag;
    tz /= mag;
    samples[i].tx = tx;
    samples[i].tz = tz;
    samples[i].rx = -tz;
    samples[i].rz = tx;
  }
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const nxt = samples[(i + 1) % n];
    const ds = hypot(nxt.x - s.x, nxt.z - s.z) || 1;
    const dHead = wrapAngle(Math.atan2(nxt.tz, nxt.tx) - Math.atan2(s.tz, s.tx));
    s.curvature = dHead / ds;
  }
}

// Shoved samples can pile onto one spot. The step between them is shorter
// than a meter, and that heading points sideways, so a shoulder drawn from
// it spikes out of the lane. Keep one point and walk the line again at an
// even step so every heading matches the chord the kart actually drives.
function retieCenterline(samples) {
  const kept = [];
  for (const s of samples) {
    const q = kept[kept.length - 1];
    if (q && hypot(s.x - q[0], s.z - q[1]) < 0.75) continue;
    kept.push([s.x, s.z]);
  }
  if (kept.length > 3) {
    const a = kept[0];
    const b = kept[kept.length - 1];
    if (hypot(a[0] - b[0], a[1] - b[1]) < 0.75) kept.pop();
  }
  if (kept.length < 8) return null;
  const built = buildSamples(dedupe(kept));
  reframeHeading(built.samples);
  return built;
}

// After the line is retied, a fold can still sit closer than the road is wide.
// Move both samples apart. Do not smooth afterwards; smoothing pulls the fold shut.
// A clearance nudge can shove one sample sideways and leave a zigzag the
// karts cannot drive. Ease only those sharp corners back toward the road.
function easeKinks(samples, sharp = 0.92, stepCap = 1.1) {
  const n = samples.length;
  for (let pass = 0; pass < 14; pass++) {
    const xs = samples.map((s) => s.x);
    const zs = samples.map((s) => s.z);
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const ix = xs[i] - xs[a];
      const iz = zs[i] - zs[a];
      const ox = xs[b] - xs[i];
      const oz = zs[b] - zs[i];
      const im = hypot(ix, iz) || 1;
      const om = hypot(ox, oz) || 1;
      const dot = (ix / im) * (ox / om) + (iz / im) * (oz / om);
      if (dot > sharp) continue;
      const tx = (xs[a] + xs[b]) * 0.5;
      const tz = (zs[a] + zs[b]) * 0.5;
      let dx = tx - xs[i];
      let dz = tz - zs[i];
      const mag = hypot(dx, dz);
      if (mag < 1e-4) continue;
      const step = Math.min(mag * 0.7, stepCap);
      samples[i].x = xs[i] + (dx / mag) * step;
      samples[i].z = zs[i] + (dz / mag) * step;
      moved = true;
    }
    if (!moved) break;
  }
  reframeHeading(samples);
}

function holdGap(samples, length, gap, pushCap = 1.2) {
  const n = samples.length;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let along = samples[j].dist - samples[i].dist;
        if (along > length * 0.5) along = length - along;
        if (along < 30) continue;
        const dx = samples[j].x - samples[i].x;
        const dz = samples[j].z - samples[i].z;
        const d = hypot(dx, dz);
        if (!(d < gap) || d < 0.05) continue;
        const push = Math.min(gap - d, pushCap);
        const nx = dx / d;
        const nz = dz / d;
        const half = push * 0.5;
        samples[i].x -= nx * half;
        samples[i].z -= nz * half;
        samples[j].x += nx * half;
        samples[j].z += nz * half;
        moved = true;
      }
    }
    if (!moved) break;
  }
  reframeHeading(samples);
}

function pryApart(samples, length, gap, smooth = true) {
  const n = samples.length;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let along = samples[j].dist - samples[i].dist;
        if (along > length * 0.5) along = length - along;
        if (along < 30) continue;
        const dx = samples[j].x - samples[i].x;
        const dz = samples[j].z - samples[i].z;
        const d = hypot(dx, dz);
        if (!(d < gap) || d < 0.05) continue;
        const push = Math.min(gap - d, 6);
        const nx = dx / d;
        const nz = dz / d;
        samples[j].x += nx * push;
        samples[j].z += nz * push;
      }
    }
  }
  if (smooth) unknotCenterline(samples);
  reframeHeading(samples);
}

// A shoved sample can turn almost sideways from its neighbors. The wall quad
// then chords across the lane. Pull those kinks back toward the chord.
function unknotCenterline(samples) {
  const n = samples.length;
  for (let pass = 0; pass < 14; pass++) {
    const xs = samples.map((s) => s.x);
    const zs = samples.map((s) => s.z);
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const ix = xs[i] - xs[a];
      const iz = zs[i] - zs[a];
      const ox = xs[b] - xs[i];
      const oz = zs[b] - zs[i];
      const im = hypot(ix, iz) || 1;
      const om = hypot(ox, oz) || 1;
      const dot = (ix / im) * (ox / om) + (iz / im) * (oz / om);
      if (dot > 0.94) continue;
      samples[i].x = xs[i] * 0.2 + (xs[a] + xs[b]) * 0.4;
      samples[i].z = zs[i] * 0.2 + (zs[a] + zs[b]) * 0.4;
      moved = true;
    }
    if (!moved) break;
  }
}

export function buildTrackFromPoints(raw, halfW = HALF_WIDTH, pry) {
  const dense = resample(dedupe(raw), 2);
  if (dense.length < 8) return null;
  const built = buildSamples(dense);
  let { samples } = built;
  let length = built.length;
  if (pry) {
    pryApart(samples, length, halfW * 2 + 4);
    const retied = retieCenterline(samples);
    if (retied) {
      samples = retied.samples;
      length = retied.length;
    }
    // Distances now match the moved line. Nudge a fold that still overlaps
    // the road. A small cap keeps the nudge from throwing a kink across the lane.
    holdGap(samples, length, halfW * 2 + 0.6);
    easeKinks(samples);
    holdGap(samples, length, halfW * 2 + 0.4, 0.45);
    easeKinks(samples, 0.7, 0.55);
  }
  widenTurns(samples, length, halfW);
  const outside = outsideSign(samples);
  const gates = buildGates(samples, length);
  return {
    samples,
    length,
    halfW,
    outside,
    gates,
    gateGap: length / GATE_COUNT,
    finishDist: Math.min(FINISH_DIST, length * 0.2),
  };
}

export function buildTrackFromPieces(pieces) {
  const pts = piecesToPoints(pieces);
  if (!pts) return null;
  const built = buildTrackFromPoints(pts, CUSTOM_HALF, true);
  if (built) built.kind = "custom";
  return built;
}

export function buildTrack() {
  const built = buildTrackFromPoints(rawLoop());
  if (built) built.kind = "city";
  return built;
}

// Grid sits on the opening straight, finish line a short run ahead.
export function makeField(track) {
  const finish = FINISH_DIST;
  const specs = [
    { name: "ROOK", color: "#ffb020", accent: "#ffe08a", dist: finish - 34, lat: -6.5, player: false, ai: { lookahead: 16, corner: 0.45, drift: 0.15, lane: -4.2, mul: 1.01 } },
    { name: "VEX", color: "#ff4fd8", accent: "#ffd0f4", dist: finish - 34, lat: 6.5, player: false, ai: { lookahead: 12, corner: 1, drift: 0.85, lane: 4.2, mul: 0.99 } },
    { name: "YOU", color: "#3ef0ff", accent: "#ffffff", dist: finish - 44, lat: -6.5, player: true, ai: null },
    { name: "NYX", color: "#c6ff4a", accent: "#f4ffd0", dist: finish - 44, lat: 6.5, player: false, ai: { lookahead: 13, corner: 0.8, drift: 0.4, lane: 0.4, mul: 0.98 } },
  ];
  return specs.map((spec) => {
    const s = sampleAtDist(track.samples, track.length, spec.dist);
    const yaw = yawOf(s.tx, s.tz);
    const room = track.halfW - 1.2 - EDGE_SCRUB_M - 0.3;
    const lat = Math.max(-room, Math.min(room, spec.lat));
    const ai = spec.ai ? { ...spec.ai, lane: Math.max(-room, Math.min(room, spec.ai.lane)) } : null;
    return {
      name: spec.name,
      color: spec.color,
      accent: spec.accent,
      player: spec.player,
      ai,
      x: s.x + s.rx * lat,
      z: s.z + s.rz * lat,
      yaw,
      vx: 0,
      vz: 0,
      prevX: s.x + s.rx * lat,
      prevZ: s.z + s.rz * lat,
      radius: 1.2,
      hop: 0,
      hopV: 0,
      drifting: false,
      driftCharge: 0,
      boost: 0,
      boostKind: 0,
      steer: 0,
      lon: 0,
      projIndex: s.i,
      prevDist: spec.dist,
      travel: spec.dist,
      expected: 0,
      sectors: 0,
      lap: 0,
      finished: false,
      finishTime: 0,
      wrong: 0,
      speedMul: 1,
      turboCharges: 0,
      turboTier: 0,
      turboLeft: 0,
      turboDown: false,
      driftHold: 0,
      driftBoostLeft: 0,
      driftBoostHold: 0,
    };
  });
}

export function lateralOf(track, x, z) {
  let best = Infinity;
  let lat = 0;
  const samples = track.samples;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      lat = dx * s.rx + dz * s.rz;
    }
  }
  return lat;
}

// yaw is the mesh rotation.y. Three.js Y rotation: local (lx, lz) -> (lx*cos + lz*sin, -lx*sin + lz*cos).
export function boxClearsRoad(track, x, z, yaw, w, d, pad) {
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  const limit = track.halfW + pad;
  for (const lx of [-w / 2, 0, w / 2]) {
    for (const lz of [-d / 2, 0, d / 2]) {
      const wx = x + lx * c + lz * si;
      const wz = z - lx * si + lz * c;
      if (Math.abs(lateralOf(track, wx, wz)) < limit) return false;
    }
  }
  return true;
}

export function scenerySpot(track, s, w, d, base, pad = 2) {
  const yaw = Math.atan2(s.tx, s.tz);
  for (let extra = 0; extra <= 64; extra += 4) {
    const set = base + extra;
    const x = s.x + s.rx * track.outside * set;
    const z = s.z + s.rz * track.outside * set;
    if (boxClearsRoad(track, x, z, yaw, w, d, pad)) return { x, z, yaw };
  }
  return null;
}

export function yawOf(tx, tz) {
  // Face direction (tx, tz) with a -Z nose: yaw = atan2(-tx, -tz).
  return Math.atan2(-tx, -tz);
}

export function trackReport(track) {
  const n = track.samples.length;
  let minClear = Infinity;
  let minI = 0;
  let minJ = 0;
  for (let i = 0; i < n; i++) {
    const a = track.samples[i];
    for (let j = i + 1; j < n; j++) {
      const along = Math.abs(track.samples[j].dist - a.dist);
      const alongWrap = Math.min(along, track.length - along);
      if (alongWrap < 110) continue;
      const b = track.samples[j];
      const d = hypot(a.x - b.x, a.z - b.z);
      if (d < minClear) {
        minClear = d;
        minI = i;
        minJ = j;
      }
    }
  }
  const end = track.samples[n - 1];
  const first = track.samples[0];
  const closeGap = hypot(end.x - first.x, end.z - first.z);
  return { length: track.length, samples: n, minClear, minI, minJ, closeGap, outside: track.outside };
}
