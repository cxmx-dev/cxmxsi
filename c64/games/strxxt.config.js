// STRXXT player settings. One file per game: copy this, rename, edit.
// Mirrors the desktop VICE 3.10 x64sc setup (vice.ini + strxxt-xbox360.vjm + pad bridge).
// Controls (from the STRXXT README "Controls" tables and its in-game help line):
//   move W A S D / cursor keys, punch J (hold = combo, swings the pipe), kick K (in air = jump kick),
//   jump Space, dodge / slip back L, pause P, start / continue Return.
window.C64_CONFIG = {
  title: "STRXXT",
  prg: "../games/strxxt/strxxt.prg", // swap a new build here (path relative to c64/index.html)
  joystickPort: 2,                   // VICE JoyDevice2 -> port 2 (1, 2 or 12 = both)
  autoType: "",                      // extra text typed after load; "" = core auto-runs the .prg
  // Action name -> key sent (used by touch buttons and the gamepad).
  keys: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
          punch: "KeyJ", kick: "KeyK", jump: "Space", dodge: "KeyL", pause: "KeyP", start: "Enter" },
  // Touch action buttons, in order (3 per row; wide = 2 columns).
  touch: [
    { label: "PUNCH", key: "punch" }, { label: "KICK", key: "kick" }, { label: "JUMP", key: "jump" },
    { label: "DODGE", key: "dodge" }, { label: "PAUSE", key: "pause" }, { label: "START", key: "start" }
  ],
  touchPad: "auto",                  // "auto" = only on touch screens, "on", "off"
  // Xbox 360 pad (browser "standard" layout), same as the desktop setup:
  // stick/d-pad move, A punch, B/RT kick, X/LT jump, Y/LB/RB dodge, Start pause, Back start/continue.
  gamepad: {
    enabled: true,
    deadzone: 0.5,                   // stick travel before a direction counts (0..1)
    stick: { x: 0, y: 1 },           // axis numbers of the left stick
    buttons: { 12: "up", 13: "down", 14: "left", 15: "right",
               0: "punch", 1: "kick", 7: "kick", 2: "jump", 6: "jump",
               3: "dodge", 4: "dodge", 5: "dodge", 9: "pause", 8: "start" }
  },
  // VICE defaults kept by the core: PAL C64, 6581 SID, standard palette.
  credit: "C64 emulation: chips by Andre Weissflog (zlib license)",
  source: "https://github.com/floooh/chips"
};
