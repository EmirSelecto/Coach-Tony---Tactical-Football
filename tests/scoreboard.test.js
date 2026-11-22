const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const elements = new Map();
  const document = {
    getElementById(id){
      if(!elements.has(id)){
        elements.set(id, {
          textContent:'', dataset:{}, style:{}, attributes:{},
          setAttribute(name, value){ this.attributes[name] = value; }
        });
      }
      return elements.get(id);
    }
  };
  const texts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'json', 'ui.json'), 'utf8'));
  const t = (key, values = {}) => {
    const text = key.split('.').slice(1).reduce((value, part) => value[part], texts);
    assert.equal(typeof text, 'string', key);
    return text.replace(/\{(\w+)\}/g, (_, name) => values[name]);
  };
  const game = {
    quarter:1, clock:455, scorePlayer:7, scoreAI:14, phase:'playing',
    timeouts:{player:3, ai:2}, clockRunning:true, down:2, distance:5,
    possession:'player', fieldPosition:40, playLocked:false
  };
  const context = vm.createContext({
    document, game, t, BALANCE:{overtime:{timeouts:2}, timeoutsPerHalf:3},
    teamNameOf:side => side === 'player' ? 'Home' : 'Away',
    computeFirstDownTargetX:() => 45, fx:x => x
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ui', 'interface.js'), 'utf8'), context);
  vm.runInContext('renderTendencies = renderControls = renderDebug = renderMatchLog = () => {};', context);
  return {context, game, elements};
}

test('scoreboard shows each quarter, overtime, scores and clock', () => {
  const h = createHarness();
  for(const [quarter, label, description] of [
    [1, '1st QTR', 'Quart-temps 1 / 4'], [2, '2nd QTR', 'Quart-temps 2 / 4'],
    [3, '3rd QTR', 'Quart-temps 3 / 4'], [4, '4th QTR', 'Quart-temps 4 / 4'],
    [5, 'OT', 'Prolongation']
  ]){
    h.game.quarter = quarter;
    h.context.render();
    assert.equal(h.elements.get('quarterLabel').textContent, label);
    assert.equal(h.elements.get('quarterLabel').attributes['aria-label'], description);
    assert.equal(h.elements.get('quarterLabel').title, description);
  }
  assert.equal(h.elements.get('clockLabel').textContent, '07:35');
  assert.equal(h.elements.get('scorePlayer').textContent, 7);
  assert.equal(h.elements.get('scorePlayer').dataset.digits, 1);
  assert.equal(h.elements.get('scoreAI').textContent, 14);
  assert.equal(h.elements.get('scoreAI').dataset.digits, 2);
  assert.equal(h.elements.get('downStatus').textContent, '2nd DOWN');
  assert.equal(h.elements.get('downDistance').textContent, '5 YDS TO GO');
  assert.equal(h.elements.get('clockState').textContent, 'chrono en marche');
  h.game.scoreAI = 100;
  h.game.phase = 'conversion';
  h.context.render();
  assert.equal(h.elements.get('scoreAI').dataset.digits, 3);
  assert.equal(h.elements.get('downStatus').textContent, 'TRY');
  assert.equal(h.elements.get('downDistance').textContent, 'CONVERSION');
});

test('final score shows team logos and updates winner, loser and tie states', () => {
  const ids = ['finalOverlay','finalTitle','finalTeamPlayer','finalTeamAI',
    'finalLogoPlayer','finalLogoAI','finalPointsPlayer','finalPointsAI'];
  const elements = Object.fromEntries(ids.map(id => {
    const classes = new Set();
    return [id, {classList:{
      remove:name => classes.delete(name),
      toggle:(name, force) => force ? classes.add(name) : classes.delete(name),
      contains:name => classes.has(name)
    }}];
  }));
  const context = vm.createContext({
    document:{getElementById:id => elements[id]},
    window:{TeamArt:{getTeamLogoCanvas:name => ({toDataURL:() => 'logo:' + name})}},
    game:{scorePlayer:21, scoreAI:14, quarter:4},
    teamNameOf:side => side === 'player' ? 'Home' : 'Away',
    render(){}, SaveManager:{clear(){}}, t:key => key
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'timeline.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function endGame('), source.indexOf('function setResult(')), context);
  for(const [player, ai, playerClass, aiClass] of [
    [21,14,'winner','loser'], [7,17,'loser','winner'], [10,10,null,null]
  ]){
    context.game.scorePlayer = player;
    context.game.scoreAI = ai;
    context.endGame();
    assert.equal(elements.finalLogoPlayer.src, 'logo:Home');
    assert.equal(elements.finalLogoAI.alt, 'Away');
    assert.equal(elements.finalPointsPlayer.textContent, String(player));
    assert.equal(elements.finalPointsAI.textContent, String(ai));
    for(const [id, expected] of [['finalTeamPlayer', playerClass], ['finalTeamAI', aiClass]]){
      for(const state of ['winner','loser']) assert.equal(elements[id].classList.contains(state), state === expected);
    }
  }
});
