// HECX player settings (same layout as strxxt.config.js).
// HECX controls (in-game screen): FIRE/X rotate CW, SPACE/Z rotate CCW, WASD/JOY move, H hint, RETURN/FIRE start.
window.C64_CONFIG = {
  title: "HECX",
  prg: "../games/hecx/hecx.prg",     // swap a new build here (path relative to c64/index.html)
  joystickPort: 2,                   // port 2, same as the desktop VICE setup
  autoType: "",                      // "" = core auto-runs the .prg
  // Keys sent by touch buttons and the gamepad. Pad slots: punch/kick/jump = CW/CCW/START.
  keys: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
          punch: "KeyX", kick: "KeyZ", jump: "Enter" },
  labels: { punch: "CW", kick: "CCW", jump: "START" },   // touch button text
  touchPad: "auto",                  // "auto" = only on touch screens, "on", "off"
  // Xbox 360 pad: stick + d-pad move, A = CW, B = CCW, X = CW, Y = CCW, Start = START.
  gamepad: {
    enabled: true,
    deadzone: 0.5,
    stick: { x: 0, y: 1 },
    buttons: { 12: "up", 13: "down", 14: "left", 15: "right", 0: "punch", 1: "kick", 2: "punch", 3: "kick", 9: "jump" }
  },
  credit: "C64 emulation: chips by Andre Weissflog (zlib license)",
  source: "https://github.com/floooh/chips"
};
// Touch button labels for this game (the page loads this file after the buttons exist).
Object.keys(window.C64_CONFIG.labels).forEach(function (k) {
  var b = document.querySelector('#pad [data-k="' + k + '"]'); if (b) b.textContent = window.C64_CONFIG.labels[k];
});
