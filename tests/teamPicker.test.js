const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const teams = [
    {id:1, name:'Alpha', ratings:{offense:80, defense:60, overall:70}},
    {id:2, name:'Beta', ratings:{offense:70, defense:90, overall:80}},
    {id:3, name:'Gamma', ratings:{offense:95, defense:70, overall:83}}
  ];
  const document = {activeElement:null};
  const list = {
    set innerHTML(html){
      this.html = html;
      this.buttons = [...html.matchAll(/<button class="mini-btn[^"]*" data-side="([^"]+)" data-id="([^"]+)"[^>]*aria-pressed="([^"]+)"/g)]
        .map(([,side,id,pressed]) => ({
          dataset:{side,id}, pressed, focus(){ document.activeElement = this; }
        }));
    },
    querySelectorAll(){ return this.buttons; },
    querySelector(selector){
      const match = selector.match(/data-side="([^"]+)"\]\[data-id="([^"]+)"/);
      return this.buttons.find(button => button.dataset.side === match[1] && button.dataset.id === match[2]);
    }
  };
  const sort = {value:'overall'};
  const body = {};
  document.getElementById = id => ({teamPickerList:list, teamSortSelect:sort, pregameBody:body})[id];
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'json', 'ui.json'), 'utf8'));
  const context = vm.createContext({
    document, TEAM_DB:teams, TEXTS:{ui},
    game:{phase:'pregame', teams:{player:teams[0], ai:teams[1]}},
    window:{TeamArt:{getTeamLogoCanvas:name => ({toDataURL:() => `data:${name}`})}},
    t:key => key, teamProfileLabel:() => 'profile',
    makeTeam:id => teams.find(team => team.id === id),
    applyTeamColorsToCSS:() => {}, applyTeamNamesToUI:() => {}, render:() => {}
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'game', 'engine.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function selectTeam('), source.indexOf('function buildContext(')), context);
  return {context, list, sort, body, document};
}

test('team picker sorts teams and renders logos and selected states', () => {
  const {context, list, sort, body} = createHarness();
  for(const [key, order] of Object.entries({name:['1','2','3'], overall:['3','2','1'], offense:['3','1','2'], defense:['2','3','1']})){
    sort.value = key;
    context.renderTeamPicker();
    assert.deepEqual(list.buttons.filter(button => button.dataset.side === 'player').map(button => button.dataset.id), order);
  }
  assert.equal((list.html.match(/class="team-picker-logo"/g) || []).length, 3);
  assert.equal(list.buttons.filter(button => button.pressed === 'true').length, 2);
  context.renderPregameBody();
  assert.match(body.innerHTML, /data:Alpha/);
  assert.match(body.innerHTML, /data:Beta/);
  assert.match(body.innerHTML, /matchup-vs">VS/);
});

test('selecting the opponent swaps teams and restores focus on the selected button', () => {
  const {context, list, document} = createHarness();
  context.renderTeamPicker();
  list.buttons.find(button => button.dataset.side === 'player' && button.dataset.id === '2').onclick();
  assert.equal(context.game.teams.player.id, 2);
  assert.equal(context.game.teams.ai.id, 1);
  assert.equal(document.activeElement.dataset.id, '2');
  assert.equal(document.activeElement.pressed, 'true');
  assert.match(list.html, /is-player/);
  assert.match(list.html, /is-ai/);
});
