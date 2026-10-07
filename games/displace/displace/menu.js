'use strict'

// MENU — main menu, pause overlay, options, HUD.
var MENU = MENU || {};

MENU.instance = (function()
{
    var BG = '#efebe3';
    var INK = '#1a1a1a';
    var _regions = [];
    var _hoverAction = null;
    var _lastPauseBounds = null;
    var _lastOptionsLayout = null;

    function _clearRegions()
    {
        _regions = [];
    }

    function _addRegion(x, y, w, h, action)
    {
        _regions.push({ x: x, y: y, w: w, h: h, action: action });
    }

    function _hit(mx, my)
    {
        for (var i = _regions.length - 1; i >= 0; i--) {
            var r = _regions[i];
            if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                return r.action;
            }
        }
        return null;
    }

    function _handleAction(action)
    {
        if (!action) { return; }
        switch (action) {
        case 'new_game': DISPLACE.instance.newGame(); break;
        case 'sandbox_game': DISPLACE.instance.sandboxGame(); break;
        case 'load_game': DISPLACE.instance.loadGame(); break;
        case 'options_main':
            DISPLACE.instance.openOptions(DISPLACE.GameState.MAIN_MENU);
            break;
        case 'options_pause':
            DISPLACE.instance.openOptions(DISPLACE.GameState.PAUSE_MENU);
            break;
        case 'resume': DISPLACE.instance.resume(); break;
        case 'save': DISPLACE.instance.saveGame(); break;
        case 'load': DISPLACE.instance.loadGame(); break;
        case 'main_menu': DISPLACE.instance.goMainMenu(); break;
        case 'quit': DISPLACE.instance.quit(); break;
        case 'toggle_fisheye':
            DISPLACE.instance.fisheye(!DISPLACE.instance.fisheye());
            break;
        case 'back': DISPLACE.instance.closeOptions(); break;
        case 'pause_hud': DISPLACE.instance.openPauseMenu(); break;
        case 'mute_hud':
            AUDIO.instance.toggleMute();
            try {
                localStorage.setItem('konstrukted-displacement-settings-v1', JSON.stringify({
                    fisheye: DISPLACE.instance.fisheye(),
                    muted: AUDIO.instance.muted()
                }));
            } catch (e) { /* ignore */ }
            break;
        }
    }

    function _drawTitle(ctx, w, h)
    {
        // Temporary storefront title — restore KONSTRUKTED / (displacement) later
        var titleSize = Math.max(36, w * 0.07);
        var titleY = h * 0.26;
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + titleSize + 'px Verdana, Arial, sans-serif';
        ctx.fillText('displace (for now)', w * 0.5, titleY);
    }

    function _drawList(ctx, w, items, startY, panelW)
    {
        var metrics = MENU_LAYOUT.listMetrics(w);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + metrics.fontSize + 'px Verdana, Arial, sans-serif';
        var measureText = function(label) { return ctx.measureText(label).width; };

        items.forEach(function(item, i) {
            var y = startY + i * metrics.lineH;
            if (_hoverAction === item.action) {
                var hi = MENU_LAYOUT.hoverHighlightRect(w, panelW, y, metrics.lineH);
                ctx.fillStyle = 'rgba(0,0,0,0.07)';
                ctx.fillRect(hi.x, hi.y, hi.w, hi.h);
            }
            ctx.fillStyle = INK;
            ctx.fillText(item.label, w * 0.5, y);
            var region = MENU_LAYOUT.pauseItemHitRegion(
                w, y, metrics.lineH, item.label, measureText);
            _addRegion(region.x, region.y, region.w, region.h, item.action);
        });
    }

    function _drawMainMenu(ctx, w, h)
    {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, w, h);
        _drawTitle(ctx, w, h);
        _drawList(ctx, w, [
            { label: 'NEW GAME', action: 'new_game' },
            { label: 'SANDBOX', action: 'sandbox_game' },
            { label: 'LOAD GAME', action: 'load_game' },
            { label: 'OPTIONS', action: 'options_main' },
            { label: 'QUIT', action: 'quit' }
        ], h * 0.48);
    }

    function _drawPauseMenu(ctx, w, h)
    {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, w, h);
        var bounds = MENU_LAYOUT.pausePanelBounds(w, h, TUNING.CURRENT.PAUSE_ITEM_COUNT);
        _lastPauseBounds = bounds;
        ctx.fillStyle = BG;
        ctx.fillRect(bounds.px, bounds.py, bounds.panelW, bounds.panelH);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(bounds.px, bounds.py, bounds.panelW, bounds.panelH);
        _drawList(ctx, w, [
            { label: 'RESUME', action: 'resume' },
            { label: 'OPTIONS', action: 'options_pause' },
            { label: 'SAVE', action: 'save' },
            { label: 'LOAD', action: 'load' },
            { label: 'MAIN MENU', action: 'main_menu' },
            { label: 'QUIT', action: 'quit' }
        ], bounds.listStartY, bounds.panelW);
    }

    function _optionsLayout(w, h, fromMain)
    {
        var panelW = Math.min(440, w * 0.52);
        var panelH = Math.max(220, h * 0.3);
        var px = (w - panelW) * 0.5;
        var py = fromMain ? h * 0.44 : (h - panelH) * 0.5;
        var labelY = py + 56;
        var toggleW = 128;
        var toggleH = 40;
        var toggleX = px + (panelW - toggleW) * 0.5;
        var toggleY = py + 96;
        var backY = py + panelH - 44;
        return {
            fromMain: fromMain,
            px: px,
            py: py,
            panelW: panelW,
            panelH: panelH,
            labelY: labelY,
            toggleX: toggleX,
            toggleY: toggleY,
            toggleW: toggleW,
            toggleH: toggleH,
            backY: backY
        };
    }

    function _drawFisheyeToggle(ctx, layout, on)
    {
        var tx = layout.toggleX;
        var ty = layout.toggleY;
        var tw = layout.toggleW;
        var th = layout.toggleH;
        var knob = th - 10;
        var knobY = ty + 5;
        var knobX = on ? tx + tw - knob - 5 : tx + 5;
        var hovered = _hoverAction === 'toggle_fisheye';

        if (hovered) {
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.fillRect(tx - 12, ty - 12, tw + 24, th + 24);
        }

        ctx.fillStyle = on ? INK : 'rgba(26,26,26,0.14)';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeRect(tx, ty, tw, th);

        ctx.fillStyle = on ? BG : INK;
        ctx.fillRect(knobX, knobY, knob, knob);

        ctx.font = 'bold 15px Verdana, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = on ? BG : INK;
        var statusX = on ? tx + (tw - knob) * 0.5 : tx + knob + (tw - knob) * 0.5;
        ctx.fillText(on ? 'ON' : 'OFF', statusX, ty + th * 0.5);

        _addRegion(tx - 12, ty - 12, tw + 24, th + 24, 'toggle_fisheye');
    }

    function _drawOptions(ctx, w, h)
    {
        var fromMain = DISPLACE.instance.optionsFrom() === DISPLACE.GameState.MAIN_MENU;
        var layout = _optionsLayout(w, h, fromMain);
        _lastOptionsLayout = layout;

        if (fromMain) {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, w, h);
            _drawTitle(ctx, w, h);
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, w, h);
        }

        ctx.fillStyle = BG;
        ctx.fillRect(layout.px, layout.py, layout.panelW, layout.panelH);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.px, layout.py, layout.panelW, layout.panelH);

        if (!fromMain) {
            ctx.fillStyle = INK;
            ctx.font = 'bold ' + Math.max(18, w * 0.024) + 'px Verdana, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('OPTIONS', w * 0.5, layout.py + 28);
        }

        ctx.fillStyle = INK;
        ctx.font = 'bold ' + Math.max(20, w * 0.026) + 'px Verdana, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FISHEYE LENS', w * 0.5, layout.labelY);

        _drawFisheyeToggle(ctx, layout, DISPLACE.instance.fisheye());

        ctx.font = 'bold ' + Math.max(18, w * 0.024) + 'px Verdana, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = INK;
        var backY = layout.backY;
        if (_hoverAction === 'back') {
            ctx.fillStyle = 'rgba(0,0,0,0.07)';
            ctx.fillRect(w * 0.5 - 72, backY - 20, 144, 40);
        }
        ctx.fillStyle = INK;
        ctx.fillText('BACK', w * 0.5, backY);
        _addRegion(w * 0.5 - 72, backY - 20, 144, 40, 'back');
    }

    function _drawHud(ctx, w, hudH)
    {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, w, hudH);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, hudH);
        ctx.lineTo(w, hudH);
        ctx.stroke();
        ctx.font = 'bold 14px Verdana, sans-serif';
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var half = w * 0.5;
        ctx.fillText('PAUSE', half * 0.5, hudH * 0.5);
        ctx.fillText(AUDIO.instance.muted() ? 'UNMUTE' : 'MUTE', half * 1.5, hudH * 0.5);
        _addRegion(0, 0, half, hudH, 'pause_hud');
        _addRegion(half, 0, half, hudH, 'mute_hud');
    }

    function _drawMessage(ctx, w, h, text)
    {
        if (!text) { return; }
        ctx.font = 'bold 15px Verdana, sans-serif';
        ctx.textAlign = 'center';
        var tw = ctx.measureText(text).width + 28;
        var mx = (w - tw) * 0.5;
        var my = h - 50;
        ctx.fillStyle = 'rgba(26,26,26,0.85)';
        ctx.fillRect(mx, my, tw, 32);
        ctx.fillStyle = BG;
        ctx.fillText(text, w * 0.5, my + 20);
    }

    function _draw(ctx, w, h, hudH)
    {
        _clearRegions();
        var state = DISPLACE.instance.state();

        if (state === DISPLACE.GameState.MAIN_MENU) {
            _drawMainMenu(ctx, w, h);
            return;
        }
        if (state === DISPLACE.GameState.OPTIONS) {
            _drawOptions(ctx, w, h);
            return;
        }
        if (state === DISPLACE.GameState.PAUSE_MENU) {
            _drawPauseMenu(ctx, w, h);
            return;
        }
        if (state === DISPLACE.GameState.PLAYING) {
            _drawHud(ctx, w, hudH);
        }
    }

    return {
        draw: _draw,
        drawMessage: _drawMessage,
        bgColor: function() { return BG; },
        lastPauseBounds: function() { return _lastPauseBounds; },
        lastOptionsLayout: function() { return _lastOptionsLayout; },
        onPointerMove: function(exy) {
            _hoverAction = _hit(exy.x(), exy.y());
        },
        onPointerDown: function(exy, w, h, hudH) {
            var action = _hit(exy.x(), exy.y());
            _hoverAction = action;
            if (action) {
                _handleAction(action);
                return true;
            }
            return DISPLACE.instance.state() !== DISPLACE.GameState.PLAYING ||
                exy.y() < hudH;
        },
        blocksGameInput: function() {
            var s = DISPLACE.instance.state();
            return s !== DISPLACE.GameState.PLAYING;
        }
    };
})();