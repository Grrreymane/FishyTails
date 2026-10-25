// Store cover / link-preview image (16:9). v1 (Sept 2026) is media/v1/cover.png.
// Record one frame as PNG:
//   python D:/Minigame/_workflow/tools/record_video.py D:/Minigame/Fishing tools/cover.js --size 1920x1080 --fps 1 --frames <dir> --out <dir>/x.mp4
// The scene is painted on its own 320×180 pixel canvas (1920×1080 = ×6, 1600×900 = ×5) with the game's sprites and
// drawing helpers; text goes through the game's outlined textSprite like everything in the game.
{
  let seed = 11;
  Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  setLang(REC.arg === 'en' ? 'en' : 'zh');
  const CW = 320, CH = 180, SEA = 74;
  const sky = ZONES[1].sky, water = [...ZONES[0].water, ...ZONES[5].water.slice(3)];
  const EQ = { hat: 'wizard', boat: 'whale', fur: 'galaxy', rod: 'goldrod' };

  // vertical colour bands with a two-row checker dither at each seam (the game's sky / water look)
  function bandsV(gx, y0, y1, cols) {
    const n = cols.length, hgt = (y1 - y0) / n;
    for (let i = 0; i < n; i++) { gx.fillStyle = cols[i]; gx.fillRect(0, R(y0 + i * hgt), CW, Math.ceil(hgt) + 1); }
    for (let i = 1; i < n; i++) {
      const y = R(y0 + i * hgt); gx.fillStyle = cols[i];
      for (let x = 0; x < CW; x += 2) { gx.fillRect(x, y - 2, 1, 1); gx.fillRect(x + 1, y - 1, 1, 1); }
      gx.fillStyle = cols[i - 1];
      for (let x = 0; x < CW; x += 2) { gx.fillRect(x + 1, y, 1, 1); gx.fillRect(x, y + 1, 1, 1); }
    }
  }
  // draw with the game's helpers (they paint on the global g) onto a canvas of our own
  const onto = (c, fn) => { const keep = g; g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(); g = keep; };

  function paintCover() {
    T = 1.7;   // pose of tentacles, tails and waves
    const sc = mk(CW, CH), x = sc.getContext('2d'); x.imageSmoothingEnabled = false;
    bandsV(x, 0, SEA, sky);
    bandsV(x, SEA, CH, water);
    onto(sc, () => {
      g.globalAlpha = .3; disc(58, 30, 17, '#fff6c8'); g.globalAlpha = 1; g.drawImage(I.sun, 48, 20);
      [[10, 14], [118, 34], [196, 54], [280, 46]].forEach(([cx, cy]) => g.drawImage(I.cloud, cx, cy));
      // light shafts
      g.globalAlpha = .07; g.fillStyle = '#ffffff';
      for (const sx of [40, 95, 150]) { g.beginPath(); g.moveTo(sx, SEA); g.lineTo(sx + 14, SEA); g.lineTo(sx - 30, CH); g.lineTo(sx - 60, CH); g.fill(); }
      g.globalAlpha = 1;
      // surface
      for (let px = 0; px < CW; px++) {
        const h = Math.sin(px * .28 + T * 2.2) + Math.sin(px * .11 - T * 1.3) * .6, hh = h > .6 ? 2 : (h > -.3 ? 1 : 0);
        if (hh) { g.fillStyle = water[0]; g.fillRect(px, SEA - hh, 1, hh); }
        if (h > 1.1) { g.fillStyle = ZONES[0].hl; g.fillRect(px, SEA - hh, 1, 1); }
      }
      g.globalAlpha = .45; g.fillStyle = ZONES[0].hl; g.fillRect(0, SEA, CW, 1); g.globalAlpha = 1;
      // seabed weeds
      g.fillStyle = '#1b1530'; g.fillRect(0, CH - 4, CW, 4);
      [[8, 20], [14, 13], [70, 17], [98, 24], [160, 15], [182, 21], [300, 18], [312, 12]].forEach(([wx, hgt]) => {
        for (let k = 0; k < hgt; k++) { g.fillStyle = k > hgt - 4 ? '#5ff2d0' : k % 3 ? '#2fb8a0' : '#1f8a78'; g.fillRect(wx + R(Math.sin(k * .35 + wx) * 2), CH - 4 - k, 2, 1); }
      });
      // fish from the nine seas (two shiny)
      [['clown', 92, 98, 1], ['parrot', 30, 112, 1], ['turtle', 70, 132, 1], ['tang', 142, 116, -1], ['sword', 26, 152, 1],
       ['koi', 124, 142, 1, 'g'], ['glowfish', 186, 104, -1], ['angler', 112, 166, 1], ['jelly', 176, 150, 1], ['ruby', 52, 96, -1, 'g']]
        .forEach(([k, fx, fy, face, mode]) => { const S = SPR[k], im = mode === 'g' ? (face > 0 ? S.gr : S.gl) : (face > 0 ? S.r : S.l); g.drawImage(im, R(fx - S.w / 2), R(fy - S.h / 2)); if (mode === 'g') for (const [dx, dy] of [[-9, -6], [10, 4], [-4, 8]]) { g.fillStyle = '#fff6c0'; g.fillRect(fx + dx, fy + dy, 1, 3); g.fillRect(fx + dx - 1, fy + dy + 1, 3, 1); } });
      // the cat in this update's new outfit
      const bx = 22, sy = SEA + 1;
      drawAngler(bx, sy, 'happy', EQ);
      const h = { x: bx + 29, y: sy - 11 }, tip = { x: h.x + 22, y: h.y - 26 };
      drawRod(h, tip, EQ.rod);
      // the Abyss Kraken from the first cover, one arm out of the water with the line caught on it
      const kx = 262, ky = 104, col = ['#46226a', '#6b3d8f', '#9a68c0'];
      const arm = tentacle(kx - 26, ky + 28, -Math.PI / 2 - .62, 66, 6, col, '#e9b8ff', 2, .5);
      tentacle(kx + 30, ky + 30, -Math.PI / 2 + .55, 58, 6, col, '#e9b8ff', 4, .8);
      const roots = [-29, -18, -7, 7, 18, 29].map((ox, i) => tentacle(kx + ox, ky + 50, Math.PI / 2 + ox * .016, 42, 6, col, '#e9b8ff', i * 1.1, 1.3));
      g.globalAlpha = .3; disc(kx - 17, ky + 36, 11, '#ffdf4a'); disc(kx + 17, ky + 36, 11, '#ffdf4a'); g.globalAlpha = 1;
      g.drawImage(SPRB.kraken.l, R(kx - SPRB.kraken.w / 2), ky);
      roots.forEach(p => capBase(p, 3, col));
      g.drawImage(I.bang, kx - 3, ky - 22, 7, 13);
      // taut red line from the rod to the tip of that arm, with a splash where the arm breaks the surface
      const end = arm[arm.length - 1];
      pcurve(tip.x, tip.y, (tip.x + end[0]) / 2, Math.min(tip.y, end[1]) - 6, end[0], end[1], '#ff6a5a');
      for (const [dx, dy] of [[-6, -3], [5, -5], [-2, -7], [8, -1], [-9, 0]]) { g.fillStyle = dy < -4 ? '#ffffff' : ZONES[0].hl; g.fillRect(R(end[0] + dx), R(SEA + dy), 2, 2); }
    });
    return sc;
  }

  REC.run({ fps: 1, seconds: 1, canvas: cv, audio: false,
    async setup() { try { await document.fonts.ready; await document.fonts.load('30px "Fusion Pixel"', ALLTEXT); } catch (e) {} TXC.clear();
      removeEventListener('resize', fit); cv.width = REC.width; cv.height = REC.height; K = cv.width / CW; },
    step() {
      const sc = paintCover();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sc, 0, 0, CW, CH, 0, 0, CW * K, CH * K);
      TQ.length = 0;
      const en = LANG === 'en';
      txt(en ? 'Fishy Tails' : '渔喵传说', 236, 27, en ? 30 : 36, '#ffe14a', 'center', OUT, 1, 158);
      if (!en) txt('FISHY TAILS', 236, 51, 13, '#9fe8ff', 'center', OUT);
      txt('猫猫钓鱼 · 吃Buff · 打海怪', 236, en ? 52 : 64, 9.5, '#ffffff', 'center', OUT, 1, 150);
      for (const t of TQ) {
        const c = textSprite(t), tw = c.w - 2 * c.pad;
        ctx.drawImage(c.cv, R(t.x * K - c.pad - (t.align === 'center' ? tw / 2 : t.align === 'right' ? tw : 0)), R(t.y * K - c.h / 2));
      }
    } });
}
