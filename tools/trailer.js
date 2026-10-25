// Store-page trailer v2 (Oct 2026 update): ~20 s vertical video. v1 is tools/trailer-v1.js.
// Record:  python D:/Minigame/_workflow/tools/record_video.py D:/Minigame/Fishing tools/trailer.js --out trailer.mp4
//          (add --frames <dir> to keep every frame as PNG; screenshots are picked from those)
// Runs inside the game closure (see record_video.py), so it calls game functions directly.
{
  // same random numbers every take, so a good take can be re-recorded
  let seed = 7;
  Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const FPS = 30, DT = 1 / FPS;
  wantedTrack = () => 'z0';          // the sunny tune all the way through, instead of a new one at every cut
  muted = false;
  setLang('zh');
  // the new outfits from this update are worn in every shot
  const GEAR = { hat: 'wizard', boat: 'whale', fur: 'galaxy' };   // (no thunder rod: its zaps flash the fish yellow)
  const wear = () => Object.assign(WALLET.eq, GEAR);
  wear();

  const tick = (dt = DT) => { let d = dt; if (slowT > 0) { slowT -= dt; d *= .3; } update(d, dt); shake = 0; };
  const silent = (sec) => { const m = muted; muted = true; for (let t = 0; t < sec; t += DT) tick(); muted = m; };
  const cleanSlate = () => { P = []; POPS = []; INK = []; F = null; B = null; biter = null; bob = null; hook = null; leap = null; show = null; tension = 0; hold = false; jerk = false; flash = 0; slowT = 0; };
  const fresh = (zone) => { cleanSlate(); go('idle'); newRun(0); run.hp = 5; run.zap = 0; if (zone) setupZone(zone); coinsShown = run.coins; };
  const best = zi => ZONES[zi].fish.slice().sort((a, b) => SP[b].val - SP[a].val)[0];
  // a boss already hooked and calm, pulled part way up
  const bossAt = (zi, p) => { fresh(zi); run.zoneCaught = NEED; run.hp = 6; startBoss(); silent(1.4); POPS = []; B.p = p; B.state = 'calm'; B.timer = 9; tension = 30; };

  const shots = [];
  // 1. the core loop in under 3 s: bite → reel → a shiny leaps out → card
  shots.push({ len: 2.8, start() {
    fresh(0); run.coins = 0; coinsShown = 0;
    bob = { x: 118, dip: 0 }; hook = { x: 118, y: 196, ty: 196 }; cast = { wait: 0 };
    biter = { key: 'tang', x: 118, y: 196, face: -1, ph: 'bite', t: 0, n: 1, c: 0, shiny: true }; go('wait');
  }, during(t) {
    if (state === 'wait' && t > .4) { startFight(); hold = true; F.timer = 99; run.reel = 2.8; }
    if (state === 'show' && show.crown !== 'gold') { show.crown = 'gold'; show.cm = Math.max(show.cm, 41); }
    if (state === 'fight') hold = true;
  } });
  // 2. sea montage: one leap per sea
  [1, 2, 4, 7].forEach((zi, n) => shots.push({ len: .58, caption: '九片海域', capY: 236, start() {
    fresh(zi); silent(.3);
    F = { key: best(zi), shiny: n === 2, x: 120, y: SURF + 1, px: 120, py: SURF + 1, face: -1 }; catchFish(); leap.dur = .62; mood('happy', 2);
  } }));
  // 3. every sea monster bends the hold-to-reel rule its own way
  shots.push({ len: 1.1, caption: '海怪各有绝招', start() {          // squid: tap to shake the tentacle off
    bossAt(1, .35); B.tangle = 2.6; B.grip = 1; B.tangleT = 99;
  }, during(t) { hold = true; tension = Math.min(tension, 50); B.state = 'calm'; B.timer = 9; if (B.tangle > 0 && t > .1 && Math.floor(t / DT) % 4 === 0) jerk = true; } });
  shots.push({ len: 1.2, caption: '海怪各有绝招', start() {          // guardian: let go exactly on the third rune
    bossAt(6, .4); B.state = 'tele'; B.runeDurs = [.32, .32, .32]; B.timer = runeTotal(B); B.runeShown = 0;
  }, during(t) { hold = state === 'boss' && B.state === 'tele' && runeLit(B) < 3; tension = Math.min(tension, 50); if (B.state === 'dash') B.timer = Math.min(B.timer, .5); } });
  shots.push({ len: 1.1, caption: '海怪各有绝招', start() {          // star whale: reel while the wave pushes in
    bossAt(7, .45); B.waveDir = 1; B.prevState = 'calm';
  }, during() { hold = true; B.state = 'calm'; B.timer = 9; B.waveDir = 1; tension = Math.min(tension, 45); } });
  // 4. the cover monster comes up: the Abyss Kraken's last pull, leap and card
  shots.push({ len: 2.7, start() {
    bossAt(5, .86); B.phase = 2;   // already past its phase breaks, so no 破防 pop over the leap
  }, during() { if (state === 'boss') { hold = true; run.reel = 0; B.state = 'calm'; B.timer = 9; B.latch = 0; B.p = Math.min(1, B.p + DT * .3); tension = 30; } } });
  // 5. sea states 1 → 10 after the first win
  shots.push({ len: 1.7, caption: '海况 1~10', capY: 48, start() {
    cleanSlate(); run = null; DEX.heat = 9; heatSel = 1; go('heat');
  }, during(t) { heatSel = Math.min(10, 1 + Math.floor(t / .15)); } });
  // 6. after the Dragon King: dive on into the endless deep
  shots.push({ len: 1.9, start() {   // no caption: the game's own card already says 无尽深海
    fresh(8); run.bossDone = true; run.deep = 11; run.heat = 7; transDone = false; go('trans'); silent(.5);
  } });
  // 7. new outfits, tried on in the shop
  const LOOKS = [['wizard', 'whale', 'galaxy'], ['shark', 'teacup', 'blue'], ['frog', 'lotus', 'cow'], ['trident', 'storm', 'mackerel'], ['chef', 'shell', 'orange']];
  shots.push({ len: 1.6, caption: '新装扮', capY: 300, start() {
    cleanSlate(); run = null; shopTab = 0; openShop('title'); shopSel = null;
  }, during(t) { const [hat, boat, fur] = LOOKS[Math.min(LOOKS.length - 1, Math.floor(t / .32))]; Object.assign(WALLET.eq, { hat, boat, fur }); shopPage = shopPageOf('hat'); } });
  // 8. café
  shots.push({ len: 2.6, caption: '经营渔喵小馆', start() {
    wear(); cleanSlate(); run = null;
    const top = s => DECO[s].items[DECO[s].items.length - 1].id;
    DECO_SLOTS.forEach(s => { const id = s === 'wall' ? 'sakura' : top(s); if (!CAFE.deco.owned[s].includes(id)) CAFE.deco.owned[s].push(id); CAFE.deco.eq[s] = id; });
    ['tang', 'koi', 'clown', 'narwhal', 'ruby', 'glowfish', 'octo', 'parrot'].forEach(k => { CAFE.cooler[k] = { n: 20, p: 4 }; CAFE.known[k] = true; });
    CAFE.pop = 330; CAFE.seenLevel = popLevel();
    CAFE.recent = ['tang', 'koi', 'clown', 'narwhal', 'ruby'].map(k => ({ k, price: cafeDishPrice(k), prem: false }));
    openCafe('title');
    silent(5.5);
  }, during(t) {
    for (const [at, n] of [[.5, 1], [1.6, 2]]) if (t > at && (this.tapped || 0) < n) {
      // the second one is out on the deck, so its bubble doesn't pile onto the diners' bubbles
      const c = n === 1 ? cafe.cust.find(c => c.tipReady && !c.tipped) || cafe.cust.find(c => c.ph === 'eat')
                        : cafe.cust.find(c => c.ph === 'rest') || cafe.visitors[0];
      if (c) tapGuest(c); this.tapped = n;
    }
  } });
  // 9. title as the end card: just the logo and "tap to start", no menu buttons
  const gameOverlay = drawOverlay;
  shots.push({ len: 2.4, start() {
    cleanSlate(); run = null; SAVED = null; setupZone(0); go('title'); st = 0;
    drawOverlay = z => {
      if (state !== 'title') return gameOverlay(z);
      [[-1, 26], [1, 22]].forEach(([s, h], i) => tentacle(90 + s * 70, H + 4, -Math.PI / 2 - s * .25, 60 + h, 5, ['#46226a', '#6b3d8f', '#9a68c0'], '#e9b8ff', i * 2, 1.2));
      txt('渔喵传说', 90, 128, 28, '#ffe14a', 'center', OUT);
      txt('FISHY TAILS', 90, 150, 9, '#9fe8ff', 'center', OUT);
      txt('猫猫钓鱼 · 吃Buff · 打海怪', 90, 166, 9, '#ffffff');
      if (Math.floor(T * 2) % 2 === 0) txt('点击开始钓鱼', 90, 194, 12, '#ffffff');
      g.drawImage(I.hand, 118, 203 + R(Math.abs(Math.sin(T * 4)) * -4));
    };
  } });
  const total = shots.reduce((s, x) => s + x.len, 0);

  // caption: big outlined words that slide in
  function caption(s, age, len, capY = 60) {
    if (!s || REC.arg === 'nocaption') return;   // --arg nocaption: clean frames for store screenshots
    const a = Math.min(1, age / .12, (len - age) / .12), c = textSprite({ s, size: 15, col: '#ffffff', stroke: OUT });
    const slide = (1 - Math.min(1, age / .15)) * 8;
    ctx.globalAlpha = Math.max(0, a); ctx.drawImage(c.cv, R(W * K / 2 - c.w / 2), R((capY + slide) * K - c.h / 2)); ctx.globalAlpha = 1;
  }

  let cur = -1, t0 = 0, capStart = 0, lastCap = null;
  REC.run({ fps: FPS, seconds: total, canvas: cv, audio: true,
    async setup(ac) { AC = ac; MUS.cur = null; MUS.bus = null; try { await document.fonts.ready; await document.fonts.load('15px "Fusion Pixel"', ALLTEXT); } catch (e) {} TXC.clear();
      // exact pixel scale for the requested size (fit() would follow the headless window instead)
      removeEventListener('resize', fit); cv.width = REC.width; cv.height = REC.height; K = cv.width / W;
      REC.log('canvas ' + cv.width + 'x' + cv.height + ' K=' + K + ' total ' + total.toFixed(2) + 's'); },
    step(i, t) {
      let acc = 0, k = 0; while (k < shots.length - 1 && t >= acc + shots[k].len - 1e-6) acc += shots[k++].len;
      if (k !== cur) { cur = k; t0 = acc; shots[k].start(); REC.log('shot ' + k + ' @' + t.toFixed(2)); }
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
