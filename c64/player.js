// Readable loader: picks games/<game>.config.js (?game=strxxt), then boots the core.
(function () {
  var game = (new URLSearchParams(location.search).get("game") || "strxxt").replace(/[^a-z0-9-]/gi, "");
  var cfgTag = document.createElement("script");
  cfgTag.src = "games/" + game + ".config.js";
  cfgTag.onload = function () { boot(window.C64_CONFIG); };
  document.head.appendChild(cfgTag);

  function boot(cfg) {
    document.title = cfg.title + " - C64";
    var c = document.getElementById("credit");
    c.innerHTML = cfg.credit + ' - <a target="_blank" rel="noopener" href="' + cfg.source + '">source</a>';
    // The core reads its options from the page URL (file, joystick, input).
    var q = new URLSearchParams({ game: game, file: cfg.prg, joystick: "digital_" + cfg.joystickPort });
    if (cfg.autoType) q.set("input", cfg.autoType);
    history.replaceState(null, "", "?" + q.toString());
    var canvas = document.getElementById("canvas");
    window.Module = {
      canvas: canvas,
      locateFile: function (p) { return "core/" + p; },   // core files live in core/
      print: function () {}, printErr: function () {}
    };
    var core = document.createElement("script");
    core.src = "core/c64.js";
    document.body.appendChild(core);
    canvas.focus();
    setupPad(cfg);
    setupGamepad(cfg);
    document.getElementById("close").onclick = function () {
      closePlayer();
    };
  }

  var codes = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, KeyJ: 74, KeyK: 75 };
  function send(type, code) {
    var e = new KeyboardEvent(type, { code: code, key: code === "Space" ? " " : code.replace("Key", "").toLowerCase(), bubbles: true });
    Object.defineProperty(e, "keyCode", { get: function () { return codes[code]; } });
    Object.defineProperty(e, "which", { get: function () { return codes[code]; } });
    window.dispatchEvent(e);
  }
  function setupPad(cfg) {
    var touch = matchMedia("(pointer:coarse)").matches;
    var pad = document.getElementById("pad");
    if (cfg.touchPad === "on" || (cfg.touchPad === "auto" && touch)) pad.classList.add("on");
    pad.querySelectorAll("button").forEach(function (b) {
      var code = cfg.keys[b.dataset.k]; if (!code) { b.style.display = "none"; return; }
      b.addEventListener("pointerdown", function (ev) { ev.preventDefault(); send("keydown", code); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) {
        b.addEventListener(t, function () { send("keyup", code); });
      });
    });
  }
  // Close: tell the Games page overlay (same site only), or go back when opened directly.
  function closePlayer() {
    if (parent !== window) parent.postMessage("c64-close", location.origin); else history.back();
  }
  window.addEventListener("keydown", function (e) { if (e.key === "Escape") closePlayer(); }, true);

  // Gamepad: polls the pad and sends the same keys as the touch buttons.
  function setupGamepad(cfg) {
    var g = cfg.gamepad; if (!g || !g.enabled || !navigator.getGamepads) return;
    var held = {};                                   // key code -> currently down
    function poll() {
      var want = {};
      var pads = navigator.getGamepads();
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i]; if (!p) continue;
        var x = p.axes[g.stick.x] || 0, y = p.axes[g.stick.y] || 0;
        if (x < -g.deadzone) want[cfg.keys.left] = 1;
        if (x > g.deadzone) want[cfg.keys.right] = 1;
        if (y < -g.deadzone) want[cfg.keys.up] = 1;
        if (y > g.deadzone) want[cfg.keys.down] = 1;
        for (var b in g.buttons) if (p.buttons[b] && p.buttons[b].pressed) want[cfg.keys[g.buttons[b]]] = 1;
      }
      for (var k in want) if (!held[k]) { held[k] = 1; send("keydown", k); }
      for (var k2 in held) if (!want[k2]) { delete held[k2]; send("keyup", k2); }
      requestAnimationFrame(poll);
    }
    requestAnimationFrame(poll);
  }
  window.C64_send = send; // test hook
})();


