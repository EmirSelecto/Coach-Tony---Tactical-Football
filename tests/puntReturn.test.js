const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(){
  const math = Object.create(Math);
  const context = vm.createContext({
    Math:math, window:{addEventListener(){}}, document:{fonts:{ready:{then(){}}}},
    BALANCE:{punt:{returnTouchdownChance:0.01, returnMin:0, returnMax:18},
      conversion:{twoPointBallOn:98}, animation:{globalSlowdown:2}},
    clamp:(value, min, max) => Math.max(min, Math.min(max, value)),
    randInt:(min, max) => min === 32 ? 40 : max,
    game:{possession:'player', quarter:1, scorePlayer:0, scoreAI:0}
  });
  for(const file of ['scripts/animation/players.js', 'scripts/animation/timeline.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  context.switchPossession = spot => {
    context.game.possession = context.game.possession === 'player' ? 'ai' : 'player';
    context.game.fieldPosition = Math.max(1, Math.min(99, spot));
  };
  context.score = (side, points) => {
    context.game[side === 'player' ? 'scorePlayer' : 'scoreAI'] += points;
    if(context.game.quarter >= 5) context.game.pendingGameEnd = true;
  };
  return context;
}

test('one percent of returned punts score, with correct direction and touchbacks', () => {
  const h = harness();
  for(const [side, spot, landing, goal] of [['player',20,60,0], ['ai',80,40,100]]){
    let scores = 0;
    for(let i = 0; i < 1000; i++){
      h.Math.random = () => (i + 0.5) / 1000;
      const punt = h.resolvePunt(spot, side);
      assert.equal(punt.landing, landing);
      if(punt.touchdown){
        scores++;
        assert.equal(punt.newPos, goal);
        assert.equal(punt.returnYards, 60);
      } else {
        assert.equal(punt.returnYards, 18);
        assert.equal(punt.newPos, side === 'player' ? 42 : 58);
      }
    }
    assert.equal(scores, 10);
    h.Math.random = () => { throw Error('A touchback must not select a return'); };
    const touchback = h.resolvePunt(side === 'player' ? 80 : 20, side);
    assert.equal(touchback.touchback, true);
    assert.equal(touchback.touchdown, false);
    assert.equal(touchback.newPos, side === 'player' ? 80 : 20);
  }
  h.Math.random = () => 0.5;
  assert.equal(h.resolvePunt(59, 'player').newPos, 81);
  assert.equal(h.resolvePunt(41, 'ai').newPos, 19);
});

test('return touchdown awards the receiving team and schedules conversion except in overtime', () => {
  for(const [punter, receiving, spot] of [['player','ai',2], ['ai','player',98]]){
    for(const quarter of [1,5]){
      const h = harness();
      h.game.possession = punter;
      h.game.quarter = quarter;
      h.applyPuntResult({newPos:punter === 'player' ? 0 : 100, touchdown:true}, punter);
      assert.equal(h.game.possession, receiving);
      assert.equal(h.game[receiving === 'player' ? 'scorePlayer' : 'scoreAI'], 6);
      if(quarter < 5){
        assert.equal(h.game.pendingConversion.team, receiving);
        assert.equal(h.game.fieldPosition, spot);
      } else {
        assert.equal(h.game.pendingConversion, undefined);
        assert.equal(h.game.pendingGameEnd, true);
      }
    }
  }
});

test('punt formation and return paths cover both teams and finish at the calculated spot', () => {
  for(const [side, spot, landing, end] of [['player',20,60,42], ['ai',80,40,58]]){
    const h = harness();
    const forms = h.formationForPlay({name:'Punt Formation', type:'punt', landing}, {}, spot, side);
    assert.equal(forms.offense.length, 11);
    assert.equal(forms.defense.length, 11);
    assert.equal(forms.offense.filter(actor => actor.role === 'P').length, 1);
    assert.equal(forms.defense.filter(actor => actor.role === 'PR').length, 1);
    const dots = Object.fromEntries(['offense','defense'].map(team => [
      team, forms[team].map(actor => ({...actor, el:{}}))
    ]));
    h.formationDots = dots;
    vm.runInContext('formationDots = globalThis.formationDots', h);
    const punt = {landing, newPos:end, touchdown:false, touchback:false};
    const setup = h.buildPuntAnimation({preSnapSpot:spot, offenseSide:side, punt});
    assert.equal(setup.actors.length, 22);
    assert.equal(h.evalPath(setup.returner.path, 0.55).x, landing);
    assert.equal(h.evalPath(setup.returner.path, 0.92).x, end);
    assert.ok(setup.actors.filter(actor => actor !== setup.punter && actor !== setup.returner)
      .every(actor => Math.abs(h.evalPath(actor.path, 0.55).x - actor.path[0].x) > 1));
    assert.deepEqual(Array.from(setup.timelineEvents, event => event.type), ['snap','kick','catch','puntTackle','whistle']);
    const score = h.buildPuntAnimation({preSnapSpot:spot, offenseSide:side,
      punt:{...punt, touchdown:true, newPos:side === 'player' ? 0 : 100}});
    assert.equal(h.evalPath(score.returner.path, 0.92).x, side === 'player' ? -4 : 104);
    assert.ok(!score.timelineEvents.some(event => event.type === 'puntTackle'));
    const touchback = h.buildPuntAnimation({preSnapSpot:spot, offenseSide:side,
      punt:{...punt, touchback:true, landing:side === 'player' ? 100 : 0}});
    assert.ok(!touchback.timelineEvents.some(event => event.type === 'catch'));
  }
});

test('touchbacks land loose inside the end zone away from the returner in both directions', () => {
  for(const [side, spot, landing, newPos, endZone] of [
    ['player',80,100,80,104], ['ai',20,0,20,-4]
  ]){
    const h = harness();
    const forms = h.formationForPlay({name:'Punt Formation', type:'punt', landing}, {}, spot, side);
    h.formationDots = Object.fromEntries(['offense','defense'].map(team => [
      team, forms[team].map(actor => ({...actor, el:{style:{}}}))
    ]));
    vm.runInContext('formationDots = globalThis.formationDots', h);
    let frame;
    h.requestAnimationFrame = callback => { frame = callback; return 1; };
    h.fx = x => (x + 10) / 120 * 100;
    h.t = key => key;
    h.setPlayPhase = () => {};
    h.refreshTacticalCanvas = () => {};
    const field = {appendChild(){}, classList:{add(){}}};
    h.document.getElementById = () => field;
    h.document.createElement = () => ({style:{}, dataset:{}});
    vm.runInContext('PlayAnimationController._onTimelineEvent = () => {}', h);
    h.game.animSpeed = 1;
    h.runPuntAnimation({preSnapSpot:spot, offenseSide:side,
      punt:{landing, newPos, touchback:true, touchdown:false}}, () => {});
    frame(0);
    frame(4400);
    const state = vm.runInContext('({ball:ballState, setup:PlayAnimationController._setup})', h);
    assert.equal(state.ball.mode, 'loose');
    assert.equal(state.ball.carrierId, null);
    assert.equal(state.ball.x, endZone);
    assert.equal(state.ball.y, 50);
    assert.equal(state.setup.returner.y, 65);
    assert.ok(!state.setup.timelineEvents.some(event => event.type === 'catch'));
    frame(6400);
    assert.equal(state.ball.x, endZone);
    assert.equal(state.ball.carrierId, null);
  }
});
