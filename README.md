# Asset Forge

Internal tool. Turns images into refractive rounded-slab assets — a raymarched
rounded-box SDF with per-channel dispersion, frosted edges, a pastel chromatic
shell, and depth-smeared image sampling through the volume.

Static site, no build step, no dependencies. Open `index.html` or deploy the
repo root to GitHub Pages.

## Files

| File | Role |
|---|---|
| `index.html` | UI (plain HTML, Times New Roman, white ground) |
| `style.css` | Layout only |
| `shader.js` | GLSL ES 3.00 vertex + fragment sources |
| `engine.js` | WebGL2 setup, uniforms, camera projection for shadow placement |
| `params.js` | Parameter schema, defaults, presets |
| `app.js` | Controls, item list, export, contact sheet |
| `zip.js` | Store-only ZIP writer for batch export |

## How it works

1. A fullscreen triangle sphere-traces a rounded-box SDF in object space.
2. At the surface, the view ray is refracted three times — once per colour
   channel, with the IOR split by the dispersion amount. That produces the
   chromatic fringing on the edges.
3. Each refracted ray is marched to its exit point and sampled *N* times through
   the interior. Every sample maps its position onto the front-face image plane
   (cover-fit), offset by depth smear, zoom streak and twist. Averaging the
   samples is what smears the image along the slab's depth axis.
4. Frost is mip-level bias driven by Fresnel, so edges blur out while the centre
   stays sharp.
5. A three-stop pastel gradient tints the body and is added back at the rim,
   weighted by Fresnel.
6. The ground shadow is a screen-space blob positioned by projecting the box's
   eight corners with the same camera math as the shader.

## Controls

- Drag the canvas to orbit, `Shift`-drag to pan, scroll to zoom.
- Each loaded image carries its own parameter set. **Apply current settings to
  all** propagates the active look; **Vary all** jitters rotation, gradient and
  smear per item so a batch does not read as mechanical.
- **Export PNG** for the selected item, **Export all → ZIP** for the batch,
  **Export sheet PNG** for the captioned contact-sheet layout.
- **Save config** / **Load** round-trips every parameter as JSON (images are not
  embedded).

## Deploying

Settings → Pages → Deploy from branch → `main` / root. `.nojekyll` is present so
the files are served verbatim.
