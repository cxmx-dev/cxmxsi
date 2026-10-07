'use strict';

/**
 * device-aware helper (global baseline):
 * phone | tablet | desktop + input-touch | input-fine
 * Prefer CSS media queries; set classes on <html> for CSS + JS.
 */
var DEVICE = DEVICE || {};

DEVICE.profile = {
    form: 'desktop',
    touch: false,
    fine: true
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
        hasTouchPoints = (navigator.maxTouchPoints || 0) > 0 ||
            ('ontouchstart' in window);
    } catch (e2) { /* ignore */ }

    // Touch UX when coarse pointer, or narrow screen with touch points.
    var touch = !!coarse || (hasTouchPoints && narrow);

    var form = 'desktop';
    if (touch) {
        if (narrow) {
            form = 'phone';
        } else if (mid || coarse) {
            form = 'tablet';
        } else {
            form = 'tablet';
        }
    } else if (narrow && !fine) {
        form = 'phone';
        touch = true;
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

    return DEVICE.profile;
};

DEVICE.isTouch = function () {
    return !!(DEVICE.profile && DEVICE.profile.touch);
};

DEVICE.form = function () {
    return (DEVICE.profile && DEVICE.profile.form) || 'desktop';
};
