const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const labels = [], strokes = [], gradients = [], linearGradients = [];
  const timers = new Map(), frames = new Map();
  let nextId = 1, now = 0;
  const setTimer = (callback, delay = 0) => {
    const id = nextId++;
    timers.set(id, {callback, at:now + delay});
    return id;
  };
  const advance = ms => {
    const end = now + ms;
    for(;;){
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if(!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    now = end;
  };
  const frame = timestamp => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(timestamp));
  };
  let arc, line;
  const context = {
    setTransform(){}, clearRect(){}, save(){}, restore(){}, beginPath(){ arc = null; line = false; }, rect(){},
    clip(){}, fillRect(){}, moveTo(){}, lineTo(){ line = true; }, bezierCurveTo(){}, closePath(){},
    stroke(){ strokes.push({arc, line, color:this.strokeStyle, shadow:this.shadowColor, width:this.lineWidth, blur:this.shadowBlur}); },
    fill(){}, arc(x, y, radius){ arc = {x, y, radius}; },
    translate(){}, rotate(){}, strokeText(){}, drawImage(){},
    createLinearGradient(x1, y1, x2, y2){
      const gradient = {x1, y1, x2, y2, stops:[]};
      linearGradients.push(gradient);
      return {addColorStop(offset, color){ gradient.stops.push({offset, color}); }};
    },
    createRadialGradient(){
      const stops = [];
      gradients.push(stops);
      return {addColorStop(offset, color){ stops.push({offset, color}); }};
    },
    measureText:text => ({width:text.length * 5}),
    fillText(text, x, y){ labels.push({text, x, y, border:this.strokeStyle}); }
  };
  const children = [];
  const fieldClasses = new Set();
  const field = {
    appendChild(el){ children.push(el); el.remove = () => children.splice(children.indexOf(el), 1); },
    querySelectorAll(){ return [...children]; },
    classList:{
      add:name => fieldClasses.add(name),
      remove:name => fieldClasses.delete(name),
      contains:name => fieldClasses.has(name)
    },
    getBoundingClientRect:() => ({left:0, top:0, width:800, height:400})
  };
  const canvas = {getContext:() => context};
  const markers = {style:{left:'50%'}};
  const document = {
    documentElement:{dataset:{}}, fonts:{ready:{then(){}}},
    createElement(){
      const el = {className:'', style:{}, dataset:{}};
      el.classList = {
        contains:name => el.className.split(' ').includes(name),
        add(...names){ el.className = [...new Set([...el.className.split(' '), ...names])].join(' '); },
        remove(...names){ el.className = el.className.split(' ').filter(name => !names.includes(name)).join(' '); }
      };
      return el;
    },
    getElementById(id){
      return {field, tacticalCanvas:canvas, firstDownMarker:markers, scrimmageLine:markers}[id];
    }
  };
  const game = {
    possession:'player', fieldPosition:24, visualBallX:24, playLocked:false,
    teams:{
      player:{name:'Alpha Hawks', color:'#123456', secondaryColor:'#66aaff'},
      ai:{name:'Beta Bears', color:'#ab1234', secondaryColor:'#ffcc44'}
    }
  };
  const window = {
    devicePixelRatio:1, addEventListener(){}, renderAnimeVFX:() => false,
    TeamArt:{getTeamLogoCanvas:() => ({}), getSpriteCanvas:() => { throw Error('Unexpected sprite rendering'); }}
  };
  const sandbox = vm.createContext({
    window, document, game, PlayAnimationController:{_setup:null},
    ballState:{visible:false}, performance:{now:() => 0},
    fx:x => (x + 10) / 120 * 100, clamp:(x, min, max) => Math.max(min, Math.min(max, x)),
    coverageSchemeFor:() => 'zone',
    requestAnimationFrame(callback){ const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame:id => frames.delete(id), setTimeout:setTimer, clearTimeout:id => timers.delete(id),
    preSnapDelayMs:() => 3000, setPlayPhase(){}, t:key => key,
    scheduleForGame:setTimer
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'players.js'), 'utf8'), sandbox);
  return {sandbox, game, children, labels, strokes, gradients, linearGradients, field, advance, frame};
}

test('team names keep multiword cities and mascots when split for display', () => {
  const {sandbox} = createHarness();
  for(const [name, city, mascot] of [
    ['Pinecrest Stags', 'Pinecrest', 'Stags'],
    ['Grand Mesa Mustangs', 'Grand Mesa', 'Mustangs'],
    ['Aurora Northern Lights', 'Aurora', 'Northern Lights'],
    ['Comètes', '', 'Comètes']
  ]){
    const parts = sandbox.splitTeamName(name);
    assert.equal(parts.city, city);
    assert.equal(parts.mascot, mascot);
  }
});

test('choice formations draw 22 distinct players around the scrimmage for both possessions', () => {
  const h = createHarness();
  for(const [side, spot, qbYards] of [['player', 24, 18], ['ai', 76, 82]]){
    h.game.possession = side;
    h.game.fieldPosition = spot;
    h.game.visualBallX = spot;
    h.sandbox.ensureChoiceFormation();
    assert.equal(h.children.length, 22);
    assert.equal(h.children.filter(el => el.classList.contains('offense')).length, 11);
    assert.equal(h.children.filter(el => el.classList.contains('defense')).length, 11);
    assert.equal(h.children.filter(el => el.classList.contains('team-player')).length, 11);
    h.labels.length = 0;
    h.strokes.length = 0;
    h.gradients.length = 0;
    h.sandbox.renderTacticalCanvas();
    const players = h.labels.filter(label => ['QB','RB','WR','TE','OL','DL','LB','CB','S'].includes(label.text));
    assert.equal(players.length, 22);
    assert.ok(players.slice(0, 11).every(p => p.border === h.game.teams[side].color));
    const defenseSide = side === 'player' ? 'ai' : 'player';
    assert.ok(players.slice(11).every(p => p.border === h.game.teams[defenseSide].color));
    assert.equal(h.gradients.length, 22);
    assert.ok(h.gradients.every(stops =>
      stops[0].color === '#24334C' && stops[1].color === '#0F172A'));
    assert.equal(h.strokes.filter(s => s.color === '#FFD56A').length, 1);
    assert.equal(h.strokes.filter(s => s.width === 3 && s.blur === 10 &&
      [h.game.teams.player.color, h.game.teams.ai.color].includes(s.color)).length, 22);
    const qb = players.find(player => player.text === 'QB');
    assert.ok(Math.abs(qb.x - (qbYards + 10) / 120 * 800) < 1e-8);
    for(let i = 0; i < players.length; i++){
      for(let j = i + 1; j < players.length; j++){
        assert.ok(Math.hypot(players[i].x - players[j].x, players[i].y - players[j].y) >= 24,
          `${players[i].text} and ${players[j].text} overlap`);
      }
    }
  }
});

test('Press Coverage and Cover 1 use a central LB while Nickel Blitz keeps a CB', () => {
  const h = createHarness();
  for(const [name, centralRole] of [['Press Coverage', 'LB'], ['Cover 1', 'LB'], ['Nickel Blitz', 'CB']]){
    const formation = h.sandbox.formationForPlay(
      {name:'Power Run', type:'run'}, {name}, 50, 'player').defense;
    assert.equal(formation.length, 11);
    assert.equal(formation[7].y, 50);
    assert.equal(formation[7].role, centralRole);
    assert.equal(formation.filter(player => player.role === 'CB').length, name === 'Nickel Blitz' ? 3 : 2);
  }
});

test('field goals use dedicated protection and block formations in both directions', () => {
  const h = createHarness();
  for(const side of ['player', 'ai']){
    const direction = side === 'player' ? 1 : -1;
    const formation = h.sandbox.formationForPlay(
      {name:'Kick Formation', type:'run'}, {name:'Base 4-3'}, 50, side);
    assert.equal(formation.offense.length, 11);
    assert.equal(formation.defense.length, 11);
    assert.equal(formation.offense.filter(player => player.role === 'OL').length, 7);
    assert.ok(formation.offense.filter(player => player.role === 'OL')
      .every(player => player.formX === 50 - 0.8 * direction));
    assert.equal(formation.offense.find(player => player.role === 'QB').formX, 50 - 7.5 * direction);
    assert.equal(formation.offense.find(player => player.role === 'K').formX, 50 - 14 * direction);
    assert.equal(formation.defense.filter(player => player.role === 'DL').length, 7);
    assert.equal(formation.defense.filter(player => player.role === 'LB').length, 2);
    assert.equal(formation.defense.filter(player => player.role === 'S').length, 2);
    assert.ok(formation.defense.every(player => player.formX >= 50) === (side === 'player'));
  }
});

test('screen pass places three receivers on the selected side and balances the middle', () => {
  const h = createHarness();
  const expected = {
    left:[4,20,38,96],
    middle:[4,28,72,96],
    right:[4,62,80,96]
  };
  for(const [direction, lanes] of Object.entries(expected)){
    const formation = h.sandbox.formationForPlay(
      {name:'Screen Pass', type:'pass', direction}, {name:'Base 4-3'}, 50, 'player').offense;
    const receivers = Array.from(formation.filter(player => player.role === 'WR'), player => player.y)
      .sort((a,b) => a-b);
    assert.deepEqual(receivers, lanes);
    const backfield = formation.find(player => player.role === 'RB');
    assert.equal(backfield.y, direction === 'left' ? 32 : direction === 'right' ? 68 : 50);
  }
});

test('Nickel Blitz keeps its cornerbacks outside and assigns coverage to linebackers and safeties', () => {
  const h = createHarness();
  const offense = h.sandbox.formationForPlay(
    {name:'Screen Pass', type:'pass', direction:'right'},
    {name:'Nickel Blitz'}, 50, 'player').offense;
  const formation = h.sandbox.formationForPlay(
    {name:'Screen Pass', type:'pass', direction:'right'},
    {name:'Nickel Blitz'}, 50, 'player').defense;
  assert.deepEqual(Array.from(formation.filter(player => player.role === 'CB'), player => player.y)
    .sort((a,b) => a-b),
    [8,50,92]);
  const receivers = offense.filter(player => player.role === 'WR' || player.role === 'TE');
  const coverage = h.sandbox.selectManCoverageDefenders(
    formation, {type:'pass'}, {name:'Nickel Blitz'}, receivers.length);
  assert.equal(coverage.filter(player => player.role === 'LB').length, 2);
  assert.equal(coverage.filter(player => player.role === 'S').length, 2);
  assert.equal(coverage.some(player => player.role === 'CB'), false);
});

test('Cover 3 and Dime Defense use cornerbacks at the indicated shallow positions', () => {
  const h = createHarness();
  for(const side of ['player', 'ai']){
    const direction = side === 'player' ? 1 : -1;
    for(const [name, shallowSpots, safetyCount] of [
      ['Cover 3', [[5,76]], 3], ['Dime Defense', [[3.5,25], [3.5,75]], 2]
    ]){
      const formation = h.sandbox.formationForPlay(
        {name:'Power Run', type:'run'}, {name}, 50, side).defense;
      for(const [dx, y] of shallowSpots){
        assert.ok(formation.some(player => player.role === 'CB' && player.formX === 50 + dx * direction && player.y === y), name);
      }
      assert.equal(formation.filter(player => player.role === 'S').length, safetyCount);
      assert.equal(formation.length, 11);
    }
  }
});

test('annotated defensive alignments move the indicated players in both directions', () => {
  const h = createHarness();
  const checks = [
    ['Eight-Man Box', 'box', 0, 'y', 1], ['Eight-Man Box', 'box', 6, 'y', -1],
    ['Bear Front', 'box', 1, 'y', 1], ['Bear Front', 'box', 6, 'y', -1],
    ['Inside Run Blitz', 'box', 4, 'dx', -1], ['Inside Run Blitz', 'box', 6, 'y', -1],
    ['Edge Contain', 'edge', 0, 'y', -1], ['Edge Contain', 'edge', 3, 'y', 1],
    ['Outside Run Stop', 'edge', 4, 'dx', -1], ['Outside Run Stop', 'edge', 6, 'dx', -1],
    ['Press Coverage', 'press', 9, 'dx', -1], ['Press Coverage', 'press', 10, 'y', 1],
    ['Cover 1', 'nickelShort', 9, 'y', 1], ['Cover 1', 'nickelShort', 10, 'dx', -1],
    ['Nickel Blitz', 'nickelShort', 7, 'dx', 1], ['Nickel Blitz', 'nickelShort', 10, 'dx', -1],
    ['Cover 3', 'deepShell', 8, 'y', 1], ['Cover 3', 'deepShell', 9, 'dx', -1],
    ['Dime Defense', 'deepShell', 7, 'dx', -1], ['Dime Defense', 'deepShell', 8, 'dx', -1],
    ['Dime Defense', 'deepShell', 9, 'dx', 1], ['Dime Defense', 'deepShell', 10, 'dx', -1],
    ['Prevent Defense', 'deepShell', 3, 'dx', 1], ['Prevent Defense', 'deepShell', 8, 'dx', 1],
    ['Goal-Line Defense', 'box', 4, 'dx', -1], ['Goal-Line Defense', 'box', 5, 'dx', -1],
    ['Goal-Line Defense', 'box', 6, 'dx', -1]
  ];
  for(const [name, category, index, dimension, direction] of checks){
    const original = h.sandbox.genDefenseFormation(category)[index];
    for(const side of ['player', 'ai']){
      const formation = h.sandbox.formationForPlay(
        {name:'Power Run', type:'run'}, {name}, 50, side).defense;
      assert.equal(formation.length, 11, name);
      const player = formation[index];
      if(!(name === 'Cover 3' && index === 9) && !(name === 'Dime Defense' && [7,10].includes(index))){
        assert.equal(player.role, original.role, name);
      }
      const value = dimension === 'dx'
        ? (player.formX - 50) * (side === 'player' ? 1 : -1) : player.y;
      assert.equal(Math.sign(value - original[dimension]), direction, `${name}: ${index} ${dimension}`);
    }
  }
});

test('Base 3-4 has three linemen and four linebackers while unannotated formations stay unchanged', () => {
  const h = createHarness();
  const offPlay = {name:'Power Run', type:'run'};
  const defense = name => h.sandbox.formationForPlay(offPlay, {name}, 50, 'player').defense;
  assert.equal(defense('Base 3-4').filter(p => p.role === 'DL').length, 3);
  assert.equal(defense('Base 3-4').filter(p => p.role === 'LB').length, 4);
  assert.equal(defense('Base 4-3').filter(p => p.role === 'DL').length, 4);
  assert.equal(defense('Base 4-3').filter(p => p.role === 'LB').length, 3);
  const cover4 = defense('Cover 4');
  const original = h.sandbox.genDefenseFormation('deepShell');
  cover4.forEach((p, index) => {
    assert.equal(p.role, original[index].role);
    assert.equal(p.y, original[index].y);
    assert.equal(p.formX, 50 + original[index].dx);
  });
});

test('Cover 1 keeps its deep safety centered against passing formations', () => {
  const h = createHarness();
  h.sandbox.coverageSchemeFor = () => 'man';
  h.sandbox.selectBlitzers = () => new Set();
  for(const side of ['player', 'ai']){
    const formation = h.sandbox.formationForPlay(
      {name:'Quick Slant', type:'pass', direction:'middle'}, {name:'Cover 1'}, 50, side).defense;
    const safeties = formation.filter(p => p.role === 'S');
    assert.equal(safeties[0].y, 50);
    assert.equal(safeties[0].formX, side === 'player' ? 61 : 39);
    const assignments = h.sandbox.selectManCoverageDefenders(formation, {type:'pass'}, {name:'Cover 1'}, 4);
    assert.equal(assignments.includes(safeties[0]), false);
    assert.equal(assignments.length, 4);
  }
});

test('moving routes and breakaway trails follow the actual team primary color', () => {
  for(const side of ['player', 'ai']){
    const h = createHarness();
    h.game.possession = side;
    h.sandbox.ensureChoiceFormation();
    const qb = h.children.find(el => el.classList.contains('qb'));
    const cb = h.children.find(el => el.classList.contains('defense'));
    qb.className += ' breakaway';
    const actors = [
      {id:'O0', team:'offense', role:'QB', element:qb, x:30, y:50,
        path:[{t:0,x:24,y:50},{t:1,x:35,y:50}]},
      {id:'D0', team:'defense', role:'CB', element:cb, x:40, y:25,
        path:[{t:0,x:45,y:25},{t:1,x:35,y:25}]}
    ];
    h.sandbox.PlayAnimationController._setup = {actors, frameProgress:0.5};
    h.sandbox.renderTacticalCanvas();
    const lines = h.strokes.filter(stroke => stroke.line);
    const offenseColor = h.game.teams[side].color;
    const defenseColor = h.game.teams[side === 'player' ? 'ai' : 'player'].color;
    assert.equal(lines.filter(stroke => stroke.color === offenseColor).length, 4);
    assert.equal(lines.filter(stroke => stroke.color === defenseColor).length, 1);
    assert.ok(lines.filter(stroke => [offenseColor, defenseColor].includes(stroke.color))
      .every(stroke => stroke.shadow.startsWith('rgb(')));
  }
});

test('breakaway draws a large hot flame behind the runner in both directions', () => {
  for(const direction of ['left', 'right']){
    const h = createHarness();
    h.sandbox.ensureChoiceFormation();
    const runner = h.children.find(el => el.classList.contains('qb'));
    runner.className += ' breakaway';
    runner.dataset.direction = direction;
    h.sandbox.PlayAnimationController._setup = {actors:[
      {id:'O0', team:'offense', role:'QB', element:runner, x:50, y:50, path:[]}
    ], frameProgress:0.5};
    h.sandbox.renderTacticalCanvas();
    const fire = h.linearGradients.find(g => g.stops.some(stop => stop.color === '#ff8900'));
    assert.ok(fire);
    assert.equal(Math.sign(fire.x2 - fire.x1), direction === 'right' ? 1 : -1);
    assert.ok(Math.abs(fire.x2 - fire.x1) >= 60);
    assert.ok(fire.stops.some(stop => stop.color === '#e32708'));
  }
});

test('repeated choice rendering preserves the formation and a changed spot replaces it', () => {
  const h = createHarness();
  h.sandbox.ensureChoiceFormation();
  const first = h.children[0];
  h.sandbox.ensureChoiceFormation();
  assert.equal(h.children[0], first);
  h.game.fieldPosition = 40;
  h.sandbox.ensureChoiceFormation();
  assert.equal(h.children.length, 22);
  assert.notEqual(h.children[0], first);
});

test('clearing an animation restores the stationary ball', () => {
  const h = createHarness();
  h.field.classList.add('ball-in-play');
  h.sandbox.clearTempPlayers();
  assert.equal(h.field.classList.contains('ball-in-play'), false);
});

function finishPlay(h, nextPossession = 'player'){
  h.sandbox.ensureChoiceFormation();
  const previous = vm.runInContext('formationDots', h.sandbox);
  const actors = ['offense', 'defense'].flatMap((team, group) =>
    previous[team].map((actor, index) => ({
      team, role:actor.role, element:actor.el,
      x:30 + group * 20 + index * 0.1, y:20 + index * 3
    })));
  h.game.possession = nextPossession;
  h.game.phase = 'playing';
  h.sandbox.retainPlayersAfterPlay({actors, offenseSide:'player'});
  return actors;
}

test('final positions stay for two seconds, then both teams move to huddles without rebuilding', () => {
  const h = createHarness();
  const actors = finishPlay(h, 'ai');
  const first = actors[0];
  h.sandbox.ensureChoiceFormation();
  assert.equal(h.children.length, 22);
  assert.equal(vm.runInContext('formationDots.defense[0].el', h.sandbox), first.element);
  h.advance(1999);
  h.frame(0);
  assert.equal(vm.runInContext('formationDots.defense[0].formX', h.sandbox), first.x);
  h.advance(1);
  h.frame(100);
  h.frame(600);
  assert.notEqual(vm.runInContext('formationDots.defense[0].formX', h.sandbox), first.x);
  h.frame(1100);
  const groups = vm.runInContext('formationDots', h.sandbox);
  assert.ok(groups.offense.every(p => p.el.classList.contains('team-ai')));
  assert.ok(groups.defense.every(p => p.el.classList.contains('team-player')));
  assert.equal(h.children.length, 22);
});

test('a kickoff changing possession and field position does not replace the players during the pause', () => {
  const h = createHarness();
  const actors = finishPlay(h);
  h.game.possession = 'ai';
  h.game.fieldPosition = 75;
  h.sandbox.ensureChoiceFormation();
  assert.equal(h.children.length, 22);
  assert.ok(h.children.includes(actors[0].element));
  assert.equal(vm.runInContext('formationDots.defense[0].formX', h.sandbox), actors[0].x);
  let groups = vm.runInContext('formationDots', h.sandbox);
  assert.ok(groups.defense.every(p => ['DL', 'LB', 'CB', 'S'].includes(p.role)));
  assert.ok(groups.offense.some(p => p.role === 'QB'));
  h.advance(2000);
  h.frame(0);
  h.frame(1000);
  groups = vm.runInContext('formationDots', h.sandbox);
  assert.ok(groups.offense.every(p => p.el.classList.contains('team-ai')));
  assert.ok(groups.defense.every(p => p.el.classList.contains('team-player')));
  assert.ok(groups.defense.every(p => ['DL', 'LB', 'CB', 'S'].includes(p.role)));
});

test('a late kickoff updates both huddles and their roles for either receiving team', () => {
  for(const receiving of ['ai', 'player']){
    const h = createHarness();
    const kicking = receiving === 'ai' ? 'player' : 'ai';
    h.game.possession = kicking;
    h.sandbox.ensureChoiceFormation();
    const previous = vm.runInContext('formationDots', h.sandbox);
    const actors = ['offense', 'defense'].flatMap(team => previous[team].map(actor => ({
      team, role:actor.role, element:actor.el, x:actor.formX, y:actor.y
    })));
    h.game.phase = 'conversion';
    h.sandbox.retainPlayersAfterPlay({actors, offenseSide:kicking});
    h.advance(2000);
    h.frame(0);
    h.frame(1000);
    h.game.phase = 'playing';
    h.game.possession = receiving;
    h.game.fieldPosition = receiving === 'ai' ? 75 : 25;
    h.sandbox.ensureChoiceFormation();
    h.frame(1000);
    h.frame(2000);
    const groups = vm.runInContext('formationDots', h.sandbox);
    assert.ok(groups.offense.every(p => p.el.classList.contains('team-' + receiving)));
    assert.ok(groups.defense.every(p => p.el.classList.contains('team-' + kicking)));
    assert.ok(groups.defense.every(p => ['DL', 'LB', 'CB', 'S'].includes(p.role)));
    assert.ok(groups.offense.some(p => p.role === 'QB'));
    const center = groups.offense.reduce((sum, p) => sum + p.formX, 0) / 11;
    assert.ok(Math.abs(center - (receiving === 'ai' ? 88 : 12)) < 1e-8);
    assert.equal(h.children.length, 22);
  }
});

test('a quick choice cancels the huddle and moves continuously to the selected formation before the snap', () => {
  const h = createHarness();
  const actors = finishPlay(h);
  let snapped = 0;
  h.game.playLocked = true;
  h.sandbox.beginPreSnap({name:'Sweep', type:'run', direction:'right'}, {name:'Cover 3'}, true, () => snapped++);
  h.frame(0);
  assert.equal(vm.runInContext('formationDots.offense[0].formX', h.sandbox), actors[0].x);
  h.frame(675);
  assert.notEqual(vm.runInContext('formationDots.offense[0].formX', h.sandbox), actors[0].x);
  h.advance(3000);
  assert.equal(snapped, 0);
  h.frame(1350);
  assert.equal(snapped, 1);
  assert.equal(h.children.length, 22);
  assert.equal(vm.runInContext("formationDots.offense.find(p => p.role === 'FB').formX", h.sandbox), 18);
  h.advance(3000);
  assert.equal(snapped, 1);
});

test('a choice during the huddle starts from the current positions and cleanup cancels movement', () => {
  const h = createHarness();
  finishPlay(h);
  h.advance(2000);
  h.frame(0);
  h.frame(500);
  const position = vm.runInContext('formationDots.offense[0].formX', h.sandbox);
  h.game.playLocked = true;
  h.sandbox.beginPreSnap({name:'Sweep', type:'run', direction:'left'}, {name:'Cover 3'}, true, () => {});
  h.frame(500);
  assert.equal(vm.runInContext('formationDots.offense[0].formX', h.sandbox), position);
  h.sandbox.clearTempPlayers();
  h.frame(2000);
  assert.equal(h.children.length, 0);
});

test('reduced motion keeps the two-second pause but places the huddles without movement', () => {
  const h = createHarness();
  h.sandbox.window.matchMedia = () => ({matches:true});
  const actors = finishPlay(h);
  h.advance(1999);
  h.frame(0);
  assert.equal(vm.runInContext('formationDots.offense[0].formX', h.sandbox), actors[0].x);
  h.advance(1);
  h.frame(100);
  assert.notEqual(vm.runInContext('formationDots.offense[0].formX', h.sandbox), actors[0].x);
});

test('a conversion after a defensive touchdown changes formation without changing team identities', () => {
  const h = createHarness();
  finishPlay(h);
  h.game.pendingConversion = {team:'ai'};
  h.game.phase = 'conversion';
  h.game.playLocked = true;
  h.advance(2000);
  h.frame(0);
  h.frame(500);
  let ready = false;
  h.sandbox.preparePlayFormation({name:'Power Run', type:'run'}, {name:'Cover 1'}, 2, 'ai', 1000, () => { ready = true; });
  h.frame(500);
  h.frame(1500);
  const groups = vm.runInContext('formationDots', h.sandbox);
  assert.equal(ready, true);
  assert.ok(groups.offense.every(p => p.el.classList.contains('team-ai')));
  assert.ok(groups.defense.every(p => p.el.classList.contains('team-player')));
  assert.equal(groups.offense.find(p => p.role === 'QB').formX, 5.5);
});
