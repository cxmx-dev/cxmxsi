// Arcade drift kart. One heading frame:
// yaw 0 faces world -Z. forward = (-sin(yaw), -cos(yaw)).
// Positive steer is a right turn, which decreases yaw (clockwise from above).

import { crossedGate, edgeScrubLat, projectOnTrack, sampleAtDist, yawOf } from "./track.js";

export const TUNE = {
  maxSpeed: 30,
  reverse: 7,
  accel: 24,
  brake: 38,
  grip: 7.2,
  driftGrip: 1.45,
  turnRate: 2.05,
  driftTurn: 4.4,
  steerFloor: 0.42,
  driftMinSpeed: 9,
  driftMinSteer: 0.08,
  miniCharge: 0.42,
  superCharge: 0.95,
  miniBoost: 0.7,
  superBoost: 1.05,
  miniKick: 22,
  superKick: 40,
};

export const TURBO_MAX = 3;
export const TURBO_TIME = 15;

export function turboMultiplier(k) {
  const tier = k.turboTier || 0;
  if (tier >= 2) return 3;
  if (tier === 1) return 2;
  return 1;
}

export function addTurboCharge(k) {
  const have = k.turboCharges || 0;
  if (have >= TURBO_MAX) return false;
  k.turboCharges = have + 1;
  return true;
}

function spendTurbo(k) {
  if ((k.turboCharges || 0) <= 0) return;
  if ((k.turboTier || 0) < 2) k.turboTier = (k.turboTier || 0) + 1;
  k.turboLeft = TURBO_TIME;
  k.turboCharges -= 1;
  k.turboPing = true;
  k.turboSurge = true;
}

export function breakTurbo(k) {
  if ((k.turboTier || 0) <= 0 && (k.turboLeft || 0) <= 0) return;
  k.turboTier = 0;
  k.turboLeft = 0;
  k.turboBreak = true;
}

export function breakDrift(k) {
  k.driftHold = 0;
  k.driftBoostLeft = 0;
  k.driftBoostHold = 0;
  k.driftSurge = false;
  k.drifting = false;
  k.driftArmed = false;
  k.driftMix = 0;
}

let driftPercent = 0.5;

export function setDriftRise(percent) {
  const n = Number(percent);
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : driftPercent;
  driftPercent = Math.round(clamped * 4) / 4;
  return driftPercent;
}

function driftLoose() {
  const rise = Math.max(0, Math.min(5, driftPercent)) / 5;
  return 0.9 - rise * 0.55;
}

// side +1 is a right-hand slide. Into keeps turning that way. Counter is the opposite input catching it.
export function driftControl(steer, side) {
  const s = side || Math.sign(steer) || 0;
  if (!s) return { side: 0, into: 0, counter: 0 };
  const along = steer * s;
  return { side: s, into: Math.max(0, along), counter: Math.max(0, -along) };
}

// The drift bar used to fill over 0.85s of holding the button. Half of that, at every rise setting.
export const DRIFT_BAR_FILL_S = 0.425;
export const DRIFT_BAR_HOLD_S = 0.25;

export function driftBarFill(held) {
  return Math.max(0.14, Math.min(1, (held || 0) / DRIFT_BAR_FILL_S));
}

// Slow at 0.5s of drift, then faster with no ceiling.
export function driftCycleHz(seconds) {
  if (!(seconds >= 0.5)) return 0;
  const t = seconds - 0.5;
  return 0.4 + t * t * 2.6;
}

const DRIFT_SPEED_CAP = 1.2;

function driftSpeedMul(k) {
  if ((k.driftBoostLeft || 0) <= 0) return 1;
  return 1 + Math.min(k.driftBoostHold || 0, DRIFT_SPEED_CAP);
}

export function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightFromForward(fwd) {
  return { x: -fwd.z, z: fwd.x };
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function wrapAngle(a) {
  const t = Math.PI * 2;
  return ((a + Math.PI) % t + t) % t - Math.PI;
}

function damp(from, to, lambda, dt) {
  return to + (from - to) * Math.exp(-lambda * dt);
}

function signedSpeed(k) {
  const f = forwardFromYaw(k.yaw);
  return k.vx * f.x + k.vz * f.z;
}

// Standing smoke. Plane local Y is world up. Plane normal faces the camera, so the stripe is vertical.
// A vertical sliver. The face points mostly across the road, turned a little toward
// the chase camera, so it reads as a stripe and not a poster filling the view.
export function trailStripe(yaw) {
  const fwd = forwardFromYaw(yaw);
  const right = rightFromForward(fwd);
  let faceX = right.x * 0.84 - fwd.x * 0.54;
  let faceZ = right.z * 0.84 - fwd.z * 0.54;
  const fl = Math.hypot(faceX, faceZ) || 1;
  faceX /= fl;
  faceZ /= fl;
  return {
    sideX: faceZ,
    sideY: 0,
    sideZ: -faceX,
    upX: 0,
    upY: 1,
    upZ: 0,
    faceX,
    faceY: 0,
    faceZ,
  };
}

export function trailFace(yaw, camX, camZ, x, z) {
  const fwd = forwardFromYaw(yaw);
  let zx = camX - x;
  let zz = camZ - z;
  if (zx * zx + zz * zz < 1e-4) {
    zx = -fwd.x;
    zz = -fwd.z;
  }
  const len = Math.hypot(zx, zz) || 1;
  zx /= len;
  zz /= len;
  return {
    sideX: zz,
    sideY: 0,
    sideZ: -zx,
    upX: 0,
    upY: 1,
    upZ: 0,
    faceX: zx,
    faceY: 0,
    faceZ: zz,
    rearX: -fwd.x,
    rearZ: -fwd.z,
  };
}

// Loop stands in the X-Y plane. a = 0 is the bottom, facing the sign of travel.
// Outward is away from the center (wheels). Roof up is toward the center.
export function loopFrame(a, sign) {
  const s = sign < 0 ? -1 : 1;
  const ox = Math.sin(a) * s;
  const oy = -Math.cos(a);
  const faceX = Math.cos(a) * s;
  const faceY = Math.sin(a);
  const upX = -ox;
  const upY = -oy;
  return {
    ox,
    oy,
    faceX,
    faceY,
    faceZ: 0,
    upX,
    upY,
    upZ: 0,
    rightZ: faceX * upY - faceY * upX,
  };
}

export function stuntProps() {
  return {
    halfX: 180,
    halfZ: 150,
    spawn: { x: -150, z: 0, yaw: -Math.PI / 2 },
    ramps: [
      { x0: -112, x1: -90, z0: -12, z1: 12, tall: 6, dir: 1 },
      { x0: -24, x1: -2, z0: 74, z1: 98, tall: 8, dir: 1 },
      { x0: 26, x1: 50, z0: 74, z1: 98, tall: 8, dir: -1 },
      { x0: 48, x1: 72, z0: -118, z1: -94, tall: 8, dir: 1 },
    ],
    pipe: { x: -46, z0: -128, z1: -58, r: 11 },
    loop: { x: 8, z: 0, r: 16, halfW: 8 },
    pads: [
      { x0: -58, x1: -40, z0: -5, z1: 5 },
      { x0: 42, x1: 58, z0: -5, z1: 5 },
    ],
    turbos: [
      { x: -136, z: 0 },
      { x: -46, z: 84 },
      { x: -46, z: -48 },
      { x: 90, z: 0 },
    ],
    buildings: [
      { x: -164, z: 124, w: 12, d: 12, h: 22 },
      { x: 164, z: 124, w: 12, d: 12, h: 26 },
      { x: -164, z: -128, w: 12, d: 12, h: 20 },
      { x: 164, z: -30, w: 12, d: 12, h: 24 },
    ],
    marker: { x: -150, z: -26 },
  };
}

function boxOverlap(a, b, gap) {
  return a.x1 > b.x0 + gap && a.x0 < b.x1 - gap && a.z1 > b.z0 + gap && a.z0 < b.z1 - gap;
}

function rampZones(ramp) {
  const dir = ramp.dir < 0 ? -1 : 1;
  const approach = dir > 0
    ? { x0: ramp.x0 - 14, x1: ramp.x0, z0: ramp.z0, z1: ramp.z1 }
    : { x0: ramp.x1, x1: ramp.x1 + 14, z0: ramp.z0, z1: ramp.z1 };
  const lip = dir > 0
    ? { x0: ramp.x1 - 2, x1: ramp.x1 + 2, z0: ramp.z0, z1: ramp.z1 }
    : { x0: ramp.x0 - 2, x1: ramp.x0 + 2, z0: ramp.z0, z1: ramp.z1 };
  return {
    approach,
    body: { x0: ramp.x0, x1: ramp.x1, z0: ramp.z0, z1: ramp.z1 },
    lip,
  };
}

// Names of anything sitting on a ramp approach, body, or lip. Empty means every ramp is open.
export function yardBlockedRamps(props) {
  const p = props || stuntProps();
  const pipe = p.pipe;
  const loop = p.loop;
  const blockers = [
    { name: "pipe", x0: pipe.x - pipe.r, x1: pipe.x + pipe.r, z0: pipe.z0, z1: pipe.z1 },
    { name: "loop", x0: loop.x - loop.r, x1: loop.x + loop.r, z0: loop.z - loop.halfW, z1: loop.z + loop.halfW },
  ];
  for (let i = 0; i < (p.buildings || []).length; i++) {
    const b = p.buildings[i];
    blockers.push({
      name: "building" + i,
      x0: b.x - b.w / 2,
      x1: b.x + b.w / 2,
      z0: b.z - b.d / 2,
      z1: b.z + b.d / 2,
    });
  }
  for (let i = 0; i < (p.pads || []).length; i++) {
    const pad = p.pads[i];
    blockers.push({ name: "pad" + i, x0: pad.x0, x1: pad.x1, z0: pad.z0, z1: pad.z1 });
  }
  if (p.marker) {
    blockers.push({
      name: "marker",
      x0: p.marker.x - 1.2,
      x1: p.marker.x + 1.2,
      z0: p.marker.z - 1.2,
      z1: p.marker.z + 1.2,
    });
  }
  for (let i = 0; i < (p.turbos || []).length; i++) {
    const bolt = p.turbos[i];
    blockers.push({
      name: "turbo" + i,
      x0: bolt.x - 2.2,
      x1: bolt.x + 2.2,
      z0: bolt.z - 2.2,
      z1: bolt.z + 2.2,
    });
  }
  const hits = [];
  const pipeBox = blockers[0];
  const loopBox = blockers[1];
  if (boxOverlap(pipeBox, loopBox, 4)) hits.push("pipe overlaps loop");
  const exitLane = { x0: loop.x + loop.r, x1: p.halfX - 8, z0: -14, z1: 14 };
  if (boxOverlap(pipeBox, exitLane, 4)) hits.push("pipe blocks loop exit");
  for (let i = 0; i < p.ramps.length; i++) {
    const zones = rampZones(p.ramps[i]);
    for (const key of ["approach", "body", "lip"]) {
      const zone = zones[key];
      if (zone.x0 < -p.halfX + 1 || zone.x1 > p.halfX - 1 || zone.z0 < -p.halfZ + 1 || zone.z1 > p.halfZ - 1) {
        hits.push("ramp" + i + " " + key + " wall");
      }
      for (const other of blockers) {
        if (boxOverlap(zone, other, 0.4)) hits.push("ramp" + i + " " + key + " " + other.name);
      }
      for (let j = 0; j < p.ramps.length; j++) {
        if (j === i) continue;
        const body = { x0: p.ramps[j].x0, x1: p.ramps[j].x1, z0: p.ramps[j].z0, z1: p.ramps[j].z1 };
        if (boxOverlap(zone, body, 0.4)) hits.push("ramp" + i + " " + key + " ramp" + j);
      }
    }
  }
  return hits;
}

const LOOP_G = 26;

function rampRise(ramp, x) {
  const t = (x - ramp.x0) / (ramp.x1 - ramp.x0);
  return ramp.tall * (ramp.dir < 0 ? 1 - t : t);
}

function rampSlope(ramp) {
  const run = ramp.x1 - ramp.x0 || 1;
  return (ramp.dir < 0 ? -1 : 1) * (ramp.tall / run);
}

function yardGround(x, z) {
  const props = stuntProps();
  let h = 0;
  let slopeX = 0;
  let kind = "floor";
  for (const ramp of props.ramps) {
    if (x < ramp.x0 || x > ramp.x1 || z < ramp.z0 || z > ramp.z1) continue;
    const rise = rampRise(ramp, x);
    if (rise >= h) {
      h = rise;
      slopeX = rampSlope(ramp);
      kind = "ramp";
    }
  }
  const pipe = props.pipe;
  const dx = x - pipe.x;
  if (z >= pipe.z0 && z <= pipe.z1 && Math.abs(dx) < pipe.r - 0.05) {
    const rise = pipe.r - Math.sqrt(Math.max(0, pipe.r * pipe.r - dx * dx));
    if (rise >= h) {
      h = rise;
      slopeX = dx / Math.max(0.4, pipe.r - rise);
      kind = "pipe";
    }
  }
  return { h, slopeX, kind };
}

// Car footprint in the yard comes from the drawn model (k.halfLen, k.halfH set by game.js from its bounds).
// Defaults match the old box kart.
export function yardBody(k) {
  return { halfLen: k.halfLen || 1.18, halfH: k.halfH || 0.57 };
}
// Floor height under the nose and the tail. The car rests on whichever is higher at its middle and
// pitches along the line between the ends, so neither end sinks into a ramp or the floor.
export function yardFootprint(k) {
  const L = yardBody(k).halfLen;
  const nose = forwardFromYaw(k.yaw);
  const mid = yardGround(k.x, k.z);
  const front = yardGround(k.x + nose.x * L, k.z + nose.z * L);
  const back = yardGround(k.x - nose.x * L, k.z - nose.z * L);
  const h = Math.max(mid.h, (front.h + back.h) * 0.5);
  const pitch = Math.atan2(front.h - back.h, 2 * L);
  return { h, pitch, mid, front, back };
}

function blockYardBack(k) {
  const pad = yardBody(k).halfLen + 0.2;
  const props = stuntProps();
  for (const ramp of props.ramps) {
    if (k.z < ramp.z0 || k.z > ramp.z1) continue;
    if ((k.hop || 0) > ramp.tall * 0.4) continue;
    if (ramp.dir < 0) {
      if (k.x < ramp.x0 + 1.6 && k.x > ramp.x0 - pad - 2.1 && k.vx > 0) {
        k.x = ramp.x0 - pad;
        k.vx = 0;
        k.hop = 0;
        return true;
      }
    } else if (k.x > ramp.x1 - 1.6 && k.x < ramp.x1 + pad + 2.1 && k.vx < 0) {
      k.x = ramp.x1 + pad;
      k.vx = 0;
      k.hop = 0;
      return true;
    }
  }
  const pipe = props.pipe;
  if (k.z < pipe.z0 || k.z > pipe.z1 || (k.hop || 0) > pipe.r * 0.45) return false;
  const dx = k.x - pipe.x;
  const adx = Math.abs(dx);
  if (adx > pipe.r - 0.4 && adx < pipe.r + pad + 2.3 && dx * k.vx < 0) {
    const sign = Math.sign(dx) || 1;
    k.x = pipe.x + sign * (pipe.r + Math.max(0.7, pad - 0.5));
    k.vx = 0;
    k.hop = 0;
    return true;
  }
  return false;
}

function noteTrick(k, name, pts) {
  k.stuntScore = (k.stuntScore || 0) + pts;
  k.trick = name;
}

function yardWalls(k) {
  const props = stuntProps();
  if (k.x > props.halfX) {
    k.x = props.halfX;
    if (k.vx > 0) k.vx *= -0.35;
  } else if (k.x < -props.halfX) {
    k.x = -props.halfX;
    if (k.vx < 0) k.vx *= -0.35;
  }
  if (k.z > props.halfZ) {
    k.z = props.halfZ;
    if (k.vz > 0) k.vz *= -0.35;
  } else if (k.z < -props.halfZ) {
    k.z = -props.halfZ;
    if (k.vz < 0) k.vz *= -0.35;
  }
}

function placeOnLoop(k, loop, a) {
  const frame = loopFrame(a, k.loopSign || 1);
  k.loopA = a;
  k.x = loop.x + frame.ox * loop.r;
  k.hop = loop.r + frame.oy * loop.r;
  k.hopV = 0;
  k.air = false;
  k.pitch = 0;
  k.roll = 0;
  k.faceX = frame.faceX;
  k.faceY = frame.faceY;
  k.faceZ = 0;
  k.upX = frame.upX;
  k.upY = frame.upY;
  k.upZ = 0;
  const spd = k.loopSpeed || 0;
  k.vx = frame.faceX * spd;
  k.vz = 0;
  k.lon = spd;
}

function dropLoop(k, trick, pts) {
  const frame = loopFrame(k.loopA || 0, k.loopSign || 1);
  const spd = k.loopSpeed || 0;
  k.loopA = null;
  k.loopCd = 0.45;
  k.air = true;
  k.vx = frame.faceX * spd;
  k.vz = 0;
  k.lon = Math.max(0, spd);
  k.hopV = frame.faceY * spd;
  k.x -= frame.ox * 0.7;
  k.hop = Math.max(0, (k.hop || 0) - frame.oy * 0.7);
  k.pitch = 0;
  k.roll = 0;
  k.pitchRate = 0;
  k.rollRate = 0;
  noteTrick(k, trick, pts);
}

function blockLoopShell(k) {
  const loop = stuntProps().loop;
  const dx = k.x - loop.x;
  if (Math.abs(dx) >= loop.r - 0.15) return;
  if (Math.abs(k.z - loop.z) > loop.halfW + 0.15) return;
  const span = Math.sqrt(Math.max(0, loop.r * loop.r - dx * dx));
  const yRoad = loop.r - span;
  const yTop = loop.r + span;
  const body = k.hop || 0;
  const hitLower = yRoad > 1.35 && body < yRoad + 0.35 && body + 1.05 > yRoad;
  const hitUpper = yTop > loop.r + 1 && Math.abs(body - yTop) < 1.15;
  if (!hitLower && !hitUpper) return;
  k.x = k.prevX;
  k.z = k.prevZ;
  k.vx *= -0.2;
  k.vz *= 0.45;
  if (hitUpper && k.hopV > 0) k.hopV = -2;
}

function yardPads(k) {
  if ((k.padCd || 0) > 0) return;
  const pads = stuntProps().pads || [];
  for (const pad of pads) {
    if (k.x < pad.x0 || k.x > pad.x1 || k.z < pad.z0 || k.z > pad.z1) continue;
    const spd = Math.hypot(k.vx, k.vz);
    const want = 36;
    if (spd < want) {
      const nose = spd > 3 ? { x: k.vx / spd, z: k.vz / spd } : forwardFromYaw(k.yaw);
      k.vx = nose.x * want;
      k.vz = nose.z * want;
      k.lon = want;
      noteTrick(k, "BOOST", 25);
    }
    k.padCd = 1.15;
    return;
  }
}

function yardStep(k, dt) {
  const props = stuntProps();
  const loop = props.loop;
  if ((k.loopCd || 0) > 0) k.loopCd -= dt;
  if ((k.padCd || 0) > 0) k.padCd -= dt;
  if (k.loopA == null && !k.air && (k.hop || 0) < 1.3 && (k.loopCd || 0) <= 0) {
    const speed = Math.hypot(k.vx, k.vz);
    const centered = Math.abs(k.z - loop.z) < loop.halfW - 0.35;
    const atMouth = Math.abs(k.x - loop.x) < 3.6;
    const lined = Math.abs(k.vx) > 14 && Math.abs(k.vx) > Math.abs(k.vz) * 1.1;
    if (centered && atMouth && lined && speed > 18) {
      const sign = k.vx >= 0 ? 1 : -1;
      const along = ((k.x - loop.x) / loop.r) * sign;
      let a = Math.asin(Math.max(0, Math.min(0.45, along)));
      if (a < 0.04) a = 0.04;
      k.loopSign = sign;
      k.loopSpeed = speed;
      placeOnLoop(k, loop, a);
      noteTrick(k, "LOOP", 40);
    }
  }
  if (k.loopA != null) {
    const gas = k.gas || 0;
    const a0 = k.loopA;
    k.loopSpeed += (-LOOP_G * Math.sin(a0) + (gas > 0 ? 10 : -0.6)) * dt;
    const topping = a0 > Math.PI * 0.7 && a0 < Math.PI * 1.3;
    const stick = LOOP_G * loop.r;
    if (k.loopSpeed < 7 || (topping && k.loopSpeed * k.loopSpeed < stick)) {
      dropLoop(k, "FALL", 12);
    } else {
      const a = a0 + (k.loopSpeed / loop.r) * dt;
      if (a >= Math.PI * 2 - 0.12) {
        const s = k.loopSign || 1;
        const spd = k.loopSpeed;
        k.loopA = null;
        k.loopCd = 0.7;
        k.air = false;
        k.hop = 0.08;
        k.hopV = 1.4;
        k.pitch = 0;
        k.roll = 0;
        k.x = loop.x + s * 4.6;
        k.z += (loop.z - k.z) * 0.5;
        k.vx = s * spd;
        k.vz = 0;
        k.lon = spd;
        k.yaw = Math.atan2(-s, 0);
        noteTrick(k, "LOOPED", 200);
      } else {
        const steer = k.steer || 0;
        const s = k.loopSign || 1;
        k.z += steer * s * 7 * dt;
        k.z += (loop.z - k.z) * dt * 0.4;
        const edge = loop.halfW - 1.15;
        if (k.z > loop.z + edge) k.z = loop.z + edge;
        if (k.z < loop.z - edge) k.z = loop.z - edge;
        placeOnLoop(k, loop, a);
      }
    }
  } else {
    blockLoopShell(k);
  }
  if (k.loopA != null) {
    yardWalls(k);
    return;
  }
  if (k.air) {
    k.hopV -= 26 * dt;
    k.hop += k.hopV * dt;
    const steer = k.steer || 0;
    // NL-84: gas and brake no longer pitch. k.pitchIn (+1 = nose down) is its own control,
    // ignored for k.airGrace after take-off. With no pitch input the car eases back level.
    // NL-87: grace only holds a pitch key already held at the lip; letting go (or a fresh press) flips at once.
    if ((k.airGrace || 0) > 0) k.airGrace = Math.abs(k.pitchIn || 0) > 0.2 ? k.airGrace - dt : 0;
    const rawPitch = (k.airGrace || 0) > 0 ? 0 : k.pitchIn || 0;
    const pitchStick = Math.abs(rawPitch) > 0.2 ? rawPitch : 0;
    k.rollRate = damp(k.rollRate || 0, steer * 8.6, 12, dt);
    k.pitchRate = damp(k.pitchRate || 0, -pitchStick * 11, 14, dt);
    if (!pitchStick) {
      const home = (k.pitch || 0) - wrapAngle(k.pitch || 0);
      k.pitch = damp(k.pitch || 0, home, 1.5, dt);
    }
    const prevPitch = k.pitch || 0;
    const prevRoll = k.roll || 0;
    k.pitch = prevPitch + (k.pitchRate || 0) * dt;
    k.roll = prevRoll + (k.rollRate || 0) * dt;
    if (Math.floor(Math.abs(k.pitch) / (Math.PI * 2)) > Math.floor(Math.abs(prevPitch) / (Math.PI * 2))) noteTrick(k, "FLIP", 100);
    if (Math.floor(Math.abs(k.roll) / (Math.PI * 2)) > Math.floor(Math.abs(prevRoll) / (Math.PI * 2))) noteTrick(k, "ROLL", 100);
    k.stuntScore = (k.stuntScore || 0) + 36 * dt;
    const foot = yardFootprint(k);
    if (k.hop <= foot.h && k.hopV <= 0) {
      k.hop = foot.h;
      k.hopV = 0;
      k.air = false;
      const flat = Math.abs(wrapAngle(k.pitch || 0)) < Math.PI / 2 && Math.abs(wrapAngle(k.roll || 0)) < Math.PI / 2;
      if (flat) noteTrick(k, "CLEAN", 80);
      else {
        noteTrick(k, "BUMP", 20);
        k.vx *= 0.72;
        k.vz *= 0.72;
      }
      // Settle onto the wheels over about 0.2 s (grounded branch damps with k.settle) instead of snapping.
      const cap = flat ? Math.PI / 2 : 0.6;
      k.pitch = clamp(wrapAngle(k.pitch || 0), -cap, cap);
      k.roll = clamp(wrapAngle(k.roll || 0), -cap, cap);
      k.settle = 0.22;
      k.pitchRate = 0;
      k.rollRate = 0;
    }
  } else {
    yardPads(k);
    if (blockYardBack(k)) {
      yardWalls(k);
      return;
    }
    const speed = Math.hypot(k.vx, k.vz);
    const foot = yardFootprint(k);
    const ground = foot.mid;
    k.hop = foot.h;
    k.hopV = 0;
    const settleRate = (k.settle || 0) > 0 ? 16 : 8;
    if ((k.settle || 0) > 0) k.settle -= dt;
    // Lip fix: past a ramp lip the nose sample drops to the floor; keep the slope under the middle.
    let pitchGoal = foot.pitch;
    if (ground.kind === "ramp" && foot.front.kind !== "ramp") {
      const f = forwardFromYaw(k.yaw);
      pitchGoal = Math.max(pitchGoal, Math.atan(ground.slopeX * f.x));
    }
    k.pitch = damp(k.pitch || 0, pitchGoal, settleRate, dt);
    k.roll = damp(k.roll || 0, 0, settleRate, dt);
    // While the pitch eases, lift the body so the lagging nose or tail still clears the surface.
    const lean = Math.sin(k.pitch) * yardBody(k).halfLen;
    k.hop = Math.max(foot.h, foot.front.h - lean, foot.back.h + lean);
    if (ground.slopeX) {
      const sin = ground.slopeX / Math.sqrt(1 + ground.slopeX * ground.slopeX);
      k.vx -= 26 * sin * dt;
    }
    if (ground.kind === "ramp") {
      const ramp = stuntProps().ramps.find((r) => k.x >= r.x0 && k.x <= r.x1 && k.z >= r.z0 && k.z <= r.z1);
      if (ramp) {
        const lip = ramp.dir < 0 ? k.x < ramp.x0 + 1.4 && k.vx < -8 : k.x > ramp.x1 - 1.4 && k.vx > 8;
        if (lip) {
          const angle = Math.atan(ramp.tall / (ramp.x1 - ramp.x0));
          k.air = true;
          k.hopV = Math.max(9, speed * Math.sin(angle));
          k.hop = foot.h + 0.2;
          k.pitch = angle;
          k.pitchRate = 0;
          k.airGrace = 0.25;
          k.launchPing = (k.launchPing || 0) + 1;
          noteTrick(k, "AIR", 15);
        }
      }
    } else if (ground.kind === "pipe") {
      const pipe = props.pipe;
      const dx = k.x - pipe.x;
      const outward = dx * k.vx > 0;
      if (Math.abs(dx) > pipe.r * 0.93 && outward && speed > 11) {
        k.air = true;
        k.hop = pipe.r + 0.45;
        k.hopV = Math.max(18, Math.abs(k.vx));
        k.vx = 0;
        k.pitchRate = 0;
        k.airGrace = 0.25;
        k.launchPing = (k.launchPing || 0) + 1;
        noteTrick(k, "PIPE", 40);
      }
    }
  }
  yardWalls(k);
}

export function stepWorld(karts, inputs, track, dt, raceTime, racing) {
  for (const k of karts) {
    k.boostPing = false;
    k.wallPing = false;
    k.gatePing = false;
    k.turboPing = false;
    k.turboBreak = false;
    k.hitPing = false;
  }
  for (let i = 0; i < karts.length; i++) {
    stepMotion(karts[i], inputs[i], track, dt, racing);
  }
  separate(karts);
  const yard = karts.some((k) => k.yard);
  if (yard) {
    for (const k of karts) yardStep(k, dt);
  } else {
    // NL-89: no air or flips on the race track; ease any leftover tilt back onto the wheels.
    for (const k of karts) {
      k.air = false;
      k.pitchRate = 0;
      k.rollRate = 0;
      if (k.pitch) k.pitch = Math.abs(k.pitch) < 0.002 ? 0 : damp(wrapAngle(k.pitch), 0, 16, dt);
      if (k.roll) k.roll = Math.abs(k.roll) < 0.002 ? 0 : damp(wrapAngle(k.roll), 0, 16, dt);
    }
    for (const k of karts) constrain(k, track, dt);
    if (racing) {
      for (const k of karts) updateProgress(k, track, raceTime);
    }
  }
}

function stepMotion(k, input, track, dt, racing) {
  // In the air, arrow keys only pitch; they still drive on the ground.
  const arrowsAir = !!input.arrowsOnly && !!k.air;
  // NL-87: in the air use airThrottle/airBrake (Space, touch, pad A/RT/LT/B) when sent, so W/S/sticks only flip.
  const airSplit = !!k.air && input.airThrottle != null;
  const throttle = !racing ? 0 : airSplit ? clamp(input.airThrottle || 0, 0, 1) : !arrowsAir ? clamp(input.throttle || 0, 0, 1) : 0;
  const brake = !racing ? 0 : airSplit ? clamp(input.airBrake || 0, 0, 1) : !arrowsAir ? clamp(input.brake || 0, 0, 1) : 0;
  // NL-89: flip input only exists in the air. On the ground Q/E/Up/Down/I/K do nothing.
  k.pitchIn = racing && k.air ? clamp(input.pitch || 0, -1, 1) : 0;
  const steer = racing ? clamp(input.steer || 0, -1, 1) : 0;
  const wantDrift = racing && !!input.drift;
  if ((k.hitStun || 0) > 0) k.hitStun -= dt;
  if ((k.hitCd || 0) > 0) k.hitCd -= dt;
  if ((k.hitFlash || 0) > 0) k.hitFlash -= dt;
  const steerScale = (k.hitStun || 0) > 0 ? 0.28 : 1;
  k.steer = steer * steerScale;
  const turboHeld = racing && !!input.turbo;
  if (turboHeld && !k.turboDown) spendTurbo(k);
  k.turboDown = turboHeld;
  if ((k.turboLeft || 0) > 0) {
    k.turboLeft -= dt;
    if (k.turboLeft <= 0) {
      k.turboLeft = 0;
      k.turboTier = 0;
    }
  }

  const fwd = forwardFromYaw(k.yaw);
  const right = rightFromForward(fwd);
  let lon = k.vx * fwd.x + k.vz * fwd.z;
  let lat = k.vx * right.x + k.vz * right.z;

  if ((k.driftBoostLeft || 0) > 0) {
    k.driftBoostLeft -= dt;
    if (k.driftBoostLeft <= 0) {
      k.driftBoostLeft = 0;
      k.driftBoostHold = 0;
    }
  }

  const cap = TUNE.maxSpeed * (k.speedMul || 1) * turboMultiplier(k) * driftSpeedMul(k);
  if (k.turboSurge) {
    const surge = cap * 0.82;
    if (lon < surge) lon = surge;
    k.turboSurge = false;
  }
  if (k.boost > 0) {
    k.boost -= dt;
    const kick = k.boostKind === 2 ? TUNE.superKick : TUNE.miniKick;
    const boostCap = cap + (k.boostKind === 2 ? 6 : 3);
    if (lon < boostCap) lon += kick * dt;
  } else if (throttle > 0) {
    const headroom = 1 - Math.max(0, lon) / cap;
    lon += TUNE.accel * throttle * Math.max(0.25, headroom) * dt;
  }
  if (brake > 0) {
    if (lon > 0.5) lon -= TUNE.brake * brake * dt;
    else lon -= TUNE.accel * 0.65 * brake * dt;
  }
  if (!throttle && !brake && k.boost <= 0) {
    lon = damp(lon, 0, 0.55, dt);
  }
  k.gas = throttle - brake;
  if (k.loopA != null) {
    k.drifting = false;
    k.slip = 0;
    k.driftArmed = false;
    k.driftSide = 0;
    return;
  }
  lon = clamp(lon, -TUNE.reverse, cap + 8);

  const speedForTurn = Math.abs(lon);
  k.driftPress = !!wantDrift;
  if (wantDrift) k.driftPressTime = (k.driftPressTime || 0) + dt;
  else if ((k.driftBoostLeft || 0) <= 0) k.driftPressTime = 0;
  const speeding = speedForTurn > TUNE.driftMinSpeed && !k.wallBlock;
  if (wantDrift && speeding && Math.abs(steer) > TUNE.driftMinSteer) {
    const nextSide = Math.sign(steer);
    if (!k.driftSide || (nextSide !== k.driftSide && Math.abs(steer) > 0.45)) k.driftSide = nextSide;
  }
  if (wantDrift && k.driftSide && input.mouseX) {
    k.steer = clamp(k.steer - k.driftSide * clamp(input.mouseX, -1, 1), -1, 1);
  }
  const steerNow = k.steer;
  const driftReady = !!(wantDrift && speeding && k.driftSide);
  const targetMix = driftReady ? driftBarFill(k.driftPressTime || 0) : 0;
  const follow = 1 - Math.exp(-dt / 0.09);
  k.driftMix = (k.driftMix || 0) + (targetMix - (k.driftMix || 0)) * follow;
  const mix = k.driftMix;
  if (k.driftArmed && !driftReady) {
    if (!k.wallBlock && (k.driftHold || 0) > 0) {
      k.driftBoostHold = k.driftHold;
      k.driftBoostLeft = k.driftHold;
      k.driftSurge = true;
      k.driftHold = 0;
    } else {
      k.driftHold = 0;
    }
  }
  k.driftArmed = driftReady;
  k.drifting = mix > 0.2;
  if (!wantDrift || !speeding) k.driftSide = 0;
  if (driftReady) k.driftHold = (k.driftHold || 0) + dt;
  if (k.driftSurge) {
    const hold = Math.min(k.driftBoostHold || 0, DRIFT_SPEED_CAP);
    const lifted = cap * (1 + hold * 0.35);
    lon = Math.max(lon, Math.min(lifted, lon + hold * 8));
    k.driftSurge = false;
  }

  const ctl = driftControl(k.steer, k.driftSide);
  const stunGrip = (k.hitStun || 0) > 0 ? TUNE.grip * 0.35 : TUNE.grip;
  const loose = driftLoose();
  const slideGrip = loose + (stunGrip - loose) * (1 - mix);
  const grip = slideGrip + (stunGrip - slideGrip) * ctl.counter * 0.75;
  if (!(mix > 0.05 && ctl.side)) lat = damp(lat, 0, grip, dt);

  const rate = TUNE.turnRate + (TUNE.driftTurn - TUNE.turnRate) * mix;
  const speedFactor = clamp(speedForTurn / 14, TUNE.steerFloor, 1);
  const dir = lon < -0.4 ? -1 : 1;
  // A held drift at turbo speed should arc with the corner, not snap the nose into the wall.
  const yawPace = mix > 0.05 ? 1 / Math.max(1, speedForTurn / 42) : 1 / Math.max(1, speedForTurn / 70);
  const yardAir = k.yard && k.air;
  if (yardAir) {
    // Steer is the barrel roll while airborne. The nose stays put.
  } else if (mix > 0.05 && ctl.side) {
    const into = Math.max(0.2, ctl.into);
    k.yaw -= ctl.side * rate * into * (1 - ctl.counter * 0.82) * speedFactor * yawPace * dir * dt;
    if (ctl.counter > 0) k.yaw += ctl.side * TUNE.turnRate * ctl.counter * mix * speedFactor * yawPace * dt;
  } else {
    k.yaw -= k.steer * rate * speedFactor * yawPace * dir * dt;
  }

  if (mix > 0.05 && ctl.side) {
    const nose = forwardFromYaw(k.yaw);
    const side = rightFromForward(nose);
    let nlat = k.vx * side.x + k.vz * side.z;
    const keptLon = Math.max(Math.abs(lon), 0.2);
    const base = ctl.into > 0.05 || ctl.counter > 0.05 ? (0.22 + 0.42 * ctl.into) * (1 - ctl.counter) : 0.1;
    const rise = Math.max(0, Math.min(5, driftPercent));
    // 0.5 keeps the hang that already feels right. Low tidies it. High steps the rear out and gets there faster.
    const scale = rise <= 0.5 ? 0.55 + rise * 0.9 : 1 + (rise - 0.5) * 0.22;
    const depth = Math.min(0.74, Math.max(0.08, base * scale));
    const aim = -ctl.side * depth * keptLon;
    nlat = damp(nlat, aim, Math.min(16, 4.2 + rise * 5.6), dt);
    const slideCap = depth * keptLon;
    nlat = clamp(nlat, -slideCap, slideCap);
    // The slide hangs the rear out. It does not spend the speed you brought in.
    const nlon = (lon >= 0 ? 1 : -1) * keptLon;
    k.vx = nose.x * nlon + side.x * nlat;
    k.vz = nose.z * nlon + side.z * nlat;
    k.lon = nlon;
    k.slip = Math.atan2(nlat, Math.max(0.2, nlon));
  } else {
    k.vx = fwd.x * lon + right.x * lat;
    k.vz = fwd.z * lon + right.z * lat;
    k.lon = lon;
    k.slip = 0;
  }

  k.prevX = k.x;
  k.prevZ = k.z;
  k.x += k.vx * dt;
  k.z += k.vz * dt;

  if (!k.yard) {
    k.hopV -= 20 * dt;
    k.hop += k.hopV * dt;
    if (k.hop < 0) {
      k.hop = 0;
      k.hopV = 0;
    }
  }
  k.wallBlock = false;
}

function constrain(k, track, dt) {
  let proj = projectOnTrack(track.samples, track.length, k.x, k.z, k.projIndex);
  if (proj.d2 > 36) proj = projectOnTrack(track.samples, track.length, k.x, k.z, null);
  k.projIndex = proj.i;
  const baseHalf = proj.half > 1 ? proj.half : track.halfW;
  const half = proj.lat >= 0 ? (proj.halfR || baseHalf) : (proj.halfL || baseHalf);
  const limit = half - k.radius;
  const absLat = Math.abs(proj.lat);
  if (absLat > limit) {
    const sign = Math.sign(proj.lat) || 1;
    const over = absLat - limit;
    k.x -= proj.rx * sign * over;
    k.z -= proj.rz * sign * over;
    proj.lat = sign * limit;
    const latVel = k.vx * proj.rx + k.vz * proj.rz;
    if (latVel * sign > 0) {
      k.vx -= proj.rx * latVel;
      k.vz -= proj.rz * latVel;
    }
    if (over > 0.2) {
      k.vx *= 0.98;
      k.vz *= 0.98;
    }
    if (over > 0.55) {
      k.wallBlock = true;
      k.driftCharge *= 0.55;
      k.wallPing = true;
      breakTurbo(k);
      breakDrift(k);
      const nose = forwardFromYaw(k.yaw);
      const along = nose.x * proj.tx + nose.z * proj.tz;
      const outward = nose.x * proj.rx * sign + nose.z * proj.rz * sign;
      if (outward > 0.35 || along < -0.15) {
        const face = Math.atan2(-proj.tx, -proj.tz);
        let diff = face - k.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        k.yaw += diff * Math.min(1, (along < 0 ? 3.2 : 5.5) * dt);
      }
    }
  } else if (absLat > edgeScrubLat(half)) {
    const band = Math.max(0.2, half - edgeScrubLat(half));
    const depthIn = Math.max(0, Math.min(1, (absLat - edgeScrubLat(half)) / band));
    const sliding = (k.driftMix || 0) > 0.2 || (k.driftBoostLeft || 0) > 0;
    const coef = (sliding ? 0.12 : 0.22) * (0.4 + 0.6 * depthIn);
    const drag = Math.exp(-coef * dt);
    k.vx *= drag;
    k.vz *= drag;
  }
  k.proj = proj;

  let delta = proj.dist - k.prevDist;
  const L = track.length;
  if (delta < -L * 0.5) delta += L;
  if (delta > L * 0.5) delta -= L;
  if (Math.abs(delta) < 25) k.travel += delta;
  k.prevDist = proj.dist;

  const fwd = forwardFromYaw(k.yaw);
  const moving = Math.hypot(k.vx, k.vz);
  if (moving > 6 && fwd.x * proj.tx + fwd.z * proj.tz < -0.45) k.wrong = 0.35;
  else k.wrong = Math.max(0, k.wrong - dt);
}

function scrubForward(k, frac) {
  const f = forwardFromYaw(k.yaw);
  const r = rightFromForward(f);
  const lon = k.vx * f.x + k.vz * f.z;
  const lat = k.vx * r.x + k.vz * r.z;
  const next = lon * (1 - frac);
  k.vx = f.x * next + r.x * lat;
  k.vz = f.z * next + r.z * lat;
  k.lon = next;
}

function bumpApart(a, b, nx, nz, shove) {
  a.vx += nx * shove;
  a.vz += nz * shove;
  b.vx -= nx * shove;
  b.vz -= nz * shove;
}

function crashKarts(a, b, nx, nz, impact) {
  const aFwd = forwardFromYaw(a.yaw);
  const bFwd = forwardFromYaw(b.yaw);
  const align = aFwd.x * bFwd.x + aFwd.z * bFwd.z;
  const aFace = -(aFwd.x * nx + aFwd.z * nz);
  const bFace = bFwd.x * nx + bFwd.z * nz;
  const aFlank = Math.abs(aFwd.x * nz - aFwd.z * nx);
  const bFlank = Math.abs(bFwd.x * nz - bFwd.z * nx);
  const sideRub = align > 0.35 && Math.max(aFlank, bFlank) > 0.45;
  const shove = sideRub ? Math.min(6, 1.6 + impact * 0.28) : Math.min(9, 2 + impact * 0.4);
  bumpApart(a, b, nx, nz, shove);

  const kick = Math.min(7, 2 + impact * 0.22);
  if (!sideRub && bFace < -0.45 && aFace > 0.2) {
    b.vx += bFwd.x * kick;
    b.vz += bFwd.z * kick;
    scrubForward(a, Math.min(0.42, 0.12 + impact * 0.012));
    scrubForward(b, 0.04);
  } else if (!sideRub && aFace < -0.45 && bFace > 0.2) {
    a.vx += aFwd.x * kick;
    a.vz += aFwd.z * kick;
    scrubForward(b, Math.min(0.42, 0.12 + impact * 0.012));
    scrubForward(a, 0.04);
  } else if (!sideRub) {
    const lose = Math.min(0.4, 0.1 + impact * 0.012);
    scrubForward(a, lose);
    scrubForward(b, lose);
  } else {
    scrubForward(a, 0.06);
    scrubForward(b, 0.06);
  }

  const spin = Math.min(sideRub ? 0.18 : 0.55, 0.08 + impact * (sideRub ? 0.008 : 0.02));
  const aRight = rightFromForward(aFwd);
  const bRight = rightFromForward(bFwd);
  const aSide = -nx * aRight.x - nz * aRight.z;
  const bSide = nx * bRight.x + nz * bRight.z;
  a.yaw += Math.sign(aSide || 1) * spin;
  b.yaw += Math.sign(bSide || 1) * spin;

  const stun = Math.min(sideRub ? 0.28 : 0.55, 0.1 + impact * 0.012);
  a.hitStun = Math.max(a.hitStun || 0, stun);
  b.hitStun = Math.max(b.hitStun || 0, stun);
  a.hitFlash = sideRub ? 0.16 : 0.28;
  b.hitFlash = a.hitFlash;
  const cd = impact > 8 ? 0.28 : 0.14;
  a.hitCd = cd;
  b.hitCd = cd;
  a.hitPing = true;
  b.hitPing = true;
  const pop = sideRub ? Math.min(1.2, 0.35 + impact * 0.04) : Math.min(2.2, 0.55 + impact * 0.07);
  a.hopV = Math.max(a.hopV || 0, pop);
  b.hopV = Math.max(b.hopV || 0, pop);
  if (!sideRub && impact > 9) {
    breakDrift(a);
    breakDrift(b);
    breakTurbo(a);
    breakTurbo(b);
  }
}

// NL-90: each kart is two circles (front + back) sized from its drawn body (k.halfLen / k.halfWid from game.js).
export function kartCircles(k) {
  const halfLen = k.halfLen || 1.18;
  let r = Math.max(0.55, Math.min(k.halfWid || 0.9, halfLen));
  if ((k.radius || 0) > 2) r *= k.radius / 1.5; // MASS cheat stays big
  const off = Math.max(0, halfLen - r);
  const f = forwardFromYaw(k.yaw || 0);
  return { r, c: [[k.x + f.x * off, k.z + f.z * off], [k.x - f.x * off, k.z - f.z * off]] };
}

function deepestContact(a, b) {
  const A = kartCircles(a);
  const B = kartCircles(b);
  const min = A.r + B.r;
  let best = null;
  for (const p of A.c) {
    for (const q of B.c) {
      const dx = p[0] - q[0];
      const dz = p[1] - q[1];
      const dist = Math.hypot(dx, dz);
      if (dist >= min) continue;
      if (!best || min - dist > best.overlap) best = { dx, dz, dist, overlap: min - dist };
    }
  }
  return best;
}

function separate(karts) {
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i];
        const b = karts[j];
        const hit = deepestContact(a, b);
        if (!hit) continue;
        let dx = hit.dx;
        let dz = hit.dz;
        let dist = hit.dist;
        if (dist < 1e-4) {
          dx = a.x - b.x;
          dz = a.z - b.z;
          dist = Math.hypot(dx, dz);
          if (dist < 1e-4) { dx = 1; dz = 0; dist = 1; }
        }
        if (dist < 1e-4) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = hit.overlap;
        a.x += nx * overlap * 0.5;
        a.z += nz * overlap * 0.5;
        b.x -= nx * overlap * 0.5;
        b.z -= nz * overlap * 0.5;
        if (pass !== 0) continue;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel < -0.45 && (a.hitCd || 0) <= 0 && (b.hitCd || 0) <= 0) {
          if (-rel < 1.6) {
            bumpApart(a, b, nx, nz, 2.2);
            const aFwd = forwardFromYaw(a.yaw);
            const bFwd = forwardFromYaw(b.yaw);
            const aFlank = aFwd.x * nz - aFwd.z * nx;
            const bFlank = bFwd.z * nx - bFwd.x * nz;
            a.yaw += Math.sign(aFlank || 1) * glanceSpin(aFlank);
            b.yaw += Math.sign(bFlank || 1) * glanceSpin(bFlank);
          } else crashKarts(a, b, nx, nz, -rel);
        }
      }
    }
  }
}

function updateProgress(k, track, raceTime) {
  if (k.finished) return;
  const gate = track.gates[k.expected];
  if (!crossedGate(k.prevX, k.prevZ, k.x, k.z, gate)) return;
  if (gate.finish) {
    if (k.sectors >= track.gates.length - 1) {
      k.lap += 1;
      if (k.lap >= 3) {
        k.finished = true;
        k.finishTime = raceTime;
      }
    }
    k.sectors = 0;
  } else {
    k.sectors += 1;
  }
  k.expected = (k.expected + 1) % track.gates.length;
  k.gatePing = gate.finish;
}

export function botInput(k, track, player) {
  const proj = k.proj || projectOnTrack(track.samples, track.length, k.x, k.z, k.projIndex);
  const profile = k.ai;
  const peek = sampleAtDist(track.samples, track.length, proj.dist + 10);
  const cornering = Math.abs(peek.curvature) > 0.016;
  const look = cornering ? Math.min(profile.lookahead, 9) : profile.lookahead + Math.max(0, signedSpeed(k) - 16) * 0.25;
  const ahead = sampleAtDist(track.samples, track.length, proj.dist + look);
  let lane = profile.lane;
  if (cornering && player && player.proj) {
    const side = Math.sign(profile.lane) || 1;
    lane = clamp((player.proj.lat || 0) + side * 2.7, -track.halfW + 2.4, track.halfW - 2.4);
  }
  const tx = ahead.x + ahead.rx * lane - k.x;
  const tz = ahead.z + ahead.rz * lane - k.z;
  const desired = yawOf(tx, tz);
  const diff = wrapAngle(desired - k.yaw);
  const steer = clamp(-diff / 0.5, -1, 1);
  const curve = Math.abs(ahead.curvature);
  let throttle = 1;
  let brake = 0;
  const gap = player ? k.travel - player.travel : 0;
  if (cornering && gap > 8) {
    throttle = 0.3;
    brake = 0.4;
  } else if (cornering && gap < -6) {
    throttle = 1;
    brake = 0;
  } else if (gap > -8 && curve * profile.corner > 0.018 && signedSpeed(k) > 18) {
    throttle = 0.72;
    brake = curve > 0.06 ? 0.12 : 0;
  }
  const drift = profile.drift > 0.5 && curve > 0.02 && signedSpeed(k) > 13 && Math.abs(steer) > 0.25;
  const straight = curve < 0.014 && !cornering;
  if (player && straight) {
    if (gap > 8) {
      throttle = 0.35;
      brake = 0.45;
    } else if (gap < -8) {
      throttle = 1;
      brake = 0;
    }
  }
  const chasing = gap < -16;
  const turbo = (k.turboCharges || 0) > 0 && (k.turboTier || 0) < 2 && straight && signedSpeed(k) > 16 && (gap > -12 || chasing);
  return { steer, throttle, brake, drift, turbo };
}

export function rivalLabelVisible(kart, ndcX, ndcY, ndcZ, dist) {
  if (!kart || kart.player) return false;
  if (!(dist < 46)) return false;
  if (ndcZ < -1 || ndcZ > 1) return false;
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return false;
  return true;
}

// Tow when the next kart is a few meters ahead. Alongside and far ahead stay at 1.
export function draftMul(ahead) {
  if (ahead > 2 && ahead < 8) return 1.05;
  return 1;
}

// After sitting in that tow, pulling up beside the kart ahead gives a short sling.
export function slingMul(towSeconds, ahead) {
  if (towSeconds >= 0.45 && ahead <= 2) return 1.08;
  return 1;
}

// The whole field leaves the line together so the first straight can still be a fight.
export function launchMul(raceSeconds) {
  if (raceSeconds >= 0 && raceSeconds < 1.2) return 1.06;
  return 1;
}

// A side rub turns the nose outward. A dead-ahead hit does not.
export function glanceSpin(flank) {
  const amount = Math.abs(flank);
  if (amount < 0.35) return 0;
  return Math.min(0.12, amount * 0.08);
}

export function rubberMul(k, player) {
  if (!k.ai || !player) return 1;
  const gap = k.travel - player.travel;
  const corner =
    Math.abs((player.proj && player.proj.curvature) || 0) > 0.015 ||
    Math.abs((k.proj && k.proj.curvature) || 0) > 0.015;
  let mul = k.ai.mul;
  if (corner) {
    if (gap > 20) mul *= 0.76;
    else if (gap > 8) mul *= 0.9;
    else if (gap < -20) mul *= 1.45;
    else if (gap < -8) mul *= 1.18;
  } else if (gap > 12) mul *= 0.58;
  else if (gap > 6) mul *= 0.86;
  else if (gap < -28) mul *= 1.9;
  else if (gap < -12) mul *= 1.52;
  else if (gap < -6) mul *= 1.18;
  if ((player.turboTier || 0) > 0 && gap < -6) {
    const want = turboMultiplier(player) * 0.82;
    const have = Math.max(1, turboMultiplier(k));
    mul = Math.max(mul, want / have);
  }
  return mul;
}

export function standings(karts) {
  return karts
    .map((k, i) => ({ k, i }))
    .sort((a, b) => {
      if (a.k.finished && b.k.finished) return a.k.finishTime - b.k.finishTime;
      if (a.k.finished) return -1;
      if (b.k.finished) return 1;
      return b.k.travel - a.k.travel;
    });
}
