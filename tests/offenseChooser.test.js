const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const document = {activeElement:null};
  class Element {
    constructor(){
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.className = '';
      this.textContent = '';
    }
    set innerHTML(value){ this.children = []; }
    appendChild(child){ this.children.push(child); return child; }
    append(...children){ children.forEach(child => this.appendChild(child)); }
    setAttribute(name, value){ this.attributes[name] = value; }
    addEventListener(name, callback){ if(name === 'click') this.onclick = callback; }
    click(){ this.onclick(); }
    focus(){ document.activeElement = this; }
    querySelectorAll(selector){
      const className = selector.slice(1);
      return this.children.flatMap(child => [
        ...(child.className.split(' ').includes(className) ? [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector){ return this.querySelectorAll(selector)[0] || null; }
  }
  document.createElement = () => new Element();
  document.createElementNS = () => new Element();
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
