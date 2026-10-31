// Keyboard, mouse, touch, and every pad the browser exposes (USB and Bluetooth).

function dead(v, zone = 0.16) {
  if (v == null || Number.isNaN(v)) return 0;
  const a = Math.abs(v);
  if (a < zone) return 0;
  return Math.sign(v) * ((a - zone) / (1 - zone));
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function btn(pad, i) {
  const b = pad.buttons[i];
  if (!b) return 0;
  return b.value || (b.pressed ? 1 : 0);
}

export function mapStandardPad(pad) {
  const y = dead(pad.axes[0] != null ? pad.axes[1] : 0);
  return {
    steer: dead(pad.axes[0] || 0),
    throttle: Math.max(btn(pad, 7), btn(pad, 0), y < 0 ? -y : 0),
    airGas: Math.max(btn(pad, 7), btn(pad, 0)),
    airBrake: Math.max(btn(pad, 6), btn(pad, 1) > 0.5 ? btn(pad, 1) : 0),
    stickY: -y,
    brake: Math.max(btn(pad, 6), btn(pad, 1) > 0.5 ? btn(pad, 1) : 0, y > 0 ? y : 0),
    // NL-87: A is gas (with RT); drift moved to X or RB.
    drift: btn(pad, 2) > 0.45 || btn(pad, 5) > 0.45,
    turbo: btn(pad, 4) > 0.45,
    lookX: dead(pad.axes[2] || 0, 0.18),
    lookY: dead(pad.axes[3] || 0, 0.18),
    recenter: btn(pad, 3) > 0.5 || btn(pad, 11) > 0.5,
    pause: btn(pad, 9) > 0.5,
    start: btn(pad, 9) > 0.5,
  };
}

export function mapGenericPad(pad) {
  const y = dead(pad.axes[1] || 0);
  const lookAxis = (v) => {
    if (v == null || Number.isNaN(v) || Math.abs(v) > 0.98) return 0;
    return dead(v, 0.2);
  };
  return {
    steer: dead(pad.axes[0] || 0),
    throttle: Math.max(y < 0 ? -y : 0, btn(pad, 7), btn(pad, 0)),
    airGas: Math.max(btn(pad, 7), btn(pad, 0)),
    airBrake: Math.max(btn(pad, 6), btn(pad, 1) > 0.45 ? 1 : 0),
    stickY: -y,
    brake: Math.max(y > 0 ? y : 0, btn(pad, 6), btn(pad, 1) > 0.45 ? 1 : 0),
    // NL-87: A is gas (with RT); drift moved to X or RB.
    drift: btn(pad, 2) > 0.45 || btn(pad, 5) > 0.45,
    turbo: btn(pad, 4) > 0.45,
    lookX: lookAxis(pad.axes[2]),
    lookY: lookAxis(pad.axes[3]),
    recenter: btn(pad, 3) > 0.5 || btn(pad, 11) > 0.5,
    pause: btn(pad, 9) > 0.5,
    start: btn(pad, 9) > 0.5,
  };
}

function damp(from, to, lambda, dt) {
  return to + (from - to) * Math.exp(-lambda * dt);
}

// NL-88 keyboard: Space drift, Shift turbo. W/S are gas/brake on the ground and in the air and never pitch.
// Air flips (+1 = nose down): Q / Up / I forward, E / Down / K back. Physics ignores pitch on the ground
// and holds a key already down at the lip for its air grace, so ramps never lean the car forward.
export function keyboardAxes(has) {
  return {
    throttle: has("KeyW") || has("ArrowUp") ? 1 : 0,
    brake: has("KeyS") || has("ArrowDown") ? 1 : 0,
    airThrottle: has("KeyW") ? 1 : 0,
    airBrake: has("KeyS") ? 1 : 0,
    pitch: (has("KeyQ") || has("ArrowUp") || has("KeyI") ? 1 : 0) - (has("KeyE") || has("ArrowDown") || has("KeyK") ? 1 : 0),
    drift: has("Space"),
    turbo: has("ShiftLeft") || has("ShiftRight"),
  };
}

export function createInput(canvas) {
  const keys = new Set();
  const edges = { start: false, pause: false, restart: false, mute: false, recenter: false };
  let steerSmooth = 0;
  let lookDX = 0;
  let lookDY = 0;
  let wheel = 0;
  let lookId = null;
  let lookMoved = 0;
  let lastX = 0;
  let lastY = 0;
  let touchSteer = 0;
  let touchSteerOn = false;
  let touchPitch = 0;
  let touchGas = false;
  let touchBrake = false;
  let touchDrift = false;
  let touchTurbo = false;
  let activePad = -1;
  let padName = "";
  let prevPadPause = false;
  let prevPadStart = false;
  let prevPadRecenter = false;

  const steerKeys = () => (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);

  const menuOpen = () => {
    const ov = document.getElementById("overlay");
    return ov && !ov.hidden;
  };

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (menuOpen() && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) return;
    if (e.repeat) return;
    keys.add(e.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Escape") edges.pause = true;
    if (e.code === "Enter") edges.start = true;
    if (e.code === "KeyR") edges.restart = true;
    if (e.code === "KeyM") edges.mute = true;
    if (e.code === "KeyC") edges.recenter = true;
  });
  window.addEventListener("keyup", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    keys.delete(e.code);
  });
  window.addEventListener("blur", () => keys.clear());

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    lookId = e.pointerId;
    lookMoved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("looking");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    lookMoved += Math.abs(dx) + Math.abs(dy);
    lookDX += dx;
    lookDY += dy;
  });
  const endLook = (e) => {
    if (e.pointerId !== lookId) return;
    if (lookMoved < 8) edges.recenter = true;
    lookId = null;
    canvas.classList.remove("looking");
  };
  canvas.addEventListener("pointerup", endLook);
  canvas.addEventListener("pointercancel", endLook);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      wheel += Math.sign(e.deltaY);
    },
    { passive: false }
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function readPads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    let bestScore = 0.2;
    for (const pad of list) {
      if (!pad) continue;
      const mapped = pad.mapping === "standard" ? mapStandardPad(pad) : mapGenericPad(pad);
      const score =
        Math.abs(mapped.steer) +
        mapped.throttle +
        mapped.brake +
        (mapped.drift ? 1 : 0) +
        Math.abs(mapped.lookX) +
        Math.abs(mapped.lookY) +
        (mapped.pause ? 1 : 0) +
        (mapped.start ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = pad;
      }
    }
    if (best) activePad = best.index;
    const pad = activePad >= 0 ? list[activePad] : null;
    if (!pad) return null;
    padName = pad.id || "Controller";
    return pad.mapping === "standard" ? mapStandardPad(pad) : mapGenericPad(pad);
  }

  function holdButton(el, set) {
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      set(true);
    };
    const off = (e) => {
      if (e) e.preventDefault();
      set(false);
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("lostpointercapture", off);
  }

  function attachTouch(stick, nub, gas, brake, drift, cam, turbo) {
    if (stick) {
      const move = (e) => {
        const r = stick.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        touchSteer = clamp(dx / (r.width * 0.34), -1, 1);
        touchPitch = clamp(-dy / (r.height * 0.34), -1, 1);
        if (nub) {
          const nx = clamp(dx, -r.width * 0.28, r.width * 0.28);
          const ny = clamp(dy, -r.height * 0.28, r.height * 0.28);
          nub.style.transform = `translate(${nx}px, ${ny}px)`;
        }
      };
      stick.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        touchSteerOn = true;
        stick.setPointerCapture(e.pointerId);
        move(e);
      });
      stick.addEventListener("pointermove", (e) => {
        if (!touchSteerOn) return;
        move(e);
      });
      const stop = () => {
        touchSteerOn = false;
        touchSteer = 0;
        touchPitch = 0;
        if (nub) nub.style.transform = "translate(0px, 0px)";
      };
      stick.addEventListener("pointerup", stop);
      stick.addEventListener("pointercancel", stop);
    }
    holdButton(gas, (v) => {
      touchGas = v;
    });
    holdButton(brake, (v) => {
      touchBrake = v;
    });
    holdButton(drift, (v) => {
      touchDrift = v;
    });
    holdButton(turbo, (v) => {
      touchTurbo = v;
    });
    if (cam) {
      cam.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        edges.recenter = true;
      });
    }
  }

  function snapshot(dt) {
    const pad = readPads();
    const kb = keyboardAxes((c) => keys.has(c));
    const driftHeld = kb.drift || touchDrift;
    steerSmooth = damp(steerSmooth, steerKeys(), driftHeld ? 18 : 9, dt);
    let steer = touchSteerOn ? touchSteer : steerSmooth;
    if (pad && Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer;
    const throttle = Math.max(kb.throttle, touchGas ? 1 : 0, pad ? pad.throttle : 0);
    // NL-88: in the air W / touch Gas / pad A+RT are gas (arrows and pad sticks are free to flip).
    const airThrottle = Math.max(kb.airThrottle, touchGas ? 1 : 0, pad ? pad.airGas || 0 : 0);
    const brake = Math.max(kb.brake, touchBrake ? 1 : 0, pad ? pad.brake : 0);
    const airBrake = Math.max(kb.airBrake, touchBrake ? 1 : 0, pad ? pad.airBrake || 0 : 0);
    // Air pitch (+1 = nose down): Q/Up/I forward flip, E/Down/K back flip, touch stick up-down, pad left or right stick Y.
    let pitch = kb.pitch;
    if (touchSteerOn && Math.abs(touchPitch) > Math.abs(pitch)) pitch = touchPitch;
    if (pad && Math.abs(pad.lookY) > Math.abs(pitch)) pitch = -pad.lookY;
    if (pad && Math.abs(pad.stickY || 0) > Math.abs(pitch)) pitch = pad.stickY;
    const arrowsOnly = !keys.has("KeyW") && !keys.has("KeyS") && !touchGas && !touchBrake && !(pad && (pad.throttle > 0.1 || pad.brake > 0.1));
    const drift =
      kb.drift || touchDrift || !!(pad && pad.drift);
    const turbo = kb.turbo || touchTurbo || !!(pad && pad.turbo);

    if (pad) {
      if (pad.pause && !prevPadPause) edges.pause = true;
      if (pad.start && !prevPadStart) edges.start = true;
      if (pad.recenter && !prevPadRecenter) edges.recenter = true;
      prevPadPause = pad.pause;
      prevPadStart = pad.start;
      prevPadRecenter = pad.recenter;
      lookDX += pad.lookX * dt * 220;
      lookDY += pad.lookY * dt * 170;
    } else {
      prevPadPause = false;
      prevPadStart = false;
      prevPadRecenter = false;
    }

    const live = [];
    if (keys.has("KeyW") || keys.has("ArrowUp")) live.push("W");
    if (keys.has("KeyA") || keys.has("ArrowLeft")) live.push("A");
    if (keys.has("KeyS") || keys.has("ArrowDown")) live.push("S");
    if (keys.has("KeyD") || keys.has("ArrowRight")) live.push("D");
    if (keys.has("Space")) live.push("DRIFT");
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) live.push("TURBO");
    if (keys.has("KeyQ")) live.push("Q");
    if (keys.has("KeyE")) live.push("E");
    if (keys.has("Escape")) live.push("ESC");
    if (keys.has("KeyR")) live.push("R");
    if (keys.has("KeyM")) live.push("M");
    if (keys.has("KeyI")) live.push("I");
    if (keys.has("KeyK")) live.push("K");
    if (touchGas) live.push("GAS");
    if (touchBrake) live.push("BRAKE");
    if (touchDrift) live.push("DRIFT");
    if (touchTurbo) live.push("TURBO");
    if (touchSteerOn && touchSteer < -0.12) live.push("STICK L");
    if (touchSteerOn && touchSteer > 0.12) live.push("STICK R");
    if (lookId != null || lookDX || lookDY) live.push("LOOK");
    if (wheel) live.push("WHEEL");
    const padNames = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "BACK", "START", "L3", "R3", "UP", "DOWN", "LEFT", "RIGHT"];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      gp.buttons.forEach((b, i) => {
        if (b && (b.pressed || b.value > 0.35)) live.push(padNames[i] || "B" + i);
      });
      if ((gp.axes[0] || 0) < -0.2) live.push("LX-");
      if ((gp.axes[0] || 0) > 0.2) live.push("LX+");
      if ((gp.axes[1] || 0) < -0.2) live.push("LY-");
      if ((gp.axes[1] || 0) > 0.2) live.push("LY+");
    }
    const out = {
      steer,
      mouseX: clamp(lookDX / 140, -0.75, 0.75),
      throttle,
      brake,
      pitch,
      airThrottle,
      airBrake,
      arrowsOnly,
      drift,
      turbo,
      lookDX,
      lookDY,
      wheel,
      live: live.filter((v, i) => live.indexOf(v) === i).join("  "),
      start: edges.start,
      pause: edges.pause,
      restart: edges.restart,
      mute: edges.mute,
      recenter: edges.recenter,
      padName,
      usingPad: !!pad && (Math.abs(pad.steer) > 0.1 || pad.throttle > 0.1 || pad.brake > 0.1),
    };
    lookDX = 0;
    lookDY = 0;
    wheel = 0;
    edges.start = false;
    edges.pause = false;
    edges.restart = false;
    edges.mute = false;
    edges.recenter = false;
    return out;
  }

  return {
    snapshot,
    attachTouch,
    requestStart() {
      edges.start = true;
    },
    requestPause() {
      edges.pause = true;
    },
    requestRestart() {
      edges.restart = true;
    },
    requestMute() {
      edges.mute = true;
    },
    padName: () => padName,
  };
}
