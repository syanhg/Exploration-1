/* Frida Asset Forge — parameter schema + presets */

const DEFAULTS = {
  // form
  sizeX: 1.15, sizeY: 0.70, sizeZ: 0.70, radius: 0.30,
  // camera
  yaw: -28, pitch: 14, roll: -5, fov: 22, dist: 6.0,
  zoom: 1.0, offsetX: 0, offsetY: 0,
  // optics
  ior: 1.34, disp: 0.055, samples: 28,
  smear: 0.55, smearAngle: 0, zoomBlur: 0.30, twist: 0,
  frost: 4.2, blur: 0.6, imgOpacity: 1.0, core: 0.35,
  // colour
  col1: '#ffb8c8', col2: '#ffcf8f', col3: '#b6ef9d',
  tint: 0.55, rim: 0.55, rimPow: 2.4, gradAngle: 8, gradWrap: 1,
  // light
  spec: 0.16, specSharp: 24, lightX: -0.4, lightY: 0.8,
  // grade
  exposure: 1.06, saturation: 1.10, contrast: 1.04,
  // ground
  shadow: 0.16, shadowSoft: 0.85, shadowX: 0.02, shadowY: 0.06,
  shadowScaleX: 1.05, shadowScaleY: 0.30,
  // output
  bg: '#ffffff', transparent: false, grain: 0.006, seed: 12.3
};

const SCHEMA = [
  ['Form', [
    ['sizeX', 'Width',        0.20, 2.60, 0.01],
    ['sizeY', 'Height',       0.15, 2.00, 0.01],
    ['sizeZ', 'Depth',        0.10, 2.00, 0.01],
    ['radius','Corner radius',0.00, 1.00, 0.005]
  ]],
  ['Camera', [
    ['yaw',    'Yaw °',    -180, 180, 0.5],
    ['pitch',  'Pitch °',   -89,  89, 0.5],
    ['roll',   'Roll °',   -180, 180, 0.5],
    ['fov',    'Lens FOV °',  6,  70, 0.5],
    ['dist',   'Distance',  1.5,  20, 0.05],
    ['zoom',   'Zoom',      0.2, 4.0, 0.01],
    ['offsetX','Shift X',  -2.0, 2.0, 0.01],
    ['offsetY','Shift Y',  -2.0, 2.0, 0.01]
  ]],
  ['Refraction &amp; smear', [
    ['ior',       'Index of refraction', 1.00, 2.60, 0.005],
    ['disp',      'Dispersion',          0.00, 0.40, 0.001],
    ['samples',   'Volume samples',         4,   64, 1],
    ['smear',     'Depth smear',        -1.50, 1.50, 0.005],
    ['smearAngle','Smear angle °',       -180,  180, 1],
    ['zoomBlur',  'Zoom streak',        -1.50, 1.50, 0.005],
    ['twist',     'Twist °',              -90,   90, 0.5],
    ['frost',     'Frost (edge blur)',   0.00, 9.00, 0.05],
    ['blur',      'Base blur',           0.00, 9.00, 0.05],
    ['imgOpacity','Image opacity',       0.00, 1.00, 0.01],
    ['core',      'Milk core',           0.00, 1.50, 0.01]
  ]],
  ['Chromatic shell', [
    ['tint',     'Gel tint',      0.00, 1.60, 0.01],
    ['rim',      'Rim intensity', 0.00, 2.00, 0.01],
    ['rimPow',   'Rim falloff',   0.40, 8.00, 0.05],
    ['gradAngle','Gradient °',    -180,  180, 1],
    ['gradWrap', 'Gradient repeat', 1,     6, 0.05]
  ]],
  ['Light', [
    ['spec',      'Specular',    0.00, 1.00, 0.005],
    ['specSharp', 'Sharpness',   2.00, 200.0, 1],
    ['lightX',    'Light X',    -2.00, 2.00, 0.02],
    ['lightY',    'Light Y',    -2.00, 2.00, 0.02]
  ]],
  ['Grade', [
    ['exposure',  'Exposure',   0.20, 2.50, 0.01],
    ['saturation','Saturation', 0.00, 2.50, 0.01],
    ['contrast',  'Contrast',   0.40, 2.00, 0.01],
    ['grain',     'Grain',      0.00, 0.08, 0.001]
  ]],
  ['Ground shadow', [
    ['shadow',       'Opacity',  0.00, 0.80, 0.005],
    ['shadowSoft',   'Softness', 0.02, 2.00, 0.01],
    ['shadowX',      'Offset X', -1.0,  1.0, 0.005],
    ['shadowY',      'Offset Y', -1.0,  1.0, 0.005],
    ['shadowScaleX', 'Scale X',   0.1,  3.0, 0.01],
    ['shadowScaleY', 'Scale Y',   0.02, 2.0, 0.01]
  ]]
];

const PRESETS = {
  'Slab — hero (ref. 1)': {
    sizeX: 1.15, sizeY: 0.70, sizeZ: 0.70, radius: 0.30,
    yaw: -28, pitch: 14, roll: -5, fov: 22, dist: 6.0, zoom: 1.0,
    ior: 1.34, disp: 0.055, smear: 0.55, smearAngle: 0, zoomBlur: 0.30,
    frost: 4.2, blur: 0.6, imgOpacity: 1.0, core: 0.35,
    col1: '#ffb8c8', col2: '#ffcf8f', col3: '#b6ef9d',
    tint: 0.55, rim: 0.55, rimPow: 2.4, gradAngle: 8,
    shadow: 0.16, shadowScaleY: 0.30, spec: 0.16
  },
  'Card — contact sheet (ref. 2)': {
    sizeX: 1.05, sizeY: 0.60, sizeZ: 0.78, radius: 0.26,
    yaw: -14, pitch: 20, roll: 0, fov: 16, dist: 6.4, zoom: 1.0,
    ior: 1.28, disp: 0.035, smear: 0.42, smearAngle: 0, zoomBlur: 0.55,
    frost: 3.0, blur: 0.4, imgOpacity: 1.0, core: 0.18,
    col1: '#ffffff', col2: '#ffffff', col3: '#ffffff',
    tint: 0.12, rim: 0.22, rimPow: 3.2, gradAngle: 0,
    shadow: 0.0, spec: 0.10
  },
  'Frosted blank (no image)': {
    imgOpacity: 0.0, core: 0.9, frost: 6.0,
    tint: 0.95, rim: 0.8, rimPow: 1.8,
    col1: '#ffb0c4', col2: '#ffd79a', col3: '#a8e88f'
  },
  'Deep glass — heavy dispersion': {
    ior: 1.62, disp: 0.16, samples: 40, frost: 2.0,
    rim: 1.05, rimPow: 1.7, tint: 0.35, spec: 0.30, specSharp: 60
  },
  'Long pill — extreme smear': {
    sizeX: 1.9, sizeY: 0.52, sizeZ: 0.52, radius: 0.5,
    smear: 1.05, zoomBlur: 0.15, samples: 44, frost: 3.4, yaw: -34, pitch: 10
  },
  'Cube — near axis': {
    sizeX: 0.85, sizeY: 0.85, sizeZ: 0.85, radius: 0.28,
    yaw: -8, pitch: 8, roll: 0, fov: 14, dist: 6.5,
    smear: 0.25, zoomBlur: 0.6
  }
};
