/* Frida Asset Forge — GLSL sources (WebGL2 / GLSL ES 3.00) */

const VERT_SRC = `#version 300 es
precision highp float;
void main(){
  // fullscreen triangle
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 fragColor;

uniform vec2      uRes;
uniform sampler2D uTex;
uniform float     uTexAspect;
uniform float     uHasTex;

// camera / transform
uniform vec3  uRot;        // yaw, pitch, roll (radians)
uniform float uFov;        // radians
uniform float uDist;
uniform vec2  uOffset;
uniform float uZoom;

// geometry
uniform vec3  uBox;        // half extents
uniform float uRadius;

// optics
uniform float uIOR;
uniform float uDisp;
uniform vec2  uSmearDir;
uniform float uSmearAmt;
uniform float uZoomAmt;
uniform float uTwist;
uniform float uAnchor;     // 0 = smear starts at the entry face, 0.5 = centred
uniform float uTrail;      // front-weighting of the accumulation
uniform float uDepthBlur;  // extra blur added with depth
uniform float uClarity;    // how cleanly the entry image reads through the body
uniform float uRelief;     // heightfield parallax — gives the scene real depth
uniform float uFog;        // aerial haze accumulated with depth
uniform float uWorldWrap;  // 0 = clamp the image at its edge, 1 = mirror it onward
uniform int   uSamples;

// color
uniform vec3  uCol1;
uniform vec3  uCol2;
uniform vec3  uCol3;
uniform float uTintAmt;
uniform float uRimAmt;
uniform float uRimPow;
uniform float uGradAngle;
uniform float uGradWrap;

// surface
uniform float uFrost;
uniform float uBlur;
uniform float uImgOpacity;
uniform float uCore;
uniform float uSpec;
uniform float uSpecSharp;
uniform vec3  uLightDir;

// grade
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;

// ground
uniform vec2  uShadowC;
uniform vec2  uShadowR;
uniform float uShadowAmt;
uniform float uShadowSoft;

uniform vec3  uBg;
uniform float uTransparent;
uniform float uGrain;
uniform float uSeed;

#define MAX_STEPS 128
#define FAR 60.0

mat3 rotMat(vec3 r){
  float cy = cos(r.x), sy = sin(r.x);
  float cp = cos(r.y), sp = sin(r.y);
  float cr = cos(r.z), sr = sin(r.z);
  mat3 Ry = mat3( cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0,  cy);
  mat3 Rx = mat3(1.0, 0.0, 0.0,  0.0,  cp,  sp,  0.0, -sp,  cp);
  mat3 Rz = mat3( cr,  sr, 0.0,  -sr,  cr, 0.0,  0.0, 0.0, 1.0);
  return Rz * Rx * Ry;
}

float sdBox(vec3 p){
  vec3 b = uBox;
  float r = min(uRadius, min(b.x, min(b.y, b.z)));
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

vec3 calcNormal(vec3 p){
  const vec2 e = vec2(1.0, -1.0) * 0.0009;
  return normalize(
      e.xyy * sdBox(p + e.xyy)
    + e.yyx * sdBox(p + e.yyx)
    + e.yxy * sdBox(p + e.yxy)
    + e.xxx * sdBox(p + e.xxx));
}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 3-stop pastel gradient sampled across the object
vec3 gradCol(vec3 p){
  float a = uGradAngle;
  vec2 dir = vec2(cos(a), sin(a));
  vec2 q = p.xy / max(uBox.xy, vec2(1e-4));
  float g = dot(dir, q) * 0.5 + 0.5;
  g = (uGradWrap <= 1.0) ? clamp(g, 0.0, 1.0) : fract(clamp(g, 0.0, 0.99999) * uGradWrap);
  return g < 0.5 ? mix(uCol1, uCol2, g * 2.0)
                 : mix(uCol2, uCol3, (g - 0.5) * 2.0);
}

// map an interior point onto the front-face image plane (cover fit)
vec2 faceUV(vec3 p){
  vec2 uv = p.xy / max(uBox.xy, vec2(1e-4)) * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  float faceA = uBox.x / max(uBox.y, 1e-4);
  float texA  = max(uTexAspect, 1e-4);
  if (texA > faceA) uv.x = (uv.x - 0.5) * (faceA / texA) + 0.5;
  else              uv.y = (uv.y - 0.5) * (texA / faceA) + 0.5;
  return uv;
}

// Keep the interior world continuous past the edge of the photograph: clamped
// edges streak, mirrored edges read as scenery carrying on outside the frame.
vec2 sampleUV(vec2 uv){
  vec2 cl = clamp(uv, 0.0, 1.0);
  vec2 mr = abs(fract(uv * 0.5) * 2.0 - 1.0);
  return mix(cl, mr, uWorldWrap);
}

vec3 texel(vec2 uv, float lod){
  return textureLod(uTex, sampleUV(uv), lod).rgb;
}

// Parallax relief: walk the image's luminance as a heightfield along the
// direction the ray drifts with depth, so foreground and background separate
// as the camera turns instead of sitting on one flat plane.
vec2 reliefOffset(vec2 uv, vec2 drift, float lod){
  if (abs(uRelief) < 1e-4) return vec2(0.0);
  const int STEPS = 8;
  vec2 duv = drift * uRelief / float(STEPS);
  float layer = 1.0 / float(STEPS);
  float h = 1.0;
  vec2 cur = uv;
  for (int i = 0; i < STEPS; i++){
    vec3 c = texel(cur, lod);
    if (dot(c, vec3(0.2126, 0.7152, 0.0722)) >= h) break;
    h -= layer;
    cur += duv;
  }
  return cur - uv;
}

// displacement applied to the image plane at depth offset k
vec2 warpUV(vec2 uv, float k){
  uv += uSmearDir * uSmearAmt * k;
  vec2 c = uv - 0.5;
  float tw = uTwist * k;
  float ct = cos(tw), st = sin(tw);
  c = mat2(ct, -st, st, ct) * c;
  c *= (1.0 + uZoomAmt * k);
  return c + 0.5;
}

float exitDist(vec3 p, vec3 d){
  float t = 0.0025;
  for (int i = 0; i < 96; i++){
    float s = sdBox(p + d * t);
    if (s > -0.0009) break;
    t += max(-s, 0.0035);
    if (t > FAR) break;
  }
  return t;
}

// march the refracted ray through the slab, smearing the image along depth.
// open (0..1) lifts a crisp copy of the entry cross-section back over the
// streak so the photograph stays legible through the body.
vec3 traceVolume(vec3 p, vec3 d, float fres, float jit, float open,
                 vec2 par, vec3 fogCol){
  if (uHasTex < 0.5) return vec3(1.0);
  float T = exitDist(p, d);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  int N = uSamples;
  float base = uBlur + fres * uFrost;
  for (int i = 0; i < N; i++){
    // f = 0 at the entry cross-section, 1 at the exit
    float f = (float(i) + jit) / float(N);
    vec3 q = p + d * (T * f);

    // Anchor the displacement at the entry face so the first cross-section is
    // undisplaced and stays readable; the streak accumulates with depth.
    vec2 uv = warpUV(faceUV(q), f - uAnchor) + par;

    vec3 c = texel(uv, base + uDepthBlur * f);
    // aerial perspective — depth in the slab reads as distance in the scene
    c = mix(c, fogCol, uFog * f);

    // Weight the head of the trail, and let the tail blur out with depth.
    float w = pow(1.0 - f * 0.999, uTrail);
    acc  += c * w;
    wsum += w;
  }
  vec3 smear = acc / max(wsum, 1e-4);
  if (open <= 0.0) return smear;

  // Undisplaced plate at the entry face, carrying only the base blur.
  vec3 plate = texel(warpUV(faceUV(p), -uAnchor) + par, uBlur);
  return mix(smear, plate, open);
}

vec3 grade(vec3 c){
  c *= uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  return c;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uvn  = (frag * 2.0 - uRes) / uRes.y;

  float tanHalf = tan(uFov * 0.5) / max(uZoom, 1e-3);

  vec3 ro = vec3(uOffset, uDist);
  vec3 rd = normalize(vec3(uvn * tanHalf, -1.0));

  mat3 R  = rotMat(uRot);
  mat3 Ri = transpose(R);
  vec3 oro = Ri * ro;
  vec3 ord = Ri * rd;

  // ---- ground shadow (screen space blob) ----
  vec2 sp = (uvn - uShadowC) / max(uShadowR, vec2(1e-4));
  float sd = length(sp);
  float shadow = 1.0 - smoothstep(1.0 - uShadowSoft, 1.0 + uShadowSoft, sd);
  shadow = pow(clamp(shadow, 0.0, 1.0), 1.6) * uShadowAmt;

  vec3  bg  = uBg * (1.0 - shadow * 0.85);
  float bgA = 1.0;
  if (uTransparent > 0.5){ bg = vec3(0.0); bgA = shadow * 0.85; }

  // ---- raymarch the slab ----
  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < MAX_STEPS; i++){
    vec3 p = oro + ord * t;
    float d = sdBox(p);
    if (d < 0.0009){ hit = 1.0; break; }
    t += d;
    if (t > FAR) break;
  }

  if (hit < 0.5){
    fragColor = vec4(bg, bgA);
    return;
  }

  vec3 p = oro + ord * t;
  vec3 n = calcNormal(p);

  float ndv  = clamp(dot(n, -ord), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uRimPow);

  float jit = hash21(frag + uSeed);

  // per-channel dispersion
  float e = 1.0 / max(uIOR, 1.0001);
  vec3 dr = refract(ord, n, e * (1.0 + uDisp));
  vec3 dg = refract(ord, n, e);
  vec3 db = refract(ord, n, e * (1.0 - uDisp));
  if (dot(dr, dr) < 0.5) dr = reflect(ord, n);
  if (dot(dg, dg) < 0.5) dg = reflect(ord, n);
  if (dot(db, db) < 0.5) db = reflect(ord, n);

  // Clarity opens up the glass where we look through it squarely, and lets the
  // frosted, tinted treatment keep the grazing edges.
  float open = clamp(uClarity, 0.0, 1.0) * (1.0 - fres);

  vec3 g = gradCol(p);

  // How far the sampled point drifts across the image over a full traverse of
  // the slab: the parallax rate of the interior. The relief walk is done once,
  // on the green ray, and shared by all three channels so dispersion stays a
  // colour fringe rather than three disagreeing worlds.
  vec2 uv0   = faceUV(p);
  vec2 drift = faceUV(p + dg * (uBox.z * 2.0)) - uv0;
  vec2 par   = reliefOffset(uv0, drift, uBlur + fres * uFrost + 1.0);

  vec3 fogCol = mix(vec3(1.0), g, 0.65);

  vec3 col;
  col.r = traceVolume(p, dr, fres, jit, open, par, fogCol).r;
  col.g = traceVolume(p, dg, fres, jit, open, par, fogCol).g;
  col.b = traceVolume(p, db, fres, jit, open, par, fogCol).b;

  col = grade(col);

  // frosted white core, then image mixed on top
  vec3 milk = vec3(1.0);
  col = mix(milk, col, uImgOpacity);
  col = mix(col, milk, uCore * fres * 0.5 * (1.0 - open * 0.75));

  // pastel gel tint through the body — thinned out where the image reads
  col *= mix(vec3(1.0), g * 1.35, uTintAmt * (1.0 - open * 0.65));

  // chromatic rim (edge-weighted, so clarity barely touches it)
  col += g * fres * uRimAmt * (1.0 - open * 0.30);

  // specular sheen
  vec3 L = normalize(uLightDir);
  vec3 h = normalize(L - ord);
  float s = pow(clamp(dot(n, h), 0.0, 1.0), uSpecSharp);
  col += vec3(s) * uSpec;

  if (uGrain > 0.0){
    col += (hash21(frag * 1.7 + uSeed * 3.1) - 0.5) * uGrain;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
