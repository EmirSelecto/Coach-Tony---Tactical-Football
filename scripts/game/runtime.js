/* =========================================================================
   RÉACTIONS DE COMMENTATEUR — déclenchées sur les actions marquantes
   ========================================================================= */
const COMMENTARY = TEXTS.commentary;
function pickCommentary(category){
  const pool = COMMENTARY[category];
  if(!pool || pool.length === 0) return '';
  return pool[randInt(0, pool.length-1)];
}
function commentaryForPlay({outcome, yards}){
  if(outcome === 'interception') return pickCommentary('interception');
  if(outcome === 'fumble') return pickCommentary('fumble');
  if(outcome === 'sack' && yards <= -5) return pickCommentary('bigLoss');
  if(yards >= 20) return pickCommentary('bigGain');
  return '';
}

function score(side, points){
  if(side === 'player') game.scorePlayer += points; else game.scoreAI += points;
  // Prolongation : un score met fin au match, sauf un field goal sur la toute
  // première possession (l'adversaire a alors droit à sa possession).
  if(game.quarter >= 5 && game.ot){
    const firstPossessionFG = points === 3 && game.ot.drives === 1;
    if(!firstPossessionFG && game.scorePlayer !== game.scoreAI) game.pendingGameEnd = true;
  }
}

/* -------- Traitement d'un snap standard (course ou passe) -------- */
function runOffensivePlay(offPlay, isPlayerOffense, precomputed){
  const context = buildContext(isPlayerOffense ? 'player' : 'ai');
  let predictability, defPlay, repetitionPenalty = 0, surpriseBonus = 0;

  if(precomputed){
    predictability = precomputed.predictability;
    defPlay = precomputed.defPlay;
  } else if(isPlayerOffense){
    predictability = calculatePredictability(game.offensivePlayHistoryPlayer, context);
    defPlay = chooseAIDefensivePlay(context, predictability, game.offensivePlayHistoryPlayer);
  } else {
    // L'IA attaque : le joueur a déjà choisi sa défense (passée dans defPlayOverride)
    predictability = calculatePredictability(game.defensivePlayHistoryPlayer, context);
    defPlay = game.pendingPlayerDefense;
  }
  if(isPlayerOffense){
    repetitionPenalty = calculateRepetitionPenalty(offPlay, game.offensivePlayHistoryPlayer);
    surpriseBonus = calculateSurpriseBonus(offPlay, predictability, predictability);
  }

  const result = resolvePlay(offPlay, defPlay, {...context, surpriseBonus, repetitionPenalty});

  // Journalisation historique
  const offHistArr = isPlayerOffense ? game.offensivePlayHistoryPlayer : game.offensivePlayHistoryAI;
  const defHistArr = isPlayerOffense ? game.defensivePlayHistoryAI : game.defensivePlayHistoryPlayer;
  const offSuccess = result.outcome !== 'interception' && result.outcome !== 'fumble' && result.outcome !== 'sack' && result.yards >= (context.distance <= 4 ? context.distance : 4);
  addHistory(offHistArr, buildHistoryEntry(offPlay, context, result, offSuccess));
  addHistory(defHistArr, buildHistoryEntry(defPlay, context, result, !offSuccess));
  recordOffensivePlayTendency(isPlayerOffense ? 'player' : 'ai', offPlay.type);

  game.lastDebug = {predictability, defPlay, offPlay, repetitionPenalty, surpriseBonus, result, isPlayerOffense};

  applyPlayOutcome(offPlay, defPlay, result, isPlayerOffense, predictability, repetitionPenalty, surpriseBonus);
}

/* =========================================================================
   RETOURS DE TURNOVER (interception / fumble) — peuvent mener à un pick-six
   ou à un retour de fumble marqué. Réglages dans BALANCE.turnoverReturn.
   ========================================================================= */
function resolveTurnoverReturn(turnoverType, offenseSide, spot){
  const cfg = BALANCE.turnoverReturn;
  const defenderSide = offenseSide === 'player' ? 'ai' : 'player';
  // Le défenseur qui récupère le ballon court vers SON en-but à marquer,
  // c'est-à-dire dans la direction opposée à celle de l'attaque initiale.
  const defenderDir = offenseSide === 'player' ? -1 : 1;
  const distToGoal = defenderDir === 1 ? (100 - spot) : spot; // yards à parcourir pour marquer

  let pickSixChance = turnoverType === 'interception' ? cfg.interceptionPickSixChance : cfg.fumblePickSixChance;
  if(distToGoal > cfg.longFieldThreshold) pickSixChance *= cfg.longFieldPenaltyFactor;

  const isPickSix = distToGoal > 0 && Math.random() < pickSixChance;
  let returnYards;
  if(isPickSix){
    returnYards = distToGoal;
  } else {
    const cap = turnoverType === 'interception' ? cfg.interceptionReturnMax : cfg.fumbleReturnMax;
    returnYards = Math.min(distToGoal, randInt(0, cap));
  }
  const newSpot = clamp(spot + defenderDir*returnYards, 0, 100);
  return {defenderSide, defenderDir, returnYards, isPickSix, newSpot};
}

/* =========================================================================
   ANIMATION DES JOUEURS SUR LE TERRAIN
   Positions par couloir (gauche/centre/droite) + déplacement animé du
   porteur du ballon depuis la ligne de scrimmage jusqu'au point final,
   calculé à partir du résultat réel du play (yards, retour de turnover...).
   ========================================================================= */
const FIELD_LANES = {left:22, middle:50, right:78, mixed:50};
// Phase 3 : le terrain affiche 100 yards de jeu ENTRE les deux zones d'en-but
// (10 yards chacune, aux couleurs des équipes). Toutes les coordonnées du moteur
// et de l'animation restent en yards (0 = ligne de but du joueur, 100 = ligne de
// but de l'IA, -10 / 110 = lignes de fond) : seule la conversion d'affichage change.
const FIELD_VIEW = { endzoneYards: 10 };
function fx(x){ const ez = FIELD_VIEW.endzoneYards; return ((ez + x) / (100 + 2*ez)) * 100; }
function buildFieldMarkings(){
  const el = document.getElementById('fieldMarkings');
  if(!el || el.childElementCount) return;
  let html = '';
  for(let y = 0; y <= 100; y += 5){
    const cls = (y === 0 || y === 100) ? 'goal' : (y === 50 ? 'mid' : (y % 10 === 0 ? 'major' : ''));
    html += `<div class="yl ${cls}" style="left:${fx(y)}%"></div>`;
  }
  for(let y = 10; y <= 90; y += 10){
    const n = y <= 50 ? y : 100 - y;
    const arrowL = y < 50 ? '<span class="arr">&#9664;</span>' : '';
    const arrowR = y > 50 ? '<span class="arr">&#9654;</span>' : '';
    const label = `${arrowL}${n}${arrowR}`;
    html += `<div class="ynum bottom" style="left:${fx(y)}%">${label}</div>`;
    const arrowLt = y > 50 ? '<span class="arr">&#9664;</span>' : '';
    const arrowRt = y < 50 ? '<span class="arr">&#9654;</span>' : '';
    html += `<div class="ynum top" style="left:${fx(y)}%">${arrowLt}${n}${arrowRt}</div>`;
  }
  const w = fx(100) - fx(0);
  [1, 35, 62, 96].forEach(top => { html += `<div class="hash" style="left:${fx(0)}%;width:${w}%;top:${top}%"></div>`; });
  html += `<div class="goalpost" style="left:${fx(-10) + 0.5}%"></div><div class="goalpost" style="left:${fx(110) - 0.5}%"></div>`;
  el.innerHTML = html;
}
function hexA(hex, a){
  const h = (hex || '#888888').replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function laneForDirection(d){ return FIELD_LANES[d] !== undefined ? FIELD_LANES[d] : 50; }
