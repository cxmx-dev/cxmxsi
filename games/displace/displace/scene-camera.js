'use strict'

// SCENE_CAMERA — 3D perspective orbit around creature pivot (walk-around camera).
var SCENE_CAMERA = SCENE_CAMERA || {};

SCENE_CAMERA.instance = (function()
{
    var _azimuth = 0;
    var _elevation = TUNING.CURRENT.ORBIT_DEFAULT_ELEVATION;
    var _zoom = 1.0;
    var _pivotX = 0;
    var _pivotY = 0;
    var _orbiting = false;
    var _lastX = 0;
    var _lastY = 0;
    var _pickPlaneWz = 0;

    function _bgFill()
    {
        return TUNING.CURRENT.SCENE_BG;
    }

    function _fillPanelBg(ctx, x, y, w, h)
    {
        ctx.fillStyle = _bgFill();
        ctx.fillRect(x, y, w, h);
    }

    function _focal()
    {
        return TUNING.CURRENT.ORBIT_FOCAL;
    }

    function _camDistance()
    {
        return TUNING.CURRENT.ORBIT_CAM_BASE / Math.max(0.15, _zoom);
    }

    function _clampState()
    {
        if (_elevation < TUNING.CURRENT.ORBIT_ELEVATION_MIN) {
            _elevation = TUNING.CURRENT.ORBIT_ELEVATION_MIN;
        }
        if (_elevation > TUNING.CURRENT.ORBIT_ELEVATION_MAX) {
            _elevation = TUNING.CURRENT.ORBIT_ELEVATION_MAX;
        }
        if (_zoom < TUNING.CURRENT.ZOOM_MIN) { _zoom = TUNING.CURRENT.ZOOM_MIN; }
        if (_zoom > TUNING.CURRENT.ZOOM_MAX) { _zoom = TUNING.CURRENT.ZOOM_MAX; }
    }

    function _cameraActive()
    {
        return true;
    }

    function _setPickPlaneWz(wz)
    {
        _pickPlaneWz = wz || 0;
    }

    function _setPivot(x, y)
    {
        _pivotX = x;
        _pivotY = y;
    }

    function _getPivot()
    {
        return { x: _pivotX, y: _pivotY };
    }

    function _hallDepthScale()
    {
        return (_camDistance() + TUNING.CURRENT.ORBIT_HALL_Z_FAR) / _focal();
    }

    // Shared camera frame for project + unproject (lookAt origin from spherical orbit).
    function _cameraFrame()
    {
        var cd = _camDistance();
        var cosA = Math.cos(_azimuth);
        var sinA = Math.sin(_azimuth);
        var cosE = Math.cos(_elevation);
        var sinE = Math.sin(_elevation);
        var camX = cd * cosE * sinA;
        var camY = cd * sinE;
        var camZ = cd * cosE * cosA;
        var fx = -camX;
        var fy = -camY;
        var fz = -camZ;
        var fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
        fx /= fLen;
        fy /= fLen;
        fz /= fLen;
        var rx = fy * 0 - fz * 1;
        var ry = fz * 0 - fx * 0;
        var rz = fx * 1 - fy * 0;
        var rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rLen < 0.0001) {
            rx = 1;
            ry = 0;
            rz = 0;
            rLen = 1;
        }
        rx /= rLen;
        ry /= rLen;
        rz /= rLen;
        var ux = ry * fz - rz * fy;
        var uy = rz * fx - rx * fz;
        var uz = rx * fy - ry * fx;
        return {
            camX: camX, camY: camY, camZ: camZ,
            fx: fx, fy: fy, fz: fz,
            rx: rx, ry: ry, rz: rz,
            ux: ux, uy: uy, uz: uz,
            focal: _focal()
        };
    }

    function _projectLocal(wx, wy, wz)
    {
        var c = _cameraFrame();
        var vx = wx - c.camX;
        var vy = wy - c.camY;
        var vz = wz - c.camZ;
        var depth = vx * c.fx + vy * c.fy + vz * c.fz;
        var safeDepth = depth;
        if (safeDepth < TUNING.CURRENT.ORBIT_DEPTH_MIN) {
            safeDepth = TUNING.CURRENT.ORBIT_DEPTH_MIN;
        }
        var inv = c.focal / safeDepth;
        return {
            sx: (vx * c.rx + vy * c.ry + vz * c.rz) * inv,
            sy: (vx * c.ux + vy * c.uy + vz * c.uz) * inv,
            depth: safeDepth,
            rawDepth: depth
        };
    }

    function _projectWorld(wx, wy, wz)
    {
        if (wz === undefined) { wz = 0; }
        var p = _projectLocal(wx, wy, wz);
        return {
            x: _pivotX + p.sx,
            y: _pivotY - p.sy
        };
    }

    function _projectPoint(px, py, pz)
    {
        if (pz === undefined) { pz = 0; }
        return _projectWorld(px - _pivotX, _pivotY - py, pz);
    }

    function _strokeWorldLine(ctx, wx0, wy0, wz0, wx1, wy1, wz1)
    {
        var segs = TUNING.CURRENT.ORBIT_LINE_SEGMENTS;
        var i;
        var t0;
        var t1;
        var a;
        var b;
        for (i = 0; i < segs; i++) {
            t0 = i / segs;
            t1 = (i + 1) / segs;
            a = _projectWorld(
                wx0 + (wx1 - wx0) * t0,
                wy0 + (wy1 - wy0) * t0,
                wz0 + (wz1 - wz0) * t0);
            b = _projectWorld(
                wx0 + (wx1 - wx0) * t1,
                wy0 + (wy1 - wy0) * t1,
                wz0 + (wz1 - wz0) * t1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
    }

    function _startOrbit(screenX, screenY)
    {
        _orbiting = true;
        _lastX = screenX;
        _lastY = screenY;
    }

    function _endOrbit()
    {
        _orbiting = false;
    }

    function _isOrbiting()
    {
        return _orbiting;
    }

    function _orbitDrag(screenX, screenY)
    {
        if (!_orbiting) { return; }
        var dx = screenX - _lastX;
        var dy = screenY - _lastY;
        _lastX = screenX;
        _lastY = screenY;
        _azimuth += dx * TUNING.CURRENT.ORBIT_AZIMUTH_SENS;
        _elevation += dy * TUNING.CURRENT.ORBIT_ELEVATION_SENS;
        _clampState();
    }

    function _zoomWheel(deltaY)
    {
        var factor = deltaY < 0 ?
            TUNING.CURRENT.ZOOM_WHEEL_IN :
            TUNING.CURRENT.ZOOM_WHEEL_OUT;
        _zoom *= factor;
        _clampState();
    }

    // Exact inverse of _projectLocal on the plane of constant world-Z (wz).
    // Prior iterative form inverted the Y residual sign and diverged → erratic drag.
    function _solvePanelAtZ(screenX, screenY, wz)
    {
        var c = _cameraFrame();
        var targetSx = screenX - _pivotX;
        var targetSy = _pivotY - screenY;
        var invF = 1 / c.focal;
        // Ray: cam + t * forward + (sx*t/f) * right + (sy*t/f) * up
        // Intersect world Z = wz → solve for depth t, then wx/wy.
        var denom = c.fz + targetSx * invF * c.rz + targetSy * invF * c.uz;
        if (Math.abs(denom) < 1e-8) {
            return { x: screenX, y: screenY };
        }
        var t = (wz - c.camZ) / denom;
        if (t < TUNING.CURRENT.ORBIT_DEPTH_MIN) {
            t = TUNING.CURRENT.ORBIT_DEPTH_MIN;
        }
        var scale = t * invF;
        var wx = c.camX + t * c.fx + targetSx * scale * c.rx + targetSy * scale * c.ux;
        var wy = c.camY + t * c.fy + targetSx * scale * c.ry + targetSy * scale * c.uy;
        return { x: _pivotX + wx, y: _pivotY - wy };
    }

    function _screenToPanelAtZ(screenX, screenY, wz)
    {
        if (wz === undefined) { wz = _pickPlaneWz; }
        return _solvePanelAtZ(screenX, screenY, wz);
    }

    function _unmap(screenX, screenY, panelX, panelY, panelW, panelH)
    {
        return _solvePanelAtZ(screenX, screenY, _pickPlaneWz);
    }

    function _worldDepth(wx, wy, wz)
    {
        if (wz === undefined) { wz = 0; }
        return _projectLocal(wx, wy, wz).depth;
    }

    // Unclamped view-space depth (negative = behind camera). For horizon culling.
    function _rawWorldDepth(wx, wy, wz)
    {
        if (wz === undefined) { wz = 0; }
        return _projectLocal(wx, wy, wz).rawDepth;
    }

    function _reset()
    {
        _azimuth = 0;
        _elevation = TUNING.CURRENT.ORBIT_DEFAULT_ELEVATION;
        _zoom = 1.0;
        _orbiting = false;
        _pickPlaneWz = 0;
    }

    return {
        startOrbit: _startOrbit,
        endOrbit: _endOrbit,
        isOrbiting: _isOrbiting,
        orbitDrag: _orbitDrag,
        zoomWheel: _zoomWheel,
        fillPanel: _fillPanelBg,
        projectPoint: _projectPoint,
        projectWorld: _projectWorld,
        strokeWorldLine: _strokeWorldLine,
        hallDepthScale: _hallDepthScale,
        setPickPlaneWz: _setPickPlaneWz,
        setPivot: _setPivot,
        getPivot: _getPivot,
        cameraActive: _cameraActive,
        screenToPanelAtZ: _screenToPanelAtZ,
        worldDepth: _worldDepth,
        rawWorldDepth: _rawWorldDepth,
        unmap: _unmap,
        reset: _reset
    };
})();