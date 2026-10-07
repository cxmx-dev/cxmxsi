'use strict'

// CONTROLS_LEGEND — sliding help panel (toggle with L key).
var CONTROLS_LEGEND = CONTROLS_LEGEND || {};

CONTROLS_LEGEND.instance = (function()
{
    var BG = '#efebe3';
    var INK = '#1a1a1a';
    var MUTED = '#525252';
    var RULE = 'rgba(26, 26, 26, 0.22)';
    var _open = false;
    var _slide = 0;
    var _scrollY = 0;

    var _sections = [
        {
            name: 'TOP BAR',
            items: [
                { icon: 'hud', title: 'PAUSE / MUTE',
                    text: 'Left-click the top strip.' }
            ]
        },
        {
            name: 'NODES',
            items: [
                { icon: 'connect', title: 'Connect',
                    text: 'Click a node, then a green target.' },
                { icon: 'drag', title: 'Move',
                    text: 'Hold left-click and drag (~5px).' },
                { icon: 'spawn', title: 'New node',
                    text: 'Double left-click a node; drag to place.' },
                { icon: 'lock', title: 'Lock / unlock / delete',
                    text: 'Right 1× lock (live or paused; after pick/drag) · 2× unlock · 3× delete.' },
                { icon: 'spawn', title: 'First node',
                    text: 'Click empty floor when nothing remains.' }
            ]
        },
        {
            name: 'LINES',
            items: [
                { icon: 'lineSelect', title: 'Select line',
                    text: 'Shift + left-click (turns blue).' },
                { icon: 'powerBar', title: 'Global power',
                    text: '0–9 apply to every line (+10%…+100%). Numpad 0 spawns walker.' },
                { icon: 'lineSelect', title: 'Line power tune',
                    text: 'M → TUNE mode · Shift+click a line · 0–9 for that line only.' },
                { icon: 'muscle', title: 'Muscle lines',
                    text: 'Shift+M toggles muscle mode for new connects (or selected line).' }
            ]
        },
        {
            name: 'KEYBOARD',
            grid: [
                { key: 'Spc', label: 'Pause creature' },
                { key: '[', label: 'Unlock all' },
                { key: ']', label: 'Lock all' },
                { key: 'M', label: 'Line power tune' },
                { key: 'Sh+M', label: 'Muscle mode' },
                { key: 'Num0', label: 'Spawn walker' },
                { key: 'WASD', label: 'Roam scene' },
                { key: '-', label: 'Clear all' },
                { key: '.', label: 'Locomotion HUD' },
                { key: 'L', label: 'This panel' },
                { key: 'Esc', label: 'Cancel / menu' }
            ]
        },
        {
            name: 'MODES',
            items: [
                { icon: 'walk', title: 'NEW GAME',
                    text: 'Bundled creature walks on its own.' },
                { icon: 'walk', title: 'SANDBOX',
                    text: 'Minimal walker — edit, extend, or replace.' }
            ]
        }
    ];

    function _layout(w, h, hudH)
    {
        return MENU_LAYOUT.controlsLegend(w, h, hudH);
    }

    function _panelX(layout, w)
    {
        return w - layout.w * _slide;
    }

    function _updateSlide()
    {
        var speed = TUNING.CURRENT.CONTROLS_LEGEND_SLIDE_SPEED;
        var target = _open ? 1 : 0;
        if (_slide < target) {
            _slide = Math.min(target, _slide + speed);
        } else if (_slide > target) {
            _slide = Math.max(target, _slide - speed);
        }
    }

    function _toggleVisible()
    {
        _open = !_open;
        if (_open) { _scrollY = 0; }
        return _open;
    }

    function _isVisible()
    {
        return _open;
    }

    function _isShown()
    {
        return _slide > 0.01;
    }

    function _hitPanel(layout, w, mx, my)
    {
        if (!_isShown()) { return false; }
        var px = _panelX(layout, w);
        return mx >= px && mx <= px + layout.w && my >= layout.y && my <= layout.y + layout.h;
    }

    function _wrapText(ctx, text, maxW, font)
    {
        ctx.font = font;
        var words = text.split(' ');
        var lines = [];
        var line = '';
        words.forEach(function(word) {
            var test = line ? line + ' ' + word : word;
            if (ctx.measureText(test).width > maxW && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        });
        if (line) { lines.push(line); }
        return lines;
    }

    function _itemRowHeight(ctx, item, layout, textW)
    {
        var bodyFont = '11px Verdana, Arial, sans-serif';
        var lines = _wrapText(ctx, item.text, textW, bodyFont);
        return Math.max(layout.icon, 16 + lines.length * 13) + layout.rowGap;
    }

    function _gridHeight(layout, grid)
    {
        var rows = 0;
        var span = 0;
        grid.forEach(function() {
            span += 1;
            if (span >= 2) {
                rows += 1;
                span = 0;
            }
        });
        if (span > 0) { rows += 1; }
        return rows * (layout.gridRowH + 4) + layout.rowGap;
    }

    function _contentHeight(ctx, layout, textW)
    {
        var h = 0;
        _sections.forEach(function(sec) {
            h += layout.sectionH;
            if (sec.items) {
                sec.items.forEach(function(item) {
                    h += _itemRowHeight(ctx, item, layout, textW);
                });
            }
            if (sec.grid) {
                h += _gridHeight(layout, sec.grid);
            }
        });
        return h;
    }

    function _drawHeaderAccent(ctx, px, y, w, headerH)
    {
        ctx.save();
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        var baseY = y + headerH - 6;
        var vanishX = px + w * 0.62;
        var i;
        for (i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(px + 10 + i * 7, y + 8);
            ctx.lineTo(vanishX, baseY);
            ctx.stroke();
        }
        ctx.restore();
    }

    var _chipFont = 'bold 10px Consolas, "Courier New", monospace';

    function _chipWidth(ctx, label)
    {
        ctx.font = _chipFont;
        var tw = ctx.measureText(label).width;
        return Math.max(28, Math.min(38, Math.ceil(tw) + 10));
    }

    function _drawKeyChip(ctx, x, y, label)
    {
        var chipW = _chipWidth(ctx, label);
        var chipH = 18;
        ctx.fillStyle = BG;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, chipW, chipH);
        ctx.strokeRect(x + 0.5, y + 0.5, chipW - 1, chipH - 1);
        ctx.fillStyle = INK;
        ctx.font = _chipFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + chipW * 0.5, y + chipH * 0.5);
        return chipW;
    }

    function _drawIcon(ctx, type, x, y, size, entry)
    {
        var cx = x + size * 0.5;
        var cy = y + size * 0.5;
        ctx.strokeStyle = INK;
        ctx.fillStyle = INK;
        ctx.lineWidth = 1.5;

        if (type === 'hud') {
            ctx.strokeRect(x + 3, y + 9, size - 6, 11);
            ctx.beginPath();
            ctx.moveTo(x + 6, y + 12);
            ctx.lineTo(x + size - 6, y + 12);
            ctx.stroke();
            return;
        }
        if (type === 'connect') {
            ctx.beginPath();
            ctx.arc(x + 11, cy, 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + size - 11, cy, 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(x + 11, cy);
            ctx.lineTo(x + size - 11, cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = INK;
            ctx.beginPath();
            ctx.arc(x + 11, cy, 2, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (type === 'drag') {
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 7, cy);
            ctx.lineTo(cx + 14, cy - 5);
            ctx.lineTo(cx + 14, cy + 5);
            ctx.closePath();
            ctx.fill();
            return;
        }
        if (type === 'spawn') {
            ctx.beginPath();
            ctx.arc(cx - 6, cy, 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + 8, cy + 1, 3, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (type === 'lock') {
            ctx.fillStyle = INK;
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = BG;
            ctx.fillRect(cx - 2, cy - 2, 4, 4);
            return;
        }
        if (type === 'lineSelect') {
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x + 6, y + size - 7);
            ctx.lineTo(x + size - 6, y + 7);
            ctx.stroke();
            return;
        }
        if (type === 'powerBar') {
            var bw = size - 8;
            var bx = x + 4;
            var by = cy - 3;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, 6);
            ctx.fillRect(bx + 1, by + 1, Math.floor(bw * 0.45), 4);
            return;
        }
        if (type === 'muscle') {
            ctx.beginPath();
            ctx.moveTo(x + 6, cy);
            ctx.lineTo(x + size - 6, cy);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - 4, cy, 2, 0, Math.PI * 2);
            ctx.arc(cx + 4, cy, 2, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (type === 'key') {
            _drawKeyChip(ctx, x + 4, y + 8, entry.key || '?');
            return;
        }
        if (type === 'walk') {
            ctx.beginPath();
            ctx.moveTo(x + 8, y + size - 6);
            ctx.lineTo(cx, y + 10);
            ctx.lineTo(x + size - 8, y + size - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, y + 10, 3, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
    }

    function _drawSectionHeader(ctx, px, y, layout, name)
    {
        ctx.fillStyle = INK;
        ctx.font = 'bold 9px Verdana, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(name, px + layout.pad, y + 2);
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + layout.pad, y + 14);
        ctx.lineTo(px + layout.w - layout.pad, y + 14);
        ctx.stroke();
        return y + layout.sectionH;
    }

    function _drawItemRow(ctx, px, y, layout, item, textX, textW, stripe)
    {
        if (stripe) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
            ctx.fillRect(px + layout.pad - 2, y - 2,
                layout.w - layout.pad * 2 + 4, _itemRowHeight(ctx, item, layout, textW) - layout.rowGap + 2);
        }

        _drawIcon(ctx, item.icon, px + layout.pad, y, layout.icon, item);

        ctx.fillStyle = INK;
        ctx.font = 'bold 11px Verdana, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(item.title, textX, y);

        var bodyFont = '11px Verdana, Arial, sans-serif';
        ctx.font = bodyFont;
        ctx.fillStyle = MUTED;
        var lines = _wrapText(ctx, item.text, textW, bodyFont);
        var lineY = y + 15;
        lines.forEach(function(ln) {
            ctx.fillText(ln, textX, lineY);
            lineY += 13;
        });

        return y + _itemRowHeight(ctx, item, layout, textW);
    }

    function _drawKeyGrid(ctx, px, y, layout, grid)
    {
        var colW = (layout.w - layout.pad * 2) * 0.5;
        var col = 0;
        var rowY = y;
        var cellX;
        var chipW;
        var labelX;

        grid.forEach(function(cell) {
            cellX = px + layout.pad + col * colW;
            chipW = _drawKeyChip(ctx, cellX, rowY + 4, cell.key);
            labelX = cellX + chipW + 6;
            ctx.fillStyle = INK;
            ctx.font = '11px Verdana, Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.label, labelX, rowY + 4 + 9);
            col += 1;
            if (col >= 2) {
                rowY += layout.gridRowH + 4;
                col = 0;
            }
        });
        if (col > 0) { rowY += layout.gridRowH + 4; }
        return rowY + layout.rowGap;
    }

    function _draw(ctx, w, h, hudH)
    {
        _updateSlide();
        if (!_isShown()) { return; }

        var layout = _layout(w, h, hudH);
        var px = _panelX(layout, w);
        var headerH = TUNING.CURRENT.CONTROLS_LEGEND_HEADER_H;
        var footerH = TUNING.CURRENT.CONTROLS_LEGEND_FOOTER_H;
        var bodyY = layout.y + headerH;
        var bodyH = layout.h - headerH - footerH;
        var textX = px + layout.pad + layout.icon + 10;
        var textW = layout.w - layout.pad * 2 - layout.icon - 12;
        var alpha = 0.96 * _slide;

        if (_slide > 0.12) {
            ctx.fillStyle = 'rgba(0,0,0,' + (0.28 * _slide) + ')';
            ctx.fillRect(0, layout.y, px, layout.h);
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = BG;
        ctx.fillRect(px, layout.y, layout.w, layout.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 0.5, layout.y + 0.5, layout.w - 1, layout.h - 1);

        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, layout.y);
        ctx.lineTo(px, layout.y + layout.h);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.restore();

        _drawHeaderAccent(ctx, px, layout.y, layout.w, headerH);

        ctx.fillStyle = INK;
        ctx.font = 'bold 14px Verdana, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('CONTROLS', px + layout.pad, layout.y + layout.pad);

        var closeChipW = _drawKeyChip(ctx, px + layout.w - layout.pad - 28, layout.y + layout.pad - 1, 'L');
        ctx.fillStyle = MUTED;
        ctx.font = '10px Verdana, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('close', px + layout.w - layout.pad - closeChipW - 8, layout.y + layout.pad + 4);

        ctx.beginPath();
        ctx.moveTo(px + layout.pad, bodyY - 4);
        ctx.lineTo(px + layout.w - layout.pad, bodyY - 4);
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        ctx.stroke();

        var contentH = _contentHeight(ctx, layout, textW);
        var maxScroll = Math.max(0, contentH - bodyH);
        if (_scrollY > maxScroll) { _scrollY = maxScroll; }

        ctx.save();
        ctx.beginPath();
        ctx.rect(px, bodyY, layout.w, bodyH);
        ctx.clip();

        var y = bodyY - _scrollY;
        var stripe = false;
        _sections.forEach(function(sec) {
            y = _drawSectionHeader(ctx, px, y, layout, sec.name);
            if (sec.items) {
                sec.items.forEach(function(item) {
                    y = _drawItemRow(ctx, px, y, layout, item, textX, textW, stripe);
                    stripe = !stripe;
                });
            }
            if (sec.grid) {
                y = _drawKeyGrid(ctx, px, y, layout, sec.grid);
            }
        });
        ctx.restore();

        if (maxScroll > 4) {
            var trackX = px + layout.w - 5;
            var trackY = bodyY + 4;
            var trackH = bodyH - 8;
            var thumbH = Math.max(24, trackH * (bodyH / contentH));
            var thumbY = trackY + (trackH - thumbH) * (_scrollY / maxScroll);
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(trackX, trackY, 3, trackH);
            ctx.fillStyle = 'rgba(26,26,26,0.35)';
            ctx.fillRect(trackX, thumbY, 3, thumbH);
        }

        ctx.fillStyle = MUTED;
        ctx.font = '9px Verdana, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var footerText = maxScroll > 4 ? 'scroll · L to close' : 'L to close';
        ctx.fillText(footerText, px + layout.w * 0.5, layout.y + layout.h - footerH * 0.5);
    }

    function _handlePointer(e, exy, w, h, hudH)
    {
        if (!_isShown()) { return false; }
        var layout = _layout(w, h, hudH);
        if (_hitPanel(layout, w, exy.x(), exy.y())) {
            return e.type === 'mousedown';
        }
        return false;
    }

    function _handleWheel(deltaY)
    {
        if (!_isShown()) { return false; }
        _scrollY += deltaY * 0.35;
        if (_scrollY < 0) { _scrollY = 0; }
        return true;
    }

    return {
        toggleVisible: _toggleVisible,
        isVisible: _isVisible,
        isShown: _isShown,
        draw: _draw,
        handlePointer: _handlePointer,
        handleWheel: _handleWheel
    };
})();