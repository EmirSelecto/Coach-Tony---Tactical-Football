/* =========================================================================
   ACTIONS JOUEUR
   ========================================================================= */
function playerCallOffense(variant){
  if(game.gameOver || game.pendingGameEnd || game.phase !== 'playing' || game.playLocked || game.possession !== 'player') return;
  game.playLocked = true;
  if(!preSnapGate('player', game.playerTempo)) return;
  const context = buildContext('player');
  const predictability = calculatePredictability(game.offensivePlayHistoryPlayer, context);
  const defPlay = chooseAIDefensivePlay(context, predictability, game.offensivePlayHistoryPlayer);
  renderControls();
  beginPreSnap(variant, defPlay, true, () => runOffensivePlay(variant, true, {defPlay, predictability}));
}

function playerCallDefense(defVariant){
  if(game.gameOver || game.pendingGameEnd || game.phase !== 'playing' || game.playLocked || game.possession !== 'ai') return;
  game.playLocked = true;
  if(!preSnapGate('ai', aiTempo('ai'))) return;
  game.pendingPlayerDefense = defVariant;
  const context = buildContext('ai');
  const predictability = calculatePredictability(game.defensivePlayHistoryPlayer, context);
  const offPlay = chooseAIOffensivePlay(context, predictability, game.defensivePlayHistoryPlayer);
  renderControls();
  beginPreSnap(offPlay, defVariant, false, () => runOffensivePlay(offPlay, false, {defPlay: defVariant, predictability}));
}

function preSnapDelayMs(){
  // +2000ms fixes (non affectés par la vitesse) pour laisser le temps de bien
  // observer les deux formations avant le snap, comme demandé.
  return Math.max(400, Math.round(1500 / (game && game.animSpeed ? game.animSpeed : 1))) + 2000;
}

function setPlayPhase(label){
  const el = document.getElementById('playPhaseLabel');
  if(el) el.textContent = label;
}

// Genou à terre de l'IA (fin de match ou de mi-temps), sinon décision de 4e tentative.
function maybeHandleAISpecial(){
  if(game.gameOver || game.pendingGameEnd || game.phase !== 'playing' || game.possession !== 'ai' || game.playLocked) return;
  if(aiKneelDecision('ai')){
    game.playLocked = true;
    setPlayPhase(t('game.match.kneelPhase'));
    renderControls();
    const expected = {quarter: game.quarter, down: game.down, fieldPosition: game.fieldPosition};
    scheduleForGame(() => {
      if(game.phase !== 'playing' || game.possession !== 'ai' || game.quarter !== expected.quarter || game.down !== expected.down){
        game.playLocked = false; renderControls(); return;
      }
      executeKneel('ai');
    }, Math.round(preSnapDelayMs() * 0.6));
    return;
  }
  maybeHandleAIFourthDown();
}
function executeKneel(side){
  game.playLocked = true;
  if(!preSnapGate(side, 'slow')) return;
  const dir = side === 'player' ? 1 : -1;
  recordDrivePlay(side, -1, 'Genou à terre');
  const adv = advanceBall(-1, dir, side);
  const ev = endSnapClock(randInt(BALANCE.clock.kneel[0], BALANCE.clock.kneel[1]), adv.type === 'turnoverOnDowns' || adv.type === 'safety');
  const who = teamNameOf(side);
  setResult(t('game.match.kneel'), t('game.match.kneelResult', {team:who, turnover:adv.type === 'turnoverOnDowns' ? t('game.match.kneelTurnover') : ''}), '');
  logMatch(t('game.match.kneelLog', {team:who, period:periodLabel(game.quarter), clock:fmtClock(game.clock)}));
  render();
  handleClockEvents(ev);
  if(adv.type === 'turnoverOnDowns') showDriveSummaryPanel(game.lastFinishedDrive, 'turnoverOnDowns');
  scheduleForGame(() => { game.playLocked = false; render(); afterPlayResolved(); }, 700);
}
function playerKneel(){
  if(!canPlayerActOnOffense() || game.fieldPosition <= 2) return;
  executeKneel('player');
}
function playerSpike(){
  if(!canPlayerActOnOffense() || !game.clockRunning || game.down >= 4) return;
  game.playLocked = true;
  if(!preSnapGate('player', 'spike')) return;
  recordDrivePlay('player', 0, t('game.match.spike'));
  game.down += 1;
  const ev = endSnapClock(1, true);
  setResult(t('game.match.spike'), t('game.match.spikeResult'), '');
  logMatch(t('game.match.spikeLog', {team:teamNameOf('player'), period:periodLabel(game.quarter), clock:fmtClock(game.clock)}));
  game.playLocked = false;
  render();
  handleClockEvents(ev);
  afterPlayResolved();
}
function playerCallTimeout(){
  if(game.gameOver || game.phase !== 'playing' || game.playLocked) return;
  if(!useTimeout('player')) return;
  announceTimeout('player');
  render();
  SaveManager.snapshot();
}
function setPlayerTempo(t){ game.playerTempo = t; renderControls(); }

/* ---- Transformation / conversion à 2 points (Phase 3) ---- */
const TWO_POINT_OFFENSE_OPTIONS = [
  {name:'Power Run', type:'run', depth:'short', direction:'middle'},
  {name:'Quick Slant', type:'pass', depth:'short', direction:'middle'},
  {name:'Mesh Concept', type:'pass', depth:'short', direction:'middle'},
  {name:'Play Action', type:'pass', depth:'medium', direction:'middle'}
];
const TWO_POINT_DEFENSE_OPTIONS = ['Goal-Line Defense', 'Cover 1', 'Base 4-3', 'Nickel Blitz'];
function fmtDiff(d){ return d > 0 ? `+${d}` : `${d}`; }
function runConversion(){
  const team = game.pendingConversion.team;
  game.phase = 'conversion'; game.playLocked = true;
  setPlayPhase(t('game.conversion.title'));
  render();
  if(team === 'player'){
    const advice = aiConversionChoice('player') === 'two' ? t('game.conversion.patAdviceTwo') : t('game.conversion.patAdviceOne');
    const opts = [{label:t('game.conversion.patOption', {chance:Math.round(BALANCE.conversion.patChance*100)}), primary:true, onClick: () => finishConversion('player', 'pat')}];
    TWO_POINT_OFFENSE_OPTIONS.forEach(pl => opts.push({label:t('game.conversion.twoPointOption', {play:playLabel(pl.name)}), onClick: () => {
      const ctx = conversionContext('player');
      const defPlay = chooseAIDefensivePlay(ctx, calculatePredictability(game.offensivePlayHistoryPlayer, ctx), game.offensivePlayHistoryPlayer);
      finishConversion('player', 'two', {...pl}, defPlay);
    }}));
    showChoice(t('game.conversion.playerChoiceTitle'), t('game.conversion.playerChoiceBody', {diff:fmtDiff(scoreDiffFor('player')), advice}), opts);
  } else {
    if(aiConversionChoice('ai') === 'pat'){ scheduleForGame(() => finishConversion('ai', 'pat'), 700); return; }
    const ctx = conversionContext('ai');
    const offPlay = chooseAIOffensivePlay(ctx, calculatePredictability(game.defensivePlayHistoryPlayer, ctx), game.defensivePlayHistoryPlayer);
    const opts = TWO_POINT_DEFENSE_OPTIONS.map(n => ({label:playLabel(n), onClick: () => finishConversion('ai', 'two', offPlay, {...DEFENSE_PLAYS.find(d => d.name === n)})}));
    showChoice(t('game.conversion.aiChoiceTitle'), t('game.conversion.aiChoiceBody', {team:teamNameOf('ai'), diff:fmtDiff(scoreDiffFor('ai'))}), opts);
  }
}
function finishConversion(team, choice, offPlay, defPlay){
  hideChoice();
  if(!game.pendingConversion || game.pendingConversion.team !== team) return;
  const res = resolveConversion(team, choice, offPlay, defPlay);
  if(res.kind === 'two' && offPlay && res.result){
    const context = conversionContext(team);
    const offHistory = team === 'player' ? game.offensivePlayHistoryPlayer : game.offensivePlayHistoryAI;
    const defHistory = team === 'player' ? game.defensivePlayHistoryAI : game.defensivePlayHistoryPlayer;
    addHistory(offHistory, buildHistoryEntry(offPlay, context, res.result, res.success));
    addHistory(defHistory, buildHistoryEntry(defPlay, context, res.result, !res.success));
    recordOffensivePlayTendency(team, offPlay.type);
  }
  const dir = team === 'player' ? 1 : -1;
  const goalX = team === 'player' ? 100 : 0;
  game.playLocked = true;
  // Lignes affichées : scrimmage aux 2 yards (ou 15 pour le PAT), objectif = ligne de but.
  game.visualBallX = goalX - dir*(res.kind === 'pat' ? 15 : (100 - BALANCE.conversion.twoPointBallOn));
  game.visualFirstDownX = goalX;
  render();
  renderControls();

  const done = () => {
    if(res.points) score(team, res.points);
    game.pendingConversion = null;
    game.pendingKickoff = {kicking: team};
    let headline, explain;
    if(res.kind === 'pat'){
      headline = t(res.success ? 'game.conversion.patSuccess' : 'game.conversion.patMissed');
      explain = res.success ? t('game.conversion.patAdded', {team:teamNameOf(team)}) : t('game.conversion.patKickerMissed', {team:teamNameOf(team)});
    } else {
      headline = t(res.success ? 'game.conversion.twoPointSuccess' : 'game.conversion.twoPointMissed');
      const note = matchupNote(offPlay, defPlay, res.result);
      explain = t('game.conversion.playAgainstDefense', {
        offense:playLabel(offPlay.name),
        defense:playLabel(defPlay.name),
        result:t(res.success ? 'game.conversion.ballCrossesLine' : 'game.conversion.defenseHolds')
      }) + (note ? ' ' + note : '');
    }
    logMatch(`${headline} (${teamNameOf(team)}) — ${game.scorePlayer}-${game.scoreAI}.`);
    setResult(headline, explain, '');
    if(res.success){
      triggerScoreCelebration(team);
      showEventBanner(t(res.kind === 'pat' ? 'game.banners.plusOne' : 'game.banners.twoPoints'), 'score');
      if(res.kind === 'two') celebrate('bigPlay', team, goalX);
    } else if(res.kind === 'two'){
      showEventBanner(t('game.banners.stopped'), 'turnover');
    }
    game.playLocked = true;
    render();
    scheduleForGame(() => { game.playLocked = false; afterPlayResolved(); }, 1100);
  };

  if(res.kind === 'pat'){
    // Snap sur la ligne des 15 yards : coup de pied d'environ 33 yards.
    setResult(t('game.conversion.title'), t('game.conversion.patAttempt', {team:teamNameOf(team)}), '');
    runKickPlayAnimation({
      type:'fieldGoal',
      preSnapSpot:goalX - dir*15,
      offenseSide:team,
      made:res.success,
      suppressFieldGoalFeedback:true
    }, done);
    return;
  }
  // Conversion à 2 points : l'action est jouée depuis les 2 yards.
  const r = res.result;
  const preSnapSpot = goalX - dir*(100 - BALANCE.conversion.twoPointBallOn);
  let outcome, finalX;
  if(res.success){ outcome = 'touchdown'; finalX = goalX; }
  else if(r.outcome === 'sack'){ outcome = 'sack'; finalX = clamp(preSnapSpot + dir*r.yards, 0, 100); }
  else if(r.outcome === 'incomplete' || r.outcome === 'interception'){ outcome = 'incomplete'; finalX = preSnapSpot; }
  else { outcome = 'gain'; finalX = clamp(preSnapSpot + dir*Math.max(-3, Math.min(1, r.yards)), 0, 100); }
  setResult(t('game.conversion.aiChoiceTitle'), t('game.conversion.twoPointSnap', {offense:playLabel(offPlay.name), defense:playLabel(defPlay.name)}), '');
  setPlayPhase(t('game.conversion.aiChoiceTitle'));
  const animCfg = {offPlay, defPlay, preSnapSpot, offenseSide: team, outcome, finalX,
    yards: res.success ? Math.max(2, r.yards) : r.yards, visualBallX: preSnapSpot, visualMarkerX: goalX};
  runPlayAnimation(animCfg, done);
}
function showChoice(title, bodyHtml, options){
  document.getElementById('choiceTitle').textContent = title;
  document.getElementById('choiceBody').innerHTML = bodyHtml;
  const actions = document.getElementById('choiceActions');
  actions.innerHTML = '';
  options.forEach(o => {
    const b = document.createElement('button');
    b.className = 'action-btn' + (o.primary ? '' : ' secondary');
    b.textContent = o.label;
    b.onclick = o.onClick;
    actions.appendChild(b);
  });
  document.getElementById('choiceOverlay').classList.remove('hidden');
}
function hideChoice(){ const el = document.getElementById('choiceOverlay'); if(el) el.classList.add('hidden'); }

/* Déclenchée une seule fois, juste après qu'un play ait amené l'IA en 4e tentative :
   décide punt / field goal / tentative normale (qui repasse alors par le flux standard,
   où le joueur choisit son appel défensif comme d'habitude). */
function maybeHandleAIFourthDown(){
  if(game.gameOver || game.pendingGameEnd || game.phase !== 'playing') return;
  if(!(game.possession === 'ai' && game.down === 4)) return;
  const decision = aiFourthDownDecision(buildContext('ai'));
  if(decision === 'goForIt') return; // flux normal : le joueur choisit son appel défensif
  game.playLocked = true;
  setPlayPhase(t(decision === 'fieldGoal' ? 'game.match.specialDecisionFieldGoal' : 'game.match.specialDecisionPunt'));
  renderControls();
  // Garde-fou : l'action différée ne part que si la situation n'a pas changé
  // entre-temps (mi-temps, nouveau match, changement de possession...).
  const expected = {possession: 'ai', down: 4, quarter: game.quarter, fieldPosition: game.fieldPosition};
  scheduleForGame(() => {
    if(game.phase !== 'playing' || game.pendingGameEnd || game.possession !== expected.possession ||
       game.down !== expected.down || game.quarter !== expected.quarter || game.fieldPosition !== expected.fieldPosition){
      game.playLocked = false; renderControls(); return;
    }
    if(decision === 'fieldGoal') attemptFieldGoal(); else attemptPunt();
  }, preSnapDelayMs());
}

// Actions spéciales déclenchées par le JOUEUR : mêmes garde-fous que les appels.
function canPlayerActOnOffense(){
  return !game.gameOver && !game.pendingGameEnd && game.phase === 'playing' && !game.playLocked && game.possession === 'player';
}
function playerAttemptFieldGoal(){ if(canPlayerActOnOffense()) attemptFieldGoal(); }
function playerAttemptPunt(){ if(canPlayerActOnOffense()) attemptPunt(); }
