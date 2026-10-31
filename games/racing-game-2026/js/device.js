/* RACING GAME 2026 device profile. Classic script so the class is set before CSS. */
(function (global) {
  var q = new URLSearchParams(global.location ? global.location.search : "");
  var forced = q.get("form");
  var listeners = [];

  function detect() {
    var coarse = global.matchMedia && global.matchMedia("(pointer: coarse)").matches;
    var noHover = global.matchMedia && global.matchMedia("(hover: none)").matches;
    var narrow = global.innerWidth <= 820;
    var form = "desktop";
    if (forced === "phone" || forced === "tablet" || forced === "desktop") form = forced;
    else if ((coarse || noHover) && narrow) form = "phone";
    else if (coarse || noHover) form = "tablet";
    else if (narrow) form = "phone";
    var touch = form !== "desktop" || coarse || noHover;
    if (forced === "desktop") touch = false;
    if (forced === "phone" || forced === "tablet") touch = true;
    return { form: form, touch: touch };
  }

  var profile = detect();

  function apply() {
    var root = document.documentElement;
    root.classList.remove("device-phone", "device-tablet", "device-desktop", "input-touch", "input-fine");
    root.classList.add("device-" + profile.form, profile.touch ? "input-touch" : "input-fine");
  }

  var api = {
    get form() {
      return profile.form;
    },
    get touch() {
      return profile.touch;
    },
    set touch(v) {
      profile.touch = !!v;
      if (profile.touch && profile.form === "desktop") profile.form = "tablet";
      apply();
      listeners.forEach(function (fn) {
        fn(api);
      });
    },
    apply: apply,
    onChange: function (fn) {
      listeners.push(fn);
    },
    refresh: function () {
      var next = detect();
      if (api.touch && next.form === "desktop") next.touch = true;
      if (next.form !== profile.form || next.touch !== profile.touch) {
        profile = next;
        apply();
        listeners.forEach(function (fn) {
          fn(api);
        });
      }
    },
  };

  apply();
  global.DeviceProfile = api;
  global.addEventListener("resize", function () {
    api.refresh();
  });
  if (global.visualViewport) {
    global.visualViewport.addEventListener("resize", function () {
      api.refresh();
    });
  }
  global.addEventListener(
    "touchstart",
    function () {
      if (!api.touch) api.touch = true;
    },
    { passive: true }
  );
})(window);
