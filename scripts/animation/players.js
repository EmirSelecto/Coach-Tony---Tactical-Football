function clearTempPlayers(){
  const field = document.getElementById('field');
  if(!field) return;
  field.querySelectorAll('.temp-player').forEach(el => el.remove());
  choiceFormationKey = null;
  if(typeof refreshTacticalCanvas === 'function') refreshTacticalCanvas();
}
function placeEl(el, leftPct, topPct){
  el.style.transition = 'none';
  el.style.left = fx(leftPct) + '%';
  el.style.top = topPct + '%';
  void el.offsetWidth; // force reflow avant la prochaine transition
}
function makeDot(cls, label, teamSide){
  const el = document.createElement('div');
  el.className = 'player-dot temp-player team-' + teamSide + ' ' + cls;
  if(teamSide === 'ai' && document.documentElement.dataset.aiUniform === 'white'){
    el.classList.add('alternate-uniform');
  }
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
  'QB Keeper':'outside', 'Read Option':'readOption',
  'Quick Slant':'shotgun', 'Screen Pass':'screen', 'Hitch / Curl':'shotgun', 'Out Route':'shotgun',
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
  if(category === 'readOption'){
    return [...OL,
      {dx:-3.5, y:50, role:'QB', qb:true},
      {dx:-6, y:50, role:'RB'},
      {dx:-1.5, y:76, role:'TE'},
      {dx:-1.5, y:4,  role:'WR'},
      {dx:-1.5, y:28, role:'WR'},
      {dx:-1.5, y:96, role:'WR'}
    ];
  }
  if(category === 'screen'){
    const right = direction === 'right';
    const receiverLanes = right ? [62, 80, 96, 4] : [38, 20, 4, 96];
    return [...OL,
      {dx:-6, y:50, role:'QB', qb:true},
      {dx:-8.5, y:right ? 62 : 38, role:'RB'},
      ...receiverLanes.map(y => ({dx:-1.5, y, role:'WR'}))
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
let choiceFormationKey = null;
let tacticalCanvasFrame = 0;
const ENDZONE_WIDTH_RATIO = 1 / 11.6;

function playerPalette(color){
  if(!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Couleur de joueur invalide : "${color}".`);
  const channels = [1,3,5].map(index => parseInt(color.slice(index, index + 2), 16));
  const scale = Math.max(1, 220 / (Math.max(...channels) || 1));
  const rgb = values => `rgb(${values.map(value => Math.round(value)).join(',')})`;
  return {
    primary:color,
    glow:rgb(channels.map(value => Math.min(255, value * scale)))
  };
}

function refreshTacticalCanvas(){
  if(tacticalCanvasFrame) return;
  tacticalCanvasFrame = requestAnimationFrame(() => {
    tacticalCanvasFrame = 0;
    renderTacticalCanvas();
  });
}

function renderTacticalCanvas(){
  const field = document.getElementById('field');
  const canvas = document.getElementById('tacticalCanvas');
  if(!field || !canvas || !window.TeamArt) return;
  const bounds = field.getBoundingClientRect();
  if(!bounds.width || !bounds.height) return;

  const pixelRatio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(bounds.width * pixelRatio);
  const pixelHeight = Math.round(bounds.height * pixelRatio);
  if(canvas.width !== pixelWidth || canvas.height !== pixelHeight){
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if(!context) throw new Error('Impossible de dessiner le canvas tactique.');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const width = bounds.width, height = bounds.height;
  const endzoneWidth = width * ENDZONE_WIDTH_RATIO;
  const teams = game && game.teams;
  const playerTeam = teams && teams.player;
  const aiTeam = teams && teams.ai;
  const palettes = {
    player:playerPalette(playerTeam ? playerTeam.color : '#54DCFF'),
    ai:playerPalette(aiTeam ? aiTeam.color : '#54DCFF')
  };
  const paletteForActor = actor =>
    palettes[(actor.element || actor.el).classList.contains('team-player') ? 'player' : 'ai'];
  const drawEndzone = (x, team, onLeft) => {
    if(!team) return;
    const centerX = x + endzoneWidth / 2;
    const inward = onLeft ? 1 : -1;
    const mascotTextCenterX = centerX + inward * endzoneWidth * 0.17;
    const cityTextCenterX = centerX - inward * endzoneWidth * 0.14;
    const logoCenterY = height * 0.18;
    const nameParts = team.name.toUpperCase().split(/\s+/);
    const city = team.name === 'Aurora Northern Lights' ? nameParts[0] : nameParts.slice(0, -1).join(' ');
    const mascot = team.name === 'Aurora Northern Lights' ? nameParts.slice(1).join(' ') : nameParts[nameParts.length - 1];
    const rgb = team.color.match(/^#([0-9a-f]{6})$/i);
    if(!rgb) throw new Error(`Couleur d’équipe invalide pour l’end zone : "${team.color}".`);
    const hex = rgb[1];
    const darkColor = `#${[0,2,4].map(index =>
      Math.round(parseInt(hex.slice(index, index + 2), 16) * 0.48).toString(16).padStart(2, '0')
    ).join('')}`;
    const background = context.createLinearGradient(x, 0, x, height);
    background.addColorStop(0, team.color);
    background.addColorStop(1, darkColor);
    const frameInsetX = 3;
    const frameInsetY = height * 0.025;
    const frameLineWidth = 3;
    const goalLineX = onLeft ? x + endzoneWidth : x;
    const outerFrameX = onLeft ? x + frameInsetX : x + endzoneWidth - frameInsetX;
    const frameLeft = Math.min(goalLineX, outerFrameX);
    const frameRight = Math.max(goalLineX, outerFrameX);
    const pylonGap = Math.max(6, frameLineWidth * 2);
    context.save();
    context.beginPath();
    context.rect(
      frameLeft + frameLineWidth / 2,
      frameInsetY + frameLineWidth / 2,
      frameRight - frameLeft - frameLineWidth,
      height - (frameInsetY + frameLineWidth / 2) * 2
    );
    context.clip();
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 0.88;
    context.fillStyle = background;
    context.fillRect(x, 0, endzoneWidth, height);

    context.globalAlpha = 0.14;
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 1;
    context.beginPath();
    for(let offset = -height; offset < endzoneWidth + height; offset += 14){
      context.moveTo(x + offset, 0);
      context.lineTo(x + offset + height, height);
    }
    context.stroke();
    context.restore();

    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = frameLineWidth;
    const topY = frameInsetY, bottomY = height - frameInsetY;
    context.beginPath();
    if(goalLineX - pylonGap > frameLeft){
      context.moveTo(frameLeft, topY);
      context.lineTo(goalLineX - pylonGap, topY);
      context.moveTo(frameLeft, bottomY);
      context.lineTo(goalLineX - pylonGap, bottomY);
    }
    if(goalLineX + pylonGap < frameRight){
      context.moveTo(goalLineX + pylonGap, topY);
      context.lineTo(frameRight, topY);
      context.moveTo(goalLineX + pylonGap, bottomY);
      context.lineTo(frameRight, bottomY);
    }
    context.moveTo(frameLeft, topY);
    context.lineTo(frameLeft, bottomY);
    context.moveTo(goalLineX, topY + pylonGap);
    context.lineTo(goalLineX, bottomY - pylonGap);
    context.stroke();
    context.restore();

    const logo = window.TeamArt.getTeamLogoCanvas(team.name);
    const logoSize = endzoneWidth * 1.15;
    context.save();
    context.globalAlpha = 0.96;
    context.shadowColor = '#FFFFFF';
    context.shadowBlur = 10;
    context.drawImage(logo, centerX - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
    context.restore();

    const lowerTextStart = Math.max(height * 0.32, logoCenterY + logoSize / 2 + height * 0.018);
    const lowerTextEnd = height - frameInsetY - height * 0.025;
    const textAngle = onLeft ? -Math.PI / 2 : Math.PI / 2;
    let mascotFontSize = Math.min(endzoneWidth * 0.52, height * 0.16);
    context.font = `italic 900 ${mascotFontSize}px "Chakra Petch", Impact, sans-serif`;
    let mascotWidth = context.measureText(mascot).width;
    const availableTextLength = Math.min((lowerTextEnd - lowerTextStart) * 0.9, height * 0.58);
    if(mascotWidth > availableTextLength){
      mascotFontSize *= availableTextLength / mascotWidth;
      context.font = `italic 900 ${mascotFontSize}px "Chakra Petch", Impact, sans-serif`;
      mascotWidth = context.measureText(mascot).width;
    }
    let cityFontSize = Math.min(endzoneWidth * 0.13, height * 0.025);
    context.font = `italic 900 ${cityFontSize}px "Chakra Petch", Impact, sans-serif`;
    let cityWidth = context.measureText(city).width;
    const cityMaxLength = mascotWidth * 0.9;
    if(cityWidth > cityMaxLength){
      cityFontSize *= cityMaxLength / cityWidth;
      context.font = `italic 900 ${cityFontSize}px "Chakra Petch", Impact, sans-serif`;
      cityWidth = context.measureText(city).width;
    }
    context.font = `italic 900 ${mascotFontSize}px "Chakra Petch", Impact, sans-serif`;
    const drawVerticalLabel = (label, fontSize, centerY, maxLength, textCenterX) => {
      context.save();
      context.translate(textCenterX, centerY);
      context.rotate(textAngle);
      context.font = `italic 900 ${fontSize}px "Chakra Petch", Impact, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = fontSize > 12 ? 8 : Math.max(2, fontSize * 0.24);
      context.strokeStyle = '#090D16';
      context.strokeText(label, 0, 0, maxLength);
      context.lineWidth = fontSize > 12 ? 4 : Math.max(1, fontSize * 0.12);
      context.strokeStyle = team.secondaryColor || '#090D16';
      context.strokeText(label, 0, 0, maxLength);
      context.fillStyle = '#FFFFFF';
      context.fillText(label, 0, 0, maxLength);
      context.restore();
    };
    const mascotCenter = (lowerTextStart + lowerTextEnd) / 2;
    const cityCenter = mascotCenter + inward * (mascotWidth - cityWidth) / 2 + (onLeft ? -3 : 3);
    drawVerticalLabel(city, cityFontSize, cityCenter, cityWidth, cityTextCenterX);
    drawVerticalLabel(mascot, mascotFontSize, mascotCenter, mascotWidth, mascotTextCenterX);
  };
  drawEndzone(0, playerTeam, true);
  drawEndzone(width - endzoneWidth, aiTeam, false);

  const firstDown = document.getElementById('firstDownMarker');
  const scrimmage = document.getElementById('scrimmageLine');
  const drawLine = (element, color, glow) => {
    if(!element || !element.style.left) return;
    const x = parseFloat(element.style.left) / 100 * width;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, width * 0.0022);
    context.shadowColor = glow;
    context.shadowBlur = width * 0.012;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.restore();
  };
  drawLine(firstDown, '#FFD45E', 'rgba(255,195,52,0.9)');
  drawLine(scrimmage, '#6DE4FF', 'rgba(44,211,255,0.95)');

  const setup = typeof PlayAnimationController !== 'undefined' && PlayAnimationController._setup;
  const actors = setup && Array.isArray(setup.actors)
    ? setup.actors
    : [...formationDots.offense, ...formationDots.defense].map((actor, index) => ({
      id:`formation-${index}`,
      role:actor.role,
      x:actor.formX,
      y:actor.y,
      element:actor.el
    }));
  const activeCarrierId = typeof ballState !== 'undefined' && ballState.visible
    ? ballState.carrierId
    : null;
  if(setup && Number.isFinite(setup.frameProgress)){
    const progress = setup.frameProgress;
    const isRouteActor = actor => actor.team === 'offense'
      ? ['QB', 'RB', 'FB', 'WR', 'TE'].includes(actor.role)
      : ['CB', 'S', 'LB'].includes(actor.role);
    setup.actors.filter(actor => actor.path && actor.path.length > 1 && isRouteActor(actor))
      .forEach(actor => {
        const route = actor.path.filter(point => point.t <= progress);
        const position = {x:actor.x, y:actor.y};
        if(!route.length) route.push(actor.path[0]);
        const last = route[route.length - 1];
        if(Math.hypot(last.x - position.x, last.y - position.y) > 0.05) route.push(position);
        if(route.length < 2) return;
        const palette = paletteForActor(actor);
        context.save();
        context.strokeStyle = palette.primary;
        context.fillStyle = palette.primary;
        context.lineWidth = Math.max(1.5, width * 0.0024);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.shadowColor = palette.glow;
        context.shadowBlur = width * 0.012;
        context.beginPath();
        route.forEach((point, index) => {
          const x = fx(point.x) / 100 * width, y = point.y / 100 * height;
          if(index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        const end = route[route.length - 1], before = route[route.length - 2];
        const endX = fx(end.x) / 100 * width, endY = end.y / 100 * height;
        const angle = Math.atan2((end.y - before.y) * height / 100, (fx(end.x) - fx(before.x)) * width / 100);
        const arrowSize = Math.max(5, width * 0.008);
        context.beginPath();
        context.moveTo(endX, endY);
        context.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
        context.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
        context.closePath();
        context.fill();
        context.restore();
      });
  }

  const now = performance.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 230);
  actors.forEach(actor => {
    const element = actor.element || actor.el;
    if(!element || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)) return;
    const palette = paletteForActor(actor);
    const radius = Math.max(3, Math.min(20, width * 0.015, height * 0.035));
    const x = fx(actor.x) / 100 * width, y = actor.y / 100 * height;
    const isQuarterback = actor.role === 'QB';
    const isCarrier = actor.id === activeCarrierId || element.classList.contains('carrier');
    if(element.classList.contains('breakaway')){
      const direction = element.dataset.direction === 'left' ? -1 : 1;
      context.save();
      context.strokeStyle = palette.primary;
      context.lineWidth = Math.max(1.5, radius * 0.18);
      context.lineCap = 'round';
      context.shadowColor = palette.glow;
      context.shadowBlur = radius * 0.8;
      for(let trail=0;trail<3;trail++){
        const trailY = y + (trail - 1) * radius * 0.45;
        context.globalAlpha = 0.8 - trail * 0.16;
        context.beginPath();
        context.moveTo(x - direction * radius * (0.5 + trail * 0.15), trailY);
        context.lineTo(x - direction * radius * (1.4 + trail * 0.15), trailY);
        context.stroke();
      }
      context.restore();
    }
    if(isCarrier || isQuarterback){
      context.save();
      context.strokeStyle = '#FFD56A';
      context.lineWidth = Math.max(2, radius * 0.14);
      context.shadowColor = '#FFB938';
      context.shadowBlur = 12 + pulse * 8;
      context.globalAlpha = 0.68 + pulse * 0.32;
      context.beginPath();
      context.arc(x, y, radius + 4 + pulse * 3, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.save();
    const gradient = context.createRadialGradient(x - radius * 0.3, y - radius * 0.36, radius * 0.12, x, y, radius);
    gradient.addColorStop(0, '#24334C');
    gradient.addColorStop(1, '#0F172A');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = palette.primary;
    context.lineWidth = Math.min(3, Math.max(1, radius * 0.3));
    context.shadowColor = palette.glow;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(x, y, radius - context.lineWidth / 2, 0, Math.PI * 2);
    context.stroke();
    const number = actor.id.match(/\d+$/);
    const label = isQuarterback ? 'QB' : isCarrier ? actor.role : actor.role || (number ? number[0] : '');
    context.shadowBlur = 0;
    context.fillStyle = '#FFFFFF';
    context.font = `700 ${Math.max(5, radius * (label.length > 2 ? 0.78 : 0.94))}px "Chakra Petch", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, x, y + 0.5, radius * 1.72);
    context.restore();
  });

  const football = window.TeamArt.getSpriteCanvas('football');
  if(typeof ballState !== 'undefined' && ballState.visible && setup){
    const ballX = fx(ballState.x) / 100 * width, ballY = ballState.y / 100 * height;
    context.drawImage(football, ballX - 8, ballY - 4, 16, 8);
  } else if(teams && game){
    const ballX = Number.isFinite(game.visualBallX) ? game.visualBallX : 50;
    context.save();
    context.shadowColor = 'rgba(255,215,112,0.85)';
    context.shadowBlur = width * 0.008;
    context.drawImage(football, fx(ballX) / 100 * width - 8, height / 2 - 4, 16, 8);
    context.restore();
  }
  if(window.renderAnimeVFX(bounds, now)) refreshTacticalCanvas();
  if(!setup && game && game.playLocked && formationDots.offense.length){
    setTimeout(refreshTacticalCanvas, 80);
  }
}
window.addEventListener('resize', refreshTacticalCanvas);
document.fonts.ready.then(refreshTacticalCanvas);

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

function selectManCoverageDefenders(defenders, offPlay, defPlay, receiverCount){
  const selected = defenders.filter(actor => actor.role === 'CB' || actor.role === 'S');
  if(selected.length >= receiverCount) return selected;

  const blitzers = selectBlitzers(defPlay, offPlay, defenders);
  defenders.filter(actor => actor.role === 'LB' && !blitzers.has(actor.id))
    .slice(0, receiverCount - selected.length)
    .forEach(actor => selected.push(actor));
  return selected;
}

function renderFormation(offPlay, defPlay, preSnapSpot, offenseSide){
  const field = document.getElementById('field');
  if(!field) return;
  clearTempPlayers();
  const offenseDir = offenseSide === 'player' ? 1 : -1;
  const defenseSide = offenseSide === 'player' ? 'ai' : 'player';

  const offCategory = OFFENSE_FORMATION_CATEGORY[offPlay.name] || 'iform';
  const offList = [];
  genOffenseFormation(offCategory, offPlay.direction).forEach(p => {
    const dot = makeDot('offense mini' + (p.qb ? ' qb' : ''), p.qb ? 'QB' : '', offenseSide);
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
      defenseFormation.forEach((actor, index) => { actor.id = 'D' + index; });
      const defenders = selectManCoverageDefenders(defenseFormation, offPlay, defPlay, receivers.length);
      matchManCoverage(defenders, receivers).forEach((receiver, defender) => {
        defender.y = receiver.y;
      });
    }
    defenseFormation.forEach(p => {
      const dot = makeDot('defense mini', '', defenseSide);
      field.appendChild(dot);
      const formX = clamp(preSnapSpot + p.dx*offenseDir, -9, 109);
      placeEl(dot, formX, p.y);
      defList.push({el: dot, role: p.role, y: p.y, formX});
    });
    formationDots.defense = defList;
  } else {
    formationDots.defense = [];
  }
  refreshTacticalCanvas();
}

function ensureChoiceFormation(){
  const key = `${game.possession}:${game.fieldPosition}`;
  if(choiceFormationKey === key && formationDots.offense.length === 11 && formationDots.defense.length === 11) return;
  renderFormation({name:'Quick Slant', type:'pass', direction:'middle'},
    {name:'Base 4-3', type:'balanced'}, game.fieldPosition, game.possession);
  choiceFormationKey = key;
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
