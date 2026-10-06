(function () {
  var root = document.documentElement;

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
  }

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply);
  }

  window.DeviceProfile = { apply: apply };
})();
