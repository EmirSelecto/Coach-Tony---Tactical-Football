function clearTempPlayers(){
  const field = document.getElementById('field');
  if(!field) return;
  field.querySelectorAll('.temp-player').forEach(el => el.remove());
}
function placeEl(el, leftPct, topPct){
  el.style.transition = 'none';
  el.style.left = fx(leftPct) + '%';
  el.style.top = topPct + '%';
  void el.offsetWidth; // force reflow avant la prochaine transition
}
function makeDot(cls, label){
  const el = document.createElement('div');
  el.className = 'player-dot temp-player ' + cls;
  if(label) el.textContent = label;
  return el;
}

/* =========================================================================
   FORMATIONS — positionnement pré-snap des 11 joueurs offensifs puis des
   11 joueurs défensifs, déterminé par le play (et non aléatoire). Purement
   visuel : n'influence jamais le résultat, déjà résolu par le moteur.
   ========================================================================= */
const OFFENSE_FORMATION_CATEGORY = {
  'Inside Zone':'iform', 'Power Run':'iform', 'Dive':'iform', 'QB Sneak':'iform',
  'Outside Zone':'outsideZone', 'Sweep':'iform', 'Toss':'toss', 'Counter Run':'counter',
  'QB Keeper':'outside', 'Read Option':'outside',
  'Quick Slant':'shotgun', 'Screen Pass':'shotgun', 'Hitch / Curl':'shotgun', 'Out Route':'shotgun',
  'Crossing Route':'shotgun', 'Mesh Concept':'shotgun', 'Flood Concept':'shotgun',
  'Deep Post':'shotgun', 'Four Verticals':'shotgun',
  'Play Action':'playaction'
};
const DEFENSE_FORMATION_CATEGORY = {
  'Eight-Man Box':'box', 'Bear Front':'box', 'Inside Run Blitz':'box', 'Goal-Line Defense':'box',
  'Edge Contain':'edge', 'Outside Run Stop':'edge',
  'Press Coverage':'nickelShort', 'Cover 1':'nickelShort', 'Nickel Blitz':'nickelShort',
  'Cover 3':'deepShell', 'Cover 4':'deepShell', 'Dime Defense':'deepShell', 'Prevent Defense':'deepShell',
  'Base 4-3':'balanced', 'Base 3-4':'balanced'
};

// dx = décalage en yards par rapport à la ligne de scrimmage (sera multiplié par
// le sens d'attaque) ; y = position latérale 0-100 sur le terrain.
function genOffenseFormation(category, direction){
  // dx=-1.5 : la ligne offensive se tient clairement en retrait de la ligne de
  // scrimmage (côté attaque), pour ne jamais se superposer à la ligne défensive.
  const OL = [34,42,50,58,66].map(y => ({dx:-1.5, y, role:'OL'}));
  if(category === 'iform' || category === 'playaction'){
    return [...OL,
      {dx:-3.5, y:50, role:'QB', qb:true},
      {dx:-6,   y:50, role:'FB'},
      {dx:-8.5, y:50, role:'RB'},
      {dx:-1.5, y:74, role:'TE'},
      {dx:-1.5, y:6,  role:'WR'},
      {dx:-1.5, y:94, role:'WR'}
    ];
  }
  const selectedSide = direction === 'right' ? 64 : 36;
  if(category === 'counter'){
    return [...OL,
      {dx:-3.5, y:50, role:'QB', qb:true},
      {dx:-6, y:50, role:'FB'},
      {dx:-8.5, y:selectedSide, role:'RB'},
      {dx:-1.5, y:74, role:'TE'},
      {dx:-1.5, y:6, role:'WR'},
      {dx:-1.5, y:94, role:'WR'}
    ];
  }
  if(category === 'outsideZone' || category === 'toss'){
    return [...OL,
      {dx:-3.5, y:50, role:'QB', qb:true},
      {dx:-7, y:category === 'outsideZone' ? (direction === 'right' ? 36 : 64) : selectedSide, role:'RB'},
      {dx:-1.5, y:76, role:'TE'},
      {dx:-1.5, y:4,  role:'WR'},
      {dx:-1.5, y:28, role:'WR'},
      {dx:-1.5, y:96, role:'WR'}
    ];
  }
  // shotgun (pass)
  return [...OL,
    {dx:-6, y:50, role:'QB', qb:true},
    {dx:-6, y:62, role:'RB'},
    {dx:-1.5, y:4,  role:'WR'},
    {dx:-1.5, y:20, role:'WR'},
    {dx:-1.5, y:80, role:'WR'},
    {dx:-1.5, y:96, role:'WR'}
  ];
}
function genDefenseFormation(category){
  // dx=2.5 : la ligne défensive fait face à la ligne offensive avec un écart net
  // (environ 4 yards visibles entre les deux lignes), jamais superposée.
  const DL4 = [36,45,55,64].map(y => ({dx:2.5, y, role:'DL'}));
  if(category === 'box'){
    return [...DL4,
      {dx:5.5, y:33, role:'LB'}, {dx:5.5, y:50, role:'LB'}, {dx:5.5, y:67, role:'LB'},
      {dx:7.5, y:50, role:'S'},
      {dx:7.5, y:75, role:'S'},
      {dx:3.5, y:8,  role:'CB'}, {dx:3.5, y:92, role:'CB'}
    ];
  }
  if(category === 'edge'){
    return [...DL4,
      {dx:6,  y:28, role:'LB'}, {dx:6, y:50, role:'LB'}, {dx:6, y:72, role:'LB'},
      {dx:4,  y:4,  role:'CB'}, {dx:4, y:96, role:'CB'},
      {dx:12, y:33, role:'S'},  {dx:12,y:67, role:'S'}
    ];
  }
  if(category === 'nickelShort'){
    return [...DL4,
      {dx:6, y:43, role:'LB'}, {dx:6, y:57, role:'LB'},
      {dx:3.5, y:8, role:'CB'}, {dx:3.5, y:50, role:'CB'}, {dx:3.5, y:92, role:'CB'},
      {dx:11, y:33, role:'S'}, {dx:11, y:67, role:'S'}
    ];
  }
  if(category === 'deepShell'){
    return [
      {dx:2.5, y:40, role:'DL'}, {dx:2.5, y:50, role:'DL'}, {dx:2.5, y:60, role:'DL'},
      {dx:6,   y:40, role:'LB'}, {dx:6,   y:60, role:'LB'},
      {dx:4,   y:4,  role:'CB'}, {dx:4,   y:96, role:'CB'},
      {dx:16,y:16, role:'S'}, {dx:16,y:38, role:'S'}, {dx:16,y:62, role:'S'}, {dx:16,y:84, role:'S'}
    ];
  }
  // balanced (Base 4-3 / 3-4)
  return [...DL4,
    {dx:6, y:33, role:'LB'}, {dx:6, y:50, role:'LB'}, {dx:6, y:67, role:'LB'},
    {dx:4, y:8,  role:'CB'}, {dx:4, y:92, role:'CB'},
    {dx:11,y:33, role:'S'},  {dx:11,y:67, role:'S'}
  ];
}

// Mémoire des joueurs actuellement affichés sur le terrain (éléments DOM + rôle +
// position de formation). Alimentée par renderFormation, consommée par le
// PlayAnimationController : ce sont RÉELLEMENT ces mêmes 22 joueurs qui
// deviennent les acteurs de l'animation, aucun ne disparaît avant l'action.
let formationDots = { offense: [], defense: [] };

function matchManCoverage(defenders, receivers){
  const assignDefenders = defenders.length <= receivers.length;
  const assigned = assignDefenders ? defenders : receivers;
  const candidates = assignDefenders ? receivers : defenders;
  let bestCost = Infinity;
  let bestPairs = [];
  const search = (index, used, cost, pairs) => {
    if(index === assigned.length){
      if(cost < bestCost){
        bestCost = cost;
        bestPairs = pairs.slice();
      }
      return;
    }
    for(let i=0;i<candidates.length;i++){
      if(used.has(i)) continue;
      const defender = assignDefenders ? assigned[index] : candidates[i];
      const receiver = assignDefenders ? candidates[i] : assigned[index];
      used.add(i);
      pairs.push([defender, receiver]);
      search(index + 1, used, cost + Math.abs(defender.y - receiver.y), pairs);
      pairs.pop();
      used.delete(i);
    }
  };
  search(0, new Set(), 0, []);
  const matches = new Map();
  bestPairs.forEach(([defender, receiver]) => matches.set(defender, receiver));
  return matches;
}

function renderFormation(offPlay, defPlay, preSnapSpot, offenseSide){
  const field = document.getElementById('field');
  if(!field) return;
  clearTempPlayers();
  const offenseDir = offenseSide === 'player' ? 1 : -1;

  const offCategory = OFFENSE_FORMATION_CATEGORY[offPlay.name] || 'iform';
  const offList = [];
  genOffenseFormation(offCategory, offPlay.direction).forEach(p => {
    const dot = makeDot('offense mini' + (p.qb ? ' qb' : ''), p.qb ? 'QB' : '');
    field.appendChild(dot);
    const formX = clamp(preSnapSpot + p.dx*offenseDir, -9, 109);
    placeEl(dot, formX, p.y);
    offList.push({el: dot, role: p.qb ? 'QB' : p.role, y: p.y, formX});
  });
  formationDots.offense = offList;

  if(defPlay){
    const defCategory = DEFENSE_FORMATION_CATEGORY[defPlay.name] || 'balanced';
    const defList = [];
    const defenseFormation = genDefenseFormation(defCategory);
    if(offPlay.type === 'pass' && coverageSchemeFor(defPlay) === 'man'){
      const receivers = offList.filter(actor => actor.role === 'WR' || actor.role === 'TE');
      const defenders = defenseFormation.filter(actor => actor.role === 'CB' || actor.role === 'S');
      matchManCoverage(defenders, receivers).forEach((receiver, defender) => {
        defender.y = receiver.y;
      });
    }
    defenseFormation.forEach(p => {
      const dot = makeDot('defense mini', '');
      field.appendChild(dot);
      const formX = clamp(preSnapSpot + p.dx*offenseDir, -9, 109);
      placeEl(dot, formX, p.y);
      defList.push({el: dot, role: p.role, y: p.y, formX});
    });
    formationDots.defense = defList;
  } else {
    formationDots.defense = [];
  }
}

function beginPreSnap(offPlay, defPlay, isPlayerOffense, resolveFn){
  const preSnapSpot = game.fieldPosition;
  const offenseSide = isPlayerOffense ? 'player' : 'ai';
  const totalDelay = preSnapDelayMs();
  setPlayPhase(t(isPlayerOffense ? 'animation.phaseLabels.offenseFormation' : 'animation.phaseLabels.aiOffenseFormation'));
  renderFormation(offPlay, null, preSnapSpot, offenseSide);
  scheduleForGame(() => {
    setPlayPhase(t('animation.phaseLabels.defenseFormation'));
    renderFormation(offPlay, defPlay, preSnapSpot, offenseSide);
  }, Math.round(totalDelay * 0.45));
  scheduleForGame(resolveFn, totalDelay);
}
