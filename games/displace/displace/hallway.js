'use strict'

// HALLWAY — 1-point perspective terminal corridor.
var HALLWAY = HALLWAY || {};

HALLWAY.draw = function(ctx, x, y, w, h, opts)
{
    opts = opts || {};
    var fisheye = !!opts.fisheye;
    var bg = '#efebe3';
    var ink = '#1a1a1a';
    var floorPad = TUNING.CURRENT.PLAY_FLOOR_RESERVE_PX;

    var vpX = x + w * 0.5;
    var vpY = y + h * (fisheye ?
        TUNING.CURRENT.FISHEYE_VP_FACTOR : TUNING.CURRENT.NORMAL_VP_FACTOR);
    var xL = x + 1;
    var xR = x + w - 1;
    var yFloor = y + h - floorPad;
    var yCeil = y + 1;
    var xMid = (xL + xR) * 0.5;

    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    _drawDepthGradient(ctx, x, y, w, h, vpX, vpY, fisheye);

    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    // corridor shell — walls meet canvas edges
    _strokeLine(ctx, xL, yFloor, vpX, vpY);
    _strokeLine(ctx, xR, yFloor, vpX, vpY);
    _strokeLine(ctx, xL, yCeil, vpX, vpY);
    _strokeLine(ctx, xR, yCeil, vpX, vpY);
    _strokeLine(ctx, xL, yCeil, xL, yFloor);
    _strokeLine(ctx, xR, yCeil, xR, yFloor);
    _strokeLine(ctx, xL, yFloor, xR, yFloor);
    _strokeLine(ctx, xL, yCeil, xR, yCeil);

    if (fisheye) {
        _drawFisheyeCeilingArc(ctx, xL, xR, yCeil, yFloor, w, h);
    }

    // floor depth lines
    var tileCount = 6;
    var i;
    for (i = 1; i < tileCount; i++) {
        var fx = xL + (xR - xL) * (i / tileCount);
        _strokeLine(ctx, fx, yFloor, vpX, vpY);
    }
    _strokeLine(ctx, xMid, yFloor, vpX, vpY);

    // receding doors — single-line frames on each wall
    var doorDepths = [0.20, 0.34, 0.48, 0.62, 0.74, 0.84];
    var doorW = 0.10;
    var doorH = 0.70;
    doorDepths.forEach(function(t) {
        _drawWallDoor(ctx, 'left', t, doorW, doorH, xL, xR, yFloor, yCeil, vpX, vpY);
        _drawWallDoor(ctx, 'right', t, doorW, doorH, xL, xR, yFloor, yCeil, vpX, vpY);
    });

    _drawExitDoor(ctx, xL, xR, yFloor, yCeil, vpX, vpY, 0.02, 0.12, 0.76);

    _drawEndSilhouette(ctx, xMid, yFloor, yCeil, vpX, vpY, fisheye);
};

function _lerp(a, b, t)
{
    return a + (b - a) * t;
}

function _ray(x0, y0, x1, y1, t)
{
    return { x: _lerp(x0, x1, t), y: _lerp(y0, y1, t) };
}

function _strokeLine(ctx, x0, y0, x1, y1)
{
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.closePath();
}

function _wallFloor(side, t, xL, xR, yFloor, vpX, vpY)
{
    var xWall = (side === 'left') ? xL : xR;
    return _ray(xWall, yFloor, vpX, vpY, t);
}

function _wallCeil(side, t, xL, xR, yCeil, vpX, vpY)
{
    var xWall = (side === 'left') ? xL : xR;
    return _ray(xWall, yCeil, vpX, vpY, t);
}

// Single open door frame on the wall plane (mockup style).
function _drawWallDoor(ctx, side, t, tWidth, heightRatio, xL, xR, yFloor, yCeil, vpX, vpY)
{
    var t2 = Math.min(t + tWidth, 0.90);
    var bot1 = _wallFloor(side, t, xL, xR, yFloor, vpX, vpY);
    var bot2 = _wallFloor(side, t2, xL, xR, yFloor, vpX, vpY);
    var top1 = {
        x: _lerp(bot1.x, _wallCeil(side, t, xL, xR, yCeil, vpX, vpY).x, heightRatio),
        y: _lerp(bot1.y, _wallCeil(side, t, xL, xR, yCeil, vpX, vpY).y, heightRatio)
    };
    var top2 = {
        x: _lerp(bot2.x, _wallCeil(side, t2, xL, xR, yCeil, vpX, vpY).x, heightRatio),
        y: _lerp(bot2.y, _wallCeil(side, t2, xL, xR, yCeil, vpX, vpY).y, heightRatio)
    };

    ctx.beginPath();
    ctx.moveTo(bot1.x, bot1.y);
    ctx.lineTo(top1.x, top1.y);
    ctx.lineTo(top2.x, top2.y);
    ctx.lineTo(bot2.x, bot2.y);
    ctx.closePath();
    ctx.stroke();

    var tickLen = _lerp(10, 2, t);
    var tickX = (side === 'left') ? 1 : -1;
    _strokeLine(ctx, bot1.x, bot1.y, bot1.x + tickX * tickLen, bot1.y);
    _strokeLine(ctx, bot2.x, bot2.y, bot2.x + tickX * tickLen, bot2.y);
}

function _drawExitDoor(ctx, xL, xR, yFloor, yCeil, vpX, vpY, t0, t1, heightRatio)
{
    var bot1 = _wallFloor('left', t0, xL, xR, yFloor, vpX, vpY);
    var bot2 = _wallFloor('left', t1, xL, xR, yFloor, vpX, vpY);
    var top1 = {
        x: _lerp(bot1.x, _wallCeil('left', t0, xL, xR, yCeil, vpX, vpY).x, heightRatio),
        y: _lerp(bot1.y, _wallCeil('left', t0, xL, xR, yCeil, vpX, vpY).y, heightRatio)
    };
    var top2 = {
        x: _lerp(bot2.x, _wallCeil('left', t1, xL, xR, yCeil, vpX, vpY).x, heightRatio),
        y: _lerp(bot2.y, _wallCeil('left', t1, xL, xR, yCeil, vpX, vpY).y, heightRatio)
    };

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bot1.x, bot1.y);
    ctx.lineTo(top1.x, top1.y);
    ctx.lineTo(top2.x, top2.y);
    ctx.lineTo(bot2.x, bot2.y);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 1;

    var labelX = bot1.x + 10;
    var labelTop = top1.y + 10;
    var labelBot = bot1.y - 6;
    var letters = 'EXIT';
    var step = (labelBot - labelTop) / (letters.length - 1);
    ctx.font = 'bold 12px Verdana, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < letters.length; i++) {
        ctx.fillText(letters.charAt(i), labelX, labelTop + step * i);
    }
}

function _drawFisheyeCeilingArc(ctx, xL, xR, yCeil, yFloor, w, h)
{
    var midX = (xL + xR) * 0.5;
    var sag = Math.min(48, h * 0.072);
    var floorSag = Math.min(22, h * 0.034);
    ctx.beginPath();
    ctx.moveTo(xL, yCeil);
    ctx.quadraticCurveTo(midX, yCeil + sag, xR, yCeil);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xL, yFloor);
    ctx.quadraticCurveTo(midX, yFloor - floorSag, xR, yFloor);
    ctx.stroke();
}

function _drawDepthGradient(ctx, x, y, w, h, vpX, vpY, fisheye)
{
    var radius = Math.max(w, h) * (fisheye ? 0.58 : 0.48);
    var grad = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, radius);
    if (fisheye) {
        grad.addColorStop(0, 'rgba(30,26,22,0.30)');
        grad.addColorStop(0.32, 'rgba(0,0,0,0.07)');
        grad.addColorStop(0.68, 'rgba(0,0,0,0.02)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
        grad.addColorStop(0, 'rgba(0,0,0,0.38)');
        grad.addColorStop(0.28, 'rgba(0,0,0,0.12)');
        grad.addColorStop(0.62, 'rgba(0,0,0,0.03)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
}

function _drawEndSilhouette(ctx, xMid, yFloor, yCeil, vpX, vpY, fisheye)
{
    var t = fisheye ? 0.90 : 0.86;
    var base = _ray(xMid, yFloor, vpX, vpY, t);
    var top = _ray(xMid, yCeil, vpX, vpY, t);
    if (fisheye) {
        ctx.lineWidth = 1.25;
        _strokeLine(ctx, top.x, top.y + 2, base.x, base.y - 2);
        ctx.lineWidth = 1;
        return;
    }
    var sw = _lerp(22, 5, t);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(top.x - sw * 0.5, top.y + 2, sw, base.y - top.y - 2);
}