'use strict'

// MODELPANEL — scene panel: drag masses, pin, spawn, connect springs.
var MODELPANEL = MODELPANEL || {};

MODELPANEL.create = (function(x, y, w, h)
{
    var _x = x;
    var _y = y;
    var _w = w;
    var _h = h;
    var _mousePosition = undefined;
    var _mouseDown = false;
    var _dragMass = null;
    var _pendingDragMass = null;
    var _pendingDragX = 0;
    var _pendingDragY = 0;
    var _dragStartScreenX = 0;
    var _dragStartScreenY = 0;
    var _dragStartMetersX = 0;
    var _dragStartMetersY = 0;
    var _dragPlaneWz = 0;
    var _mouseupConnectCandidate = null;
    var _connectArmCandidate = null;
    var _connectArmTimer = null;
    var _dragStartPx = 5;
    var _mouseSlopPx = 25;
    var _pixelsPerMeter = SCENE.instance.pixelsPerMeter();
    var _creatureOffsetX = 0;
    var _creatureFloorOffset = 0;
    var _selectionColor = "#6ab5ff";
    var _hoverColor = "#0000ff";
    var _pinnedColor = "#8a6a3a";
    var _connectTargetColor = "#2a9a3a";
    var _pinnedMasses = [];
    var _connectFromMass = null;
    var _rightClickMass = null;
    var _rightClickCount = 0;
    var _rightClickTimer = null;
    var _rightClickSeqTime = 0;
    var _rightClickX = 0;
    var _rightClickY = 0;
    // Last mass the player dragged/picked — right-click lock fallback when live sim moves nodes under the cursor
    var _lastManipulatedMass = null;
    var _lastManipulatedAt = 0;
    var _lastManipulatedMs = 4000;
    var _lastClickTime = 0;
    var _lastClickItem = null;
    var _lastClickButton = -1;
    var _lastClickX = 0;
    var _lastClickY = 0;
    var _doubleClickMs = 350;
    var _doubleClickPx = 14;
    var _massRadiusPx = 5;
    var _nodeDiameterPx = _massRadiusPx * 2;
    var _springPowerDigit = -1;
    var _powerEditSpring = null;
    var _springSelectColor = "#0000ff";
    var _muscleConnectMode = false;
    var _powerTuneMode = false;
    var _nextMusclePhase = 0;
    var _drawPivotX = 0;
    var _drawPivotY = 0;

    function _syncCreaturePlacement()
    {
        if (SCENE.instance.pixelsPerMeterForPanel) {
            _pixelsPerMeter = SCENE.instance.pixelsPerMeterForPanel(_w);
        } else {
            _pixelsPerMeter = SCENE.instance.pixelsPerMeter();
        }
        _creatureOffsetX = SCENE.instance.creatureOffsetX(_x, _w);
        _creatureFloorOffset = SCENE.instance.creatureFloorOffset();
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

    function _massWorldWz(mass, centroidMx)
    {
        var base = MODEL.instance.worldZ() * _pixelsPerMeter;
        var half = TUNING.CURRENT.CREATURE_Z_EXTRUDE_M * 0.5 * _pixelsPerMeter;
        var modelHalfW = MODEL.instance.width() * 0.5;
        var norm = 0;
        if (modelHalfW > 0.001) {
            norm = (mass.s.x() - centroidMx) / modelHalfW;
            if (norm < -1) { norm = -1; }
            if (norm > 1) { norm = 1; }
        }
        return base + norm * half + mass.sz() * _pixelsPerMeter;
    }

    function _fixedScenePivot()
    {
        return VECTOR.create(
            _x + _w * 0.5,
            _y + _h * TUNING.CURRENT.ORBIT_FRAME_VP_V);
    }

    function _worldOffsetPx()
    {
        return MODEL.instance.worldX() * _pixelsPerMeter;
    }

    function _pixelsToMeters(v)
    {
        _syncCreaturePlacement();
        var vv = VECTOR.create(v.x(), v.y());
        vv.x(vv.x() - _creatureOffsetX);
        vv.y(_y + _h - _creatureFloorOffset - vv.y());
        vv.div(_pixelsPerMeter);
        return vv;
    }

    function _metersToPixels(v)
    {
        _syncCreaturePlacement();
        var vv = VECTOR.mul(v, _pixelsPerMeter);
        vv.x(_creatureOffsetX + vv.x());
        vv.y(_y + _h - _creatureFloorOffset - vv.y());
        return vv;
    }

    function _toScreenPx(px, py, pz)
    {
        if (pz === undefined) { pz = 0; }
        if (SCENE_CAMERA.instance.projectWorld) {
            var p = SCENE_CAMERA.instance.projectWorld(
                px - _drawPivotX + _worldOffsetPx(), _drawPivotY - py, pz);
            return { x: p.x, y: p.y };
        }
        return { x: px, y: py };
    }

    function _depthScaleAtWz(wz)
    {
        if (!SCENE_CAMERA.instance.worldDepth) { return 1; }
        var ref = SCENE_CAMERA.instance.worldDepth(
            _worldOffsetPx(), 0, MODEL.instance.worldZ() * _pixelsPerMeter);
        var here = SCENE_CAMERA.instance.worldDepth(_worldOffsetPx(), 0, wz);
        if (here < 0.001) { return 1; }
        return ref / here;
    }

    function _distPointSeg(px, py, x1, y1, x2, y2)
    {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var lenSq = dx * dx + dy * dy;
        var t = 0;
        if (lenSq > 0.0001) {
            t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
            if (t < 0) { t = 0; }
            if (t > 1) { t = 1; }
        }
        var cx = x1 + t * dx;
        var cy = y1 + t * dy;
        dx = px - cx;
        dy = py - cy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _screenToPanelMeters(exy, wz, centroidMx)
    {
        if (SCENE_CAMERA.instance.screenToPanelAtZ) {
            // screenToPanelAtZ returns pivot+wx; draw uses wx = panelX-pivot+worldX.
            var panel = SCENE_CAMERA.instance.screenToPanelAtZ(
                exy.x(), exy.y(), wz);
            return _pixelsToMeters(VECTOR.create(
                panel.x - _worldOffsetPx(), panel.y));
        }
        return _pixelsToMeters(exy);
    }

    function _defaultPickWz()
    {
        return MODEL.instance.worldZ() * _pixelsPerMeter;
    }

    function _strokeProjectedPanelLine(ctx, x0, y0, z0, x1, y1, z1)
    {
        if (z1 === undefined) {
            z1 = 0;
            z0 = 0;
        }
        if (SCENE_CAMERA.instance.strokeWorldLine) {
            var wxOff = _worldOffsetPx();
            SCENE_CAMERA.instance.strokeWorldLine(ctx,
                x0 - _drawPivotX + wxOff, _drawPivotY - y0, z0,
                x1 - _drawPivotX + wxOff, _drawPivotY - y1, z1);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }

    function _metersToScreen(v, mass, centroidMx)
    {
        var p = _metersToPixels(v);
        var wz = mass ? _massWorldWz(mass, centroidMx) : 0;
        return _toScreenPx(p.x(), p.y(), wz);
    }

    function _digitToKScale(digit)
    {
        return 1.0 + (digit + 1) * 0.1;
    }

    function _kScaleToDigit(kScale)
    {
        if (kScale <= 1.05) { return -1; }
        var digit = Math.round((kScale - 1.0) / 0.1) - 1;
        if (digit < 0) { digit = 0; }
        if (digit > 9) { digit = 9; }
        return digit;
    }

    function _powerBarFilled()
    {
        return _springPowerDigit < 0 ? 0 : _springPowerDigit + 1;
    }

    function _connectKScale()
    {
        return _springPowerDigit < 0 ? 1.0 : _digitToKScale(_springPowerDigit);
    }

    function _syncBarFromSpring(spring)
    {
        if (SPRING.isSpring(spring)) {
            _springPowerDigit = _kScaleToDigit(spring.kScale());
        }
    }

    function _isPinned(mass)
    {
        return _pinnedMasses.indexOf(mass) !== -1;
    }

    function _rememberManipulated(mass)
    {
        if (!MASS.isMass(mass)) { return; }
        _lastManipulatedMass = mass;
        _lastManipulatedAt = Date.now();
    }

    function _recentManipulatedMass()
    {
        if (!MASS.isMass(_lastManipulatedMass)) { return null; }
        if (MODEL.instance.masses.indexOf(_lastManipulatedMass) === -1) {
            _lastManipulatedMass = null;
            return null;
        }
        if ((Date.now() - _lastManipulatedAt) > _lastManipulatedMs) {
            return null;
        }
        return _lastManipulatedMass;
    }

    function _pinMass(mass)
    {
        if (!MASS.isMass(mass)) { return; }
        if (!_isPinned(mass)) {
            _pinnedMasses.push(mass);
        }
        // Always re-assert fixed state (live sim + drag paths can flip free briefly).
        mass.isFreeMass(false);
        mass.v.set(0, 0);
        mass.a.set(0, 0);
        mass.f.set(0, 0);
        _rememberManipulated(mass);
    }

    function _unpinMass(mass)
    {
        if (!MASS.isMass(mass)) { return; }
        var i = _pinnedMasses.indexOf(mass);
        if (i !== -1) {
            _pinnedMasses.splice(i, 1);
            mass.isFreeMass(true);
        }
    }

    // Resolve which mass a right-click should lock/unlock/delete.
    // Held/pending drag wins over hit-test (live sim moves neighbors under the cursor).
    function _massForRightClick(hitItem)
    {
        var held = _dragMass || _pendingDragMass;
        if (MASS.isMass(held) && MODEL.instance.masses.indexOf(held) !== -1) {
            return held;
        }
        if (MASS.isMass(hitItem) && MODEL.instance.masses.indexOf(hitItem) !== -1) {
            return hitItem;
        }
        var sel = MODEL.instance.selectedItem();
        if (MASS.isMass(sel) && MODEL.instance.masses.indexOf(sel) !== -1) {
            return sel;
        }
        return _recentManipulatedMass();
    }

    function _lockAllMasses()
    {
        _endDrag();
        MODEL.instance.masses.forEach(function(mass) {
            _pinMass(mass);
        });
    }

    function _unlockAllMasses()
    {
        _endDrag();
        MODEL.instance.masses.forEach(function(mass) {
            _unpinMass(mass);
        });
    }

    function _resetForWalkerSpawn()
    {
        _cancelConnectMode();
        _cancelRightClickGesture();
        _clearConnectArmTimer();
        _endDrag();
        _pinnedMasses = [];
        _muscleConnectMode = false;
        _powerTuneMode = false;
        _nextMusclePhase = 0;
        _clearPowerEditSpring();
        _springPowerDigit = -1;
        _mouseupConnectCandidate = null;
        if (MODEL.instance.resetWorldPlacement) {
            MODEL.instance.resetWorldPlacement();
        }
    }

    function _deleteMass(mass)
    {
        if (!MASS.isMass(mass) || MODEL.instance.masses.indexOf(mass) === -1) { return; }
        _unpinMass(mass);
        if (_connectFromMass === mass) {
            _connectFromMass = null;
        }
        if (_dragMass === mass || _pendingDragMass === mass) {
            _endDrag();
        }
        if (_mouseupConnectCandidate === mass) {
            _mouseupConnectCandidate = null;
        }
        MODEL.instance.removeMass(mass);
        MODEL.instance.selectedItem(null);
    }

    function _clearRightClickTimer()
    {
        if (_rightClickTimer) {
            clearTimeout(_rightClickTimer);
            _rightClickTimer = null;
        }
    }

    function _cancelRightClickGesture()
    {
        var hadPending = _rightClickMass !== null && _rightClickCount > 0;
        _clearRightClickTimer();
        _rightClickMass = null;
        _rightClickCount = 0;
        return hadPending;
    }

    function _applyRightClickGesture(mass, count)
    {
        if (!MASS.isMass(mass) || MODEL.instance.masses.indexOf(mass) === -1) { return; }
        if (count >= 3) {
            _deleteMass(mass);
        } else if (count === 2) {
            _unpinMass(mass);
            MODEL.instance.selectedItem(mass);
        } else if (count === 1) {
            _pinMass(mass);
            MODEL.instance.selectedItem(mass);
        }
    }

    function _flushRightClickGesture()
    {
        _clearRightClickTimer();
        if (_rightClickMass && _rightClickCount > 0) {
            var target = _rightClickMass;
            var count = _rightClickCount;
            _rightClickMass = null;
            _rightClickCount = 0;
            _applyRightClickGesture(target, count);
        }
    }

    function _scheduleRightClickGesture(exy, mass)
    {
        var now = Date.now();
        var dx = exy.x() - _rightClickX;
        var dy = exy.y() - _rightClickY;
        var sameTarget = mass === _rightClickMass && _rightClickCount > 0 &&
            (now - _rightClickSeqTime) <= _doubleClickMs &&
            (dx * dx + dy * dy) <= (_doubleClickPx * _doubleClickPx);

        if (!sameTarget) {
            _flushRightClickGesture();
            _rightClickMass = mass;
            _rightClickCount = 1;
            _pinMass(mass);
        } else {
            _rightClickCount++;
            if (_rightClickCount === 2) {
                _unpinMass(mass);
            } else if (_rightClickCount >= 3) {
                _clearRightClickTimer();
                var target = _rightClickMass;
                _rightClickMass = null;
                _rightClickCount = 0;
                _deleteMass(target);
                return;
            }
        }

        _rightClickX = exy.x();
        _rightClickY = exy.y();
        _rightClickSeqTime = now;
        _clearRightClickTimer();
        _rightClickTimer = setTimeout(_flushRightClickGesture, _doubleClickMs);
        MODEL.instance.selectedItem(mass);
    }

    function _inPanel(exy)
    {
        return UTIL.inBounds(exy.x(), exy.y(), _x, _y, _w, _h);
    }

    function _hitSlopPx()
    {
        if (DISPLACE.instance.fisheye() && TUNING.CURRENT.FISHEYE_HIT_SLOP_PX) {
            return TUNING.CURRENT.FISHEYE_HIT_SLOP_PX;
        }
        return _mouseSlopPx;
    }

    function _springHitSlopPx()
    {
        return TUNING.CURRENT.SPRING_HIT_SLOP_PX || _hitSlopPx();
    }

    function _nearestSpringAt(exy, centroidMx)
    {
        var springs = MODEL.instance.springs;
        var best = null;
        var bestD = Infinity;
        var i;
        var a;
        var b;
        var d;
        var slop = _springHitSlopPx();
        for (i = 0; i < springs.length; i++) {
            a = _metersToScreen(springs[i].m1.s, springs[i].m1, centroidMx);
            b = _metersToScreen(springs[i].m2.s, springs[i].m2, centroidMx);
            d = _distPointSeg(exy.x(), exy.y(), a.x, a.y, b.x, b.y);
            if (d < bestD) {
                bestD = d;
                best = springs[i];
            }
        }
        if (best && bestD <= slop) { return best; }
        return null;
    }

    function _nearestMassAt(exy, maxDistanceInPixels, centroidMx)
    {
        var masses = MODEL.instance.masses;
        var best = null;
        var bestD = Infinity;
        var i;
        var s;
        var dx;
        var dy;
        var d;
        for (i = 0; i < masses.length; i++) {
            s = _metersToScreen(masses[i].s, masses[i], centroidMx);
            dx = exy.x() - s.x;
            dy = exy.y() - s.y;
            d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestD) {
                bestD = d;
                best = masses[i];
            }
        }
        if (best) {
            var pickWz = _massWorldWz(best, centroidMx);
            var scaledSlop = maxDistanceInPixels * _depthScaleAtWz(pickWz);
            if (bestD <= scaledSlop) { return best; }
        }
        return null;
    }

    function _getNearestItem(exy, maxDistanceInPixels, preferSpring)
    {
        _syncCreaturePlacement();
        var centroidMx = _creatureCentroidMetersX();
        if (maxDistanceInPixels === undefined) {
            maxDistanceInPixels = _hitSlopPx();
        }
        var nearestMass = _nearestMassAt(exy, maxDistanceInPixels, centroidMx);
        var nearestSpring = _nearestSpringAt(exy, centroidMx);
        if (nearestMass) {
            if (preferSpring && nearestSpring) {
                return nearestSpring;
            }
            return nearestMass;
        }
        if (nearestSpring) { return nearestSpring; }
    }

    function _isDoubleClick(exy, item, button)
    {
        var now = Date.now();
        var dx = exy.x() - _lastClickX;
        var dy = exy.y() - _lastClickY;
        var isDouble = item &&
            item === _lastClickItem &&
            button === _lastClickButton &&
            (now - _lastClickTime) <= _doubleClickMs &&
            (dx * dx + dy * dy) <= (_doubleClickPx * _doubleClickPx);
        _lastClickTime = now;
        _lastClickItem = item;
        _lastClickButton = button;
        _lastClickX = exy.x();
        _lastClickY = exy.y();
        return isDouble;
    }

    function _spawnMassAt(exy)
    {
        var mass = MASS.create(_screenToPanelMeters(exy, _defaultPickWz()));
        MODEL.instance.addMass(mass);
        return mass;
    }

    function _spawnMassNear(originMass)
    {
        _syncCreaturePlacement();
        var spanM = (_nodeDiameterPx * 3) / _pixelsPerMeter;
        var angle = Math.random() * Math.PI * 2;
        var offset = VECTOR.create(Math.cos(angle) * spanM, Math.sin(angle) * spanM);
        var pos = VECTOR.add(originMass.s, offset);
        var mass = MASS.create(pos);
        MODEL.instance.addMass(mass);
        return mass;
    }

    function _connectMasses(a, b)
    {
        if (!MASS.isMass(a) || !MASS.isMass(b) || a === b) { return; }
        var amplitude = 0;
        var phase = 0;
        if (_muscleConnectMode) {
            amplitude = 0.5;
            phase = _nextMusclePhase;
            _nextMusclePhase += WALKER.instance.musclePhaseStep();
        }
        var spring = SPRING.create(a, b, undefined, amplitude, phase, undefined,
            _connectKScale());
        MODEL.instance.addSpring(spring);
    }

    function _toggleMuscleConnectMode()
    {
        _muscleConnectMode = !_muscleConnectMode;
        return _muscleConnectMode;
    }

    function _muscleConnectModeActive()
    {
        return _muscleConnectMode;
    }

    // M: fine-tune spring power on a selected line (Shift+click). Off = 0–9 hit all lines.
    function _togglePowerTuneMode()
    {
        _powerTuneMode = !_powerTuneMode;
        if (!_powerTuneMode) {
            _clearPowerEditSpring();
        }
        return _powerTuneMode;
    }

    function _powerTuneModeActive()
    {
        return _powerTuneMode;
    }

    function _toggleSelectedSpringMuscle()
    {
        var sel = MODEL.instance.selectedItem();
        if (SPRING.isSpring(sel)) {
            if (sel.amplitude() > 0) {
                sel.amplitude(0);
            } else {
                sel.amplitude(0.5);
                sel.phase(_nextMusclePhase);
                _nextMusclePhase += WALKER.instance.musclePhaseStep();
            }
            return true;
        }
        return false;
    }

    function _clearPowerEditSpring()
    {
        _powerEditSpring = null;
    }

    function _selectSpringForPower(spring)
    {
        if (!SPRING.isSpring(spring)) { return; }
        // Shift+select enters line-tune so 0–9 hit this spring (same as pressing M).
        _powerTuneMode = true;
        _powerEditSpring = spring;
        MODEL.instance.selectedItem(spring);
        _syncBarFromSpring(spring);
    }

    function _activePowerSpring()
    {
        if (_powerEditSpring && MODEL.instance.springs.indexOf(_powerEditSpring) !== -1) {
            return _powerEditSpring;
        }
        var sel = MODEL.instance.selectedItem();
        if (SPRING.isSpring(sel)) {
            _powerEditSpring = sel;
            return sel;
        }
        return null;
    }

    function _setSpringPowerDigit(digit)
    {
        digit = Math.max(0, Math.min(9, digit | 0));
        _springPowerDigit = digit;
        var k = _digitToKScale(digit);
        if (_powerTuneMode) {
            var target = _activePowerSpring();
            if (target) {
                target.kScale(k);
                MODEL.instance.selectedItem(target);
            }
            return;
        }
        // Global power: every spring/muscle on the creature.
        MODEL.instance.springs.forEach(function(spr) {
            spr.kScale(k);
        });
    }

    function _springPowerDigitValue()
    {
        return _springPowerDigit;
    }

    function _inConnectMode()
    {
        return _connectFromMass !== null;
    }

    function _startConnectMode(mass)
    {
        _clearPowerEditSpring();
        _endDrag();
        _connectFromMass = mass;
        MODEL.instance.selectedItem(mass);
    }

    function _cancelConnectMode()
    {
        var wasActive = _connectFromMass !== null;
        _connectFromMass = null;
        _clearConnectArmTimer();
        return wasActive;
    }

    function _clearConnectArmTimer()
    {
        if (_connectArmTimer) {
            clearTimeout(_connectArmTimer);
            _connectArmTimer = null;
        }
        _connectArmCandidate = null;
    }

    function _scheduleConnectArm(mass)
    {
        _clearConnectArmTimer();
        _connectArmCandidate = mass;
        _connectArmTimer = setTimeout(function() {
            _connectArmTimer = null;
            _connectArmCandidate = null;
            if (!_inConnectMode()) {
                _startConnectMode(mass);
            }
        }, _doubleClickMs);
    }

    function _endDrag()
    {
        if (_dragMass) {
            _rememberManipulated(_dragMass);
            if (_isPinned(_dragMass)) {
                // Stay fixed after lock-while-dragging (live or paused).
                _dragMass.isFreeMass(false);
                _dragMass.v.set(0, 0);
                _dragMass.a.set(0, 0);
            } else {
                _dragMass.isFreeMass(true);
            }
            _dragMass = null;
        }
        if (_pendingDragMass) {
            _rememberManipulated(_pendingDragMass);
        }
        _pendingDragMass = null;
        _mouseDown = false;
    }

    function _beginDrag(mass, exy, centroidMx)
    {
        _clearPowerEditSpring();
        _clearConnectArmTimer();
        _mouseupConnectCandidate = null;
        _dragMass = mass;
        _pendingDragMass = null;
        _mouseDown = true;
        _dragStartScreenX = exy ? exy.x() : _pendingDragX;
        _dragStartScreenY = exy ? exy.y() : _pendingDragY;
        _dragStartMetersX = mass.s.x();
        _dragStartMetersY = mass.s.y();
        _dragPlaneWz = _massWorldWz(mass, centroidMx || _creatureCentroidMetersX());
        MODEL.instance.selectedItem(mass);
        _rememberManipulated(mass);
        // Pinned nodes stay fixed (still selectable); free nodes freeze while held.
        mass.isFreeMass(false);
        mass.v.set(0, 0);
    }

    function _panelDeltaFromScreenDrag(exy)
    {
        if (!SCENE_CAMERA.instance.screenToPanelAtZ) {
            return { x: exy.x() - _dragStartScreenX, y: exy.y() - _dragStartScreenY };
        }
        // World-X bias cancels in the delta (same offset on start + current).
        var startPanel = SCENE_CAMERA.instance.screenToPanelAtZ(
            _dragStartScreenX, _dragStartScreenY, _dragPlaneWz);
        var curPanel = SCENE_CAMERA.instance.screenToPanelAtZ(
            exy.x(), exy.y(), _dragPlaneWz);
        return {
            x: curPanel.x - startPanel.x,
            y: curPanel.y - startPanel.y
        };
    }

    function _metersFromDrag(exy)
    {
        var delta = _panelDeltaFromScreenDrag(exy);
        var startPx = _metersToPixels(VECTOR.create(_dragStartMetersX, _dragStartMetersY));
        var panelX = startPx.x() + delta.x;
        var panelY = startPx.y() + delta.y;
        panelX = Math.max(_x, Math.min(_x + _w, panelX));
        panelY = Math.max(_y, Math.min(_y + _h, panelY));
        var mxy = _pixelsToMeters(VECTOR.create(panelX, panelY));
        mxy.x(Math.max(0, Math.min(MODEL.instance.width(), mxy.x())));
        mxy.y(Math.max(0, Math.min(MODEL.instance.height(), mxy.y())));
        return mxy;
    }

    function _queueDrag(mass, exy)
    {
        _clearPowerEditSpring();
        _pendingDragMass = mass;
        _pendingDragX = exy.x();
        _pendingDragY = exy.y();
        _mouseDown = true;
        MODEL.instance.selectedItem(mass);
    }

    function _tryStartPendingDrag(exy)
    {
        if (!_pendingDragMass || _dragMass || _isPinned(_pendingDragMass)) {
            return;
        }
        var dx = exy.x() - _pendingDragX;
        var dy = exy.y() - _pendingDragY;
        if ((dx * dx + dy * dy) >= (_dragStartPx * _dragStartPx)) {
            _beginDrag(_pendingDragMass, exy);
        }
    }

    function _handleSimulateDown(exy, button, e)
    {
        if (button === 0 && e.shiftKey) {
            var shiftSpring = _nearestSpringAt(exy, _creatureCentroidMetersX());
            if (shiftSpring) {
                _selectSpringForPower(shiftSpring);
                return;
            }
        }

        var item = _getNearestItem(exy, undefined, e.shiftKey);

        if (button === 2) {
            _clearConnectArmTimer();
            _mouseupConnectCandidate = null;
            // Held mass wins over hit-test — live sim often puts a neighbor under the cursor.
            var massTarget = _massForRightClick(item);

            if (MASS.isMass(massTarget)) {
                if (_inConnectMode()) {
                    _connectFromMass = null;
                }
                // Lock at current world position before ending left-drag (live + paused).
                // Gesture still handles 2× unlock / 3× delete on the same target.
                _scheduleRightClickGesture(exy, massTarget);
                _endDrag();
                // Re-assert after endDrag so free flag cannot flip back while sim is running.
                if (_isPinned(massTarget)) {
                    massTarget.isFreeMass(false);
                    massTarget.v.set(0, 0);
                    massTarget.a.set(0, 0);
                }
            } else {
                _cancelRightClickGesture();
                _cancelConnectMode();
                _clearPowerEditSpring();
                MODEL.instance.selectedItem(null);
            }
            return;
        }

        if (button !== 0) { return; }

        _flushRightClickGesture();

        if (_connectArmTimer) {
            var armed = _connectArmCandidate;
            _clearConnectArmTimer();
            if (armed && MASS.isMass(item) && item !== armed) {
                _startConnectMode(armed);
                _connectMasses(_connectFromMass, item);
                _cancelConnectMode();
                _mouseupConnectCandidate = null;
                return;
            }
        }

        if (_inConnectMode()) {
            if (MASS.isMass(item) && item !== _connectFromMass) {
                _connectMasses(_connectFromMass, item);
            }
            _cancelConnectMode();
            _mouseupConnectCandidate = null;
            return;
        }

        if (_isDoubleClick(exy, item, button)) {
            _clearConnectArmTimer();
            _mouseupConnectCandidate = null;
            if (MASS.isMass(item)) {
                var spawned = _spawnMassNear(item);
                _beginDrag(spawned, exy);
                return;
            }
        }

        if (SPRING.isSpring(item)) {
            _clearConnectArmTimer();
            _mouseupConnectCandidate = null;
            if (e.shiftKey) {
                _selectSpringForPower(item);
                return;
            }
            if (_isDoubleClick(exy, item, button)) {
                MODEL.instance.removeSpring(item);
                if (_powerEditSpring === item) {
                    _clearPowerEditSpring();
                }
                if (MODEL.instance.selectedItem() === item) {
                    MODEL.instance.selectedItem(null);
                }
                return;
            }
            return;
        }

        if (MASS.isMass(item)) {
            _mouseupConnectCandidate = item;
            if (!_isPinned(item)) {
                _queueDrag(item, exy);
            }
            return;
        }

        if (!item && MODEL.instance.masses.length === 0) {
            _clearConnectArmTimer();
            _mouseupConnectCandidate = null;
            _beginDrag(_spawnMassAt(exy), exy);
            return;
        }

        _mouseupConnectCandidate = null;
        if (!SPRING.isSpring(item)) {
            _clearPowerEditSpring();
        }
        MODEL.instance.selectedItem(item || null);
        _mouseDown = false;
        _pendingDragMass = null;
    }

    function _handleSimulateUp()
    {
        var candidate = _mouseupConnectCandidate;
        var dragged = _dragMass !== null;
        var released = _dragMass || _pendingDragMass;
        _mouseupConnectCandidate = null;
        _endDrag();
        // Keep recent mass for right-click lock after release (live sim yank).
        if (MASS.isMass(released)) {
            _rememberManipulated(released);
            MODEL.instance.selectedItem(released);
        }
        if (candidate && !dragged) {
            _scheduleConnectArm(candidate);
        }
    }

    function _drawConnectRubberband(ctx, centroidMx)
    {
        if (!_inConnectMode() || !_mousePosition) { return; }
        var p1 = _metersToPixels(_connectFromMass.s);
        var x1 = p1.x();
        var y1 = p1.y();
        var z1 = _massWorldWz(_connectFromMass, centroidMx);
        var hover = MODEL.instance.hoveredItem();
        var x2;
        var y2;
        var z2;
        var p2;
        if (MASS.isMass(hover) && hover !== _connectFromMass) {
            p2 = _metersToPixels(hover.s);
            x2 = p2.x();
            y2 = p2.y();
            z2 = _massWorldWz(hover, centroidMx);
        } else if (_mousePosition) {
            x2 = _mousePosition.x();
            y2 = _mousePosition.y();
            z2 = MODEL.instance.worldZ() * _pixelsPerMeter;
        } else {
            return;
        }
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = _connectTargetColor;
        ctx.lineWidth = 2;
        _strokeProjectedPanelLine(ctx, x1, y1, z1, x2, y2, z2);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
    }

    function _nodeDrawRadius(wz)
    {
        var base = DISPLACE.instance.fisheye() ? _massRadiusPx + 3 : _massRadiusPx;
        if (wz !== undefined) {
            base *= _depthScaleAtWz(wz);
        }
        return Math.max(1.5, base);
    }

    function _drawMasses(ctx, centroidMx)
    {
        var circleRadius;
        var nodeR;
        var connecting = _inConnectMode();
        MODEL.instance.masses.forEach(function(mass) {
            var wz = _massWorldWz(mass, centroidMx);
            var xy = _metersToScreen(mass.s, mass, centroidMx);
            var x = xy.x;
            var y = xy.y;
            nodeR = _nodeDrawRadius(wz);
            circleRadius = nodeR * 2;
            var pinned = _isPinned(mass);
            var color = "#000000";
            var circled = false;
            if (connecting) {
                if (mass === _connectFromMass) {
                    color = _selectionColor;
                    circled = true;
                } else {
                    color = _connectTargetColor;
                    circled = true;
                }
            } else if (mass === MODEL.instance.selectedItem()) {
                color = _selectionColor;
                circled = true;
            } else if (mass === MODEL.instance.hoveredItem()) {
                color = _hoverColor;
                circled = true;
            } else if (pinned) {
                color = _pinnedColor;
            }
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(x, y, nodeR, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.closePath();
            if (pinned) {
                ctx.fillStyle = color;
                ctx.fillRect(x - 2, y - 2, 4, 4);
            }
            if (circled) {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2, false);
                ctx.stroke();
                ctx.closePath();
            }
        });
    }

    function _drawSprings(ctx, centroidMx)
    {
        var muscleDotRadius = 1.5;
        var springs = MODEL.instance.springs.slice();
        var ink = TUNING.CURRENT.WIRE_INK || '#000000';
        springs.sort(function(a, b) {
            var za = (_massWorldWz(a.m1, centroidMx) +
                _massWorldWz(a.m2, centroidMx)) * 0.5;
            var zb = (_massWorldWz(b.m1, centroidMx) +
                _massWorldWz(b.m2, centroidMx)) * 0.5;
            return za - zb;
        });
        springs.forEach(function(spr) {
            var color = ink;
            if (spr === MODEL.instance.selectedItem()) {
                color = _springSelectColor;
            }
            var p1 = _metersToPixels(spr.m1.s);
            var p2 = _metersToPixels(spr.m2.s);
            var x1 = p1.x();
            var y1 = p1.y();
            var x2 = p2.x();
            var y2 = p2.y();
            var z1 = _massWorldWz(spr.m1, centroidMx);
            var z2 = _massWorldWz(spr.m2, centroidMx);
            ctx.strokeStyle = color;
            _strokeProjectedPanelLine(ctx, x1, y1, z1, x2, y2, z2);
            if (spr.amplitude() !== 0.0) {
                var mid = _toScreenPx(
                    (x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
                var xm = mid.x;
                var ym = mid.y;
                ctx.beginPath();
                ctx.arc(xm, ym, muscleDotRadius, 0, Math.PI * 2, false);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.closePath();
            }
        });
    }

    function _drawRubberbanding(ctx, centroidMx)
    {
        var item = MODEL.instance.selectedItem();
        if (MODEL.instance.mode() === MODEL.Modes.CONSTRUCT && MASS.isMass(item)) {
            var p1 = _metersToPixels(item.s);
            var x1 = p1.x();
            var y1 = p1.y();
            var z1 = _massWorldWz(item, centroidMx);
            item = MODEL.instance.hoveredItem();
            var x2;
            var y2;
            var z2;
            var p2;
            if (MASS.isMass(item)) {
                p2 = _metersToPixels(item.s);
                x2 = p2.x();
                y2 = p2.y();
                z2 = _massWorldWz(item, centroidMx);
            } else if (_mousePosition) {
                x2 = _mousePosition.x();
                y2 = _mousePosition.y();
                z2 = MODEL.instance.worldZ() * _pixelsPerMeter;
            } else {
                return;
            }
            ctx.strokeStyle = TUNING.CURRENT.WIRE_INK || '#000000';
            _strokeProjectedPanelLine(ctx, x1, y1, z1, x2, y2, z2);
        }
    }

    function __x(x) { if (x !== undefined) { _x = x; } return _x; }
    function __y(y) { if (y !== undefined) { _y = y; } return _y; }
    function __w(w) { if (w !== undefined) { _w = w; } return _w; }
    function __h(h) { if (h !== undefined) { _h = h; } return _h; }

    function _drawPowerBarHints(ctx, bar)
    {
        ctx.font = 'bold 10px Verdana, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'bottom';
        var y = bar.y - 3;
        if (_powerTuneMode) {
            ctx.textAlign = 'left';
            ctx.fillText('TUNE', bar.x, y);
        }
        if (_muscleConnectMode) {
            ctx.textAlign = 'right';
            ctx.fillText('MUSCLE', bar.x + bar.w, y);
        }
    }

    function _drawSpringPowerBar(ctx)
    {
        var bar = MENU_LAYOUT.springPowerBar(_x, _y, _w, _h);
        _drawPowerBarHints(ctx, bar);
        var filled = _powerBarFilled();
        ctx.fillStyle = TUNING.CURRENT.SCENE_BG;
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(bar.x + 0.5, bar.y + 0.5, bar.w - 1, bar.h - 1);
        for (var i = 0; i < filled; i++) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(bar.x + i * bar.segW + 1, bar.y + 1,
                bar.segW - 1, bar.h - 2);
        }
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        for (var j = 1; j < bar.segments; j++) {
            var sx = bar.x + j * bar.segW + 0.5;
            ctx.moveTo(sx, bar.y);
            ctx.lineTo(sx, bar.y + bar.h);
        }
        ctx.stroke();
    }

    function _draw(ctx)
    {
        _syncCreaturePlacement();
        var pivot = _fixedScenePivot();
        var centroidMx = _creatureCentroidMetersX();
        _drawPivotX = pivot.x();
        _drawPivotY = pivot.y();
        if (SCENE_CAMERA.instance.setPivot) {
            SCENE_CAMERA.instance.setPivot(_drawPivotX, _drawPivotY);
        }
        if (SCENE_CAMERA.instance.fillPanel) {
            SCENE_CAMERA.instance.fillPanel(ctx, _x, _y, _w, _h);
        } else {
            ctx.fillStyle = TUNING.CURRENT.SCENE_BG;
            ctx.fillRect(_x, _y, _w, _h);
        }
        SCENE.instance.drawBackground(ctx, _x, _y, _w, _h, _drawPivotX, _drawPivotY);
        _drawSprings(ctx, centroidMx);
        _drawRubberbanding(ctx, centroidMx);
        _drawConnectRubberband(ctx, centroidMx);
        _drawMasses(ctx, centroidMx);
        _drawSpringPowerBar(ctx);
    }

    function _signal(e, exy)
    {
        if (MODEL.instance.mode() === MODEL.Modes.SIMULATE) {
            switch (e.type) {
            case "mousedown":
                if (!_inPanel(exy)) { return; }
                if (e.button === 0 || e.button === 2) {
                    _handleSimulateDown(exy, e.button, e);
                }
                break;
            case "mouseup":
                if (e.button === 0) {
                    _handleSimulateUp();
                }
                break;
            case "mousemove":
                _mousePosition = exy;
                if (_inPanel(exy)) {
                    MODEL.instance.hoveredItem(_getNearestItem(exy) || null);
                } else {
                    MODEL.instance.hoveredItem(null);
                }
                if (!_inConnectMode()) {
                    _tryStartPendingDrag(exy);
                }
                // Drag free nodes; pinned nodes stay fixed (lock holds live + paused).
                if (_mouseDown && _dragMass && !_isPinned(_dragMass) && !_inConnectMode()) {
                    var mxy = _metersFromDrag(exy);
                    _dragMass.s.set(mxy.x(), mxy.y());
                    _dragMass.v.set(0, 0);
                    _dragMass.isFreeMass(false);
                }
                break;
            }
            return;
        }

        switch (e.type) {
        case "mousedown":
            if (_inPanel(exy)) {
                if (e.button === 0) {
                    _mouseDown = true;
                } else {
                    MODEL.instance.selectedItem(null);
                }
            }
            break;
        case "mouseup":
            if (e.button === 0) {
                _mouseDown = false;
                if (_inPanel(exy) && MASS.isMass(MODEL.instance.selectedItem())) {
                    MODEL.instance.selectedItem().isFreeMass(true);
                }
            }
            break;
        case "mousemove":
            _mousePosition = exy;
            if (_inPanel(exy)) {
                MODEL.instance.hoveredItem(_getNearestItem(exy) || null);
            }
            if (_mouseDown && MASS.isMass(MODEL.instance.selectedItem())) {
                var sel = MODEL.instance.selectedItem();
                if (!_dragMass) {
                    _beginDrag(sel, exy);
                }
                var mxy = _metersFromDrag(exy);
                sel.s.set(mxy.x(), mxy.y());
                MODEL.instance.selectedItem().isFreeMass(false);
            }
            break;
        }

        switch (MODEL.instance.mode()) {
        case MODEL.Modes.CONSTRUCT:
            if (_inPanel(exy) && e.type === "mousedown" && e.button === 0) {
                var clickedItem = _getNearestItem(exy);
                if (!clickedItem) {
                    if (MASS.isMass(MODEL.instance.selectedItem())) {
                        var mass = MASS.create(_screenToPanelMeters(exy, _defaultPickWz()));
                        MODEL.instance.addMass(mass);
                        MODEL.instance.addSpring(SPRING.create(
                            MODEL.instance.selectedItem(), mass, undefined,
                            undefined, undefined, undefined,
                            _connectKScale()));
                        MODEL.instance.selectedItem(mass);
                    } else {
                        var mass = MASS.create(_screenToPanelMeters(exy, _defaultPickWz()));
                        MODEL.instance.addMass(mass);
                        MODEL.instance.selectedItem(mass);
                    }
                } else if (MASS.isMass(clickedItem)) {
                    if (MASS.isMass(MODEL.instance.selectedItem()) &&
                        clickedItem !== MODEL.instance.selectedItem()) {
                        MODEL.instance.addSpring(SPRING.create(
                            clickedItem, MODEL.instance.selectedItem(), undefined,
                            undefined, undefined, undefined,
                            _connectKScale()));
                    }
                    MODEL.instance.selectedItem(clickedItem);
                } else {
                    MODEL.instance.selectedItem(clickedItem);
                }
            }
            break;
        case MODEL.Modes.DELETE:
            if (_inPanel(exy) && e.type === "mousedown" && e.button === 0) {
                MODEL.instance.selectedItem(null);
                var item = _getNearestItem(exy);
                if (item !== undefined) {
                    MODEL.instance.removeMass(item) || MODEL.instance.removeSpring(item);
                }
            }
            break;
        }
    }

    return {
        x: __x,
        y: __y,
        w: __w,
        h: __h,
        draw: _draw,
        signal: _signal,
        cancelConnectMode: _cancelConnectMode,
        cancelRightClickGesture: _cancelRightClickGesture,
        inConnectMode: _inConnectMode,
        setSpringPowerDigit: _setSpringPowerDigit,
        springPowerDigit: _springPowerDigitValue,
        lockAllMasses: _lockAllMasses,
        unlockAllMasses: _unlockAllMasses,
        toggleMuscleConnectMode: _toggleMuscleConnectMode,
        toggleSelectedSpringMuscle: _toggleSelectedSpringMuscle,
        muscleConnectModeActive: _muscleConnectModeActive,
        togglePowerTuneMode: _togglePowerTuneMode,
        powerTuneModeActive: _powerTuneModeActive,
        resetForWalkerSpawn: _resetForWalkerSpawn
    };
});