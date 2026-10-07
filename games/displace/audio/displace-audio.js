'use strict'

// DISPLACE audio — mute toggle now; reactive layers on Day 5+.
var AUDIO = AUDIO || {};

AUDIO.instance = (function()
{
    var _muted = false;

    function __muted(muted)
    {
        if (muted !== undefined)
        {
            _muted = muted;
        }
        return _muted;
    }

    function _toggleMute()
    {
        _muted = !_muted;
    }

    return {
        muted: __muted,
        toggleMute: _toggleMute
    };
})();