'use strict'

var UI = UI || {};

UI.instance = (function()
{
    var _viewport = undefined;
    var _ctx = undefined;
    var _canvasTopLeft = undefined;
    var _rootpanel = undefined;

    function _hudH()
    {
        if (typeof SCENE !== 'undefined' && SCENE.instance && SCENE.instance.hudH) {
            return SCENE.instance.hudH();
        }
        return 36;
    }

    function _desiredSize()
    {
        return {
            w: Math.max(1, window.innerWidth),
            h: Math.max(1, window.innerHeight)
        };
    }

    function _gameInputBlocked()
    {
        if (MENU.instance.blocksGameInput()) { return true; }
        if (LOCOMOTION_HUD.instance.blocksGameInput()) { return true; }
        return false;
    }

    function _creatureHotkeysAllowed()
    {
        var s = DISPLACE.instance.state();
        if (s !== DISPLACE.GameState.PLAYING &&
            s !== DISPLACE.GameState.PAUSE_MENU) {
            return false;
        }
        if (LOCOMOTION_HUD.instance.blocksGameInput()) { return false; }
        return true;
    }

    function _isNumpad0(e)
    {
        return e.code === 'Numpad0';
    }

    function _isMoveKey(e)
    {
        return e.code === 'KeyW' || e.code === 'KeyA' ||
            e.code === 'KeyS' || e.code === 'KeyD';
    }

    function _isMinusKey(e)
    {
        return e.key === '-' || e.key === '_' ||
            e.code === 'Minus' || e.code === 'NumpadSubtract';
    }

    function _inGameView()
    {
        var s = DISPLACE.instance.state();
        if (s === DISPLACE.GameState.PLAYING ||
            s === DISPLACE.GameState.PAUSE_MENU) {
            return true;
        }
        if (s === DISPLACE.GameState.OPTIONS &&
            DISPLACE.instance.optionsFrom() !== DISPLACE.GameState.MAIN_MENU) {
            return true;
        }
        return false;
    }

    function _resize()
    {
        _viewport = document.getElementById('viewport');
        if (!_viewport) { return; }
        if (!_ctx) { _ctx = _viewport.getContext('2d'); }
        var size = _desiredSize();
        var w = size.w;
        var h = size.h;
        _viewport.width = w;
        _viewport.height = h;
        _canvasTopLeft = VECTOR.create(
            _viewport.getBoundingClientRect().left,
            _viewport.getBoundingClientRect().top);
        if (_rootpanel) {
            _rootpanel.rebuild(w, h, _hudH());
        } else {
            _rootpanel = ROOTPANEL.create(w, h, _hudH());
        }
    }

    function _initialize()
    {
        _viewport = document.getElementById('viewport');
        _ctx = _viewport.getContext('2d');
        if (typeof DEVICE !== 'undefined' && DEVICE.apply) {
            DEVICE.apply();
        }
        _resize();
        _wireTouchChrome();

        function _pointerCanvasXY(e)
        {
            var rect = _viewport.getBoundingClientRect();
            var scaleX = _viewport.width / Math.max(1, rect.width);
            var scaleY = _viewport.height / Math.max(1, rect.height);
            return VECTOR.create(
                (e.clientX - rect.left) * scaleX,
                (e.clientY - rect.top) * scaleY);
        }

        function _scenePointer(exy, w, h, hud)
        {
            var px = exy.x();
            var py = exy.y();
            if (_inGameView() && DISPLACE.instance.fisheye() &&
                POSTFX.instance.unmapPointer) {
                var mapped = POSTFX.instance.unmapPointer(px, py, 0, hud, w, h - hud);
                px = mapped.x;
                py = mapped.y;
            }
            return VECTOR.create(px, py);
        }

        /** Normalize pointer/touch into mouse-like events expected by panels. */
        function _asMouseEvent(e, type, button)
        {
            var b = (button !== undefined) ? button : (e.button != null ? e.button : 0);
            return {
                type: type,
                button: b,
                buttons: e.buttons,
                clientX: e.clientX,
                clientY: e.clientY,
                preventDefault: function () { if (e.preventDefault) { e.preventDefault(); } },
                stopPropagation: function () { if (e.stopPropagation) { e.stopPropagation(); } },
                originalEvent: e
            };
        }

        function routePointer(e) {
            var exy = _pointerCanvasXY(e);
            var w = _viewport.width;
            var h = _viewport.height;
            var hud = _hudH();
            var sceneExy = _scenePointer(exy, w, h, hud);

            if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING ||
                DISPLACE.instance.state() === DISPLACE.GameState.PAUSE_MENU) {
                if (CONTROLS_LEGEND.instance.handlePointer(e, exy, w, h, hud)) {
                    return;
                }
            }
            if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING) {
                if (LOCOMOTION_HUD.instance.handlePointer(e, exy, w, h, hud)) {
                    return;
                }
            }
            if (e.type === 'mousemove') {
                MENU.instance.onPointerMove(exy);
                if (SCENE_CAMERA.instance.isOrbiting &&
                    SCENE_CAMERA.instance.isOrbiting()) {
                    SCENE_CAMERA.instance.orbitDrag(exy.x(), exy.y());
                    e.preventDefault();
                    return;
                }
                if (!_gameInputBlocked()) {
                    _rootpanel.signal(e, sceneExy);
                }
                return;
            }
            if (e.type === 'mousedown') {
                if (e.button === 1) {
                    e.preventDefault();
                    if (_inGameView() && !_gameInputBlocked() &&
                        SCENE_CAMERA.instance.startOrbit) {
                        SCENE_CAMERA.instance.startOrbit(exy.x(), exy.y());
                    }
                    return;
                }
                if (e.button === 2) {
                    e.preventDefault();
                }
                if (_viewport && typeof _viewport.focus === 'function') {
                    _viewport.focus({ preventScroll: true });
                }
                var consumed = MENU.instance.onPointerDown(exy, w, h, hud);
                if (!consumed && !_gameInputBlocked()) {
                    _rootpanel.signal(e, sceneExy);
                }
                return;
            }
            if (e.type === 'mouseup') {
                if (e.button === 1 && SCENE_CAMERA.instance.endOrbit) {
                    SCENE_CAMERA.instance.endOrbit();
                    return;
                }
                if (!_gameInputBlocked()) {
                    _rootpanel.signal(e, sceneExy);
                }
            }
        }

        function scrollHandler() {
            _canvasTopLeft = VECTOR.create(
                _viewport.getBoundingClientRect().left,
                _viewport.getBoundingClientRect().top);
        }

        // --- Pointer / touch (device-aware) → mouse-like routing ---
        var _activePointers = {};
        var _longPressTimer = null;
        var _longPressFired = false;
        var _primaryId = null;
        var _primaryStart = null;
        var _orbitFromTwoFinger = false;
        var LONG_MS = 450;
        var LONG_MOVE_PX = 14;

        function _clearLongPress()
        {
            if (_longPressTimer) {
                clearTimeout(_longPressTimer);
                _longPressTimer = null;
            }
        }

        function _pointerCount()
        {
            var n = 0;
            for (var k in _activePointers) {
                if (_activePointers.hasOwnProperty(k)) { n++; }
            }
            return n;
        }

        function _onPointerDown(e)
        {
            if (e.target && e.target.closest && e.target.closest('#touch-chrome')) {
                return;
            }
            _activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            try {
                _viewport.setPointerCapture(e.pointerId);
            } catch (err) { /* ignore */ }

            var count = _pointerCount();
            if (count >= 2 && _inGameView() && !_gameInputBlocked() &&
                SCENE_CAMERA.instance.startOrbit) {
                _clearLongPress();
                _orbitFromTwoFinger = true;
                var ids = Object.keys(_activePointers);
                var a = _activePointers[ids[0]];
                var b = _activePointers[ids[1]];
                var mx = (a.x + b.x) * 0.5;
                var my = (a.y + b.y) * 0.5;
                var mid = _asMouseEvent({
                    clientX: mx, clientY: my, button: 1, buttons: 4
                }, 'mousedown', 1);
                routePointer(mid);
                e.preventDefault();
                return;
            }

            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                if (_primaryId === null) {
                    _primaryId = e.pointerId;
                    _longPressFired = false;
                    _primaryStart = { x: e.clientX, y: e.clientY };
                    _clearLongPress();
                    var startX = e.clientX;
                    var startY = e.clientY;
                    _longPressTimer = setTimeout(function () {
                        _longPressTimer = null;
                        _longPressFired = true;
                        // Right-click equivalent (lock / gestures)
                        routePointer(_asMouseEvent({
                            clientX: startX, clientY: startY, button: 2, buttons: 2
                        }, 'mousedown', 2));
                        routePointer(_asMouseEvent({
                            clientX: startX, clientY: startY, button: 2, buttons: 0
                        }, 'mouseup', 2));
                    }, LONG_MS);
                }
                routePointer(_asMouseEvent(e, 'mousedown', 0));
                e.preventDefault();
                return;
            }

            // Mouse / fine pointer — map buttons 1:1
            var typeMap = { pointerdown: 'mousedown' };
            routePointer(_asMouseEvent(e, typeMap.pointerdown, e.button));
            e.preventDefault();
        }

        function _onPointerMove(e)
        {
            if (e.target && e.target.closest && e.target.closest('#touch-chrome')) {
                return;
            }
            if (_activePointers[e.pointerId]) {
                _activePointers[e.pointerId].x = e.clientX;
                _activePointers[e.pointerId].y = e.clientY;
            }
            if (_orbitFromTwoFinger && _pointerCount() >= 2 &&
                SCENE_CAMERA.instance.isOrbiting &&
                SCENE_CAMERA.instance.isOrbiting()) {
                var ids = Object.keys(_activePointers);
                var a = _activePointers[ids[0]];
                var b = _activePointers[ids[1]];
                routePointer(_asMouseEvent({
                    clientX: (a.x + b.x) * 0.5,
                    clientY: (a.y + b.y) * 0.5,
                    button: 1, buttons: 4
                }, 'mousemove', 1));
                e.preventDefault();
                return;
            }
            if (_longPressTimer && e.pointerId === _primaryId && _primaryStart) {
                var dx = e.clientX - _primaryStart.x;
                var dy = e.clientY - _primaryStart.y;
                if ((dx * dx + dy * dy) > (LONG_MOVE_PX * LONG_MOVE_PX)) {
                    _clearLongPress();
                }
            }
            routePointer(_asMouseEvent(e, 'mousemove', e.button));
            if (e.pointerType === 'touch') {
                e.preventDefault();
            }
        }

        function _onPointerUp(e)
        {
            delete _activePointers[e.pointerId];
            _clearLongPress();

            if (_orbitFromTwoFinger && _pointerCount() < 2) {
                _orbitFromTwoFinger = false;
                routePointer(_asMouseEvent(e, 'mouseup', 1));
                e.preventDefault();
                if (e.pointerId === _primaryId) { _primaryId = null; }
                return;
            }

            if (_longPressFired && e.pointerId === _primaryId) {
                // already emitted right-click pair; still need left-up for panels
                routePointer(_asMouseEvent(e, 'mouseup', 0));
                _longPressFired = false;
                _primaryId = null;
                e.preventDefault();
                return;
            }

            var btn = (e.pointerType === 'touch' || e.pointerType === 'pen') ? 0 : e.button;
            routePointer(_asMouseEvent(e, 'mouseup', btn));
            if (e.pointerId === _primaryId) { _primaryId = null; }
            if (e.pointerType === 'touch') {
                e.preventDefault();
            }
        }

        if (window.PointerEvent) {
            _viewport.addEventListener('pointerdown', _onPointerDown, { passive: false });
            _viewport.addEventListener('pointermove', _onPointerMove, { passive: false });
            _viewport.addEventListener('pointerup', _onPointerUp, { passive: false });
            _viewport.addEventListener('pointercancel', _onPointerUp, { passive: false });
            window.addEventListener('pointerup', _onPointerUp, { passive: false });
        } else {
            _viewport.onmousedown = routePointer;
            _viewport.onmousemove = routePointer;
            _viewport.onmouseup = routePointer;
            window.onmouseup = routePointer;
        }

        _viewport.onwheel = function(e) {
            if (CONTROLS_LEGEND.instance.handleWheel &&
                CONTROLS_LEGEND.instance.handleWheel(e.deltaY)) {
                e.preventDefault();
                return;
            }
            if (_inGameView() && !_gameInputBlocked() &&
                SCENE_CAMERA.instance.zoomWheel) {
                SCENE_CAMERA.instance.zoomWheel(e.deltaY);
                e.preventDefault();
            }
        };
        window.onscroll = scrollHandler;
        window.onresize = function () {
            if (typeof DEVICE !== 'undefined' && DEVICE.apply) {
                DEVICE.apply();
            }
            _resize();
        };

        function _digitFromKey(e)
        {
            if (e.key >= '0' && e.key <= '9') {
                return e.key.charCodeAt(0) - 48;
            }
            if (!e.code) { return -1; }
            if (e.code.length === 7 && e.code.indexOf('Numpad') === 0) {
                var n = e.code.charAt(6);
                if (n === '0') { return -1; }
                if (n >= '0' && n <= '9') {
                    return n.charCodeAt(0) - 48;
                }
            }
            if (e.code.length === 6 && e.code.indexOf('Digit') === 0) {
                var d = e.code.charAt(5);
                if (d >= '0' && d <= '9') {
                    return d.charCodeAt(0) - 48;
                }
            }
            return -1;
        }

        function _isPeriodKey(e)
        {
            return e.key === '.' || e.code === 'Period' || e.code === 'NumpadDecimal';
        }

        function _legendKeyAllowed()
        {
            var s = DISPLACE.instance.state();
            return s === DISPLACE.GameState.PLAYING ||
                s === DISPLACE.GameState.PAUSE_MENU;
        }

        window.onkeydown = function(e) {
            var hotkeys = _creatureHotkeysAllowed();
            if (_legendKeyAllowed() && (e.key === 'l' || e.key === 'L')) {
                CONTROLS_LEGEND.instance.toggleVisible();
                e.preventDefault();
                return;
            }
            var powerDigit = _digitFromKey(e);
            if (powerDigit >= 0 && hotkeys)
            {
                if (_rootpanel && _rootpanel.setSpringPowerDigit) {
                    _rootpanel.setSpringPowerDigit(powerDigit);
                    e.preventDefault();
                    return;
                }
            }
            if (hotkeys && _rootpanel) {
                if (e.code === 'Space' || e.key === ' ') {
                    if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING &&
                        DISPLACE.instance.toggleCreaturePaused) {
                        DISPLACE.instance.toggleCreaturePaused();
                        e.preventDefault();
                        return;
                    }
                }
                if (_isPeriodKey(e)) {
                    LOCOMOTION_HUD.instance.toggleVisible();
                    e.preventDefault();
                    return;
                }
                // M = line power fine-tune; Shift+M = muscle mode (selected line or new connects)
                if ((e.key === 'm' || e.key === 'M')) {
                    if (e.shiftKey && _rootpanel.toggleMuscleConnect) {
                        _rootpanel.toggleMuscleConnect();
                    } else if (_rootpanel.togglePowerTuneMode) {
                        _rootpanel.togglePowerTuneMode();
                    }
                    e.preventDefault();
                    return;
                }
                if (_isNumpad0(e) && _rootpanel.respawnWalker) {
                    _rootpanel.respawnWalker();
                    DISPLACE.instance.flash('WALKER SPAWNED');
                    e.preventDefault();
                    return;
                }
                if (_isMoveKey(e) && MODEL.instance.nudgeWorldZ) {
                    var zStep = TUNING.CURRENT.WORLD_Z_STEP_M;
                    var xStep = TUNING.CURRENT.WORLD_X_STEP_M;
                    if (e.code === 'KeyW') {
                        MODEL.instance.nudgeWorldZ(-zStep);
                    } else if (e.code === 'KeyS') {
                        MODEL.instance.nudgeWorldZ(zStep);
                    } else if (e.code === 'KeyA' && MODEL.instance.nudgeWorldX) {
                        MODEL.instance.nudgeWorldX(-xStep);
                    } else if (e.code === 'KeyD' && MODEL.instance.nudgeWorldX) {
                        MODEL.instance.nudgeWorldX(xStep);
                    }
                    e.preventDefault();
                    return;
                }
                if (_isMinusKey(e) && _rootpanel.clearAllGeometry) {
                    _rootpanel.clearAllGeometry();
                    DISPLACE.instance.flash('CLEARED');
                    e.preventDefault();
                    return;
                }
                if (e.key === '[' && _rootpanel.unlockAllMasses) {
                    _rootpanel.unlockAllMasses();
                    e.preventDefault();
                    return;
                }
                if (e.key === ']' && _rootpanel.lockAllMasses) {
                    _rootpanel.lockAllMasses();
                    e.preventDefault();
                    return;
                }
                if (e.key === 'ArrowUp' && MODEL.instance.nudgeWorldZ) {
                    MODEL.instance.nudgeWorldZ(-TUNING.CURRENT.WORLD_Z_STEP_M);
                    e.preventDefault();
                    return;
                }
                if (e.key === 'ArrowDown' && MODEL.instance.nudgeWorldZ) {
                    MODEL.instance.nudgeWorldZ(TUNING.CURRENT.WORLD_Z_STEP_M);
                    e.preventDefault();
                    return;
                }
            }
            if (e.key === 'Escape') {
                if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING ||
                    DISPLACE.instance.state() === DISPLACE.GameState.PAUSE_MENU) {
                    if (CONTROLS_LEGEND.instance.isVisible()) {
                        CONTROLS_LEGEND.instance.toggleVisible();
                        return;
                    }
                }
                if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING) {
                    if (LOCOMOTION_HUD.instance.isVisible()) {
                        LOCOMOTION_HUD.instance.toggleVisible();
                        return;
                    }
                    if (_rootpanel.cancelConnectMode && _rootpanel.cancelConnectMode()) {
                        return;
                    }
                    if (_rootpanel.cancelRightClickGesture && _rootpanel.cancelRightClickGesture()) {
                        return;
                    }
                    DISPLACE.instance.openPauseMenu();
                } else if (DISPLACE.instance.state() === DISPLACE.GameState.PAUSE_MENU) {
                    DISPLACE.instance.resume();
                } else if (DISPLACE.instance.state() === DISPLACE.GameState.OPTIONS) {
                    DISPLACE.instance.closeOptions();
                }
            }
        };
    }

    /** On-screen D-pad + action buttons for touch (device-aware). */
    function _wireTouchChrome()
    {
        var chrome = document.getElementById('touch-chrome');
        if (!chrome || chrome.getAttribute('data-wired') === '1') { return; }
        chrome.setAttribute('data-wired', '1');

        function nudge(dir)
        {
            if (!_inGameView() || _gameInputBlocked()) { return; }
            if (!MODEL.instance.nudgeWorldZ) { return; }
            var zStep = TUNING.CURRENT.WORLD_Z_STEP_M;
            var xStep = TUNING.CURRENT.WORLD_X_STEP_M;
            if (dir === 'n') { MODEL.instance.nudgeWorldZ(-zStep); }
            else if (dir === 's') { MODEL.instance.nudgeWorldZ(zStep); }
            else if (dir === 'w' && MODEL.instance.nudgeWorldX) {
                MODEL.instance.nudgeWorldX(-xStep);
            }
            else if (dir === 'e' && MODEL.instance.nudgeWorldX) {
                MODEL.instance.nudgeWorldX(xStep);
            }
        }

        function act(name)
        {
            if (name === 'pause') {
                if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING) {
                    DISPLACE.instance.openPauseMenu();
                } else if (DISPLACE.instance.state() === DISPLACE.GameState.PAUSE_MENU) {
                    DISPLACE.instance.resume();
                } else if (DISPLACE.instance.state() === DISPLACE.GameState.OPTIONS) {
                    DISPLACE.instance.closeOptions();
                }
                return;
            }
            if (name === 'freeze') {
                if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING &&
                    DISPLACE.instance.toggleCreaturePaused) {
                    DISPLACE.instance.toggleCreaturePaused();
                }
                return;
            }
            if (name === 'legend') {
                var s = DISPLACE.instance.state();
                if (s === DISPLACE.GameState.PLAYING ||
                    s === DISPLACE.GameState.PAUSE_MENU) {
                    CONTROLS_LEGEND.instance.toggleVisible();
                }
                return;
            }
            if (name === 'loco') {
                if (DISPLACE.instance.state() === DISPLACE.GameState.PLAYING) {
                    LOCOMOTION_HUD.instance.toggleVisible();
                }
            }
        }

        function bindHold(btn, dir)
        {
            var timer = null;
            function start(ev)
            {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                nudge(dir);
                if (timer) { clearInterval(timer); }
                timer = setInterval(function () { nudge(dir); }, 120);
            }
            function stop(ev)
            {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (timer) { clearInterval(timer); timer = null; }
            }
            btn.addEventListener('pointerdown', start);
            btn.addEventListener('pointerup', stop);
            btn.addEventListener('pointerleave', stop);
            btn.addEventListener('pointercancel', stop);
        }

        var moves = chrome.querySelectorAll('[data-move]');
        for (var i = 0; i < moves.length; i++) {
            bindHold(moves[i], moves[i].getAttribute('data-move'));
        }
        var acts = chrome.querySelectorAll('[data-act]');
        for (var j = 0; j < acts.length; j++) {
            (function (btn) {
                btn.addEventListener('pointerdown', function (ev) {
                    if (ev.preventDefault) { ev.preventDefault(); }
                    act(btn.getAttribute('data-act'));
                });
            })(acts[j]);
        }
    }

    function _draw()
    {
        if (_viewport) {
            var want = _desiredSize();
            if (_viewport.width !== want.w || _viewport.height !== want.h) {
                _resize();
            }
        }
        var w = _viewport.width;
        var h = _viewport.height;
        var hud = _hudH();
        var state = DISPLACE.instance.state();

        if (state === DISPLACE.GameState.MAIN_MENU ||
            (state === DISPLACE.GameState.OPTIONS &&
             DISPLACE.instance.optionsFrom() === DISPLACE.GameState.MAIN_MENU)) {
            MENU.instance.draw(_ctx, w, h, hud);
            MENU.instance.drawMessage(_ctx, w, h, DISPLACE.instance.message());
            return;
        }

        if (_inGameView()) {
            _rootpanel.draw(_ctx);
            POSTFX.instance.apply(_ctx, 0, hud, w, h - hud);
        }

        if (state === DISPLACE.GameState.PLAYING) {
            MENU.instance.draw(_ctx, w, h, hud);
            LOCOMOTION_HUD.instance.draw(_ctx, w, h, hud);
            CONTROLS_LEGEND.instance.draw(_ctx, w, h, hud);
            _drawCreaturePauseIcon(_ctx, w, h);
        } else if (state === DISPLACE.GameState.PAUSE_MENU ||
                   state === DISPLACE.GameState.OPTIONS) {
            MENU.instance.draw(_ctx, w, h, hud);
            if (state === DISPLACE.GameState.PAUSE_MENU) {
                CONTROLS_LEGEND.instance.draw(_ctx, w, h, hud);
            }
        }

        MENU.instance.drawMessage(_ctx, w, h, DISPLACE.instance.message());
    }

    function _drawCreaturePauseIcon(ctx, w, h)
    {
        if (!DISPLACE.instance.creaturePaused || !DISPLACE.instance.creaturePaused()) {
            return;
        }
        var box = MENU_LAYOUT.creaturePauseIcon(w, h);
        var size = box.size;
        var ink = TUNING.CURRENT.WIRE_INK || '#1a1a1a';
        var barW = Math.max(3, Math.round(size * 0.28));
        var gap = Math.max(3, Math.round(size * 0.22));
        var totalW = barW * 2 + gap;
        var left = box.x + Math.round((size - totalW) * 0.5);
        ctx.fillStyle = ink;
        ctx.fillRect(left, box.y, barW, size);
        ctx.fillRect(left + barW + gap, box.y, barW, size);
    }

    return {
        initialize: _initialize,
        draw: _draw,
        resize: _resize,
        wireTouchChrome: _wireTouchChrome
    };
})();