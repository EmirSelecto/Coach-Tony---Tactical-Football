const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  let now = 0, nextTimer = 1;
  const timers = new Map();
  const classes = () => {
    const values = new Set();
    return {
      add(...names){ names.forEach(name => values.add(name)); },
      remove(...names){ names.forEach(name => values.delete(name)); },
      contains(name){ return values.has(name); }
    };
  };
  const logo = {}, title = {}, subtitle = {}, portrait = {src:''};
  const overlay = {
    classList:classes(),
    style:{setProperty(){}},
    querySelector(selector){
      return {'.cutin-logo':logo, '.cutin-title':title, '.cutin-subtitle':subtitle}[selector];
    }
  };
  const stadium = {classList:classes()};
  const panel = {classList:classes()};
  const document = {
    getElementById(id){
      return {'anime-cutin-overlay':overlay, fieldOuter:stadium, controlsPanel:panel}[id];
    },
    querySelector(){ return portrait; }
  };
  const window = {
    TeamArt:{
      getTeamConfig(name){
        if(name !== 'Team') throw Error('Unknown team');
        return {primary:'#123456', secondary:'#abcdef'};
      },
      getTeamLogoCanvas(){ return {toDataURL:() => 'logo'}; },
      getCommentatorCanvas(expression){ return {toDataURL:() => expression}; }
    }
  };
  const context = vm.createContext({
    window, document, game:{phase:'playing', gameOver:false, playLocked:false, possession:'player'},
    setTimeout(callback, delay){
      const id = nextTimer++;
      timers.set(id, {at:now + delay, callback});
      return id;
    },
    clearTimeout(id){ timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ui', 'animeCutin.js'), 'utf8'), context);
  const engine = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'game', 'engine.js'), 'utf8');
  context.teamNameOf = () => 'Team';
  context.ENDZONE_WIDTH_RATIO = 1 / 11.6;
  context.BALANCE = {eventBanner:{durationMs:1400}};
  const vfx = [];
  window.triggerAnimeVFX = (...args) => vfx.push(args);
  vm.runInContext(engine.slice(engine.indexOf('function showMatchCutin('), engine.indexOf('function triggerScoreCelebration(')), context);
  const advance = ms => {
    const target = now + ms;
    while(true){
      const next = [...timers.entries()].sort((a,b) => a[1].at - b[1].at)[0];
      if(!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  };
  return {window, overlay, stadium, title, portrait, advance, context, vfx};
}

test('cut-in durations and shake follow the event type', () => {
  for(const [type, duration, shake] of [
    ['touchdown',1800,true], ['fieldgoal',1800,true], ['turnover',1600,true],
    ['impact',1400,true], ['firstdown',950,false]
  ]){
    const h = createHarness();
    h.window.showAnimeCutin(type, type, '', 'Team');
    if(type === 'fieldgoal') assert.equal(h.overlay.classList.contains('cutin-touchdown'), true);
    assert.equal(h.stadium.classList.contains('screen-shake'), shake, type);
    h.advance(duration - 1);
    assert.equal(h.overlay.classList.contains('is-active'), true, type);
    h.advance(1);
    assert.equal(h.overlay.classList.contains('is-active'), false, type);
  }
});

test('queued events retain their full duration and reset the portrait afterwards', () => {
  const h = createHarness();
  h.window.showAnimeCutin('turnover', 'FUMBLE', '', 'Team',
    {queue:true, onStart:() => h.window.setCommentatorExpression('shocked')});
  h.window.showAnimeCutin('touchdown', 'TOUCHDOWN', '', 'Team',
    {queue:true, onStart:() => h.window.setCommentatorExpression('hyped')});
  assert.equal(h.portrait.src, 'shocked');
  h.advance(1599);
  assert.equal(h.title.textContent, 'FUMBLE');
  h.advance(1);
  assert.equal(h.title.textContent, 'TOUCHDOWN');
  assert.equal(h.portrait.src, 'hyped');
  h.advance(1800);
  assert.equal(h.portrait.src, 'neutral');
  assert.equal(h.overlay.classList.contains('is-active'), false);
});

test('cancelling prevents queued events from appearing during the next play', () => {
  const h = createHarness();
  h.window.showAnimeCutin('impact', 'SACK', '', 'Team', {queue:true});
  h.window.showAnimeCutin('impact', '4TH DOWN STOP', '', 'Team', {queue:true});
  h.window.cancelAnimeCutins();
  h.advance(5000);
  assert.equal(h.overlay.classList.contains('is-active'), false);
  assert.equal(h.stadium.classList.contains('screen-shake'), false);
  assert.equal(h.title.textContent, 'SACK');
});

test('queued cut-ins start effects with captured coordinates only when displayed', () => {
  const h = createHarness();
  h.context.showMatchCutin('turnover', 'FUMBLE', 'player', '', 'shocked',
    {vfx:{type:'FUMBLE', x:30, y:40}});
  const score = h.context.scoringVFX('TOUCHDOWN', 'ai');
  h.context.showMatchCutin('touchdown', 'TOUCHDOWN', 'ai', '', 'hyped', {vfx:score});
  assert.equal(h.vfx.length, 1);
  assert.deepEqual(h.vfx[0].slice(0, 3), ['FUMBLE', 30, 40]);
  assert.equal(score.x, 50 / 11.6);
  assert.equal(h.context.scoringVFX('FIELD GOAL', 'player').x, 100 - 50 / 11.6);
  h.advance(1600);
  assert.equal(h.vfx.length, 2);
  assert.deepEqual(h.vfx[1].slice(0, 3), ['TOUCHDOWN', score.x, 50]);

  h.context.showMatchCutin('turnover', 'INTERCEPTION', 'player', '', 'shocked',
    {vfx:{type:'INTERCEPTION', x:60, y:25}});
  h.window.cancelAnimeCutins();
  h.advance(5000);
  assert.equal(h.vfx.length, 2);
});

test('big play size follows queued announcements and does not leak to other events', () => {
  const h = createHarness();
  h.context.showEventBanner('BIG PLAY', 'bigPlay');
  h.window.showAnimeCutin('impact', 'SACK', '', 'Team', {queue:true});
  assert.equal(h.overlay.classList.contains('cutin-bigplay'), true);
  h.advance(1400);
  assert.equal(h.title.textContent, 'SACK');
  assert.equal(h.overlay.classList.contains('cutin-bigplay'), false);

  h.context.showEventBanner('FAKE FIELD GOAL', 'bigPlay');
  h.advance(1400);
  assert.equal(h.overlay.classList.contains('cutin-bigplay'), true);
  h.window.cancelAnimeCutins();
  assert.equal(h.overlay.classList.contains('cutin-bigplay'), false);
});
