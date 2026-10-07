'use strict'

// ROOTPANEL — fullscreen model viewport (HUD drawn separately).
var ROOTPANEL = ROOTPANEL || {};

ROOTPANEL.create = (function(w, h, hudH)
{
    var _w = w;
    var _h = h;
    var _hudH = hudH || 36;

    var _modelpanel = MODELPANEL.create(0, _hudH, w, h - _hudH);

    function _rebuild(nw, nh, nhud)
    {
        _w = nw;
        _h = nh;
        _hudH = nhud;
        _modelpanel = MODELPANEL.create(0, _hudH, _w, _h - _hudH);
    }

    function _draw(ctx)
    {
        _modelpanel.draw(ctx);
    }

    function _signal(e, exy)
    {
        if (exy.y() < _hudH) { return; }
        var local = VECTOR.create(exy.x(), exy.y());
        _modelpanel.signal(e, local);
    }

    function _cancelConnectMode()
    {
        if (_modelpanel.cancelConnectMode) {
            return _modelpanel.cancelConnectMode();
        }
        return false;
    }

    function _inConnectMode()
    {
        return _modelpanel.inConnectMode ? _modelpanel.inConnectMode() : false;
    }

    function _cancelRightClickGesture()
    {
        if (_modelpanel.cancelRightClickGesture) {
            return _modelpanel.cancelRightClickGesture();
        }
        return false;
    }

    function _setSpringPowerDigit(digit)
    {
        if (_modelpanel.setSpringPowerDigit) {
            _modelpanel.setSpringPowerDigit(digit);
        }
    }

    function _lockAllMasses()
    {
        if (_modelpanel.lockAllMasses) {
            _modelpanel.lockAllMasses();
        }
    }

    function _unlockAllMasses()
    {
        if (_modelpanel.unlockAllMasses) {
            _modelpanel.unlockAllMasses();
        }
    }

    function _togglePowerTuneMode()
    {
        if (_modelpanel.togglePowerTuneMode) {
            var on = _modelpanel.togglePowerTuneMode();
            if (DISPLACE.instance.flash) {
                DISPLACE.instance.flash(on ? 'LINE POWER TUNE' : 'GLOBAL POWER');
            }
        }
    }

    function _toggleMuscleConnect()
    {
        if (_modelpanel.toggleSelectedSpringMuscle &&
            _modelpanel.toggleSelectedSpringMuscle()) {
            return;
        }
        if (_modelpanel.toggleMuscleConnectMode) {
            _modelpanel.toggleMuscleConnectMode();
        }
    }

    function _respawnWalker()
    {
        if (_modelpanel.resetForWalkerSpawn) {
            _modelpanel.resetForWalkerSpawn();
        }
        WALKER.instance.applyGlobals();
        WALKER.instance.respawnMinimal();
        MODEL.instance.mode(MODEL.Modes.SIMULATE);
    }

    function _clearAllGeometry()
    {
        if (_modelpanel.resetForWalkerSpawn) {
            _modelpanel.resetForWalkerSpawn();
        }
        MODEL.instance.clearGeometry();
    }

    return {
        w: function() { return _w; },
        h: function() { return _h; },
        hudH: function() { return _hudH; },
        rebuild: _rebuild,
        draw: _draw,
        signal: _signal,
        cancelConnectMode: _cancelConnectMode,
        cancelRightClickGesture: _cancelRightClickGesture,
        inConnectMode: _inConnectMode,
        setSpringPowerDigit: _setSpringPowerDigit,
        lockAllMasses: _lockAllMasses,
        unlockAllMasses: _unlockAllMasses,
        togglePowerTuneMode: _togglePowerTuneMode,
        toggleMuscleConnect: _toggleMuscleConnect,
        respawnWalker: _respawnWalker,
        clearAllGeometry: _clearAllGeometry
    };
});