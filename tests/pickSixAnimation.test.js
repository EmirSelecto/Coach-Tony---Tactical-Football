const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(side, spot, speed = 1){
  const dir = side === 'player' ? 1 : -1;
  const dot = (role, x, y) => ({role, formX:x, y, el:{classList:{contains:() => false}}});
  const formationDots = {
    offense:[
      ...[38,44,50,56,62].map(y => dot('OL', spot, y)),
      dot('QB', spot-dir*5, 50), dot('RB', spot-dir*8, 55),
      dot('WR', spot, 10), dot('WR', spot, 25), dot('WR', spot, 90), dot('TE', spot, 70)
    ],
    defense:[
      ...[38,46,54,62].map(y => dot('DL', spot+dir*2, y)),
      ...[32,50,68].map(y => dot('LB', spot+dir*5, y)),
      dot('CB', spot+dir*4, 12), dot('CB', spot+dir*4, 88),
      dot('S', spot+dir*10, 36), dot('S', spot+dir*10, 64)
    ]
  };
  const context = vm.createContext({
    BALANCE:{animation:{globalSlowdown:2}, eventThresholds:{bigPlay:{minYards:15}}}, game:{animSpeed:speed}, formationDots,
    DEFENSE_PROFILES:{}, laneForDirection:direction => ({left:22,middle:50,right:78})[direction],
    clamp:(n,min,max) => Math.max(min, Math.min(max,n))
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'timeline.js'), 'utf8'), context);
  return context;
}

function setupReturn(context, side, spot, scoring, depth = 'short'){
  const defenderDir = side === 'player' ? -1 : 1;
  return context.buildPlaySetup({
    offPlay:{name:'Quick Slant', type:'pass', depth, direction:'middle'},
    defPlay:{name:'Cover 3'}, preSnapSpot:spot, offenseSide:side,
    outcome:'interception', yards:0,
    ret:{defenderDir, defenderSide:side === 'player' ? 'ai' : 'player',
      newSpot:scoring ? (defenderDir === 1 ? 100 : 0) : spot+defenderDir*8,
      isPickSix:scoring, returnYards:scoring ? (defenderDir === 1 ? 100-spot : spot) : 8}
  });
}

test('pick-six return reaches the end zone before the animation finishes in both directions', () => {
  for(const [side, spot, expected, depth] of [
    ['ai',20,104,'short'], ['player',80,-4,'medium'], ['ai',20,104,'deep']
  ]){
    const context = createHarness(side, spot);
    const setup = setupReturn(context, side, spot, true, depth);
    const interceptor = setup.actorsById[setup.interceptorId];
    const atCatch = context.evalPath(interceptor.path, setup.kf.catch);
    const halfway = context.evalPath(interceptor.path, (setup.kf.catch + setup.kf.tackle) / 2);
    const atGoal = context.evalPath(interceptor.path, setup.kf.tackle);
    const atWhistle = context.evalPath(interceptor.path, 1);
    assert.equal(atGoal.x, expected);
    assert.equal(atWhistle.x, expected);
    assert.ok(Math.abs(halfway.x - atCatch.x) > 10);
    assert.ok(Math.abs(halfway.x - expected) > 10);
    assert.ok(setup.totalMs * (setup.kf.tackle - setup.kf.catch) >= 5000);
    assert.ok(setup.totalMs * (1 - setup.kf.tackle) >= 499);
    assert.equal(setup.timelineEvents.at(-1).type, 'whistle');
    assert.equal(setup.timelineEvents.find(event => event.type === 'breakaway').kind, 'return');
    assert.ok(setup.actors.every(actor => actor.path.every((point, index, path) =>
      Number.isFinite(point.t) && (index === 0 || point.t >= path[index-1].t))));
  }
});

test('ordinary interceptions retain their timing and animation speed still scales scoring returns', () => {
  const normal = setupReturn(createHarness('ai', 20), 'ai', 20, false);
  assert.equal(normal.totalMs, 3500);
  assert.equal(normal.kf.catch, .52);
  const slow = setupReturn(createHarness('ai', 20, 1), 'ai', 20, true);
  const fast = setupReturn(createHarness('ai', 20, 2), 'ai', 20, true);
  assert.ok(Math.abs(slow.totalMs / 2 - fast.totalMs) <= 1);
});

test('big gains ignite on acceleration but short gains and incomplete passes do not', () => {
  const context = createHarness('player', 40);
  const base = {
    kf:{snap:.08, handoff:.2, laneCommit:.35, catch:.52, throw:.38, tackle:.86, whistle:1},
    offPlay:{type:'run', name:'Inside Zone'}, outcome:'gain',
    carrierId:'O1', qbId:'O0', family:'insideRun', yards:15
  };
  const events = setup => context.createPlayTimelineEvents(setup, {});
  assert.equal(events(base).find(event => event.type === 'breakaway').time, .35);
  assert.equal(events({...base, yards:14}).some(event => event.type === 'breakaway'), false);
  assert.equal(events({...base, outcome:'incomplete', offPlay:{type:'pass'}}).some(event => event.type === 'breakaway'), false);
  assert.equal(events({...base, breakaway:true, yards:5}).some(event => event.type === 'breakaway'), true);
});

test('pick-six flame follows the interceptor in the return direction until the end of the run', () => {
  for(const [side, spot, direction] of [['ai',20,1], ['player',80,-1]]){
    const context = createHarness(side, spot);
    const setup = setupReturn(context, side, spot, true);
    const runner = setup.actorsById[setup.interceptorId];
    const classes = new Set();
    runner.element = {dataset:{}, classList:{add:name => classes.add(name), remove:name => classes.delete(name)}};
    context.ballState = {carrierId:runner.id};
    context.AudioManager = {play(){}};
    context.triggerBreakawayEffect = (element, dir) => {
      element.dataset.direction = dir;
      element.classList.add('breakaway');
    };
    context.document = {getElementById:() => ({style:{}, classList:{add(){}, remove(){}}})};
    context.fx = x => x;
    const controller = vm.runInContext('PlayAnimationController', context);
    controller._triggerCameraShake = () => {};
    controller._onTimelineEvent({type:'breakaway', kind:'return'}, setup);
    assert.equal(runner.element.dataset.direction, direction);
    assert.equal(classes.has('breakaway'), true);
    controller._onTimelineEvent({type:'tackle'}, setup);
    assert.equal(classes.has('breakaway'), false);
    assert.equal(runner.element.dataset.direction, undefined);
  }
});
