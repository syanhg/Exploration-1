/* Minimal store-only ZIP writer (PNGs are already compressed). */
const MiniZip = (function () {
  const T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  // files: [{ name: string, data: Uint8Array }]
  function build(files) {
    const enc = new TextEncoder();
    const now = dosTime(new Date());
    const locals = [], centrals = [];
    let offset = 0;

    files.forEach(f => {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);           // store
      lv.setUint16(10, now.time, true);
      lv.setUint16(12, now.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, now.time, true);
      cv.setUint16(14, now.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);

      locals.push(lh, f.data);
      centrals.push(ch);
      offset += lh.length + size;
    });

    const cdSize = centrals.reduce((a, b) => a + b.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...locals, ...centrals, eocd], { type: 'application/zip' });
  }

  return { build };
})();
