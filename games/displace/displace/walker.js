'use strict'

// WALKER — locomotion globals + minimal sandbox puppet template.
var WALKER = WALKER || {};

WALKER.instance = (function()
{
    var _musclePhaseStep = Math.PI * 0.5;

    function _applyGlobals()
    {
        MODEL.instance.k(6.25);
        MODEL.instance.g(-0.02);
        MODEL.instance.f(0.137);
        MODEL.instance.waveAmplitude(0.18);
        MODEL.instance.waveSpeed(0.07);
        MODEL.instance.waveMode(MODEL.WaveModes.AUTOREVERSE);
        MODEL.instance.waveDirection(1);
        MODEL.instance.gravityDirection(MODEL.GravityDirections.DOWN);
    }

    function _addMass(x, y)
    {
        var mass = MASS.create(VECTOR.create(x, y));
        MODEL.instance.addMass(mass);
        return mass;
    }

    function _addSpring(a, b, amplitude, phase, kScale)
    {
        var spring = SPRING.create(a, b, undefined, amplitude, phase, undefined, kScale || 1.0);
        MODEL.instance.addSpring(spring);
        return spring;
    }

    function _spawnMinimal()
    {
        var cx = MODEL.instance.width() * 0.42;
        var footY = 0.06;
        var back = _addMass(cx - 0.38, footY);
        var front = _addMass(cx + 0.38, footY);
        var hip = _addMass(cx, 0.32);
        var chest = _addMass(cx, 0.62);
        var head = _addMass(cx + 0.12, 0.92);

        _addSpring(back, front, 0, 0);
        _addSpring(hip, chest, 0, 0);
        _addSpring(chest, head, 0, 0);
        _addSpring(hip, head, 0, 0);

        _addSpring(hip, back, 0.5, 0, 1.0);
        _addSpring(hip, front, 0.5, Math.PI, 1.0);
        _addSpring(chest, back, 0.5, Math.PI * 0.5, 1.0);
        _addSpring(chest, front, 0.5, Math.PI * 1.5, 1.0);

        MODEL.instance.selectedItem(null);
        MODEL.instance.hoveredItem(null);
    }

    function _respawnMinimal()
    {
        MODEL.instance.clearGeometry();
        _spawnMinimal();
    }

    return {
        applyGlobals: _applyGlobals,
        spawnMinimal: _spawnMinimal,
        respawnMinimal: _respawnMinimal,
        musclePhaseStep: function() { return _musclePhaseStep; }
    };
})();