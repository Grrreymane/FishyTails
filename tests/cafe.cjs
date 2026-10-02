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
    assert.deepEqual(await run('[CAFE.pending, totalStock(), CAFE.sold.sardine, CAFE.pop, WALLET.coins, run.coins]'), [6, 0, 2, 2, 0, 0]);
    await run('openCafe("title"); closeCafe(); openCafe("title")');
    assert.deepEqual(await run('[CAFE.coins, CAFE.pending, cafe.earned]'), [6, 0, 0]);
  });
  await check('base tea accumulates by time, including partial minutes and eight-hour cap', async ({ run, advance }) => {
    await advance(299000); assert.equal(await run('CAFE.pending'), 0);
    await advance(1000); assert.equal(await run('CAFE.pending'), 1);
    await advance(24 * 3600000); assert.equal(await run('CAFE.pending'), 97);
    await run('settleCafe()'); assert.equal(await run('CAFE.pending'), 97);
  });
  await check('new catches cannot be sold retroactively for time spent with an empty fridge', async ({ run, advance }) => {
    await advance(3600000);
    await run('storeFish("sardine", false)');
    await advance(44000); assert.equal(await run('stockOf("sardine")'), 1);
    await advance(1000); assert.equal(await run('stockOf("sardine")'), 0);
  });
  await check('offline balance survives reload and can only be collected once', async ({ run, page }) => {
    assert.equal(await run('CAFE.pending'), 6);
    await run('openCafe("title")');
    await page.reload(); await page.waitForFunction(() => window.__test);
    assert.deepEqual(await run('[CAFE.coins, CAFE.pending, totalStock()]'), [6, 0, 0]);
  }, { 'sea-monster-cafe': { businessAt: 1800000000000 - 180000, cooler: { sardine: { n: 3, p: 0 } } } });
  await check('decor spends café funds while gear spends fishing coins', async ({ run }) => {
    await run('earn(1000); CAFE.coins = 500; openCafe("title"); cafe.sheet = 2; cafe.slot = 0; cafePress({x:140,y:212})');
    assert.deepEqual(await run('[CAFE.coins, WALLET.coins, CAFE.deco.eq.wall]'), [200, 1000, 'wave']);
    await run('closeCafe(); openShop("title"); shopPress({x:135,y:174})');
    assert.deepEqual(await run('[CAFE.coins, WALLET.coins, WALLET.eq.hat]'), [200, 700, 'straw']);
  });
  await check('boss dishes earn café funds and welcome news; new guest is introduced', async ({ run, advance }) => {
    await run('CAFE.pop = 14; addBossServings("puffer")'); await advance(45000);
    await run('openCafe("title")');
    assert.deepEqual(await run('[CAFE.coins, cafe.newAnimal, cafe.cust[0].look.kind, stockOf("b_puffer")]'), [40, 'penguin', 'penguin', 2]);
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
    await click(107, 8); assert.equal(await run('state'), 'shop');
    await click(157, 33); assert.equal(await run('state'), 'idle');
    await click(172, 30); assert.equal(await run('state'), 'menu');
    await click(90, 188); assert.equal(await run('state'), 'dex');
    await click(157, 37); assert.equal(await run('state'), 'menu');
    await click(90, 160); assert.equal(await run('state'), 'cafe');
    await click(155, 9); assert.equal(await run('state'), 'idle');
  });
  await check('shop pauses an actual fight and preserves its line and timers', async ({ run, page }) => {
    await run('newRun(); setupZone(2); biter={key:"cod",shiny:false,x:90,y:180,face:1}; bob={x:90}; startFight(); F.timer=100; render()');
    await page.screenshot({ path: path.join(root, '.shots/navigation-fight.png') });
    const box = await page.locator('#c').boundingBox();
    const click = (x,y) => page.mouse.click(box.x+x*box.width/180,box.y+y*box.height/320);
    await click(107,8); assert.equal(await run('state'), 'shop');
    const before = await run('[F.y,F.timer,tension,menuRunTime]');
    const after = await run('update(.05,.05); shopPress({x:157,y:33}); const result=[F.y,F.timer,tension,st]; menuFrom=state;menuRunTime=st;go("menu");render();result');
    assert.deepEqual(after,before);
    await page.screenshot({ path: path.join(root, '.shots/navigation-menu.png') });
    await page.setViewportSize({width:375,height:812});
    await run('openCafe("menu");render()');
    await page.screenshot({ path: path.join(root, '.shots/navigation-cafe-mobile.png') });
  });
  await check('seating and cooking upgrades improve the single ledger without spending score', async ({ run, advance }) => {
    await run('newRun(); CAFE.deco.eq.seat = "s4"; CAFE.deco.eq.stove = "master"; storeFish("sardine", false); storeFish("sardine", false)');
    await advance(45000);
    assert.deepEqual(await run('[CAFE.pending, totalStock(), run.coins]'), [6, 0, 0]);
  });
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
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`${passed} checks passed; no browser runtime errors.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
