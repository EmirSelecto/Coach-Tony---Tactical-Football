/* =========================================================================
   RENDU / INTERFACE
   ========================================================================= */
function fmtClock(s){
  s = Math.max(0,s);
  const m = Math.floor(s/60), sec = s%60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function render(){
  document.getElementById('scorePlayer').textContent = game.scorePlayer;
  document.getElementById('scoreAI').textContent = game.scoreAI;
  document.getElementById('quarterLabel').textContent = game.quarter >= 5 ? t('ui.status.overtime') : t('ui.status.quarter', {quarter:game.quarter});
  document.getElementById('clockLabel').textContent = fmtClock(game.clock);
  const toMax = game.quarter >= 5 ? BALANCE.overtime.timeouts : BALANCE.timeoutsPerHalf;
  const toTxt = n => '\u25CF'.repeat(Math.max(0, n)) + '\u25CB'.repeat(Math.max(0, toMax - n));
  if(game.timeouts){
    document.getElementById('toPlayer').textContent = toTxt(game.timeouts.player);
    document.getElementById('toAI').textContent = toTxt(game.timeouts.ai);
  }
  const cs = document.getElementById('clockState');
  const running = game.phase === 'playing' && game.clockRunning;
  cs.textContent = game.phase !== 'playing' ? '' : t(running ? 'ui.status.clockRunning' : 'ui.status.clockStopped');
  cs.className = 'clock-state' + (running ? ' running' : '');

  const downNames = {1:t('ui.status.downFirst'), 2:t('ui.status.downSecond'), 3:t('ui.status.downThird'), 4:t('ui.status.downFourth')};
  document.getElementById('downDistance').textContent = game.phase === 'conversion' ? t('ui.status.conversion')
    : `${downNames[game.down]} tentative & ${game.distance}`;
  document.getElementById('possTag').textContent = t('ui.status.onOffense', {team:teamNameOf(game.possession)});
  document.getElementById('possTag').className = 'poss-tag ' + game.possession;

  const spotFromPlayerGoal = game.fieldPosition;
  document.getElementById('ballSpotLabel').textContent = spotFromPlayerGoal <= 50
    ? t('ui.status.ballInPlayerHalf', {yard:spotFromPlayerGoal, team:teamNameOf('player')})
    : t('ui.status.ballInAIHalf', {yard:100-spotFromPlayerGoal, team:teamNameOf('ai')});

  document.getElementById('situationExtra').textContent =
    t('ui.status.periodRemaining', {period:game.quarter >= 5 ? t('ui.status.overtime') : t('ui.status.quarterShort', {quarter:game.quarter}), clock:fmtClock(game.clock)});

  // Field — la ligne de scrimmage, la ligne à gagner et le ballon posé
  // affichent game.visualBallX / game.visualFirstDownX (positions FIGÉES),
  // jamais fieldPosition/distance en direct : elles ne bougent qu'au moment
  // `tackle` de l'animation en cours (voir PlayAnimationController), quand le
  // porteur tombe réellement — jamais dès que le moteur a résolu le play.
  // Hors animation, les lignes suivent TOUJOURS l'état du match (corrige les
  // lignes restées dans la zone d'en-but après un touchdown + kickoff).
  if(!game.playLocked && game.phase === 'playing'){
    game.visualBallX = game.fieldPosition;
    game.visualFirstDownX = computeFirstDownTargetX(game.fieldPosition, game.possession, game.distance);
  }
  document.getElementById('ballMarker').style.left = fx(game.visualBallX) + '%';
  document.getElementById('scrimmageLine').style.left = fx(game.visualBallX) + '%';
  document.getElementById('firstDownMarker').style.left = fx(game.visualFirstDownX) + '%';

  renderTendencies();
  renderControls();
  renderDebug();
  renderMatchLog();

  if(game.gameOver){
    document.getElementById('controlsPanel').classList.add('hidden');
  } else {
    document.getElementById('controlsPanel').classList.remove('hidden');
  }
}

function renderTendencies(){
  const totals = ensureOffensivePlayTotals(game);
  const context = buildContext('player');
  const predictability = calculatePredictability(game.offensivePlayHistoryPlayer, context);
  document.getElementById('tendRunPass').textContent = formatOffensivePlayTendency(totals.player);
  document.getElementById('tendAIRunPass').textContent = formatOffensivePlayTendency(totals.ai);
  document.getElementById('tendMeter').style.width = predictability.predictabilityScore + '%';
  document.getElementById('tendScore').textContent = `${predictability.predictabilityScore} / 100`;

  let readTxt = t('ui.status.unpredictable');
  if(predictability.predictabilityScore > 85) readTxt = t('ui.status.extremelyPredictable');
  else if(predictability.predictabilityScore > 70) readTxt = t('ui.status.veryPredictable');
  else if(predictability.predictabilityScore > 50) readTxt = t('ui.status.clearTendency');
  else if(predictability.predictabilityScore > 25) readTxt = t('ui.status.slightTendency');
  document.getElementById('tendRead').textContent = readTxt;
  document.getElementById('tendExplain').textContent = predictability.explanation;

  const chips = document.getElementById('historyChips');
  chips.innerHTML = '';
  const recentCalls = game.offensivePlayHistoryPlayer.slice(-8);
  if(recentCalls.length === 0){
    chips.innerHTML = `<span class="chip">${t('ui.playControls.noHistory')}</span>`;
  } else {
    recentCalls.forEach(h=>{
      const span = document.createElement('span');
      span.className = 'chip ' + (h.type==='run'?'run':'pass');
      span.textContent = `${playLabel(h.playName)} (${dirLabel(h.direction)})`;
      chips.appendChild(span);
    });
  }
}

function renderControls(){
  const title = document.getElementById('controlsTitle');
  const who = document.getElementById('controlsWho');
  const body = document.getElementById('controlsBody');
  body.innerHTML = '';

  if(game.gameOver) return;

  if(game.phase !== 'playing'){
    who.textContent = t('ui.status.none');
    title.firstChild ? title.firstChild.textContent = t('ui.playControls.waiting') + ' ' : null;
    const wait = document.createElement('div');
    wait.style.cssText = 'color:var(--ink-dim);font-size:0.9rem;padding:6px 0;';
    wait.textContent = game.phase === 'kickoff' ? t('ui.playControls.kickoffInProgress')
      : game.phase === 'halftime' ? t('ui.playControls.halftimeInProgress')
      : game.phase === 'conversion' ? t('ui.playControls.conversionInProgress')
      : game.phase === 'pregame' ? t('ui.playControls.pregameInProgress')
      : t('ui.playControls.coinTossInProgress');
    body.appendChild(wait);
    return;
  }

  if(game.playLocked){
    who.textContent = t('ui.status.none');
    title.firstChild ? title.firstChild.textContent = t('ui.playControls.waiting') + ' ' : null;
    const wait = document.createElement('div');
    wait.style.cssText = 'color:var(--ink-dim);font-size:0.9rem;padding:6px 0;';
    wait.textContent = t('ui.playControls.playInProgress');
    body.appendChild(wait);
    return;
  }

  const playerOnOffense = game.possession === 'player';
  who.textContent = playerOnOffense ? teamNameOf('player') : t('ui.playControls.defenseSuffix', {team:teamNameOf('ai')});
  title.firstChild ? title.firstChild.textContent = t(playerOnOffense ? 'ui.playControls.offenseTitle' : 'ui.playControls.defenseTitle') + ' ' : null;

  body.appendChild(buildClockControls(playerOnOffense));

  if(playerOnOffense){
    // 4e tentative : proposer FG / Fake FG / Punt en plus des appels
    if(game.down === 4){
      const context = buildContext('player');
      const fromGoal = context.ballOn;
      const kickDistance = computeKickDistance(context);
      const row = document.createElement('div');
      row.className = 'action-row';
      if(kickDistance <= BALANCE.fieldGoal.availableMaxDistance){
        const chance = Math.round(getFieldGoalSuccessChance(kickDistance) * 100);
        const fg = document.createElement('button');
        fg.className = 'action-btn'; fg.textContent = t('ui.playControls.fieldGoal', {yards:kickDistance, chance});
        fg.onclick = playerAttemptFieldGoal;
        row.appendChild(fg);
        const fake = document.createElement('button');
        fake.className = 'action-btn secondary'; fake.textContent = t('ui.playControls.fakeFieldGoal');
        fake.onclick = attemptFakeFieldGoal;
        row.appendChild(fake);
      }
      const punt = document.createElement('button');
      punt.className = 'action-btn secondary'; punt.textContent = t('ui.playControls.punt');
      punt.onclick = playerAttemptPunt;
      row.appendChild(punt);
      body.appendChild(row);
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.8rem;color:var(--ink-dim);margin:6px 0 10px;';
      note.textContent = t('ui.playControls.goForItNote');
      body.appendChild(note);
      const coach = document.createElement('div');
      coach.className = 'coach-note';
      coach.innerHTML = t('ui.playControls.coachAdvice', {advice:fourthDownAdviceText(context)});
      body.appendChild(coach);
    }
    renderOffenseButtons(body, playerCallOffense);
  } else {
    renderDefenseButtons(body, playerCallDefense);
  }
}

// Rangée « gestion du chrono » : temps mort, tempo, spike, genou à terre.
function buildClockControls(onOffense){
  const wrap = document.createElement('div');
  wrap.className = 'clock-controls';
  const row = document.createElement('div');
  row.className = 'action-row';
  const mk = (label, cls, fn, title) => {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label; b.onclick = fn; if(title) b.title = title;
    return b;
  };
  const n = game.timeouts ? game.timeouts.player : 0;
  const to = mk(t('ui.clock.timeoutButton', {count:n}), 'action-btn secondary', playerCallTimeout,
    !game.clockRunning ? t('ui.clock.alreadyStopped') : (n <= 0 ? t('ui.clock.noneLeft') : t('ui.clock.stopClock')));
  to.disabled = !game.clockRunning || n <= 0;
  row.appendChild(to);
  const late = isHalfEndQuarter(game.quarter) && game.clock <= 180;
  if(onOffense){
    const seg = document.createElement('div');
    seg.className = 'tempo-seg';
    [['slow',t('ui.clock.slowTempo'),t('ui.clock.slowTempoHint')],
     ['normal',t('ui.clock.normalTempo'),t('ui.clock.normalTempoHint')],
     ['hurry',t('ui.clock.hurryTempo'),t('ui.clock.hurryTempoHint')]]
      .forEach(([k, l, t]) => seg.appendChild(mk(l, game.playerTempo === k ? 'on' : '', () => setPlayerTempo(k), t)));
    row.appendChild(seg);
    if(late){
      const sp = mk(t('ui.clock.spike'), 'action-btn secondary', playerSpike, t('ui.clock.spikeHint'));
      sp.disabled = !game.clockRunning || game.down >= 4;
      row.appendChild(sp);
      const kn = mk(t('ui.clock.kneel'), 'action-btn secondary', playerKneel, t('ui.clock.kneelHint'));
      kn.disabled = game.fieldPosition <= 2;
      row.appendChild(kn);
    }
  }
  wrap.appendChild(row);
  const info = document.createElement('div');
  info.className = 'clock-info';
  if(!game.clockRunning){
    info.textContent = t('ui.clock.clockStopped');
  } else {
    const tempo = onOffense ? game.playerTempo : aiTempo('ai');
    const r = betweenSnapsRange(tempo);
    let txt = t('ui.clock.clockRunning', {min:r[0], max:r[1], opponentTempo:onOffense ? '' : t('ui.clock.opponentTempo', {tempo:tempoLabel(tempo)})});
    if(game.clock <= r[1] && isHalfEndQuarter(game.quarter)){
      txt += t('ui.clock.periodWarning');
      info.classList.add('warn');
    } else if(game.clock <= r[1]){
      txt += t('ui.clock.quarterWarning');
    }
    info.textContent = txt;
  }
  wrap.appendChild(info);
  return wrap;
}

function renderOffenseButtons(container, onPick){
  const runGroup = document.createElement('div'); runGroup.className='play-group';
  runGroup.innerHTML = `<div class="label">${t('ui.playControls.runs')}</div>`;
  const runRow = document.createElement('div'); runRow.className='play-buttons';
  const passGroup = document.createElement('div'); passGroup.className='play-group';
  passGroup.innerHTML = `<div class="label">${t('ui.playControls.passes')}</div>`;
  const passRow = document.createElement('div'); passRow.className='play-buttons';

  OFFENSE_PLAYS.forEach(p=>{
    p.directions.forEach(d=>{
      const btn = document.createElement('button');
      btn.className = 'play-btn ' + p.type;
      const displayName = playLabel(p.name);
      const label = p.directions.length > 1 ? `${displayName} (${dirLabel(d)})` : displayName;
      btn.innerHTML = `<span class="pb-name"></span><span class="pb-card"></span>`;
      btn.querySelector('.pb-name').textContent = label;
      const card = offenseCardText(p.name, {type:p.type, direction:d});
      btn.querySelector('.pb-card').textContent = card;
      btn.title = `${label}\n${card}`;
      btn.onclick = ()=> onPick({name:p.name, type:p.type, depth:p.depth, direction:d});
      (p.type==='run' ? runRow : passRow).appendChild(btn);
    });
  });
  runGroup.appendChild(runRow);
  passGroup.appendChild(passRow);
  container.appendChild(runGroup);
  container.appendChild(passGroup);
}

function renderDefenseButtons(container, onPick){
  const group = document.createElement('div'); group.className='play-group';
  group.innerHTML = `<div class="label">${t('ui.playControls.defenses')}</div>`;
  const row = document.createElement('div'); row.className='play-buttons';
  DEFENSE_PLAYS.forEach(p=>{
    const btn = document.createElement('button');
    btn.className = 'play-btn def';
    btn.innerHTML = `<span class="pb-name"></span><span class="pb-card"></span>`;
    btn.querySelector('.pb-name').textContent = playLabel(p.name);
    btn.querySelector('.pb-card').textContent = defenseCardText(p.name);
    btn.title = `${playLabel(p.name)}\n${defenseCardText(p.name)}`;
    btn.onclick = ()=> onPick({...p});
    row.appendChild(btn);
  });
  group.appendChild(row);
  container.appendChild(group);
}

function renderDebug(){
  const log = document.getElementById('debugLog');
  if(!game.lastDebug){ log.textContent = '—'; return; }
  const d = game.lastDebug;
  log.textContent =
`Attaque: ${teamNameOf(d.isPlayerOffense ? 'player' : 'ai')}
Play offensif: ${d.offPlay.name} (${d.offPlay.type}, ${dirLabel(d.offPlay.direction)}, ${depthLabel(d.offPlay.depth)})
Play défensif: ${d.defPlay.name}
Prévisibilité estimée -> run:${(d.predictability.runProbability*100).toFixed(0)}% pass:${(d.predictability.passProbability*100).toFixed(0)}% dir:${d.predictability.preferredDirection} profondeur:${d.predictability.preferredDepth}
predictabilityScore: ${d.predictability.predictabilityScore} | confiance: ${(d.predictability.confidence*100).toFixed(0)}%
Bonus de surprise: +${d.surpriseBonus||0}
Malus de répétition: -${d.repetitionPenalty||0}
Couche catégorie (type de défense / zone visée): ${d.result.base >= 0 ? '+' : ''}${d.result.base}
Interaction spécifique: ${d.result.matchup >= 0 ? '+' : ''}${d.result.matchup} (${(d.result.matchupReasons||[]).map(r => DEF_TAG_LABELS[r.tag] + ' ' + (r.mod>0?'+':'') + r.mod).join(', ') || 'aucune'})
Notes d'équipe: ${d.result.ratingsModifier >= 0 ? '+' : ''}${d.result.ratingsModifier} | Situation: ${d.result.situationModifier >= 0 ? '+' : ''}${d.result.situationModifier} | Aléa: ${d.result.randomness >= 0 ? '+' : ''}${d.result.randomness} (±${BALANCE.resolution.randomness})
Chance d'échappée: ${d.result.breakProb}%${d.result.breakaway ? ` -> ÉCHAPPÉE (+${d.result.breakYards} yards)` : ''}
finalAdvantage: ${d.result.finalAdvantage}
Résultat: ${d.result.outcome} — ${d.result.yards} yards${d.turnoverReturn ? `
Retour: ${d.turnoverReturn.returnYards} yards${d.turnoverReturn.isPickSix ? ' -> PICK-SIX / RETOUR MARQUÉ' : ''} (récupéré par ${teamNameOf(d.turnoverReturn.defenderSide)})` : ''}`;
}

/* =========================================================================
   MODE TEST / ÉQUILIBRAGE
   Simulations isolées (n'affectent pas la partie en cours) validant les
   scénarios demandés dans le brief.
   ========================================================================= */
function fakeContext(over){
  return Object.assign({down:1, distance:10, quarter:1, timeRemaining:300, scoreDiff:0, ballOn:50}, over||{});
}
function fakeEntry(type, playName, direction, depth){
  return {type, playName, direction, depth, down:1, distance:10, quarter:1, timeRemaining:300, result:null, success:true};
}

/* Simulation d'un match complet IA contre IA, sans affichage ni animation.
   Utilise les MÊMES fonctions de règles que le jeu (advanceBall, resolveKickoff,
   startSnapClock / endSnapClock, resolveConversion, politiques de l'IA...) dans
   le même ordre que afterPlayResolved, et vérifie chaque transition contre un
   registre de score tenu indépendamment. Les deux camps raisonnent comme l'IA.
   La partie en cours est sauvegardée puis restaurée (exécution synchrone). */
function makeSimGameState(teams){
  return {
    phase:'playing', quarter:1, clock:BALANCE.quarterLength, down:1, distance:10, fieldPosition:50,
    possession:'player', scorePlayer:0, scoreAI:0,
    offensivePlayHistoryPlayer:[], defensivePlayHistoryPlayer:[], offensivePlayHistoryAI:[], defensivePlayHistoryAI:[],
    gameOver:false, pendingHalftime:false, pendingGameEnd:false, pendingRegulationEnd:false, pendingOvertime:false,
    pendingConversion:null, pendingKickoff:null, ot:null, clockRunning:false,
    timeouts:{player:BALANCE.timeoutsPerHalf, ai:BALANCE.timeoutsPerHalf}, twoMinuteWarned:{},
    playerTempo:'normal', snapTempo:'normal', secondHalfReceivingTeam:null,
    currentDrive:null, lastFinishedDrive:null, matchLog:[],
    teams: teams || {player:{name:'Sim A', ratings: generateTeamRatings()}, ai:{name:'Sim B', ratings: generateTeamRatings()}}
  };
}
function simulateFullGame(){
  const saved = game;
  const issues = [];
  const stats = {points:0, plays:0, yards:0, turnovers:0, tds:0, fgMade:0, fgAtt:0, punts:0, touchbacks:0, safeties:0, pickSixes:0,
    halftimes:0, thirdDowns:0, thirdConv:0, sacks:0, breakaways:0, margin:0, ratingFavWins:0, ratingFavGames:0,
    patAtt:0, patMade:0, twoAtt:0, twoMade:0, timeouts:0, twoMinute:0, kneels:0, onsideAtt:0, onsideRec:0,
    kickTouchbacks:0, kickoffs:0, overtimes:0, ties:0, goForIt4th:0, expiredBeforeSnap:0, oob:0, hurrySnaps:0};
  const other = otherSide;
  const ledger = {player:0, ai:0};
  const award = (side, pts) => { ledger[side] += pts; };
  const countEvents = ev => ev.forEach(e => { if(e === 'twoMinute') stats.twoMinute++; });
  try{
    game = makeSimGameState();
    const opening = Math.random() < 0.5 ? 'player' : 'ai';
    game.secondHalfReceivingTeam = other(opening);
    kickoffReset(opening);

    let guard = 0;
    while(!game.gameOver && guard++ < 900){
      // ---- Enchaînements : même ordre que afterPlayResolved ----
      if(game.pendingConversion){
        const team = game.pendingConversion.team;
        let res;
        if(aiConversionChoice(team) === 'pat'){
          stats.patAtt++; res = resolveConversion(team, 'pat'); if(res.success) stats.patMade++;
        } else {
          stats.twoAtt++;
          const c2 = conversionContext(team);
          const offHist = team === 'player' ? game.offensivePlayHistoryPlayer : game.offensivePlayHistoryAI;
          const defHist = team === 'player' ? game.defensivePlayHistoryAI : game.defensivePlayHistoryPlayer;
          const offPlay = chooseAIOffensivePlay(c2, calculatePredictability(defHist, c2), defHist);
          const defPlay = chooseAIDefensivePlay(c2, calculatePredictability(offHist, c2), offHist);
          res = resolveConversion(team, 'two', offPlay, defPlay); if(res.success) stats.twoMade++;
        }
        if(res.points){ score(team, res.points); award(team, res.points); }
        game.pendingConversion = null; game.pendingKickoff = {kicking: team};
        continue;
      }
      if(game.pendingRegulationEnd){
        game.pendingRegulationEnd = false;
        if(game.scorePlayer === game.scoreAI) game.pendingOvertime = true; else game.pendingGameEnd = true;
      }
      if(game.pendingGameEnd){ game.gameOver = true; break; }
      if(game.pendingHalftime){
        game.pendingHalftime = false; game.pendingKickoff = null; stats.halftimes++;
        if(game.quarter !== 2) issues.push(`mi-temps déclenchée au QT ${game.quarter}`);
        beginSecondHalfState();
        kickoffReset(game.secondHalfReceivingTeam);
        continue;
      }
      if(game.pendingOvertime){
        game.pendingOvertime = false; game.pendingKickoff = null; stats.overtimes++;
        beginOvertimeState();
        kickoffReset(Math.random() < 0.5 ? 'player' : 'ai');
        continue;
      }
      if(game.pendingKickoff){
        const {kicking, free} = game.pendingKickoff; game.pendingKickoff = null;
        const onside = !free && aiOnsideDecision(kicking);
        stats.kickoffs++;
        if(onside) stats.onsideAtt++;
        const k = resolveKickoff(kicking, onside, free);
        if(onside && k.recovered) stats.onsideRec++;
        if(k.touchback) stats.kickTouchbacks++;
        if(!onside && game.possession !== other(kicking)) issues.push('kickoff : mauvaise équipe en possession');
        continue;
      }

      // ---- Snap ----
      const off = game.possession, def = other(off);
      if(game.down < 1 || game.down > 4) issues.push(`down invalide (${game.down})`);
      if(game.distance <= 0) issues.push(`distance invalide (${game.distance})`);
      if(game.fieldPosition < 1 || game.fieldPosition > 99) issues.push(`ballon hors terrain (${game.fieldPosition})`);
      if(game.clock < 0) issues.push(`chrono négatif (${game.clock})`);
      [def, off].forEach(side => { if(game.clockRunning && aiTimeoutDecision(side) && useTimeout(side)) stats.timeouts++; });
      const tempo = aiTempo(off);
      game.snapTempo = tempo === 'hurry' ? 'hurry' : 'normal';

      if(aiKneelDecision(off)){
        const st = startSnapClock('slow'); countEvents(st.events);
        if(!st.proceed){ stats.expiredBeforeSnap++; continue; }
        stats.kneels++;
        const adv = advanceBall(-1, off === 'player' ? 1 : -1, off);
        if(adv.type === 'safety'){ award(def, 2); stats.safeties++; issues.push('safety sur un genou à terre'); }
        countEvents(endSnapClock(randInt(BALANCE.clock.kneel[0], BALANCE.clock.kneel[1]), adv.type === 'turnoverOnDowns' || adv.type === 'safety'));
        continue;
      }

      let decision = null;
      if(game.down === 4){ decision = aiFourthDownDecision(buildContext(off)); if(decision === 'goForIt') stats.goForIt4th++; }
      const st = startSnapClock(tempo); countEvents(st.events);
      if(!st.proceed){ stats.expiredBeforeSnap++; continue; }
      if(tempo === 'hurry') stats.hurrySnaps++;
      const ctx = buildContext(off);

      if(decision === 'fieldGoal'){
        stats.fgAtt++;
        const made = Math.random() < getFieldGoalSuccessChance(computeKickDistance(ctx));
        if(made){ score(off, 3); award(off, 3); stats.fgMade++; if(!game.pendingGameEnd) game.pendingKickoff = {kicking: off}; }
        else { switchPossession(missedFieldGoalSpot(off)); if(game.possession !== def) issues.push('possession incorrecte après field goal manqué'); }
        countEvents(endSnapClock(randInt(BALANCE.clock.kick[0], BALANCE.clock.kick[1]), true));
        continue;
      }
      if(decision === 'punt'){
        stats.punts++;
        const pnt = resolvePunt(game.fieldPosition, off);
        if(pnt.touchback){
          stats.touchbacks++;
          const expected = off === 'player' ? 80 : 20;
          if(pnt.newPos !== expected) issues.push(`touchback mal placé (${pnt.newPos})`);
        }
        switchPossession(pnt.newPos);
        countEvents(endSnapClock(randInt(BALANCE.clock.kick[0], BALANCE.clock.kick[1]), true));
        if(game.possession !== def) issues.push('possession incorrecte après punt');
        continue;
      }

      const offHist = off === 'player' ? game.offensivePlayHistoryPlayer : game.offensivePlayHistoryAI;
      const defHist = off === 'player' ? game.defensivePlayHistoryAI : game.defensivePlayHistoryPlayer;
      const offPlay = chooseAIOffensivePlay(ctx, calculatePredictability(defHist, ctx), defHist);
      const pred = calculatePredictability(offHist, ctx);
      const defPlay = chooseAIDefensivePlay(ctx, pred, offHist);
      let repetitionPenalty = 0, surpriseBonus = 0;
      if(off === 'player'){
        repetitionPenalty = calculateRepetitionPenalty(offPlay, offHist);
        surpriseBonus = calculateSurpriseBonus(offPlay, pred, pred);
      }
      const result = resolvePlay(offPlay, defPlay, {...ctx, surpriseBonus, repetitionPenalty});
      addHistory(offHist, buildHistoryEntry(offPlay, ctx, result, result.yards >= 4));
      addHistory(defHist, buildHistoryEntry(defPlay, ctx, result, result.yards < 4));
      stats.plays++;
      if(result.outcome !== 'interception' && result.outcome !== 'incomplete') stats.yards += result.yards;
      if(result.outcome === 'sack') stats.sacks++;
      if(result.breakaway) stats.breakaways++;
      if(ctx.down === 3){ stats.thirdDowns++; if(result.outcome !== 'interception' && result.outcome !== 'fumble' && result.outcome !== 'incomplete' && result.yards >= ctx.distance) stats.thirdConv++; }
      const dir = off === 'player' ? 1 : -1;
      let advType = 'continue', oob = false;

      if(result.outcome === 'interception' || result.outcome === 'fumble'){
        stats.turnovers++;
        const spot = result.outcome === 'interception' ? game.fieldPosition : clamp(game.fieldPosition + dir*result.yards, 0, 100);
        const ret = resolveTurnoverReturn(result.outcome, off, spot);
        if(ret.isPickSix){
          score(ret.defenderSide, 6); award(def, 6); stats.pickSixes++;
          if(game.quarter < 5) game.pendingConversion = {team: ret.defenderSide};
          advType = 'touchdown';
        } else {
          switchPossession(ret.newSpot); advType = 'turnover';
          if(game.possession !== def) issues.push('possession incorrecte après turnover');
        }
      } else {
        const yards = result.outcome === 'incomplete' ? 0 : result.yards;
        const adv = advanceBall(yards, dir, off);
        advType = adv.type;
        if(adv.type === 'touchdown'){
          award(off, 6); stats.tds++;
          if(game.quarter < 5 && !game.pendingConversion) issues.push('touchdown sans transformation en attente');
          if(game.quarter >= 5 && !game.pendingGameEnd) issues.push('touchdown en prolongation sans fin de match');
        } else if(adv.type === 'safety'){
          award(def, 2); stats.safeties++;
          if(!game.pendingGameEnd && !(game.pendingKickoff && game.pendingKickoff.kicking === off && game.pendingKickoff.free)) issues.push('après une safety, l\'équipe qui concède doit effectuer un free kick');
        } else if(adv.type === 'turnoverOnDowns'){
          if(game.possession !== def) issues.push('possession incorrecte après turnover sur les downs');
        }
        if((advType === 'continue' || advType === 'firstdown') && result.outcome !== 'incomplete' && result.outcome !== 'sack'
           && outOfBoundsStopsClock() && rollOutOfBounds(offPlay)){ oob = true; stats.oob++; }
      }
      const stop = ['incomplete','interception','fumble'].includes(result.outcome)
        || ['touchdown','safety','turnoverOnDowns','turnover'].includes(advType) || oob;
      countEvents(endSnapClock(playDurationSeconds(), stop));

      if(game.scorePlayer !== ledger.player || game.scoreAI !== ledger.ai){
        issues.push(`score incohérent (${game.scorePlayer}-${game.scoreAI} vs attendu ${ledger.player}-${ledger.ai})`);
        ledger.player = game.scorePlayer; ledger.ai = game.scoreAI;
      }
    }
    if(guard >= 900) issues.push('le match ne se termine pas (boucle de sécurité atteinte)');
    if(game.quarter < 4) issues.push(`fin de match au QT ${game.quarter}`);
    if(game.quarter === 4 && game.scorePlayer === game.scoreAI) issues.push('égalité en fin de temps réglementaire sans prolongation');
    if(stats.halftimes !== 1) issues.push(`${stats.halftimes} mi-temps au lieu d'une`);
    if(stats.twoMinute < 2) issues.push(`seulement ${stats.twoMinute} avertissement(s) des 2 minutes`);
    if(game.scorePlayer !== ledger.player || game.scoreAI !== ledger.ai) issues.push('score final incohérent');
    if(game.quarter >= 5 && game.scorePlayer === game.scoreAI) stats.ties = 1;
    stats.points = game.scorePlayer + game.scoreAI;
    stats.margin = Math.abs(game.scorePlayer - game.scoreAI);
    const rP = game.teams.player.ratings.overall, rA = game.teams.ai.ratings.overall;
    if(Math.abs(rP - rA) >= 8 && game.scorePlayer !== game.scoreAI){
      stats.ratingFavGames = 1;
      stats.ratingFavWins = ((rP > rA) === (game.scorePlayer > game.scoreAI)) ? 1 : 0;
    }
  } catch(e){
    issues.push('erreur : ' + e.message);
  } finally {
    game = saved;
  }
  return {stats, issues};
}

// Scénarios ciblés de gestion de match (Test 9) : état de jeu jetable.
function withTestGame(over, fn){
  const saved = game;
  try{
    game = Object.assign(makeSimGameState({player:{name:'Test A', ratings:{offense:78, defense:78, overall:78}}, ai:{name:'Test B', ratings:{offense:78, defense:78, overall:78}}}), over || {});
    return fn();
  } finally { game = saved; }
}

function runBalanceTests(){
  const lines = [];
  const push = (t)=>lines.push(t);

  // Test 1: 6 courses sur 8 -> score élevé
  let h1 = [];
  ['Inside Zone','Inside Zone','Power Run','Quick Slant','Inside Zone','Power Run','Dive','Inside Zone']
    .forEach((name,i)=> h1.push(fakeEntry(name==='Quick Slant'?'pass':'run', name, 'middle', name==='Quick Slant'?'short':'short')));
  let p1 = calculatePredictability(h1, fakeContext());
  push(`Test 1 — 6 courses / 8 appels (intérieur répété)`);
  push(`  predictabilityScore = ${p1.predictabilityScore} (attendu ~75-90) -> ${p1.predictabilityScore>=70 ? 'OK' : 'À AJUSTER'}`);

  // Test 2: appels variés -> score faible
  let h2 = [
    fakeEntry('pass','Hitch / Curl','left','short'),
    fakeEntry('run','Outside Zone','right','medium'),
    fakeEntry('pass','Deep Post','middle','deep'),
    fakeEntry('run','Sweep','left','medium'),
    fakeEntry('pass','Screen Pass','right','short'),
    fakeEntry('run','Counter Run','right','medium'),
    fakeEntry('pass','Four Verticals','left','deep'),
    fakeEntry('run','Read Option','middle','medium'),
  ];
  let p2 = calculatePredictability(h2, fakeContext());
  push(`Test 2 — appels variés (run/pass/directions/profondeurs mélangés)`);
  push(`  predictabilityScore = ${p2.predictabilityScore} (attendu bas, ~15-40) -> ${p2.predictabilityScore<=45 ? 'OK' : 'À AJUSTER'}`);

  // Test 3: Play Action après plusieurs courses intérieures -> bonus de surprise élevé
  let h3 = [
    fakeEntry('run','Inside Zone','middle','short'),
    fakeEntry('run','Power Run','middle','short'),
    fakeEntry('run','Inside Zone','middle','short'),
    fakeEntry('run','Dive','middle','short'),
  ];
  let p3 = calculatePredictability(h3, fakeContext());
  let actual3 = {name:'Play Action', type:'pass', direction:'middle', depth:'medium'};
  let bonus3 = calculateSurpriseBonus(actual3, p3, p3);
  push(`Test 3 — Play Action après 4 courses intérieures`);
  push(`  predictabilityScore=${p3.predictabilityScore}, bonus de surprise = +${bonus3} -> ${bonus3>=2 ? 'OK' : 'À AJUSTER'}`);

  // Test 4: Screen Pass doit punir le Nickel Blitz (et être neutralisé par une défense de base)
  const avgYards = (off, defName, N=2000, over) => {
    const def = DEFENSE_PLAYS.find(d=>d.name===defName);
    let y=0, to=0;
    for(let i=0;i<N;i++){
      const r = resolvePlay(off, def, {...fakeContext(over), surpriseBonus:0, repetitionPenalty:0});
      if(r.outcome !== 'interception' && r.outcome !== 'incomplete') y += r.yards;
      if(r.turnover) to++;
    }
    return {avg: y/N, to: to/N};
  };
  const offScreen = {name:'Screen Pass', type:'pass', direction:'middle', depth:'short'};
  const sB = avgYards(offScreen, 'Nickel Blitz'), sBase = avgYards(offScreen, 'Base 3-4');
  push(`Test 4 — Screen Pass vs Nickel Blitz / vs Base 3-4 (2000 essais chacun)`);
  push(`  ${sB.avg.toFixed(1)} yards vs blitz, ${sBase.avg.toFixed(1)} yards vs Base 3-4 -> ${sB.avg > sBase.avg + 2 ? 'OK' : 'À AJUSTER'}`);

  // Test 5: répétition excessive du même play -> pénalité croissante mais plafonnée
  let h5 = [
    fakeEntry('run','Inside Zone','middle','short'),
    fakeEntry('run','Inside Zone','middle','short'),
    fakeEntry('run','Inside Zone','middle','short'),
    fakeEntry('run','Inside Zone','middle','short'),
  ];
  let pen5 = calculateRepetitionPenalty({name:'Inside Zone', type:'run', direction:'middle', depth:'short'}, h5);
  push(`Test 5 — Inside Zone appelé 4 fois de suite`);
  push(`  malus de répétition = -${pen5} (plafond ${BALANCE.repetitionCaps.totalMax}) -> ${pen5>0 && pen5<=BALANCE.repetitionCaps.totalMax ? 'OK' : 'À AJUSTER'}`);

  // Test 6: l'IA ne doit pas contrer parfaitement à chaque fois
  let correctCount = 0, trials = 1000;
  let predHigh = {runProbability:0.9, passProbability:0.1, preferredDirection:'middle', preferredDepth:'mixed', predictabilityScore:90, confidence:0.95};
  for(let i=0;i<trials;i++){
    const def = chooseAIDefensivePlay(fakeContext({down:1,distance:10}), predHigh);
    if(def.type === 'runDefense') correctCount++;
  }
  const pct = Math.round(correctCount/trials*100);
  push(`Test 6 — IA face à une tendance course très forte (score=90), ${trials} essais`);
  push(`  défense anti-course choisie ${pct}% du temps (plafond visé 75-80%) -> ${pct<=85 ? 'OK' : 'À AJUSTER'}`);

  // Test 7: matchs complets simulés IA contre IA + contrôles d'intégrité
  const SIM_GAMES = 200;
  const agg = {};
  const allIssues = [];
  for(let i=0;i<SIM_GAMES;i++){
    const r = simulateFullGame();
    Object.keys(r.stats).forEach(k => agg[k] = (agg[k] || 0) + r.stats[k]);
    r.issues.forEach(msg => { if(allIssues.length < 8) allIssues.push(`match ${i+1} : ${msg}`); });
  }
  const per = k => (agg[k]/SIM_GAMES).toFixed(1);
  push(`Test 7 — ${SIM_GAMES} matchs complets simulés (IA contre IA)`);
  push(`  par match : ${per('points')} pts cumulés, ${per('plays')} snaps, ${per('tds')} TD, FG ${per('fgMade')}/${per('fgAtt')}, ${per('punts')} punts (${per('touchbacks')} touchbacks), ${per('turnovers')} turnovers, ${per('safeties')} safeties, ${per('pickSixes')} TD défensifs`);
  push(`  contrôles de règles (score, possession après score/safety/mi-temps, downs, terrain, fin de match) -> ${allIssues.length === 0 ? 'OK' : 'À CORRIGER'}`);
  allIssues.forEach(m => push('    ⚠ ' + m));
  const ypp = agg.yards/Math.max(1,agg.plays), conv3 = agg.thirdConv/Math.max(1,agg.thirdDowns);
  const favRate = agg.ratingFavGames ? agg.ratingFavWins/agg.ratingFavGames : 0;
  const ptsOK = agg.points/SIM_GAMES >= 30 && agg.points/SIM_GAMES <= 52;
  const toOK = agg.turnovers/SIM_GAMES >= 1.5 && agg.turnovers/SIM_GAMES <= 3.5;
  push(`  yards/snap ${ypp.toFixed(2)}, 3e tentatives converties ${(conv3*100).toFixed(0)}%, ${per('sacks')} sacks, ${per('breakaways')} échappées, écart moyen ${per('margin')} pts`);
  push(`  cibles Phase 2 : 30-52 pts/match -> ${ptsOK ? 'OK' : 'À AJUSTER'} · 1,5-3,5 turnovers -> ${toOK ? 'OK' : 'À AJUSTER'} · 5-6,5 yards/snap -> ${ypp >= 5 && ypp <= 6.5 ? 'OK' : 'À AJUSTER'} · 3e tentatives 33-48% -> ${conv3 >= 0.33 && conv3 <= 0.48 ? 'OK' : 'À AJUSTER'}`);
  push(`  équipe mieux notée (>= 8 pts d'écart) gagnante : ${(favRate*100).toFixed(0)}% des cas (${agg.ratingFavGames} matchs) -> ${favRate >= 0.55 && favRate <= 0.90 ? 'OK' : 'À AJUSTER'}`);
  const pctOf = (a, b) => b ? Math.round(a/b*100) : 0;
  push(`  gestion de match : transformations ${pctOf(agg.patMade, agg.patAtt)}% (${per('patAtt')}/match), 2 pts ${pctOf(agg.twoMade, agg.twoAtt)}% (${per('twoAtt')}/match), ${per('timeouts')} temps morts, ${per('kneels')} genoux, ${per('goForIt4th')} 4e tentatives jouées, onside ${agg.onsideRec||0}/${agg.onsideAtt||0}, touchbacks au kickoff ${pctOf(agg.kickTouchbacks, agg.kickoffs)}%`);
  push(`  prolongations : ${agg.overtimes||0} sur ${SIM_GAMES} matchs (${agg.ties||0} nuls) · ${per('expiredBeforeSnap')} fin de période avant le snap par match · ${per('oob')} sorties en touche décisives`);
  const twoOK = agg.twoAtt ? (agg.twoMade/agg.twoAtt >= 0.35 && agg.twoMade/agg.twoAtt <= 0.65) : true;
  push(`  cibles Phase 3 : transformation 90-97% -> ${agg.patAtt && agg.patMade/agg.patAtt >= 0.9 && agg.patMade/agg.patAtt <= 0.97 ? 'OK' : 'À AJUSTER'} · 2 pts 35-65% -> ${twoOK ? 'OK' : 'À AJUSTER'} · prolongation 2-15% des matchs -> ${(agg.overtimes||0)/SIM_GAMES >= 0.02 && (agg.overtimes||0)/SIM_GAMES <= 0.15 ? 'OK' : 'À AJUSTER'}`);

  // Test 8: table d'interactions — chaque contre doit se voir sur le terrain
  push(`Test 8 — Interactions tactiques (2000 essais par duel)`);
  const duel = (offName, dir, good, bad, over) => {
    const v = ALL_OFFENSE_VARIANTS.find(x => x.name === offName && x.direction === dir) || ALL_OFFENSE_VARIANTS.find(x => x.name === offName);
    const g = avgYards(v, good, 2000, over), b = avgYards(v, bad, 2000, over);
    const ok = g.avg > b.avg + 1.5;
    push(`  ${offName} : ${g.avg.toFixed(1)} y vs ${good} / ${b.avg.toFixed(1)} y vs ${bad} -> ${ok ? 'OK' : 'À AJUSTER'}`);
  };
  duel('Sweep', 'left', 'Inside Run Blitz', 'Edge Contain');
  duel('Play Action', 'middle', 'Eight-Man Box', 'Cover 4');
  duel('Four Verticals', 'middle', 'Cover 3', 'Cover 4');
  duel('Mesh Concept', 'middle', 'Cover 1', 'Cover 3');
  duel('Hitch / Curl', 'middle', 'Cover 3', 'Press Coverage');
  duel('Counter Run', 'left', 'Edge Contain', 'Base 3-4');
  // QB Sneak sur 3e & 1
  const sneak = {name:'QB Sneak', type:'run', depth:'short', direction:'middle'};
  const bear = DEFENSE_PLAYS.find(d=>d.name==='Bear Front');
  let conv=0; for(let i=0;i<2000;i++){ const r = resolvePlay(sneak, bear, {...fakeContext({down:3, distance:1}), surpriseBonus:0, repetitionPenalty:0}); if(r.outcome !== 'fumble' && r.yards >= 1) conv++; }
  push(`  QB Sneak sur 3e & 1 face au Bear Front : ${(conv/20).toFixed(0)}% de conversion (cible 65-90%) -> ${conv/2000 >= 0.65 && conv/2000 <= 0.9 ? 'OK' : 'À AJUSTER'}`);
  // Courbe des field goals
  const fg = [30,40,50,55].map(d => `${d}y ${Math.round(getFieldGoalSuccessChance(d)*100)}%`).join(', ');
  push(`  Field goals : ${fg} -> ${getFieldGoalSuccessChance(50) >= 0.6 && getFieldGoalSuccessChance(30) >= 0.9 ? 'OK' : 'À AJUSTER'}`);

  // Test 9: scénarios de gestion de match (règles déterministes)
  push(`Test 9 — Gestion de match (scénarios)`);
  const chk = (label, ok) => push(`  ${label} -> ${ok ? 'OK' : 'À CORRIGER'}`);
  chk('avertissement des 2 minutes : le chrono s\'arrête à 2:00 avant le snap', withTestGame({quarter:2, clock:125, clockRunning:true}, () => {
    const r = startSnapClock('normal'); return r.proceed && game.clock === 120 && !game.clockRunning && r.events.includes('twoMinute');
  }));
  chk('fin de mi-temps avant le snap : action annulée, mi-temps déclenchée', withTestGame({quarter:2, clock:10, clockRunning:true, twoMinuteWarned:{2:true}}, () => {
    const r = startSnapClock('normal'); return !r.proceed && game.pendingHalftime;
  }));
  chk('fin du 1er quart-temps avant le snap : l\'action se joue dans le 2e', withTestGame({quarter:1, clock:10, clockRunning:true}, () => {
    const r = startSnapClock('normal'); return r.proceed && game.quarter === 2 && game.clock === BALANCE.quarterLength;
  }));
  chk('temps mort : chrono arrêté, aucune seconde avant le snap', withTestGame({quarter:4, clock:200, clockRunning:true}, () => {
    const ok1 = useTimeout('player'); const before = game.clock; startSnapClock('normal');
    return ok1 && game.timeouts.player === 2 && game.clock === before;
  }));
  chk('no-huddle : moins de temps écoulé qu\'au tempo lent', withTestGame({}, () => {
    let h = 0, l = 0; for(let i=0;i<200;i++){ h += betweenSnapsSeconds('hurry'); l += betweenSnapsSeconds('slow'); } return h*2 < l;
  }));
  chk('IA menée de 7 à 1:30 de la fin, 4e & 8 sur ses 40 : elle tente sa chance', withTestGame({}, () =>
    aiFourthDownDecision(fakeContext({down:4, distance:8, quarter:4, timeRemaining:90, scoreDiff:-7, ballOn:40})) === 'goForIt'));
  chk('IA menée de 2 à 0:40, 4e & 6 sur les 25 adverses : field goal', withTestGame({}, () =>
    aiFourthDownDecision(fakeContext({down:4, distance:6, quarter:4, timeRemaining:40, scoreDiff:-2, ballOn:75})) === 'fieldGoal'));
  chk('IA devant de 3 à 2:00, 4e & 4 sur ses 30 : punt', withTestGame({}, () =>
    aiFourthDownDecision(fakeContext({down:4, distance:4, quarter:4, timeRemaining:120, scoreDiff:3, ballOn:30})) === 'punt'));
  chk('table de conversion : 2 pts si mené de 2 au Q4, transformation si mené de 1', withTestGame({quarter:4, clock:300, scorePlayer:10, scoreAI:12}, () => {
    const a = aiConversionChoice('player'); game.scorePlayer = 11; const b = aiConversionChoice('player'); return a === 'two' && b === 'pat';
  }));
  chk('prolongation : FG sur la 1re possession ne termine pas le match, TD ensuite oui', withTestGame({quarter:5, ot:{drives:1}, scorePlayer:20, scoreAI:20}, () => {
    score('player', 3); const cont = !game.pendingGameEnd; game.ot.drives = 2; score('ai', 6); return cont && game.pendingGameEnd;
  }));
  chk('genou à terre : devant de 4 à 1:10, 1re tentative, adversaire sans temps mort', withTestGame({quarter:4, clock:70, clockRunning:true, possession:'ai', scoreAI:24, scorePlayer:20, down:1, fieldPosition:60, timeouts:{player:0, ai:2}}, () =>
    aiKneelDecision('ai') && (game.clock = 200, !aiKneelDecision('ai'))));
  chk('course au centre contre Edge Contain : bonus (QB Keeper au centre)', withTestGame({}, () =>
    matchupModifier({name:'QB Keeper', type:'run', direction:'middle'}, {name:'Edge Contain'}).value > 0 &&
    matchupModifier({name:'QB Keeper', type:'run', direction:'left'}, {name:'Edge Contain'}).value < 0));

  push('');
  push('Tous les scores, bonus et malus détaillés sont visibles en direct dans "Détails du dernier calcul IA".');
  return lines.join('\n');
}
