import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { createAudio } from "./audio.js";
import { createInput } from "./input.js";
import { matchCheatKeys, matchCheatWord } from "./cheats.js";
import { addTurboCharge, botInput, draftMul, driftBarFill, driftCycleHz, DRIFT_BAR_HOLD_S, forwardFromYaw, launchMul, loopFrame, rightFromForward, rivalLabelVisible, rubberMul, setDriftRise, slingMul, standings, stepWorld, stuntProps, trailStripe, wrapAngle } from "./physics.js";
import { FINISH_DIST, buildDriftCity, buildTrack, buildTrackFromPieces, defaultPieces, edgeScrubLat, editorPreview, makeField, mapFit, piecesToPoints, roadPaintSpec, sampleAtDist, scenerySpot } from "./track.js";
import { SLOT_KART, clampName, createNet } from "./net.js";

document.addEventListener('contextmenu',e=>e.preventDefault());

const params = new URLSearchParams(location.search);
const AUTO = params.get("autotest") === "1";
const SHOT = params.get("shot") === "1";
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LITE = window.DeviceProfile.form !== "desktop"
  || matchMedia("(pointer: coarse)").matches
  || matchMedia("(hover: none)").matches;
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.message || e.error || "error")));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason || "rejection")));

const canvas = document.getElementById("view");
const hud = {
  place: document.getElementById("place"),
  lap: document.getElementById("lap"),
  speed: document.getElementById("speed"),
  bar: document.getElementById("bar"),
  barLabel: document.getElementById("barlabel"),
  banner: document.getElementById("banner"),
  wrong: document.getElementById("wrong"),
  turboRead: document.getElementById("turbo-read"),
  count: document.getElementById("countdown"),
  toast: document.getElementById("toast"),
  hint: document.getElementById("lookhint"),
};
const overlay = document.getElementById("overlay");
const cardTitle = document.getElementById("card-title");
const cardLede = document.getElementById("card-lede");
const cardHelp = document.getElementById("card-help");
const cardBest = document.getElementById("card-best");
const cardExtra = document.getElementById("card-extra");
const primaryBtn = document.getElementById("primary");
const secondaryBtn = document.getElementById("secondary");
const pauseBtn = document.getElementById("btn-pause");
const muteBtn = document.getElementById("btn-mute");
const menu = document.getElementById("menu");
const raceCard = document.getElementById("race-card");
const menuMain = document.getElementById("menu-main");
const menuOptions = document.getElementById("menu-options");
const menuLobby = document.getElementById("menu-lobby");
const menuWorld = document.getElementById("menu-world");
const menuEdit = document.getElementById("menu-edit");
const roomCodeEl = document.getElementById("room-code");
const menuStatus = document.getElementById("menu-status");
const menuBest = document.getElementById("menu-best");
const nameInput = document.getElementById("player-name");
const optVol = document.getElementById("opt-vol");
const optSound = document.getElementById("opt-sound");
const optDrift = document.getElementById("opt-drift");
const lobbyList = document.getElementById("lobby-list");
const lobbyStart = document.getElementById("lobby-start");
const mapEl = document.getElementById("map");
const testOut = document.getElementById("test-out");
const fatal = document.getElementById("fatal");

function loadPieces() {
  try {
    const raw = localStorage.getItem("rg2026-track");
    const list = raw ? JSON.parse(raw) : null;
    if (piecesToPoints(list)) return list;
  } catch {
    /* empty */
  }
  return null;
}

function bootCourse() {
  const saved = sessionStorage.getItem("rg2026-course");
  if (saved === "drift") return "drift";
  if (saved === "stunt") return "stunt";
  if (saved === "mine" && loadPieces()) return "mine";
  return "city";
}

const bootedCourse = bootCourse();
const track = bootedCourse === "drift" ? buildDriftCity() : bootedCourse === "mine" ? buildTrackFromPieces(loadPieces()) : buildTrack();
const yardHome = stuntProps().spawn;
let karts = bootedCourse === "stunt" ? [makeYardKart({ player: true, name: "YOU", x: yardHome.x, z: yardHome.z, yaw: yardHome.yaw })] : makeField(track);
let mode = "title";
let countdown = 3;
let countShown = 0;
let raceTime = 0;
let shownLap = 0;
let bannerT = 0;
let toastT = 0;
let userLooked = false;
let wallAt = 0;
let finishedPing = false;
let hadDriftBoost = false;
let heardTurboTier = 0;
let autoT = 0;
let autoDone = false;
let localSlot = 0;
let roster = [{ slot: 0, name: "Player 1" }];
let raceEpoch = 1;
let seenEpoch = -1;
let nameEdited = false;
let menuBusy = false;
const seenPause = [0, 0, 0, 0];
const seenRestart = [0, 0, 0, 0];

const audio = createAudio();
const net = createNet();
const input = createInput(canvas);
input.attachTouch(
  document.getElementById("stick"),
  document.getElementById("nub"),
  document.getElementById("btn-gas"),
  document.getElementById("btn-brake"),
  document.getElementById("btn-drift"),
  document.getElementById("btn-cam"),
  document.getElementById("btn-turbo")
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !LITE,
  powerPreference: "high-performance",
  alpha: false,
  preserveDrawingBuffer: AUTO || SHOT,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x070612, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070612, 0.0045);
const hemi = new THREE.HemisphereLight(0x9aafff, 0x121018, 0.55);
const fill = new THREE.AmbientLight(0x243050, 0.22);
const sun = new THREE.DirectionalLight(0xd0dcff, 0.85);
sun.position.set(-28, 48, 16);
scene.add(hemi);
scene.add(fill);
scene.add(sun);

const SKY_KEYS = [
  { t: 0, sky: 0x0b1022, fog: 0x0b1022, fogD: 0.0048, hemi: 0x6674b8, ground: 0x100e14, hemiI: 0.42, amb: 0x1c2444, ambI: 0.16, sun: 0xb7c6f2, sunI: 0.42, exp: 1.02, y: 18 },
  { t: 0.16, sky: 0x1a2748, fog: 0x1a2038, fogD: 0.0044, hemi: 0x8898d0, ground: 0x1a1418, hemiI: 0.5, amb: 0x2a3058, ambI: 0.2, sun: 0xc8d4ff, sunI: 0.55, exp: 1.06, y: 22 },
  { t: 0.28, sky: 0xff7a48, fog: 0x6a4038, fogD: 0.0036, hemi: 0xffb090, ground: 0x4a3020, hemiI: 0.72, amb: 0xffc4a0, ambI: 0.28, sun: 0xffb070, sunI: 1.15, exp: 1.12, y: 26 },
  { t: 0.42, sky: 0x7eb6f0, fog: 0xb7d4ee, fogD: 0.0031, hemi: 0xfff6e4, ground: 0x8aa4b4, hemiI: 0.9, amb: 0xfff8ee, ambI: 0.38, sun: 0xfff4dc, sunI: 1.35, exp: 1.22, y: 64 },
  { t: 0.55, sky: 0x6eb4ff, fog: 0xd2ebff, fogD: 0.0028, hemi: 0xffffff, ground: 0x9eb4c0, hemiI: 1.05, amb: 0xfffdf6, ambI: 0.46, sun: 0xfffaf0, sunI: 1.5, exp: 1.28, y: 80 },
  { t: 0.72, sky: 0xff5c32, fog: 0x8a4030, fogD: 0.0035, hemi: 0xff9060, ground: 0x402018, hemiI: 0.7, amb: 0xffa070, ambI: 0.26, sun: 0xff8040, sunI: 1.05, exp: 1.1, y: 18 },
  { t: 0.86, sky: 0x241c48, fog: 0x1a1434, fogD: 0.0042, hemi: 0x6a5a98, ground: 0x120e18, hemiI: 0.4, amb: 0x2a2048, ambI: 0.16, sun: 0xc0b0e8, sunI: 0.4, exp: 1.0, y: 28 },
  { t: 1, sky: 0x070612, fog: 0x070612, fogD: 0.0045, hemi: 0x9aafff, ground: 0x121018, hemiI: 0.55, amb: 0x243050, ambI: 0.22, sun: 0xd0dcff, sunI: 0.85, exp: 1.15, y: 48 },
];
const skyMix = new THREE.Color();
const skyA = new THREE.Color();
const skyB = new THREE.Color();
let skyMode = "night";
let skyClock = 0;
const SKY_BLEND_S = 2;
let skyBlendT = 0;
let skyFrom = null;
let skyBlendReady = false;

function mixHex(out, a, b, t) {
  skyA.setHex(a);
  skyB.setHex(b);
  out.copy(skyA).lerp(skyB, t);
  return out;
}

const SKY_HALF_S = 180;
const SKY_FULL_S = 420;
function skyEase(u) {
  return u * u * (3 - 2 * u);
}
function skyPhase(dt) {
  if (skyMode === "afternoon") return 0.55;
  if (skyMode === "morning") {
    // Ping-pong, not wrap: a % wrap snapped dawn back to pre-dawn every 32 s.
    // Slow: one dawn sweep is 3 min each way (~6 min round trip), eased ping-pong.
    skyClock = (skyClock + dt) % (SKY_HALF_S * 2);
    return 0.04 + skyEase(1 - Math.abs(1 - skyClock / SKY_HALF_S)) * 0.38;
  }
  if (skyMode === "night") {
    skyClock = (skyClock + dt) % (SKY_HALF_S * 2);
    return 0.62 + skyEase(1 - Math.abs(1 - skyClock / SKY_HALF_S)) * 0.38;
  }
  skyClock = (skyClock + dt) % SKY_FULL_S;
  return skyClock / SKY_FULL_S;
}

function applySkyLook(t) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t < t) i += 1;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
  const s = u * u * (3 - 2 * u);
  const n = (key) => a[key] + (b[key] - a[key]) * s;
  mixHex(skyMix, a.sky, b.sky, s);
  renderer.setClearColor(skyMix, 1);
  mixHex(scene.fog.color, a.fog, b.fog, s);
  scene.fog.density = n("fogD");
  mixHex(hemi.color, a.hemi, b.hemi, s);
  mixHex(hemi.groundColor, a.ground, b.ground, s);
  hemi.intensity = n("hemiI");
  mixHex(fill.color, a.amb, b.amb, s);
  fill.intensity = n("ambI");
  mixHex(sun.color, a.sun, b.sun, s);
  sun.intensity = n("sunI");
  const az = (t - 0.5) * Math.PI;
  sun.position.set(Math.sin(az) * 64, n("y"), 18);
  renderer.toneMappingExposure = n("exp");
  if (skyBlendT > 0 && skyFrom) {
    const r = skyBlendT / SKY_BLEND_S;
    const w = r * r * (3 - 2 * r);
    renderer.setClearColor(skyMix.lerp(skyFrom.clear, w), 1);
    scene.fog.color.lerp(skyFrom.fog, w);
    scene.fog.density += (skyFrom.fogD - scene.fog.density) * w;
    hemi.color.lerp(skyFrom.hemi, w);
    hemi.groundColor.lerp(skyFrom.ground, w);
    renderer.toneMappingExposure += (skyFrom.exp - renderer.toneMappingExposure) * w;
  }
}

function paintSky(mode) {
  document.querySelectorAll(".js-sky").forEach((el) => {
    el.checked = el.dataset.sky === mode;
  });
}

function applySky(mode) {
  const next = mode === "morning" || mode === "afternoon" || mode === "night" || mode === "cycle" ? mode : "night";
  if (next !== skyMode) {
    skyClock = 0;
    if (skyBlendReady) {
      skyFrom = {
        clear: renderer.getClearColor(new THREE.Color()),
        fog: scene.fog.color.clone(),
        fogD: scene.fog.density,
        hemi: hemi.color.clone(),
        ground: hemi.groundColor.clone(),
        exp: renderer.toneMappingExposure,
      };
      skyBlendT = SKY_BLEND_S;
    }
  }
  skyMode = next;
  paintSky(next);
  applySkyLook(skyPhase(0));
  try {
    localStorage.setItem("rg2026-sky", next);
  } catch {
    /* private mode */
  }
}

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 520);
const cam = { yaw: 0.15, pitch: 0.3, dist: 6.1, targetYaw: 0.15, targetPitch: 0.3, targetDist: 6.1 };
const raycaster = new THREE.Raycaster();
const occluders = [];
const lamps = [];
const kartMeshes = [];
const clock = new THREE.Clock();

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Road grain: one 256 px tile = ROAD_TILE_M metres (~2 cm specks), mapped in world XZ so
// corners have no seams or stretch. Low contrast so it reads as asphalt and mips cleanly.
const ROAD_TILE_M = 5;
function roadTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#2a3144";
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry(9);
  // Soft wear patches (tile-safe: drawn wrapped).
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 18 + rnd() * 40;
    const v = rnd() < 0.5 ? 30 : 70;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v + 4},${v + 16},0.10)`);
      gr.addColorStop(1, `rgba(${v},${v + 4},${v + 16},0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0, n = LITE ? 2600 : 5200; i < n; i++) {
    const v = rnd() < 0.5 ? 22 + rnd() * 18 : 64 + rnd() * 34;
    g.fillStyle = `rgba(${v},${v + 3},${v + 12},${0.14 + rnd() * 0.18})`;
    g.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 1, 1 + (rnd() < 0.3 ? 1 : 0));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function litMat(opts) {
  if (!LITE) return new THREE.MeshStandardMaterial(opts);
  const lite = { ...opts };
  delete lite.roughness;
  delete lite.metalness;
  return new THREE.MeshLambertMaterial(lite);
}

function windowTexture(seed) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d");
  const rnd = mulberry(seed);
  g.fillStyle = "#101118";
  g.fillRect(0, 0, 64, 128);
  const cols = ["#8af6ff", "#ff5fe0", "#ffe29a", "#f4f7ff", "#9eb0c8"];
  for (let y = 3; y < 128; y += 8) {
    for (let x = 3; x < 64; x += 6) {
      if (rnd() > 0.55) continue;
      g.globalAlpha = 0.35 + rnd() * 0.65;
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      g.fillRect(x, y, 3, 5);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(word, color) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#140816";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = color;
  g.font = "700 68px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(word, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pushTriNormal(positions, ia, ib, ic) {
  const ax = positions[ia * 3];
  const ay = positions[ia * 3 + 1];
  const az = positions[ia * 3 + 2];
  const bx = positions[ib * 3];
  const by = positions[ib * 3 + 1];
  const bz = positions[ib * 3 + 2];
  const cx = positions[ic * 3];
  const cy = positions[ic * 3 + 1];
  const cz = positions[ic * 3 + 2];
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  return abz * acx - abx * acz;
}

function meshFrom(positions, colors, uvs, indices, material) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (uvs) geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  return mesh;
}

function placedLat(s, lat) {
  const base = track.halfW || 1;
  const left = s.halfL || s.half || base;
  const right = s.halfR || s.half || base;
  if (lat >= 0) return (lat / base) * right;
  return (lat / base) * left;
}

function chordRight(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const span = Math.hypot(dx, dz);
  if (span < 0.05) return null;
  return rightFromForward({ x: dx / span, z: dz / span });
}

// A chord that passes through a part of the lap it does not belong to draws
// the pink edge across the lane. Leave that quad out.
function chordCutsFar(samples, i, length, limit) {
  const n = samples.length;
  const a = samples[i];
  const b = samples[(i + 1) % n];
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const ab2 = abx * abx + abz * abz || 1;
  for (let j = 0; j < n; j++) {
    let along = Math.abs(samples[j].dist - a.dist);
    if (along > length * 0.5) along = length - along;
    if (along < 40) continue;
    const px = samples[j].x - a.x;
    const pz = samples[j].z - a.z;
    let u = (px * abx + pz * abz) / ab2;
    if (u <= 0.05 || u >= 0.95) continue;
    if (Math.hypot(px - abx * u, pz - abz * u) < limit) return true;
  }
  return false;
}

const roadSkipped = [];
// One up-facing triangle (normal +Y), whichever order the joint came in. A down-facing twin would be culled and zero the shared normals.
function roadFan(indices, P, c, p, q) {
  const ux = P[p * 3] - P[c * 3], uz = P[p * 3 + 2] - P[c * 3 + 2];
  const vx = P[q * 3] - P[c * 3], vz = P[q * 3 + 2] - P[c * 3 + 2];
  const ny = uz * vx - ux * vz;
  if (Math.abs(ny) < 1e-6) return;
  if (ny > 0) indices.push(c, p, q);
  else indices.push(c, q, p);
}
function buildRoad() {
  const samples = track.samples;
  const n = samples.length;
  const hw = track.halfW;
  const positions = [];
  const uvs = [];
  const indices = [];
  let prevEnd = -1;
  let firstStart = -1;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    if (chordCutsFar(samples, i, track.length, hw)) { roadSkipped.push(i); prevEnd = -1; continue; }
    const right = chordRight(a, b);
    if (!right) continue;
    const base = positions.length / 3;
    // Each chord is a rectangle on its own right vector, so on a bend neighbours leave a wedge
    // on the outside (black stripes across the road). Fill each joint with a fan from the sample centre.
    const joint = prevEnd >= 0;
    if (joint) {
      positions.push(a.x, 0, a.z);
      uvs.push(a.x / ROAD_TILE_M, a.z / ROAD_TILE_M);
    }
    const q = positions.length / 3;
    for (const s of [a, b]) {
      const left = s.halfL || s.half || hw;
      const rightW = s.halfR || s.half || hw;
      positions.push(
        s.x - right.x * left, 0, s.z - right.z * left,
        s.x + right.x * rightW, 0, s.z + right.z * rightW
      );
      uvs.push(
        (s.x - right.x * left) / ROAD_TILE_M, (s.z - right.z * left) / ROAD_TILE_M,
        (s.x + right.x * rightW) / ROAD_TILE_M, (s.z + right.z * rightW) / ROAD_TILE_M
      );
    }
    // Up-facing winding: the old order gave normal -Y, so the road was back-face culled and only the black ground showed.
    indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    if (joint) {
      // Fan after this quad's corners exist, so roadFan can read them and pick the up-facing order.
      roadFan(indices, positions, base, prevEnd, q);
      roadFan(indices, positions, base, prevEnd + 1, q + 1);
    }
    if (i === 0) firstStart = q;
    prevEnd = q + 2;
  }
  if (prevEnd >= 0 && firstStart >= 0) {
    const s = samples[0];
    const c = positions.length / 3;
    positions.push(s.x, 0, s.z);
    uvs.push(s.x / ROAD_TILE_M, s.z / ROAD_TILE_M);
    roadFan(indices, positions, c, prevEnd, firstStart);
    roadFan(indices, positions, c, prevEnd + 1, firstStart + 1);
  }
  const mat = litMat({
    map: roadTexture(),
    roughness: 0.62,
    metalness: 0.08,
    emissive: 0x243044,
    emissiveIntensity: 0.62,
  });
  scene.add(meshFrom(positions, null, uvs, indices, mat));
  if (roadSkipped.length) console.warn("road chords skipped", roadSkipped.length, roadSkipped.slice(0, 12));
  buildSpeedTicks();
  buildShoulder();
}

function addLaneDash(positions, colors, indices, dist, length, lat, half, r, g, b) {
  const steps = Math.max(1, Math.round(length / 2));
  for (let i = 0; i < steps; i++) {
    const a = sampleAtDist(track.samples, track.length, dist + (length * i) / steps);
    const c = sampleAtDist(track.samples, track.length, dist + (length * (i + 1)) / steps);
    const right = chordRight(a, c);
    if (!right) continue;
    const base = positions.length / 3;
    for (const p of [a, c]) {
      positions.push(
        p.x + right.x * (lat - half), 0.08, p.z + right.z * (lat - half),
        p.x + right.x * (lat + half), 0.08, p.z + right.z * (lat + half)
      );
      colors.push(r, g, b, r, g, b);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
}

function paintMesh(positions, colors, indices) {
  if (indices.length >= 3 && pushTriNormal(positions, indices[0], indices[1], indices[2]) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const mesh = meshFrom(positions, colors, null, indices, mat);
  mesh.renderOrder = 1;
  scene.add(mesh);
}

function buildSpeedTicks() {
  const spec = roadPaintSpec();
  const step = spec.dashLen + spec.dashGap;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let dist = 0, n = 0; dist < track.length; dist += step, n += 1) {
    const grouped = n % spec.dashGroup === 0;
    const half = grouped ? spec.dashGroupHalf : spec.dashHalf;
    const bright = grouped ? 1 : 0.92;
    addLaneDash(positions, colors, indices, dist, spec.dashLen, 0, half, bright, 0.96, 1);
  }
  paintMesh(positions, colors, indices);
}

function buildWheelGrain() {
  const spec = roadPaintSpec();
  const step = spec.grainLen + spec.grainGap;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let dist = 0; dist < track.length; dist += step) {
    addLaneDash(positions, colors, indices, dist, spec.grainLen, -spec.grainLat, spec.grainHalf, 0.75, 0.9, 0.95);
    addLaneDash(positions, colors, indices, dist + step * spec.grainStagger, spec.grainLen, spec.grainLat, spec.grainHalf, 0.75, 0.9, 0.95);
  }
  paintMesh(positions, colors, indices);
}

function buildShoulder() {
  const edge = edgeScrubLat(track.halfW);
  const spec = roadPaintSpec();
  const band = spec.shoulderBand;
  const color = () => spec.shoulder;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  buildRibbon(edge - band, edge, 0.05, color, mat);
  buildRibbon(-edge, -edge + band, 0.05, color, mat);
}

function buildRibbon(lat0, lat1, y, colorAt, material) {
  const samples = track.samples;
  const n = samples.length;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    if (chordCutsFar(samples, i, track.length, track.halfW)) continue;
    const right = chordRight(a, b);
    if (!right) continue;
    const base = positions.length / 3;
    for (const s of [a, b]) {
      const dist = s === b && i === n - 1 ? track.length : s.dist;
      for (const lat of [lat0, lat1]) {
        const placed = placedLat(s, lat);
        positions.push(s.x + right.x * placed, y, s.z + right.z * placed);
        const col = colorAt(dist, lat);
        colors.push(col[0], col[1], col[2]);
      }
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const mesh = meshFrom(positions, colors, null, indices, material);
  scene.add(mesh);
  return mesh;
}

let wallSkipped = 0;
function buildWall(lat, y0, y1, material, occlude) {
  const samples = track.samples;
  const n = samples.length;
  const positions = [];
  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const placed = placedLat(s, lat);
    const x = s.x + s.rx * placed;
    const z = s.z + s.rz * placed;
    positions.push(x, y0, z, x, y1, z);
  }
  let indices = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const cx = positions[c * 3];
    const cz = positions[c * 3 + 2];
    if (wallBlocksRoad(samples, i, ax, az, cx, cz)) { wallSkipped += 1; continue; }
    indices.push(a, c, b, b, c, d);
  }
  const s0 = samples[0];
  const towardX = s0.x - (s0.x + s0.rx * lat);
  const towardZ = s0.z - (s0.z + s0.rz * lat);
  const nyx = positions[2] - positions[0];
  const nyy = positions[3] - positions[1];
  const nyz = positions[4] - positions[2];
  const nx = nyy * (positions[2 + 2] - positions[2]) - nyz * (positions[2 + 1] - positions[1]);
  // Horizontal facing: use a triangle normal's xz against the direction to the road center.
  const nrm = indices.length ? wallNormal(positions, indices[0], indices[1], indices[2]) : { x: 0, y: 0, z: 0 };
  if (nrm.x * towardX + nrm.z * towardZ < 0) {
    indices = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const ax = positions[a * 3];
      const az = positions[a * 3 + 2];
      const cx = positions[c * 3];
      const cz = positions[c * 3 + 2];
      if (wallBlocksRoad(samples, i, ax, az, cx, cz)) { wallSkipped += 1; continue; }
      indices.push(a, b, c, b, d, c);
    }
  }
  const mesh = meshFrom(positions, null, null, indices, material);
  scene.add(mesh);
  if (occlude) occluders.push(mesh);
  return { nyx, nx };
}

function wallBlocksRoad(samples, i, ax, az, cx, cz) {
  const n = samples.length;
  const abx = cx - ax;
  const abz = cz - az;
  const ab2 = abx * abx + abz * abz || 1;
  for (let j = 0; j < n; j++) {
    let dj = Math.abs(j - i);
    if (dj > n / 2) dj = n - dj;
    if (dj < 4) continue;
    const px = samples[j].x - ax;
    const pz = samples[j].z - az;
    let u = (px * abx + pz * abz) / ab2;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    const d = Math.hypot(px - abx * u, pz - abz * u);
    if (d < 9) return true;
  }
  return false;
}

function wallNormal(positions, ia, ib, ic) {
  const a = ia * 3;
  const b = ib * 3;
  const c = ic * 3;
  const abx = positions[b] - positions[a];
  const aby = positions[b + 1] - positions[a + 1];
  const abz = positions[b + 2] - positions[a + 2];
  const acx = positions[c] - positions[a];
  const acy = positions[c + 1] - positions[a + 1];
  const acz = positions[c + 2] - positions[a + 2];
  return {
    x: aby * acz - abz * acy,
    y: abz * acx - abx * acz,
    z: abx * acy - aby * acx,
  };
}

function buildCity() {
  buildRoad();
  const curbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const curb = (side) => {
    const a = side * (track.halfW - 2.6);
    const b = side * (track.halfW - 0.85);
    buildRibbon(Math.min(a, b), Math.max(a, b), 0.045, (dist) => {
      const on = Math.floor(dist / 2) % 2 === 0;
      return on ? [0.9, 0.95, 0.96] : [0.85, 0.12, 0.28];
    }, curbMat);
  };
  curb(1);
  curb(-1);

  const outer = track.outside * track.halfW;
  if (track.kind !== "custom") {
    const wallMat = litMat({ color: 0x2c3548, roughness: 0.86, metalness: 0.08, side: THREE.DoubleSide });
    buildWall(outer, 0, 2.4, wallMat, true);
    buildWall(-outer, 0, 1.7, wallMat, true);
    const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const neonCols = [
      [0.45, 0.98, 1],
      [1, 0.32, 0.78],
      [1, 0.78, 0.35],
    ];
    buildRibbon(outer - 0.15, outer + 0.28, 2.42, (dist) => neonCols[Math.floor(dist / 18) % 3], neonMat);
    buildRibbon(outer + 0.55, outer + 3.4, 0.02, () => [0.07, 0.075, 0.09], litMat({ color: 0x12131a, roughness: 1 }));
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    litMat({ color: 0x08070e, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  scene.add(ground);
  console.info("walls", track.kind || "city", "skipped quads", wallSkipped);

  const winMats = [7, 21, 44].map((seed) => {
    return litMat({
      color: 0x161822,
      emissive: 0xffffff,
      emissiveMap: windowTexture(seed),
      emissiveIntensity: 1.35,
      roughness: 0.86,
      metalness: 0.04,
    });
  });
  const rnd = mulberry(3);
  let prev = null;
  const phone = window.DeviceProfile.form === "phone";
  const bldgGap = phone ? 56 : LITE ? 28 : 14;
  const bldgStep = phone ? 14 : LITE ? 6 : 3;
  for (let i = 0; i < track.samples.length; i += bldgStep) {
    const s = track.samples[i];
    if (prev && Math.hypot(s.x - prev.x, s.z - prev.z) < bldgGap) continue;
    const tall = rnd() > 0.82;
    const h = (tall ? 34 : 8) + rnd() * (tall ? 32 : 22);
    const w = 6 + rnd() * 7;
    const d = 6 + rnd() * 8;
    const spot = scenerySpot(track, s, w, d, (s.half || track.halfW) + 16 + d * 0.5, 14);
    if (!spot) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), winMats[i % 3]);
    mesh.position.set(spot.x, h / 2, spot.z);
    mesh.rotation.y = spot.yaw;
    scene.add(mesh);
    if (!LITE) occluders.push(mesh);
    prev = s;
  }

  const words = ["VOLT", "METRO", "24H", "NOODLE", "SIGNAL", "ARCADE", "KILO", "EAST", "NITE", "LANE"];
  const wordColors = ["#7ef6ff", "#ff4fd8", "#ffe08a"];
  for (let w = 0; w < words.length; w++) {
    const dist = (100 + w * ((track.length - 120) / words.length)) % track.length;
    const s = sampleAtDist(track.samples, track.length, dist);
    const spot = scenerySpot(track, s, 7.2, 7.2, (s.half || track.halfW) + 18 + (w % 3) * 2, 12);
    if (!spot) continue;
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(words[w], wordColors[w % 3]), transparent: true, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), mat);
    sign.position.set(spot.x, 5.5 + (w % 4), spot.z);
    sign.lookAt(s.x, sign.position.y, s.z);
    scene.add(sign);
  }

  const poleMat = litMat({ color: 0x2a3142, roughness: 0.6, metalness: 0.4 });
  const lampStep = LITE ? 64 : 32;
  for (let dist = 8; dist < track.length; dist += lampStep) {
    const s = sampleAtDist(track.samples, track.length, dist);
    const spot = scenerySpot(track, s, 1.4, 1.4, (s.half || track.halfW) + 2.4);
    if (!spot) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.2, LITE ? 5 : 6), poleMat);
    pole.position.set(spot.x, 2.6, spot.z);
    scene.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, LITE ? 6 : 10, LITE ? 5 : 8),
      new THREE.MeshBasicMaterial({ color: Math.floor(dist / lampStep) % 2 ? 0xff4fd8 : 0x7ef6ff })
    );
    bulb.position.set(spot.x, 5.15, spot.z);
    scene.add(bulb);
  }

  const finish = sampleAtDist(track.samples, track.length, FINISH_DIST);
  const band = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
  );
  const bp = [];
  const bc = [];
  const hw = finish.half || track.halfW;
  const along = roadPaintSpec().startAlong * 0.5;
  for (let i = 0; i < 10; i++) {
    const a0 = -hw + (i * 2 * hw) / 10;
    const a1 = -hw + ((i + 1) * 2 * hw) / 10;
    const x00 = finish.x + finish.rx * a0 - finish.tx * along;
    const z00 = finish.z + finish.rz * a0 - finish.tz * along;
    const x10 = finish.x + finish.rx * a1 - finish.tx * along;
    const z10 = finish.z + finish.rz * a1 - finish.tz * along;
    const x01 = finish.x + finish.rx * a0 + finish.tx * along;
    const z01 = finish.z + finish.rz * a0 + finish.tz * along;
    const x11 = finish.x + finish.rx * a1 + finish.tx * along;
    const z11 = finish.z + finish.rz * a1 + finish.tz * along;
    const y = 0.06;
    bp.push(x00, y, z00, x10, y, z10, x11, y, z11, x00, y, z00, x11, y, z11, x01, y, z01);
    const on = i % 2 === 0 ? [0.95, 0.98, 1] : [0.08, 0.09, 0.12];
    for (let k = 0; k < 6; k++) bc.push(on[0], on[1], on[2]);
  }
  band.geometry.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  band.geometry.setAttribute("color", new THREE.Float32BufferAttribute(bc, 3));
  band.geometry.computeVertexNormals();
  scene.add(band);

  const poleGeo = new THREE.CylinderGeometry(0.12, 0.14, 5.6, 8);
  const barGeo = new THREE.BoxGeometry(hw * 2 + 2.2, 0.18, 0.18);
  const steel = new THREE.MeshStandardMaterial({ color: 0x242a38, metalness: 0.6, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(poleGeo, steel);
    p.position.set(finish.x + finish.rx * side * (hw + 0.8), 2.8, finish.z + finish.rz * side * (hw + 0.8));
    scene.add(p);
  }
  const bar = new THREE.Mesh(barGeo, steel);
  bar.position.set(finish.x, 5.45, finish.z);
  bar.rotation.y = Math.atan2(-finish.rz, finish.rx);
  scene.add(bar);
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a1218, emissive: 0x2a1218, emissiveIntensity: 0.05, roughness: 0.4 })
    );
    const lat = (i - 1) * 1.4;
    lamp.position.set(finish.x + finish.rx * lat, 5.15, finish.z + finish.rz * lat);
    scene.add(lamp);
    lamps.push(lamp);
  }
}

function makeYardKart(partial) {
  const p = partial || {};
  const x = p.x || 0;
  const z = p.z || 0;
  return {
    name: p.name || "YOU",
    color: p.color || "#3ef0ff",
    accent: p.accent || "#ffffff",
    player: !!p.player,
    ai: p.player ? null : { lookahead: 8, corner: 0.4, drift: 0, lane: 0, mul: 1 },
    human: false,
    x,
    z,
    yaw: p.yaw || 0,
    vx: 0,
    vz: 0,
    prevX: x,
    prevZ: z,
    // Roadster is ~3 m long vs the 2.35 m box kart; 1.2 let rivals sink into its nose and tail.
    radius: p.player ? 1.5 : 1.2,
    hop: 0,
    hopV: 0,
    pitch: 0,
    roll: 0,
    pitchRate: 0,
    rollRate: 0,
    yard: true,
    loopA: null,
    loopSign: 1,
    loopSpeed: 0,
    loopCd: 0,
    padCd: 0,
    air: false,
    drifting: false,
    driftCharge: 0,
    boost: 0,
    boostKind: 0,
    steer: 0,
    lon: 0,
    gas: 0,
    projIndex: 0,
    prevDist: 0,
    travel: 0,
    expected: 0,
    sectors: 0,
    lap: 0,
    finished: false,
    finishTime: 0,
    wrong: 0,
    speedMul: 1,
    turboCharges: p.turboCharges || 0,
    turboTier: 0,
    turboLeft: 0,
    turboDown: false,
    driftHold: 0,
    driftBoostLeft: 0,
    driftBoostHold: 0,
    stuntScore: 0,
    bulk: 1,
    wallBlock: false,
    cabSeed: p.cabSeed || 0,
  };
}

function yardFloorTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#243044";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(140, 210, 230, 0.22)";
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    const p = (i / 16) * 512;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.moveTo(0, p);
    g.lineTo(512, p);
    g.stroke();
  }
  const band = 512 * (11 / 128);
  g.fillStyle = "#31445c";
  g.fillRect(0, 256 - band / 2, 512, band);
  g.strokeStyle = "rgba(198, 255, 74, 0.9)";
  g.lineWidth = 4;
  g.setLineDash([16, 12]);
  g.beginPath();
  g.moveTo(0, 256);
  g.lineTo(512, 256);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "rgba(126, 246, 255, 0.9)";
  for (let i = 2; i < 15; i++) {
    const x = (i / 16) * 512;
    g.beginPath();
    g.moveTo(x - 14, 256 - 16);
    g.lineTo(x + 10, 256);
    g.lineTo(x - 14, 256 + 16);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildYard() {
  const props = stuntProps();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(props.halfX * 2, props.halfZ * 2),
    litMat({ map: yardFloorTexture(), roughness: 0.72, metalness: 0.04, emissive: 0x162033, emissiveIntensity: 0.45 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wallMat = litMat({ color: 0x2a3548, roughness: 0.75, metalness: 0.08, emissive: 0x121820, emissiveIntensity: 0.2 });
  const wallH = 4.2;
  const walls = [
    [0, wallH * 0.5, props.halfZ, props.halfX * 2, wallH, 1.2],
    [0, wallH * 0.5, -props.halfZ, props.halfX * 2, wallH, 1.2],
    [props.halfX, wallH * 0.5, 0, 1.2, wallH, props.halfZ * 2],
    [-props.halfX, wallH * 0.5, 0, 1.2, wallH, props.halfZ * 2],
  ];
  for (const [x, y, z, w, h, d] of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  }
  const rampMat = litMat({ color: 0x6a4030, roughness: 0.48, metalness: 0.08, emissive: 0xff6a2a, emissiveIntensity: 0.42 });
  const lipMat = litMat({ color: 0xffd27a, emissive: 0xffb15a, emissiveIntensity: 0.8, roughness: 0.4 });
  for (const ramp of props.ramps) addRampMesh(ramp, rampMat, lipMat);
  addPipeMesh(props.pipe);
  addLoopMesh(props.loop);
  addPads(props.pads || []);
  const steel = new THREE.MeshStandardMaterial({ color: 0x242a38, metalness: 0.6, roughness: 0.35 });
  const mark = props.marker || { x: props.spawn.x, z: props.spawn.z - 16 };
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a1218, emissive: 0x2a1218, emissiveIntensity: 0.05, roughness: 0.4 })
    );
    lamp.position.set(mark.x + (i - 1) * 1.6, 6.2, mark.z);
    scene.add(lamp);
    lamps.push(lamp);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6.4, 6), steel);
  pole.position.set(mark.x, 3.2, mark.z);
  scene.add(pole);
  for (const spot of props.buildings || []) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(spot.w, spot.h, spot.d),
      litMat({ color: 0x243044, emissive: 0x3a2860, emissiveIntensity: 0.45 })
    );
    box.position.set(spot.x, spot.h * 0.5, spot.z);
    scene.add(box);
  }
}

function addRampMesh(ramp, material, lipMat) {
  const y0 = ramp.dir < 0 ? ramp.tall : 0;
  const y1 = ramp.dir < 0 ? 0 : ramp.tall;
  const positions = [
    ramp.x0, y0, ramp.z0,
    ramp.x1, y1, ramp.z0,
    ramp.x1, y1, ramp.z1,
    ramp.x0, y0, ramp.z1,
  ];
  const indices = [0, 1, 2, 0, 2, 3];
  if (pushTriNormal(positions, 0, 1, 2) < 0) {
    indices[0] = 0;
    indices[1] = 2;
    indices[2] = 1;
    indices[3] = 0;
    indices[4] = 3;
    indices[5] = 2;
  }
  scene.add(meshFrom(positions, null, [0, 0, 1, 0, 1, 1, 0, 1], indices, material));
  const sideMat = litMat({ color: 0x4a2a22, emissive: 0xc44a18, emissiveIntensity: 0.28, roughness: 0.6, side: THREE.DoubleSide });
  for (const z of [ramp.z0, ramp.z1]) {
    const sidePos = [ramp.x0, y0, z, ramp.x1, y1, z, ramp.x1, 0, z, ramp.x0, 0, z];
    scene.add(meshFrom(sidePos, null, null, [0, 1, 2, 0, 2, 3], sideMat));
  }
  const backX = ramp.dir < 0 ? ramp.x0 : ramp.x1;
  const backPos = [backX, 0, ramp.z0, backX, ramp.tall, ramp.z0, backX, ramp.tall, ramp.z1, backX, 0, ramp.z1];
  const backIdx = ramp.dir < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  scene.add(meshFrom(backPos, null, null, backIdx, sideMat));
  const floorPos = [ramp.x0, 0.02, ramp.z0, ramp.x1, 0.02, ramp.z0, ramp.x1, 0.02, ramp.z1, ramp.x0, 0.02, ramp.z1];
  scene.add(meshFrom(floorPos, null, null, [0, 2, 1, 0, 3, 2], sideMat));
  const lipX = ramp.dir < 0 ? ramp.x0 : ramp.x1;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, Math.max(0.4, ramp.z1 - ramp.z0)), lipMat);
  lip.position.set(lipX, ramp.tall + 0.08, (ramp.z0 + ramp.z1) * 0.5);
  scene.add(lip);
}

function addPipeMesh(pipe) {
  const positions = [];
  const indices = [];
  const seg = 16;
  for (let i = 0; i <= seg; i++) {
    const dx = -pipe.r + (2 * pipe.r * i) / seg;
    const h = pipe.r - Math.sqrt(Math.max(0, pipe.r * pipe.r - dx * dx));
    positions.push(pipe.x + dx, h, pipe.z0, pipe.x + dx, h, pipe.z1);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const mat = litMat({ color: 0x3a5270, roughness: 0.46, metalness: 0.12, emissive: 0x1a3a58, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  scene.add(meshFrom(positions, null, null, indices, mat));
  const copeMat = litMat({ color: 0xff4fd8, emissive: 0xff4fd8, emissiveIntensity: 0.7, roughness: 0.4 });
  const length = Math.max(1, pipe.z1 - pipe.z0);
  for (const side of [-1, 1]) {
    const cope = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, length), copeMat);
    cope.position.set(pipe.x + side * pipe.r, pipe.r + 0.16, (pipe.z0 + pipe.z1) * 0.5);
    scene.add(cope);
  }
}

function addLoopMesh(loop) {
  const seg = 72;
  const roadMat = litMat({ color: 0xc5d4e4, roughness: 0.45, metalness: 0.04, emissive: 0x7aa4c4, emissiveIntensity: 0.85 });
  const railMat = litMat({ color: 0xff4fd8, emissive: 0xff4fd8, emissiveIntensity: 0.9, roughness: 0.32, side: THREE.DoubleSide });
  const stripeMat = litMat({ color: 0x7ef6ff, emissive: 0x7ef6ff, emissiveIntensity: 0.7, roughness: 0.28, side: THREE.DoubleSide });
  const road = [];
  const roadIdx = [];
  const stripe = [];
  const stripeIdx = [];
  const pushSpan = (arr, idx, radius, z0, z1) => {
    const base = arr.length / 3;
    for (let i = 0; i <= seg; i++) {
      const frame = loopFrame((i / seg) * Math.PI * 2, 1);
      const x = loop.x + frame.ox * radius;
      const y = loop.r + frame.oy * radius;
      arr.push(x, y, loop.z + z0, x, y, loop.z + z1);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  pushSpan(road, roadIdx, loop.r, -loop.halfW, loop.halfW);
  pushSpan(stripe, stripeIdx, loop.r - 0.04, -0.22, 0.22);
  const lip = [];
  const lipIdx = [];
  for (const side of [-1, 1]) {
    pushSpan(lip, lipIdx, loop.r - 0.02, side * loop.halfW - 0.28, side * loop.halfW);
  }
  scene.add(meshFrom(road, null, null, roadIdx, roadMat));
  scene.add(meshFrom(stripe, null, null, stripeIdx, stripeMat));
  scene.add(meshFrom(lip, null, null, lipIdx, railMat));
  const apronMat = litMat({ color: 0x4a5c74, roughness: 0.5, metalness: 0.06, emissive: 0x243848, emissiveIntensity: 0.4 });
  addApron(loop.x - loop.r - 16, loop.x - loop.r + 0.6, -loop.halfW, loop.halfW, apronMat);
  addApron(loop.x + loop.r - 0.6, loop.x + loop.r + 12, -loop.halfW, loop.halfW, apronMat);
}

function addApron(x0, x1, z0, z1, material) {
  const y = 0.05;
  const positions = [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];
  const indices = [0, 1, 2, 0, 2, 3];
  if (pushTriNormal(positions, 0, 1, 2) < 0) indices.splice(0, 6, 0, 2, 1, 0, 3, 2);
  scene.add(meshFrom(positions, null, null, indices, material));
}

function addPads(pads) {
  const mat = litMat({ color: 0xc6ff4a, emissive: 0xc6ff4a, emissiveIntensity: 0.9, roughness: 0.35, side: THREE.DoubleSide });
  for (const pad of pads) {
    const w = pad.x1 - pad.x0;
    const d = pad.z1 - pad.z0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((pad.x0 + pad.x1) * 0.5, 0.08, (pad.z0 + pad.z1) * 0.5);
    scene.add(mesh);
  }
}

function makeLabel(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.font = "700 40px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.fillStyle = color;
  g.fillText(text, 128, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 1.85;
  sprite.userData.name = text;
  return sprite;
}

function rewriteLabel(sprite, text, color) {
  const canvas = sprite.material.map.image;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = "700 40px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.fillStyle = color;
  g.fillText(text, 128, 46);
  sprite.material.map.needsUpdate = true;
  sprite.userData.name = text;
}

function buildKart(k) {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  const color = new THREE.Color(k.color);
  const accent = new THREE.Color(k.accent);
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.42,
    emissive: color,
    emissiveIntensity: 0.22,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.85,
    roughness: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.7, metalness: 0.2 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  bodyMat.userData.flashRole = "body";
  accentMat.userData.flashRole = "accent";
  dark.userData.flashRole = "dark";
  tireMat.userData.flashRole = "dark";
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    chassis.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.05, 0.28, 1.7), bodyMat, 0, 0.48, -0.05);
  add(new THREE.BoxGeometry(0.72, 0.16, 0.55), bodyMat, 0, 0.4, -1.05);
  add(new THREE.BoxGeometry(0.22, 0.14, 0.9), accentMat, -0.66, 0.46, -0.05);
  add(new THREE.BoxGeometry(0.22, 0.14, 0.9), accentMat, 0.66, 0.46, -0.05);
  add(new THREE.BoxGeometry(0.5, 0.28, 0.48), dark, 0, 0.68, 0.12);
  const helm = add(new THREE.SphereGeometry(0.2, 12, 10), bodyMat, 0, 0.96, 0.02);
  helm.scale.y = 0.9;
  const wing = add(new THREE.BoxGeometry(1.15, 0.06, 0.28), accentMat, 0, 0.86, 0.78);
  add(new THREE.BoxGeometry(0.05, 0.28, 0.05), dark, -0.42, 0.7, 0.78);
  add(new THREE.BoxGeometry(0.05, 0.28, 0.05), dark, 0.42, 0.7, 0.78);
  wing.position.y = 0.86;

  const spins = [];
  const steers = [];
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  const rimGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.26, 8);
  const places = [
    { x: -0.58, z: -0.72, front: true },
    { x: 0.58, z: -0.72, front: true },
    { x: -0.58, z: 0.68, front: false },
    { x: 0.58, z: 0.68, front: false },
  ];
  for (const p of places) {
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(rimGeo, accentMat);
    rim.rotation.z = Math.PI / 2;
    spin.add(tire);
    spin.add(rim);
    steer.add(spin);
    steer.position.set(p.x, 0.34, p.z);
    root.add(steer);
    spins.push(spin);
    if (p.front) steers.push(steer);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  root.add(shadow);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.045;
  root.add(glow);

  root.add(chassis);
  const label = makeLabel(k.name, k.color);
  label.visible = !k.player;
  root.add(label);
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 2.55, 28),
    new THREE.MeshBasicMaterial({ color: 0xf6ff2a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.07;
  aura.visible = false;
  root.add(aura);
  const mark = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 4), new THREE.MeshBasicMaterial({ color: 0x7ef6ff }));
  mark.rotation.x = Math.PI;
  mark.position.y = 1.45;
  mark.visible = !!k.player;
  root.add(mark);
  const flashMats = [];
  const seen = new Set();
  root.traverse((obj) => {
    const mat = obj.material;
    if (!mat || !mat.emissive || seen.has(mat)) return;
    seen.add(mat);
    flashMats.push({
      mat,
      role: mat.userData.flashRole || "body",
      color: mat.color.clone(),
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity,
    });
  });
  scene.add(root);
  const view = { root, chassis, spins, steers, bodyMat, flashMats, aura, label, mark, k };
  kartMeshes.push(view);
  if (k.player) {
    setKartBody(view, boxKartBounds(view).getSize(new THREE.Vector3()));
    loadRoadster(view);
  }
}

// Player body: roadster.glb (Y-up, nose +Z, 4.31 m). Box kart stays until it loads, and on failure.
// Scale comes from the box kart's own local bounds, so it matches a rival's footprint.
// Swap models here only: loader finds Wheel_FL/FR/RL/RR by name and scales from measured bounds.
const ROADSTER_PAINTS = {
  red: { main: "assets/models/roadsterII.glb", phone: "assets/models/roadsterII_phone.glb" },
  cyan: { main: "assets/models/roadsterII_cyan.glb", phone: "assets/models/roadsterII_cyan_phone.glb" },
};
let roadsterPaint = "red";
try { if (localStorage.getItem("rg2026.paint") === "cyan") roadsterPaint = "cyan"; } catch {}
const roadsterUrl = () => (LITE ? ROADSTER_PAINTS[roadsterPaint].phone : ROADSTER_PAINTS[roadsterPaint].main);
const ROADSTER_LEN_MUL = 1.2;
let roadsterGltf = null;
function boxKartBounds(view) {
  const box = new THREE.Box3();
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  view.root.updateMatrixWorld(true);
  inv.copy(view.root.matrixWorld).invert();
  const parts = [view.chassis, ...view.spins.map((s) => s.parent)];
  for (const part of parts) {
    part.traverse((obj) => {
      if (!obj.isMesh) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      m.multiplyMatrices(inv, obj.matrixWorld);
      box.union(obj.geometry.boundingBox.clone().applyMatrix4(m));
    });
  }
  return box;
}
function splitRoadsterWheels(car, view, scale) {
  const wheelMeshes = [];
  car.traverse((obj) => {
    if (obj.isMesh && /^(rims|tyres)/i.test(obj.name || "")) wheelMeshes.push(obj);
  });
  if (!wheelMeshes.length) return false;
  car.updateMatrixWorld(true);
  const carInv = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const clusters = new Map();
  for (const mesh of wheelMeshes) {
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(carInv, mesh.matrixWorld)
    );
    const pos = geo.attributes.position;
    const groups = new Map();
    for (let t = 0; t < pos.count; t += 3) {
      const cx = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2);
      const cz = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
      const key = (cx >= 0 ? "R" : "L") + (cz >= 0 ? "F" : "B");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const [key, tris] of groups) {
      const part = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) {
        const src = geo.attributes[name];
        const arr = new src.array.constructor(tris.length * 3 * src.itemSize);
        let o = 0;
        for (const t of tris) for (let v = 0; v < 3; v++) for (let c = 0; c < src.itemSize; c++) arr[o++] = src.array[(t + v) * src.itemSize + c];
        part.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
      }
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push({ geo: part, mesh });
    }
    mesh.parent.remove(mesh);
  }
  const spins = [];
  const steers = [];
  const built = new Map();
  for (const [key, parts] of clusters) {
    const hubBox = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); hubBox.union(p.geo.boundingBox); }
    const hub = hubBox.getCenter(new THREE.Vector3());
    const radius = (hubBox.max.y - hubBox.min.y) / 2;
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    steer.position.copy(hub);
    for (const p of parts) {
      p.geo.translate(-hub.x, -hub.y, -hub.z);
      const w = new THREE.Mesh(p.geo, p.mesh.material);
      w.castShadow = !LITE;
      w.receiveShadow = !LITE;
      spin.add(w);
    }
    // Car is turned PI, so its local +X roll is backwards to the kart's; radius differs from the box tyre.
    spin.userData.spinMul = -0.34 / Math.max(0.05, radius * scale);
    steer.add(spin);
    car.add(steer);
    built.set(key, steer);
    spins.push(spin);
    if (key[1] === "F") steers.push(steer);
  }
  // The GLB only carries one side's wheels: mirror any missing side.
  for (const key of [...built.keys()]) {
    const other = (key[0] === "R" ? "L" : "R") + key[1];
    if (built.has(other)) continue;
    const src = built.get(key);
    const steer = src.clone(true);
    steer.position.x = -src.position.x;
    steer.scale.x = -1;
    car.add(steer);
    built.set(other, steer);
    const spin = steer.children[0];
    spins.push(spin);
    if (key[1] === "F") steers.push(steer);
  }
  view.spins.length = 0;
  view.steers.length = 0;
  view.spins.push(...spins);
  view.steers.push(...steers);
  return true;
}
// The GLB wheels (Rims/Tyres) are one mesh each and only one side exists, so the
// player gets 4 cylinder wheels sized to those tyres, readable on the black road.
function buildRoadsterWheels(car, view, scale) {
  car.updateMatrixWorld(true);
  const carInv = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const tyreBox = new THREE.Box3();
  const drop = [];
  car.traverse((obj) => {
    if (!obj.isMesh || !/^(rims|tyres)/i.test(obj.name || "")) return;
    drop.push(obj);
    if (!/^tyres/i.test(obj.name)) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    tyreBox.union(obj.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(carInv, obj.matrixWorld)));
  });
  for (const m of drop) m.parent.remove(m);
  if (tyreBox.isEmpty()) tyreBox.set(new THREE.Vector3(0.655, 0, -1.7575), new THREE.Vector3(0.965, 0.72, 1.7475));
  const radius = (tyreBox.max.y - tyreBox.min.y) / 2;
  const outer = Math.max(Math.abs(tyreBox.min.x), Math.abs(tyreBox.max.x));
  const spanX = tyreBox.max.x - tyreBox.min.x;
  const tw = spanX > outer ? 0.31 : spanX;
  const xc = outer - tw / 2;
  const zc = Math.max(Math.abs(tyreBox.min.z), Math.abs(tyreBox.max.z)) - radius;
  const hubY = Math.max(0, tyreBox.min.y) + radius;
  const tyreMat = litMat({ color: 0x3a3c44, roughness: 0.85, metalness: 0.05 });
  const rimMat = litMat({ color: 0xd4d8e0, roughness: 0.3, metalness: 0.8, emissive: 0x2a2e36, emissiveIntensity: 0.6 });
  const tyreGeo = new THREE.CylinderGeometry(radius, radius, tw, 20);
  const rimGeo = new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, tw * 1.04, 14);
  const spokeGeo = new THREE.BoxGeometry(tw * 1.08, radius * 1.1, radius * 0.16);
  const spins = [];
  const steers = [];
  for (const sz of [1, -1]) {
    for (const sx of [-1, 1]) {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      for (const m of [tyre, rim, spoke]) {
        m.castShadow = !LITE;
        spin.add(m);
      }
      spin.userData.spinMul = -0.34 / Math.max(0.05, radius * scale);
      steer.position.set(sx * xc, hubY, sz * zc);
      steer.add(spin);
      car.add(steer);
      spins.push(spin);
      if (sz > 0) steers.push(steer);
    }
  }
  view.spins.length = 0;
  view.steers.length = 0;
  view.spins.push(...spins);
  view.steers.push(...steers);
  car.updateMatrixWorld(true);
  console.log("roadster wheels", spins.length, spins.map((s) => s.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2))));
  return true;
}
// v5 GLB: Wheel_FL/FR/RL/RR nodes, pivots at hub centres. Each goes in a steer pivot so spin (X) and steer (Y) don't fight.
function useNamedWheels(car, view, scale) {
  const names = ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"];
  const nodes = names.map((n) => car.getObjectByName(n));
  if (nodes.some((n) => !n)) return false;
  const spins = [];
  const steers = [];
  nodes.forEach((node, i) => {
    const parent = node.parent;
    const steer = new THREE.Group();
    steer.position.copy(node.position);
    parent.add(steer);
    node.position.set(0, 0, 0);
    steer.add(node);
    const box = new THREE.Box3();
    node.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox);
      o.castShadow = !LITE;
    });
    const radius = box.isEmpty() ? 0.37 : (box.max.y - box.min.y) / 2;
    // Car turned PI: local +X roll runs backwards to the kart's.
    node.userData.spinMul = -0.34 / Math.max(0.05, radius * scale);
    spins.push(node);
    // Front = +Z in the GLB (nose +Z), not the name: v5 had L/R names swapped.
    if (steer.position.z > 0) steers.push(steer);
  });
  view.spins.length = 0;
  view.steers.length = 0;
  view.spins.push(...spins);
  view.steers.push(...steers);
  console.log("roadster wheels named", spins.length, "steer", steers.length);
  return true;
}
// Paint carries its colour in vertex colours; drop them while flashing so the flash shows true, restore after.
function setFlashVC(rec, on) {
  if (!rec.vertexColors || rec.mat.vertexColors === on) return;
  rec.mat.vertexColors = on;
  rec.mat.needsUpdate = true;
}
function loadRoadster(view) {
  if (!roadsterGltf) roadsterGltf = new GLTFLoader().loadAsync(roadsterUrl());
  const want = roadsterPaint;
  roadsterGltf.then((gltf) => {
    if (!kartMeshes.includes(view) || want !== roadsterPaint) return;
    // Paint switch: drop the old car and its flash records before adding the new one.
    if (view.roadsterCar) {
      const old = view.roadsterCar;
      view.chassis.remove(old);
      const oldMats = new Set();
      old.traverse((o) => { if (o.material) oldMats.add(o.material); });
      for (let i = view.flashMats.length - 1; i >= 0; i--) if (oldMats.has(view.flashMats[i].mat)) view.flashMats.splice(i, 1);
      view.roadsterCar = null;
    }
    // Size from a real rival as drawn: its local kart bounds times its root scale, over ours.
    const rival = kartMeshes.find((v) => !v.k.player && v.chassis.children.length);
    const ref = rival || view;
    const kartSize = boxKartBounds(ref).getSize(new THREE.Vector3()).multiplyScalar((ref.root.scale.x || 1) / (view.root.scale.x || 1));
    const car = gltf.scene.clone(true);
    const carSize = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
    // At least ROADSTER_LEN_MUL x rival length and full rival width, so it never reads smaller.
    const scale = Math.max((kartSize.z * ROADSTER_LEN_MUL) / Math.max(0.1, carSize.z), kartSize.x / Math.max(0.1, carSize.x));
    car.rotation.y = Math.PI;
    car.scale.setScalar(scale);
    car.traverse((obj) => {
      if (!obj.isMesh) return;
      const tm = obj.material;
      if (tm && tm.emissive && /thruster|nozzleinner|portinner/i.test(tm.name || obj.name || "")) {
        tm.emissive.setHex(0x3ad8ff);
        tm.emissiveIntensity = 0.9;
      }
      obj.castShadow = !LITE;
      obj.receiveShadow = !LITE;
    });
    for (const m of view.chassis.children) m.visible = false;
    for (const s of view.spins) if (s.parent) s.parent.visible = false;
    view.chassis.add(car);
    view.roadsterCar = car;
    let wheels = false;
    try { wheels = useNamedWheels(car, view, scale) || buildRoadsterWheels(car, view, scale); } catch (err) { console.warn("roadster wheels stay static", err); }
    view.roadster = { scale, kartSize, carSize, wheels };
    setKartBody(view, carSize.clone().multiplyScalar(scale));
    console.info("stunt body", view.k.halfLen, view.k.halfH, view.k.bodyRadius);
    console.info("roadster scale", scale.toFixed(3), "rival", rival ? rival.k.name : "self", kartSize.toArray().map((v) => v.toFixed(2)).join("x"), "car", carSize.clone().multiplyScalar(scale).toArray().map((v) => v.toFixed(2)).join("x"), "wheels", wheels);
    car.traverse((obj) => {
      const mat = obj.material;
      if (!mat || !mat.emissive || !/paint/i.test(mat.name || "")) return;
      if (view.flashMats.some((f) => f.mat === mat)) return;
      view.flashMats.push({ mat, role: "body", color: mat.color.clone(), emissive: mat.emissive.clone(), emissiveIntensity: mat.emissiveIntensity, vertexColors: !!mat.vertexColors });
    });
  }).catch((err) => console.warn("roadster.glb failed, keeping box kart", err));
}

// NES 2C02 colors (ROM Detectives YPbPr set) for the bytes these games actually load.
// Zelda 1 hurt: sprite palettes 0-3, one per frame. Link is $29 $27 $07.
// SMB star: overworld GroundPaletteData sprite rows, held two frames each.
function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const LINK_HURT = [
  { body: 0xb8f818, accent: 0xfca044, dark: 0x881400 },
  { body: 0x0058f8, accent: 0x3cbcfc, dark: 0xb8b8f8 },
  { body: 0xf83800, accent: 0xfca044, dark: 0xfcfcfc },
  { body: 0x00e8d8, accent: 0x58f898, dark: 0x008888 },
];
const MARIO_STAR = [
  { body: 0xf83800, accent: 0xfca044, dark: 0xac7c00 },
  { body: 0x00a800, accent: 0xfcfcfc, dark: 0xfca044 },
  { body: 0xf83800, accent: 0xfcfcfc, dark: 0xfca044 },
  { body: 0xf8a4c0, accent: 0xe45c10, dark: 0x000000 },
];

const PCOUNT = LITE ? 140 : 320;
const pPos = new Float32Array(PCOUNT * 3);
const pCol = new Float32Array(PCOUNT * 3);
const pLife = new Float32Array(PCOUNT);
const pVel = new Float32Array(PCOUNT * 3);
const pGeom = new THREE.BufferGeometry();
pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeom.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
// Soft round puffs: per-particle life fraction drives grow + fade (no flat squares).
const pMax = new Float32Array(PCOUNT).fill(1);
const pFrac = new Float32Array(PCOUNT);
pGeom.setAttribute("aFrac", new THREE.BufferAttribute(pFrac, 1));
const points = new THREE.Points(
  pGeom,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: { uScale: { value: 360 } },
    vertexShader: `attribute float aFrac; varying vec3 vCol; varying float vA;
      uniform float uScale;
      void main() {
        vCol = color; vA = aFrac;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uScale * (0.32 + (1.0 - aFrac) * 0.7) / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, d) * vA * 0.55;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol, a);
      }`,
  })
);
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;

function burst(x, y, z, vx, vy, vz, life, r, g, b) {
  const i = pCursor;
  pCursor = (pCursor + 1) % PCOUNT;
  pLife[i] = life;
  pMax[i] = life;
  pPos[i * 3] = x;
  pPos[i * 3 + 1] = y;
  pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx;
  pVel[i * 3 + 1] = vy;
  pVel[i * 3 + 2] = vz;
  pCol[i * 3] = r;
  pCol[i * 3 + 1] = g;
  pCol[i * 3 + 2] = b;
}

function stepParticles(dt) {
  for (let i = 0; i < PCOUNT; i++) {
    if (pLife[i] <= 0) {
      pPos[i * 3 + 1] = -8;
      pFrac[i] = 0;
      continue;
    }
    pLife[i] -= dt;
    pFrac[i] = Math.max(0, pLife[i] / pMax[i]);
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pVel[i * 3 + 1] += dt * 0.8;
  }
  pGeom.attributes.position.needsUpdate = true;
  pGeom.attributes.color.needsUpdate = true;
  pGeom.attributes.aFrac.needsUpdate = true;
}

const rainCount = REDUCE || LITE ? 0 : 170;
const rainPos = new Float32Array(Math.max(1, rainCount) * 3);
const rainVel = new Float32Array(Math.max(1, rainCount));
if (rainCount) {
  const rnd = mulberry(11);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (rnd() - 0.5) * 50;
    rainPos[i * 3 + 1] = rnd() * 24;
    rainPos[i * 3 + 2] = (rnd() - 0.5) * 50;
    rainVel[i] = 10 + rnd() * 8;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(
    rg,
    new THREE.PointsMaterial({ color: 0xb9d7ff, size: 0.06, transparent: true, opacity: 0.35, depthWrite: false })
  );
  scene.add(rain);
  rain.userData.geom = rg;
  scene.userData.rain = rain;
}

function stepRain() {
  const rain = scene.userData.rain;
  if (!rain) return;
  const geom = rain.userData.geom;
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3 + 1] -= rainVel[i] * 0.016;
    if (rainPos[i * 3 + 1] < 0) rainPos[i * 3 + 1] = 18 + Math.random() * 8;
  }
  geom.attributes.position.needsUpdate = true;
  rain.position.set(camera.position.x, 0, camera.position.z);
}

const _namePos = new THREE.Vector3();

const driftTrail = { hist: [], bits: null };

const _trailSide = new THREE.Vector3();
const _trailUp = new THREE.Vector3();
const _trailFace = new THREE.Vector3();
const _trailBasis = new THREE.Matrix4();
const _kartRight = new THREE.Vector3();
const _kartUp = new THREE.Vector3();
const _kartBack = new THREE.Vector3();
const _kartBasis = new THREE.Matrix4();

function paintDriftTrail(player, dt, active) {
  if (!player) return;
  if (!driftTrail.bits) {
    driftTrail.bits = [];
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe8fff8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.95), mat);
      mesh.visible = false;
      scene.add(mesh);
      driftTrail.bits.push(mesh);
    }
  }
  const boost = active && ((player.driftBoostLeft || 0) > 0 || player.blaze);
  const slide = active && !!player.drifting;
  const spd = Math.hypot(player.vx || 0, player.vz || 0);
  const gap = Math.min(2.4, Math.max(0.7, spd * 0.038));
  if (boost || slide) {
    const last = driftTrail.hist[driftTrail.hist.length - 1];
    if (!last || Math.hypot(player.x - last.x, player.z - last.z) > gap) {
      driftTrail.hist.push({ x: player.x, z: player.z, yaw: player.yaw, life: boost ? 0.7 : 0.4, boost: !!boost });
    }
  }
  for (const h of driftTrail.hist) h.life -= dt * (active ? 1 : 3);
  driftTrail.hist = driftTrail.hist.filter((h) => h.life > 0).slice(-driftTrail.bits.length);
  for (let i = 0; i < driftTrail.bits.length; i++) {
    const h = driftTrail.hist[i];
    const mesh = driftTrail.bits[i];
    if (!h) {
      mesh.visible = false;
      continue;
    }
    const nose = forwardFromYaw(h.yaw);
    const right = rightFromForward(nose);
    const flank = i % 2 === 0 ? 0.46 : -0.46;
    const px = h.x - nose.x * 1.35 + right.x * flank;
    const pz = h.z - nose.z * 1.35 + right.z * flank;
    const cdx = camera.position.x - px;
    const cdz = camera.position.z - pz;
    if (cdx * cdx + cdz * cdz < 10) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    const face = trailStripe(h.yaw);
    _trailSide.set(face.sideX, face.sideY, face.sideZ);
    _trailUp.set(face.upX, face.upY, face.upZ);
    _trailFace.set(face.faceX, face.faceY, face.faceZ);
    _trailBasis.makeBasis(_trailSide, _trailUp, _trailFace);
    mesh.quaternion.setFromRotationMatrix(_trailBasis);
    mesh.position.set(px, (player.hop || 0) + 0.55, pz);
    mesh.matrixAutoUpdate = true;
    const fade = Math.max(0, h.life / (h.boost ? 0.7 : 0.4));
    mesh.material.opacity = (h.boost ? 0.34 : 0.16) * fade;
    mesh.material.color.setHex(player.blaze ? 0xffb15a : 0xe8fff8);
    mesh.scale.set(1, 0.85 + fade * 0.15, 1);
  }
}

function poseKart(root, k) {
  if (k.loopA != null && (k.faceX || k.faceY)) {
    const rx = k.faceY * (k.upZ || 0) - (k.faceZ || 0) * k.upY;
    const ry = (k.faceZ || 0) * k.upX - k.faceX * (k.upZ || 0);
    const rz = k.faceX * k.upY - k.faceY * k.upX;
    _kartRight.set(rx, ry, rz).normalize();
    _kartUp.set(k.upX, k.upY, k.upZ || 0).normalize();
    _kartBack.set(-k.faceX, -k.faceY, -(k.faceZ || 0)).normalize();
    _kartBasis.makeBasis(_kartRight, _kartUp, _kartBack);
    root.quaternion.setFromRotationMatrix(_kartBasis);
    return;
  }
  root.rotation.set(0, k.yaw, 0);
  if (!k.pitch && !k.roll) return;
  // Flip and roll about the middle of the car body (half its drawn height), not the wheels.
  const pivot = (k.halfH || 0.57) * (root.scale.y || 1);
  root.position.y += pivot;
  root.rotateX(k.pitch || 0);
  root.rotateZ(-(k.roll || 0));
  root.translateY(-pivot);
}

let launchSeen = 0;
let turboFlameTick = 0;
// Stunt body from what is drawn: half length, half height, and a collision radius (never under the box kart's 1.2).
function setKartBody(view, size) {
  const k = view.k;
  k.halfLen = +(size.z / 2).toFixed(3);
  k.halfWid = +(size.x / 2).toFixed(3); // NL-90 kart-to-kart circles
  k.halfH = +(size.y / 2).toFixed(3);
  k.bodyRadius = Math.max(1.2, +(k.halfLen * 0.89).toFixed(2));
  if (k.yard && !k.cab) k.radius = k.bodyRadius;
}
function syncKart(view, dt) {
  const k = view.k;
  view.root.position.set(k.x, k.hop || 0, k.z);
  poseKart(view.root, k);
  view.root.scale.setScalar(k.bulk || 1);
  if (view.label) {
    _namePos.set(k.x, k.hop + 1.85, k.z);
    const dist = camera.position.distanceTo(_namePos);
    _namePos.project(camera);
    view.label.visible = rivalLabelVisible(k, _namePos.x, _namePos.y, _namePos.z, dist);
  }
  view.chassis.rotation.z = THREE.MathUtils.damp(view.chassis.rotation.z, -k.steer * 0.1, 8, dt);
  view.chassis.rotation.x = THREE.MathUtils.damp(view.chassis.rotation.x, THREE.MathUtils.clamp(-k.lon * 0.005, -0.1, 0.12), 6, dt);
  const spin = (k.lon * dt) / 0.34;
  for (const s of view.spins) s.rotation.x -= spin * (s.userData.spinMul || 1);
  for (const s of view.steers) s.rotation.y = -k.steer * 0.42;
  const boost = k.boost > 0 ? 0.95 : 0.22;
  const tier = k.turboTier || 0;
  const cycleSeconds = k.drifting ? k.driftHold || 0 : (k.driftBoostLeft || 0) > 0 ? k.driftBoostHold || 0 : 0;
  const driftHz = driftCycleHz(cycleSeconds);
  if (driftHz > 0) {
    view.driftPhase = (view.driftPhase || 0) + driftHz * dt;
    const wave = 0.5 - 0.5 * Math.cos(view.driftPhase * Math.PI * 2);
    const hex = lerpHex(0xf6ff2a, 0x7cff1a, wave);
    for (const rec of view.flashMats) {
      if (!k.player) {
        rec.mat.color.copy(rec.color);
        rec.mat.emissive.setHex(hex);
        rec.mat.emissiveIntensity = 0.7;
        continue;
      }
      setFlashVC(rec, false);
      rec.mat.color.setHex(hex);
      rec.mat.emissive.setHex(hex);
      rec.mat.emissiveIntensity = 2.1;
      rec.mat.opacity = 1;
      rec.mat.transparent = false;
      rec.mat.depthWrite = true;
    }
    if (view.aura) {
      view.aura.visible = true;
      view.aura.material.color.setHex(hex);
      view.aura.material.opacity = 0.45 + wave * 0.4;
    }
  } else if (tier > 0) {
    // NES runs at 60Hz. Zelda 1 steps Link's sprite palette every frame
    // (iframe counter, low 2 bits). SMB holds each star palette for 2 frames.
    const frame = Math.floor(performance.now() / (1000 / 60));
    const step = tier >= 2 ? Math.floor(frame / 2) % 4 : frame % 4;
    const palette = tier >= 2 ? MARIO_STAR[step] : LINK_HURT[step];
    for (const rec of view.flashMats) {
      const hex = palette[rec.role] ?? palette.body;
      // Rivals keep their own body colour (and so match their name label); the star palette only glows.
      if (!k.player) {
        rec.mat.color.copy(rec.color);
        rec.mat.emissive.setHex(hex);
        rec.mat.emissiveIntensity = 0.55;
        continue;
      }
      setFlashVC(rec, false);
      rec.mat.color.setHex(hex);
      rec.mat.emissive.setHex(hex);
      rec.mat.emissiveIntensity = 1;
      rec.mat.opacity = 1;
      rec.mat.transparent = false;
      rec.mat.depthWrite = true;
    }
    if (view.aura) view.aura.visible = false;
  } else {
    for (const rec of view.flashMats) {
      setFlashVC(rec, true);
      rec.mat.color.copy(rec.color);
      rec.mat.emissive.copy(rec.emissive);
      rec.mat.emissiveIntensity = rec.emissiveIntensity;
      rec.mat.opacity = 1;
      rec.mat.transparent = false;
      rec.mat.depthWrite = true;
    }
    if (view.aura) view.aura.visible = false;
    view.bodyMat.emissiveIntensity = k.drifting ? 0.55 : boost;
  }
  if ((k.hitFlash || 0) > 0) {
    for (const rec of view.flashMats) {
      setFlashVC(rec, false);
      rec.mat.color.setHex(0xffffff);
      rec.mat.emissive.setHex(0xffffff);
      rec.mat.emissiveIntensity = 2.6;
    }
  }
  if (!k.drifting && k.boost <= 0 && tier <= 0) return;
  const fwd = forwardFromYaw(k.yaw);
  const right = rightFromForward(fwd);
  for (const side of [-1, 1]) {
    const x = k.x - fwd.x * 0.7 + right.x * 0.55 * side;
    const z = k.z - fwd.z * 0.7 + right.z * 0.55 * side;
    if (k.drifting) burst(x, 0.25, z, -fwd.x * 0.4, 1.1, -fwd.z * 0.4, 0.6, 0.84, 0.85, 0.88);
    if (k.boost > 0) burst(x, 0.4, z, -fwd.x * 2, 0.6, -fwd.z * 2, 0.3, 1, 0.7, 0.3);
    // NL-89: turbo exhaust flame (half rate on phones).
    if (tier > 0 && (!LITE || ((++turboFlameTick) & 1))) burst(x, 0.38, z, -fwd.x * (3 + tier * 2), 0.4, -fwd.z * (3 + tier * 2), 0.22 + tier * 0.08, 0.4, 0.75, 1);
  }
}

function updateCamera(dt, player, inputFrame) {
  if (!player) return;
  const touch = document.documentElement.classList.contains("input-touch");
  if (!userLooked && mode === "title" && !REDUCE) {
    cam.targetYaw = Math.sin(performance.now() * 0.00035) * 0.35;
  }
  if (inputFrame.lookDX || inputFrame.lookDY) userLooked = true;
  cam.targetYaw = wrapAngle(cam.targetYaw - inputFrame.lookDX * 0.0042);
  cam.targetPitch = THREE.MathUtils.clamp(cam.targetPitch - inputFrame.lookDY * 0.0032, 0.2, 1.05);
  if (inputFrame.wheel) cam.targetDist = THREE.MathUtils.clamp(cam.targetDist + inputFrame.wheel * 0.45, 4.4, 11);
  if (inputFrame.recenter) {
    cam.targetYaw = 0;
    cam.targetPitch = 0.3;
    cam.targetDist = touch ? 5.3 : 6.1;
    userLooked = true;
  }
  const glide = 1 - Math.exp(-8 * dt);
  cam.yaw = wrapAngle(cam.yaw + wrapAngle(cam.targetYaw - cam.yaw) * glide);
  cam.pitch += (cam.targetPitch - cam.pitch) * glide;
  cam.dist += (cam.targetDist - cam.dist) * glide;
  const wantSlip = player.drifting ? player.slip || 0 : 0;
  cam.slip = (cam.slip || 0) + (wantSlip - (cam.slip || 0)) * (1 - Math.exp(-8 * dt));
  const orbit = player.yaw + cam.yaw - cam.slip * 0.7;
  const back = forwardFromYaw(orbit);
  const onLoop = player.loopA != null;
  const airShow = player.yard && player.air && (player.hop || 0) > 2.5;
  const extra = onLoop ? 0 : airShow ? 3 : 0;
  const horiz = Math.cos(cam.pitch) * (cam.dist + extra);
  const vert = Math.sin(cam.pitch) * (cam.dist + extra);
  const lift = player.hop || 0;
  const desired = new THREE.Vector3(player.x - back.x * horiz, 0.7 + vert + lift, player.z - back.z * horiz);
  const pace = Math.min(1, Math.abs(player.lon || 0) / 50);
  const lookAhead = (touch ? 8 : 12) + pace * 4;
  const nose = forwardFromYaw(player.yaw);
  const look = new THREE.Vector3(
    player.x + nose.x * lookAhead,
    0.55 + lift + (onLoop ? (player.faceY || 0) * 5 : 0),
    player.z + nose.z * lookAhead
  );
  if (onLoop) {
    const hoop = stuntProps().loop;
    desired.set(player.x, (player.hop || 0) + 4.2, hoop.z + hoop.halfW + 7);
    look.set(player.x, (player.hop || 0) + 0.5, player.z);
  }
  const origin = new THREE.Vector3(player.x, 1.15 + lift, player.z);
  const delta = desired.clone().sub(origin);
  const dist = delta.length();
  if (dist > 0.2 && occluders.length) {
    raycaster.set(origin, delta.normalize());
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(occluders, false);
    if (hits.length && hits[0].distance > 1.2 && hits[0].distance < dist - 0.4) {
      const pull = Math.max(1.8, hits[0].distance - 0.45);
      desired.copy(origin).add(delta.multiplyScalar(pull));
    }
  }
  if (!camera.userData.ready) {
    camera.position.copy(desired);
    camera.userData.ready = true;
  } else {
    camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
  }
  camera.lookAt(look);
  // Stunt roll: tilt the view a little with the car so a barrel roll reads, never past about 9 degrees.
  if (player.yard && player.roll) camera.rotateZ(-Math.max(-0.16, Math.min(0.16, Math.sin(player.roll) * 0.16)));
  const aspect = camera.aspect;
  const base = aspect < 0.85 ? 80 : aspect < 1.15 ? 74 : 66;
  // NL-89: turbo tier widens the view so 2x / 3x reads.
  const turboKick = (player.turboTier || 0) > 0 ? 4 + 3 * player.turboTier : 0;
  const kick = Math.max(turboKick, (player.driftBoostLeft || 0) > 0 ? 5 : player.boost > 0 ? 3 : 0);
  const speedKick = THREE.MathUtils.clamp(Math.max(0, player.lon) * 0.2, 0, turboKick ? 20 : 14);
  const nextFov = base + kick + speedKick;
  if (Math.abs(camera.fov - nextFov) > 0.2) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
}

function formatTime(s) {
  if (!s || s < 0) return "--";
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(2).padStart(5, "0")}`;
}

function ordinal(n) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

function bestMs() {
  try {
    return Number(localStorage.getItem("rg2026-best-ms") || localStorage.getItem("nightloop-best-ms") || 0);
  } catch {
    return 0;
  }
}

function saveBest(ms) {
  try {
    const prev = bestMs();
    if (!prev || ms < prev) localStorage.setItem("rg2026-best-ms", String(ms));
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function showMenu(note) {
  mode = "title";
  overlay.hidden = false;
  menu.hidden = false;
  raceCard.hidden = true;
  menuMain.hidden = false;
  menuOptions.hidden = true;
  menuWorld.hidden = true;
  menuEdit.hidden = true;
  menuLobby.hidden = true;
  if (roomCodeEl) roomCodeEl.hidden = true;
  menuStatus.textContent = note || "";
  paintCourse();
  syncCursor();
  focusMenu(document.getElementById("btn-1p"));
}

function showLobby() {
  overlay.hidden = false;
  menu.hidden = false;
  raceCard.hidden = true;
  menuMain.hidden = true;
  menuOptions.hidden = true;
  menuWorld.hidden = true;
  menuEdit.hidden = true;
  menuLobby.hidden = false;
  renderLobby();
  syncCursor();
  focusMenu(lobbyStart.hidden ? document.getElementById("lobby-cancel") : lobbyStart);
}

function renderLobby() {
  const list = net.players;
  lobbyList.innerHTML = list.length
    ? list.map((p) => `<li><b>P${p.slot + 1}</b> ${escapeHtml(p.name)}</li>`).join("")
    : "";
  const host = net.role === "host";
  lobbyStart.hidden = !(host && list.length >= 2);
  if (roomCodeEl) {
    roomCodeEl.hidden = !net.code;
    roomCodeEl.textContent = net.code || "";
  }
  menuStatus.textContent = "";
}

function showOverlay(kind) {
  overlay.hidden = false;
  menu.hidden = true;
  raceCard.hidden = false;
  secondaryBtn.hidden = kind === "title";
  cardExtra.innerHTML = "";
  if (kind === "pause") {
    cardTitle.textContent = "PAUSED";
    primaryBtn.textContent = "Resume";
    secondaryBtn.textContent = "Restart";
    secondaryBtn.hidden = false;
    document.getElementById("pause-options").hidden = false;
  } else if (kind === "finish") {
    const order = standings(karts);
    const place = order.findIndex((s) => s.k.player) + 1;
    cardTitle.textContent = `${place}${ordinal(place)}`;
    primaryBtn.textContent = "Race again";
    secondaryBtn.hidden = true;
    document.getElementById("pause-options").hidden = true;
    cardExtra.innerHTML = order
      .map((s, i) => {
        const t = s.k.finished ? formatTime(s.k.finishTime) : "racing";
        return `<li><i style="background:${s.k.color}"></i><b>${i + 1}</b> ${escapeHtml(s.k.name)} <em>${t}</em></li>`;
      })
      .join("");
  }
  syncCursor();
  focusMenu(primaryBtn);
}

function hideOverlay() {
  overlay.hidden = true;
  syncCursor();
}

function syncCursor() {
  document.documentElement.classList.toggle("menu-open", !overlay.hidden);
}

function menuItems() {
  if (overlay.hidden) return [];
  const items = [];
  if (!menu.hidden) {
    if (nameInput) items.push(nameInput);
    const panel = !menuOptions.hidden
      ? menuOptions
      : !menuWorld.hidden
        ? menuWorld
        : !menuEdit.hidden
          ? menuEdit
          : !menuLobby.hidden
            ? menuLobby
            : menuMain;
    items.push(...panel.querySelectorAll("button, input"));
  } else if (!raceCard.hidden) {
    items.push(...raceCard.querySelectorAll("button, input"));
  }
  return items.filter((el) => {
    if (el.hidden || el.disabled) return false;
    if (el.closest("[hidden]")) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

function focusMenu(prefer) {
  const items = menuItems();
  if (!items.length) return;
  const pick = prefer && items.includes(prefer) ? prefer : items.find((el) => el.tagName === "BUTTON") || items[0];
  pick.focus();
}

function moveMenu(dir) {
  const items = menuItems();
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  const next = items[(Math.max(0, at) + dir + items.length) % items.length];
  next.focus();
  audio.menuMove();
}

let padMenuY = 0;
let padMenuX = 0;
let padMenuPress = false;

function menuPad() {
  if (overlay.hidden) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let y = 0;
  let x = 0;
  let press = false;
  for (const pad of pads) {
    if (!pad) continue;
    const axisY = pad.axes[1] || 0;
    const axisX = pad.axes[0] || 0;
    if (axisY < -0.55 || (pad.buttons[12] && pad.buttons[12].pressed)) y = -1;
    else if (axisY > 0.55 || (pad.buttons[13] && pad.buttons[13].pressed)) y = 1;
    if (axisX < -0.55 || (pad.buttons[14] && pad.buttons[14].pressed)) x = -1;
    else if (axisX > 0.55 || (pad.buttons[15] && pad.buttons[15].pressed)) x = 1;
    if (pad.buttons[0] && pad.buttons[0].pressed) press = true;
  }
  if (y !== 0 && padMenuY === 0) moveMenu(y);
  padMenuY = y;
  const el = document.activeElement;
  if (x !== 0 && padMenuX === 0 && el && el.type === "range") {
    const step = Number(el.step) || 1;
    const min = Number(el.min);
    const max = Number(el.max);
    el.value = String(Math.max(min, Math.min(max, Number(el.value) + x * step)));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (x !== 0 && padMenuX === 0 && el && el.type === "checkbox") {
    el.checked = !el.checked;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  padMenuX = x;
  if (press && !padMenuPress && el && menuItems().includes(el) && el.tagName === "BUTTON") { audio.menuConfirm(); el.click(); }
  padMenuPress = press;
}

window.addEventListener("keydown", (e) => {
  if (overlay.hidden) return;
  const el = document.activeElement;
  const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.type !== "range" && el.type !== "checkbox";
  if (e.code === "ArrowDown" || e.code === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    moveMenu(e.code === "ArrowDown" ? 1 : -1);
    return;
  }
  if (typing) return;
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
    if (el && el.type === "checkbox") {
      e.preventDefault();
      e.stopPropagation();
      el.checked = !el.checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el && el.type === "range") {
      e.stopPropagation();
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}, true);

function begin() {
  audio.ensure();
  armTurboVideo();
  hideOverlay();
  mode = "countdown";
  countdown = 3;
  countShown = 4;
  raceTime = 0;
  shownLap = 0;
  finishedPing = false;
}

function markLocal() {
  for (const k of karts) k.player = !!(k.human && k.slot === localSlot);
  for (const view of kartMeshes) {
    if (view.mark) view.mark.visible = !!view.k.player;
    if (view.label && view.label.userData.name !== view.k.name) rewriteLabel(view.label, view.k.name, view.k.color);
  }
}

function applyRoster(list) {
  roster = list.map((p) => ({ slot: p.slot, name: p.name }));
  const base = makeField(track);
  for (let i = 0; i < karts.length; i++) {
    karts[i].name = base[i].name;
    karts[i].ai = base[i].ai;
    karts[i].human = false;
    karts[i].slot = -1;
    karts[i].player = false;
  }
  for (const p of roster) {
    const idx = SLOT_KART[p.slot];
    if (idx == null || !karts[idx]) continue;
    karts[idx].name = p.name;
    karts[idx].human = true;
    karts[idx].slot = p.slot;
    karts[idx].ai = null;
  }
  markLocal();
}

function releaseSlot(slot) {
  const idx = SLOT_KART[slot];
  const k = karts[idx];
  if (!k || k.slot !== slot) return;
  const base = makeField(track)[idx];
  k.human = false;
  k.player = false;
  k.slot = -1;
  k.ai = base.ai;
  k.name = base.name;
  markLocal();
}

function resetRace() {
  raceEpoch += 1;
  if (bootedCourse === "stunt") {
    while (karts.length > 1) {
      const extra = karts.pop();
      const view = kartMeshes.find((m) => m.k === extra);
      if (view) {
        scene.remove(view.root);
        kartMeshes.splice(kartMeshes.indexOf(view), 1);
      }
    }
    const seated = roster.find((p) => p.slot === localSlot) || roster[0];
    const home = stuntProps().spawn;
    Object.assign(karts[0], makeYardKart({ player: true, name: (seated && seated.name) || karts[0].name || "YOU", x: home.x, z: home.z, yaw: home.yaw }));
    karts[0].human = true;
    karts[0].slot = localSlot;
    karts[0].ai = null;
    if (kartMeshes[0]) kartMeshes[0].k = karts[0];
    markLocal();
    raceTime = 0;
    shownLap = 0;
    finishedPing = false;
    cam.targetYaw = 0;
    cam.targetPitch = 0.42;
    userLooked = true;
    resetPickups();
    begin();
    return;
  }
  const fresh = makeField(track);
  for (let i = 0; i < karts.length; i++) {
    Object.assign(karts[i], fresh[i]);
    karts[i].hitFlash = 0;
    karts[i].hitCd = 0;
    karts[i].hitStun = 0;
    karts[i].turboDown = false;
  }
  for (let i = 0; i < kartMeshes.length; i++) kartMeshes[i].k = karts[i];
  applyRoster(roster);
  raceTime = 0;
  shownLap = 0;
  finishedPing = false;
  cam.targetYaw = 0;
  cam.targetPitch = 0.42;
  userLooked = true;
  resetPickups();
  begin();
}

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function packState() {
  let packed = "race";
  if (mode === "paused") packed = "paused";
  else if (mode === "countdown") packed = "countdown";
  return {
    mode: packed,
    countdown,
    epoch: raceEpoch,
    pickups: pickups.map((p) => (p.alive ? 1 : 0)),
    cool: pickups.map((p) => Math.round(p.cool * 10) / 10),
    karts: karts.map((k) => ({
      name: k.name,
      slot: k.slot,
      human: k.human ? 1 : 0,
      x: r2(k.x),
      z: r2(k.z),
      yaw: Math.round((k.yaw || 0) * 1000) / 1000,
      hop: r2(k.hop),
      loopA: k.loopA == null ? -1 : r2(k.loopA),
      faceX: r2(k.faceX),
      faceY: r2(k.faceY),
      upX: r2(k.upX),
      upY: r2(k.upY),
      steer: r2(k.steer),
      lon: r2(k.lon),
      vx: r2(k.vx),
      vz: r2(k.vz),
      drifting: k.drifting ? 1 : 0,
      driftHold: r2(k.driftHold),
      driftBoostLeft: r2(k.driftBoostLeft),
      driftBoostHold: r2(k.driftBoostHold),
      boost: r2(k.boost),
      boostKind: k.boostKind | 0,
      turboTier: k.turboTier | 0,
      turboCharges: k.turboCharges | 0,
      turboLeft: r2(k.turboLeft),
      lap: k.lap | 0,
      travel: r2(k.travel),
      finished: k.finished ? 1 : 0,
      finishTime: r2(k.finishTime),
      wrong: r2(k.wrong),
      hitFlash: r2(k.hitFlash || 0),
    })),
  };
}

function applyNetState(s) {
  if (!s || !s.karts || s.karts.length !== karts.length) return;
  s.karts.forEach((row, i) => {
    const k = karts[i];
    k.name = row.name || k.name;
    k.slot = Number.isFinite(row.slot) ? row.slot : -1;
    k.human = !!row.human;
    const mine = net.role === "guest" && k.human && k.slot === localSlot;
    if (!mine) {
      k.x = row.x;
      k.z = row.z;
      k.yaw = row.yaw;
      k.vx = row.vx || 0;
      k.vz = row.vz || 0;
    } else {
      const dx = (row.x || 0) - k.x;
      const dz = (row.z || 0) - k.z;
      const err = Math.hypot(dx, dz);
      if (err > 6) {
        k.x = row.x;
        k.z = row.z;
        k.yaw = row.yaw;
        k.vx = row.vx || 0;
        k.vz = row.vz || 0;
      } else {
        k.x += dx * 0.2;
        k.z += dz * 0.2;
        let dyaw = (row.yaw || 0) - k.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        k.yaw += dyaw * 0.2;
        k.vx += ((row.vx || 0) - k.vx) * 0.2;
        k.vz += ((row.vz || 0) - k.vz) * 0.2;
      }
    }
    k.hop = row.hop || 0;
    k.loopA = row.loopA == null || row.loopA < 0 ? null : row.loopA;
    k.faceX = row.faceX || 0;
    k.faceY = row.faceY || 0;
    k.faceZ = 0;
    k.upX = row.upX || 0;
    k.upY = row.upY || 0;
    k.upZ = 0;
    k.steer = row.steer || 0;
    k.lon = row.lon || 0;
    k.drifting = !!row.drifting;
    k.driftHold = row.driftHold || 0;
    k.driftBoostLeft = row.driftBoostLeft || 0;
    k.driftBoostHold = row.driftBoostHold || 0;
    k.boost = row.boost || 0;
    k.boostKind = row.boostKind | 0;
    k.turboTier = row.turboTier | 0;
    k.turboCharges = row.turboCharges | 0;
    k.turboLeft = row.turboLeft || 0;
    k.lap = row.lap | 0;
    k.travel = row.travel || 0;
    k.finished = !!row.finished;
    k.finishTime = row.finishTime || 0;
    k.wrong = row.wrong || 0;
    k.hitFlash = row.hitFlash || 0;
  });
  if (Array.isArray(s.pickups)) {
    s.pickups.forEach((alive, i) => {
      const p = pickups[i];
      if (!p) return;
      p.alive = !!alive;
      p.cool = (s.cool && s.cool[i]) || 0;
    });
  }
  markLocal();
}

function controlFor(k, inputFrame) {
  if (!AUTO && k.human && k.slot === localSlot) return inputFrame;
  if (!AUTO && k.human) {
    const remote = net.inputFor(k.slot) || {};
    const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
    return {
      steer: Math.max(-1, Math.min(1, Number(remote.steer) || 0)),
      throttle: unit(remote.throttle),
      brake: unit(remote.brake),
      pitch: Math.max(-1, Math.min(1, Number(remote.pitch) || 0)),
      arrowsOnly: !!remote.arrowsOnly,
      airThrottle: remote.airThrottle == null ? undefined : unit(remote.airThrottle),
      airBrake: remote.airBrake == null ? undefined : unit(remote.airBrake),
      drift: !!remote.drift,
      turbo: !!remote.turbo,
    };
  }
  if (!AUTO && k.player && net.role !== "guest") return inputFrame;
  if (k.yard && !k.player) {
    return { throttle: 1, brake: 0, steer: Math.sin(raceTime * 0.8 + (k.cabSeed || 0)), drift: false, turbo: false };
  }
  if (!k.ai) k.ai = { lookahead: 13, corner: 0.95, drift: 0.7, lane: 0, mul: 1 };
  const pack = packKart();
  return botInput(k, track, k === pack ? null : pack);
}

function packKart() {
  return karts.find((k) => k.slot === 0 && k.human) || karts.find((k) => k.player) || karts[2];
}

function towAhead(k) {
  let ahead = Infinity;
  for (const other of karts) {
    if (other === k) continue;
    let gap = other.travel - k.travel;
    if (gap < -track.length / 2) gap += track.length;
    if (gap > track.length / 2) gap -= track.length;
    if (gap > 0 && gap < ahead) ahead = gap;
  }
  return ahead;
}

function requestPauseToggle() {
  if (net.role === "guest") {
    net.bump("pause");
    return;
  }
  if (mode === "race") {
    mode = "paused";
    showOverlay("pause");
  } else if (mode === "paused") {
    mode = "race";
    hideOverlay();
  }
}

function requestRestart() {
  if (net.role === "guest") {
    net.bump("restart");
    return;
  }
  if (mode !== "title") resetRace();
}

function takeRemoteEdges() {
  if (net.role !== "host") return;
  for (let slot = 1; slot < SLOT_KART.length; slot++) {
    const inp = net.inputFor(slot);
    if (!inp) continue;
    const pseq = inp.pauseSeq | 0;
    if (pseq > (seenPause[slot] || 0)) {
      seenPause[slot] = pseq;
      if (mode === "race") {
        mode = "paused";
        showOverlay("pause");
      } else if (mode === "paused") {
        mode = "race";
        hideOverlay();
      }
    }
    const rseq = inp.restartSeq | 0;
    if (rseq > (seenRestart[slot] || 0)) {
      seenRestart[slot] = rseq;
      if (mode !== "title") resetRace();
    }
  }
}

function noteLap(player) {
  if (player.lap <= shownLap) return;
  shownLap = player.lap;
  if (player.lap >= 3) {
    if (!finishedPing) {
      finishedPing = true;
      audio.finish();
      saveBest(player.finishTime * 1000);
      mode = "finish";
      showOverlay("finish");
    }
  } else {
    if (player.lap === 2) audio.finalLap();
    else audio.lap();
    hud.banner.textContent = `LAP ${player.lap + 1}`;
    hud.banner.hidden = false;
    bannerT = 1.3;
  }
}

function guestStep(inputFrame, dt) {
  const s = net.state;
  if (mode === "title") {
    if (s && (s.mode === "countdown" || s.mode === "race" || s.mode === "paused")) {
      localSlot = net.slot;
      applyRoster(net.players);
      audio.ensure();
      armTurboVideo();
      hideOverlay();
      mode = "countdown";
      seenEpoch = -1;
    } else {
      return;
    }
  }
  if (!s) return;
  const beforeKart = playerKart();
  const before = {
    lap: beforeKart.lap,
    tier: beforeKart.turboTier || 0,
    charges: beforeKart.turboCharges || 0,
    flash: beforeKart.hitFlash || 0,
  };
  if (s.epoch !== seenEpoch) {
    seenEpoch = s.epoch;
    finishedPing = false;
    shownLap = 0;
    countShown = -1;
    bannerT = 0;
    hud.banner.hidden = true;
    hud.count.hidden = true;
    if (mode === "finish" || mode === "paused") hideOverlay();
  }
  applyNetState(s);
  const me = playerKart();
  if ((me.turboTier || 0) > before.tier) {
    audio.turbo(me.turboTier || 0);
    rumble(140, 0.45, 0.8);
  } else if (before.tier > 0 && (me.turboTier || 0) <= 0) {
    audio.turboEnd();
  } else if ((me.turboCharges || 0) > before.charges) {
    audio.pickup();
  }
  if ((me.hitFlash || 0) > 0.05 && before.flash <= 0) {
    if ((me.hitFlash || 0) <= 0.2) audio.bump();
    else audio.crash();
    rumble(160, 0.85, 0.45);
  }
  if (s.mode === "paused") {
    if (mode !== "paused") showOverlay("pause");
    mode = "paused";
    if (inputFrame.pause || inputFrame.start) requestPauseToggle();
    if (inputFrame.restart) requestRestart();
    return;
  }
  if (mode === "paused" && s.mode !== "paused") hideOverlay();
  if (s.mode === "countdown") {
    mode = "countdown";
    const n = Math.max(0, Math.ceil((s.countdown || 0) - 1e-4));
    if (n > 0 && n !== countShown) {
      countShown = n;
      audio.blip();
      hud.count.textContent = String(n);
      hud.count.hidden = false;
      setLights(4 - n);
    }
    if (inputFrame.restart) requestRestart();
    return;
  }
  const wasCount = mode === "countdown";
  if (wasCount) {
    hud.count.textContent = "GO";
    hud.count.hidden = false;
    audio.go();
    setLights(4);
    countShown = 0;
    setTimeout(() => {
      hud.count.hidden = true;
    }, 500);
  }
  if (inputFrame.pause) requestPauseToggle();
  if (inputFrame.restart) requestRestart();
  if (s.mode === "race" && mode !== "paused") {
    stepWorld([me], [inputFrame], track, dt, 0, true);
  }
  if (me.finished) {
    mode = "finish";
    if (!finishedPing) {
      finishedPing = true;
      shownLap = me.lap;
      audio.finish();
      saveBest(me.finishTime * 1000);
      showOverlay("finish");
    }
    refreshFinish();
  } else {
    mode = "race";
    if (me.lap > shownLap) {
      shownLap = me.lap;
      if (me.lap === 2) audio.finalLap();
      else audio.lap();
      hud.banner.textContent = `LAP ${me.lap + 1}`;
      hud.banner.hidden = false;
      bannerT = 1.3;
    }
  }
}

let lightPhase = 0;
let lightT = 0;
let lapGlow = 0;

function paintLamp(lamp, hex, glow) {
  lamp.material.color.setHex(hex);
  lamp.material.emissive.setHex(hex);
  lamp.material.emissiveIntensity = glow;
}

function setLights(phase) {
  lightPhase = phase;
}

function updateLights(dt) {
  lightT += dt;
  if (!lamps.length) return;
  if (mode === "countdown") {
    const blink = Math.floor(lightT * 8) % 2 === 0;
    lamps.forEach((lamp, i) => {
      const armed = i < lightPhase;
      paintLamp(lamp, armed && blink ? 0xff3355 : 0x3a1014, armed && blink ? 1.6 : 0.12);
    });
    return;
  }
  if (mode === "finish") {
    lamps.forEach((lamp, i) => {
      const on = Math.floor(lightT * 5 + i) % 3 !== 0;
      paintLamp(lamp, on ? 0xffd25a : 0x7cf6ff, on ? 1.7 : 0.35);
    });
    return;
  }
  if (lapGlow > 0) {
    lapGlow = Math.max(0, lapGlow - dt);
    const on = Math.floor(lightT * 12) % 2 === 0;
    lamps.forEach((lamp) => paintLamp(lamp, 0x7cffb2, on ? 1.8 : 0.2));
    return;
  }
  const awake = mode === "race";
  lamps.forEach((lamp) => paintLamp(lamp, awake ? 0x143828 : 0x2a1218, awake ? 0.28 : 0.05));
}

function noteFieldLaps() {
  for (const k of karts) {
    const lap = k.lap || 0;
    if (lap > (k.lampLap || 0)) {
      k.lampLap = lap;
      if (mode === "race") lapGlow = 1.15;
    }
  }
}

function updateHud(player) {
  if (!player) return;
  const order = standings(karts);
  const place = order.findIndex((s) => s.k.player) + 1;
  if (player.yard) {
    hud.place.innerHTML = `<b>${Math.floor(player.stuntScore || 0)}</b>`;
    hud.lap.textContent = "STUNT";
  } else {
    hud.place.innerHTML = `<b>${place}</b><span>${ordinal(place)}</span>`;
    const showLap = Math.min(3, player.lap + 1);
    hud.lap.textContent = `LAP ${showLap}/3`;
  }
  const mph = Math.max(0, Math.round(player.lon * 2.236936));
  hud.speed.innerHTML = `<b>${mph}</b><small>mph</small>`;
  const charges = player.turboCharges || 0;
  document.querySelectorAll(".turbo-slot").forEach((slot, i) => {
    slot.classList.toggle("on", i < charges);
  });
  const tier = player.turboTier || 0;
  hud.turboRead.textContent = tier > 0 ? `${tier + 1}×  ${Math.ceil(player.turboLeft)}s` : "";
  let fill = 0;
  let label = "DRIFT";
  hud.bar.className = "";
  if ((player.driftBoostLeft || 0) > 0) {
    fill = player.driftBoostLeft / Math.max(0.05, player.driftBoostHold || 0.05);
    label = "BOOST";
    hud.bar.className = "hot";
  } else if (player.driftPress) {
    const held = player.driftPressTime || 0;
    fill = driftBarFill(held);
    label = held >= DRIFT_BAR_HOLD_S ? "HOLD" : "DRIFT";
    if (held >= DRIFT_BAR_HOLD_S) hud.bar.className = "super";
  } else if (player.boost > 0) {
    fill = player.boost / (player.boostKind === 2 ? 1.05 : 0.7);
    label = player.boostKind === 2 ? "SUPER" : "BOOST";
    hud.bar.className = "hot";
  }
  hud.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fill))})`;
  hud.barLabel.textContent = label;
  hud.wrong.hidden = player.wrong <= 0;
}

function refreshFinish() {
  const order = standings(karts);
  const place = order.findIndex((s) => s.k.player) + 1;
  cardTitle.textContent = `${place}${ordinal(place)}`;
  cardExtra.innerHTML = order
    .map((s, i) => {
      const t = s.k.finished ? formatTime(s.k.finishTime) : "racing";
      return `<li><i style="background:${s.k.color}"></i><b>${i + 1}</b> ${s.k.name} <em>${t}</em></li>`;
    })
    .join("");
}

function drawMap(player) {
  if (!player) return;
  const ctx = mapEl.getContext("2d");
  const w = mapEl.width;
  const h = mapEl.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(8,10,18,0.88)";
  ctx.fillRect(0, 0, w, h);
  const fwd = forwardFromYaw(player.yaw);
  const right = rightFromForward(fwd);
  const range = player.yard ? Math.max(stuntProps().halfX, stuntProps().halfZ) + 12 : 78;
  const toScreen = (x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const side = dx * right.x + dz * right.z;
    const ahead = dx * fwd.x + dz * fwd.z;
    return [w * 0.5 + (side / range) * w * 0.42, h * 0.68 - (ahead / range) * h * 0.46];
  };
  ctx.beginPath();
  ctx.lineWidth = Math.max(6, w * 0.055);
  ctx.strokeStyle = "rgba(126,246,255,0.95)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  let pen = false;
  if (!player.yard) for (let i = 0; i < track.samples.length; i++) {
    const s = track.samples[i];
    const dx = s.x - player.x;
    const dz = s.z - player.z;
    if (dx * dx + dz * dz > range * range) {
      pen = false;
      continue;
    }
    const [sx, sy] = toScreen(s.x, s.z);
    if (!pen) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    pen = true;
  }
  if (player.yard) {
    const props = stuntProps();
    const corners = [
      [-props.halfX, -props.halfZ],
      [props.halfX, -props.halfZ],
      [props.halfX, props.halfZ],
      [-props.halfX, props.halfZ],
      [-props.halfX, -props.halfZ],
    ];
    corners.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
  }
  ctx.stroke();
  if (player.yard) {
    const props = stuntProps();
    const loop = props.loop;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 79, 216, 0.95)";
    ctx.lineWidth = Math.max(3, w * 0.028);
    const footprint = [
      [loop.x - loop.r, loop.z - loop.halfW],
      [loop.x + loop.r, loop.z - loop.halfW],
      [loop.x + loop.r, loop.z + loop.halfW],
      [loop.x - loop.r, loop.z + loop.halfW],
      [loop.x - loop.r, loop.z - loop.halfW],
    ];
    footprint.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 140, 60, 0.9)";
    ctx.beginPath();
    for (const ramp of props.ramps) {
      const [ax, ay] = toScreen(ramp.x0, (ramp.z0 + ramp.z1) * 0.5);
      const [bx, by] = toScreen(ramp.x1, (ramp.z0 + ramp.z1) * 0.5);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(198, 255, 74, 0.95)";
    ctx.beginPath();
    for (const pad of props.pads || []) {
      const [ax, ay] = toScreen(pad.x0, pad.z0);
      const [bx, by] = toScreen(pad.x1, pad.z1);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  const order = [...karts].sort((a, b) => (a.player ? 1 : 0) - (b.player ? 1 : 0));
  for (const k of order) {
    const dx = k.x - player.x;
    const dz = k.z - player.z;
    if (!k.player && dx * dx + dz * dz > range * range) continue;
    const [sx, sy] = toScreen(k.x, k.z);
    const f = forwardFromYaw(k.yaw);
    const face = Math.atan2(f.x * right.x + f.z * right.z, f.x * fwd.x + f.z * fwd.z);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(face);
    ctx.fillStyle = k.color;
    ctx.beginPath();
    const s = k.player ? w * 0.055 : w * 0.04;
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.62, s * 0.72);
    ctx.lineTo(-s * 0.62, s * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function sizeMap() {
  const phone = window.DeviceProfile.form === "phone";
  const css = phone ? 104 : 168;
  mapEl.style.width = `${css}px`;
  mapEl.style.height = `${css}px`;
  const pr = Math.min(window.devicePixelRatio || 1, LITE ? 1 : 2);
  mapEl.width = Math.round(css * pr);
  mapEl.height = Math.round(css * pr);
}

function resize() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  const cap = !LITE ? 1.75 : window.DeviceProfile.form === "phone" ? 0.5 : 0.85;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sizeMap();
}

function playerKart() {
  return karts.find((k) => k.player) || karts.find((k) => k.human && k.slot === localSlot) || karts[0];
}

const probeEl = document.getElementById("probe");
let probeOn = window.DeviceProfile.form === "desktop";
let fpsAcc = 0;
let fpsFrames = 0;
let fpsRead = 0;

function probePc() {
  return window.DeviceProfile.form === "desktop" && !document.documentElement.classList.contains("input-touch");
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "BracketRight" || e.repeat) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (!probePc()) return;
  probeOn = !probeOn;
  if (probeEl) probeEl.hidden = !probeOn;
}, true);

function paintProbe(dt, inputFrame) {
  if (!probeEl) return;
  if (!probeOn || !probePc()) {
    probeEl.hidden = true;
    return;
  }
  fpsAcc += dt;
  fpsFrames += 1;
  if (fpsAcc >= 0.25) {
    fpsRead = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }
  probeEl.hidden = false;
  probeEl.textContent = String(fpsRead) + "\n" + (inputFrame.live || "");
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, clock.getDelta() || 0.016);
  updateLights(dt);
  skyBlendReady = true;
  skyBlendT = Math.max(0, skyBlendT - dt);
  applySkyLook(skyPhase(dt));
  const inputFrame = input.snapshot(dt);
  paintProbe(dt, inputFrame);
  if (net.role === "guest") net.holdInput(inputFrame);
  net.tick(dt);
  menuPad();

  if (inputFrame.mute) {
    const muted = audio.toggle();
    muteBtn.textContent = muted ? "Muted" : "Sound";
    paintSound(!muted);
  }

  if (net.role === "guest") {
    guestStep(inputFrame, dt);
  } else if (mode === "countdown") {
    if (inputFrame.restart) requestRestart();
    takeRemoteEdges();
    countdown -= dt;
    const n = Math.max(0, Math.ceil(countdown - 1e-4));
    if (n !== countShown && n > 0) {
      countShown = n;
      audio.blip();
      hud.count.textContent = String(n);
      hud.count.hidden = false;
      setLights(4 - n);
    }
    if (countdown <= 0) {
      mode = "race";
      hud.count.textContent = "GO";
      audio.go();
      setLights(4);
      setTimeout(() => {
        hud.count.hidden = true;
      }, 500);
    }
    stepWorld(karts, karts.map(() => ({ steer: 0, throttle: 0, brake: 0, drift: false })), track, dt, 0, false);
  } else if (mode === "race" || mode === "finish") {
    if (inputFrame.restart) requestRestart();
    if (mode === "race" && inputFrame.pause) requestPauseToggle();
    takeRemoteEdges();
    if (mode === "countdown") {
      /* a remote restart just reset the grid */
    } else if (mode !== "paused") {
      if (mode === "race") raceTime += dt;
      applySessionTricks(playerKart());
      const pack = packKart();
      for (const k of karts) {
        const launch = launchMul(raceTime);
        if (k.human || k.player) {
          const ahead = towAhead(k);
          if (ahead > 2 && ahead < 8) k.towTime = (k.towTime || 0) + dt;
          else if (ahead > 8) k.towTime = Math.max(0, (k.towTime || 0) - dt);
          k.speedMul = draftMul(ahead) * slingMul(k.towTime || 0, ahead) * launch;
        } else k.speedMul = rubberMul(k, pack) * launch;
        if (k.player && k.blaze) k.speedMul *= 1.22;
      }
      const inputs = karts.map((k) => controlFor(k, inputFrame));
      stepWorld(karts, inputs, track, dt, raceTime, true);
      const playerNow = playerKart();
      if (!playerNow) return;
      paintDriftTrail(playerNow, dt, true);
      noteFieldLaps();
      if (playerNow.turboPing) {
        audio.turbo(playerNow.turboTier || 0);
        rumble(140, 0.45, 0.8);
        heardTurboTier = playerNow.turboTier || 0;
      } else if (playerNow.turboBreak || (heardTurboTier > 0 && (playerNow.turboTier || 0) <= 0)) {
        audio.turboEnd();
        heardTurboTier = 0;
      } else {
        heardTurboTier = playerNow.turboTier || 0;
      }
      const driftBoosting = (playerNow.driftBoostLeft || 0) > 0;
      if (driftBoosting && !hadDriftBoost) {
        audio.driftBoost();
        rumble(90, 0.25, 0.6);
      }
      hadDriftBoost = driftBoosting;
      if (playerNow.driftPress) audio.driftCharge(playerNow.driftPressTime || 0);
      else audio.driftCharge(0);
      for (const k of karts) {
        if (!k.hitPing) continue;
        for (let n = 0; n < 6; n++) {
          const ang = n * 1.05;
          burst(k.x, 0.45, k.z, Math.cos(ang) * 4, 2.4, Math.sin(ang) * 4, 0.38, 1, 0.86, 0.35);
        }
      }
      if (playerNow.hitPing) {
        if ((playerNow.hitFlash || 0) <= 0.2) audio.bump();
        else audio.crash();
        rumble(220, 1, 0.7);
      }
      if (playerNow.blaze) {
        const nose = forwardFromYaw(playerNow.yaw);
        burst(playerNow.x - nose.x * 0.8, (playerNow.hop || 0) + 0.45, playerNow.z - nose.z * 0.8, -nose.x * 0.4, 1.5, -nose.z * 0.4, 0.4, 1, 0.42, 0.08);
      }
      if ((playerNow.launchPing || 0) !== launchSeen) {
        if ((playerNow.launchPing || 0) > launchSeen) audio.ram();
        launchSeen = playerNow.launchPing || 0;
      }
      if (playerNow.trick) {
        hud.toast.textContent = playerNow.trick;
        hud.toast.hidden = false;
        toastT = 1.1;
        playerNow.trick = "";
      }
      stepRats(dt);
      if (playerNow.wallPing && performance.now() - wallAt > 280) {
        audio.wall();
        rumble(40, 0.5, 0.2);
        wallAt = performance.now();
      }
      noteLap(playerNow);
      if (mode === "finish") refreshFinish();
    }
  } else if (mode === "paused") {
    if (inputFrame.restart) requestRestart();
    if (inputFrame.pause || inputFrame.start) requestPauseToggle();
    takeRemoteEdges();
  }

  if (net.role === "host") net.pushState(mode === "title" ? null : packState());

  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) hud.banner.hidden = true;
  }
  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) hud.toast.hidden = true;
  }

  const player = playerKart();
  const touch = document.documentElement.classList.contains("input-touch");
  if (hud.hint) hud.hint.hidden = true;

  for (const view of kartMeshes) syncKart(view, dt);
  updatePickups(dt);
  paintTurboIcons();
  stepParticles(dt);
  updateCamera(dt, player, inputFrame);
  if (scene.userData.rain) {
    const geom = scene.userData.rain.userData.geom;
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3 + 1] -= rainVel[i] * dt;
      if (rainPos[i * 3 + 1] < 0) rainPos[i * 3 + 1] = 16 + (i % 7);
    }
    geom.attributes.position.needsUpdate = true;
    scene.userData.rain.position.set(camera.position.x, 0, camera.position.z);
  }

  if (mode === "countdown" || mode === "race" || mode === "finish") {
    audio.update(Math.max(0, player.lon), inputFrame.throttle, player.drifting, player.boost > 0);
    const listener = {
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      vx: player.vx || 0,
      vz: player.vz || 0,
    };
    const rivals = [];
    for (let ri = 0; ri < karts.length; ri++) {
      const k = karts[ri];
      if (!k || k.player) continue;
      let rvx = k.vx;
      let rvz = k.vz;
      if (rvx == null || rvz == null || (!rvx && !rvz && (k.lon || 0) > 0.5)) {
        const f = forwardFromYaw(k.yaw || 0);
        const spd = Math.max(0, k.lon || 0);
        rvx = f.x * spd;
        rvz = f.z * spd;
      }
      rivals.push({
        id: k.slot >= 0 ? "s" + k.slot : (k.name || ("r" + ri)),
        x: k.x,
        z: k.z,
        vx: rvx || 0,
        vz: rvz || 0,
        speed: Math.max(0, k.lon || 0),
        throttle: Math.max(0, Math.min(1, k.gas || 0)),
      });
    }
    audio.updateRivals(listener, rivals);
  } else {
    if (mode === "title") audio.update(0, 0, false, false);
    audio.updateRivals(null, []);
  }

  applySessionTricks(player);
  updateHud(player);
  if (!LITE || (Math.floor(performance.now() / 50) & 1) === 0) drawMap(player);
  renderer.render(scene, camera);
  if (player) window.__night = {
    mode,
    role: net.role,
    build: "NL-96",
    travel: Math.round(player.travel),
    speed: Math.round(player.lon * 3.6),
    lap: player.lap,
    names: karts.map((k) => k.name),
    errors: errors.slice(),
  };

  if (AUTO && !autoDone && (mode === "race" || mode === "countdown")) {
    autoT += dt;
    if (autoT > 8) publishTest(player);
  }
  if (SHOT && !autoDone) {
    autoT += dt;
    if (autoT > 1.2) publishTest(player);
  }
}

function publishTest(player) {
  if (!player) return;
  autoDone = true;
  let lit = 0;
  try {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(4 * 9);
    const spots = [
      [w * 0.5, h * 0.5],
      [w * 0.5, h * 0.72],
      [w * 0.3, h * 0.4],
    ];
    spots.forEach((spot, i) => {
      gl.readPixels(spot[0] | 0, spot[1] | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf.subarray(i * 4, i * 4 + 4));
      if (buf[i * 4] + buf[i * 4 + 1] + buf[i * 4 + 2] > 18) lit += 1;
    });
  } catch (err) {
    errors.push(String(err.message || err));
  }
  const payload = {
    ready: true,
    mode,
    lap: player.lap,
    travel: Math.round(player.travel),
    x: Math.round(player.x),
    z: Math.round(player.z),
    speed: Math.round(player.lon * 3.6),
    lit,
    errors,
  };
  testOut.textContent = JSON.stringify(payload);
  document.title = `RACING GAME 2026 ${lit}`;
}

function rumble(ms, strong, weak) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    const actuator = pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators[0]));
    if (actuator && actuator.playEffect) {
      actuator.playEffect("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  }
}

primaryBtn.addEventListener("click", () => {
  audio.ensure();
  if (mode === "paused") requestPauseToggle();
  else if (mode === "finish") requestRestart();
});
secondaryBtn.addEventListener("click", () => {
  if (mode === "paused") requestRestart();
});
document.getElementById("pause-menu").addEventListener("click", async () => {
  audio.ensure();
  await net.leave();
  const fresh = makeField(track);
  for (let i = 0; i < karts.length; i++) {
    Object.assign(karts[i], fresh[i]);
    karts[i].hitFlash = 0;
    karts[i].hitCd = 0;
    karts[i].hitStun = 0;
    karts[i].turboDown = false;
  }
  raceTime = 0;
  shownLap = 0;
  finishedPing = false;
  countdown = 3;
  countShown = 0;
  resetPickups();
  userLooked = false;
  cam.yaw = 0.15;
  cam.targetYaw = 0.15;
  cam.targetPitch = 0.3;
  hud.count.hidden = true;
  hud.banner.hidden = true;
  showMenu("");
});
pauseBtn.addEventListener("click", () => input.requestPause());
muteBtn.addEventListener("click", () => {
  const muted = audio.toggle();
  paintSound(!muted);
  audio.ensure();
});
window.addEventListener("gamepadconnected", (e) => {
  hud.toast.textContent = "Controller connected";
  hud.toast.hidden = false;
  toastT = 2.2;
  void e;
});

const turboVideo = document.getElementById("turbo-vid");
const turboCanvases = document.querySelectorAll(".turbo-slot, #turbo-key");
let boltMatSingleton = null;
let turboPaintAt = 0;

function boltMaterial() {
  if (!boltMatSingleton) {
    const map = new THREE.VideoTexture(turboVideo);
    map.colorSpace = THREE.SRGBColorSpace;
    boltMatSingleton = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return boltMatSingleton;
}

function armTurboVideo() {
  if (!turboVideo) return;
  turboVideo.muted = true;
  if (LITE) turboVideo.loop = false;
  const pending = turboVideo.play();
  if (pending && pending.catch) pending.catch(() => {});
}

function paintTurboIcons() {
  if (turboPaintAt < 0 || !turboVideo || turboVideo.readyState < 2) return;
  const now = performance.now();
  if (LITE && turboPaintAt && now - turboPaintAt < 1000) return;
  turboCanvases.forEach((c) => {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const pad = Math.round(c.width * 0.14);
    ctx.drawImage(turboVideo, pad, pad, c.width - pad * 2, c.height - pad * 2);
  });
  turboPaintAt = now;
  if (LITE) {
    turboPaintAt = -1;
    turboVideo.pause();
  }
}

const PICKUP_DISTS = [108, 168, 232, 292, 352, 412];
let pickups = [];

function makePickups() {
  const geo = new THREE.PlaneGeometry(1.8, 1.8);
  if (bootedCourse === "stunt") {
    pickups = (stuntProps().turbos || []).map((spot, i) => {
      const mesh = new THREE.Mesh(geo, boltMaterial());
      mesh.position.set(spot.x, 1.45, spot.z);
      mesh.renderOrder = 2;
      scene.add(mesh);
      return { x: spot.x, z: spot.z, mesh, alive: true, cool: 0, phase: i };
    });
    return;
  }
  pickups = PICKUP_DISTS.map((dist, i) => {
    const s = sampleAtDist(track.samples, track.length, dist % track.length);
    const lat = i % 2 === 0 ? 3.1 : -3.1;
    const mesh = new THREE.Mesh(geo, boltMaterial());
    mesh.position.set(s.x + s.rx * lat, 1.45, s.z + s.rz * lat);
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { x: mesh.position.x, z: mesh.position.z, mesh, alive: true, cool: 0, phase: i };
  });
}

function resetPickups() {
  for (const p of pickups) {
    p.alive = true;
    p.cool = 0;
    p.mesh.visible = true;
  }
}

function updatePickups(dt) {
  const bob = performance.now() * 0.001;
  const racing = mode === "race" || mode === "finish";
  for (const p of pickups) {
    if (!p.alive) {
      p.mesh.visible = false;
      if (net.role !== "guest") {
        p.cool -= dt;
        if (p.cool <= 0) p.alive = true;
      }
      continue;
    }
    p.mesh.visible = true;
    p.mesh.position.y = 1.4 + Math.sin(bob * 2.2 + p.phase) * 0.18;
    p.mesh.lookAt(camera.position);
    if (!racing || net.role === "guest") continue;
    for (const k of karts) {
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      if (dx * dx + dz * dz > 6.25) continue;
      if (addTurboCharge(k)) {
        p.alive = false;
        p.cool = 12;
        p.mesh.visible = false;
        if (k.player) audio.pickup();
        break;
      }
    }
  }
}

if (bootedCourse === "stunt") {
  buildYard();
  cam.targetPitch = 0.48;
  cam.pitch = 0.48;
  cam.targetYaw = 0;
  cam.yaw = 0;
} else buildCity();
makePickups();
for (const k of karts) buildKart(k);
window.addEventListener("pointerdown", () => armTurboVideo());
overlay.addEventListener("click", (e) => {
  const t = e.target;
  if (!t || overlay.hidden) return;
  if (t.tagName === "BUTTON") audio.menuConfirm();
});
armTurboVideo();
muteBtn.textContent = audio.muted ? "Muted" : "Sound";
paintVolume(Math.round(audio.volume * 100));
paintSound(audio.soundOn);
function rememberName(name) {
  try {
    localStorage.setItem("rg2026-name", name);
    localStorage.setItem("rg2026-name-picked", "1");
  } catch {
    /* private mode */
  }
}

try {
  const picked = (localStorage.getItem("rg2026-name-picked") ?? localStorage.getItem("nightloop-name-picked")) === "1";
  const savedName = localStorage.getItem("rg2026-name") ?? localStorage.getItem("nightloop-name");
  if (picked && savedName && nameInput) {
    nameInput.value = clampName(savedName, 0);
    nameEdited = true;
  } else if (nameInput) {
    nameInput.value = LITE ? "Player 2" : "Player 1";
    nameEdited = false;
  }
} catch {
  /* private mode */
}
nameInput.addEventListener("input", () => {
  nameEdited = true;
  rememberName(nameInput.value.slice(0, 12));
  if (net.role !== "solo") net.holdName(nameInput.value.slice(0, 12));
});

let editPieces = loadPieces() || defaultPieces();
let editAt = 0;
let editHits = [];

function savePieces() {
  try {
    localStorage.setItem("rg2026-track", JSON.stringify(editPieces));
  } catch {
    /* private mode */
  }
}

function paintCourse() {
  const mine = document.getElementById("course-mine");
  const city = document.getElementById("course-city");
  const drift = document.getElementById("course-drift");
  const has = !!loadPieces();
  if (mine) mine.disabled = !has;
  if (city) city.classList.toggle("on", bootedCourse === "city");
  if (mine) mine.classList.toggle("on", bootedCourse === "mine");
  if (drift) drift.classList.toggle("on", bootedCourse === "drift");
  const stunt = document.getElementById("btn-stunt");
  if (stunt) stunt.classList.toggle("on", bootedCourse === "stunt");
}

function chooseCourse(which) {
  if (which === "mine" && !loadPieces()) return;
  if (which !== "city" && which !== "mine" && which !== "drift") return;
  if (which === bootedCourse) return;
  sessionStorage.setItem("rg2026-course", which);
  location.reload();
}

function strokeSpan(g, pts, xy, a, b, style, width) {
  g.strokeStyle = style;
  g.lineWidth = width;
  g.beginPath();
  for (let i = a; i <= b; i++) {
    const [px, py] = xy(pts[i]);
    if (i === a) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
}

function bendWord(t) {
  return ["", "wide", "medium", "sharp"][t | 0] || "medium";
}

function pieceLabel(p, i) {
  const n = `${i + 1}. `;
  if (!p || p.k === "straight") return `${n}Straight`;
  const dir = p.k === "left" ? "Left" : "Right";
  return `${n}${dir} bend, ${bendWord(p.t || 2)}`;
}

function drawEditMap() {
  const canvas = document.getElementById("edit-map");
  if (!canvas) return;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 200;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = cssW;
  const h = cssH;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#10140e";
  g.fillRect(0, 0, w, h);
  editHits = [];
  const layout = editorPreview(editPieces);
  const pts = layout && layout.pts;
  if (!pts || pts.length < 2) {
    g.fillStyle = "#d5e07a";
    g.font = "700 16px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("ADD A PIECE", w / 2, h / 2);
    return;
  }
  const fit = mapFit(pts, w, h);
  const xy = fit.xy;
  (layout.spans || []).forEach((piece, i) => {
    for (let k = piece.a; k <= piece.b && k < pts.length; k++) {
      const [x, y] = xy(pts[k]);
      editHits.push({ i, x, y });
    }
  });
  g.setLineDash([7, 6]);
  strokeSpan(g, pts, xy, 0, pts.length - 1, "#c5d48a", 5);
  g.setLineDash([]);
  (layout.spans || []).forEach((piece, i) => {
    if (i === editAt) return;
    strokeSpan(g, pts, xy, piece.a, piece.b, "#d5e07a", 8);
  });
  const span = layout.spans && layout.spans[editAt];
  if (span) strokeSpan(g, pts, xy, span.a, span.b, "#7ef6ff", 10);
  const owned = new Array(pts.length).fill(false);
  (layout.spans || []).forEach((piece) => {
    for (let i = piece.a; i <= piece.b && i < pts.length; i++) owned[i] = true;
  });
  g.font = "700 13px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#d6e36a";
  let runA = -1;
  let labeled = false;
  for (let i = 0; i <= pts.length; i++) {
    const home = i < pts.length && !owned[i];
    if (home && runA < 0) runA = i;
    if (!home && runA >= 0) {
      if (!labeled && i - runA > 3) {
        const mid = pts[Math.floor((runA + i - 1) / 2)];
        const [hx, hy] = xy(mid);
        g.fillText("HOME", hx, hy - 12);
        labeled = true;
      }
      runA = -1;
    }
  }
  g.font = "700 15px sans-serif";
  (layout.spans || []).forEach((piece, i) => {
    const mid = Math.max(piece.a, Math.min(pts.length - 1, Math.floor((piece.a + piece.b) / 2)));
    const nxt = Math.min(pts.length - 1, mid + 1);
    const [x, y] = xy(pts[mid]);
    const [x2, y2] = xy(pts[nxt]);
    let nx = -(y2 - y);
    let ny = x2 - x;
    const mag = Math.hypot(nx, ny) || 1;
    nx = (nx / mag) * 16;
    ny = (ny / mag) * 16;
    const lx = x + nx;
    const ly = y + ny;
    const crowded = editHits.some((hit) => hit.label && Math.hypot(hit.x - lx, hit.y - ly) < 26);
    if (i === editAt || !crowded) {
      g.fillStyle = i === editAt ? "#7ef6ff" : "#f4f7c8";
      g.fillText(String(i + 1), lx, ly);
      editHits.push({ i, x: lx, y: ly, label: true });
    }
  });
  const [sx0, sy0] = xy(pts[0]);
  g.fillStyle = "#7ef6ff";
  g.beginPath();
  g.arc(sx0, sy0, 6, 0, Math.PI * 2);
  g.fill();
  const aim = pts[Math.min(4, pts.length - 1)];
  const fx = aim[0] - pts[0][0];
  const fz = aim[1] - pts[0][1];
  const mag = Math.hypot(fx, fz) || 1;
  g.strokeStyle = "#7ef6ff";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(sx0, sy0);
  g.lineTo(sx0 + (fx / mag) * 18, sy0 + (fz / mag) * 18);
  g.stroke();
}

function renderEdit() {
  const list = document.getElementById("edit-list");
  if (!list) return;
  editAt = Math.max(0, Math.min(editPieces.length - 1, editAt));
  list.innerHTML = "";
  editPieces.forEach((p, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = pieceLabel(p, i);
    if (i === editAt) btn.className = "on";
    btn.addEventListener("click", () => {
      editAt = i;
      renderEdit();
    });
    list.appendChild(btn);
  });
  const tight = document.getElementById("edit-tight");
  const cur = editPieces[editAt];
  if (tight) {
    tight.disabled = !cur || cur.k === "straight";
    const word = cur && cur.k !== "straight" ? bendWord(cur.t || 2).toUpperCase() : "BEND";
    tight.textContent = word;
    tight.title = cur && cur.k !== "straight" ? "How sharp this bend is. Click to change it." : "Pick a left or right bend first.";
  }
  drawEditMap();
}

function showEdit() {
  if (!editPieces.length) editPieces = defaultPieces();
  menuMain.hidden = true;
  menuOptions.hidden = true;
  menuWorld.hidden = true;
  menuLobby.hidden = true;
  menuEdit.hidden = false;
  renderEdit();
  focusMenu(document.getElementById("edit-straight"));
}

function addPiece(kind) {
  const piece = kind === "straight" ? { k: "straight" } : { k: kind, t: 2 };
  editPieces.splice(editAt + 1, 0, piece);
  editAt += 1;
  savePieces();
  renderEdit();
}

document.getElementById("edit-map").addEventListener("pointerdown", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let best = -1;
  let bestD = 36;
  for (const hit of editHits) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < bestD) {
      bestD = d;
      best = hit.i;
    }
  }
  if (best < 0) return;
  editAt = best;
  renderEdit();
});
document.getElementById("btn-edit").addEventListener("click", showEdit);
document.getElementById("edit-straight").addEventListener("click", () => addPiece("straight"));
document.getElementById("edit-left").addEventListener("click", () => addPiece("left"));
document.getElementById("edit-right").addEventListener("click", () => addPiece("right"));
document.getElementById("edit-tight").addEventListener("click", () => {
  const cur = editPieces[editAt];
  if (!cur || cur.k === "straight") return;
  cur.t = (cur.t || 2) % 3 + 1;
  savePieces();
  renderEdit();
});
document.getElementById("edit-up").addEventListener("click", () => {
  if (editAt <= 0) return;
  const tmp = editPieces[editAt - 1];
  editPieces[editAt - 1] = editPieces[editAt];
  editPieces[editAt] = tmp;
  editAt -= 1;
  savePieces();
  renderEdit();
});
document.getElementById("edit-down").addEventListener("click", () => {
  if (editAt >= editPieces.length - 1) return;
  const tmp = editPieces[editAt + 1];
  editPieces[editAt + 1] = editPieces[editAt];
  editPieces[editAt] = tmp;
  editAt += 1;
  savePieces();
  renderEdit();
});
document.getElementById("edit-del").addEventListener("click", () => {
  if (editPieces.length < 2) return;
  editPieces.splice(editAt, 1);
  editAt = Math.min(editAt, editPieces.length - 1);
  savePieces();
  renderEdit();
});
document.getElementById("edit-back").addEventListener("click", () => {
  savePieces();
  showMenu("");
});
document.getElementById("edit-loop").addEventListener("click", () => {
  editPieces = defaultPieces();
  editAt = 0;
  savePieces();
  renderEdit();
});
document.getElementById("edit-race").addEventListener("click", () => {
  if (!piecesToPoints(editPieces)) return;
  savePieces();
  sessionStorage.setItem("rg2026-course", "mine");
  sessionStorage.setItem("rg2026-autostart", "1");
  location.reload();
});
document.getElementById("course-city").addEventListener("click", () => chooseCourse("city"));
document.getElementById("course-mine").addEventListener("click", () => chooseCourse("mine"));
document.getElementById("course-drift").addEventListener("click", () => chooseCourse("drift"));
document.getElementById("btn-stunt").addEventListener("click", () => {
  if (bootedCourse === "stunt") {
    document.getElementById("btn-1p").click();
    return;
  }
  sessionStorage.setItem("rg2026-course", "stunt");
  sessionStorage.setItem("rg2026-autostart", "1");
  location.reload();
});

document.getElementById("btn-1p").addEventListener("click", async () => {
  if (menuBusy) return;
  menuBusy = true;
  try {
    audio.ensure();
    await net.leave();
    localSlot = 0;
    const name = clampName(nameInput.value, LITE ? 1 : 0);
    nameInput.value = name;
    rememberName(name);
    roster = [{ slot: 0, name }];
    resetRace();
  } finally {
    menuBusy = false;
  }
});

async function enterRoom(where, code) {
  if (menuBusy) return;
  menuBusy = true;
  menuStatus.textContent = "";
  try {
    audio.ensure();
    const chosen = clampName(nameInput.value, LITE ? 1 : 0);
    nameInput.value = chosen;
    const data = await net.join(chosen, true, where, code || "");
    localSlot = data.slot | 0;
    if (data.name && data.name !== chosen) nameInput.value = data.name;
    rememberName(nameInput.value);
    showLobby();
  } catch (err) {
    const raw = String(err.message || "");
    menuStatus.textContent = raw || "1 player still works.";
  } finally {
    menuBusy = false;
  }
}

document.getElementById("btn-local").addEventListener("click", () => enterRoom("local"));

document.getElementById("btn-world").addEventListener("click", () => {
  menuMain.hidden = true;
  menuWorld.hidden = false;
  menuOptions.hidden = true;
  menuLobby.hidden = true;
  focusMenu(document.getElementById("btn-host"));
});

document.getElementById("btn-host").addEventListener("click", () => enterRoom("world", ""));

document.getElementById("btn-join").addEventListener("click", () => {
  const code = (document.getElementById("room-join").value || "").trim();
  enterRoom("world", code);
});

document.getElementById("btn-world-back").addEventListener("click", () => {
  menuWorld.hidden = true;
  menuMain.hidden = false;
  focusMenu(document.getElementById("btn-1p"));
});

document.getElementById("btn-options").addEventListener("click", () => {
  menuMain.hidden = true;
  menuOptions.hidden = false;
  menuWorld.hidden = true;
  menuLobby.hidden = true;
  paintVolume(Math.round(audio.volume * 100));
  paintSound(audio.soundOn);
  focusMenu(optVol);
});

document.getElementById("opt-back").addEventListener("click", () => {
  menuMain.hidden = false;
  menuOptions.hidden = true;
  focusMenu(document.getElementById("btn-1p"));
});

function paintVolume(value) {
  document.querySelectorAll(".js-vol").forEach((el) => {
    el.value = String(value);
  });
}

function paintSound(on) {
  document.querySelectorAll(".js-sound").forEach((el) => {
    el.checked = on;
  });
  muteBtn.textContent = on ? "Sound" : "Muted";
}

document.querySelectorAll(".js-vol").forEach((el) => {
  el.addEventListener("input", () => {
    audio.setVolume(Number(el.value) / 100);
    paintVolume(Math.round(audio.volume * 100));
  });
});

function applyDriftRise(raw) {
  const next = setDriftRise(raw);
  document.querySelectorAll(".js-drift").forEach((el) => {
    el.value = String(next);
  });
  try {
    localStorage.setItem("rg2026-drift-rise", String(next));
  } catch {
    /* private mode */
  }
}

document.querySelectorAll(".drift-dashes").forEach((dashes) => {
  for (let step = 0; step <= 20; step++) dashes.appendChild(document.createElement("i"));
});
let savedRise = 0.5;
try {
  const raw = localStorage.getItem("rg2026-drift-rise") ?? localStorage.getItem("nightloop-drift-rise");
  if (raw != null && raw !== "") savedRise = Number(raw);
} catch {
  savedRise = 0.5;
}
applyDriftRise(savedRise);
document.querySelectorAll(".js-drift").forEach((el) => {
  el.addEventListener("input", () => applyDriftRise(el.value));
});

document.querySelectorAll(".js-sound").forEach((el) => {
  el.addEventListener("change", () => {
    audio.setSound(el.checked);
    paintSound(audio.soundOn);
    audio.ensure();
  });
});

let savedSky = "night";
try {
  const raw = localStorage.getItem("rg2026-sky");
  if (raw === "morning" || raw === "afternoon" || raw === "night" || raw === "cycle") savedSky = raw;
} catch {
  savedSky = "night";
}
applySky(savedSky);
document.querySelectorAll(".js-sky").forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) applySky(el.dataset.sky);
    else paintSky(skyMode);
  });
});

function syncPaintChecks() {
  document.querySelectorAll(".js-paint").forEach((el) => { el.checked = el.dataset.paint === roadsterPaint; });
}
syncPaintChecks();
document.querySelectorAll(".js-paint").forEach((el) => {
  el.addEventListener("change", () => {
    const next = el.dataset.paint === "cyan" ? "cyan" : "red";
    if (next !== roadsterPaint) {
      roadsterPaint = next;
      roadsterGltf = null;
      const pv = kartMeshes.find((v) => v.k.player && v.roadsterCar);
      if (pv) loadRoadster(pv); // swap now, no reload
      try { localStorage.setItem("rg2026.paint", next); } catch {}
    }
    syncPaintChecks();
  });
});

lobbyStart.addEventListener("click", () => {
  if (net.role !== "host" || net.players.length < 2) return;
  audio.ensure();
  localSlot = net.slot;
  roster = net.players.map((p) => ({ slot: p.slot, name: p.name }));
  resetRace();
});

document.getElementById("lobby-cancel").addEventListener("click", async () => {
  await net.leave();
  showMenu("");
});

net.onChange((info) => {
  if (info.gone) {
    const racing = mode === "countdown" || mode === "race" || mode === "paused" || mode === "finish";
    if (racing || !menuLobby.hidden) showMenu("The other player left.");
    return;
  }
  if (!menuLobby.hidden) renderLobby();
  if (net.role === "host" && mode !== "title") {
    const live = new Set(net.players.map((p) => p.slot));
    for (let slot = 1; slot < SLOT_KART.length; slot++) {
      if (!live.has(slot)) releaseSlot(slot);
    }
  }
});

const sessionTricks = { blaze: false, mass: false, rats: false, cabs: false };
const rats = [];
const CAB_COLORS = ["#ffb020", "#ff4fd8", "#c6ff4a", "#9ad0ff"];

function showTrick(text) {
  hud.toast.textContent = text;
  hud.toast.hidden = false;
  toastT = 1.4;
}

function applySessionTricks(k) {
  if (!k || !k.player) return;
  k.blaze = !!sessionTricks.blaze;
  k.bulk = sessionTricks.mass ? 1.85 : 1;
  if (!k.cab) k.radius = sessionTricks.mass ? 2.15 : k.yard ? k.bodyRadius || 1.2 : k.radius;
}

function spawnRats() {
  if (rats.length) return;
  const player = playerKart();
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.32, 0.85),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4fd8 : 0xc6ff4a })
    );
    scene.add(mesh);
    rats.push({
      mesh,
      x: player.x + (i - 3.5) * 1.8,
      z: player.z + 5,
      vx: i % 2 ? 7 : -7,
      vz: 5 - (i % 4),
    });
  }
}

function stepRats(dt) {
  if (!rats.length) return;
  const player = playerKart();
  const props = stuntProps();
  for (const rat of rats) {
    rat.x += rat.vx * dt;
    rat.z += rat.vz * dt;
    if (player.yard) {
      if (Math.abs(rat.x) > props.halfX - 2) rat.vx *= -1;
      if (Math.abs(rat.z) > props.halfZ - 2) rat.vz *= -1;
    } else if (Math.abs(rat.x - player.x) > 22 || Math.abs(rat.z - player.z) > 22) {
      rat.vx += (player.x - rat.x) * 0.4 * dt;
      rat.vz += (player.z - rat.z) * 0.4 * dt;
    }
    const dx = player.x - rat.x;
    const dz = player.z - rat.z;
    if (dx * dx + dz * dz < 2.4) {
      player.vx += Math.sign(dx || 1) * 6;
      player.vz += Math.sign(dz || 1) * 6;
      rat.vx *= -1;
      rat.vz *= -1;
    }
    rat.mesh.position.set(rat.x, 0.22, rat.z);
    rat.mesh.rotation.y += dt * 4;
  }
}

function spawnCabs() {
  if (karts.some((k) => k.cab)) return;
  const player = playerKart();
  const nose = forwardFromYaw(player.yaw);
  const right = rightFromForward(nose);
  for (let i = 0; i < 4; i++) {
    const side = (i - 1.5) * 3.2;
    let kart;
    if (player.yard) {
      kart = makeYardKart({
        player: false,
        name: "CAB",
        color: CAB_COLORS[i],
        x: player.x - nose.x * 8 + right.x * side,
        z: player.z - nose.z * 8 + right.z * side,
        yaw: player.yaw,
        cabSeed: i + 0.4,
      });
    } else {
      kart = makeYardKart({
        player: false,
        name: "CAB",
        color: CAB_COLORS[i],
        x: player.x - nose.x * 8 + right.x * side,
        z: player.z - nose.z * 8 + right.z * side,
        yaw: player.yaw,
      });
      kart.yard = false;
      kart.ai = { lookahead: 12, corner: 0.7, drift: 0.15, lane: side, mul: 0.96 };
      kart.travel = player.travel;
      kart.prevDist = player.prevDist;
      kart.projIndex = player.projIndex;
    }
    kart.cab = true;
    kart.prevX = kart.x;
    kart.prevZ = kart.z;
    karts.push(kart);
    buildKart(kart);
  }
}

function grantCheat(id) {
  if (id === "burn") sessionTricks.blaze = true;
  if (id === "mass") sessionTricks.mass = true;
  if (id === "rats") {
    sessionTricks.rats = true;
    spawnRats();
  }
  if (id === "cabs") {
    sessionTricks.cabs = true;
    spawnCabs();
  }
  const labels = { burn: "BURN", mass: "MASS", rats: "RATS", cabs: "CABS" };
  showTrick(labels[id] || "NOPE");
}

const cheatDown = new Set();
const cheatBuf = [];
window.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  cheatDown.add(e.code);
  if (e.repeat) return;
  cheatBuf.push(e.code);
  if (cheatBuf.length > 8) cheatBuf.shift();
  const hit = matchCheatKeys(cheatBuf, cheatDown);
  if (!hit) return;
  cheatBuf.length = 0;
  grantCheat(hit.id);
});
window.addEventListener("keyup", (e) => {
  cheatDown.delete(e.code);
});
document.querySelectorAll(".js-code").forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
    e.preventDefault();
    e.stopPropagation();
    const hit = matchCheatWord(el.value);
    el.value = "";
    if (hit) grantCheat(hit.id);
    else showTrick("NOPE");
  });
});

showMenu("");
if (sessionStorage.getItem("rg2026-autostart") === "1") {
  sessionStorage.removeItem("rg2026-autostart");
  const name = clampName(nameInput.value, 0);
  roster = [{ slot: 0, name }];
  resetRace();
}
if (window.__want === "btn-1p" || window.__want === "btn-local" || window.__want === "btn-world") {
  const early = document.getElementById(window.__want);
  window.__want = "";
  if (early) early.click();
}
setLights(0);
resize();
window.addEventListener("resize", resize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
window.DeviceProfile.onChange(resize);

if (SHOT) {
  hideOverlay();
  userLooked = false;
}
if (AUTO) {
  hideOverlay();
  mode = "countdown";
  countdown = 0.4;
  countShown = 1;
  const you = playerKart();
  you.ai = { lookahead: 13, corner: 0.95, drift: 0.75, lane: 0, mul: 1 };
}

requestAnimationFrame(frame);
setInterval(() => {
  if (net.role === "guest") net.holdInput(input.snapshot(0.04));
  if (net.role === "solo") return;
  net.tick(0.05);
  if (menuLobby && !menuLobby.hidden) renderLobby();
}, 40);
