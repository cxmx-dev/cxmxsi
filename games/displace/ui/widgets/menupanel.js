'use strict'

// MENUPANEL — jam toolbar: play, reset, mute.
var MENUPANEL = MENUPANEL || {};

MENUPANEL.create = (function(x, y, w, h)
{
    var _x = x;
    var _y = y;
    var _w = w;
    var _h = h;
    var _btnW = w / 3;

    var _children = [
        BUTTON.create(x, y, _btnW, h,
            function() {
                DISPLACE.instance.paused(!DISPLACE.instance.paused());
            },
            function() {
                return DISPLACE.instance.paused() ? "play" : "pause";
            }),
        BUTTON.create(x + _btnW, y, _btnW, h,
            function() {
                DISPLACE.instance.reset();
            },
            function() { return "reset"; }),
        BUTTON.create(x + 2 * _btnW, y, _btnW, h,
            function() {
                AUDIO.instance.toggleMute();
            },
            function() {
                return AUDIO.instance.muted() ? "unmute" : "mute";
            })
    ];

    function __x(x) { if (x !== undefined) { _x = x; } return _x; }
    function __y(y) { if (y !== undefined) { _y = y; } return _y; }
    function __w(w) { if (w !== undefined) { _w = w; } return _w; }
    function __h(h) { if (h !== undefined) { _h = h; } return _h; }

    function _draw(ctx)
    {
        UTIL.drawBoundingRectangle(ctx, _x, _y, _w, _h);
        _children.forEach(function(child) {
            child.draw(ctx);
        });
    }

    function _signal(e, exy)
    {
        _children.forEach(function(child) {
            child.signal(e, exy);
        });
    }

    return {
        x: __x,
        y: __y,
        w: __w,
        h: __h,
        draw: _draw,
        signal: _signal
    };
});