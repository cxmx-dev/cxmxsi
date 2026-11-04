// HECX player settings (same layout as strxxt.config.js).
// HECX controls (title + in-game screens): FIRE/X rotate CW, SPACE/Z rotate CCW, WASD/JOY move,
// H hint, RETURN/FIRE start (in game Return also rotates CW, like FIRE).
window.C64_CONFIG = {
  title: "HECX",
  prg: "../games/hecx/hecx.prg",     // swap a new build here (path relative to c64/index.html)
  joystickPort: 2,                   // port 2, same as the desktop VICE setup
  autoType: "",                      // "" = core auto-runs the .prg
  // Action name -> key sent (touch buttons and gamepad).
  keys: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
          cw: "KeyX", ccw: "KeyZ", hint: "KeyH", start: "Enter" },
  // Touch action buttons (3 per row; wide = 2 columns).
  touch: [
    { label: "CW", key: "cw" }, { label: "CCW", key: "ccw" }, { label: "HINT", key: "hint" },
    { label: "START", key: "start", wide: true }
  ],
  touchPad: "auto",                  // "auto" = only on touch screens, "on", "off"
  // Xbox 360 pad: stick/d-pad move, A/X/RB = CW, B/Y/LB = CCW, Back = hint, Start = START.
  gamepad: {
    enabled: true,
    deadzone: 0.5,
    stick: { x: 0, y: 1 },
    buttons: { 12: "up", 13: "down", 14: "left", 15: "right",
               0: "cw", 2: "cw", 5: "cw", 1: "ccw", 3: "ccw", 4: "ccw", 8: "hint", 9: "start" }
  },
  credit: "C64 emulation: chips by Andre Weissflog (zlib license)",
  source: "https://github.com/floooh/chips"
};
