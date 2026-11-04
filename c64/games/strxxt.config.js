// STRXXT player settings. One file per game: copy this, rename, edit.
// Mirrors the desktop VICE 3.10 x64sc setup (vice.ini + strxxt-xbox360.vjm).
window.C64_CONFIG = {
  title: "STRXXT",
  prg: "../games/strxxt/strxxt.prg", // swap a new build here (path relative to c64/index.html)
  joystickPort: 2,                   // VICE JoyDevice2 -> port 2 (1, 2 or 12 = both)
  autoType: "",                      // extra text typed after load; "" = core auto-runs the .prg
  // Keys sent by touch buttons and the gamepad. STRXXT title: WASD/CRSR move, J punch, K kick, SPC jump.
  keys: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
          punch: "KeyJ", kick: "KeyK", jump: "Space" },
  touchPad: "auto",                  // "auto" = only on touch screens, "on", "off"
  // Xbox 360 pad (browser "standard" layout), same as strxxt-xbox360.vjm:
  // left stick + d-pad = directions, A = fire (Space). Extra: X = punch, Y = kick, B = jump.
  gamepad: {
    enabled: true,
    deadzone: 0.5,                   // stick travel before a direction counts (0..1)
    stick: { x: 0, y: 1 },           // axis numbers of the left stick
    buttons: { 12: "up", 13: "down", 14: "left", 15: "right", 0: "jump", 2: "punch", 3: "kick", 1: "jump" }
  },
  // VICE defaults kept by the core: PAL C64, 6581 SID, standard palette.
  credit: "C64 emulation: chips by Andre Weissflog (zlib license)",
  source: "https://github.com/floooh/chips"
};
