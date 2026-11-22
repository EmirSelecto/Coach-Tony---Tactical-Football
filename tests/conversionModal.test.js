const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  class Element {
    constructor(){
      this.children = [];
      this.classes = new Set();
      this.classList = {
        add:(...names) => names.forEach(name => this.classes.add(name)),
        remove:name => this.classes.delete(name),
        toggle:(name, force) => force ? this.classes.add(name) : this.classes.delete(name),
        contains:name => this.classes.has(name)
      };
    }
    set className(value){ this.classes = new Set(value.split(' ')); }
    set innerHTML(value){ this.html = value; this.children = []; }
    set textContent(value){ this.text = value; this.children = []; }
    append(...children){ this.children.push(...children); }
    appendChild(child){ this.children.push(child); }
    prepend(child){ this.children.unshift(child); }
    setAttribute(name, value){ this[name] = value; }
  }
  const elements = Object.fromEntries(['choiceOverlay','choiceTitle','choiceBody','choiceActions'].map(id => [id, new Element()]));
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'json', 'game.json'), 'utf8'));
  const diagramCalls = [];
  const context = vm.createContext({
    document:{getElementById:id => elements[id], createElement:() => new Element()},
    window:{
      TeamArt:{getTeamLogoCanvas:name => ({toDataURL:() => `logo:${name}`})},
      PlayDiagrams:{forPlay:(...args) => { diagramCalls.push(args); return '<svg></svg>'; }}
    },
    game:{
      pendingConversion:{team:'player'},
      teams:{player:{name:'Alpha'}, ai:{name:'Beta'}},
      offensivePlayHistoryPlayer:[], defensivePlayHistoryPlayer:[]
    },
    BALANCE:{conversion:{patChance:.94}},
    t:(key, values = {}) => key.split('.').slice(1).reduce((v, part) => v[part], catalog)
      .replace(/\{(\w+)\}/g, (_, name) => values[name]),
    setPlayPhase:() => {}, render:() => {}, aiConversionChoice:() => 'two',
    scoreDiffFor:() => 0, playLabel:name => name, teamNameOf:side => side === 'player' ? 'Alpha' : 'Beta',
    conversionContext:() => ({}), calculatePredictability:() => 0,
    chooseAIDefensivePlay:() => ({name:'Cover 1'}), chooseAIOffensivePlay:() => ({name:'Dive'}),
    DEFENSE_PLAYS:['Goal-Line Defense','Cover 1','Base 4-3','Nickel Blitz'].map(name => ({name}))
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'game', 'plays.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const TWO_POINT_OFFENSE_OPTIONS'), source.indexOf('/* Déclenchée une seule fois')), context);
  vm.runInContext('finishConversion = (...args) => { result = args; }', context);
  return {context, elements, diagramCalls};
}

test('player conversion displays its team and diagrams and preserves every action', () => {
  const {context, elements, diagramCalls} = createHarness();
  context.runConversion();
  assert.equal(elements.choiceTitle.children[0].alt, 'Alpha');
  assert.equal(elements.choiceTitle.text, 'Transformation // Extra Point');
  const buttons = elements.choiceActions.children;
  assert.equal(buttons.length, 5);
  assert.match(buttons[0].text, /94 %/);
  assert.equal(buttons[0].classList.contains('conversion-pat'), true);
  assert.deepEqual(diagramCalls, [
    ['Power Run','run','middle'], ['Quick Slant','pass','middle'],
    ['Mesh Concept','pass','middle'], ['Play Action','pass','middle']
  ]);
  buttons[0].onclick();
  assert.equal(context.result[1], 'pat');
  for(let i = 1; i < buttons.length; i++){
    buttons[i].onclick();
    assert.equal(context.result[1], 'two');
    assert.equal(context.result[2].name, diagramCalls[i-1][0]);
    assert.equal(context.result[3].name, 'Cover 1');
  }
});

test('AI conversion shows the scoring logo and generic choices clear conversion styling', () => {
  const {context, elements} = createHarness();
  context.game.pendingConversion.team = 'ai';
  context.runConversion();
  assert.equal(elements.choiceTitle.children[0].alt, 'Beta');
  assert.equal(elements.choiceActions.children.length, 4);
  elements.choiceActions.children[1].onclick();
  assert.equal(context.result[0], 'ai');
  assert.equal(context.result[3].name, 'Cover 1');
  context.showChoice('Autre choix', '', [{label:'Continuer', onClick:() => {}}]);
  assert.equal(elements.choiceOverlay.classList.contains('conversion-choice'), false);
  assert.equal(elements.choiceActions.classList.contains('conversion-offense'), false);
  assert.equal(elements.choiceTitle.children.length, 0);
});
