// The current cover: the first cover's scene (media/v1/cover.png) with its title re-set in the game's own pixel font.
//   python D:/Minigame/_workflow/tools/record_video.py D:/Minigame/Fishing tools/cover-classic.js --size 1920x1080 --fps 1 --frames <dir> --out <dir>/x.mp4
// The old title is painted over with the sky behind it (sky rows are flat colour with a 2-pixel dither, so a
// 12 px strip from a clear column tiles exactly); the horizon water under the old tagline is tiled from a clear stretch.
{
  REC.run({ fps: 1, seconds: 1, canvas: cv, audio: false,
    async setup() {
      try { await document.fonts.ready; await document.fonts.load('30px "Fusion Pixel"', ALLTEXT); } catch (e) {} TXC.clear();
      removeEventListener('resize', fit); cv.width = 1920; cv.height = 1080; K = 6;
      this.img = await createImageBitmap(await (await fetch('media/v1/cover.png')).blob());
    },
    step() {
      const o = ctx; o.setTransform(1, 0, 0, 1, 0, 0); o.imageSmoothingEnabled = false;
      o.drawImage(this.img, 0, 0);
      const strip = (x0, y0, y1, dx0, dx1, w = 12) => {   // tile columns [x0, x0+w) of rows y0..y1 across dx0..dx1
        for (let x = dx0; x < dx1; x += w) o.drawImage(this.img, x0, y0, Math.min(w, dx1 - x), y1 - y0, x, y0, Math.min(w, dx1 - x), y1 - y0);
      };
      strip(1896, 24, 300, 1080, 1764);     // behind the old title: the clear sky at the right edge (right of the cloud)
      strip(1896, 300, 408, 1180, 1764);    // lower down, stay clear of the kraken arm's splash on the left
      strip(1600, 408, 444, 1180, 1600, 160);   // horizon waves under the old tagline
      const en = REC.arg === 'en'; setLang(en ? 'en' : 'zh'); TQ.length = 0;
      if (en) {   // the tagline takes two lines in English, filling the footprint the way the Chinese title does
        txt('Fishy Tails', 236, 25, 32, '#ffe14a', 'center', OUT, 1, 116);
        txt('Fish · Buff up', 236, 50, 12, '#ffffff', 'center', OUT);
        txt('Beat sea monsters', 236, 63.5, 12, '#ffffff', 'center', OUT, 1, 92);
      } else {
        txt('渔喵传说', 236, 25, 32, '#ffe14a', 'center', OUT, 1, 106);   // stays inside the old title's footprint
        txt('FISHY TAILS', 236, 51, 12, '#9fe8ff', 'center', OUT);
        txt('钓鱼 · 吃Buff · 打海怪', 236, 63.5, 9, '#ffffff', 'center', OUT, 1, 92);   // clear of the kraken arm's tip on the left
      }
      for (const t of TQ) { const c = textSprite(t), tw = c.w - 2 * c.pad; o.drawImage(c.cv, R(t.x * K - c.pad - tw / 2), R(t.y * K - c.h / 2)); }
    } });
}
