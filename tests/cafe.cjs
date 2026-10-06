// Run: node tests/cafe.cjs. Requires Playwright and a Chromium browser.
// PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE may point to an existing local installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const end = original.lastIndexOf('})();');
// Test access exists only in the in-memory HTTP response, never in the shipped game.
const html = original.slice(0, end) + 'window.__test = { evaluate: code => eval(code) };\n' + original.slice(end);
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  if (req.url.startsWith('/fonts/')) {
    const file = path.join(root, 'fonts', path.basename(req.url.split('?')[0]));
    if (fs.existsSync(file)) { res.setHeader('Content-Type', 'font/woff2'); return fs.createReadStream(file).pipe(res); }
  }
  res.writeHead(404); res.end();
});
let browser;
const errors = [];
let passed = 0;
async function fixture(saved = {}) {
  const context = await browser.newContext({ viewport: { width: 450, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(data => {
    window.__clock = 1800000000000;
    Date.now = () => window.__clock;
    if (!sessionStorage.getItem('test-seeded')) {
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('test-seeded', '1');
    }
  }, saved);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__test);
  await page.evaluate(() => document.fonts.ready);
  return { page, context, run: code => page.evaluate(s => window.__test.evaluate(s), code), advance: ms => page.evaluate(ms => { window.__clock += ms; window.__test.evaluate('settleCafe()'); }, ms) };
}
async function check(name, fn, saved) {
  const f = await fixture(saved);
  try { await fn(f); passed++; console.log('PASS ' + name); }
  finally { await f.context.close(); }
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  await check('legacy save keeps fishing wallet, furniture and inventory', async ({ run }) => {
    assert.deepEqual(await run('[WALLET.coins, CAFE.coins, CAFE.deco.eq.wall, CAFE.cooler.sardine.n]'), [1234, 0, 'sakura', 3]);
  }, { 'sea-monster-shop': { coins: 1234, owned: {}, eq: {} }, 'sea-monster-cafe': { cooler: { sardine: { n: 3, p: 1 } }, deco: { owned: { wall: ['sakura'] }, eq: { wall: 'sakura' } } } });
  await check('fish and premium meals earn only café income; returning never duplicates it', async ({ run, advance }) => {
    await run('newRun(); storeFish("sardine", true); storeFish("sardine", false)');
    await advance(90000);
    assert.deepEqual(await run('[CAFE.pending, totalStock(), CAFE.sold.sardine, CAFE.pop, WALLET.coins, run.coins]'), [24, 0, 2, 2, 0, 0]);
    await run('openCafe("title"); closeCafe(); openCafe("title")');
    assert.deepEqual(await run('[CAFE.coins, CAFE.pending, cafe.earned]'), [24, 0, 0]);
  });
  await check('base tea accumulates by time, including partial minutes and eight-hour cap', async ({ run, advance }) => {
    await advance(299000); assert.equal(await run('CAFE.pending'), 0);
    await advance(1000); assert.equal(await run('CAFE.pending'), 3);
    await advance(24 * 3600000); assert.equal(await run('CAFE.pending'), 291);
    await run('settleCafe()'); assert.equal(await run('CAFE.pending'), 291);
  });
  await check('new catches cannot be sold retroactively for time spent with an empty fridge', async ({ run, advance }) => {
    await advance(3600000);
    await run('storeFish("sardine", false)');
    await advance(44000); assert.equal(await run('stockOf("sardine")'), 1);
    await advance(1000); assert.equal(await run('stockOf("sardine")'), 0);
  });
  await check('offline balance survives reload and can only be collected once', async ({ run, page }) => {
    assert.equal(await run('CAFE.pending'), 24);
    await run('openCafe("title")');
    await page.reload(); await page.waitForFunction(() => window.__test);
    assert.deepEqual(await run('[CAFE.coins, CAFE.pending, totalStock()]'), [24, 0, 0]);
  }, { 'sea-monster-cafe': { businessAt: 1800000000000 - 180000, cooler: { sardine: { n: 3, p: 0 } } } });
  await check('decor spends café funds while gear spends fishing coins', async ({ run }) => {
    await run('earn(1000); CAFE.coins = 500; openCafe("title"); cafe.sheet = 2; cafe.slot = 0; const b=decoBtn(1); cafePress({x:b[0]+b[2]/2,y:b[1]+b[3]/2})');
    assert.deepEqual(await run('[CAFE.coins, WALLET.coins, CAFE.deco.eq.wall]'), [200, 1000, 'wave']);
    await run('closeCafe(); openShop("title"); shopPress({x:135,y:174})');
    assert.deepEqual(await run('[CAFE.coins, WALLET.coins, WALLET.eq.hat]'), [200, 700, 'straw']);
  });
  await check('boss dishes earn café funds and welcome news; new guest is introduced', async ({ run, advance }) => {
    await run('CAFE.pop = 14; addBossServings("puffer")'); await advance(45000);
    await run('openCafe("title")');
    assert.deepEqual(await run('[CAFE.coins, cafe.newAnimal, cafe.cust[0].look.kind, stockOf("b_puffer")]'), [60, 'penguin', 'penguin', 2]);
    assert.equal(await run('cafe.news.some(s => s.includes("河豚刺身"))'), true);
  });
  await check('mid-fight café visit resumes the same state, timer, line and fish', async ({ run }) => {
    // Inspect in the same task to avoid a simulation frame acting on the intentionally minimal fish.
    const result = await run('newRun(); state = "fight"; st = 1.75; tension = 37; F = { marker: "same fish" }; menuFrom = state; menuRunTime = st; openCafe("menu"); update(.05,.05); closeCafe(); const result = [state, st, tension, F.marker, hold, jerk]; state = "title"; F = null; result');
    assert.deepEqual(result, ['fight', 1.75, 37, 'same fish', false, false]);
  });
  await check('on-screen diners never charge again; tips require eating and pay once', async ({ run }) => {
    const result = await run('openCafe("title"); const regular = cafe.cust[0]; regular.bb = [0,0,10,10]; tapGuest(regular); const before = CAFE.coins; regular.tipReady = true; tapGuest(regular); const once = CAFE.coins; tapGuest(regular); [before, once > before, CAFE.coins === once, WALLET.coins]');
    assert.deepEqual(result, [0, true, true, 0]);
  });
  await check('pointer controls open shop, dex and café and return to fishing', async ({ run, page }) => {
    await run('newRun(); go("idle")');
    const box = await page.locator('#c').boundingBox();
    const click = (x, y) => page.mouse.click(box.x + x * box.width / 180, box.y + y * box.height / 320);
    await click(152, 8); assert.equal(await run('state'), 'shop');
    await click(157, 33); assert.equal(await run('state'), 'idle');
    await click(170, 9); assert.equal(await run('state'), 'menu');
    const muted0 = await run('muted'); await click(90, 226); assert.equal(await run('muted'), !muted0); await click(90, 226);
    await click(90, 151); assert.equal(await run('state'), 'shop');
    await click(157, 33); assert.equal(await run('state'), 'menu');
    await click(90, 201); assert.equal(await run('state'), 'dex');
    await click(157, 37); assert.equal(await run('state'), 'menu');
    await click(90, 176); assert.equal(await run('state'), 'cafe');
    await click(155, 9); assert.equal(await run('state'), 'idle');
  });
  await check('mid-fight presses never open the shop; the menu pauses and resumes the same fight', async ({ run, page }) => {
    await run('newRun(); setupZone(2); biter={key:"cod",shiny:false,x:90,y:180,face:1}; bob={x:90}; startFight(); F.timer=100; render()');
    await page.screenshot({ path: path.join(root, '.shots/navigation-fight.png') });
    const box = await page.locator('#c').boundingBox();
    const click = (x,y) => page.mouse.click(box.x+x*box.width/180,box.y+y*box.height/320);
    await click(152,8); assert.equal(await run('state'), 'fight');
    await run('hold = false; jerk = false; tension = 30; F.timer = 100');
    const before = await run('[F.y,F.timer,tension]');
    await click(170,9); assert.equal(await run('state'), 'menu');
    const after = await run('update(.05,.05); onPress({x:90,y:126}); [state, F.y, F.timer, tension]');
    assert.deepEqual(after, ['fight', ...before]);
    await run('menuFrom=state;menuRunTime=st;go("menu");render()');
    await page.screenshot({ path: path.join(root, '.shots/navigation-menu.png') });
    await page.setViewportSize({width:375,height:812});
    await run('openCafe("menu");render()');
    await page.screenshot({ path: path.join(root, '.shots/navigation-cafe-mobile.png') });
  });
  await check('gear bought mid-run works at once, swaps back cleanly and survives a continue', async ({ run }) => {
    const r = await run(`WALLET.coins = 99999; WALLET.owned.boat = []; WALLET.eq.boat = 'wood'; newRun(); go('idle'); const hp0 = run.hp;
      menuFrom = 'idle'; menuRunTime = 0; openShop('run'); shopTab = SHOP_CATS.indexOf('boat');
      const tap = i => { const b = shopBtnRect(i); shopPress({ x: b[0] + 2, y: b[1] + 2 }); };
      tap(1); const hp1 = run.hp; tap(0); const hp2 = run.hp; tap(1);
      run.hp = 0; continueRun(); [hp1 - hp0, hp2 - hp0, run.hp, run.gear.boat]`);
    assert.deepEqual(r, [1, 0, 4, 'melon']);
  });
  await check('seating and cooking upgrades improve the single ledger without spending score', async ({ run, advance }) => {
    await run('newRun(); CAFE.deco.eq.seat = "s4"; CAFE.deco.eq.stove = "master"; storeFish("sardine", false); storeFish("sardine", false)');
    await advance(45000);
    assert.deepEqual(await run('[CAFE.pending, totalStock(), run.coins]'), [24, 0, 0]);
  });
  await check('charm attracts ambient visitors without accelerating sales or creating rewards', async ({ run }) => {
    const comparison = await run(`
      newRun(); CAFE.trophy={};
      function sampleCafe(high) {
        DECO_SLOTS.forEach(slot=>{
          const items=DECO[slot].items;
          CAFE.deco.eq[slot]=high&&slot!=='seat'&&slot!=='stove'
            ? items.reduce((best,it)=>(it.charm||0)>(best.charm||0)?it:best,items[0]).id
            : items[0].id;
        });
        CAFE.cooler={sardine:{n:100,p:0}}; CAFE.boss={}; CAFE.sold={};
        CAFE.pending=0; CAFE.pop=0; CAFE.serviceMs=0; CAFE.teaMs=0;
        CAFE.businessAt=Date.now();
        const interval=cafeServiceMs(), gap=visitorGap(), attraction=charm(CAFE.deco.eq);
        window.__clock+=180000; settleCafe();
        return {interval,gap,attraction,ledger:[CAFE.pending,totalStock(),CAFE.sold.sardine,CAFE.pop]};
      }
      const low=sampleCafe(false), high=sampleCafe(true);
      [low,high]
    `);
    const [low, high] = comparison;
    assert.equal(low.interval, 45000);
    assert.equal(high.interval, low.interval);
    assert.deepEqual(high.ledger, low.ledger);
    assert.deepEqual(high.ledger, [32, 96, 4, 4]);
    assert.ok(high.attraction >= 12);
    assert.ok(high.gap < low.gap);
    assert.ok(high.gap >= 22 && low.gap <= 70);
    const visits = await run(`
      openCafe('title');
      const welcomed=cafe.visitors.length;
      const before=JSON.stringify([CAFE.coins,CAFE.pending,CAFE.pop,CAFE.cooler,CAFE.boss,CAFE.sold,WALLET.coins,run.coins]);
      cafe.visitors=[];
      const spawned=spawnCafeVisitor(); render();
      const cosmetic=cafe.visitors.every(c=>c.visitor&&c.d==null&&c.seat==null&&!c.tipReady);
      cafe.visitors.forEach(c=>{tapGuest(c);tapGuest(c);});
      for(let i=0;i<800;i++) updCafeVisitors(.05);
      const after=JSON.stringify([CAFE.coins,CAFE.pending,CAFE.pop,CAFE.cooler,CAFE.boss,CAFE.sold,WALLET.coins,run.coins]);
      [welcomed,spawned,cosmetic,before===after]
    `);
    assert.ok(visits[0] > 0, 'high-charm cafés show a visitor as soon as the player returns');
    assert.deepEqual(visits.slice(1), [true, true, true]);
  });
  await check('expanded decor preserves old saves and every page supports previews and purchases', async ({ run, page }) => {
    assert.deepEqual(await run('[CAFE.deco.eq.wall,CAFE.deco.eq.floor,CAFE.deco.eq.plant,CAFE.deco.eq.seat,CAFE.deco.eq.stove,CAFE.cooler.sardine.n]'), ['sakura','tile','palm','s4','master',3]);
    assert.equal(await run('DECO_SLOTS.every(slot=>Array.isArray(CAFE.deco.owned[slot])&&DECO[slot].items.some(it=>it.id===CAFE.deco.eq[slot]))'), true);
    assert.equal(await run('["rug","terrace","ornament"].every(slot=>CAFE.deco.eq[slot]===DECO[slot].items[0].id)'), true);
    await run('openCafe("title"); cafe.sheet=2; cafe.slot=0; cafe.decoPage=0; render()');
    await page.screenshot({path:path.join(root,'.shots/cafe-catalog-first.png')});
    const purchased = await run(`
      CAFE.coins=1000000;
      const checks=[];
      DECO_SLOTS.forEach((slot,si)=>{
        cafe.sheet=2; cafe.decoPage=99;
        const chip=slotChip(si); cafePress({x:chip[0]+chip[2]/2,y:chip[1]+chip[3]/2});
        checks.push(cafe.slot===si&&cafe.decoPage===0);
        DECO[slot].items.forEach((it,i)=>{
          while(cafe.decoPage<Math.floor(i/3)) cafePress({x:DECO_NEXT[0]+DECO_NEXT[2]/2,y:DECO_NEXT[1]+DECO_NEXT[3]/2});
          const local=i%3, row=decoRow(local), b=decoBtn(local);
          cafePress({x:row[0]+4,y:row[1]+row[3]/2});
          checks.push(cafeEq()[slot]===it.id); render();
          const owned=decoOwns(slot,it.id), before=CAFE.coins;
          cafePress({x:b[0]+b[2]/2,y:b[1]+b[3]/2}); render();
          checks.push(CAFE.deco.eq[slot]===it.id&&decoOwns(slot,it.id)&&CAFE.coins===before-(owned?0:it.price));
        });
      });
      [checks.every(Boolean),checks.length,DECO_SLOTS.length,CAFE.coins>=0]
    `);
    assert.equal(purchased[0], true, 'all catalogue entries can be previewed and purchased through their visible page');
    assert.ok(purchased[1] > 70, 'the complete expanded catalogue was exercised');
    assert.equal(purchased[2], 10);
    assert.equal(purchased[3], true);
    await run('cafe.slot=0; cafe.decoPage=decoPages()-1; cafe.prev=null; render()');
    await page.screenshot({path:path.join(root,'.shots/cafe-catalog-last.png')});
    const themes = [
      {wall:'cream',floor:'honey',lamp:'glass',plant:'flowers',tank:'bowl',rug:'paw',terrace:'picnic',ornament:'teaset'},
      {wall:'moss',floor:'pebble',lamp:'star',plant:'fern',tank:'reef',rug:'flower',terrace:'garden',ornament:'books'},
      {wall:'aquarium',floor:'rose',lamp:'glass',plant:'bonsai',tank:'reef',rug:'sea',terrace:'plain',ornament:'phonograph'}
    ];
    for(let i=0;i<themes.length;i++) {
      await run(`Object.assign(CAFE.deco.eq,${JSON.stringify(themes[i])}); DEX.fish.sardine={n:1}; DEX.fish.clown={n:1}; KEEPSAKES.forEach((_,i)=>CAFE.keepsakes[i]=true); TROPHY.forEach((_,i)=>CAFE.trophy[i]=true); openCafe('title'); for(let j=0;j<100;j++) updCafe(.05); POPS=[]; cafe.cust.forEach(c=>c.say=null); CAFE.coins=1800; render()`);
      await page.screenshot({path:path.join(root,`.shots/cafe-renovated-${i+1}.png`)});
    }
    await run('saveCafe()'); await page.reload(); await page.waitForFunction(()=>window.__test);
    assert.equal(await run('DECO_SLOTS.every(slot=>DECO[slot].items.every(it=>decoOwns(slot,it.id)))'), true, 'all purchases survive a reload');
    assert.equal(await run('CAFE.deco.eq.ornament'), 'phonograph');
  }, {'sea-monster-cafe':{coins:1000000,pop:220,cooler:{sardine:{n:3,p:1}},deco:{owned:{wall:['sakura'],floor:['tile'],plant:['palm'],seat:['s4'],stove:['master']},eq:{wall:'sakura',floor:'tile',plant:'palm',seat:'s4',stove:'master'}}}});
  await check('the floating heart itself is clickable and only gives one tip', async ({ run, page }) => {
    const point = await run('openCafe("title"); cafe.cust[0].tipReady = true; render(); ({x:cafe.cust[0].x * CS, y:(cafe.cust[0].bb[1] - 7) * CS})');
    const box = await page.locator('#c').boundingBox();
    await page.mouse.click(box.x + point.x * box.width / 180, box.y + point.y * box.height / 320);
    const balance = await run('CAFE.coins'); assert.ok(balance >= 1);
    await page.mouse.click(box.x + point.x * box.width / 180, box.y + point.y * box.height / 320);
    assert.equal(await run('CAFE.coins'), balance);
    await run('for(let i=0;i<800;i++) updCafe(.05)');
    assert.equal(await run('CAFE.coins'), balance, 'guest animations never pay meal income a second time');
  });
  await check('empty café, busy café, furniture, recipe and fishing screens render', async ({ run, page }) => {
    fs.mkdirSync(path.join(root, '.shots'), { recursive: true });
    await run('openCafe("title"); render()');
    await page.screenshot({ path: path.join(root, '.shots/cafe-empty.png') });
    await run('storeFish("sardine", true); addBossServings("puffer"); CAFE.coins = 1800; CAFE.businessAt -= 90000; settleCafe(); closeCafe(); openCafe("title"); for(let i=0;i<120;i++) updCafe(.05); render()');
    await page.screenshot({ path: path.join(root, '.shots/cafe-home.png') });
    await run('cafe.sheet = 2; render()');
    await page.screenshot({ path: path.join(root, '.shots/cafe-decor.png') });
    await run('cafe.sheet = 0; render()');
    await page.screenshot({ path: path.join(root, '.shots/cafe-stock.png') });
    await run('cafe.sheet = 1; render()');
    await page.screenshot({ path: path.join(root, '.shots/cafe-recipes.png') });
    await run('closeCafe(); newRun(); go("idle"); render()');
    await page.screenshot({ path: path.join(root, '.shots/fishing.png') });
    await run('go("title"); render()');
    await page.screenshot({ path: path.join(root, '.shots/title-buttons.png') });
    await run('go("over"); st=1; render()');
    await page.screenshot({ path: path.join(root, '.shots/result-failed.png') });
    await run('go("win"); st=1; render()');
    await page.screenshot({ path: path.join(root, '.shots/result-win.png') });
  });
  await check('cosmetic catches persist and display automatically without buying a tank', async ({ run, page }) => {
    const result = await run('newRun(); CAFE.variantPity = 11; CAFE.keepsakePity = 3; leap = { key:"sardine", shiny:false, img:SPR.sardine.l, w:SPR.sardine.w, h:SPR.sardine.h, sc:2 }; startShow(); render(); [!!show.variant, show.keepsake, tankSel(2)[0] === CAFE.featureFish, show.val === run.coins, Object.keys(DEX.fish.sardine.variants).length]');
    assert.deepEqual(result, [true, 0, true, true, 1]);
    await page.screenshot({ path: path.join(root, '.shots/discovery-catch.png') });
    await run('openCafe("title"); render()');
    assert.equal(await run('CAFE.deco.eq.tank'), 'none');
    await page.screenshot({ path: path.join(root, '.shots/discovery-home.png') });
    await page.reload(); await page.waitForFunction(() => window.__test);
    assert.equal(await run('variantEntries().length'), 1);
    assert.equal(await run('!!CAFE.keepsakes[0]'), true);
  });
  await check('pity unlocks unowned variants and gifts without repeated gifts or extra money', async ({ run }) => {
    const result = await run('newRun(); run.zone = 8; DEX.fish.sardine = { n:1 }; for(let i=0;i<3;i++){ CAFE.variantPity=11; discoverCatch("sardine", false); } for(let i=0;i<9;i++){ CAFE.keepsakePity=14; discoverCatch("sardine", true); } [Object.keys(DEX.fish.sardine.variants).length, Object.keys(CAFE.keepsakes).length, WALLET.coins, CAFE.coins, discoverCatch("sardine", true).keepsake]');
    assert.deepEqual(result, [3, 9, 0, 0, null]);
  });
  await check('free tea cannot farm tips or popularity while idle', async ({ run }) => {
    const result = await run('openCafe("title"); for(let i=0;i<800;i++) updCafe(.05); [cafe.cust.filter(c=>c.tipReady).length, CAFE.coins, CAFE.pop]');
    assert.deepEqual(result, [0, 0, 0]);
  });
  await check('normal and variant catches have identical score and buffs; later catches keep collection', async ({ run }) => {
    const result = await run('const random = Math.random; Math.random = () => .5; function capture(pity) { newRun(); CAFE.variantPity=pity; leap={key:"sardine",shiny:false,img:SPR.sardine.l,w:SPR.sardine.w,h:SPR.sardine.h,sc:2}; startShow(); return [show.val, run.coins, run.bite, !!show.variant]; } let special, normal; try {special=capture(11);normal=capture(0);} finally {Math.random=random;} [special,normal,Object.keys(DEX.fish.sardine.variants).length]');
    assert.deepEqual(result[0].slice(0,3), result[1].slice(0,3));
    assert.equal(result[0][3], true); assert.equal(result[1][3], false); assert.equal(result[2], 1);
  });
  await check('all discovery art, aquarium choices and pixel font render', async ({ run, page }) => {
    await run('newRun(); run.zone=8; for(const k of FISH_ORDER){ if(SP[k].rescue) continue; DEX.fish[k]={n:1, max:20, variants:{cream:1,mint:1,star:1}}; for(const v of Object.keys(VARIANTS)) variantSpr(k,v); } KEEPSAKES.forEach((_,i)=>CAFE.keepsakes[i]=true); CAFE.deco.eq.tank="big"; openCafe("title"); render()');
    assert.equal(await page.evaluate(() => document.fonts.check('12px "Fusion Pixel"')), true);
    await page.screenshot({ path: path.join(root, '.shots/discovery-collection.png') });
    await run('cafe.sheet=2; cafe.slot=DECO_SLOTS.indexOf("tank"); cafe.pick=true; render()');
    await page.screenshot({ path: path.join(root, '.shots/discovery-picker.png') });
    await run('const sheet=mk(480,740), pen=sheet.getContext("2d"); pen.fillStyle="#243c49"; pen.fillRect(0,0,480,740); pen.imageSmoothingEnabled=false; pen.font="12px Fusion Pixel"; pen.fillStyle="#ffffff"; ["clown","sardine","eel","lion"].forEach((k,row)=>{[null,...Object.keys(VARIANTS)].forEach((v,col)=>{const img=v?variantSpr(k,v).r:SPR[k].r, sc=Math.min(4,100/img.width,68/img.height); pen.drawImage(img,col*120+10,row*100+14,img.width*sc,img.height*sc);pen.fillText(v?VARIANTS[v].name:"原色",col*120+20,row*100+91);});}); KEEPSAKES.forEach((d,i)=>{pen.drawImage(keepsakeImg(i),(i%3)*160+35,420+Math.floor(i/3)*105,65,75);pen.fillText(d.name,(i%3)*160+28,510+Math.floor(i/3)*105);}); document.body.replaceChildren(sheet); sheet.style.width="480px"; sheet.style.height="740px";');
    await page.locator('canvas').screenshot({ path: path.join(root, '.shots/discovery-art.png') });
  });
  await check('each boss rule works: tangle, claws, heat, suction, runes, waves, dragon acts', async ({run, page}) => {
    const boss = zi => `newRun(); run.zone=${zi}; run.zap=0; run.fever=0; run.crit=0; startBoss(); go("boss"); B.p=.3; B.state="calm"; B.timer=10; hold=false; jerk=false; tension=20;`;
    const step = (n, extra = '') => `for(let i=0;i<${n};i++){ ${extra} updBoss(.02); }`;
    // squid: a tentacle grabs; five quick taps free the line and give a frenzy, ignoring it squeezes the line
    let v = await run(boss(1) + 'B.tangleT=0; updBoss(.02); const grabbed=B.tangle>0; ' + step(6, 'jerk = i < 5;') + '[grabbed, B.tangle, B.frenzy>1]');
    assert.deepEqual(v, [true, 0, true]);
    v = await run(boss(1) + 'B.tangleT=0; updBoss(.02); render(); ' + step(140) + '[B.tangle, tension>60]');
    assert.deepEqual(v, [0, true]);
    await page.screenshot({ path: path.join(root, '.shots/boss-squid.png') });
    // crab: about half the wind-ups are double lunges
    v = await run(boss(2) + 'let d=0; for(let i=0;i<400;i++){ B.onTele(); if(B.double) d++; } d');
    assert.ok(v > 140 && v < 260, 'double ratio ' + v);
    // serpent: holding without a break overheats, reeling in bursts does not
    v = await run(boss(4) + 'hold=true; ' + step(80) + 'tension');
    assert.ok(v > 55, 'overheat tension ' + v);
    v = await run(boss(4) + step(140, 'hold = (i % 50) < 32;') + '[tension < 50, B.heat < 1]');
    assert.deepEqual(v, [true, true]);
    // kraken: letting go in a calm spell drags it back much faster than other bosses
    v = await run(boss(5) + 'B.latch=B.latch0=1.4; ' + step(60) + '[B.p, sucking(B)]');
    assert.ok(v[0] < .285, 'kraken latch drag ' + v);
    v = await run(boss(5) + 'B.latch=B.latch0=1.4; hold=true; ' + step(60) + '[B.p, tension > 40]');
    assert.ok(Math.abs(v[0] - .3) < .001 && v[1], 'kraken tug of war ' + v);
    v = await run(boss(5) + 'B.state="dash"; B.timer=.01; ' + step(5) + 'B.onCalm(); [latched(B), B.latch > .8]');
    assert.deepEqual(v, [true, true]);
    v = await run(boss(3) + step(100) + 'B.p');
    assert.ok(v > .28, 'ghost drift ' + v);
    // ...but letting go while it struggles costs only the usual amount (no suction during a lunge or right after it)
    v = await run(boss(5) + 'B.state="dash"; B.timer=10; const p0=B.p; ' + step(50) + '[(p0 - B.p) * B.len / B.spd, sucking(B)]');
    assert.ok(Math.abs(v[0] - 1) < .05 && v[1] === false, 'kraken lunge drag ' + JSON.stringify(v));
    v = await run(boss(5) + 'B.latch=B.latch0=1.2; ' + step(10) + 'sucking(B)');
    assert.equal(v, false, 'a quarter second of grace after the lunge');
    // guardian: reel through two runes and let go on the third -> stunned instead of lunging; letting go early -> it lunges
    v = await run(boss(6) + 'B.timer=.001; hold=true; updBoss(.02); const pace=B.runeDur; for(let i=0;i<200 && runeEarly(B);i++) updBoss(.02); hold=false; ' + step(60) + '[B.stun>0, B.state, pace>=.4 && pace<=.75]');
    assert.deepEqual(v, [true, 'calm', true]);
    v = await run(boss(6) + 'const paces=new Set(); for(let i=0;i<20;i++){ B.state="calm"; B.timer=.001; updBoss(.02); paces.add(B.runeDur.toFixed(2)); } paces.size');
    assert.ok(v > 10, 'rune pace varies: ' + v);
    v = await run(boss(6) + 'B.timer=.001; hold=false; updBoss(.02); for(let i=0;i<300 && B.state==="tele";i++) updBoss(.02); [B.stun>0, B.state]');
    assert.deepEqual(v, [false, 'dash']);
    // starwhale: reeling with the wave is faster and calm; against it the line strains
    v = await run(boss(7) + 'B.waveDir=1; hold=true; ' + step(50) + '[B.p, tension]');
    const w = await run(boss(7) + 'B.waveDir=-1; B.prevState="calm"; hold=true; ' + step(50) + '[B.p, tension]');
    assert.ok(v[0] > w[0] + .02 && w[1] > v[1] + 20, JSON.stringify([v, w]));
    // dragon: claws, then heat, then suction
    v = await run(boss(8) + '[0,1,2].map(ph => { B.phase = ph; return bRule(B); })');
    assert.deepEqual(v, ['claws', 'heat', 'suck']);
  });
  await check('hidden gesture opens isolated boss challenges without rewards or save changes', async ({run, page}) => {
    await run('newRun(); go("idle"); go("title"); window.beforePractice=JSON.stringify([SAVED,WALLET,DEX,CAFE]); for(const p of [{x:100,y:38},{x:100,y:38},{x:100,y:38},{x:25,y:70},{x:25,y:70},{x:25,y:70}]) onPress(p);');
    assert.equal(await run('state'), 'bossSelect');
    await page.screenshot({path:path.join(root,'.shots/boss-select.png')});
    for(let zi=0;zi<9;zi++) {
      await run(`startPractice(${zi}); go('boss'); hold=false; for(let i=0;i<10;i++) updBoss(.02); bossCatch();`);
      assert.equal(await run('state'), 'bossResult');
      assert.equal(await run('JSON.stringify([SAVED,WALLET,DEX,CAFE])===window.beforePractice'),true);
      await run('leavePractice();');
    }
    await run('startPractice(6); run.hp=1; bossBreak();');
    assert.equal(await run('state'),'bossResult');
    await run('startPractice(6); leavePractice("title");');
    assert.equal(await run('JSON.stringify([SAVED,WALLET,DEX,CAFE])===window.beforePractice'),true);
  });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`${passed} checks passed; no browser runtime errors.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
