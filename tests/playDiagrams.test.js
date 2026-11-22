const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({window:{}});
const source = fs.readFileSync(path.join(root, 'scripts', 'services', 'save.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('const OFFENSE_PLAYS ='), source.indexOf('const ALL_OFFENSE_VARIANTS')), context);
vm.runInContext(source.slice(source.indexOf('const DEFENSE_PLAYS =')), context);
vm.runInContext(fs.readFileSync(path.join(root, 'scripts', 'ui', 'playDiagrams.js'), 'utf8'), context);
const offense = JSON.parse(vm.runInContext('JSON.stringify(OFFENSE_PLAYS)', context));
const defense = JSON.parse(vm.runInContext('JSON.stringify(DEFENSE_PLAYS)', context));
const draw = (name, direction = null) => context.window.PlayDiagrams.getPlayDiagramSVG(name, direction);
const count = (svg, pattern) => (svg.match(pattern) || []).length;
const primary = svg => svg.match(/class="primary-route" d="([^"]+)"/)[1];

test('every configured play has a distinct diagram and every available offensive variant renders', () => {
  const diagrams = new Set();
  for(const play of [...offense, ...defense]){
    const svg = draw(play.name);
    assert.match(svg, /viewBox="0 0 120 72"/, play.name);
    assert.doesNotMatch(svg, /undefined|NaN/, play.name);
    diagrams.add(svg.replace(/play-\d+/g, 'play-id'));
    if(play.directions){
      for(const direction of ['left', 'middle', 'right']){
        const variant = draw(play.name, direction);
        assert.match(variant, /class="primary-route"/, `${play.name} ${direction}`);
        assert.doesNotMatch(variant, /undefined|NaN/, `${play.name} ${direction}`);
      }
    }else{
      assert.equal(count(svg, /class="defender"/g), 11, play.name);
    }
  }
  assert.equal(diagrams.size, offense.length + defense.length);
  assert.throws(() => draw('Unknown'), /inconnu/);
  assert.throws(() => draw('Sweep', 'up'), /inconnue/);
});

test('direction variants mirror outside runs and highlight the targeted vertical', () => {
  assert.match(primary(draw('Sweep', 'left')), /14 46L14 13$/);
  assert.match(primary(draw('Sweep', 'right')), /106 46L106 13$/);
  assert.match(primary(draw('Four Verticals', 'left')), /^M10 42V6$/);
  assert.match(primary(draw('Four Verticals', 'middle')), /^M50 36V6$/);
  assert.match(primary(draw('Four Verticals', 'right')), /^M110 42V6$/);
  assert.match(primary(draw('Screen Pass', 'left')), /L24 22$/);
  assert.match(primary(draw('Screen Pass', 'middle')), /L60 24$/);
  assert.match(primary(draw('Screen Pass', 'right')), /L96 22$/);
});

test('coverage and blitz diagrams show the requested zones and rushers', () => {
  assert.equal(count(draw('Cover 3'), /class="coverage-zone"/g), 7);
  assert.equal(count(draw('Cover 4'), /class="coverage-zone"/g), 4);
  assert.equal(count(draw('Cover 1'), /class="coverage-zone"/g), 1);
  assert.equal(count(draw('Inside Run Blitz'), /stroke="#ff007f"/g), 2);
  assert.equal(count(draw('Goal-Line Defense'), /stroke="#ff007f"/g), 9);
});

test('base fronts contain the requested number of linemen and linebackers', () => {
  const positions = svg => Array.from(svg.matchAll(/class="defender"[^>]*><path d="M([\d.]+) ([\d.]+)/g),
    match => [Number(match[1]) + 2, Number(match[2]) + 2]);
  for(const [name, front, linebackers] of [
    ['Base 4-3', 4, 3], ['Base 3-4', 3, 4], ['Eight-Man Box', 4, 4], ['Bear Front', 5, 2]
  ]){
    const players = positions(draw(name));
    assert.equal(players.filter(([, y]) => y === 26).length, front, name);
    assert.equal(players.filter(([x, y]) => x >= 30 && x <= 90 && (y === 18 || y === 19)).length, linebackers, name);
  }
});
