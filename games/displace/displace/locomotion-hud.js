'use strict'

// LOCOMOTION_HUD — wave / stiffness sliders (toggle with . key).
var LOCOMOTION_HUD = LOCOMOTION_HUD || {};

LOCOMOTION_HUD.instance = (function()
{
    var BG = '#efebe3';
    var INK = '#1a1a1a';
    var _visible = false;
    var _dragId = null;

    var _sliders = [
        { id: 'waveAmplitude', label: 'PULSE', min: 0, max: 0.5,
            read: function() { return MODEL.instance.waveAmplitude(); },
            write: function(v) { MODEL.instance.waveAmplitude(v); } },
        { id: 'waveSpeed', label: 'PACE', min: 0.02, max: 0.14,
            read: function() { return MODEL.instance.waveSpeed(); },
            write: function(v) { MODEL.instance.waveSpeed(v); } },
        { id: 'k', label: 'STIFF', min: 2, max: 12,
            read: function() { return MODEL.instance.k(); },
            write: function(v) { MODEL.instance.k(v); } }
    ];

    function _layout(w, h, hudH)
    {
        return MENU_LAYOUT.locomotionHud(w, h, hudH);
    }

    function _norm(slider, value)
    {
        return (value - slider.min) / (slider.max - slider.min);
    }

    function _denorm(slider, t)
    {
        return slider.min + t * (slider.max - slider.min);
    }

    function _sliderTrack(layout, index)
    {
        var rowH = layout.rowH;
        var y = layout.y + layout.pad + index * rowH;
        return {
            id: _sliders[index].id,
            x: layout.x + layout.labelW,
            y: y + rowH * 0.35,
            w: layout.w - layout.labelW - layout.pad,
            h: layout.trackH,
            index: index
        };
    }

    function _valueFromX(track, slider, mx)
    {
        var t = (mx - track.x) / Math.max(1, track.w);
        if (t < 0) { t = 0; }
        if (t > 1) { t = 1; }
        return _denorm(slider, t);
    }

    function _toggleVisible()
    {
        _visible = !_visible;
        _dragId = null;
        return _visible;
    }

    function _isVisible()
    {
        return _visible;
    }

    function _hitPanel(layout, mx, my)
    {
        return mx >= layout.x && mx <= layout.x + layout.w &&
            my >= layout.y && my <= layout.y + layout.h;
    }

    function _draw(ctx, w, h, hudH)
    {
        if (!_visible) { return; }
        var layout = _layout(w, h, hudH);
        ctx.fillStyle = BG;
        ctx.fillRect(layout.x, layout.y, layout.w, layout.h);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.strokeRect(layout.x + 0.5, layout.y + 0.5, layout.w - 1, layout.h - 1);

        ctx.fillStyle = INK;
        ctx.font = 'bold 11px Verdana, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('LOCOMOTION  (.)', layout.x + layout.pad, layout.y + layout.pad * 0.85);

        _sliders.forEach(function(slider, i) {
            var track = _sliderTrack(layout, i);
            var rowY = layout.y + layout.pad + i * layout.rowH + layout.rowH * 0.55;
            ctx.fillText(slider.label, layout.x + layout.pad, rowY);
            ctx.fillStyle = '#d8d2c8';
            ctx.fillRect(track.x, track.y, track.w, track.h);
            var t = _norm(slider, slider.read());
            var knobX = track.x + t * track.w;
            ctx.fillStyle = INK;
            ctx.fillRect(knobX - 3, track.y - 2, 6, track.h + 4);
        });
    }

    function _handlePointer(e, exy, w, h, hudH)
    {
        if (!_visible && e.type !== 'mousedown') { return false; }
        var layout = _layout(w, h, hudH);
        var mx = exy.x();
        var my = exy.y();

        if (e.type === 'mousedown' && e.button === 0) {
            if (!_hitPanel(layout, mx, my)) { return false; }
            for (var i = 0; i < _sliders.length; i++) {
                var track = _sliderTrack(layout, i);
                if (mx >= track.x && mx <= track.x + track.w &&
                    my >= track.y - 6 && my <= track.y + track.h + 6) {
                    _dragId = track.id;
                    _sliders[i].write(_valueFromX(track, _sliders[i], mx));
                    return true;
                }
            }
            return _hitPanel(layout, mx, my);
        }

        if (e.type === 'mousemove' && _dragId) {
            for (var j = 0; j < _sliders.length; j++) {
                if (_sliders[j].id === _dragId) {
                    var t2 = _sliderTrack(layout, j);
                    _sliders[j].write(_valueFromX(t2, _sliders[j], mx));
                    return true;
                }
            }
        }

        if (e.type === 'mouseup' && _dragId) {
            _dragId = null;
            return true;
        }

        return false;
    }

    function _blocksGameInput()
    {
        return _visible && _dragId !== null;
    }

    return {
        toggleVisible: _toggleVisible,
        isVisible: _isVisible,
        draw: _draw,
        handlePointer: _handlePointer,
        blocksGameInput: _blocksGameInput
    };
})();