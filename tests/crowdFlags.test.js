const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function createHarness(reduced = false){
  let now = 100, nextFrame = 1, seed = 123456;
  const callbacks = new Map(), rotations = [], extractions = [], draws = [];
  const listeners = {};
  const motion = {matches:reduced, addEventListener(name, callback){ listeners.motion = callback; }};
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  function pixels(width, height, background){
    const data = new Uint8ClampedArray(width * height * 4);
    if(!background && width === 216 && height === 216){
      for(let i = 0; i < data.length; i += 4){
        data[i] = data[i + 1] = data[i + 2] = 230; data[i + 3] = 255;
      }
      return {data};
    }
    if(background){
      for(let i = 0; i < data.length; i += 4){
        data[i] = 9; data[i + 1] = 13; data[i + 2] = 22; data[i + 3] = 255;
      }
    }
    const cx = Math.floor(width / 2), cy = Math.floor(height / 2);
    for(let y = cy - 2; y <= cy + 2; y++){
      for(let x = cx - 2; x <= cx + 2; x++){
        if(x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        const dark = x === cx && y === cy;
        data[i] = dark ? 9 : 230; data[i + 1] = dark ? 13 : 230;
        data[i + 2] = dark ? 22 : 230; data[i + 3] = 255;
      }
    }
    return {data};
  }
  function stadiumPixels(width, height){
    const data = new Uint8ClampedArray(width * height * 4);
    for(let y = 0; y < height; y++){
      for(let x = 0; x < width; x++){
        const index = (y * width + x) * 4;
        const value = x >= 140 && x <= 160 ? 110 : ((x + y) % 2 ? 40 : 80);
        data[index] = data[index + 1] = data[index + 2] = value;
        data[index + 3] = 255;
      }
    }
    return {data};
  }
  function makeCanvas(display = false){
    const canvas = {width:0, height:0};
    const context = {
      drawImage(source, ...args){
        if(display){
          draws.push({x:args[0], y:args[1], width:args[2], height:args[3], meta:source.meta, color:source.color,
            poleX:source.poleX / source.width, poleY:source.poleY / source.height});
        } else if(source.isImage){
          canvas.meta = {sheet:source.src, row:args[1] / 216, column:args[0] / 192};
          canvas.stadium = source.src.includes('imagesstadium_base_wide');
          canvas.background = true;
        } else {
          if(!canvas.meta && source.meta) canvas.meta = {...source.meta, rotation:this.rotation || source.meta.rotation || 0};
          if(source.color) canvas.color = source.color;
        }
      },
      getImageData(x, y, width, height){
        if(canvas.stadium) return stadiumPixels(width, height);
        if(!canvas.background && (width !== 216 || height !== 216)){
          return {data:new Uint8ClampedArray([230, 230, 230, 255])};
        }
        return pixels(width, height, !!canvas.background);
      },
      putImageData(data){
        if(canvas.background){
          const center = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4;
          extractions.push({outer:data.data[3], enclosed:data.data[center + 3]});
          canvas.background = false;
        }
      },
      translate(){}, setTransform(){}, clearRect(){ if(display) draws.length = 0; },
      rotate(angle){ this.rotation = angle; if(angle) rotations.push(angle); },
      fillRect(){ canvas.color = this.fillStyle; }
    };
    canvas.getContext = () => context;
    canvas.getBoundingClientRect = () => ({width:1493, height:640});
    return canvas;
  }
  const display = makeCanvas(true);
  let bounds = {width:1493, height:640};
  display.getBoundingClientRect = () => bounds;
  const document = {
    hidden:false,
    getElementById:() => display,
    createElement:() => makeCanvas(),
    addEventListener(name, callback){ listeners[name] = callback; }
  };
  class Image {
    constructor(){ this.isImage = true; this.naturalWidth = 1152; this.naturalHeight = 864; }
    set src(value){
      this.path = value;
      if(value.includes('imagesstadium_base_wide')){ this.naturalWidth = 1493; this.naturalHeight = 640; }
      queueMicrotask(() => this.onload());
    }
    get src(){ return this.path; }
  }
  const window = {
    devicePixelRatio:1,
    matchMedia:() => motion,
    addEventListener(name, callback){ listeners[name] = callback; }
  };
  const sandbox = vm.createContext({
    window, document, Image, Math:math, performance:{now:() => now},
    requestAnimationFrame(callback){ const id = nextFrame++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id){ callbacks.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'crowdFlags.js'), 'utf8'), sandbox);
  await window.CrowdFlags.ready;
  const teams = {
    player:{color:'#123456', secondaryColor:'#abcdef'},
    ai:{color:'#654321', secondaryColor:'#fedcba'}
  };
  window.CrowdFlags.setTeams(teams);
  return {window, motion, listeners, callbacks, draws, rotations, extractions, teams,
    resize(width, height){ bounds = {width, height}; listeners.resize(); },
    step(ms){
      now += ms;
      const current = [...callbacks.values()];
      callbacks.clear();
      current.forEach(callback => callback(now));
    }};
}

test('flag sprites remove only connected background and correct the inconsistent square frames', async () => {
  const h = await createHarness();
  assert.equal(h.extractions.length, 48);
  assert.ok(h.extractions.every(extraction => extraction.outer === 0 && extraction.enclosed === 255));
  assert.equal(h.rotations.filter(angle => angle === Math.PI).length, 1);
  assert.equal(h.rotations.filter(angle => angle === -Math.PI / 2).length, 2);
  assert.equal(h.rotations.filter(angle => angle === Math.PI / 2).length, 2);
});

test('more flags cover the stands and use both team colors equally', async () => {
  const h = await createHarness();
  const anchor = flag => [flag.x + flag.width * flag.poleX, flag.y + flag.height * flag.poleY];
  assert.equal(h.draws.length, 112);
  for(const flag of h.draws){
    const [footX, footY] = anchor(flag), x = footX / 1493, y = footY / 640;
    assert.ok(flag.width <= 28 && flag.height <= 28);
    assert.ok(x < .48 || x > .52);
    assert.ok(footX < 140 || footX > 160, 'the pole must not be placed in the simulated aisle');
    const corner = x < .20 || x > .80;
    if(flag.meta.row === 0){
      assert.ok(flag.y / 640 >= (corner ? .125 : .005) - 1e-9);
      assert.ok((flag.y + flag.height) / 640 <= (corner ? .23 : .16) + 1e-9);
    }
    if(flag.meta.row === 1){
      assert.ok(flag.y / 640 >= (corner ? .77 : .895) - 1e-9);
      assert.ok((flag.y + flag.height) / 640 <= (corner ? .875 : 1) + 1e-9);
    }
    if(flag.meta.row === 2) assert.ok((flag.x + flag.width) / 1493 <= .19 + 1e-9 && y > .23 && y < .77);
    if(flag.meta.row === 3) assert.ok(flag.x / 1493 >= .81 - 1e-9 && y > .23 && y < .77);
    const colors = x < .48 ? h.teams.player : h.teams.ai;
    assert.ok([colors.color, colors.secondaryColor].includes(flag.color));
  }
  for(const team of [h.teams.player, h.teams.ai]){
    assert.equal(h.draws.filter(flag => flag.color === team.color).length, 28);
    assert.equal(h.draws.filter(flag => flag.color === team.secondaryColor).length, 28);
    for(const row of [0, 1, team === h.teams.player ? 2 : 3]){
      const inStand = h.draws.filter(flag => flag.meta.row === row &&
        [team.color, team.secondaryColor].includes(flag.color));
      assert.equal(inStand.filter(flag => flag.color === team.color).length, row < 2 ? 8 : 12);
      assert.equal(inStand.filter(flag => flag.color === team.secondaryColor).length, row < 2 ? 8 : 12);
    }
  }
  for(const row of [0, 1]){
    for(const start of [.20, .53]){
      const inStand = h.draws.filter(flag => flag.meta.row === row &&
        anchor(flag)[0] / 1493 >= start && anchor(flag)[0] / 1493 < start + .27);
      const positions = inStand.map(flag => anchor(flag)[0] / 1493);
      assert.equal(positions.length, 12);
      assert.ok(Math.max(...positions) - Math.min(...positions) > .18);
    }
  }
  for(const row of [2, 3]){
    const inStand = h.draws.filter(flag => flag.meta.row === row);
    const positions = inStand.map(flag => anchor(flag)[1] / 640);
    assert.ok(Math.max(...positions) - Math.min(...positions) > .35);
  }
  h.resize(1024, 439);
  assert.ok(h.draws.every(flag => flag.x >= 0 && flag.y >= 0 &&
    flag.x + flag.width <= 1024 && flag.y + flag.height <= 439));
  assert.ok(h.draws.filter(flag => flag.meta.row === 0).every(flag => flag.y + flag.height <= 439 * .23 + 1e-9));
  assert.ok(h.draws.filter(flag => flag.meta.row === 1).every(flag => flag.y >= 439 * .77 - 1e-9));
  assert.ok(h.draws.every(flag => {
    const x = anchor(flag)[0] * 1493 / 1024;
    return x < 140 || x > 160;
  }));
  h.teams.player.color = '#112233';
  h.window.CrowdFlags.setTeams(h.teams);
  assert.equal(h.draws.filter(flag => flag.color === '#112233').length, 28);
  assert.equal(h.draws.filter(flag => flag.color === '#123456').length, 0);
});

test('all animation frames keep each flag anchored at the same pole base', async () => {
  const h = await createHarness();
  const anchors = h.draws.map(flag => [flag.x + flag.width * flag.poleX, flag.y + flag.height * flag.poleY]);
  const squareFrames = new Set();
  for(let i = 0; i < 60; i++){
    h.step(20);
    h.draws.forEach((flag, index) => {
      assert.ok(Math.abs(flag.x + flag.width * flag.poleX - anchors[index][0]) < 1e-7);
      assert.ok(Math.abs(flag.y + flag.height * flag.poleY - anchors[index][1]) < 1e-7);
      if(flag.meta.row === 2 && flag.meta.sheet.includes('flags_square.jpg')) squareFrames.add(flag.meta.column);
    });
  }
  assert.equal(squareFrames.size, 6);
});

test('only the celebrating team accelerates for 2.5 seconds and reduced motion stops animation', async () => {
  const h = await createHarness();
  h.step(10);
  h.window.CrowdFlags.celebrate('player');
  let previous = h.draws.map(flag => flag.meta.column);
  function countTransitions(duration){
    const counts = {player:0, ai:0};
    for(let elapsed = 0; elapsed < duration; elapsed += 10){
      h.step(10);
      h.draws.forEach((flag, index) => {
        if(flag.meta.column !== previous[index]) counts[flag.x < 1493 / 2 ? 'player' : 'ai']++;
      });
      previous = h.draws.map(flag => flag.meta.column);
    }
    return counts;
  }
  const boosted = countTransitions(2500);
  assert.ok(boosted.player >= 56 * 44 && boosted.player <= 56 * 46);
  assert.ok(boosted.ai >= 56 * 19 && boosted.ai <= 56 * 26);
  const normal = countTransitions(1000);
  assert.ok(normal.player >= 56 * 7 && normal.player <= 56 * 11);
  h.window.CrowdFlags.celebrate('ai');
  h.window.CrowdFlags.clearCelebrations();
  const cleared = countTransitions(1000);
  assert.ok(cleared.ai >= 56 * 7 && cleared.ai <= 56 * 11);
  h.motion.matches = true;
  h.listeners.motion();
  assert.equal(h.callbacks.size, 0);
  h.window.CrowdFlags.celebrate('player');
  assert.equal(h.callbacks.size, 0);
  h.motion.matches = false;
  h.listeners.motion();
  assert.equal(h.callbacks.size, 1);
});

test('the loader waits for the flag images and reports a loading failure', async () => {
  for(const shouldFail of [false, true]){
    let resolveFlags, rejectFlags;
    const ready = new Promise((resolve, reject) => { resolveFlags = resolve; rejectFlags = reject; });
    const scripts = [], notices = [];
    const window = {TeamArt:{ready:Promise.resolve(), teams:{}}, CrowdFlags:{ready}};
    const document = {
      querySelectorAll:() => [],
      createElement:() => ({style:{}, setAttribute(){}}),
      body:{
        appendChild(script){ scripts.push(script.src); script.onload(); },
        prepend(notice){ notices.push(notice.textContent); }
      }
    };
    const sandbox = vm.createContext({
      window, document, console:{error(){}},
      fetch:async url => ({ok:true, json:async () => url.startsWith('json/teams.json') ? {names:[]} : {}})
    });
    const loading = vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'loader.js'), 'utf8'), sandbox);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(scripts.some(src => src.includes('crowdFlags.js')));
    assert.ok(!scripts.some(src => src.includes('scripts/app.js')));
    if(shouldFail) rejectFlags(new Error('image manquante'));
    else resolveFlags();
    await loading;
    assert.equal(scripts.some(src => src.includes('scripts/app.js')), !shouldFail);
    assert.equal(notices.length, shouldFail ? 1 : 0);
    if(shouldFail) assert.match(notices[0], /image manquante/);
  }
});
