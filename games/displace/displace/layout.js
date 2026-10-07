'use strict'

// MENU_LAYOUT — pure pause/list layout math (no canvas I/O).
var MENU_LAYOUT = MENU_LAYOUT || {};

MENU_LAYOUT.PAUSE_LABELS = [
    'RESUME', 'OPTIONS', 'SAVE', 'LOAD', 'MAIN MENU', 'QUIT'
];

MENU_LAYOUT.listMetrics = function(w)
{
    var fontSize = Math.max(20, w * 0.028);
    var lineH = fontSize * 1.85;
    return { fontSize: fontSize, lineH: lineH };
};

MENU_LAYOUT.pausePanelBounds = function(w, h, itemCount, topPad, bottomPad)
{
    itemCount = itemCount || TUNING.CURRENT.PAUSE_ITEM_COUNT;
    topPad = topPad || TUNING.CURRENT.PAUSE_TOP_PAD;
    bottomPad = bottomPad || TUNING.CURRENT.PAUSE_BOTTOM_PAD;
    var metrics = MENU_LAYOUT.listMetrics(w);
    var panelW = Math.min(400, w * 0.5);
    var panelH = topPad + itemCount * metrics.lineH + bottomPad;
    var px = (w - panelW) * 0.5;
    var py = (h - panelH) * 0.5;
    var listStartY = py + topPad;
    return {
        px: px,
        py: py,
        panelW: panelW,
        panelH: panelH,
        listStartY: listStartY,
        lineH: metrics.lineH,
        fontSize: metrics.fontSize
    };
};

MENU_LAYOUT.panelRect = function(bounds)
{
    return {
        x: bounds.px,
        y: bounds.py,
        w: bounds.panelW,
        h: bounds.panelH
    };
};

MENU_LAYOUT.rectInsideRect = function(inner, outer)
{
    return inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.w <= outer.x + outer.w &&
        inner.y + inner.h <= outer.y + outer.h;
};

MENU_LAYOUT.hoverHighlightRect = function(w, panelW, centerY, lineH)
{
    var highlightW = panelW ? panelW * 0.92 : w * 0.36;
    return {
        x: w * 0.5 - highlightW * 0.5,
        y: centerY - lineH * 0.42,
        w: highlightW,
        h: lineH * 0.84
    };
};

MENU_LAYOUT.pauseItemHitRegion = function(w, centerY, lineH, label, measureText)
{
    var tw = measureText(label);
    return {
        label: label,
        x: w * 0.5 - tw * 0.5 - 14,
        y: centerY - lineH * 0.45,
        w: tw + 28,
        h: lineH * 0.9
    };
};

MENU_LAYOUT.pauseItemLayout = function(w, h, measureText, itemCount, topPad, bottomPad)
{
    var bounds = MENU_LAYOUT.pausePanelBounds(w, h, itemCount, topPad, bottomPad);
    var labels = MENU_LAYOUT.PAUSE_LABELS.slice(0, itemCount || TUNING.CURRENT.PAUSE_ITEM_COUNT);
    var regions = [];
    var highlights = [];
    labels.forEach(function(label, i) {
        var centerY = bounds.listStartY + i * bounds.lineH;
        regions.push(MENU_LAYOUT.pauseItemHitRegion(
            w, centerY, bounds.lineH, label, measureText));
        highlights.push(MENU_LAYOUT.hoverHighlightRect(
            w, bounds.panelW, centerY, bounds.lineH));
    });
    return {
        panel: bounds,
        panelRect: MENU_LAYOUT.panelRect(bounds),
        regions: regions,
        highlights: highlights
    };
};

MENU_LAYOUT.allPauseItemsInsidePanel = function(w, h, measureText, itemCount, topPad, bottomPad)
{
    var layout = MENU_LAYOUT.pauseItemLayout(
        w, h, measureText, itemCount, topPad, bottomPad);
    var outer = layout.panelRect;
    for (var i = 0; i < layout.regions.length; i++) {
        if (!MENU_LAYOUT.rectInsideRect(layout.regions[i], outer)) {
            return false;
        }
        if (!MENU_LAYOUT.rectInsideRect(layout.highlights[i], outer)) {
            return false;
        }
    }
    return true;
};

MENU_LAYOUT.locomotionHud = function(w, h, hudH)
{
    var pad = TUNING.CURRENT.LOCOMOTION_HUD_PAD;
    var rowH = TUNING.CURRENT.LOCOMOTION_HUD_ROW_H;
    var panelW = TUNING.CURRENT.LOCOMOTION_HUD_W;
    var panelH = TUNING.CURRENT.LOCOMOTION_HUD_H;
    var margin = TUNING.CURRENT.LOCOMOTION_HUD_MARGIN;
    return {
        x: w - panelW - margin,
        y: hudH + margin,
        w: panelW,
        h: panelH,
        pad: pad,
        rowH: rowH,
        labelW: TUNING.CURRENT.LOCOMOTION_HUD_LABEL_W,
        trackH: TUNING.CURRENT.LOCOMOTION_HUD_TRACK_H
    };
};

MENU_LAYOUT.controlsLegend = function(w, h, hudH)
{
    var panelW = Math.min(TUNING.CURRENT.CONTROLS_LEGEND_W, w * 0.38);
    var margin = TUNING.CURRENT.CONTROLS_LEGEND_MARGIN;
    return {
        w: panelW,
        h: h - hudH - margin * 2,
        y: hudH + margin,
        pad: TUNING.CURRENT.CONTROLS_LEGEND_PAD,
        icon: TUNING.CURRENT.CONTROLS_LEGEND_ICON,
        rowGap: TUNING.CURRENT.CONTROLS_LEGEND_ROW_GAP,
        sectionH: TUNING.CURRENT.CONTROLS_LEGEND_SECTION_H,
        gridRowH: TUNING.CURRENT.CONTROLS_LEGEND_GRID_ROW_H,
        dockX: w - panelW
    };
};

MENU_LAYOUT.springPowerBar = function(panelX, panelY, panelW, panelH)
{
    var segments = TUNING.CURRENT.SPRING_POWER_BAR_SEGMENTS;
    var barH = TUNING.CURRENT.SPRING_POWER_BAR_H;
    var barW = panelW * TUNING.CURRENT.SPRING_POWER_BAR_W_FACTOR;
    var barX = panelX + (panelW - barW) * 0.5;
    var barY = panelY + panelH - barH - TUNING.CURRENT.SPRING_POWER_BAR_BOTTOM_PAD;
    return {
        x: barX,
        y: barY,
        w: barW,
        h: barH,
        segW: barW / segments,
        segments: segments
    };
};

// Classic pause bars — bottom-left of play canvas (screen space, after PostFX).
MENU_LAYOUT.creaturePauseIcon = function(canvasW, canvasH)
{
    var size = TUNING.CURRENT.CREATURE_PAUSE_ICON_SIZE || 22;
    var margin = TUNING.CURRENT.CREATURE_PAUSE_ICON_MARGIN || 14;
    return {
        x: margin,
        y: canvasH - margin - size,
        size: size
    };
};