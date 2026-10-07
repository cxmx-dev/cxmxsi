'use strict'

// POSTFX — vignette, grain, optional fisheye barrel distortion.
var POSTFX = POSTFX || {};

POSTFX.instance = (function()
{
    var _fisheyeEnabled = false;
    var _grainTile = null;
    var _scratch = null;
    var _scratchCtx = null;
    var _outData = null;
    var _lutSrc = null;
    var _lutFade = null;
    var _lutW = 0;
    var _lutH = 0;
    var _lutK = -1;
    var _lutCornerR = -1;
    var _frame = 0;

    var _glState = 'none';
    var _gl = null;
    var _glCanvas = null;
    var _glProg = null;
    var _glTex = null;
    var _glBuf = null;
    var _glUniforms = null;
    var _texScratch = null;
    var _texScratchCtx = null;
    var _texW = 0;
    var _texH = 0;
    var _glRw = 0;
    var _glRh = 0;
    var _glApos = -1;
    var _vigKey = '';
    var _vigGrad = null;
    var _grainSkip = 0;

    var _VS = [
        'attribute vec2 a_pos;',
        'varying vec2 v_uv;',
        'void main(){',
        '  v_uv = a_pos * 0.5 + 0.5;',
        '  gl_Position = vec4(a_pos, 0.0, 1.0);',
        '}'
    ].join('');

    var _FS = [
        'precision mediump float;',
        'varying vec2 v_uv;',
        'uniform sampler2D u_tex;',
        'uniform float u_k;',
        'uniform float u_cy;',
        'uniform float u_aspect;',
        'uniform float u_cornerR;',
        'uniform float u_edgeDark;',
        'uniform float u_chroma;',
        'void main(){',
        '  float nx = (v_uv.x - 0.5) / 0.5;',
        '  float ny = (v_uv.y - u_cy) / u_cy * u_aspect;',
        '  float r2 = nx * nx + ny * ny;',
        '  float r = sqrt(r2);',
        '  float rn = r / u_cornerR;',
        '  float srcRn = rn * (1.0 - u_k * (1.0 - rn) * (1.0 - rn));',
        '  float scale = (rn > 0.0001) ? (srcRn / rn) : 1.0;',
        '  vec2 base = vec2(0.5 + nx * 0.5 * scale, u_cy + (v_uv.y - u_cy) * scale);',
        '  vec2 clamped = clamp(base, 0.001, 0.999);',
        '  float ab = u_chroma * rn * rn;',
        '  vec3 col;',
        '  col.r = texture2D(u_tex, clamp(vec2(clamped.x + ab, clamped.y), 0.001, 0.999)).r;',
        '  col.g = texture2D(u_tex, clamped).g;',
        '  col.b = texture2D(u_tex, clamp(vec2(clamped.x - ab, clamped.y), 0.001, 0.999)).b;',
        '  float edge = smoothstep(0.70, 1.0, rn);',
        '  col *= (1.0 - edge * u_edgeDark);',
        '  col *= 1.0 + 0.05 * (1.0 - smoothstep(0.0, 0.55, rn));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('');

    function __fisheyeEnabled(v)
    {
        if (v !== undefined) {
            _fisheyeEnabled = !!v;
            _vigKey = '';
            _lutK = -1;
        }
        return _fisheyeEnabled;
    }

    function __barrelStrength()
    {
        return TUNING.CURRENT.BARREL_STRENGTH;
    }

    function __vignetteEdge(fisheye)
    {
        return fisheye ? TUNING.CURRENT.VIGNETTE_EDGE_FISHEYE : TUNING.CURRENT.VIGNETTE_EDGE_NORMAL;
    }

    function _barrelCenterY()
    {
        return _fisheyeEnabled ?
            TUNING.CURRENT.FISHEYE_VP_FACTOR :
            TUNING.CURRENT.NORMAL_VP_FACTOR;
    }

    function _barrelScale()
    {
        return TUNING.CURRENT.BARREL_RES_SCALE;
    }

    function _glRenderScale()
    {
        return TUNING.CURRENT.BARREL_GL_SCALE;
    }

    function _cornerR(cy, aspect)
    {
        var nyTop = (0 - cy) / cy * aspect;
        var nyBot = (1 - cy) / cy * aspect;
        var rTop = Math.sqrt(1 + nyTop * nyTop);
        var rBot = Math.sqrt(1 + nyBot * nyBot);
        return Math.max(rTop, rBot, 1.0);
    }

    function _barrelParams(regionW, regionH)
    {
        var cy = _barrelCenterY();
        var aspect = regionH / Math.max(1, regionW);
        return {
            cy: cy,
            aspect: aspect,
            cornerR: _cornerR(cy, aspect),
            k: TUNING.CURRENT.BARREL_STRENGTH
        };
    }

    function _fitFrameScale(rn, k)
    {
        if (rn < 0.0001) { return 1; }
        var srcRn = rn * (1 - k * (1 - rn) * (1 - rn));
        return srcRn / rn;
    }

    function _screenUvToSourceUv(uvx, uvy, p)
    {
        var nx = (uvx - 0.5) / 0.5;
        var ny = (uvy - p.cy) / p.cy * p.aspect;
        var r = Math.sqrt(nx * nx + ny * ny);
        var rn = r / p.cornerR;
        var scale = _fitFrameScale(rn, p.k);
        return {
            x: 0.5 + nx * 0.5 * scale,
            y: p.cy + (uvy - p.cy) * scale
        };
    }

    // Screen pixel after warp → source pixel where content was drawn (for hit testing).
    function _screenToSource(screenX, screenY, regionX, regionY, regionW, regionH)
    {
        if (!_fisheyeEnabled || regionW <= 0 || regionH <= 0) {
            return { x: screenX, y: screenY };
        }
        var p = _barrelParams(regionW, regionH);
        var uvx = (screenX - regionX) / regionW;
        var uvy = (screenY - regionY) / regionH;
        var src = _screenUvToSourceUv(uvx, uvy, p);
        return {
            x: regionX + src.x * regionW,
            y: regionY + src.y * regionH
        };
    }

    function _compileShader(gl, type, src)
    {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function _initGl()
    {
        if (_glState === 'fail') { return false; }
        if (_glState === 'ok') { return true; }
        _glState = 'fail';
        try {
            _glCanvas = document.createElement('canvas');
            var gl = _glCanvas.getContext('webgl') ||
                _glCanvas.getContext('experimental-webgl');
            if (!gl || !gl.createShader) { return false; }

            var vs = _compileShader(gl, gl.VERTEX_SHADER, _VS);
            var fs = _compileShader(gl, gl.FRAGMENT_SHADER, _FS);
            if (!vs || !fs) { return false; }

            var prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { return false; }

            var buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, -1, 1, -1, -1, 1,
                -1, 1, 1, -1, 1, 1
            ]), gl.STATIC_DRAW);

            var tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            _gl = gl;
            _glProg = prog;
            _glBuf = buf;
            _glTex = tex;
            _glUniforms = {
                tex: gl.getUniformLocation(prog, 'u_tex'),
                k: gl.getUniformLocation(prog, 'u_k'),
                cy: gl.getUniformLocation(prog, 'u_cy'),
                aspect: gl.getUniformLocation(prog, 'u_aspect'),
                cornerR: gl.getUniformLocation(prog, 'u_cornerR'),
                edgeDark: gl.getUniformLocation(prog, 'u_edgeDark'),
                chroma: gl.getUniformLocation(prog, 'u_chroma')
            };
            _glApos = gl.getAttribLocation(prog, 'a_pos');
            _glState = 'ok';
            return true;
        } catch (e) {
            return false;
        }
    }

    function _ensureTexScratch(w, h)
    {
        if (!_texScratch || _texW !== w || _texH !== h) {
            _texScratch = document.createElement('canvas');
            _texScratch.width = w;
            _texScratch.height = h;
            _texScratchCtx = _texScratch.getContext('2d');
            _texW = w;
            _texH = h;
        }
        return { canvas: _texScratch, ctx: _texScratchCtx };
    }

    function _applyBarrelGl(ctx, x, y, w, h)
    {
        if (!_initGl()) { return false; }

        var gl = _gl;
        var glScale = _glRenderScale();
        var rw = Math.max(1, Math.floor(w * glScale));
        var rh = Math.max(1, Math.floor(h * glScale));
        var ts = _ensureTexScratch(rw, rh);
        ts.ctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, rw, rh);

        var texReady = (_glRw === rw && _glRh === rh);
        if (!texReady) {
            _glCanvas.width = rw;
            _glCanvas.height = rh;
            _glRw = rw;
            _glRh = rh;
        }
        gl.viewport(0, 0, rw, rh);

        gl.useProgram(_glProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, _glTex);
        if (gl.UNPACK_FLIP_Y_WEBGL !== undefined) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        }
        if (texReady) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, ts.canvas);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ts.canvas);
        }
        gl.uniform1i(_glUniforms.tex, 0);
        gl.uniform1f(_glUniforms.k, TUNING.CURRENT.BARREL_STRENGTH);
        var aspect = h / Math.max(1, w);
        var cy = _barrelCenterY();
        gl.uniform1f(_glUniforms.cy, cy);
        gl.uniform1f(_glUniforms.aspect, aspect);
        gl.uniform1f(_glUniforms.cornerR, _cornerR(cy, aspect));
        gl.uniform1f(_glUniforms.edgeDark, TUNING.CURRENT.BARREL_EDGE_DARKEN);
        gl.uniform1f(_glUniforms.chroma, TUNING.CURRENT.BARREL_CHROMA);

        gl.bindBuffer(gl.ARRAY_BUFFER, _glBuf);
        gl.enableVertexAttribArray(_glApos);
        gl.vertexAttribPointer(_glApos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) {
            ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(_glCanvas, 0, 0, rw, rh, x, y, w, h);
        ctx.restore();
        return true;
    }

    function _ensureScratch(w, h)
    {
        var scale = _barrelScale();
        var sw = Math.max(1, Math.floor(w * scale));
        var sh = Math.max(1, Math.floor(h * scale));
        if (!_scratch || _scratch.width !== sw || _scratch.height !== sh) {
            _scratch = document.createElement('canvas');
            _scratch.width = sw;
            _scratch.height = sh;
            _scratchCtx = _scratch.getContext('2d');
            _outData = null;
            _lutSrc = null;
            _lutFade = null;
            _lutW = 0;
            _lutH = 0;
        }
        return { canvas: _scratch, ctx: _scratchCtx, w: sw, h: sh };
    }

    function _rebuildLut(sw, sh, k)
    {
        var cyNorm = _barrelCenterY();
        var aspect = sh / Math.max(1, sw);
        var cornerR = _cornerR(cyNorm, aspect);
        if (_lutSrc && _lutW === sw && _lutH === sh && _lutK === k &&
            _lutCornerR === cornerR) {
            return;
        }
        var cx = sw * 0.5;
        var cy = sh * cyNorm;
        var len = sw * sh;
        var edgeDark = TUNING.CURRENT.BARREL_EDGE_DARKEN;
        _lutSrc = new Int32Array(len);
        _lutFade = new Uint8Array(len);
        var py;
        var px;
        for (py = 0; py < sh; py++) {
            for (px = 0; px < sw; px++) {
                var di = py * sw + px;
                var nx = (px - cx) / cx;
                var ny = (py - cy) / cy * aspect;
                var r2 = nx * nx + ny * ny;
                var r = Math.sqrt(r2);
                var rn = r / cornerR;
                var scale = _fitFrameScale(rn, k);
                var sx = Math.round(cx + nx * cx * scale);
                var sy = Math.round(cy + (py - cy) * scale);
                if (sx < 0) { sx = 0; }
                if (sy < 0) { sy = 0; }
                if (sx >= sw) { sx = sw - 1; }
                if (sy >= sh) { sy = sh - 1; }
                _lutSrc[di] = sy * sw + sx;
                if (edgeDark > 0 && rn > 0.78) {
                    var fade = Math.min(1, (rn - 0.78) / 0.22) * edgeDark;
                    _lutFade[di] = Math.round((1 - fade) * 255);
                } else {
                    _lutFade[di] = 255;
                }
            }
        }
        _lutW = sw;
        _lutH = sh;
        _lutK = k;
        _lutCornerR = cornerR;
    }

    function _applyBarrelCpu(ctx, x, y, w, h)
    {
        var scratch = _ensureScratch(w, h);
        var sw = scratch.w;
        var sh = scratch.h;
        var k = TUNING.CURRENT.BARREL_STRENGTH;

        scratch.ctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);
        var small = scratch.ctx.getImageData(0, 0, sw, sh);
        _rebuildLut(sw, sh, k);

        if (!_outData || _outData.width !== sw || _outData.height !== sh) {
            _outData = scratch.ctx.createImageData(sw, sh);
        }
        var out = _outData.data;
        var src = small.data;
        var lut = _lutSrc;
        var fade = _lutFade;
        var len = sw * sh;
        var i;
        var si;
        var di;
        var f;
        var ri;
        var gi;
        var bi;

        for (i = 0; i < len; i++) {
            si = lut[i] * 4;
            di = i * 4;
            f = fade[i];
            if (f === 255) {
                out[di] = src[si];
                out[di + 1] = src[si + 1];
                out[di + 2] = src[si + 2];
                out[di + 3] = src[si + 3];
            } else {
                ri = (src[si] * f) >> 8;
                gi = (src[si + 1] * f) >> 8;
                bi = (src[si + 2] * f) >> 8;
                out[di] = ri;
                out[di + 1] = gi;
                out[di + 2] = bi;
                out[di + 3] = src[si + 3];
            }
        }

        scratch.ctx.putImageData(_outData, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) {
            ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(scratch.canvas, 0, 0, sw, sh, x, y, w, h);
        ctx.restore();
    }

    function _applyBarrel(ctx, x, y, w, h)
    {
        if (!_fisheyeEnabled) { return; }
        if (!_applyBarrelGl(ctx, x, y, w, h)) {
            _applyBarrelCpu(ctx, x, y, w, h);
        }
    }

    function _applyVignette(ctx, x, y, w, h)
    {
        var cyFactor = _fisheyeEnabled ?
            TUNING.CURRENT.FISHEYE_VP_FACTOR : 0.48;
        var edge = __vignetteEdge(_fisheyeEnabled);
        var key = [_fisheyeEnabled, x, y, w, h, cyFactor, edge].join('|');
        if (key !== _vigKey) {
            var cx = x + w * 0.5;
            var cy = y + h * cyFactor;
            var inner = Math.min(w, h) * (_fisheyeEnabled ? 0.42 : 0.12);
            var outer = Math.sqrt(w * w + h * h) * (_fisheyeEnabled ? 0.90 : 0.82);
            _vigGrad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
            _vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
            _vigGrad.addColorStop(_fisheyeEnabled ? 0.82 : 0.75, 'rgba(0,0,0,0)');
            _vigGrad.addColorStop(1, 'rgba(0,0,0,' + edge + ')');
            _vigKey = key;
        }
        ctx.fillStyle = _vigGrad;
        ctx.fillRect(x, y, w, h);
    }

    function _ensureGrain()
    {
        if (_grainTile) { return; }
        var size = 128;
        _grainTile = document.createElement('canvas');
        _grainTile.width = size;
        _grainTile.height = size;
        var gctx = _grainTile.getContext('2d');
        var img = gctx.createImageData(size, size);
        var i;
        for (i = 0; i < img.data.length; i += 4) {
            var n = (Math.random() * 255) | 0;
            img.data[i] = n;
            img.data[i + 1] = n;
            img.data[i + 2] = n;
            img.data[i + 3] = 28;
        }
        gctx.putImageData(img, 0, 0);
    }

    function _applyGrain(ctx, x, y, w, h)
    {
        _ensureGrain();
        _frame++;
        if (_fisheyeEnabled) {
            _grainSkip = (_grainSkip + 1) % 2;
            if (_grainSkip !== 0) { return; }
        }
        ctx.save();
        ctx.globalAlpha = _fisheyeEnabled ? 0.08 : 0.3;
        ctx.globalCompositeOperation = 'overlay';
        var ox = (_frame * 3) % _grainTile.width;
        var oy = (_frame * 2) % _grainTile.height;
        if (_fisheyeEnabled) {
            ctx.drawImage(_grainTile, ox, oy, _grainTile.width, _grainTile.height,
                x, y, w, h);
        } else {
            var ty;
            var tx;
            for (ty = y - oy; ty < y + h; ty += _grainTile.height) {
                for (tx = x - ox; tx < x + w; tx += _grainTile.width) {
                    ctx.drawImage(_grainTile, tx, ty);
                }
            }
        }
        ctx.restore();
    }

    function _apply(ctx, x, y, w, h)
    {
        _applyBarrel(ctx, x, y, w, h);
        _applyVignette(ctx, x, y, w, h);
        _applyGrain(ctx, x, y, w, h);
    }

    return {
        apply: _apply,
        fisheyeEnabled: __fisheyeEnabled,
        barrelStrength: __barrelStrength,
        vignetteEdge: __vignetteEdge,
        unmapPointer: _screenToSource
    };
})();