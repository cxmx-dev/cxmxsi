'use strict';

/* Breakout with the top of the 1980s bat symbol as a scoop. */
(function (factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.BAT_OUT = api;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.boot);
        else api.boot();
    }
})(function () {
    var W = 960;
    var H = 540;
    var MAX_DT = 0.05;
    var CROWN_W = 220;
    var BASE_H = 12;
    var SIDE_H = 48;
    var MARGIN = 16;
    var HANG_Y = 42;
    var TOP_DEPTH = 26;
    var BAT_YELLOW = '#F6D000';
    var ACTION_WORDS = [
        'POW!', 'BAM!', 'BAP!', 'ZAP!', 'WHAM!', 'BIFF!', 'SOCK!', 'OOF!', 'BONK!',
        'BOOM!', 'BANG!', 'CRASH!', 'KAPOW!', 'ZLONK!', 'EEOW!', 'SPLAT!', 'THWAK!', 'VRONK!',
        'RAAK!', 'AWKK!', 'KLONK!', 'WHACK!', 'CRUNCH!', 'BLOP!', 'PLONK!', 'SWAK!', 'URKK!',
        'ZWAPP!', 'POWIE!', 'KRUNCH!', 'CLANG!', 'THUNK!', 'WHAP!', 'BLOOP!', 'ZOWIE!',
        'BLAM!', 'KABOOM!', 'SMASH!', 'THWACK!', 'OOOF!', 'VRIPP!', 'KAPOW!', 'BIFF!', 'SOCK!', 'ZAP!'
    ];
    var BUBBLE_COLORS = ['#E10600', '#FFD100', '#1B4DFF', '#00A651', '#FF6A00', '#E10098', '#00B5D1', '#7A28C8', '#F6D000'];
    var BAT_SRC_W = 545;
    var BAT_HALF_H = 126;
    var BAT_DRAW_H = Math.round(CROWN_W * BAT_HALF_H / BAT_SRC_W);
    var batGfx = null;

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function controlAxis(negative, positive, stick) {
        var v = 0;
        if (negative) v -= 1;
        if (positive) v += 1;
        if (typeof stick === 'number' && stick) {
            if (v === 0) v = stick;
            else if (v > 0 && stick > 0) v = Math.max(v, stick);
            else if (v < 0 && stick < 0) v = Math.min(v, stick);
            else v = clamp(v + stick, -1, 1);
        }
        return clamp(v, -1, 1);
    }

    function baseBottom() {
        return H - MARGIN;
    }

    function baseTop() {
        return baseBottom() - BASE_H;
    }

    /* Top contour of the 1980s bat: wing tips, tall ears, scooped head between them. */
    function crownEdge() {
        var top = baseTop();
        var keys = [
            [0.00, 29, 'outer', -1],
            [0.06, 5, 'scoop', 1],
            [0.20, 17, 'scoop', 1],
            [0.34, 8, 'scoop', 1],
            [0.41, 48, 'outer', -1],
            [0.47, 11, 'scoop', 1],
            [0.50, 6, 'scoop', 0],
            [0.53, 11, 'scoop', -1],
            [0.59, 48, 'outer', 1],
            [0.66, 8, 'scoop', -1],
            [0.80, 17, 'scoop', -1],
            [0.94, 5, 'scoop', -1],
            [1.00, 29, 'outer', 1]
        ];
        var pts = [];
        for (var i = 0; i < keys.length - 1; i++) {
            var a = keys[i];
            var b = keys[i + 1];
            var steps = 7;
            for (var s = 0; s < steps; s++) {
                var t = s / steps;
                pts.push({
                    x: (a[0] + (b[0] - a[0]) * t) * CROWN_W,
                    y: top - (a[1] + (b[1] - a[1]) * t),
                    zone: a[2],
                    push: a[3]
                });
            }
        }
        var last = keys[keys.length - 1];
        pts.push({
            x: last[0] * CROWN_W,
            y: top - last[1],
            zone: last[2],
            push: last[3]
        });
        return pts;
    }

    function crownZone(paddleX, x) {
        var local = x - paddleX;
        if (local < 0 || local > CROWN_W) return null;
        var edge = crownEdge();
        for (var i = 0; i < edge.length - 1; i++) {
            var a = edge[i];
            var b = edge[i + 1];
            if (local < a.x || local > b.x) continue;
            var span = b.x - a.x;
            var t = span ? (local - a.x) / span : 0;
            return {
                y: a.y + (b.y - a.y) * t,
                zone: a.zone,
                push: a.push
            };
        }
        return null;
    }

    function crownSurfaceY(paddleX, x) {
        var zone = crownZone(paddleX, x);
        return zone ? zone.y : null;
    }

    function crownPoints(paddleX) {
        var edge = crownEdge();
        var pts = [[paddleX, baseBottom()]];
        for (var i = 0; i < edge.length; i++) pts.push([paddleX + edge[i].x, edge[i].y]);
        pts.push([paddleX + CROWN_W, baseBottom()]);
        return pts;
    }

    /* Lower edge of the bat, hung from the top so the symbol wraps the board. */
    function topPoints(paddleX) {
        var keys = [
            [0.00, 26],
            [0.07, 6],
            [0.16, 22],
            [0.27, 5],
            [0.38, 18],
            [0.50, 10],
            [0.62, 18],
            [0.73, 5],
            [0.84, 22],
            [0.93, 6],
            [1.00, 26]
        ];
        var pts = [[paddleX, HANG_Y]];
        for (var i = 0; i < keys.length - 1; i++) {
            var a = keys[i];
            var b = keys[i + 1];
            var steps = 6;
            for (var s = 0; s < steps; s++) {
                var t = s / steps;
                pts.push([
                    paddleX + (a[0] + (b[0] - a[0]) * t) * CROWN_W,
                    HANG_Y + (a[1] + (b[1] - a[1]) * t)
                ]);
            }
        }
        pts.push([paddleX + CROWN_W, HANG_Y + keys[keys.length - 1][1]]);
        pts.push([paddleX + CROWN_W, HANG_Y]);
        return pts;
    }

    function create() {
        var cols = 9;
        var rows = 5;
        var pad = 8;
        var offsetLeft = 36;
        var brickH = 28;
        var stack = rows * brickH + (rows - 1) * pad;
        var gapTop = HANG_Y + BAT_DRAW_H;
        var gapBottom = H - MARGIN - BAT_DRAW_H;
        var offsetTop = Math.round(gapTop + (gapBottom - gapTop - stack) / 2);
        var brickW = (W - offsetLeft * 2 - (cols - 1) * pad) / cols;
        var bricks = [];
        var wordIndex = 0;
        for (var c = 0; c < cols; c++) {
            bricks[c] = [];
            for (var r = 0; r < rows; r++) {
                bricks[c][r] = {
                    status: 1,
                    color: BUBBLE_COLORS[wordIndex % BUBBLE_COLORS.length],
                    word: ACTION_WORDS[wordIndex % ACTION_WORDS.length]
                };
                wordIndex++;
            }
        }
        var s = {
            cols: cols,
            rows: rows,
            pad: pad,
            offsetLeft: offsetLeft,
            offsetTop: offsetTop,
            brickW: brickW,
            brickH: brickH,
            bricks: bricks,
            paddleX: (W - CROWN_W) / 2,
            ballR: 8,
            ballX: W / 2,
            ballY: 0,
            ballSpeedX: 0,
            ballSpeedY: 0,
            score: 0,
            lives: 5,
            hold: 0,
            over: false
        };
        serve(s);
        return s;
    }

    function serve(s) {
        var stack = 5 * (s.brickH + s.pad);
        s.ballX = s.paddleX + CROWN_W / 2;
        s.ballY = s.offsetTop + stack + 24;
        var speed = H * 0.48;
        s.ballSpeedX = speed * 0.12 * (Math.random() < 0.5 ? 1 : -1);
        s.ballSpeedY = speed;
        s.hold = 0.35;
    }

    function brickBox(s, c, r) {
        return {
            x: c * (s.brickW + s.pad) + s.offsetLeft,
            y: r * (s.brickH + s.pad) + s.offsetTop,
            w: s.brickW,
            h: s.brickH
        };
    }

    function resolveBrick(s, box) {
        var r = s.ballR;
        var overlapLeft = (s.ballX + r) - box.x;
        var overlapRight = (box.x + box.w) - (s.ballX - r);
        var overlapTop = (s.ballY + r) - box.y;
        var overlapBottom = (box.y + box.h) - (s.ballY - r);
        if (overlapLeft <= 0 || overlapRight <= 0 || overlapTop <= 0 || overlapBottom <= 0) return false;
        var minX = Math.min(overlapLeft, overlapRight);
        var minY = Math.min(overlapTop, overlapBottom);
        if (minX < minY) {
            if (overlapLeft < overlapRight) {
                s.ballX -= overlapLeft;
                if (s.ballSpeedX > 0) s.ballSpeedX = -s.ballSpeedX;
            } else {
                s.ballX += overlapRight;
                if (s.ballSpeedX < 0) s.ballSpeedX = -s.ballSpeedX;
            }
        } else if (overlapTop < overlapBottom) {
            s.ballY -= overlapTop;
            if (s.ballSpeedY > 0) s.ballSpeedY = -s.ballSpeedY;
        } else {
            s.ballY += overlapBottom;
            if (s.ballSpeedY < 0) s.ballSpeedY = -s.ballSpeedY;
        }
        return true;
    }

    function scoopVelocity(s, nx, ny) {
        var swing = clamp(s.paddleVx || 0, -W * 1.5, W * 1.5);
        var vx = s.ballSpeedX;
        var vy = s.ballSpeedY;
        var incoming = Math.abs(vy);
        var vn = vx * nx + vy * ny;
        if (vn < 0) {
            vx -= 2 * vn * nx;
            vy -= 2 * vn * ny;
        }
        vx += swing * 1.15;
        var upFace = Math.max(0, -ny);
        vy -= Math.abs(swing) * 0.7 * upFace;
        var lift = Math.max(Math.abs(Math.min(vy, 0)), incoming * 0.8 + Math.abs(swing) * 0.8 + H * 0.22);
        vy = -Math.min(H * 1.55, lift);
        var speed = Math.sqrt(vx * vx + vy * vy) || 1;
        var cap = H * 1.7;
        if (speed > cap) {
            vx = vx / speed * cap;
            vy = vy / speed * cap;
        }
        vn = vx * nx + vy * ny;
        if (vn < 0) {
            vx -= 2 * vn * nx;
            vy -= 2 * vn * ny;
        }
        s.ballSpeedX = vx;
        s.ballSpeedY = vy;
    }

    function closestOnSeg(px, py, ax, ay, bx, by) {
        var abx = bx - ax;
        var aby = by - ay;
        var den = abx * abx + aby * aby;
        var t = den ? ((px - ax) * abx + (py - ay) * aby) / den : 0;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        return { x: ax + abx * t, y: ay + aby * t };
    }

    function pointInPoly(x, y, pts) {
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var yi = pts[i][1];
            var yj = pts[j][1];
            if ((yi > y) === (yj > y)) continue;
            var xi = pts[i][0];
            var xj = pts[j][0];
            var cross = (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi;
            if (x < cross) inside = !inside;
        }
        return inside;
    }

    function circleHitsPoly(pts, x, y, r) {
        if (pointInPoly(x, y, pts)) return true;
        var r2 = r * r;
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i];
            var b = pts[(i + 1) % pts.length];
            var q = closestOnSeg(x, y, a[0], a[1], b[0], b[1]);
            var dx = x - q.x;
            var dy = y - q.y;
            if (dx * dx + dy * dy <= r2) return true;
        }
        return false;
    }

    function nearestEdge(pts, x, y) {
        var best = null;
        var bottomY = baseBottom();
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i];
            var b = pts[(i + 1) % pts.length];
            var q = closestOnSeg(x, y, a[0], a[1], b[0], b[1]);
            var dx = x - q.x;
            var dy = y - q.y;
            var d2 = dx * dx + dy * dy;
            if (best && d2 >= best.d2) continue;
            var ex = b[0] - a[0];
            var ey = b[1] - a[1];
            var len = Math.sqrt(ex * ex + ey * ey) || 1;
            var nx = -ey / len;
            var ny = ex / len;
            var mx = (a[0] + b[0]) / 2;
            var my = (a[1] + b[1]) / 2;
            if (pointInPoly(mx + nx * 3, my + ny * 3, pts)) {
                nx = -nx;
                ny = -ny;
            }
            best = {
                d2: d2,
                x: q.x,
                y: q.y,
                nx: nx,
                ny: ny,
                bottom: Math.abs(a[1] - bottomY) < 1.5 && Math.abs(b[1] - bottomY) < 1.5
            };
        }
        return best;
    }

    function pushOutOfCrown(s, pts, scoop) {
        var bounced = false;
        for (var n = 0; n < 8; n++) {
            if (!circleHitsPoly(pts, s.ballX, s.ballY, s.ballR)) break;
            var info = nearestEdge(pts, s.ballX, s.ballY);
            if (!info) break;
            var inside = pointInPoly(s.ballX, s.ballY, pts);
            var dist = Math.sqrt(info.d2);
            var nx = info.nx;
            var ny = info.ny;
            if (!inside && dist > 0.001) {
                nx = (s.ballX - info.x) / dist;
                ny = (s.ballY - info.y) / dist;
            }
            var gap = s.ballR + 0.8;
            if (inside || dist < 0.001) {
                s.ballX = info.x + nx * gap;
                s.ballY = info.y + ny * gap;
            } else {
                var push = gap - dist;
                if (push > 0) {
                    s.ballX += nx * push;
                    s.ballY += ny * push;
                }
            }
            var vn = s.ballSpeedX * nx + s.ballSpeedY * ny;
            if (vn < 0) {
                if (scoop && !info.bottom) scoopVelocity(s, nx, ny);
                else {
                    s.ballSpeedX -= 2 * vn * nx;
                    s.ballSpeedY -= 2 * vn * ny;
                }
                bounced = true;
            }
        }
        return bounced;
    }

    function hitCrown(s, prevX, prevY, pts, scoop) {
        var dx = s.ballX - prevX;
        var dy = s.ballY - prevY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(dist / 3));
        for (var i = 1; i <= steps; i++) {
            var t = i / steps;
            var x = prevX + dx * t;
            var y = prevY + dy * t;
            if (!circleHitsPoly(pts, x, y, s.ballR)) continue;
            s.ballX = x;
            s.ballY = y;
            return pushOutOfCrown(s, pts, scoop);
        }
        if (circleHitsPoly(pts, s.ballX, s.ballY, s.ballR)) return pushOutOfCrown(s, pts, scoop);
        return false;
    }

    function ballTouchesCrown(s) {
        var r = s.ballR - 0.25;
        if (batGfx) {
            return maskOverlaps(batGfx.bottom, s.ballX - s.paddleX, s.ballY - bottomBatY(), batGfx.dw, batGfx.dh, r) ||
                maskOverlaps(batGfx.top, s.ballX - s.paddleX, s.ballY - HANG_Y, batGfx.dw, batGfx.dh, r);
        }
        return circleHitsPoly(crownPoints(s.paddleX), s.ballX, s.ballY, r) ||
            circleHitsPoly(topPoints(s.paddleX), s.ballX, s.ballY, r);
    }

    function bottomBatY() {
        return H - MARGIN - (batGfx ? batGfx.dh : BAT_DRAW_H);
    }

    function makeMask(img, sy, sh) {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = sh;
        var g = canvas.getContext('2d');
        g.drawImage(img, 0, sy, img.width, sh, 0, 0, img.width, sh);
        var pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
        var data = new Uint8Array(canvas.width * canvas.height);
        for (var i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3] > 40 ? 1 : 0;
        return { w: canvas.width, h: canvas.height, data: data, canvas: canvas };
    }

    function loadBatSymbol() {
        if (typeof Image === 'undefined') return;
        var img = new Image();
        img.onload = function () {
            var half = Math.floor(img.height / 2);
            var dw = CROWN_W;
            var dh = Math.round(dw * half / img.width);
            batGfx = {
                bottom: makeMask(img, 0, half),
                top: makeMask(img, half, img.height - half),
                dw: dw,
                dh: dh
            };
        };
        img.src = 'data:image/png;base64,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';
    }

    function maskOverlaps(mask, lx, ly, dw, dh, rad) {
        var sx = mask.w / dw;
        var sy = mask.h / dh;
        var mx = lx * sx;
        var my = ly * sy;
        var rx = Math.max(1, rad * sx);
        var ry = Math.max(1, rad * sy);
        var x0 = Math.max(0, Math.floor(mx - rx));
        var x1 = Math.min(mask.w - 1, Math.ceil(mx + rx));
        var y0 = Math.max(0, Math.floor(my - ry));
        var y1 = Math.min(mask.h - 1, Math.ceil(my + ry));
        var step = Math.max(1, Math.floor(Math.min(rx, ry) / 3));
        for (var y = y0; y <= y1; y += step) {
            for (var x = x0; x <= x1; x += step) {
                var dx = (x + 0.5 - mx) / rx;
                var dy = (y + 0.5 - my) / ry;
                if (dx * dx + dy * dy > 1) continue;
                if (mask.data[y * mask.w + x]) return true;
            }
        }
        return false;
    }

    function maskContact(mask, lx, ly, dw, dh, rad) {
        var sx = mask.w / dw;
        var sy = mask.h / dh;
        var mx = lx * sx;
        var my = ly * sy;
        var rx = Math.max(1, rad * sx);
        var ry = Math.max(1, rad * sy);
        var x0 = Math.max(0, Math.floor(mx - rx));
        var x1 = Math.min(mask.w - 1, Math.ceil(mx + rx));
        var y0 = Math.max(0, Math.floor(my - ry));
        var y1 = Math.min(mask.h - 1, Math.ceil(my + ry));
        var n = 0;
        var ax = 0;
        var ay = 0;
        var step = Math.max(1, Math.floor(Math.min(rx, ry) / 3));
        for (var y = y0; y <= y1; y += step) {
            for (var x = x0; x <= x1; x += step) {
                var dx = (x + 0.5 - mx) / rx;
                var dy = (y + 0.5 - my) / ry;
                if (dx * dx + dy * dy > 1) continue;
                if (!mask.data[y * mask.w + x]) continue;
                n++;
                ax += x + 0.5;
                ay += y + 0.5;
            }
        }
        if (!n) return null;
        return { x: (ax / n) / sx, y: (ay / n) / sy };
    }

    function separateMask(s, mask, ox, oy, dw, dh, scoop) {
        var bounced = false;
        for (var i = 0; i < 10; i++) {
            var hit = maskContact(mask, s.ballX - ox, s.ballY - oy, dw, dh, s.ballR);
            if (!hit) break;
            var nx = (s.ballX - ox) - hit.x;
            var ny = (s.ballY - oy) - hit.y;
            var len = Math.sqrt(nx * nx + ny * ny) || 1;
            nx /= len;
            ny /= len;
            s.ballX += nx * 2.2;
            s.ballY += ny * 2.2;
            var vn = s.ballSpeedX * nx + s.ballSpeedY * ny;
            if (vn < 0) {
                if (scoop) scoopVelocity(s, nx, ny);
                else {
                    s.ballSpeedX -= 2 * vn * nx;
                    s.ballSpeedY -= 2 * vn * ny;
                }
                bounced = true;
            }
        }
        return bounced;
    }

    function hitMask(s, prevX, prevY, mask, ox, oy, dw, dh, scoop) {
        var dx = s.ballX - prevX;
        var dy = s.ballY - prevY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(dist / 3));
        for (var i = 1; i <= steps; i++) {
            var t = i / steps;
            var x = prevX + dx * t;
            var y = prevY + dy * t;
            if (!maskOverlaps(mask, x - ox, y - oy, dw, dh, s.ballR)) continue;
            s.ballX = x;
            s.ballY = y;
            return separateMask(s, mask, ox, oy, dw, dh, scoop);
        }
        if (maskOverlaps(mask, s.ballX - ox, s.ballY - oy, dw, dh, s.ballR)) {
            return separateMask(s, mask, ox, oy, dw, dh, scoop);
        }
        return false;
    }

    function step(s, dt, input) {
        var events = [];
        if (s.over) return events;
        input = input || {};
        dt = Math.min(MAX_DT, Math.max(0, dt));
        var travel = W * 0.78;
        if (input.aim && !input.stickX) s.paddleX = input.aimX - CROWN_W / 2;
        var xMove = controlAxis(input.left, input.right, input.stickX);
        if (xMove) s.paddleX += travel * xMove * dt;
        s.paddleX = clamp(s.paddleX, 0, W - CROWN_W);
        if (typeof s.prevPaddleX !== 'number') s.prevPaddleX = s.paddleX;
        var elapsed = dt > 0 ? dt : 0.016;
        s.paddleVx = clamp((s.paddleX - s.prevPaddleX) / elapsed, -W * 1.15, W * 1.15);
        s.prevPaddleX = s.paddleX;

        if (s.hold > 0) {
            s.hold -= dt;
            s.ballX = s.paddleX + CROWN_W / 2;
            return events;
        }

        var prevX = s.ballX;
        var prevY = s.ballY;
        s.ballX += s.ballSpeedX * dt;
        s.ballY += s.ballSpeedY * dt;
        var r = s.ballR;

        if (s.ballX - r <= 0 && s.ballSpeedX < 0) {
            s.ballX = r;
            s.ballSpeedX *= -1;
            events.push('bounce');
        } else if (s.ballX + r >= W && s.ballSpeedX > 0) {
            s.ballX = W - r;
            s.ballSpeedX *= -1;
            events.push('bounce');
        }
        if (s.ballY - r < HANG_Y && s.ballSpeedY < 0) {
            s.ballY = HANG_Y + r;
            s.ballSpeedY = Math.abs(s.ballSpeedY);
            events.push('bounce');
        }

        var hit = false;
        for (var c = 0; c < s.cols && !hit; c++) {
            for (var row = 0; row < s.rows; row++) {
                var brick = s.bricks[c][row];
                if (brick.status !== 1) continue;
                if (!resolveBrick(s, brickBox(s, c, row))) continue;
                brick.status = 0;
                s.score += 1;
                events.push('brick');
                hit = true;
                if (s.score >= s.cols * s.rows) {
                    s.over = true;
                    events.push('win');
                }
                break;
            }
        }

        if (batGfx) {
            var dh = batGfx.dh;
            if (!s.over && hitMask(s, prevX, prevY, batGfx.top, s.paddleX, HANG_Y, batGfx.dw, dh, false)) events.push('bounce');
            if (!s.over && hitMask(s, prevX, prevY, batGfx.bottom, s.paddleX, bottomBatY(), batGfx.dw, dh, true)) events.push('paddle');
        } else {
            if (!s.over && hitCrown(s, prevX, prevY, topPoints(s.paddleX), false)) events.push('bounce');
            if (!s.over && hitCrown(s, prevX, prevY, crownPoints(s.paddleX), true)) events.push('paddle');
        }
        if (s.ballY - r < HANG_Y) {
            s.ballY = HANG_Y + r;
            if (s.ballSpeedY < 0) s.ballSpeedY = Math.abs(s.ballSpeedY);
        }

        if (!s.over && s.ballY - r > H) {
            s.lives -= 1;
            if (s.lives <= 0) {
                s.over = true;
                events.push('lose');
            } else {
                events.push('life');
                serve(s);
            }
        }
        return events;
    }

    function boot() {
        if (typeof document === 'undefined') return;
        var canvas = document.getElementById('gameCanvas');
        var stage = document.getElementById('stage');
        if (!canvas || !stage) return;
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        var state = null;
        var running = false;
        var paused = false;
        var loopOn = false;
        var last = 0;
        var aim = null;
        var aimHeld = false;
        var aimFresh = false;
        var keys = {};
        var padAxes = { x: 0, y: 0 };
        var padIndex = -1;
        var prevBtn = [];
        var padUsed = false;
        var inputFromPad = false;
        var navY = { hold: 0, wait: 0 };
        var audioCtx = null;
        var masterGain = null;
        var muted = false;
        var masterVolume = 0.7;

        var menu = document.getElementById('menu');
        var pauseMenu = document.getElementById('pauseMenu');
        var help = document.getElementById('help');
        var result = document.getElementById('result');
        var resultText = document.getElementById('resultText');
        var muteIcon = document.getElementById('muteIcon');
        var chromeMute = document.getElementById('btnMute');
        var volumeSlider = document.getElementById('volumeSlider');

        function fit() {
            if (window.DEVICE && DEVICE.fit) DEVICE.fit(canvas, stage);
        }

        function unlockAudio() {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!audioCtx) {
                try {
                    audioCtx = new AC();
                    masterGain = audioCtx.createGain();
                    masterGain.connect(audioCtx.destination);
                    masterGain.gain.value = muted ? 0 : masterVolume;
                } catch (err) {
                    audioCtx = null;
                }
            }
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        }

        function tone(freq, duration, type, volume) {
            if (!audioCtx || muted || !masterGain) return;
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(masterGain);
            osc.frequency.value = freq;
            osc.type = type || 'sine';
            var now = audioCtx.currentTime;
            var level = (volume || 0.3) * masterVolume;
            gain.gain.setValueAtTime(Math.max(0.001, level), now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
            osc.start(now);
            osc.stop(now + duration);
        }

        function playEvent(name) {
            if (name === 'bounce') tone(800, 0.05, 'square', 0.2);
            else if (name === 'paddle') tone(400, 0.08, 'sawtooth', 0.4);
            else if (name === 'brick') tone(1000, 0.06, 'square', 0.3);
            else if (name === 'life' || name === 'lose') tone(150, 0.2, 'sine', 0.5);
            else if (name === 'win') {
                tone(523, 0.2, 'sine', 0.4);
                setTimeout(function () { tone(659, 0.2, 'sine', 0.4); }, 200);
                setTimeout(function () { tone(784, 0.3, 'sine', 0.4); }, 400);
            }
        }

        function setMuteIcon() {
            if (muteIcon) muteIcon.textContent = muted ? 'Muted' : 'Sound';
            if (chromeMute) chromeMute.textContent = muted ? 'Muted' : 'Mute';
        }

        function show(el, on) {
            if (!el) return;
            if (on) el.removeAttribute('hidden');
            else el.setAttribute('hidden', '');
        }

        function isShown(el) {
            return !!(el && !el.hasAttribute('hidden'));
        }

        function currentPanel() {
            if (isShown(help)) return help;
            if (isShown(result)) return result;
            if (isShown(pauseMenu)) return pauseMenu;
            if (isShown(menu)) return menu;
            return null;
        }

        function syncCursor() {
            document.documentElement.classList.toggle('hide-cursor', running && !paused && !currentPanel());
        }

        function focusables(panel) {
            if (!panel) return [];
            var nodes = panel.querySelectorAll('button, input[type="range"]');
            var list = [];
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].disabled || nodes[i].hasAttribute('hidden')) continue;
                list.push(nodes[i]);
            }
            return list;
        }

        function focusedIndex(items) {
            for (var i = 0; i < items.length; i++) {
                if (items[i].classList.contains('pad-focus')) return i;
            }
            return -1;
        }

        function clearPadFocus() {
            var marked = document.querySelectorAll('.pad-focus');
            for (var i = 0; i < marked.length; i++) marked[i].classList.remove('pad-focus');
        }

        function focusItem(el) {
            clearPadFocus();
            if (!el) return;
            el.classList.add('pad-focus');
            try { el.focus({ preventScroll: true }); }
            catch (err) {
                try { el.focus(); } catch (e2) { /* ignore */ }
            }
        }

        function focusFirst(panel) {
            var items = focusables(panel);
            if (items.length) focusItem(items[0]);
        }

        function readInput() {
            var pointer = !!aim && (aimHeld || aimFresh);
            aimFresh = false;
            return {
                left: !!keys.a || !!keys.arrowleft,
                right: !!keys.d || !!keys.arrowright,
                stickX: padAxes.x,
                aim: pointer,
                aimX: pointer ? aim.x : 0
            };
        }

        function drawBubble(box, word, color) {
            var x = box.x;
            var y = box.y;
            var w = box.w;
            var h = box.h;
            var cx = x + w / 2;
            var cy = y + h / 2;
            ctx.fillStyle = color;
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.beginPath();
            var spikes = 12;
            for (var i = 0; i < spikes; i++) {
                var ang = -Math.PI / 2 + (i / spikes) * Math.PI * 2;
                var reach = i % 2 === 0 ? 1 : 0.76;
                var px = cx + Math.cos(ang) * (w / 2 - 1) * reach;
                var py = cy + Math.sin(ang) * (h / 2 - 1) * reach;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            var bright = color === '#FFD100' || color === '#F6D000' || color === '#00B5D1' || color === '#00A651' || color === '#FF6A00';
            ctx.fillStyle = bright ? '#111' : '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '8px "Press Start 2P", monospace';
            if (ctx.measureText(word).width > w - 10) ctx.font = '6px "Press Start 2P", monospace';
            ctx.fillText(word, cx, cy + 1);
        }

        function draw() {
            if (!state) return;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            for (var c = 0; c < state.cols; c++) {
                for (var row = 0; row < state.rows; row++) {
                    var brick = state.bricks[c][row];
                    if (brick.status !== 1) continue;
                    var box = brickBox(state, c, row);
                    drawBubble(box, brick.word, brick.color);
                }
            }
            function fillPoly(poly, color) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(poly[0][0], poly[0][1]);
                for (var n = 1; n < poly.length; n++) ctx.lineTo(poly[n][0], poly[n][1]);
                ctx.closePath();
                ctx.fill();
            }
            if (batGfx) {
                var dh = batGfx.dh;
                var smooth = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = true;
                if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(batGfx.top.canvas, state.paddleX, HANG_Y, batGfx.dw, dh);
                ctx.drawImage(batGfx.bottom.canvas, state.paddleX, H - MARGIN - dh, batGfx.dw, dh);
                ctx.imageSmoothingEnabled = smooth;
            } else {
                fillPoly(topPoints(state.paddleX), BAT_YELLOW);
                fillPoly(crownPoints(state.paddleX), BAT_YELLOW);
            }
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(state.ballX, state.ballY, state.ballR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '22px "Press Start 2P", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('Lives ' + state.lives, 16, 16);
            ctx.textAlign = 'center';
            ctx.fillText(String(state.score), W / 2, 16);
        }

        function finish(text) {
            running = false;
            paused = false;
            show(pauseMenu, false);
            if (resultText) resultText.textContent = text;
            show(result, true);
            document.documentElement.classList.remove('playing');
            if (padUsed) focusFirst(result);
            syncCursor();
        }

        function applyEvents(events) {
            for (var i = 0; i < events.length; i++) {
                playEvent(events[i]);
                if (events[i] === 'win') finish('All bricks cleared');
                else if (events[i] === 'lose') finish('All lives lost');
            }
        }

        function frame(now) {
            if (!loopOn) return;
            var dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
            last = now;
            if (running && !paused && state) applyEvents(step(state, dt, readInput()));
            if (running) {
                draw();
                requestAnimationFrame(frame);
            } else loopOn = false;
        }

        function ensureLoop() {
            if (loopOn) return;
            loopOn = true;
            last = performance.now();
            requestAnimationFrame(frame);
        }

        function startGame() {
            unlockAudio();
            tone(600, 0.1, 'triangle', 0.3);
            state = create();
            state.hold = 0.15;
            running = true;
            paused = false;
            aim = null;
            aimHeld = false;
            aimFresh = false;
            show(menu, false);
            show(pauseMenu, false);
            show(help, false);
            show(result, false);
            document.documentElement.classList.add('playing');
            document.documentElement.setAttribute('data-mode', 'crown');
            clearPadFocus();
            fit();
            draw();
            syncCursor();
            ensureLoop();
        }

        function toCanvas(e) {
            var rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (rect.width ? canvas.width / rect.width : 1),
                y: (e.clientY - rect.top) * (rect.height ? canvas.height / rect.height : 1)
            };
        }

        function togglePause() {
            if (!running) return;
            unlockAudio();
            paused = !paused;
            show(pauseMenu, paused);
            if (paused) {
                tone(200, 0.2, 'sine', 0.4);
                if (inputFromPad) focusFirst(pauseMenu);
            } else {
                clearPadFocus();
                last = performance.now();
            }
            syncCursor();
        }

        function toggleMute() {
            unlockAudio();
            muted = !muted;
            if (masterGain) masterGain.gain.value = muted ? 0 : masterVolume;
            setMuteIcon();
        }

        function backToMenu() {
            running = false;
            paused = false;
            state = null;
            aim = null;
            aimHeld = false;
            show(pauseMenu, false);
            show(help, false);
            show(result, false);
            show(menu, true);
            document.documentElement.classList.remove('playing');
            document.documentElement.removeAttribute('data-mode');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            if (inputFromPad) focusFirst(menu);
            else clearPadFocus();
            syncCursor();
        }

        function applyAxis(v) {
            if (typeof v !== 'number' || isNaN(v)) return 0;
            var dead = 0.22;
            var mag = Math.abs(v);
            if (mag < dead) return 0;
            var scaled = Math.min(1, (mag - dead) / (1 - dead));
            return v < 0 ? -scaled : scaled;
        }

        function held(pad, i) {
            var b = pad.buttons && pad.buttons[i];
            return !!(b && (b.pressed || b.value >= 0.5));
        }

        function takeEdges(pad) {
            var edge = [];
            var n = pad.buttons ? pad.buttons.length : 0;
            for (var i = 0; i < n; i++) {
                var on = held(pad, i);
                edge[i] = on && !prevBtn[i];
                prevBtn[i] = on;
            }
            if (prevBtn.length > n) prevBtn.length = n;
            return edge;
        }

        function pulseDir(dir, dt) {
            if (!dir) {
                navY.hold = 0;
                navY.wait = 0;
                return 0;
            }
            if (dir !== navY.hold) {
                navY.hold = dir;
                navY.wait = 0.34;
                return dir;
            }
            navY.wait -= dt;
            if (navY.wait <= 0) {
                navY.wait = 0.16;
                return dir;
            }
            return 0;
        }

        function connectedPad() {
            var list = navigator.getGamepads ? navigator.getGamepads() : null;
            if (!list) return null;
            if (padIndex >= 0 && list[padIndex] && list[padIndex].connected) return list[padIndex];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].connected) {
                    if (padIndex !== list[i].index) prevBtn = [];
                    padIndex = list[i].index;
                    return list[i];
                }
            }
            return null;
        }

        function pollPad(dt) {
            var pad = connectedPad();
            if (!pad) {
                padAxes.x = 0;
                padAxes.y = 0;
                return;
            }
            var buttons = pad.mapping === 'standard' || pad.mapping === '';
            var x = applyAxis(pad.axes && pad.axes[0]);
            if (!x) x = applyAxis(pad.axes && pad.axes[2]);
            if (buttons) {
                if (held(pad, 14) && !held(pad, 15)) x = -1;
                else if (held(pad, 15) && !held(pad, 14)) x = 1;
                else if (held(pad, 14) && held(pad, 15)) x = 0;
            }
            padAxes.x = x;
            if (x) padUsed = true;
            var edge = takeEdges(pad);
            var pressed = false;
            for (var b = 0; b < edge.length; b++) if (edge[b]) pressed = true;
            if (pressed) {
                padUsed = true;
                unlockAudio();
            }
            if (buttons && edge[3]) toggleMute();
            var panel = currentPanel();
            var live = running && !paused && !panel;
            if (live) {
                navY.hold = 0;
                navY.wait = 0;
                if (edge[9] || (buttons && (edge[1] || edge[8]))) {
                    inputFromPad = true;
                    togglePause();
                    inputFromPad = false;
                }
                return;
            }
            if (!panel) return;
            var items = focusables(panel);
            var idx = focusedIndex(items);
            var dir = 0;
            if (buttons && held(pad, 12)) dir -= 1;
            if (buttons && held(pad, 13)) dir += 1;
            if (!dir) {
                var stick = applyAxis(pad.axes && pad.axes[1]);
                if (stick <= -0.55) dir = -1;
                else if (stick >= 0.55) dir = 1;
            }
            var yDir = pulseDir(dir, dt);
            var moved = false;
            if (yDir && items.length) {
                moved = true;
                if (idx < 0) focusItem(items[0]);
                else focusItem(items[(idx + (yDir > 0 ? 1 : -1) + items.length) % items.length]);
                idx = focusedIndex(items);
            }
            if (edge[9] && panel === pauseMenu) {
                inputFromPad = true;
                togglePause();
                inputFromPad = false;
                return;
            }
            if (!moved && buttons && (edge[0] || edge[9])) {
                inputFromPad = true;
                if (idx < 0 && items.length) focusItem(items[0]);
                else if (idx >= 0 && items[idx].type !== 'range') items[idx].click();
                inputFromPad = false;
            }
            if (buttons && (edge[1] || edge[8])) {
                inputFromPad = true;
                if (isShown(help)) {
                    show(help, false);
                    focusFirst(menu);
                    syncCursor();
                } else if (isShown(result)) backToMenu();
                else if (running && paused) {
                    paused = false;
                    show(pauseMenu, false);
                    clearPadFocus();
                    last = performance.now();
                    syncCursor();
                }
                inputFromPad = false;
            }
        }

        var padLast = 0;
        function padFrame(now) {
            var dt = Math.min(MAX_DT, Math.max(0, padLast ? (now - padLast) / 1000 : 0));
            padLast = now;
            pollPad(dt);
            requestAnimationFrame(padFrame);
        }

        document.addEventListener('keydown', function (e) {
            var k = e.key.toLowerCase();
            keys[k] = true;
            if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === ' ') e.preventDefault();
            if (e.repeat) return;
            if (k === 'm') toggleMute();
            if ((k === 'p' || k === 'escape' || k === ' ') && running) togglePause();
        });
        document.addEventListener('keyup', function (e) {
            keys[e.key.toLowerCase()] = false;
        });

        canvas.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            unlockAudio();
            if (!running || paused) return;
            if (e.pointerType !== 'mouse') {
                aimHeld = true;
                try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            aim = toCanvas(e);
            aimFresh = true;
        });
        canvas.addEventListener('pointermove', function (e) {
            if (!running || paused) return;
            if (e.pointerType === 'mouse' || aimHeld) {
                aim = toCanvas(e);
                aimFresh = true;
            }
        });
        function clearAim(e) {
            if (!e || e.pointerType === 'mouse') return;
            aimHeld = false;
            aim = null;
            aimFresh = false;
        }
        canvas.addEventListener('pointerup', clearAim);
        canvas.addEventListener('pointercancel', function () {
            aimHeld = false;
            aim = null;
            aimFresh = false;
        });

        function bind(id, fn) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', function () {
                unlockAudio();
                fn();
            });
        }

        bind('btnStart', startGame);
        bind('btnHelp', function () {
            tone(600, 0.1, 'triangle', 0.3);
            show(help, true);
            if (inputFromPad) focusFirst(help);
            syncCursor();
        });
        bind('btnHelpClose', function () {
            show(help, false);
            if (inputFromPad) focusFirst(menu);
            else clearPadFocus();
            syncCursor();
        });
        bind('btnResume', function () {
            if (!running) return;
            paused = false;
            show(pauseMenu, false);
            clearPadFocus();
            last = performance.now();
            syncCursor();
        });
        bind('btnAgain', function () {
            if (running || (state && state.over)) startGame();
        });
        bind('btnMenu', backToMenu);
        bind('btnQuit', backToMenu);
        bind('btnResultMenu', backToMenu);
        bind('btnMuteMenu', toggleMute);
        if (chromeMute) chromeMute.addEventListener('click', toggleMute);
        var btnPause = document.getElementById('btnPause');
        if (btnPause) btnPause.addEventListener('click', togglePause);
        if (volumeSlider) {
            volumeSlider.addEventListener('input', function () {
                masterVolume = parseFloat(volumeSlider.value);
                if (masterGain && !muted) masterGain.gain.value = masterVolume;
            });
        }

        var holdButtons = document.querySelectorAll('#touch-chrome [data-key]');
        for (var i = 0; i < holdButtons.length; i++) {
            (function (btn) {
                var key = btn.getAttribute('data-key');
                function press(e) {
                    e.preventDefault();
                    unlockAudio();
                    keys[key] = true;
                    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                }
                function release() { keys[key] = false; }
                btn.addEventListener('pointerdown', press);
                btn.addEventListener('pointerup', release);
                btn.addEventListener('pointercancel', release);
                btn.addEventListener('lostpointercapture', release);
            })(holdButtons[i]);
        }

        window.addEventListener('pointerdown', function (e) {
            if (e.button === 2) {
                e.preventDefault();
                return;
            }
            clearPadFocus();
            unlockAudio();
        }, true);
        window.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
        window.addEventListener('blur', function () {
            for (var k in keys) keys[k] = false;
            padAxes.x = 0;
            prevBtn = [];
        });
        window.addEventListener('gamepadconnected', function (e) {
            if (padIndex < 0) padIndex = e.gamepad.index;
        });
        window.addEventListener('gamepaddisconnected', function (e) {
            if (e.gamepad.index === padIndex) {
                padIndex = -1;
                padAxes.x = 0;
                prevBtn = [];
            }
        });
        if (window.DEVICE && DEVICE.onChange) DEVICE.onChange(fit);
        if (window.DEVICE && DEVICE.bind) DEVICE.bind();
        else fit();
        setMuteIcon();
        syncCursor();
        loadBatSymbol();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        requestAnimationFrame(padFrame);
    }

    return {
        W: W,
        H: H,
        CROWN_W: CROWN_W,
        BASE_H: BASE_H,
        SIDE_H: SIDE_H,
        create: create,
        step: step,
        crownPoints: crownPoints,
        crownSurfaceY: crownSurfaceY,
        crownZone: crownZone,
        ballTouchesCrown: ballTouchesCrown,
        boot: boot
    };
});
