import { forwardFromYaw } from "./physics.js";

const GEAR_COUNT = 6;
const MAX_SPEED = 30;
const GEAR_WIDTH = 5; // m/s per gear
const RATE_LO = 0.88;
const RATE_HI = 1.12;
const RIVAL_RATE_MIN = 0.85;
const RIVAL_RATE_MAX = 1.18;
const SHIFT_XFADE_S = 0.15;
const IDLE_SPEED = 1.5;
const IDLE_XFADE_S = 0.3;
const HYST_DOWN = 1.0; // downshift threshold below band bottom
const REV_COOLDOWN = 1.4;
const REV_GAIN = 0.2;
const TIPIN_OFF_MIN = 0.35;
const LIFTOFF_ON_MIN = 0.5;
const TIPIN_MAX_SPD = 8;
const PASSBY_COOLDOWN = 3;
const PASSBY_DIST = 4;
const PASSBY_GAIN = 0.2;
const RIVAL_RANGE = 46;
const RIVAL_NEAR = 5;
const RIVAL_MASTER = 0.55;
const DOPPLER_C = 160;
const DOPPLER_MIN = 0.85;
const DOPPLER_MAX = 1.18;
const RATE_TAU = 0.06;

const PLAYER_GEAR_KEYS = ["gear1", "gear2", "gear3", "gear4", "gear5", "gear6"];
const RIVAL_GEAR_KEYS = [
  "gear1_rival",
  "gear2_rival",
  "gear3_rival",
  "gear4_rival",
  "gear5_rival",
  "gear6_rival",
];

/** Nominal Hz aliases for old exporters (mid-gear firing rates). */
const BAND_HZ = [70, 85, 100, 115, 130, 145];
const BAND_COUNT = GEAR_COUNT;

function isLiteDevice() {
  try {
    return !!(window.DeviceProfile && window.DeviceProfile.form !== "desktop");
  } catch {
    return false;
  }
}

function rivalVoiceCount() {
  return isLiteDevice() ? 2 : 4;
}

function hashDetune(id) {
  const s = String(id ?? "0");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) % 10001;
  return 0.94 + (u / 10000) * (1.07 - 0.94);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Gear index 0..5 from speed with hysteresis relative to prevGear (0..5). */
export function gearIndexFromSpeed(speed, prevGear) {
  const spd = Math.max(0, speed || 0);
  let g = prevGear | 0;
  if (g < 0 || g >= GEAR_COUNT) g = 0;
  const top = GEAR_COUNT - 1;
  // Upshift when crossing upper boundary
  while (g < top && spd >= (g + 1) * GEAR_WIDTH) g++;
  // Downshift when 1 m/s below band bottom (hysteresis)
  while (g > 0 && spd < g * GEAR_WIDTH - HYST_DOWN) g--;
  // Boost / overspeed stays in top gear
  if (spd >= MAX_SPEED) g = top;
  return g;
}

/** playbackRate within a gear band from local speed. */
export function gearRateFromSpeed(speed, gearIndex) {
  const g = clamp(gearIndex | 0, 0, GEAR_COUNT - 1);
  const lo = g * GEAR_WIDTH;
  const hi = g === GEAR_COUNT - 1 ? Math.max(MAX_SPEED, lo + GEAR_WIDTH) : (g + 1) * GEAR_WIDTH;
  const span = Math.max(0.001, hi - lo);
  const t = clamp(((speed || 0) - lo) / span, 0, 1);
  return RATE_LO + t * (RATE_HI - RATE_LO);
}

/** Legacy: map drive inputs to 0..1 "pos" across 6 gears. */
export function bandPosFromDrive(speed, throttle, boosting) {
  const spd = Math.max(0, speed || 0);
  const th = Math.max(0, Math.min(1, throttle || 0));
  let n = Math.min(1, spd / MAX_SPEED);
  n = n * 0.92 + th * 0.08;
  if (boosting) n += 0.06;
  return clamp(n, 0, 1);
}

/** Legacy equal-power across N bands (kept for imports/tests). */
export function equalPowerBands(pos) {
  const p = clamp(pos || 0, 0, 1);
  const x = p * (BAND_COUNT - 1);
  const i0 = Math.min(BAND_COUNT - 2, Math.floor(x));
  const t = x - i0;
  const a = Math.cos(t * Math.PI * 0.5);
  const b = Math.sin(t * Math.PI * 0.5);
  const w = new Array(BAND_COUNT).fill(0);
  w[i0] = a;
  w[i0 + 1] = b;
  return w;
}

export function equalPower5(pos) {
  return equalPowerBands(pos);
}

export function targetHzBands(pos) {
  const p = clamp(pos || 0, 0, 1);
  const x = p * (BAND_COUNT - 1);
  const i0 = Math.min(BAND_COUNT - 2, Math.floor(x));
  const t = x - i0;
  return BAND_HZ[i0] + (BAND_HZ[i0 + 1] - BAND_HZ[i0]) * t;
}

export function targetHz5(pos) {
  return targetHzBands(pos);
}

export function gentleDriveRate(speed, throttle, boosting) {
  const g = gearIndexFromSpeed(speed, Math.min(GEAR_COUNT - 1, Math.floor((speed || 0) / GEAR_WIDTH)));
  let r = gearRateFromSpeed(speed, g);
  if (boosting) r = Math.min(RATE_HI, r + 0.02);
  return r;
}

function distGain(d) {
  if (!(d < RIVAL_RANGE)) return 0;
  if (d <= RIVAL_NEAR) return 1;
  const t = (d - RIVAL_NEAR) / (RIVAL_RANGE - RIVAL_NEAR);
  const s = 1 - t;
  return s * s;
}

function dopplerFactor(listener, rival) {
  const dx = (listener.x || 0) - (rival.x || 0);
  const dz = (listener.z || 0) - (rival.z || 0);
  const dist = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / dist;
  const uz = dz / dist;
  const dvx = (rival.vx || 0) - (listener.vx || 0);
  const dvz = (rival.vz || 0) - (listener.vz || 0);
  const vr = dvx * ux + dvz * uz;
  let f = DOPPLER_C / (DOPPLER_C - vr);
  if (!Number.isFinite(f)) f = 1;
  return clamp(f, DOPPLER_MIN, DOPPLER_MAX);
}

function radialApproach(listener, rival) {
  const dx = (rival.x || 0) - (listener.x || 0);
  const dz = (rival.z || 0) - (listener.z || 0);
  const dist = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / dist;
  const uz = dz / dist;
  const dvx = (rival.vx || 0) - (listener.vx || 0);
  const dvz = (rival.vz || 0) - (listener.vz || 0);
  return dvx * ux + dvz * uz;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let engineFilter = null;
  let noise = null;
  let noiseGain = null;
  let skidSrc = null;
  let skidGain = null;

  // Player: all 6 gear loops always running (gain 0 when inactive) + idle
  const gearGain = [null, null, null, null, null, null];
  const gearSrc = [null, null, null, null, null, null];
  let idleGain = null;
  let idleSrc = null;
  let playerGear = 0;
  let playerIdle = true;
  let shiftUntil = -1;

  const buffers = Object.create(null);
  let samplesReady = false;
  let level = 0.7;
  let soundOn = true;
  let lastDriftFill = 0;
  let prevThrottle = 0;
  let thLowSince = -99;
  let thHighSince = -99;
  let lastRevUp = -99;
  let lastRevDown = -99;
  let rivalPool = null;
  let rivalStarted = false;
  const passbyLast = Object.create(null);
  const passbyRadial = Object.create(null);

  try {
    const raw = localStorage.getItem("rg2026-vol") ?? localStorage.getItem("nightloop-vol");
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) level = Math.min(1, Math.max(0, n));
    }
  } catch {
    level = 0.7;
  }
  try {
    soundOn = (localStorage.getItem("rg2026-mute") ?? localStorage.getItem("nightloop-mute")) !== "1";
  } catch {
    soundOn = true;
  }

  const SAMPLE_NAMES = [
    "drift_skid",
    "countdown_beep",
    "go",
    "drift_tick",
    "drift_boost",
    "bolt_pickup",
    "turbo_2x",
    "turbo_3x",
    "turbo_end",
    "bump_light",
    "ram_launch",
    "crash_hard",
    "wall_hit",
    "lap_chime",
    "final_lap",
    "finish_fanfare",
    "menu_move",
    "menu_confirm",
  ];

  const ENGINE_LOAD = {
    gear1: ["audio/engine/gear1.wav"],
    gear2: ["audio/engine/gear2.wav"],
    gear3: ["audio/engine/gear3.wav"],
    gear4: ["audio/engine/gear4.wav"],
    gear5: ["audio/engine/gear5.wav"],
    gear6: ["audio/engine/gear6.wav"],
    gear1_rival: ["audio/engine/gear1_rival.wav", "audio/engine/gear1.wav"],
    gear2_rival: ["audio/engine/gear2_rival.wav", "audio/engine/gear2.wav"],
    gear3_rival: ["audio/engine/gear3_rival.wav", "audio/engine/gear3.wav"],
    gear4_rival: ["audio/engine/gear4_rival.wav", "audio/engine/gear4.wav"],
    gear5_rival: ["audio/engine/gear5_rival.wav", "audio/engine/gear5.wav"],
    gear6_rival: ["audio/engine/gear6_rival.wav", "audio/engine/gear6.wav"],
    engine_idle: ["audio/engine/engine_idle.wav", "assets/sfx/engine_idle.wav"],
    engine_idle_rival: [
      "audio/engine/engine_idle_rival.wav",
      "audio/engine/engine_idle.wav",
      "assets/sfx/engine_idle.wav",
    ],
    revup: ["audio/engine/revup.wav"],
    revdown: ["audio/engine/revdown.wav"],
    oneshot_accel_drive: ["audio/engine/oneshot_accel_drive.wav", "audio/engine/revup.wav"],
    oneshot_lift_takeC_end: ["audio/engine/oneshot_lift_takeC_end.wav", "audio/engine/revdown.wav"],
    oneshot_takeA_passby: ["audio/engine/oneshot_takeA_passby.wav"],
  };

  function heard() {
    return soundOn ? level * 0.5 : 0;
  }

  function applyGain() {
    if (master) master.gain.value = heard();
  }

  function buf(name) {
    return buffers[name] || null;
  }

  function nearestGearBuffer(keys, index) {
    if (buf(keys[index])) return buf(keys[index]);
    for (let d = 1; d < GEAR_COUNT; d++) {
      if (index - d >= 0 && buf(keys[index - d])) return buf(keys[index - d]);
      if (index + d < GEAR_COUNT && buf(keys[index + d])) return buf(keys[index + d]);
    }
    return null;
  }

  function fetchFirst(paths) {
    const list = paths.slice();
    const tryNext = () => {
      if (!list.length) return Promise.reject(new Error("none"));
      const path = list.shift();
      return fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .catch(() => tryNext());
    };
    return tryNext();
  }

  function loadOne(name, paths) {
    if (!ctx || buffers[name]) return;
    fetchFirst(paths)
      .then((ab) => ctx.decodeAudioData(ab.slice(0)))
      .then((decoded) => {
        buffers[name] = decoded;
        tryStartPlayerLoops();
        tryStartRivals();
      })
      .catch(() => {
        tryStartPlayerLoops();
        tryStartRivals();
      });
  }

  function loadSamples() {
    if (!ctx || samplesReady) return;
    samplesReady = true;
    for (const name of SAMPLE_NAMES) {
      if (ENGINE_LOAD[name]) continue;
      loadOne(name, [`assets/sfx/${name}.wav`]);
    }
    for (const name of Object.keys(ENGINE_LOAD)) {
      loadOne(name, ENGINE_LOAD[name]);
    }
  }

  function makeLoop(buffer, gainNode, startGain) {
    if (!buffer || !ctx || !gainNode) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const sg = ctx.createGain();
    sg.gain.value = startGain == null ? 1 : startGain;
    src.connect(sg);
    sg.connect(gainNode);
    try {
      src.start();
    } catch {
      return null;
    }
    return { src, gain: sg };
  }

  function tryStartPlayerLoops() {
    if (!ctx || !master) return;
    for (let i = 0; i < GEAR_COUNT; i++) {
      if (!gearGain[i]) {
        gearGain[i] = ctx.createGain();
        gearGain[i].gain.value = 0;
        gearGain[i].connect(master);
      }
      if (!gearSrc[i]) {
        const b = nearestGearBuffer(PLAYER_GEAR_KEYS, i);
        if (b) {
          const made = makeLoop(b, gearGain[i], 1);
          if (made) gearSrc[i] = made.src;
        }
      }
    }
    if (!idleGain) {
      idleGain = ctx.createGain();
      idleGain.gain.value = 0;
      idleGain.connect(master);
    }
    if (!idleSrc && buf("engine_idle")) {
      const made = makeLoop(buf("engine_idle"), idleGain, 1);
      if (made) idleSrc = made.src;
    }
    if (!skidGain) {
      skidGain = ctx.createGain();
      skidGain.gain.value = 0;
      skidGain.connect(master);
    }
    if (!skidSrc && buf("drift_skid")) {
      const made = makeLoop(buf("drift_skid"), skidGain, 1);
      if (made) skidSrc = made.src;
    }
  }

  function makeRivalVoice() {
    const voiceG = ctx.createGain();
    voiceG.gain.value = 0;
    let panNode = null;
    try {
      panNode = ctx.createStereoPanner();
    } catch {
      panNode = null;
    }
    if (panNode) {
      voiceG.connect(panNode);
      panNode.connect(master);
    } else {
      voiceG.connect(master);
    }
    // Two slots: current + crossfade target (ramped swap)
    const slots = [0, 1].map(() => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(voiceG);
      return { gain: g, src: null, gear: -1, idle: false };
    });
    return {
      id: null,
      detune: 1,
      voiceG,
      panNode,
      slots,
      active: 0,
      gear: 0,
      idle: true,
    };
  }

  function startRivalSlot(slot, buffer, gearIndex, isIdle) {
    if (!ctx || !buffer || !slot) return false;
    if (slot.src) {
      try {
        slot.src.stop();
      } catch {
        /* ignore */
      }
      try {
        slot.src.disconnect();
      } catch {
        /* ignore */
      }
      slot.src = null;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(slot.gain);
    try {
      src.start();
    } catch {
      return false;
    }
    slot.src = src;
    slot.gear = gearIndex;
    slot.idle = !!isIdle;
    return true;
  }

  function tryStartRivals() {
    if (!ctx || !master) return;
    if (!rivalPool) {
      const n = rivalVoiceCount();
      rivalPool = [];
      for (let i = 0; i < n; i++) rivalPool.push(makeRivalVoice());
    }
    let ok = true;
    for (const v of rivalPool) {
      const slot = v.slots[v.active];
      if (slot.src) continue;
      const b = buf("engine_idle_rival") || buf("engine_idle") || nearestGearBuffer(RIVAL_GEAR_KEYS, 0);
      if (!b) {
        ok = false;
        continue;
      }
      if (!startRivalSlot(slot, b, 0, true)) ok = false;
      else slot.gain.gain.value = 0;
    }
    rivalStarted = ok || rivalPool.some((v) => v.slots.some((s) => s.src));
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      loadSamples();
      tryStartPlayerLoops();
      tryStartRivals();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = heard();
    master.connect(ctx.destination);

    engine = ctx.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 46;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 280;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engine.start();

    const len = ctx.sampleRate * 1;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 0.7;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    loadSamples();
    tryStartPlayerLoops();
    tryStartRivals();
  }

  function tone(freq, dur, type, gain) {
    if (!ctx || !soundOn || level <= 0) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function playBuf(name, opts) {
    if (!ctx || !soundOn || level <= 0) return false;
    const b = buf(name);
    if (!b) return false;
    const src = ctx.createBufferSource();
    src.buffer = b;
    if (opts && opts.rate) src.playbackRate.value = opts.rate;
    const g = ctx.createGain();
    const vol = (opts && opts.gain != null ? opts.gain : 0.9) * (level / 0.7);
    g.gain.value = Math.max(0, Math.min(1.4, vol));
    src.connect(g);
    g.connect(master);
    try {
      src.start();
    } catch {
      return false;
    }
    return true;
  }

  function fireRev(name) {
    playBuf(name, { gain: REV_GAIN });
  }

  function fadeRivals(now) {
    if (!rivalPool) return;
    for (const v of rivalPool) {
      v.id = null;
      try {
        v.voiceG.gain.setTargetAtTime(0, now, 0.08);
      } catch {
        /* ignore */
      }
    }
  }

  function playerBaseGain(spd, th) {
    return Math.min(0.55, 0.18 + spd * 0.008 + Math.min(0.04, th * 0.04)) * (level / 0.7);
  }

  function setPlayerMix(now, wantIdle, gear, base, xfade) {
    const tau = Math.max(0.02, xfade / 3);
    if (idleGain) {
      idleGain.gain.setTargetAtTime(wantIdle ? base : 0, now, tau);
    }
    for (let i = 0; i < GEAR_COUNT; i++) {
      if (!gearGain[i]) continue;
      const on = !wantIdle && i === gear;
      gearGain[i].gain.setTargetAtTime(on ? base : 0, now, tau);
    }
  }

  return {
    ensure,
    get muted() {
      return !soundOn;
    },
    get soundOn() {
      return soundOn;
    },
    get volume() {
      return level;
    },
    /** Debug: current player gear 1..6 or 0 if idle */
    get debugGear() {
      return playerIdle ? 0 : playerGear + 1;
    },
    setVolume(v) {
      const n = Number(v);
      level = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : level;
      try {
        localStorage.setItem("rg2026-vol", String(level));
      } catch {
        /* private mode */
      }
      applyGain();
    },
    setSound(on) {
      soundOn = !!on;
      try {
        localStorage.setItem("rg2026-mute", soundOn ? "0" : "1");
      } catch {
        /* private mode */
      }
      applyGain();
      return !soundOn;
    },
    toggle() {
      ensure();
      return this.setSound(!soundOn);
    },
    update(speed, throttle, drifting, boosting) {
      if (!ctx || !engine) return;
      const now = ctx.currentTime;
      const th = Math.max(0, Math.min(1, throttle || 0));
      const spd = Math.max(0, speed || 0);

      // Throttle dwell for tip-in / lift-off
      if (th <= 0.15) {
        if (prevThrottle > 0.15) thLowSince = now;
      } else if (prevThrottle <= 0.15) {
        thHighSince = now;
      }

      if (
        th > 0.15 &&
        prevThrottle <= 0.15 &&
        now - lastRevUp > REV_COOLDOWN &&
        now - thLowSince >= TIPIN_OFF_MIN &&
        spd <= TIPIN_MAX_SPD
      ) {
        if (spd > 3) {
          if (!playBuf("oneshot_accel_drive", { gain: REV_GAIN })) fireRev("revup");
        } else {
          fireRev("revup");
        }
        lastRevUp = now;
      } else if (
        th < 0.1 &&
        prevThrottle >= 0.1 &&
        spd > 4 &&
        now - lastRevDown > REV_COOLDOWN &&
        now - thHighSince >= LIFTOFF_ON_MIN
      ) {
        if (spd > 18) {
          if (!playBuf("oneshot_lift_takeC_end", { gain: REV_GAIN })) fireRev("revdown");
        } else {
          fireRev("revdown");
        }
        lastRevDown = now;
      }
      prevThrottle = th;

      tryStartPlayerLoops();
      const useSamples = !!(gearSrc[0] || idleSrc);

      if (useSamples) {
        const base = !soundOn ? 0 : playerBaseGain(spd, th);
        const wantIdle = spd < IDLE_SPEED && th < 0.15;
        let nextGear = playerGear;
        if (!wantIdle) {
          if (spd < IDLE_SPEED && th >= 0.15) nextGear = 0; // standstill throttle -> gear1
          else nextGear = gearIndexFromSpeed(spd, playerGear);
        }

        const gearChanged = !wantIdle && nextGear !== playerGear;
        const idleChanged = wantIdle !== playerIdle;
        if (gearChanged || idleChanged) {
          const xfade = wantIdle || playerIdle ? IDLE_XFADE_S : SHIFT_XFADE_S;
          shiftUntil = now + xfade;
          setPlayerMix(now, wantIdle, nextGear, base, xfade);
          playerGear = nextGear;
          playerIdle = wantIdle;
        } else {
          const xfade = now < shiftUntil ? SHIFT_XFADE_S : 0.08;
          setPlayerMix(now, wantIdle, playerGear, base, xfade);
        }

        // Keep each gear's rate near its band; active gear tracks speed within band.
        for (let i = 0; i < GEAR_COUNT; i++) {
          const src = gearSrc[i];
          if (!src) continue;
          const r =
            !wantIdle && i === playerGear
              ? gearRateFromSpeed(spd, playerGear)
              : gearRateFromSpeed(i * GEAR_WIDTH + GEAR_WIDTH * 0.5, i);
          try {
            src.playbackRate.setTargetAtTime(clamp(r, RATE_LO, RATE_HI), now, RATE_TAU);
          } catch {
            /* ignore */
          }
        }
        // Standstill + throttle: gear1 parked at RATE_LO
        if (!wantIdle && spd < IDLE_SPEED && th >= 0.15 && gearSrc[0]) {
          try {
            gearSrc[0].playbackRate.setTargetAtTime(RATE_LO, now, RATE_TAU);
          } catch {
            /* ignore */
          }
        }

        engineGain.gain.setTargetAtTime(0, now, 0.05);
      } else {
        const freq = 42 + spd * 3.1 + (boosting ? 28 : 0);
        engine.frequency.setTargetAtTime(freq, now, 0.05);
        engineFilter.frequency.setTargetAtTime(260 + th * 900 + (boosting ? 500 : 0), now, 0.05);
        const vol = !soundOn ? 0 : Math.min(0.12, 0.012 + th * 0.04 + spd * 0.0015) * (level / 0.7);
        engineGain.gain.setTargetAtTime(vol, now, 0.05);
      }

      const wantSkid = !!drifting;
      if (skidSrc && skidGain) {
        const nVol = !soundOn ? 0 : (wantSkid ? 0.22 : 0) * (level / 0.7);
        skidGain.gain.setTargetAtTime(nVol, now, 0.04);
        noiseGain.gain.setTargetAtTime(0, now, 0.04);
      } else {
        const nVol = !soundOn ? 0 : (wantSkid ? 0.05 : boosting ? 0.03 : 0) * (level / 0.7);
        noiseGain.gain.setTargetAtTime(nVol, now, 0.04);
      }
    },
    updateRivals(listener, rivals) {
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      if (!listener || !rivals || !rivals.length || !soundOn) {
        fadeRivals(now);
        return;
      }
      tryStartRivals();
      if (!rivalPool || !rivalStarted) {
        fadeRivals(now);
        return;
      }

      const ranked = [];
      for (let i = 0; i < rivals.length; i++) {
        const r = rivals[i];
        if (!r) continue;
        const dx = (r.x || 0) - (listener.x || 0);
        const dz = (r.z || 0) - (listener.z || 0);
        const d = Math.hypot(dx, dz);
        if (!(d < RIVAL_RANGE)) continue;
        ranked.push({ r, d, id: r.id != null ? r.id : i });
      }
      ranked.sort((a, b) => a.d - b.d);

      const assigned = new Set();
      const pick = [];
      for (const v of rivalPool) {
        if (v.id == null) continue;
        const hit = ranked.find((e) => e.id === v.id);
        if (hit && pick.length < rivalPool.length) {
          pick.push({ voice: v, ...hit });
          assigned.add(v.id);
        } else {
          v.id = null;
        }
      }
      for (const e of ranked) {
        if (pick.length >= rivalPool.length) break;
        if (assigned.has(e.id)) continue;
        const free = rivalPool.find((v) => v.id == null && !pick.some((p) => p.voice === v));
        if (!free) break;
        free.id = e.id;
        free.detune = hashDetune(e.id);
        pick.push({ voice: free, ...e });
        assigned.add(e.id);
      }
      for (const v of rivalPool) {
        if (!pick.some((p) => p.voice === v)) {
          v.id = null;
          try {
            v.voiceG.gain.setTargetAtTime(0, now, 0.08);
          } catch {
            /* ignore */
          }
        }
      }

      const fwd = forwardFromYaw(listener.yaw || 0);
      const rightX = -fwd.z;
      const rightZ = fwd.x;
      const playerBase = playerBaseGain(20, 1);
      const rivalCeil = playerBase * RIVAL_MASTER;

      for (const item of pick) {
        const v = item.voice;
        const r = item.r;
        const d = item.d;
        const gDist = distGain(d);
        const th = Math.max(0, Math.min(1, r.throttle != null ? r.throttle : 0));
        const spd = Math.max(0, r.speed != null ? r.speed : Math.hypot(r.vx || 0, r.vz || 0));
        const lat = ((r.x || 0) - (listener.x || 0)) * rightX + ((r.z || 0) - (listener.z || 0)) * rightZ;
        const pan = Math.max(-1, Math.min(1, lat / 18));
        const dop = dopplerFactor(listener, r);
        const det = v.detune || 1;

        const wantIdle = spd < IDLE_SPEED && th < 0.15;
        let nextGear = v.gear | 0;
        if (!wantIdle) {
          if (spd < IDLE_SPEED && th >= 0.15) nextGear = 0;
          else nextGear = gearIndexFromSpeed(spd, v.gear);
        }

        const active = v.slots[v.active];
        const other = v.slots[1 - v.active];
        const needSwap =
          (wantIdle && !v.idle) ||
          (!wantIdle && (v.idle || nextGear !== v.gear));

        if (needSwap) {
          let buffer = null;
          if (wantIdle) buffer = buf("engine_idle_rival") || buf("engine_idle");
          else buffer = nearestGearBuffer(RIVAL_GEAR_KEYS, nextGear);
          if (buffer && startRivalSlot(other, buffer, nextGear, wantIdle)) {
            const tau = (wantIdle || v.idle ? IDLE_XFADE_S : SHIFT_XFADE_S) / 3;
            try {
              other.gain.gain.setValueAtTime(0, now);
              other.gain.gain.linearRampToValueAtTime(1, now + (wantIdle || v.idle ? IDLE_XFADE_S : SHIFT_XFADE_S));
              active.gain.gain.cancelScheduledValues(now);
              active.gain.gain.setValueAtTime(active.gain.gain.value, now);
              active.gain.gain.linearRampToValueAtTime(0, now + (wantIdle || v.idle ? IDLE_XFADE_S : SHIFT_XFADE_S));
            } catch {
              other.gain.gain.value = 1;
              active.gain.gain.value = 0;
            }
            v.active = 1 - v.active;
            v.gear = nextGear;
            v.idle = wantIdle;
            // stop old after fade
            const oldSrc = active.src;
            if (oldSrc) {
              const stopAt = now + SHIFT_XFADE_S + 0.05;
              try {
                oldSrc.stop(stopAt);
              } catch {
                /* ignore */
              }
            }
          }
        }

        const cur = v.slots[v.active];
        let rate = wantIdle ? 1 : gearRateFromSpeed(spd, v.gear);
        rate = rate * det * dop;
        rate = clamp(rate, RIVAL_RATE_MIN, RIVAL_RATE_MAX);
        try {
          if (cur.src) cur.src.playbackRate.setTargetAtTime(rate, now, RATE_TAU);
        } catch {
          /* ignore */
        }

        const voiceVol = !soundOn ? 0 : rivalCeil * gDist;
        try {
          v.voiceG.gain.setTargetAtTime(voiceVol, now, 0.06);
          if (v.panNode) v.panNode.pan.setTargetAtTime(pan, now, 0.05);
        } catch {
          /* ignore */
        }

        const idKey = String(item.id);
        const rad = radialApproach(listener, r);
        const prevRad = passbyRadial[idKey];
        passbyRadial[idKey] = rad;
        if (
          d < PASSBY_DIST &&
          prevRad != null &&
          prevRad < 0 &&
          rad > 0 &&
          now - (passbyLast[idKey] || -99) > PASSBY_COOLDOWN
        ) {
          if (playBuf("oneshot_takeA_passby", { gain: PASSBY_GAIN * gDist })) {
            passbyLast[idKey] = now;
          }
        }
      }
    },
    blip() {
      ensure();
      if (!playBuf("countdown_beep", { gain: 0.85 })) tone(520, 0.12, "square", 0.07);
    },
    pickup() {
      ensure();
      if (!playBuf("bolt_pickup", { gain: 0.9 })) tone(520, 0.12, "square", 0.07);
    },
    turbo(tier) {
      ensure();
      const t = tier | 0;
      const name = t >= 2 ? "turbo_3x" : "turbo_2x";
      if (!playBuf(name, { gain: 0.95 })) {
        tone(220, 0.08, "sawtooth", 0.06);
        tone(880, 0.18, "square", 0.07);
      }
    },
    turboEnd() {
      ensure();
      if (!playBuf("turbo_end", { gain: 0.85 })) tone(180, 0.12, "sawtooth", 0.05);
    },
    go() {
      ensure();
      if (!playBuf("go", { gain: 0.95 })) tone(660, 0.22, "square", 0.09);
    },
    lap() {
      ensure();
      if (!playBuf("lap_chime", { gain: 0.9 })) tone(880, 0.16, "triangle", 0.08);
    },
    finalLap() {
      ensure();
      if (!playBuf("final_lap", { gain: 0.95 })) {
        tone(880, 0.16, "triangle", 0.08);
        setTimeout(() => tone(660, 0.2, "triangle", 0.07), 120);
      }
    },
    finish() {
      ensure();
      if (!playBuf("finish_fanfare", { gain: 1 })) {
        tone(523, 0.18, "triangle", 0.08);
        setTimeout(() => tone(659, 0.2, "triangle", 0.07), 140);
        setTimeout(() => tone(784, 0.32, "triangle", 0.07), 280);
      }
    },
    wall() {
      ensure();
      if (!playBuf("wall_hit", { gain: 0.85 })) tone(90, 0.08, "sawtooth", 0.05);
    },
    bump() {
      ensure();
      if (!playBuf("bump_light", { gain: 0.8 })) tone(140, 0.06, "sawtooth", 0.04);
    },
    crash() {
      ensure();
      if (!playBuf("crash_hard", { gain: 1 })) tone(70, 0.14, "sawtooth", 0.07);
    },
    ram() {
      ensure();
      if (!playBuf("ram_launch", { gain: 0.9 })) tone(110, 0.12, "sawtooth", 0.06);
    },
    driftBoost() {
      ensure();
      if (!playBuf("drift_boost", { gain: 0.9 })) {
        tone(300, 0.08, "sawtooth", 0.05);
        tone(700, 0.14, "square", 0.05);
      }
    },
    driftTick() {
      ensure();
      if (!playBuf("drift_tick", { gain: 0.55 })) tone(980, 0.04, "square", 0.03);
    },
    driftCharge(held) {
      const fill = Math.max(0, Math.min(1, (held || 0) / 0.425));
      const step = Math.floor(fill * 4);
      const prev = Math.floor(lastDriftFill * 4);
      lastDriftFill = fill;
      if (step > prev && step > 0) this.driftTick();
      if (fill <= 0) lastDriftFill = 0;
    },
    menuMove() {
      ensure();
      if (!playBuf("menu_move", { gain: 0.55 })) tone(440, 0.05, "square", 0.04);
    },
    menuConfirm() {
      ensure();
      if (!playBuf("menu_confirm", { gain: 0.75 })) tone(660, 0.1, "square", 0.06);
    },
  };
}
