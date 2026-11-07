/* Device profile for browser demos. Sets root classes before layout paints. */
(function () {
  function apply() {
    var w = window.innerWidth;
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var form = "desktop";
    if (w < 720 || (coarse && w < 900)) form = "phone";
    else if (w < 1100 || coarse) form = "tablet";
    var root = document.documentElement;
    root.classList.remove("device-phone", "device-tablet", "device-desktop", "input-touch", "input-fine");
    root.classList.add("device-" + form);
    root.classList.add(fine && !coarse ? "input-fine" : "input-touch");
    root.dataset.device = form;
    if (window.DeviceProfile && window.DeviceProfile.onChange) {
      window.DeviceProfile.onChange.forEach(function (fn) { fn(form); });
    }
  }

  window.DeviceProfile = {
    onChange: [],
    form: function () { return document.documentElement.dataset.device || "desktop"; },
    touch: function () { return document.documentElement.classList.contains("input-touch"); },
    fitCanvas: function (canvas) {
      var host = canvas.parentElement;
      var cssW = host.clientWidth;
      var cssH = host.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: cssW, h: cssH };
    }
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", apply);
})();
