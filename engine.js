/* Frida Asset Forge — WebGL2 renderer */

const Engine = (function () {
  let gl = null, prog = null, U = {}, glc = null;
  const white = { tex: null, aspect: 1 };

  const UNIFORMS = [
    'uRes','uTex','uTexAspect','uHasTex','uRot','uFov','uDist','uOffset','uZoom',
    'uBox','uRadius','uIOR','uDisp','uSmearDir','uSmearAmt','uZoomAmt','uTwist',
    'uAnchor','uTrail','uDepthBlur','uSamples',
    'uCol1','uCol2','uCol3','uTintAmt','uRimAmt','uRimPow','uGradAngle','uGradWrap',
    'uFrost','uBlur','uImgOpacity','uCore','uSpec','uSpecSharp','uLightDir',
    'uExposure','uSaturation','uContrast',
    'uShadowC','uShadowR','uShadowAmt','uShadowSoft',
    'uBg','uTransparent','uGrain','uSeed'
  ];

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    }
    return s;
  }

  function init(canvas) {
    glc = canvas;
    gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');

    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
    }
    gl.useProgram(prog);
    UNIFORMS.forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // 1x1 white fallback texture
    white.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, white.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return gl;
  }

  function makeTexture(source) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    return t;
  }

  function deleteTexture(t) { if (t) gl.deleteTexture(t); }

  // ---- camera math mirrored from the shader, for shadow placement ----
  function rotMat(yaw, pitch, roll) {
    const cy = Math.cos(yaw),  sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll),  sr = Math.sin(roll);
    const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
    const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
    const mul = (A, B) => A.map((r, i) => B[0].map((_, j) =>
      A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
    return mul(Rz, mul(Rx, Ry));
  }
  const apply = (M, v) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
  ];

  // returns { cx, cy, rx, ry, minY } in shader NDC (y in [-1,1], x scaled by aspect)
  function projectBounds(p) {
    const M = rotMat(p.yaw, p.pitch, p.roll);
    const tanHalf = Math.tan(p.fov * 0.5 * Math.PI / 180) / Math.max(p.zoom, 1e-3);
    const b = [p.sizeX, p.sizeY, p.sizeZ];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < 8; i++) {
      const c = [
        (i & 1 ? 1 : -1) * b[0],
        (i & 2 ? 1 : -1) * b[1],
        (i & 4 ? 1 : -1) * b[2]
      ];
      const w = apply(M, c);
      const vz = w[2] - p.dist;
      const denom = Math.max(-vz, 1e-3);
      const sx = ((w[0] - p.offsetX) / denom) / tanHalf;
      const sy = ((w[1] - p.offsetY) / denom) / tanHalf;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    }
    return {
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      rx: (maxX - minX) / 2, ry: (maxY - minY) / 2,
      minY
    };
  }

  const hex2rgb = h => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  };

  function render(p, w, h, texInfo) {
    glc.width = w; glc.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (texInfo && texInfo.tex) || white.tex);
    gl.uniform1i(U.uTex, 0);
    gl.uniform1f(U.uTexAspect, (texInfo && texInfo.aspect) || 1);
    gl.uniform1f(U.uHasTex, texInfo && texInfo.tex ? 1 : 0);

    const B = projectBounds(p);
    const shC = [B.cx + p.shadowX, B.minY - p.shadowY];
    const shR = [B.rx * p.shadowScaleX, B.ry * p.shadowScaleY];

    gl.uniform2f(U.uRes, w, h);
    gl.uniform3f(U.uRot, p.yaw, p.pitch, p.roll);
    gl.uniform1f(U.uFov, p.fov * Math.PI / 180);
    gl.uniform1f(U.uDist, p.dist);
    gl.uniform2f(U.uOffset, p.offsetX, p.offsetY);
    gl.uniform1f(U.uZoom, p.zoom);

    gl.uniform3f(U.uBox, p.sizeX, p.sizeY, p.sizeZ);
    gl.uniform1f(U.uRadius, p.radius);

    gl.uniform1f(U.uIOR, p.ior);
    gl.uniform1f(U.uDisp, p.disp);
    const a = p.smearAngle * Math.PI / 180;
    gl.uniform2f(U.uSmearDir, Math.cos(a), Math.sin(a));
    gl.uniform1f(U.uSmearAmt, p.smear);
    gl.uniform1f(U.uZoomAmt, p.zoomBlur);
    gl.uniform1f(U.uTwist, p.twist * Math.PI / 180);
    gl.uniform1f(U.uAnchor, p.anchor);
    gl.uniform1f(U.uTrail, p.trail);
    gl.uniform1f(U.uDepthBlur, p.depthBlur);
    gl.uniform1i(U.uSamples, p.samples | 0);

    gl.uniform3fv(U.uCol1, hex2rgb(p.col1));
    gl.uniform3fv(U.uCol2, hex2rgb(p.col2));
    gl.uniform3fv(U.uCol3, hex2rgb(p.col3));
    gl.uniform1f(U.uTintAmt, p.tint);
    gl.uniform1f(U.uRimAmt, p.rim);
    gl.uniform1f(U.uRimPow, p.rimPow);
    gl.uniform1f(U.uGradAngle, p.gradAngle * Math.PI / 180);
    gl.uniform1f(U.uGradWrap, p.gradWrap);

    gl.uniform1f(U.uFrost, p.frost);
    gl.uniform1f(U.uBlur, p.blur);
    gl.uniform1f(U.uImgOpacity, p.imgOpacity);
    gl.uniform1f(U.uCore, p.core);
    gl.uniform1f(U.uSpec, p.spec);
    gl.uniform1f(U.uSpecSharp, p.specSharp);
    gl.uniform3f(U.uLightDir, p.lightX, p.lightY, 1.0);

    gl.uniform1f(U.uExposure, p.exposure);
    gl.uniform1f(U.uSaturation, p.saturation);
    gl.uniform1f(U.uContrast, p.contrast);

    gl.uniform2fv(U.uShadowC, shC);
    gl.uniform2fv(U.uShadowR, shR);
    gl.uniform1f(U.uShadowAmt, p.shadow);
    gl.uniform1f(U.uShadowSoft, p.shadowSoft);

    gl.uniform3fv(U.uBg, hex2rgb(p.bg));
    gl.uniform1f(U.uTransparent, p.transparent ? 1 : 0);
    gl.uniform1f(U.uGrain, p.grain);
    gl.uniform1f(U.uSeed, p.seed);

    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { init, render, makeTexture, deleteTexture, projectBounds, get gl() { return gl; } };
})();
