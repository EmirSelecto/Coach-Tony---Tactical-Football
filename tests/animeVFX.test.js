const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(reduced = false){
  let now = 0, refreshes = 0, clearCount = 0;
  const paths = [], classes = new Set();
  let current;
  const context = {
    setTransform(){}, clearRect(){ clearCount++; }, save(){}, restore(){},
    beginPath(){ current = {}; },
    moveTo(x, y){ current.from = [x, y]; },
    lineTo(x, y){ current.to = [x, y]; },
    arc(x, y, radius){ current.arc = [x, y, radius]; },
    stroke(){ paths.push({...current, color:this.strokeStyle, blend:this.globalCompositeOperation, blur:this.shadowBlur}); }
  };
  const canvas = {
    width:0, height:0,
    getContext:() => context,
    getBoundingClientRect:() => ({left:10, top:20, width:1000, height:600})
  };
  const flashElements = [];
  const flashes = {offsetWidth:100, appendChild(element){ flashElements.push(element); }, classList:{
    add(...names){ names.forEach(name => classes.add(name)); },
    remove(...names){ names.forEach(name => classes.delete(name)); }
  }};
  let nextTimer = 1;
  const timers = new Map();
  const window = {devicePixelRatio:2, matchMedia:() => ({matches:reduced})};
  const sandbox = vm.createContext({
    window, document:{
      getElementById:() => canvas, querySelector:() => flashes,
      createElement:() => ({style:{setProperty(name, value){ this[name] = value; }}})
    },
    performance:{now:() => now}, refreshTacticalCanvas:() => { refreshes++; },
    setTimeout(callback, delay){ const id = nextTimer++; timers.set(id, {at:now + delay, callback}); return id; },
    clearTimeout(id){ timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'animeVFX.js'), 'utf8'), sandbox);
  return {window, paths, classes, canvas, flashElements, advance(ms){
    const target = now + ms;
    while(true){
      const next = [...timers.entries()].sort((a,b) => a[1].at - b[1].at)[0];
      if(!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  },
    render(){ paths.length = 0; return window.renderAnimeVFX({left:110, top:120, width:800, height:400}, now); },
    get refreshes(){ return refreshes; }, get clearCount(){ return clearCount; }};
}

const colors = {primary:'#123456', secondary:'#abcdef'};

test('fifty independently timed flashes stay in the four stands', () => {
  const h = createHarness();
  assert.equal(h.flashElements.length, 50);
  const positions = h.flashElements.map(element => ({
    x:parseFloat(element.style.left), y:parseFloat(element.style.top),
    delay:element.style['--flash-delay']
  }));
  assert.ok(positions.every(({x, y}) => x < 16.5 || x > 83.5 || y < 20.5 || y > 78.5));
  assert.ok(positions.some(({x}) => x < 15) && positions.some(({x}) => x > 85));
  assert.ok(positions.some(({y}) => y < 18) && positions.some(({y}) => y > 82));
  assert.ok(new Set(positions.map(position => position.delay)).size > 1);
});

test('crowd celebration lasts two seconds, restarts on a new event and respects reduced motion', () => {
  const h = createHarness();
  h.window.triggerCrowdCelebration();
  assert.equal(h.classes.has('crowd-celebrating'), true);
  h.advance(1500);
  h.window.triggerCrowdCelebration();
  h.advance(1999);
  assert.equal(h.classes.has('crowd-celebrating'), true);
  h.advance(1);
  assert.equal(h.classes.has('crowd-celebrating'), false);
  h.window.triggerCrowdCelebration();
  h.window.clearAnimeVFX();
  assert.equal(h.classes.has('crowd-celebrating'), false);
  const reduced = createHarness(true);
  reduced.window.triggerCrowdCelebration();
  assert.equal(reduced.classes.has('crowd-celebrating'), false);
});

test('score effects draw forty glowing rays from the selected end zone and expire', () => {
  for(const [type, x] of [['TOUCHDOWN', 4], ['FIELD GOAL', 96]]){
    const h = createHarness();
    h.window.triggerAnimeVFX(type, x, 50, colors);
    assert.equal(h.refreshes, 1);
    assert.equal(h.classes.has('anime-vfx-flash'), true);
    h.render();
    assert.equal(h.paths.length, 40);
    assert.ok(h.paths.every(p => p.from[0] === 100 + 800 * x / 100 && p.from[1] === 300));
    assert.ok(h.paths.every(p => p.blend === 'lighter' && p.blur === 12));
    assert.ok(h.paths.some(p => p.color === colors.primary));
    assert.ok(h.paths.some(p => p.color === colors.secondary));
    assert.ok(h.paths.some(p => p.color === '#FFD66B'));
    h.advance(1200);
    assert.equal(h.render(), false);
    assert.equal(h.paths.length, 0);
  }
});

test('turnovers and sacks draw two expanding rings at the captured action point', () => {
  for(const type of ['FUMBLE', 'INTERCEPTION', 'SACK']){
    const h = createHarness();
    h.window.triggerAnimeVFX(type, 35, 70, colors);
    h.advance(200);
    assert.equal(h.render(), true);
    const rings = h.paths.filter(p => p.arc);
    assert.equal(rings.length, 2);
    assert.deepEqual(rings.map(p => p.arc.slice(0, 2)), [[380, 380], [380, 380]]);
    assert.ok(rings.every(p => p.arc[2] > 0));
    assert.ok(rings.every(p => p.color !== colors.primary && p.color !== colors.secondary));
    assert.equal(h.paths.filter(p => p.from).length, 16);
    h.advance(450);
    assert.equal(h.render(), false);
  }
});

test('reduced motion, invalid arguments and cancellation do not leave effects running', () => {
  const reduced = createHarness(true);
  reduced.window.triggerAnimeVFX('TOUCHDOWN', 50, 50, colors);
  assert.equal(reduced.refreshes, 0);
  assert.equal(reduced.render(), false);
  const h = createHarness();
  assert.throws(() => h.window.triggerAnimeVFX('UNKNOWN', 0, 0, colors));
  assert.throws(() => h.window.triggerAnimeVFX('SACK', NaN, 0, colors));
  assert.throws(() => h.window.triggerAnimeVFX('SACK', 0, 0, {}));
  h.window.triggerAnimeVFX('TOUCHDOWN', 50, 50, colors);
  h.window.clearAnimeVFX();
  assert.equal(h.classes.has('anime-vfx-flash'), false);
  assert.equal(h.render(), false);
  assert.ok(h.clearCount > 0);
});
