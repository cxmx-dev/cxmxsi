'use strict'

// SCENE — minimal 3D horizon + creature placement on the floor.
var SCENE = SCENE || {};

SCENE.instance = (function()
{
    var _hudH = 36;

    function _floorReservePx()
    {
        return TUNING.CURRENT.PLAY_FLOOR_RESERVE_PX;
    }

    function _initialize()
    {
        /* no image assets — procedural frame only */
    }

    function _depthScale()
    {
        if (SCENE_CAMERA.instance.hallDepthScale) {
            return SCENE_CAMERA.instance.hallDepthScale();
        }
        var zFar = TUNING.CURRENT.ORBIT_HALL_Z_FAR;
        return (TUNING.CURRENT.ORBIT_CAM_BASE + zFar) / TUNING.CURRENT.ORBIT_FOCAL;
    }

    // Never-ending horizon: full ring around the player in world XZ.
    // Finite segment used to vanish when yawing; ring stays in view any look direction.
    function _drawHorizon(ctx, x, y, w, h, pivotY)
    {
        var zFar = TUNING.CURRENT.ORBIT_HALL_Z_FAR;
        var vpY = y + h * TUNING.CURRENT.ORBIT_FRAME_VP_V;
        var depthScale = _depthScale();
        var horizonWy = (pivotY - vpY) * depthScale;
        var radius = zFar * (TUNING.CURRENT.WORLD_HORIZON_RADIUS ||
            TUNING.CURRENT.WORLD_HORIZON_EXTEND || 1.85);
        var segs = TUNING.CURRENT.HORIZON_RING_SEGMENTS || 96;
        var ink = TUNING.CURRENT.WIRE_INK || '#1a1a1a';
        var project = SCENE_CAMERA.instance.projectWorld;
        var rawDepth = SCENE_CAMERA.instance.rawWorldDepth;
        var minFront = TUNING.CURRENT.ORBIT_DEPTH_MIN || 80;
        var ppm = _pixelsPerMeterForPanel(w);
        var cx = MODEL.instance.worldX ? MODEL.instance.worldX() * ppm : 0;
        var cz = MODEL.instance.worldZ ? MODEL.instance.worldZ() * ppm : 0;

        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';

        if (!project) {
            var ext = w * (TUNING.CURRENT.FRAME_LINE_EXTEND_FACTOR || 1.5);
            ctx.beginPath();
            ctx.moveTo(x - ext, vpY);
            ctx.lineTo(x + w + ext, vpY);
            ctx.stroke();
            return;
        }

        var i;
        var a0;
        var a1;
        var wx0;
        var wz0;
        var wx1;
        var wz1;
        var d0;
        var d1;
        var p0;
        var p1;
        var twoPi = Math.PI * 2;
        for (i = 0; i < segs; i++) {
            a0 = (i / segs) * twoPi;
            a1 = ((i + 1) / segs) * twoPi;
            wx0 = cx + Math.sin(a0) * radius;
            wz0 = cz - Math.cos(a0) * radius;
            wx1 = cx + Math.sin(a1) * radius;
            wz1 = cz - Math.cos(a1) * radius;
            if (rawDepth) {
                d0 = rawDepth(wx0, horizonWy, wz0);
                d1 = rawDepth(wx1, horizonWy, wz1);
                if (d0 < minFront || d1 < minFront) {
                    continue;
                }
            }
            p0 = project(wx0, horizonWy, wz0);
            p1 = project(wx1, horizonWy, wz1);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
    }

    function _drawBackground(ctx, x, y, w, h, pivotX, pivotY)
    {
        _drawHorizon(ctx, x, y, w, h, pivotY);
    }

    function _creatureOffsetX(panelX)
    {
        return panelX;
    }

    function _creatureFloorOffset()
    {
        return _floorReservePx();
    }

    function _pixelsPerMeterForPanel(panelW)
    {
        var modelW = MODEL.instance.width();
        if (modelW <= 0) { return TUNING.CURRENT.PIXELS_PER_METER; }
        return panelW / modelW;
    }

    function _playHeight(panelH)
    {
        return Math.max(1, panelH - _floorReservePx());
    }

    function __pixelsPerMeter(v)
    {
        if (v !== undefined) { /* legacy setter ignored — scale is panel-derived */ }
        return TUNING.CURRENT.PIXELS_PER_METER;
    }

    function __hudH(v)
    {
        if (v !== undefined) { _hudH = v; }
        return _hudH;
    }

    function _massToPanelPixels(mass, panelX, panelY, panelW, panelH)
    {
        var ppm = _pixelsPerMeterForPanel(panelW);
        return {
            x: _creatureOffsetX(panelX) + mass.s.x() * ppm,
            y: panelY + panelH - _floorReservePx() - mass.s.y() * ppm
        };
    }

    function _creatureCentroidMetersX()
    {
        var masses = MODEL.instance.masses;
        var i;
        var sum = 0;
        if (!masses || masses.length === 0) {
            return MODEL.instance.width() * 0.5;
        }
        for (i = 0; i < masses.length; i++) {
            sum += masses[i].s.x();
        }
        return sum / masses.length;
    }

    function _massWorldWz(mass, centroidMx, ppm)
    {
        var base = MODEL.instance.worldZ() * ppm;
        var half = TUNING.CURRENT.CREATURE_Z_EXTRUDE_M * 0.5 * ppm;
        var modelHalfW = MODEL.instance.width() * 0.5;
        var norm = 0;
        if (modelHalfW > 0.001) {
            norm = (mass.s.x() - centroidMx) / modelHalfW;
            if (norm < -1) { norm = -1; }
            if (norm > 1) { norm = 1; }
        }
        return base + norm * half + mass.sz() * ppm;
    }

    function _panelToScreenPixels(px, py, panelX, panelY, panelW, panelH, wz)
    {
        var ppm = _pixelsPerMeterForPanel(panelW);
        var pivotX = panelX + panelW * 0.5;
        var pivotY = panelY + panelH * TUNING.CURRENT.ORBIT_FRAME_VP_V;
        if (SCENE_CAMERA.instance.setPivot) {
            SCENE_CAMERA.instance.setPivot(pivotX, pivotY);
        }
        var wxOff = MODEL.instance.worldX() * ppm;
        if (wz === undefined) { wz = MODEL.instance.worldZ() * ppm; }
        if (SCENE_CAMERA.instance.projectWorld) {
            var proj = SCENE_CAMERA.instance.projectWorld(
                px - pivotX + wxOff, pivotY - py, wz);
            return { x: proj.x, y: proj.y };
        }
        return { x: px, y: py };
    }

    function _massToScreenPixels(mass, panelX, panelY, panelW, panelH)
    {
        var ppm = _pixelsPerMeterForPanel(panelW);
        var p = _massToPanelPixels(mass, panelX, panelY, panelW, panelH);
        var centroidMx = _creatureCentroidMetersX();
        var wz = _massWorldWz(mass, centroidMx, ppm);
        return _panelToScreenPixels(p.x, p.y, panelX, panelY, panelW, panelH, wz);
    }

    return {
        initialize: _initialize,
        drawBackground: _drawBackground,
        creatureOffsetX: _creatureOffsetX,
        creatureFloorOffset: _creatureFloorOffset,
        pixelsPerMeterForPanel: _pixelsPerMeterForPanel,
        massToPanelPixels: _massToPanelPixels,
        massToScreenPixels: _massToScreenPixels,
        panelToScreenPixels: _panelToScreenPixels,
        playHeight: _playHeight,
        floorReservePx: _floorReservePx,
        pixelsPerMeter: __pixelsPerMeter,
        hudH: __hudH
    };
})();