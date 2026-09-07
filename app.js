/* Frida Asset Forge — application */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));

  const glCanvas = document.createElement('canvas');
  const view = $('view');
  const vctx = view.getContext('2d');

  let items = [];          // { id, name, caption, tex, aspect, params }
  let active = -1;
  let dirty = true;
  let uid = 0;

  const globalParams = clone(DEFAULTS);   // used when no item is selected

  function status(msg, isErr) {
    const el = $('status');
    el.textContent = msg || '';
    el.style.color = isErr ? '#a00000' : '#000000';
  }

  try {
    Engine.init(glCanvas);
  } catch (e) {
    status('Renderer error: ' + e.message, true);
    console.error(e);
  }

  const curParams = () => (active >= 0 ? items[active].params : globalParams);

  /* ---------------- controls ---------------- */

  const inputs = {};

  function buildControls() {
    const host = $('controls');
    SCHEMA.forEach(([group, rows]) => {
      const d = document.createElement('details');
      d.open = true;
      const s = document.createElement('summary');
      s.innerHTML = '<b>' + group + '</b>';
      d.appendChild(s);

      const t = document.createElement('table');
      t.className = 'ctl';
      rows.forEach(([key, label, min, max, step]) => {
        const tr = document.createElement('tr');

        const td0 = document.createElement('td');
        td0.className = 'lbl';
        td0.textContent = label;

        const td1 = document.createElement('td');
        const range = document.createElement('input');
        range.type = 'range';
        range.min = min; range.max = max; range.step = step;

        const td2 = document.createElement('td');
        const num = document.createElement('input');
        num.type = 'number';
        num.min = min; num.max = max; num.step = step;
        num.className = 'num';

        const set = (v, from) => {
          v = Math.min(max, Math.max(min, Number(v)));
          if (!isFinite(v)) return;
          curParams()[key] = v;
          if (from !== 'r') range.value = v;
          if (from !== 'n') num.value = v;
          dirty = true;
        };
        range.addEventListener('input', () => set(range.value, 'r'));
        num.addEventListener('input', () => set(num.value, 'n'));

        td1.appendChild(range); td2.appendChild(num);
        tr.append(td0, td1, td2);
        t.appendChild(tr);
        inputs[key] = { range, num };
      });
      d.appendChild(t);
      host.appendChild(d);
    });

    ['col1', 'col2', 'col3', 'bg'].forEach(k => {
      const el = $('c_' + k);
      inputs[k] = { color: el };
      el.addEventListener('input', () => { curParams()[k] = el.value; dirty = true; });
    });
    inputs.transparent = { check: $('c_transparent') };
    $('c_transparent').addEventListener('change', e => {
      curParams().transparent = e.target.checked; dirty = true;
    });
  }

  function syncControls() {
    const p = curParams();
    Object.keys(inputs).forEach(k => {
      const i = inputs[k];
      if (i.range) { i.range.value = p[k]; i.num.value = p[k]; }
      else if (i.color) { i.color.value = p[k]; }
      else if (i.check) { i.check.checked = !!p[k]; }
    });
  }

  /* ---------------- items ---------------- */

  function itemList() {
    const host = $('items');
    host.innerHTML = '';
    if (!items.length) {
      host.innerHTML = '<p class="muted">No images loaded. Add images, or work with an empty (frosted) slab.</p>';
      return;
    }
    const t = document.createElement('table');
    t.className = 'items';
    items.forEach((it, i) => {
      const tr = document.createElement('tr');
      if (i === active) tr.className = 'sel';

      const c0 = document.createElement('td');
      const th = document.createElement('img');
      th.src = it.thumb; th.className = 'th';
      c0.appendChild(th);

      const c1 = document.createElement('td');
      c1.className = 'nm';
      c1.textContent = it.name;

      const c2 = document.createElement('td');
      const cap = document.createElement('input');
      cap.type = 'text'; cap.value = it.caption; cap.className = 'cap';
      cap.placeholder = 'caption';
      cap.addEventListener('input', () => { it.caption = cap.value; });
      cap.addEventListener('click', e => e.stopPropagation());
      c2.appendChild(cap);

      const c3 = document.createElement('td');
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = 'Remove';
      del.addEventListener('click', e => {
        e.stopPropagation();
        Engine.deleteTexture(it.tex);
        items.splice(i, 1);
        if (active >= items.length) active = items.length - 1;
        itemList(); syncControls(); dirty = true;
      });
      c3.appendChild(del);

      tr.append(c0, c1, c2, c3);
      tr.addEventListener('click', () => {
        active = i; itemList(); syncControls(); dirty = true;
      });
      t.appendChild(tr);
    });
    host.appendChild(t);
  }

  function addFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    let pending = list.length;
    list.forEach(file => {
      const img = new Image();
      img.onload = () => {
        const tc = document.createElement('canvas');
        tc.width = 44; tc.height = 30;
        tc.getContext('2d').drawImage(img, 0, 0, 44, 30);
        const base = clone(active >= 0 ? items[active].params : globalParams);
        base.seed = Math.random() * 100;
        items.push({
          id: ++uid,
          name: file.name.replace(/\.[^.]+$/, ''),
          caption: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').toUpperCase(),
          tex: Engine.makeTexture(img),
          aspect: img.naturalWidth / img.naturalHeight,
          thumb: tc.toDataURL('image/png'),
          params: base
        });
        if (active < 0) active = 0;
        if (--pending === 0) { itemList(); syncControls(); dirty = true; status(items.length + ' image(s) loaded.'); }
      };
      img.onerror = () => { if (--pending === 0) { itemList(); dirty = true; } };
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------------- render ---------------- */

  function texOf(it) { return it ? { tex: it.tex, aspect: it.aspect } : null; }

  function renderInto(ctx2d, W, H, params, tex, ssaa) {
    Engine.render(params, Math.round(W * ssaa), Math.round(H * ssaa), tex);
    ctx2d.canvas.width = W; ctx2d.canvas.height = H;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';
    ctx2d.drawImage(glCanvas, 0, 0, W, H);
  }

  function checker(ctx, W, H) {
    const s = 10;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaeaea';
    for (let y = 0; y < H; y += s)
      for (let x = 0; x < W; x += s)
        if (((x / s) + (y / s)) % 2 === 0) ctx.fillRect(x, y, s, s);
  }

  function drawPreview() {
    // Layout size comes from CSS only. Never write style.width/height back from
    // clientWidth here: box-sizing is border-box and the canvas has a 1px border,
    // so clientWidth is 2px smaller than the border-box width and feeding it back
    // shrinks the canvas by 2px on every rendered frame.
    const W = Math.max(1, view.clientWidth), H = Math.max(1, view.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    const p = curParams();
    const ss = Number($('previewSS').value);

    Engine.render(p, Math.round(pw * ss), Math.round(ph * ss), texOf(items[active]));
    if (view.width !== pw) view.width = pw;
    if (view.height !== ph) view.height = ph;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, pw, ph);
    if (p.transparent) checker(vctx, pw, ph);
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(glCanvas, 0, 0, pw, ph);
    $('dims').textContent = W + ' × ' + H + ' preview @ ' + ss + '× supersample';
  }

  function loop() {
    if (dirty) { dirty = false; try { drawPreview(); } catch (e) { status(e.message, true); } }
    requestAnimationFrame(loop);
  }

  /* ---------------- interaction ---------------- */

  let drag = null;
  view.addEventListener('pointerdown', e => {
    view.setPointerCapture(e.pointerId);
    const p = curParams();
    drag = { x: e.clientX, y: e.clientY, yaw: p.yaw, pitch: p.pitch, ox: p.offsetX, oy: p.offsetY, shift: e.shiftKey };
  });
  view.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = curParams();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.shift || e.shiftKey) {
      p.offsetX = drag.ox - dx * 0.004;
      p.offsetY = drag.oy + dy * 0.004;
    } else {
      p.yaw = drag.yaw + dx * 0.35;
      p.pitch = Math.max(-89, Math.min(89, drag.pitch + dy * 0.35));
    }
    syncControls(); dirty = true;
  });
  const endDrag = () => { drag = null; };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('wheel', e => {
    e.preventDefault();
    const p = curParams();
    p.zoom = Math.max(0.2, Math.min(4, p.zoom * (e.deltaY > 0 ? 0.94 : 1.064)));
    syncControls(); dirty = true;
  }, { passive: false });

  ['dragover', 'drop'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
  document.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  /* ---------------- export ---------------- */

  const canvasBytes = c => new Promise(res =>
    c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png'));

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function makeOut() {
    const c = document.createElement('canvas');
    return { c, ctx: c.getContext('2d') };
  }

  function exportSize() {
    return {
      w: Math.max(16, parseInt($('outW').value, 10) || 1200),
      h: Math.max(16, parseInt($('outH').value, 10) || 700),
      ss: Number($('outSS').value)
    };
  }

  function renderItem(i) {
    const { w, h, ss } = exportSize();
    const o = makeOut();
    const it = items[i];
    renderInto(o.ctx, w, h, it ? it.params : globalParams, texOf(it), ss);
    return o.c;
  }

  $('btnPng').addEventListener('click', async () => {
    status('Rendering…');
    const c = active >= 0 ? renderItem(active) : (() => {
      const { w, h, ss } = exportSize(); const o = makeOut();
      renderInto(o.ctx, w, h, globalParams, null, ss); return o.c;
    })();
    c.toBlob(b => {
      download(b, (active >= 0 ? items[active].name : 'asset') + '.png');
      status('Exported PNG.');
    }, 'image/png');
  });

  $('btnZip').addEventListener('click', async () => {
    if (!items.length) { status('Load images first.', true); return; }
    status('Rendering ' + items.length + ' assets…');
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const c = renderItem(i);
      files.push({ name: String(i + 1).padStart(2, '0') + '_' + items[i].name + '.png', data: await canvasBytes(c) });
      status('Rendered ' + (i + 1) + '/' + items.length + '…');
    }
    download(MiniZip.build(files), 'assets.zip');
    status('Exported ' + files.length + ' PNGs as assets.zip');
  });

  /* ---------------- contact sheet ---------------- */

  function buildSheet() {
    const n = items.length || 1;
    const cols = Math.max(1, parseInt($('sCols').value, 10) || 2);
    const cw = parseInt($('sCellW').value, 10) || 420;
    const ch = parseInt($('sCellH').value, 10) || 300;
    const gx = parseInt($('sGapX').value, 10) || 60;
    const gy = parseInt($('sGapY').value, 10) || 80;
    const mg = parseInt($('sMargin').value, 10) || 60;
    const showCap = $('sCaptions').checked;
    const capH = showCap ? 22 : 0;
    const tick = showCap ? (parseInt($('sTick').value, 10) || 28) : 0;
    const ss = Number($('outSS').value);
    const fs = parseInt($('sFont').value, 10) || 11;

    const rows = Math.ceil(n / cols);
    const cellTotalH = capH + tick + ch;
    const W = mg * 2 + cols * cw + (cols - 1) * gx;
    const H = mg * 2 + rows * cellTotalH + (rows - 1) * gy;

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = $('c_bg').value;
    ctx.fillRect(0, 0, W, H);

    const tmp = makeOut();

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const r = Math.floor(i / cols), c = i % cols;
      const x = mg + c * (cw + gx);
      const y = mg + r * (cellTotalH + gy);

      if (showCap) {
        const label = (it ? it.caption : '').trim();
        if (label) {
          ctx.font = fs + 'px "Times New Roman", Times, serif';
          ctx.textBaseline = 'middle';
          const padX = 7;
          const tw = ctx.measureText(label).width;
          const bw = tw + padX * 2, bh = fs + 8;
          const bx = Math.round(x + cw / 2 - bw / 2), by = Math.round(y);
          ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
          ctx.fillStyle = '#111';
          ctx.textAlign = 'center';
          ctx.fillText(label, x + cw / 2, by + bh / 2 + 0.5);
          ctx.beginPath();
          ctx.moveTo(Math.round(x + cw / 2) + 0.5, by + bh);
          ctx.lineTo(Math.round(x + cw / 2) + 0.5, by + bh + tick);
          ctx.stroke();
        }
      }

      const p = clone(it ? it.params : globalParams);
      p.transparent = true;      // composite onto the sheet ground
      renderInto(tmp.ctx, cw, ch, p, texOf(it), ss);
      ctx.drawImage(tmp.c, x, y + capH + tick);
    }
    return out;
  }

  $('btnSheet').addEventListener('click', () => {
    status('Building sheet…');
    try {
      const c = buildSheet();
      c.toBlob(b => { download(b, 'contact-sheet.png'); status('Exported contact-sheet.png (' + c.width + '×' + c.height + ')'); }, 'image/png');
    } catch (e) { status(e.message, true); }
  });

  $('btnSheetPreview').addEventListener('click', () => {
    try {
      const c = buildSheet();
      const w = window.open('', '_blank');
      if (!w) { status('Popup blocked — use Export sheet instead.', true); return; }
      w.document.write('<title>Sheet preview</title><body style="margin:0;background:#fff">'
        + '<img style="max-width:100%" src="' + c.toDataURL('image/png') + '">');
      status('Sheet preview opened.');
    } catch (e) { status(e.message, true); }
  });

  /* ---------------- presets / config ---------------- */

  function buildPresets() {
    const sel = $('preset');
    Object.keys(PRESETS).forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
    $('btnApplyPreset').addEventListener('click', () => {
      const k = sel.value;
      if (!PRESETS[k]) return;
      Object.assign(curParams(), PRESETS[k]);
      syncControls(); dirty = true;
      status('Applied preset: ' + k);
    });
  }

  $('btnApplyAll').addEventListener('click', () => {
    const src = clone(curParams());
    items.forEach(it => {
      const seed = it.params.seed;
      it.params = clone(src);
      it.params.seed = seed;
    });
    status('Applied current settings to all ' + items.length + ' item(s).');
    dirty = true;
  });

  $('btnVary').addEventListener('click', () => {
    const amt = Number($('varyAmt').value);
    items.forEach(it => {
      const p = it.params;
      p.seed = Math.random() * 100;
      p.yaw += (Math.random() * 2 - 1) * 14 * amt;
      p.pitch += (Math.random() * 2 - 1) * 8 * amt;
      p.roll += (Math.random() * 2 - 1) * 6 * amt;
      p.gradAngle += (Math.random() * 2 - 1) * 60 * amt;
      p.smear *= 1 + (Math.random() * 2 - 1) * 0.35 * amt;
      p.pitch = Math.max(-89, Math.min(89, p.pitch));
    });
    syncControls(); dirty = true;
    status('Varied ' + items.length + ' item(s).');
  });

  $('btnReset').addEventListener('click', () => {
    const seed = curParams().seed;
    Object.assign(curParams(), clone(DEFAULTS), { seed });
    syncControls(); dirty = true; status('Reset to defaults.');
  });

  $('btnSaveCfg').addEventListener('click', () => {
    const cfg = { version: 1, params: curParams(), items: items.map(i => ({ name: i.name, caption: i.caption, params: i.params })) };
    download(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), 'asset-config.json');
    status('Saved config JSON.');
  });

  $('cfgFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const cfg = JSON.parse(txt);
      if (cfg.params) Object.assign(globalParams, cfg.params);
      if (cfg.items) {
        cfg.items.forEach((ci, i) => {
          if (items[i]) { items[i].params = clone(ci.params); items[i].caption = ci.caption || items[i].caption; }
        });
      }
      if (active < 0) Object.assign(globalParams, cfg.params || {});
      itemList(); syncControls(); dirty = true;
      status('Config loaded.');
    }).catch(err => status('Bad config: ' + err.message, true));
  });

  $('files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('previewSS').addEventListener('change', () => { dirty = true; });

  /* ---------------- boot ---------------- */

  buildControls();
  buildPresets();
  itemList();
  syncControls();
  loop();
  window.addEventListener('resize', () => { dirty = true; });
  if (window.ResizeObserver) new ResizeObserver(() => { dirty = true; }).observe(view);
  status('Ready. Drop images anywhere, or drag on the canvas to orbit (Shift-drag to pan, scroll to zoom).');
})();
