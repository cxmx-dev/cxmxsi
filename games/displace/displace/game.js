'use strict'

// Konstrukted Displacement — game state, save/load, settings.
var DISPLACE = DISPLACE || {};

DISPLACE.GameState = {
    MAIN_MENU: 'main_menu',
    PLAYING: 'playing',
    PAUSE_MENU: 'pause_menu',
    OPTIONS: 'options'
};
Object.freeze(DISPLACE.GameState);

DISPLACE.instance = (function()
{
    var SAVE_KEY = 'konstrukted-displacement-save-v1';
    var SETTINGS_KEY = 'konstrukted-displacement-settings-v1';

    var _state = DISPLACE.GameState.MAIN_MENU;
    var _optionsFrom = DISPLACE.GameState.MAIN_MENU;
    var _snapshot = null;
    var _defaultModel = null;
    var _message = '';
    var _messageUntil = 0;
    var _fisheye = false;
    var _muted = false;
    var _creaturePaused = false;

    function _loadSettings()
    {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) { return; }
            var s = JSON.parse(raw);
            if (s.muted !== undefined) {
                _muted = !!s.muted;
                AUDIO.instance.muted(_muted);
            }
        } catch (e) { /* ignore */ }
        _fisheye = false;
        POSTFX.instance.fisheyeEnabled(false);
    }

    function _saveSettings()
    {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            fisheye: _fisheye,
            muted: AUDIO.instance.muted()
        }));
    }

    function _flash(msg, ms)
    {
        _message = msg;
        _messageUntil = Date.now() + (ms || 1800);
    }

    function __state(s)
    {
        if (s !== undefined) { _state = s; }
        return _state;
    }

    function __optionsFrom(v)
    {
        if (v !== undefined) { _optionsFrom = v; }
        return _optionsFrom;
    }

    function __fisheye(v)
    {
        if (v !== undefined) {
            _fisheye = !!v;
            POSTFX.instance.fisheyeEnabled(_fisheye);
            _saveSettings();
        }
        return _fisheye;
    }

    function __message()
    {
        if (_message && Date.now() > _messageUntil) { _message = ''; }
        return _message;
    }

    function _setDefaultModel(json)
    {
        _defaultModel = json;
    }

    function _captureSnapshot()
    {
        _snapshot = MODEL.instance.exportModel();
    }

    function _isPlaying()
    {
        return _state === DISPLACE.GameState.PLAYING;
    }

    function _simulationActive()
    {
        return _state === DISPLACE.GameState.PLAYING && !_creaturePaused;
    }

    function _freezeCreatureMotion()
    {
        MODEL.instance.masses.forEach(function(mass) {
            mass.v.set(0, 0);
            mass.a.set(0, 0);
        });
    }

    function _creaturePaused()
    {
        return _creaturePaused;
    }

    function _setCreaturePaused(v)
    {
        _creaturePaused = !!v;
        if (_creaturePaused) {
            _freezeCreatureMotion();
        }
        return _creaturePaused;
    }

    function _toggleCreaturePaused()
    {
        return _setCreaturePaused(!_creaturePaused);
    }

    function _clearCreaturePaused()
    {
        _creaturePaused = false;
    }

    function _newGame()
    {
        if (_defaultModel) {
            MODEL.instance.importModel(_defaultModel);
        }
        MODEL.instance.mode(MODEL.Modes.SIMULATE);
        MODEL.instance.selectedItem(null);
        MODEL.instance.hoveredItem(null);
        if (MODEL.instance.resetWorldPlacement) {
            MODEL.instance.resetWorldPlacement();
        }
        if (SCENE_CAMERA.instance.reset) {
            SCENE_CAMERA.instance.reset();
        }
        _clearCreaturePaused();
        _captureSnapshot();
        _state = DISPLACE.GameState.PLAYING;
    }

    function _sandboxGame()
    {
        MODEL.instance.clearGeometry();
        MODEL.instance.name('sandbox');
        WALKER.instance.applyGlobals();
        WALKER.instance.spawnMinimal();
        MODEL.instance.mode(MODEL.Modes.SIMULATE);
        MODEL.instance.selectedItem(null);
        MODEL.instance.hoveredItem(null);
        if (SCENE_CAMERA.instance.reset) {
            SCENE_CAMERA.instance.reset();
        }
        _clearCreaturePaused();
        _captureSnapshot();
        _state = DISPLACE.GameState.PLAYING;
    }

    function _saveGame()
    {
        try {
            localStorage.setItem(SAVE_KEY, MODEL.instance.exportModel());
            _flash('GAME SAVED');
            return true;
        } catch (e) {
            _flash('SAVE FAILED');
            return false;
        }
    }

    function _loadGame()
    {
        try {
            var raw = localStorage.getItem(SAVE_KEY);
            if (!raw) {
                _flash('NO SAVE FOUND');
                return false;
            }
            MODEL.instance.importModel(raw);
            MODEL.instance.mode(MODEL.Modes.SIMULATE);
            MODEL.instance.selectedItem(null);
            _clearCreaturePaused();
            _captureSnapshot();
            _state = DISPLACE.GameState.PLAYING;
            _flash('GAME LOADED');
            return true;
        } catch (e) {
            _flash('LOAD FAILED');
            return false;
        }
    }

    function _hasSave()
    {
        return !!localStorage.getItem(SAVE_KEY);
    }

    function _openPauseMenu()
    {
        if (_state === DISPLACE.GameState.PLAYING) {
            _state = DISPLACE.GameState.PAUSE_MENU;
        }
    }

    function _resume()
    {
        if (_state === DISPLACE.GameState.PAUSE_MENU ||
            _state === DISPLACE.GameState.OPTIONS) {
            _state = DISPLACE.GameState.PLAYING;
        }
    }

    function _openOptions(from)
    {
        _optionsFrom = from || _state;
        _state = DISPLACE.GameState.OPTIONS;
    }

    function _closeOptions()
    {
        if (_optionsFrom === DISPLACE.GameState.MAIN_MENU) {
            _state = DISPLACE.GameState.MAIN_MENU;
        } else {
            _state = DISPLACE.GameState.PAUSE_MENU;
        }
    }

    function _goMainMenu()
    {
        _clearCreaturePaused();
        _state = DISPLACE.GameState.MAIN_MENU;
    }

    function _quit()
    {
        _goMainMenu();
        _flash('THANKS FOR PLAYING');
    }

    function _reset()
    {
        if (_snapshot) {
            MODEL.instance.importModel(_snapshot);
        }
        MODEL.instance.selectedItem(null);
        MODEL.instance.hoveredItem(null);
    }

    function _initialize()
    {
        _loadSettings();
        _state = DISPLACE.GameState.MAIN_MENU;
    }

    return {
        state: __state,
        optionsFrom: __optionsFrom,
        fisheye: __fisheye,
        message: __message,
        flash: _flash,
        setDefaultModel: _setDefaultModel,
        captureSnapshot: _captureSnapshot,
        isPlaying: _isPlaying,
        simulationActive: _simulationActive,
        creaturePaused: _creaturePaused,
        setCreaturePaused: _setCreaturePaused,
        toggleCreaturePaused: _toggleCreaturePaused,
        newGame: _newGame,
        sandboxGame: _sandboxGame,
        saveGame: _saveGame,
        loadGame: _loadGame,
        hasSave: _hasSave,
        openPauseMenu: _openPauseMenu,
        resume: _resume,
        openOptions: _openOptions,
        closeOptions: _closeOptions,
        goMainMenu: _goMainMenu,
        quit: _quit,
        reset: _reset,
        initialize: _initialize
    };
})();