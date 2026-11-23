const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const document = {activeElement:null};
  class Element {
    constructor(tagName = ''){
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.className = '';
      this.textContent = '';
      this.classList = {
        toggle:name => {
          const names = this.className.split(' ').filter(Boolean);
          const index = names.indexOf(name);
          if(index >= 0) names.splice(index, 1);
          else names.push(name);
          this.className = names.join(' ');
          return index < 0;
        },
        contains:name => this.className.split(' ').includes(name)
      };
    }
    set innerHTML(value){ this._innerHTML = value; this.children = []; }
    get innerHTML(){ return this._innerHTML || ''; }
    appendChild(child){ this.children.push(child); return child; }
    append(...children){ children.forEach(child => this.appendChild(child)); }
    setAttribute(name, value){ this.attributes[name] = value; }
    addEventListener(name, callback){ if(name === 'click') this.onclick = callback; }
    click(){ this.onclick(); }
    focus(){ document.activeElement = this; }
    querySelectorAll(selector){
      const className = selector.slice(1);
      return this.children.flatMap(child => [
        ...((selector.startsWith('.') ? child.className.split(' ').includes(className) : child.tagName === selector) ? [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector){ return this.querySelectorAll(selector)[0] || null; }
  }
  document.createElement = tag => new Element(tag);
  document.createElementNS = (namespace, tag) => new Element(tag);
  const navigation = new Element();
  document.getElementById = id => id === 'playbookNavigation' ? navigation : null;
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'json', 'ui.json'), 'utf8'));
  const playbook = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'json', 'playbook.json'), 'utf8'));
  const t = (key, values = {}) => {
    const text = key.split('.').slice(1).reduce((value, part) => value[part], ui);
    assert.equal(typeof text, 'string', key);
    return text.replace(/\{(\w+)\}/g, (_, name) => values[name]);
  };
  const context = vm.createContext({
    document, t,
    game:{down:1},
    playerAttemptPunt:() => { context.puntCalled = true; },
    playerAttemptFieldGoal:() => { context.fieldGoalCalled = true; },
    attemptFakeFieldGoal:() => { context.fakeCalled = true; },
    getFieldGoalSuccessChance:distance => distance === 42 ? 0.854 : 0,
    playLabel:name => playbook.offenseNames[name] || playbook.defenseNames[name],
    dirLabel:direction => playbook.directions[direction],
    offenseCardText:(name, play) => `Fiche ${name} ${play.direction}`,
    defenseCardText:name => `Fiche ${name}`,
    window:{PlayDiagrams:{forPlay:() => '<svg></svg>'}}
  });
  const save = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'services', 'save.js'), 'utf8');
  vm.runInContext(save.slice(save.indexOf('const OFFENSE_PLAYS ='), save.indexOf('const ALL_OFFENSE_VARIANTS')), context);
  vm.runInContext(save.slice(save.indexOf('const DEFENSE_PLAYS =')), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ui', 'interface.js'), 'utf8'), context);
  const plays = JSON.parse(vm.runInContext('JSON.stringify(OFFENSE_PLAYS)', context));
  return {context, document, navigation, chooser:new Element(), plays};
}

test('clock menu retains tempo and late-game actions without hiding the timeout', () => {
  const {context, document} = createHarness();
  document.getElementById = () => ({classList:{contains:() => true}});
  Object.assign(context.game, {quarter:2, clock:120, clockRunning:true, down:1, fieldPosition:50,
    playerTempo:'normal', timeouts:{player:3}});
  context.isHalfEndQuarter = quarter => quarter === 2;
  context.aiTempo = () => 'normal';
  context.tempoLabel = tempo => tempo;
  context.betweenSnapsRange = () => [17, 29];
  context.playerCallTimeout = () => {};
  context.playerSpike = () => {};
  context.playerKneel = () => {};
  context.setPlayerTempo = value => { context.selectedTempo = value; };

  const controls = context.buildClockControls(true);
  const toggle = controls.querySelector('.mobile-clock-toggle');
  const extra = controls.querySelector('.clock-extra-controls');
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.attributes['aria-controls'], extra.id);
  assert.equal(extra.querySelectorAll('button').length, 5);
  assert.equal(extra.querySelector('.timeout-control'), null);
  assert.ok(controls.querySelector('.timeout-control'));
  toggle.click();
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  assert.equal(controls.classList.contains('is-expanded'), true);
  extra.querySelectorAll('button')[0].click();
  assert.equal(context.selectedTempo, 'slow');
  toggle.click();
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.equal(controls.classList.contains('is-expanded'), false);

  const defenseControls = context.buildClockControls(false);
  assert.equal(defenseControls.querySelector('.mobile-clock-toggle').hidden, true);
});

test('fourth-down choices show the available field goal and punt before offensive categories', () => {
  const {context, chooser} = createHarness();
  context.renderOffenseButtons(chooser, () => assert.fail('A play was selected'), 42);
  let buttons = chooser.querySelectorAll('.choice-category');
  assert.deepEqual(buttons.map(button => button.children[1].textContent), ['JEU AU SOL', 'JEU DE PASSE']);

  chooser.innerHTML = '';
  context.game.down = 4;
  context.renderOffenseButtons(chooser, () => assert.fail('A play was selected'), 42);
  buttons = chooser.querySelectorAll('.choice-category');
  assert.deepEqual(buttons.map(button => button.children[1].textContent), ['FG', 'Punt', 'JEU AU SOL', 'JEU DE PASSE', 'Fake Field Goal (risqué)']);
  assert.equal(buttons[0].querySelector('.field-goal-detail').textContent, '85 % · 42 yd');
  assert.equal(buttons[0].attributes['aria-label'], 'Field Goal (42y, 85%)');
  buttons[0].click();
  assert.equal(context.fieldGoalCalled, true);
  buttons[1].click();
  assert.equal(context.puntCalled, true);
  buttons[4].click();
  assert.equal(context.fakeCalled, true);

  chooser.innerHTML = '';
  context.renderOffenseButtons(chooser, () => assert.fail('A play was selected'), null);
  buttons = chooser.querySelectorAll('.choice-category');
  assert.deepEqual(buttons.map(button => button.children[1].textContent), ['Punt', 'JEU AU SOL', 'JEU DE PASSE']);
});

test('field goal and fake are available together in the choices, never the toolbar', () => {
  for(const [distance, available] of [[42, true], [71, false]]){
    const {context, navigation, chooser, document} = createHarness();
    const toolbar = document.createElement('div');
    const panel = {querySelector:() => toolbar, classList:{toggle(){}}};
    const elements = {controlsPanel:panel, controlsBody:chooser, playbookNavigation:navigation, playPhaseLabel:{}};
    document.getElementById = id => elements[id] || null;
    context.window.resetCommentatorForChoice = () => {};
    context.ensureChoiceFormation = () => {};
    context.buildClockControls = () => document.createElement('div');
    context.buildContext = () => ({});
    context.computeKickDistance = () => distance;
    context.BALANCE = {fieldGoal:{availableMaxDistance:70}};
    context.playerCallOffense = () => {};
    context.attemptFakeFieldGoal = () => { context.fakeCalled = true; };
    Object.assign(context.game, {phase:'playing', possession:'player', down:4});
    context.renderControls();
    assert.equal(!!chooser.querySelector('.field-goal-detail'), available);
    assert.equal(toolbar.querySelector('.fourth-down-actions'), null);
    const buttons = chooser.querySelectorAll('.choice-category');
    assert.equal(buttons.some(button => button.dataset.category === 'fake-field-goal'), available);
    if(available){
      assert.equal(buttons[buttons.length - 1].dataset.category, 'fake-field-goal');
      buttons[buttons.length - 1].click();
      assert.equal(context.fakeCalled, true);
    }
  }
});

test('playbook renders both possessions without the removed offensive or defensive heading', () => {
  const {context, navigation, chooser} = createHarness();
  const toolbar = {querySelector:() => null, appendChild(){}};
  const panel = {querySelector:() => toolbar, classList:{toggle(){}}};
  const phaseLabel = {};
  const elements = {controlsPanel:panel, controlsBody:chooser, playbookNavigation:navigation, playPhaseLabel:phaseLabel};
  context.document.getElementById = id => elements[id] || null;
  context.window.resetCommentatorForChoice = () => {};
  context.ensureChoiceFormation = () => {};
  context.buildClockControls = () => ({});
  context.playerCallOffense = context.playerCallDefense = () => {};
  let shown;
  context.renderOffenseButtons = () => { shown = 'offense'; };
  context.renderDefenseButtons = () => { shown = 'defense'; };
  context.game.phase = 'playing';
  for(const [side, expected] of [['player','offense'], ['ai','defense']]){
    context.game.possession = side;
    context.renderControls();
    assert.equal(shown, expected);
  }
});

test('vertical wheel scrolls overflowing playbook rows without intercepting other gestures', () => {
  const {context} = createHarness();
  const row = {scrollWidth:500, clientWidth:200, scrollLeft:0};
  const wheel = (changes = {}) => {
    const event = {
      target:{closest:() => row}, cancelable:true, deltaX:0, deltaY:50, deltaMode:0,
      preventDefault(){ this.defaultPrevented = true; }, ...changes
    };
    context.scrollPlaybookWithWheel(event);
    return event.defaultPrevented === true;
  };
  assert.equal(wheel(), true);
  assert.equal(row.scrollLeft, 50);
  assert.equal(wheel({deltaY:-1, deltaMode:1}), true);
  assert.equal(row.scrollLeft, 34);
  assert.equal(wheel({deltaY:1, deltaMode:2}), true);
  assert.equal(row.scrollLeft, 234);
  assert.equal(wheel({deltaY:100}), true);
  assert.equal(row.scrollLeft, 300);
  assert.equal(wheel(), false);
  assert.equal(wheel({deltaY:-10, ctrlKey:true}), false);
  assert.equal(wheel({deltaY:-10, shiftKey:true}), false);
  assert.equal(wheel({deltaY:-10, deltaX:10}), false);
  assert.equal(row.scrollLeft, 300);
  row.scrollWidth = row.clientWidth;
  assert.equal(wheel({deltaY:-10}), false);
});

test('play selection shows strengths and weaknesses before direction-specific choices', () => {
  const {context, chooser} = createHarness();
  context.offenseCardText = (name, play) =>
    `+ ${name}\n− ${name === 'QB Keeper' && play.direction === 'middle' ? 'centre' : 'extérieur'}`;
  context.renderOffenseCategory(chooser, 'run', () => assert.fail('A play was selected'));
  const button = chooser.querySelectorAll('.play-btn').find(item => item.dataset.playName === 'QB Keeper');
  assert.match(button.title, /\+ QB Keeper/);
  assert.match(button.title, /− extérieur \(selon la direction\)/);
  assert.doesNotMatch(button.title, /Choisir une direction/);
  button.click();
  const choices = chooser.querySelectorAll('.play-btn');
  assert.match(choices[1].title, /− centre/);
  assert.doesNotMatch(choices[1].title, /selon la direction/);
});

test('every offensive play offers exactly its available directions before selecting a variant', () => {
  const {context, chooser, plays} = createHarness();
  for(const type of ['run', 'pass']){
    const category = plays.filter(play => play.type === type);
    for(const play of category){
      let selected;
      context.renderOffenseCategory(chooser, type, value => { selected = JSON.parse(JSON.stringify(value)); });
      const buttons = chooser.querySelectorAll('.play-btn');
      assert.equal(buttons.length, category.length);
      const button = buttons.find(item => item.dataset.playName === play.name);
      assert.equal(button.querySelector('.pb-name').textContent, play.name);
      button.click();
      if(play.directions.length > 1){
        assert.equal(selected, undefined, play.name);
        const choices = chooser.querySelectorAll('.play-btn');
        assert.equal(choices.length, play.directions.length, play.name);
        for(let i = 0; i < play.directions.length; i++){
          choices[i].click();
          assert.deepEqual(selected, {name:play.name, type, depth:play.depth, direction:play.directions[i]});
        }
      }else{
        assert.deepEqual(selected, {name:play.name, type, depth:play.depth, direction:play.directions[0]});
      }
    }
  }
});

test('returning from the direction chooser restores focus to the selected play', () => {
  const {context, document, navigation, chooser} = createHarness();
  context.renderOffenseCategory(chooser, 'pass', () => assert.fail('A play was selected'));
  chooser.querySelectorAll('.play-btn').find(button => button.dataset.playName === 'Screen Pass').click();
  assert.match(navigation.querySelector('.chooser-heading').children[1].textContent, /Screen Pass/);
  assert.equal(document.activeElement, chooser.querySelector('.play-btn'));
  navigation.querySelector('.chooser-back').click();
  assert.equal(document.activeElement.dataset.playName, 'Screen Pass');
  assert.equal(chooser.querySelectorAll('.play-btn').length, 10);
});

test('direction cards retain the SVG and pass each selected direction to the diagram renderer', () => {
  const {context, chooser} = createHarness();
  const calls = [];
  context.window.PlayDiagrams.forPlay = (name, type, direction) => {
    calls.push({name, type, direction});
    return '<svg viewBox="0 0 120 72"></svg>';
  };
  context.renderOffenseCategory(chooser, 'pass', () => assert.fail('A play was selected'));
  calls.length = 0;
  chooser.querySelectorAll('.play-btn').find(button => button.dataset.playName === 'Screen Pass').click();
  assert.deepEqual(calls.map(call => call.direction), ['left', 'middle', 'right']);
  chooser.querySelectorAll('.play-btn').forEach(button => {
    const diagram = button.querySelector('.pb-diagram');
    assert.match(diagram.innerHTML, /<svg/);
    assert.ok(diagram.querySelector('.direction-caption'));
  });
});

test('defensive cards retain their category and selected play', () => {
  const {context, chooser} = createHarness();
  for(const [category, expectedName] of [
    ['pressure', 'Nickel Blitz'], ['coverage', 'Cover 3'], ['run', 'Edge Contain']
  ]){
    let selected;
    context.renderDefenseCategory(chooser, category, play => { selected = play; });
    const buttons = chooser.querySelectorAll('.play-btn');
    assert.ok(buttons.length > 0);
    assert.ok(buttons.every(button => button.dataset.defenseCategory === category));
    buttons.find(button => button.querySelector('.pb-name').textContent === expectedName).click();
    assert.equal(selected.name, expectedName);
  }
});

test('defensive categories are ordered run defense, coverage, then pressure', () => {
  const {context, chooser} = createHarness();
  context.renderDefenseButtons(chooser, () => {});
  assert.deepEqual(chooser.querySelectorAll('.choice-category').map(button => button.dataset.category),
    ['run-defense', 'coverage', 'pressure']);
});
