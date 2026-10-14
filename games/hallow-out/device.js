'use strict';

/* Phone, tablet, and desktop classes for the arcade pages. */
var DEVICE = DEVICE || {};

DEVICE.profile = {
    form: 'desktop',
    touch: false,
    fine: true
};

DEVICE._listeners = [];

DEVICE.onChange = function (fn) {
    if (typeof fn === 'function') DEVICE._listeners.push(fn);
};

DEVICE.apply = function () {
    var coarse = false;
    var fine = true;
    var narrow = false;
    var mid = false;
    try {
        coarse = window.matchMedia('(pointer: coarse)').matches;
        fine = window.matchMedia('(pointer: fine)').matches;
        narrow = window.matchMedia('(max-width: 700px)').matches;
        mid = window.matchMedia('(min-width: 701px) and (max-width: 1100px)').matches;
    } catch (err) { /* ignore */ }

    var hasTouchPoints = false;
    try {
        hasTouchPoints = (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window);
    } catch (e2) { /* ignore */ }

    var touch = !!coarse || (hasTouchPoints && narrow);
    var form = 'desktop';
    if (touch) {
        form = narrow ? 'phone' : 'tablet';
    } else if (narrow && !fine) {
        form = 'phone';
        touch = true;
    } else if (mid && !fine) {
        form = 'tablet';
    }

    var html = document.documentElement;
    html.classList.remove(
        'device-phone', 'device-tablet', 'device-desktop',
        'input-touch', 'input-fine'
    );
    html.classList.add('device-' + form);
    html.classList.add(touch ? 'input-touch' : 'input-fine');

    DEVICE.profile = {
        form: form,
        touch: touch,
        fine: !!(fine && !coarse)
    };

    var chrome = document.getElementById('touch-chrome');
    if (chrome) {
        if (touch) {
            chrome.removeAttribute('hidden');
            chrome.setAttribute('aria-hidden', 'false');
        } else {
            chrome.setAttribute('hidden', '');
            chrome.setAttribute('aria-hidden', 'true');
        }
    }

    for (var i = 0; i < DEVICE._listeners.length; i++) DEVICE._listeners[i](DEVICE.profile);
    return DEVICE.profile;
};

DEVICE.isTouch = function () {
    return !!(DEVICE.profile && DEVICE.profile.touch);
};

DEVICE.fit = function (canvas, stage) {
    if (!canvas || !stage) return;
    var rect = stage.getBoundingClientRect();
    var sw = rect.width;
    var sh = rect.height;
    if (sw < 2 || sh < 2) return;
    var scale = Math.min(sw / canvas.width, sh / canvas.height);
    canvas.style.width = Math.floor(canvas.width * scale) + 'px';
    canvas.style.height = Math.floor(canvas.height * scale) + 'px';
};

DEVICE.bind = function () {
    DEVICE.apply();
    var refresh = function () { DEVICE.apply(); };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refresh);
    try {
        var mq = window.matchMedia('(pointer: coarse)');
        if (mq.addEventListener) mq.addEventListener('change', refresh);
        else if (mq.addListener) mq.addListener(refresh);
    } catch (err2) { /* ignore */ }
};
