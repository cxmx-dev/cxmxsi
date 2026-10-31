// Session jokes. Words work from the code box. Key chords work while driving.
// Shoulders are Q and F. Z is the tap. Arrows stand in for the hat.

export const CHEAT_LIST = [
  { id: "burn", word: "BURN", keys: ["ArrowUp", "KeyZ", "KeyZ", "KeyZ"], hold: ["ArrowUp"], label: "BURN" },
  { id: "mass", word: "MASS", keys: ["KeyQ", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], hold: [], label: "MASS" },
  { id: "rats", word: "RATS", keys: ["KeyZ", "KeyZ", "KeyZ"], hold: ["KeyQ", "KeyF"], label: "RATS" },
  { id: "cabs", word: "CABS", keys: ["KeyF", "KeyQ", "KeyZ", "ArrowUp", "ArrowDown", "ArrowUp"], hold: [], label: "CABS" },
];

export function matchCheatWord(text) {
  const word = String(text || "").trim().toUpperCase();
  if (!word) return null;
  return CHEAT_LIST.find((c) => c.word === word) || null;
}

export function matchCheatKeys(buffer, held) {
  const keys = buffer || [];
  const down = held || new Set();
  let best = null;
  for (const cheat of CHEAT_LIST) {
    const n = cheat.keys.length;
    if (keys.length < n) continue;
    const tail = keys.slice(-n);
    if (!tail.every((code, i) => code === cheat.keys[i])) continue;
    if ((cheat.hold || []).some((code) => !down.has(code))) continue;
    if (!best || n > best.keys.length) best = cheat;
  }
  return best;
}
