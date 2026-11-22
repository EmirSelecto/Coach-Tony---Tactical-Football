const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(){
  const labels = [], strokes = [], gradients = [];
  let arc, line;
  const context = {
    setTransform(){}, clearRect(){}, save(){}, restore(){}, beginPath(){ arc = null; line = false; }, rect(){},
    clip(){}, fillRect(){}, moveTo(){}, lineTo(){ line = true; }, closePath(){},
    stroke(){ strokes.push({arc, line, color:this.strokeStyle, shadow:this.shadowColor, width:this.lineWidth, blur:this.shadowBlur}); },
    fill(){}, arc(x, y, radius){ arc = {x, y, radius}; },
    translate(){}, rotate(){}, strokeText(){}, drawImage(){},
    createLinearGradient:() => ({addColorStop(){}}),
    createRadialGradient(){
      const stops = [];
      gradients.push(stops);
      return {addColorStop(offset, color){ stops.push({offset, color}); }};
    },
    measureText:text => ({width:text.length * 5}),
    fillText(text, x, y){ labels.push({text, x, y, border:this.strokeStyle}); }
  };
  const children = [];
  const field = {
    appendChild(el){ children.push(el); el.remove = () => children.splice(children.indexOf(el), 1); },
    querySelectorAll(){ return [...children]; },
    getBoundingClientRect:() => ({left:0, top:0, width:800, height:400})
  };
  const canvas = {getContext:() => context};
  const markers = {style:{left:'50%'}};
  const document = {
    documentElement:{dataset:{}}, fonts:{ready:{then(){}}},
    createElement(){
      const el = {className:'', style:{}, dataset:{}};
      el.classList = {contains:name => el.className.split(' ').includes(name)};
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
    TeamArt:{getTeamLogoCanvas:() => ({}), getSpriteCanvas:() => ({})}
  };
  const sandbox = vm.createContext({
    window, document, game, PlayAnimationController:{_setup:null},
    ballState:{visible:false}, performance:{now:() => 0},
    fx:x => (x + 10) / 120 * 100, clamp:(x, min, max) => Math.max(min, Math.min(max, x)),
    coverageSchemeFor:() => 'zone',
    requestAnimationFrame:() => 1, setTimeout(){}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'animation', 'players.js'), 'utf8'), sandbox);
  return {sandbox, game, children, labels, strokes, gradients};
}

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
