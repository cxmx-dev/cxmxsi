(function () {
  var root = document.documentElement;
  var IMG_W = 1200;
  var IMG_H = 896;
  var RATIO = IMG_W / IMG_H;
  /* Fractions of the photo. The sheet is the search form. Keys are G and V. */
  var SHEET = { l: 0.29, t: 0.04, r: 0.635, b: 0.5 };
  var WITH_KEYS = { l: 0.29, t: 0.04, r: 0.635, b: 0.86 };

  function formFor(width, coarse) {
    if (coarse && width < 720) return "phone";
    if (coarse && width < 1100) return "tablet";
    return "desktop";
  }

  function apply() {
    var width = window.innerWidth;
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    var form = formFor(width, coarse);
    var input = coarse ? "touch" : "fine";
    root.classList.remove(
      "device-phone",
      "device-tablet",
      "device-desktop",
      "input-touch",
      "input-fine"
    );
    root.classList.add("device-" + form, "input-" + input);
    root.dataset.device = form;
    root.dataset.input = input;
    fitTypewriter();
  }

  function frameOf(view) {
    var vv = window.visualViewport;
    if (!vv) return;
    view.style.top = vv.offsetTop + "px";
    view.style.left = vv.offsetLeft + "px";
    view.style.width = vv.width + "px";
    view.style.height = vv.height + "px";
  }

  function insetsOf(view) {
    var probe = view.querySelector(".typewriter-inset");
    if (!probe) {
      probe = document.createElement("div");
      probe.className = "typewriter-inset";
      probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
      view.appendChild(probe);
    }
    var bottom = view.classList.contains("is-keys-clipped")
      ? "calc(56px + env(safe-area-inset-bottom, 0px))"
      : "calc(8px + env(safe-area-inset-bottom, 0px))";
    probe.style.width = "calc(10px + env(safe-area-inset-left, 0px))";
    probe.style.height = "calc(8px + env(safe-area-inset-top, 0px))";
    var left = probe.offsetWidth;
    var top = probe.offsetHeight;
    probe.style.width = "calc(10px + env(safe-area-inset-right, 0px))";
    probe.style.height = bottom;
    return { l: left, r: probe.offsetWidth, t: top, b: probe.offsetHeight };
  }

  function scaleFor(view, region) {
    var pad = insetsOf(view);
    var innerW = Math.max(1, view.clientWidth - pad.l - pad.r);
    var innerH = Math.max(1, view.clientHeight - pad.t - pad.b);
    var regionW = region.r - region.l;
    var regionH = region.b - region.t;
    return Math.min(innerW / regionW, (innerH * RATIO) / regionH);
  }

  function place(view, stage, sw, region) {
    var pad = insetsOf(view);
    var vw = view.clientWidth;
    var vh = view.clientHeight;
    var innerW = Math.max(1, vw - pad.l - pad.r);
    var innerH = Math.max(1, vh - pad.t - pad.b);
    var sh = sw / RATIO;
    var focusX = (region.l + region.r) / 2;
    var focusY = (region.t + region.b) / 2;
    var left = pad.l + innerW / 2 - focusX * sw;
    var top = pad.t + innerH / 2 - focusY * sh;
    if (sw >= vw) {
      var minLeft = vw - sw;
      if (left < minLeft || left > 0) {
        var regionLeft = left + region.l * sw;
        left = Math.min(0, Math.max(minLeft, left));
        if (regionLeft < pad.l) left += pad.l - regionLeft;
        if (left + region.r * sw > vw - pad.r) left -= (left + region.r * sw) - (vw - pad.r);
        left = Math.min(0, Math.max(minLeft, left));
      }
    } else {
      left = (vw - sw) / 2;
    }
    if (sh >= vh) {
      var minTop = vh - sh;
      if (top < minTop || top > 0) {
        var regionTop = top + region.t * sh;
        top = Math.min(0, Math.max(minTop, top));
        if (regionTop < pad.t) top += pad.t - regionTop;
        if (top + region.b * sh > vh - pad.b) top -= (top + region.b * sh) - (vh - pad.b);
        top = Math.min(0, Math.max(minTop, top));
      }
    } else {
      top = (vh - sh) / 2;
    }
    view.style.setProperty("--stage-width", sw + "px");
    view.style.setProperty("--stage-height", sh + "px");
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    stage.style.left = left + "px";
    stage.style.top = top + "px";
    stage.style.transform = "none";
    var fill = view.querySelector(".typewriter-fill");
    if (fill) {
      var covers = left <= 1 && top <= 1 &&
        left + sw >= vw - 1 && top + sh >= vh - 1;
      fill.hidden = covers;
    }
  }

  function unionRect(nodes, fallback) {
    var box = null;
    nodes.forEach(function (node) {
      if (!node) return;
      var r = node.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (!box) {
        box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        return;
      }
      box.left = Math.min(box.left, r.left);
      box.top = Math.min(box.top, r.top);
      box.right = Math.max(box.right, r.right);
      box.bottom = Math.max(box.bottom, r.bottom);
    });
    return box || fallback;
  }

  function inside(rect, bounds, slop) {
    return rect.left >= bounds.left - slop &&
      rect.top >= bounds.top - slop &&
      rect.right <= bounds.right + slop &&
      rect.bottom <= bounds.bottom + slop;
  }

  function fitTypewriter() {
    var stage = document.querySelector(".typewriter-stage");
    var view = document.querySelector(".typewriter-viewport");
    if (!stage || !view) return;

    frameOf(view);

    view.classList.remove("is-keys-clipped");
    var swKeys = scaleFor(view, WITH_KEYS);
    /* Keep G and V in frame when that crop still leaves the sheet readable. */
    var useKeys = swKeys * 0.010417 >= 10;
    layout(view, stage, useKeys);
  }

  function layout(view, stage, useKeys) {
    var region = useKeys ? WITH_KEYS : SHEET;
    view.classList.toggle("is-keys-clipped", !useKeys);
    var sw = scaleFor(view, region);
    var cover = Math.max(view.clientWidth, view.clientHeight * RATIO);
    if (cover > sw) sw = cover;
    place(view, stage, sw, region);

    var form = document.querySelector(".paper-search");
    var keyNodes = useKeys
      ? Array.prototype.slice.call(document.querySelectorAll(".typewriter-key"))
      : [];
    var guard = 0;
    while (form && guard < 6) {
      var limit = contentLimit(view);
      var box = unionRect([form].concat(keyNodes));
      if (!box || !limit) break;
      var overflowX = Math.max(0, limit.left - box.left) + Math.max(0, box.right - limit.right);
      var overflowY = Math.max(0, limit.top - box.top) + Math.max(0, box.bottom - limit.bottom);
      if (overflowX < 1 && overflowY < 1) break;
      var boxW = Math.max(1, box.right - box.left);
      var boxH = Math.max(1, box.bottom - box.top);
      var innerW = Math.max(1, limit.right - limit.left);
      var innerH = Math.max(1, limit.bottom - limit.top);
      sw *= Math.min(innerW / (boxW + overflowX), innerH / (boxH + overflowY), 0.96);
      place(view, stage, sw, region);
      guard += 1;
    }

    var limit = contentLimit(view);
    if (form && limit) {
      var fitted = unionRect([form].concat(keyNodes));
      if (fitted) {
        var dx = 0;
        var dy = 0;
        if (fitted.left < limit.left) dx = limit.left - fitted.left;
        else if (fitted.right > limit.right) dx = limit.right - fitted.right;
        if (fitted.top < limit.top) dy = limit.top - fitted.top;
        else if (fitted.bottom > limit.bottom) dy = limit.bottom - fitted.bottom;
        if (dx || dy) {
          stage.style.left = (parseFloat(stage.style.left) || 0) + dx + "px";
          stage.style.top = (parseFloat(stage.style.top) || 0) + dy + "px";
        }
      }
    }

    if (!useKeys) return;
    var g = document.querySelector(".typewriter-key--g");
    var v = document.querySelector(".typewriter-key--v");
    var keysIn = limit && g && v &&
      inside(g.getBoundingClientRect(), limit, 2) &&
      inside(v.getBoundingClientRect(), limit, 2);
    if (!keysIn) layout(view, stage, false);
  }

  function contentLimit(view) {
    var pad = insetsOf(view);
    var bounds = view.getBoundingClientRect();
    return {
      left: bounds.left + pad.l,
      top: bounds.top + pad.t,
      right: bounds.right - pad.r,
      bottom: bounds.bottom - pad.b
    };
  }

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply);
    window.visualViewport.addEventListener("scroll", apply);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fitTypewriter);
  } else {
    fitTypewriter();
  }

  window.DeviceProfile = { apply: apply, fit: fitTypewriter };
})();
