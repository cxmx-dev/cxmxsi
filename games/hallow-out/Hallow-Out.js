'use strict';

/* Breakout inside a split pumpkin. The open top scoops. The round bottom hangs above. */
(function (factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.HALLOW_OUT = api;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.boot);
        else api.boot();
    }
})(function () {
    var W = 960;
    var H = 540;
    var MAX_DT = 0.05;
    var CROWN_W = 280;
    var BASE_H = 12;
    var SIDE_H = 48;
    var MARGIN = 16;
    var HANG_Y = 42;
    var TOP_DEPTH = 26;
    var PUMPKIN = '#E86A12';
    var NIGHT = '#140810';
    var CANDIES = ['corn', 'taffy', 'pop', 'bar', 'drop', 'apple', 'eye', 'twist', 'kiss'];
    var HALLOW_WORDS = [
        'BOO!', 'EEK!', 'YUM!', 'CHOMP!', 'CRUNCH!', 'GULP!', 'SNAP!', 'POP!',
        'BITE!', 'CHEW!', 'SOUR!', 'SWEET!', 'MUNCH!', 'LICK!', 'AAH!', 'OW!',
        'ZING!', 'TANG!', 'GOO!', 'STICK!', 'WRAP!', 'NIB!', 'SCARY!', 'TREAT!'
    ];
    var CANDY_COLORS = ['#F6D000', '#F48FB1', '#E10600', '#6B3A1F', '#7A28C8', '#C41E3A', '#F4F4F4', '#E10600', '#D5D8DE'];
    var PUMP_W = 440;
    var PUMP_H = 168;
    var PUMP_DRAW_H = Math.round(CROWN_W * PUMP_H / PUMP_W);
    var pumpGfx = null;

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

    /* Open pumpkin rim: high side lobes, a low mouth in the middle. */
    function crownEdge() {
        var top = baseTop();
        var keys = [
            [0.00, 34, 'outer', -1],
            [0.08, 76, 'outer', -1],
            [0.18, 86, 'scoop', 1],
            [0.30, 58, 'scoop', 1],
            [0.40, 36, 'scoop', 1],
            [0.50, 26, 'scoop', 0],
            [0.60, 36, 'scoop', -1],
            [0.70, 58, 'scoop', -1],
            [0.82, 86, 'scoop', -1],
            [0.92, 76, 'outer', 1],
            [1.00, 34, 'outer', 1]
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

    /* Round bottom of the pumpkin, hung from the top so the belly faces the board. */
    function topPoints(paddleX) {
        var keys = [
            [0.00, 16],
            [0.10, 40],
            [0.22, 66],
            [0.36, 84],
            [0.50, 98],
            [0.64, 84],
            [0.78, 66],
            [0.90, 40],
            [1.00, 16]
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
        var pad = 6;
        var offsetLeft = 36;
        var brickH = 34;
        var stack = rows * brickH + (rows - 1) * pad;
        var gapTop = HANG_Y + PUMP_DRAW_H;
        var gapBottom = H - MARGIN - PUMP_DRAW_H;
        var offsetTop = Math.round(gapTop + (gapBottom - gapTop - stack) / 2);
        var brickW = (W - offsetLeft * 2 - (cols - 1) * pad) / cols;
        var bricks = [];
        var wordIndex = 0;
        for (var c = 0; c < cols; c++) {
            bricks[c] = [];
            for (var r = 0; r < rows; r++) {
                bricks[c][r] = {
                    status: 1,
                    candy: CANDIES[c % CANDIES.length],
                    color: CANDY_COLORS[c % CANDY_COLORS.length],
                    word: HALLOW_WORDS[wordIndex % HALLOW_WORDS.length]
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
            over: false,
            bursts: []
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

    function spawnBurst(s, box, brick) {
        var bits = [];
        var n = 16;
        for (var i = 0; i < n; i++) {
            bits.push({
                ang: (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.45,
                spd: 160 + Math.random() * 280,
                size: 2.5 + Math.random() * 5,
                spin: (Math.random() - 0.5) * 16,
                kind: i % 3
            });
        }
        s.bursts.push({
            x: box.x + box.w / 2,
            y: box.y + box.h / 2,
            word: brick.word,
            color: brick.color,
            age: 0,
            life: 0.5,
            tilt: (Math.random() - 0.5) * 0.4,
            bits: bits
        });
    }

    function tickBursts(s, dt) {
        if (!s.bursts || !s.bursts.length) return;
        for (var i = s.bursts.length - 1; i >= 0; i--) {
            s.bursts[i].age += dt;
            if (s.bursts[i].age >= s.bursts[i].life) s.bursts.splice(i, 1);
        }
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
        if (pumpGfx) {
            return maskOverlaps(pumpGfx.bottom, s.ballX - s.paddleX, s.ballY - bottomPumpY(), pumpGfx.dw, pumpGfx.dh, r) ||
                maskOverlaps(pumpGfx.top, s.ballX - s.paddleX, s.ballY - HANG_Y, pumpGfx.dw, pumpGfx.dh, r);
        }
        return circleHitsPoly(crownPoints(s.paddleX), s.ballX, s.ballY, r) ||
            circleHitsPoly(topPoints(s.paddleX), s.ballX, s.ballY, r);
    }

    function bottomPumpY() {
        return H - MARGIN - (pumpGfx ? pumpGfx.dh : PUMP_DRAW_H);
    }

    function setPx(data, w, x, y, r, g, b) {
        if (x < 0 || y < 0 || x >= w) return;
        var i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
    }

    function maskFromCanvas(canvas) {
        var g = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        var pixels = g.getImageData(0, 0, w, h).data;
        var data = new Uint8Array(w * h);
        for (var i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3] > 40 ? 1 : 0;
        return { w: w, h: h, data: data, canvas: canvas };
    }

    function paintOpenTop(g, w, h) {
        var img = g.createImageData(w, h);
        var d = img.data;
        for (var x = 0; x < w; x++) {
            var nx = (x + 0.5) / w;
            var side = Math.sin(nx * Math.PI);
            if (side < 0.04) continue;
            var lobe = 0.68 + 0.32 * Math.pow(Math.sin(nx * Math.PI * 5), 2);
            var top = 5 + (1 - side) * 28 + (1 - lobe) * 14;
            var bot = h - 18 - (1 - side) * 26;
            var u = (nx - 0.5) / 0.33;
            var mouth = u * u < 1 ? Math.pow(Math.cos(Math.abs(u) * Math.PI * 0.5), 1.15) : 0;
            var floor = top + 18 + mouth * 70;
            var open = mouth > 0.62;
            var y0 = Math.max(0, Math.floor(open ? floor : top));
            var y1 = Math.min(h - 1, Math.ceil(bot));
            for (var y = y0; y <= y1; y++) {
                var span = Math.max(1, bot - top);
                var ny = (y - top) / span;
                var light = ny < 0.16 ? 1.18 : (ny > 0.82 ? 0.74 : 1);
                if (open && y < floor + 10) light *= 0.48;
                var rib = 0.72 + 0.28 * lobe;
                setPx(
                    d, w, x, y,
                    Math.max(0, Math.min(255, Math.round(228 * rib * light))),
                    Math.max(0, Math.min(255, Math.round(98 * rib * light))),
                    Math.max(0, Math.min(255, Math.round(16 * rib * light)))
                );
            }
            if (nx > 0.455 && nx < 0.545) {
                var stemT = Math.abs(nx - 0.5) / 0.045;
                var stemTop = Math.floor(bot - 6);
                var stemBot = h - 3;
                for (var sy = stemTop; sy <= stemBot; sy++) {
                    if (sy < 0 || sy >= h) continue;
                    var sg = stemT > 0.72 ? 46 : 98;
                    setPx(d, w, x, sy, 34, sg, 26);
                }
            }
        }
        g.putImageData(img, 0, 0);
    }

    function paintBelly(g, w, h) {
        var img = g.createImageData(w, h);
        var d = img.data;
        var lowY = 0;
        var lowX = (w / 2) | 0;
        for (var x = 0; x < w; x++) {
            var nx = (x + 0.5) / w;
            var side = Math.sin(nx * Math.PI);
            if (side < 0.035) continue;
            var lobe = 0.86 + 0.14 * Math.pow(Math.sin(nx * Math.PI * 5), 2);
            var top = 2 + (1 - side) * 4;
            var bot = 12 + Math.pow(side, 0.6) * lobe * (h - 24);
            if (bot > lowY) {
                lowY = bot;
                lowX = x;
            }
            var y0 = Math.max(0, Math.floor(top));
            var y1 = Math.min(h - 1, Math.ceil(bot));
            for (var y = y0; y <= y1; y++) {
                var ny = (y - top) / Math.max(1, bot - top);
                var light = ny < 0.1 ? 1.35 : (ny > 0.82 ? 0.68 : 0.94);
                var rib = 0.42 + 0.58 * lobe;
                setPx(
                    d, w, x, y,
                    Math.max(0, Math.min(255, Math.round(214 * rib * light))),
                    Math.max(0, Math.min(255, Math.round(86 * rib * light))),
                    Math.max(0, Math.min(255, Math.round(14 * rib * light)))
                );
            }
        }
        for (var by = -11; by <= 4; by++) {
            for (var bx = -10; bx <= 10; bx++) {
                var blossom = (bx * bx) / 70 + (by * by) / 28;
                if (blossom > 1) continue;
                setPx(d, w, lowX + bx, Math.round(lowY) - 8 + by, by > 1 ? 70 : 120, 48, 16);
            }
        }
        g.putImageData(img, 0, 0);
    }

    function buildPumpkin() {
        if (typeof document === 'undefined') return;
        var open = document.createElement('canvas');
        var belly = document.createElement('canvas');
        open.width = PUMP_W;
        open.height = PUMP_H;
        belly.width = PUMP_W;
        belly.height = PUMP_H;
        paintOpenTop(open.getContext('2d'), PUMP_W, PUMP_H);
        paintBelly(belly.getContext('2d'), PUMP_W, PUMP_H);
        pumpGfx = {
            bottom: maskFromCanvas(open),
            top: maskFromCanvas(belly),
            dw: CROWN_W,
            dh: PUMP_DRAW_H
        };
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
        tickBursts(s, dt);
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
                var box = brickBox(s, c, row);
                if (!resolveBrick(s, box)) continue;
                brick.status = 0;
                s.score += 1;
                spawnBurst(s, box, brick);
                events.push('brick');
                hit = true;
                if (s.score >= s.cols * s.rows) {
                    s.over = true;
                    events.push('win');
                }
                break;
            }
        }

        if (pumpGfx) {
            var dh = pumpGfx.dh;
            if (!s.over && hitMask(s, prevX, prevY, pumpGfx.top, s.paddleX, HANG_Y, pumpGfx.dw, dh, false)) events.push('bounce');
            if (!s.over && hitMask(s, prevX, prevY, pumpGfx.bottom, s.paddleX, bottomPumpY(), pumpGfx.dw, dh, true)) events.push('paddle');
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

        function drawCandy(box, kind) {
            var w = box.w;
            var h = box.h;
            ctx.save();
            ctx.translate(box.x + w / 2, box.y + h / 2);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            if (kind === 'corn') {
                ctx.beginPath();
                ctx.moveTo(0, -h * 0.46);
                ctx.lineTo(w * 0.18, h * 0.42);
                ctx.lineTo(-w * 0.18, h * 0.42);
                ctx.closePath();
                ctx.save();
                ctx.clip();
                ctx.fillStyle = '#F6D000';
                ctx.fillRect(-w, h * 0.02, w * 2, h);
                ctx.fillStyle = '#F27B14';
                ctx.fillRect(-w, -h * 0.22, w * 2, h * 0.32);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-w, -h, w * 2, h * 0.34);
                ctx.restore();
                ctx.stroke();
            } else if (kind === 'taffy') {
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-w * 0.42, 0);
                ctx.lineTo(-w * 0.2, -h * 0.28);
                ctx.lineTo(-w * 0.2, h * 0.28);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(w * 0.42, 0);
                ctx.lineTo(w * 0.2, -h * 0.28);
                ctx.lineTo(w * 0.2, h * 0.28);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#F48FB1';
                ctx.beginPath();
                ctx.moveTo(-w * 0.2, -h * 0.22);
                ctx.quadraticCurveTo(0, -h * 0.42, w * 0.2, -h * 0.22);
                ctx.lineTo(w * 0.2, h * 0.22);
                ctx.quadraticCurveTo(0, h * 0.42, -w * 0.2, h * 0.22);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-w * 0.08, -h * 0.16);
                ctx.quadraticCurveTo(0, 0, w * 0.08, h * 0.16);
                ctx.stroke();
            } else if (kind === 'pop') {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, h * 0.02);
                ctx.lineTo(0, h * 0.28);
                ctx.stroke();
                ctx.fillStyle = '#E10600';
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, -h * 0.08, h * 0.34, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, -h * 0.08, h * 0.18, Math.PI * 0.8, Math.PI * 1.7);
                ctx.stroke();
            } else if (kind === 'bar') {
                ctx.fillStyle = '#6B3A1F';
                ctx.fillRect(-w * 0.36, -h * 0.28, w * 0.72, h * 0.56);
                ctx.strokeRect(-w * 0.36, -h * 0.28, w * 0.72, h * 0.56);
                ctx.beginPath();
                ctx.moveTo(-w * 0.12, -h * 0.28);
                ctx.lineTo(-w * 0.12, h * 0.28);
                ctx.moveTo(w * 0.12, -h * 0.28);
                ctx.lineTo(w * 0.12, h * 0.28);
                ctx.stroke();
            } else if (kind === 'drop') {
                ctx.fillStyle = '#7A28C8';
                ctx.beginPath();
                ctx.ellipse(0, h * 0.06, w * 0.22, h * 0.36, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.beginPath();
                ctx.ellipse(-w * 0.06, -h * 0.08, w * 0.06, h * 0.1, -0.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (kind === 'apple') {
                ctx.strokeStyle = '#6B3A1F';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, -h * 0.08);
                ctx.lineTo(0, -h * 0.46);
                ctx.stroke();
                ctx.fillStyle = '#C41E3A';
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, h * 0.08, h * 0.32, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#E8B15A';
                ctx.beginPath();
                ctx.ellipse(0, h * 0.02, w * 0.1, h * 0.08, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (kind === 'eye') {
                ctx.fillStyle = '#F4F4F4';
                ctx.beginPath();
                ctx.arc(0, 0, h * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = '#E10600';
                ctx.beginPath();
                ctx.moveTo(-h * 0.28, -h * 0.12);
                ctx.quadraticCurveTo(-h * 0.05, -h * 0.28, h * 0.16, -h * 0.08);
                ctx.moveTo(h * 0.1, h * 0.16);
                ctx.quadraticCurveTo(h * 0.28, h * 0.02, h * 0.32, h * 0.2);
                ctx.stroke();
                ctx.fillStyle = '#3FA34D';
                ctx.beginPath();
                ctx.arc(w * 0.02, 0, h * 0.16, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.arc(w * 0.04, 0, h * 0.07, 0, Math.PI * 2);
                ctx.fill();
            } else if (kind === 'twist') {
                ctx.lineWidth = 5;
                ctx.strokeStyle = '#F6D000';
                ctx.beginPath();
                ctx.moveTo(-w * 0.34, 0);
                for (var i = 0; i <= 10; i++) {
                    var t = i / 10;
                    ctx.lineTo(-w * 0.34 + t * w * 0.68, Math.sin(t * Math.PI * 4) * h * 0.2);
                }
                ctx.stroke();
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.strokeStyle = '#E10600';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-w * 0.34, 0);
                for (var j = 0; j <= 10; j++) {
                    var u = j / 10;
                    ctx.lineTo(-w * 0.34 + u * w * 0.68, Math.sin(u * Math.PI * 4 + Math.PI) * h * 0.2);
                }
                ctx.stroke();
            } else {
                ctx.fillStyle = '#D5D8DE';
                ctx.beginPath();
                ctx.moveTo(0, -h * 0.42);
                ctx.bezierCurveTo(w * 0.16, -h * 0.28, w * 0.2, h * 0.05, 0, h * 0.4);
                ctx.bezierCurveTo(-w * 0.2, h * 0.05, -w * 0.16, -h * 0.28, 0, -h * 0.42);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.ellipse(-w * 0.03, 0, w * 0.03, h * 0.14, -0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#F27B14';
                ctx.beginPath();
                ctx.moveTo(0, -h * 0.42);
                ctx.lineTo(w * 0.14, -h * 0.46);
                ctx.lineTo(w * 0.05, -h * 0.22);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        function spikePath(rx, ry, spikes, jag) {
            ctx.beginPath();
            for (var i = 0; i < spikes; i++) {
                var ang = -Math.PI / 2 + (i / spikes) * Math.PI * 2;
                var reach = i % 2 === 0 ? 1 : 0.58;
                reach *= 0.9 + jag * ((i * 3) % 4) * 0.08;
                var px = Math.cos(ang) * rx * reach;
                var py = Math.sin(ang) * ry * reach;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        function drawBurst(b) {
            var t = clamp(b.age / b.life, 0, 1);
            var punch = 1 - Math.pow(1 - t, 2.4);
            var scale = (0.06 + punch * 2.85) * (1 + Math.sin(t * Math.PI * 4) * 0.05 * (1 - t));
            var fade = t < 0.78 ? 1 : 1 - (t - 0.78) / 0.22;
            var jag = (Math.floor(b.age * 28) % 3) * 0.15;
            var bright = b.color === '#F6D000' || b.color === '#F48FB1' || b.color === '#F4F4F4' || b.color === '#D5D8DE';
            ctx.save();
            ctx.translate(b.x + Math.sin(b.age * 95) * (1 - t) * 4, b.y + Math.cos(b.age * 80) * (1 - t) * 3);
            ctx.rotate(b.tilt * (1 - t * 0.4) + Math.sin(b.age * 42) * 0.07);
            ctx.globalAlpha = fade;
            ctx.lineCap = 'round';
            if (t < 0.18) {
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = fade * (1 - t / 0.18);
                ctx.beginPath();
                ctx.arc(0, 0, 10 + t * 180, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = fade;
            }
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            for (var i = 0; i < 10; i++) {
                var ang = b.bits[i].ang;
                var inner = 16 + punch * 36;
                var outer = inner + 18 + punch * 78;
                ctx.globalAlpha = fade * (1 - t) * 0.95;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
                ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer);
                ctx.stroke();
            }
            ctx.globalAlpha = fade * (1 - t * 0.65);
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(0, 0, 14 + punch * 86, 10 + punch * 48, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 8 + punch * 100, 6 + punch * 56, 0, 0, Math.PI * 2);
            ctx.stroke();
            for (var p = 0; p < b.bits.length; p++) {
                var bit = b.bits[p];
                var dist = bit.spd * b.age;
                var px = Math.cos(bit.ang) * dist;
                var py = Math.sin(bit.ang) * dist;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(bit.ang + b.age * bit.spin);
                ctx.globalAlpha = fade * (1 - t * 0.85);
                ctx.fillStyle = bit.kind === 1 ? '#fff' : (bit.kind === 2 ? '#111' : b.color);
                if (bit.kind === 1) {
                    ctx.beginPath();
                    ctx.moveTo(0, -bit.size * 1.6);
                    ctx.lineTo(bit.size * 0.45, 0);
                    ctx.lineTo(0, bit.size * 1.6);
                    ctx.lineTo(-bit.size * 0.45, 0);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.fillRect(-bit.size, -bit.size * 0.45, bit.size * 2, bit.size * 0.9);
                }
                ctx.restore();
            }
            ctx.globalAlpha = fade;
            ctx.scale(scale, scale);
            ctx.font = '13px "Press Start 2P", monospace';
            var wide = ctx.measureText(b.word).width;
            if (wide > 108) {
                ctx.font = '10px "Press Start 2P", monospace';
                wide = ctx.measureText(b.word).width;
            }
            var rx = Math.max(50, wide / 2 + 20);
            var ry = 30;
            ctx.fillStyle = '#111';
            ctx.save();
            ctx.translate(3.5, 4);
            spikePath(rx, ry, 16, jag);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = b.color;
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 3.2;
            ctx.lineJoin = 'round';
            spikePath(rx, ry, 16, jag);
            ctx.fill();
            ctx.stroke();
            if (t < 0.22) {
                ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - t / 0.22)) + ')';
                spikePath(rx * 0.55, ry * 0.5, 12, 0);
                ctx.fill();
            }
            ctx.fillStyle = bright ? '#111' : '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 4;
            ctx.strokeStyle = bright ? '#fff' : '#111';
            ctx.strokeText(b.word, 0, 1);
            ctx.fillText(b.word, 0, 1);
            ctx.restore();
        }

        function draw() {
            if (!state) return;
            ctx.fillStyle = NIGHT;
            ctx.fillRect(0, 0, W, H);
            for (var c = 0; c < state.cols; c++) {
                for (var row = 0; row < state.rows; row++) {
                    var brick = state.bricks[c][row];
                    if (brick.status !== 1) continue;
                    drawCandy(brickBox(state, c, row), brick.candy);
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
            if (pumpGfx) {
                var dh = pumpGfx.dh;
                var smooth = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = true;
                if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(pumpGfx.top.canvas, state.paddleX, HANG_Y, pumpGfx.dw, dh);
                ctx.drawImage(pumpGfx.bottom.canvas, state.paddleX, H - MARGIN - dh, pumpGfx.dw, dh);
                ctx.imageSmoothingEnabled = smooth;
            } else {
                fillPoly(topPoints(state.paddleX), PUMPKIN);
                fillPoly(crownPoints(state.paddleX), PUMPKIN);
            }
            ctx.fillStyle = '#FFE7A0';
            ctx.beginPath();
            ctx.arc(state.ballX, state.ballY, state.ballR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(state.ballX - 2, state.ballY - 2, state.ballR * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '22px "Press Start 2P", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('Lives ' + state.lives, 16, 16);
            ctx.textAlign = 'center';
            ctx.fillText(String(state.score), W / 2, 16);
            if (state.bursts) {
                for (var bi = 0; bi < state.bursts.length; bi++) drawBurst(state.bursts[bi]);
            }
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
                if (events[i] === 'win') finish('All candies cleared');
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
            document.documentElement.setAttribute('data-mode', 'hallow');
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
            ctx.fillStyle = NIGHT;
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
        buildPumpkin();
        ctx.fillStyle = NIGHT;
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
