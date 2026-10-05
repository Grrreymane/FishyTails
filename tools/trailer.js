// Store-page trailer director: ~15 s vertical video of the best moments.
// Record:  python D:/Minigame/_workflow/tools/record_video.py D:/Minigame/Fishing tools/trailer.js --out trailer.mp4
// Runs inside the game closure (see record_video.py), so it calls game functions directly.
{
  // same random numbers every take, so a good take can be re-recorded
  let seed = 7;
  Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const FPS = 30, DT = 1 / FPS;
  let song = 'z0';
  wantedTrack = () => song;          // one tune per section instead of a new one at every cut
  muted = false;

  const tick = (dt = DT) => { let d = dt; if (slowT > 0) { slowT -= dt; d *= .3; } update(d, dt); shake = 0; };
  const silent = (sec) => { const m = muted; muted = true; for (let t = 0; t < sec; t += DT) tick(); muted = m; };
  const cleanSlate = () => { P = []; POPS = []; INK = []; F = null; B = null; biter = null; bob = null; hook = null; leap = null; show = null; tension = 0; hold = false; jerk = false; flash = 0; slowT = 0; };
  const fresh = (zone) => { cleanSlate(); go('idle'); newRun(); run.hp = 5; run.zap = 0; if (zone) setupZone(zone); coinsShown = run.coins; };
  const best = zi => ZONES[zi].fish.slice().sort((a, b) => SP[b].val - SP[a].val)[0];

  // ---- shots: { len, start(), during(t) }
  const shots = [];
  // 1. the core loop in under 3 s: bite → reel → a shiny leaps out → card
  shots.push({ len: 3.0, start() {
    fresh(0); run.coins = 0; coinsShown = 0; song = 'z0';
    const t = tipPos(); bob = { x: 118, dip: 0 }; hook = { x: 118, y: 196, ty: 196 }; cast = { wait: 0 };
    biter = { key: 'tang', x: 118, y: 196, face: -1, ph: 'bite', t: 0, n: 1, c: 0, shiny: true }; go('wait');
  }, during(t) {
    if (state === 'wait' && t > .45) { startFight(); hold = true; F.timer = 99; run.reel = 2.6; }
    if (state === 'show' && show.crown !== 'gold') { show.crown = 'gold'; show.cm = Math.max(show.cm, 41); }
    if (state === 'fight') hold = true;
  } });
  // 2. sea montage: one leap per zone
  [1, 2, 4, 5, 7, 8].forEach((zi, n) => shots.push({ len: .62, caption: '九片海域', capY: 236, start() {
    fresh(zi); song = 'z0';
    silent(.3);
    const k = best(zi);
    F = { key: k, shiny: n === 3, x: 120, y: SURF + 1, px: 120, py: SURF + 1, face: -1 }; catchFish(); leap.dur = .66; mood('happy', 2);
  } }));
  // 3. boss: the Dragon King rises, a phase breaks, it comes up
  // (the pull is scripted: reeling itself is off, B.p climbs on a timer so the cut lands on time)
  shots.push({ len: 4.2, caption: '挑战海怪', start() {
    fresh(8); run.zoneCaught = NEED; run.hp = 6; song = 'boss';
    startBoss(); silent(.35);
  }, during(t) {
    if (state === 'boss') { hold = true; run.reel = 0; B.state = 'calm'; B.timer = 9; B.p = Math.min(1, Math.max(B.p, .6) + DT * .27); tension = 30 + 8 * Math.sin(t * 9); }
  } });
  // 4. café
  shots.push({ len: 3.0, caption: '经营渔喵小馆', start() {
    cleanSlate(); run = null; song = 'cafe';
    const top = s => DECO[s].items[DECO[s].items.length - 1].id;
    DECO_SLOTS.forEach(s => { const id = s === 'wall' ? 'sakura' : top(s); if (!CAFE.deco.owned[s].includes(id)) CAFE.deco.owned[s].push(id); CAFE.deco.eq[s] = id; });
    ['tang', 'koi', 'clown', 'narwhal', 'ruby', 'glowfish', 'octo', 'parrot'].forEach(k => { CAFE.cooler[k] = { n: 20, p: 4 }; CAFE.known[k] = true; });
    CAFE.pop = 330; CAFE.seenLevel = popLevel();
    CAFE.recent = ['tang', 'koi', 'clown', 'narwhal', 'ruby'].map(k => ({ k, price: cafeDishPrice(k), prem: false }));
    openCafe('title');
    silent(5.5);
  }, during(t) {
    // tap a happy guest: chat bubble, heart and a tip
    if (t > .9 && !this.tapped) { const c = cafe.cust.find(c => c.tipReady && !c.tipped) || cafe.cust.find(c => c.ph === 'eat'); if (c) { tapGuest(c); this.tapped = true; } }
  } });
  // 5. title as the end card
  shots.push({ len: 2.4, start() {
    cleanSlate(); run = null; SAVED = null; song = 'cafe'; setupZone(0); go('title'); st = 0;
  } });
  const total = shots.reduce((s, x) => s + x.len, 0);

  // caption: big outlined words that slide in under the HUD
  function caption(s, age, len, capY = 60) {
    if (!s) return;
    const a = Math.min(1, age / .12, (len - age) / .12), c = textSprite({ s, size: 15, col: '#ffffff', stroke: OUT });
    const slide = (1 - Math.min(1, age / .15)) * 8;
    ctx.globalAlpha = Math.max(0, a); ctx.drawImage(c.cv, R(W * K / 2 - c.w / 2), R((capY + slide) * K - c.h / 2)); ctx.globalAlpha = 1;
  }

  let cur = -1, t0 = 0, capStart = 0, lastCap = null;
  REC.run({ fps: FPS, seconds: total, canvas: cv, audio: true,
    async setup(ac) { AC = ac; MUS.cur = null; MUS.bus = null; try { await document.fonts.ready; await document.fonts.load('15px "Fusion Pixel"', ALLTEXT); } catch (e) {} TXC.clear();
      // exact pixel scale for the requested size (fit() would follow the headless window instead)
      removeEventListener('resize', fit); cv.width = REC.width; cv.height = REC.height; K = cv.width / W;
      REC.log('canvas ' + cv.width + 'x' + cv.height + ' K=' + K); },
    step(i, t) {
      let acc = 0, k = 0; while (k < shots.length - 1 && t >= acc + shots[k].len - 1e-6) acc += shots[k++].len;
      if (k !== cur) { cur = k; t0 = acc; shots[k].start(); }
      const sh = shots[k], lt = t - t0;
      if (sh.during) sh.during(lt);
      if (i > 0) tick();
      render(); musicUpdate();
      // a caption shared by consecutive shots stays up across the cuts
      if (sh.caption !== lastCap) { lastCap = sh.caption; capStart = t; }
      if (sh.caption) {
        let end = acc + sh.len, j = k + 1; while (j < shots.length && shots[j].caption === sh.caption) end += shots[j++].len;
        caption(sh.caption, t - capStart, end - capStart, sh.capY);
      }
    } });
}
