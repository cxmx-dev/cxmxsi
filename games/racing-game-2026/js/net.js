// Local Wi-Fi room. One host simulates. Guests send input and render host state.
// The room allows MAX_SLOTS so a later build can open more than two seats
// without a new protocol. The menu only offers 1 player and 2 players.

export const MAX_SLOTS = 4;
export const NAME_DEFAULTS = ["Player 1", "Player 2", "Player 3", "Player 4"];
// Field order is ROOK, VEX, YOU, NYX. Seat 0 and 1 start side by side.
export const SLOT_KART = [2, 3, 1, 0];

export function clampName(raw, slot) {
  const clean = String(raw ?? "")
    .replace(/[^\w ._-]/g, "")
    .trim()
    .slice(0, 12);
  if (clean) return clean;
  if (slot >= 0 && slot < NAME_DEFAULTS.length) return NAME_DEFAULTS[slot];
  return `Player ${slot + 1}`;
}

export function createNet() {
  let token = "";
  let slot = 0;
  let role = "solo";
  let players = [];
  let state = null;
  let inputs = {};
  let timer = 0;
  let misses = 0;
  let pauseSeq = 0;
  let restartSeq = 0;
  let pending = null;
  let posted = null;
  let pendingName = "";
  let roomCode = "";
  let inflight = false;
  let change = () => {};

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "no answer" }));
    if (!res.ok && !data.error) data.ok = false;
    if (!res.ok) data.ok = false;
    return data;
  }

  function dropped() {
    token = "";
    role = "solo";
    roomCode = "";
    state = null;
    inputs = {};
    players = [];
    change({ gone: true, players, role, slot });
  }

  return {
    get role() {
      return role;
    },
    get slot() {
      return slot;
    },
    get players() {
      return players;
    },
    get state() {
      return state;
    },
    get code() {
      return roomCode;
    },
    onChange(fn) {
      change = fn;
    },
    inputFor(seat) {
      return inputs[String(seat)] || null;
    },
    bump(kind) {
      if (kind === "pause") pauseSeq += 1;
      else if (kind === "restart") restartSeq += 1;
    },
    holdInput(frame) {
      pending = {
        steer: Math.round((frame.steer || 0) * 100) / 100,
        throttle: Math.round((frame.throttle || 0) * 100) / 100,
      pitch: Math.round((frame.pitch || 0) * 100) / 100,
      arrowsOnly: !!frame.arrowsOnly,
      airThrottle: frame.airThrottle == null ? null : Math.round(frame.airThrottle * 100) / 100,
      airBrake: frame.airBrake == null ? null : Math.round(frame.airBrake * 100) / 100,
        brake: Math.round((frame.brake || 0) * 100) / 100,
        drift: frame.drift ? 1 : 0,
        turbo: frame.turbo ? 1 : 0,
        pauseSeq,
        restartSeq,
      };
    },
    pushState(next) {
      posted = next;
    },
    holdName(name) {
      pendingName = String(name || "").slice(0, 12);
    },
    async join(name, edited, where, code) {
      let client = "";
      try {
        client = sessionStorage.getItem("rg2026-seat") || sessionStorage.getItem("nightloop-seat") || "";
        if (!client) {
          client = Math.random().toString(36).slice(2);
          sessionStorage.setItem("rg2026-seat", client);
        }
      } catch {
        client = "";
      }
      const data = await post("/api/join", {
        name,
        edited: !!edited,
        client,
        where: where || "local",
        code: code || "",
        host: where === "world" && !code,
      });
      if (!data.ok) throw new Error(data.error || "Could not open a room. 1 player still works.");
      token = data.token;
      slot = data.slot | 0;
      roomCode = data.code || "";
      role = slot === 0 ? "host" : "guest";
      players = data.players || [];
      misses = 0;
      state = null;
      inputs = {};
      pauseSeq = 0;
      restartSeq = 0;
      return data;
    },
    async leave() {
      const held = token;
      token = "";
      role = "solo";
      roomCode = "";
      state = null;
      inputs = {};
      players = [];
      pauseSeq = 0;
      restartSeq = 0;
      posted = null;
      pending = null;
      if (!held) return;
      try {
        await post("/api/leave", { token: held });
      } catch {
        /* room already gone */
      }
    },
    tick(dt) {
      if (role === "solo" || !token || inflight) return;
      timer += dt;
      if (timer < 0.033) return;
      timer = 0;
      inflight = true;
      const body = { token };
      if (pendingName) body.name = pendingName;
      if (role === "host") body.state = posted;
      else body.input = pending;
      post("/api/sync", body)
        .then((data) => {
          inflight = false;
          if (!token) return;
          if (!data.ok) {
            misses += 1;
            if (misses >= 3) dropped();
            return;
          }
          misses = 0;
          const prev = players.map((p) => `${p.slot}:${p.name}`).join("|");
          players = data.players || [];
          slot = data.slot | 0;
          const nextRole = slot === 0 ? "host" : "guest";
          const roleChanged = nextRole !== role;
          role = nextRole;
          if (role === "guest" && data.state) state = data.state;
          if (role === "host") inputs = data.inputs || {};
          const now = players.map((p) => `${p.slot}:${p.name}`).join("|");
          if (roleChanged || now !== prev) change({ gone: false, players, role, slot });
        })
        .catch(() => {
          inflight = false;
          misses += 1;
          if (misses >= 20) dropped();
        });
    },
  };
}
