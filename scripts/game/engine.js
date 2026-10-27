/* =========================================================================
   PHASE 2 — PROFILS TACTIQUES & TABLE D'INTERACTIONS
   =========================================================================
   Chaque défense porte des TAGS (ce qu'elle fait réellement : blitz, boîte
   chargée, couverture individuelle, zone profonde...). Chaque play offensif
   déclare comment il se comporte face à ces tags (vs : {tag: modificateur}).
   matchupModifier(off, def) = somme des modificateurs des tags présents,
   plafonnée. Positif = avantage attaque, négatif = avantage défense.
   Tous les chiffres sont réglables ici.
   ========================================================================= */
const DEF_TAG_LABELS = TEXTS.playbook.defenseTags;

// sackMod / intMod : multiplicateurs de sack et d'interception.
// bigPlayMod : multiplicateur du risque de gros gain concédé (échappée).
const DEFENSE_PROFILES = {
  'Eight-Man Box':     {tags:['box'], sackMod:1.0, intMod:0.8, bigPlayMod:1.4, ...TEXTS.playbook.defenseProfiles['Eight-Man Box']},
  'Bear Front':        {tags:['box'], sackMod:1.2, intMod:0.9, bigPlayMod:1.2, ...TEXTS.playbook.defenseProfiles['Bear Front']},
  'Inside Run Blitz':  {tags:['box','blitz','runBlitz'], sackMod:1.6, intMod:0.9, bigPlayMod:1.6, ...TEXTS.playbook.defenseProfiles['Inside Run Blitz']},
  'Edge Contain':      {tags:['edge'], sackMod:1.0, intMod:1.0, bigPlayMod:0.9, ...TEXTS.playbook.defenseProfiles['Edge Contain']},
  'Outside Run Stop':  {tags:['edge'], sackMod:0.9, intMod:1.0, bigPlayMod:1.0, ...TEXTS.playbook.defenseProfiles['Outside Run Stop']},
  'Press Coverage':    {tags:['man','press'], sackMod:1.1, intMod:1.1, bigPlayMod:1.4, ...TEXTS.playbook.defenseProfiles['Press Coverage']},
  'Cover 1':           {tags:['man'], sackMod:1.0, intMod:1.1, bigPlayMod:1.2, ...TEXTS.playbook.defenseProfiles['Cover 1']},
  'Nickel Blitz':      {tags:['blitz','man'], sackMod:2.0, intMod:1.2, bigPlayMod:1.7, ...TEXTS.playbook.defenseProfiles['Nickel Blitz']},
  'Cover 3':           {tags:['zone','cover3','deepShell'], sackMod:0.9, intMod:1.1, bigPlayMod:0.7, ...TEXTS.playbook.defenseProfiles['Cover 3']},
  'Cover 4':           {tags:['zone','cover4','deepShell','lightBox'], sackMod:0.8, intMod:1.1, bigPlayMod:0.5, ...TEXTS.playbook.defenseProfiles['Cover 4']},
  'Dime Defense':      {tags:['deepShell','lightBox','nickelDime'], sackMod:0.8, intMod:1.3, bigPlayMod:0.6, ...TEXTS.playbook.defenseProfiles['Dime Defense']},
  'Prevent Defense':   {tags:['deepShell','lightBox','prevent'], sackMod:0.5, intMod:1.2, bigPlayMod:0.3, ...TEXTS.playbook.defenseProfiles['Prevent Defense']},
  'Goal-Line Defense': {tags:['box','goalLine'], sackMod:0.9, intMod:0.9, bigPlayMod:1.8, ...TEXTS.playbook.defenseProfiles['Goal-Line Defense']},
  'Base 4-3':          {tags:['base'], sackMod:1.0, intMod:1.0, bigPlayMod:1.0, ...TEXTS.playbook.defenseProfiles['Base 4-3']},
  'Base 3-4':          {tags:['base','disciplined'], sackMod:1.1, intMod:1.0, bigPlayMod:1.0, ...TEXTS.playbook.defenseProfiles['Base 3-4']},
};

// vs : modificateurs par tag défensif. explosive : propension aux échappées.
// variance : dispersion des gains au sol. sackMod / intMod / compBonus : passes.
// shortYardage : bonus quand il reste 2 yards ou moins.
const OFFENSE_PROFILES = {
  'Inside Zone':    {vs:{box:-6, lightBox:8, edge:6, blitz:-2}, explosive:0.8, variance:1.0},
  'Power Run':      {vs:{box:-4, lightBox:6, edge:5, base:3}, explosive:0.6, variance:0.9, shortYardage:5},
  'Dive':           {vs:{box:-5, lightBox:5, edge:5}, explosive:0.4, variance:0.6, minYards:-1, shortYardage:3},
  'QB Sneak':       {vs:{box:-3, goalLine:-2}, explosive:0.1, variance:0.4, sneak:true, shortYardage:10},
  'Outside Zone':   {vs:{box:7, runBlitz:4, edge:-9, lightBox:3}, explosive:1.2, variance:1.2},
  'Sweep':          {vs:{box:9, runBlitz:6, edge:-12, man:3}, explosive:1.5, variance:1.5},
  'Toss':           {vs:{box:8, runBlitz:8, edge:-10}, explosive:1.3, variance:1.3},
  'Counter Run':    {vs:{edge:14, blitz:6, runBlitz:4, disciplined:-9, box:-2}, explosive:1.2, variance:1.2},
  'QB Keeper':      {vs:{man:8, deepShell:3, edge:-8}, explosive:1.1, variance:1.2},
  'Read Option':    {vs:{blitz:7, edge:-6, box:2, disciplined:-4}, explosive:1.3, variance:1.4, fumbleMod:1.5},
  'Quick Slant':    {vs:{blitz:8, zone:3, press:-8}, explosive:1.0, sackMod:0.5},
  'Screen Pass':    {vs:{blitz:12, runBlitz:8, base:-5, disciplined:-3, prevent:5, edge:-3}, explosive:1.3, sackMod:0.3, intMod:0.5, compBonus:0.10, minYards:-2},
  'Hitch / Curl':   {vs:{cover3:7, cover4:6, prevent:9, press:-9, man:-2}, explosive:0.6, sackMod:0.7},
  'Out Route':      {vs:{cover4:6, prevent:8, zone:2, man:-3, press:-4}, explosive:0.7, sackMod:0.7, intMod:1.4},
  'Crossing Route': {vs:{man:9, press:5, box:5, zone:-5, nickelDime:-4}, explosive:1.1},
  'Mesh Concept':   {vs:{man:11, press:7, blitz:4, cover3:-6, zone:-3}, explosive:1.0, sackMod:0.8},
  'Flood Concept':  {vs:{cover3:10, zone:3, cover4:-6, nickelDime:-5, man:-2}, explosive:1.0},
  'Play Action':    {vs:{box:10, runBlitz:6, edge:5, deepShell:-8, blitz:-4}, explosive:1.5, sackMod:1.4},
  'Deep Post':      {vs:{man:8, press:9, box:8, cover3:3, cover4:-7, deepShell:-5}, explosive:1.4, sackMod:1.3, intMod:1.2},
  'Four Verticals': {vs:{cover3:9, blitz:5, box:9, cover4:-10, prevent:-10, nickelDime:-6}, explosive:1.6, sackMod:1.4, intMod:1.4},
};
// Contexte : bonus d'avantage pour les plays de short yardage quand distance <= 2.

function offenseProfile(play){ return OFFENSE_PROFILES[play.name] || {vs:{}, explosive:1, variance:1}; }
function defenseProfile(play){ return DEFENSE_PROFILES[play.name] || {tags:[], sackMod:1, intMod:1, bigPlayMod:1}; }

// Retourne {value, reasons:[{tag, mod}]} — la valeur est plafonnée.
// Modificateurs effectifs d'une action selon sa DIRECTION (Phase 3) : une course
// au centre profite d'une défense qui protège les côtés (contain extérieur),
// même pour une action d'option (QB Keeper / Read Option jouées au centre).
function effectiveOffenseVs(op, play){
  const vs = {...(op.vs || {})};
  if(play && play.type === 'run' && play.direction === 'middle'){
    if((vs.edge || 0) < BALANCE.matchup.insideVsEdge) vs.edge = BALANCE.matchup.insideVsEdge;
  }
  return vs;
}
function matchupModifier(offPlay, defPlay){
  const op = offenseProfile(offPlay), dp = defenseProfile(defPlay);
  const vs = effectiveOffenseVs(op, offPlay);
  let value = 0; const reasons = [];
  (dp.tags || []).forEach(tag => {
    const mod = vs[tag];
    if(mod){ value += mod; reasons.push({tag, mod}); }
  });
  value = clamp(value, -BALANCE.matchup.cap, BALANCE.matchup.cap);
  return {value, reasons};
}

// Texte court « Fort : … · Faible : … » d'un play offensif, dérivé de la table.
function offenseCardText(name, play){
  const op = OFFENSE_PROFILES[name]; if(!op) return '';
  const entries = Object.entries(effectiveOffenseVs(op, play));
  const strong = entries.filter(e => e[1] >= 5).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e => DEF_TAG_LABELS[e[0]]);
  const weak = entries.filter(e => e[1] <= -5).sort((a,b)=>a[1]-b[1]).slice(0,2).map(e => DEF_TAG_LABELS[e[0]]);
  if(op.shortYardage >= 5) strong.unshift(TEXTS.playbook.card.shortYardage);
  if(op.sneak) weak.push(TEXTS.playbook.card.longDistance);
  if((op.intMod||1) >= 1.3) weak.push(TEXTS.playbook.card.interceptionRisk);
  if((op.sackMod||1) >= 1.3) weak.push(TEXTS.playbook.card.sackRisk);
  if(weak.length > 3) weak.length = 3;
  const parts = [];
  if(strong.length) parts.push(t('playbook.card.strong', {items:strong.slice(0,2).join(', ')}));
  if(weak.length) parts.push(t('playbook.card.weak', {items:weak.join(', ')}));
  return parts.join('\n');
}
function defenseCardText(name){
  const dp = DEFENSE_PROFILES[name]; if(!dp) return '';
  return `${t('playbook.card.strong', {items:dp.strong})}\n${t('playbook.card.weak', {items:dp.weak})}`;
}

// Moyenne pondérée de l'interaction attendue d'un candidat face aux appels
// récents de l'adversaire (utilisée par l'IA pour « lire » vos habitudes).
function expectedMatchupVsHistory(candidate, history, candidateIsOffense){
  if(!history || history.length === 0) return 0;
  const weights = BALANCE.historyWeights.slice(BALANCE.historyWeights.length - history.length);
  let tot = 0, wsum = 0;
  history.forEach((h, i) => {
    const w = weights[i] || 1;
    const other = {name: h.playName, type: h.type, direction: h.direction};
    const m = candidateIsOffense ? matchupModifier(candidate, other).value : matchupModifier(other, candidate).value;
    tot += m * w; wsum += w;
  });
  return wsum ? tot / wsum : 0;
}

/* ------------------------------- Utilitaires ------------------------------ */
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function dirLabel(d){ return TEXTS.playbook.directions[d] || d; }
function depthLabel(d){ return TEXTS.playbook.depths[d] || d; }
// Planifie une action différée LIÉE À LA PARTIE EN COURS : si un nouveau match
// est lancé entre-temps, l'action est ignorée au lieu de s'appliquer à la
// nouvelle partie.
function scheduleForGame(fn, ms){
  const g = game;
  return setTimeout(() => { if(game === g && !game.gameOver) fn(); }, ms);
}
function weightedPick(list, weights){
  const r = Math.random(); let cum = 0;
  for(let i=0;i<list.length;i++){ cum += weights[i]||0; if(r<=cum) return list[i]; }
  return list[list.length-1];
}

/* =========================================================================
   1) HISTORIQUE — ajout / troncature à 8 entrées
   ========================================================================= */
function addHistory(arr, entry){
  arr.push(entry);
  if(arr.length > 8) arr.shift();
}

function ensureOffensivePlayTotals(target){
  if(!target) return null;
  if(!target.offensivePlayTotals || typeof target.offensivePlayTotals !== 'object'){
    const countHistory = history => (history || []).reduce((counts, entry) => {
      if(entry.type === 'run') counts.run++;
      if(entry.type === 'pass') counts.pass++;
      return counts;
    }, {run:0, pass:0});
    target.offensivePlayTotals = {
      player: countHistory(target.offensivePlayHistoryPlayer),
      ai: countHistory(target.offensivePlayHistoryAI)
    };
  }
  ['player','ai'].forEach(side => {
    if(!target.offensivePlayTotals[side] || typeof target.offensivePlayTotals[side] !== 'object'){
      target.offensivePlayTotals[side] = {run:0,pass:0};
    }
    ['run','pass'].forEach(type => {
      const count = target.offensivePlayTotals[side][type];
      target.offensivePlayTotals[side][type] = Number.isFinite(count) && count >= 0 ? count : 0;
    });
  });
  return target.offensivePlayTotals;
}

function recordOffensivePlayTendency(side, type){
  if(type !== 'run' && type !== 'pass') return;
  const totals = ensureOffensivePlayTotals(game);
  totals[side][type]++;
}

function formatOffensivePlayTendency(totals){
  const total = totals.run + totals.pass;
  if(!total) return t('ui.status.noTendency');
  const runPct = Math.round(totals.run / total * 100);
  return t('ui.status.runsAndPasses', {run:runPct, pass:100-runPct, total});
}

function buildHistoryEntry(play, context, result, success){
  return {
    type: play.type, // 'run' | 'pass' | 'runDefense' | 'passDefense' | 'balanced'
    playName: play.name,
    direction: play.direction || 'mixed',
    depth: play.depth || 'mixed',
    down: context.down,
    distance: context.distance,
    quarter: context.quarter,
    timeRemaining: context.timeRemaining,
    result: result ? { yards: result.yards, outcome: result.outcome } : null,
    success: !!success
  };
}

/* =========================================================================
   2) ANALYSE PONDÉRÉE DE L'HISTORIQUE
   ========================================================================= */
function weightedStats(history){
  const n = history.length;
  const weights = BALANCE.historyWeights.slice(BALANCE.historyWeights.length - n);
  let totalWeight=0, runW=0, passW=0;
  const dirWeight = {left:0, middle:0, right:0};
  const depthWeight = {short:0, medium:0, deep:0};
  const playCount = {};
  history.forEach((h,i)=>{
    const w = weights[i] || 1;
    totalWeight += w;
    if(h.type==='run' || h.type==='runDefense') runW += w;
    if(h.type==='pass' || h.type==='passDefense') passW += w;
    // Défense équilibrée : neutre, compte pour moitié dans chaque catégorie.
    if(h.type==='balanced'){ runW += w/2; passW += w/2; }
    if(h.direction && dirWeight[h.direction] !== undefined) dirWeight[h.direction] += w;
    if(h.depth && depthWeight[h.depth] !== undefined) depthWeight[h.depth] += w;
    playCount[h.playName] = (playCount[h.playName]||0) + 1;
  });
  return {totalWeight, runW, passW, dirWeight, depthWeight, playCount, n};
}

/* =========================================================================
   3) calculatePredictability(history, context)
   Retourne runProbability, passProbability, preferredDirection, preferredDepth,
   predictabilityScore (0-100), confidence (0-1), explanation.
   ========================================================================= */
function calculatePredictability(history, context){
  if(!history || history.length === 0){
    return {
      runProbability:0.5, passProbability:0.5, preferredDirection:'mixed', preferredDepth:'mixed',
      predictabilityScore:8, confidence:0.05,
      explanation:t('ui.predictability.noData')
    };
  }
  const stats = weightedStats(history);
  let runProbability = stats.totalWeight ? stats.runW/stats.totalWeight : 0.5;
  let passProbability = 1 - runProbability;

  const dirTotal = stats.dirWeight.left + stats.dirWeight.middle + stats.dirWeight.right;
  let preferredDirection = 'mixed';
  if(dirTotal > 0){
    const sorted = Object.entries(stats.dirWeight).sort((a,b)=>b[1]-a[1]);
    if(sorted[0][1]/dirTotal >= 0.5) preferredDirection = sorted[0][0];
  }
  const depthTotal = stats.depthWeight.short + stats.depthWeight.medium + stats.depthWeight.deep;
  let preferredDepth = 'mixed';
  if(depthTotal > 0){
    const sortedD = Object.entries(stats.depthWeight).sort((a,b)=>b[1]-a[1]);
    if(sortedD[0][1]/depthTotal >= 0.5) preferredDepth = sortedD[0][0];
  }

  // ---- Ajustements contextuels (situation de jeu) ----
  let contextNote = '';
  if(context){
    const {down, distance, quarter, timeRemaining, scoreDiff, ballOn} = context;
    if(down === 3 && distance >= 7){
      passProbability = Math.min(0.95, passProbability + 0.20); runProbability = 1 - passProbability;
      contextNote = t('ui.predictability.thirdAndLong');
    }
    if((down === 3 || down === 4) && distance <= 2){
      runProbability = Math.min(0.90, runProbability + 0.15); passProbability = 1 - runProbability;
      contextNote = t('ui.predictability.shortYardage');
    }
    if(scoreDiff !== undefined && scoreDiff < -8 && quarter >= 4 && timeRemaining < 240){
      passProbability = Math.min(0.95, passProbability + 0.15); runProbability = 1 - passProbability;
      contextNote = t('ui.predictability.trailingLate');
    }
    if(ballOn !== undefined && ballOn >= 95){
      runProbability = Math.min(0.85, runProbability + 0.08); passProbability = 1 - runProbability;
    }
  }

  // ---- Score de prévisibilité (0-100) ----
  const runPassSkew = Math.abs(runProbability - 0.5) * 2; // 0..1
  let maxPlayCount = 0;
  Object.values(stats.playCount).forEach(c => { if(c > maxPlayCount) maxPlayCount = c; });
  const playRepetitionFactor = Math.min(1, maxPlayCount / Math.max(1, stats.n));
  const dirSkew = dirTotal > 0 ? Math.max(stats.dirWeight.left, stats.dirWeight.middle, stats.dirWeight.right) / dirTotal : 0;
  const depthSkew = depthTotal > 0 ? Math.max(stats.depthWeight.short, stats.depthWeight.medium, stats.depthWeight.deep) / depthTotal : 0;
  const sampleFactor = stats.n / 8;

  let rawScore = (runPassSkew*40) + (playRepetitionFactor*25) + (dirSkew*20) + (depthSkew*15);
  const predictabilityScore = Math.round(clamp(rawScore * (0.45 + 0.55*sampleFactor), 0, 100));
  const confidence = Math.min(1, stats.n/8);

  const dominant = runProbability >= passProbability ? t('ui.predictability.runs') : t('ui.predictability.passes');
  let explanation = t('ui.predictability.detected', {percent:Math.round(Math.max(runProbability,passProbability)*100), playType:dominant});
  if(preferredDirection !== 'mixed') explanation += t('ui.predictability.preferDirection', {direction:dirLabel(preferredDirection)});
  if(preferredDepth !== 'mixed' && dominant === t('ui.predictability.passes')) explanation += t('ui.predictability.passDepth', {depth:depthLabel(preferredDepth)});
  explanation += '.';
  if(contextNote) explanation += ' ' + contextNote;

  return {runProbability, passProbability, preferredDirection, preferredDepth, predictabilityScore, confidence, explanation};
}

/* =========================================================================
   4) chooseAIDefensivePlay(context, predictability)
   L'IA choisit sa défense quand le JOUEUR attaque.
   ========================================================================= */
function chooseAIDefensivePlay(context, predictability, oppHistory){
  const {down, distance, ballOn} = context;
  const candidates = DEFENSE_PLAYS.map(p => ({...p, score:0}));
  candidates.forEach(c => {
    let score = 0;
    score += predictability.runProbability * (c.vsRun||0) * 100;
    score += predictability.passProbability * (c.vsPass||0) * 100;
    if(predictability.preferredDirection !== 'mixed'){
      if(predictability.preferredDirection === 'middle' && c.target === 'middle') score += 15;
      if(predictability.preferredDirection !== 'middle' && c.target === 'outside') score += 10;
    }
    if(predictability.preferredDepth !== 'mixed'){
      if(predictability.preferredDepth === 'short' && c.target === 'short') score += 15;
      if(predictability.preferredDepth === 'deep' && c.target === 'deep') score += 15;
    }
    if(down === 3 && distance >= 7 && c.type === 'passDefense') score += 15;
    if((down === 3 || down === 4) && distance <= 2 && c.type === 'runDefense') score += 15;
    if(ballOn >= 95 && (c.name === 'Goal-Line Defense' || c.name === 'Eight-Man Box')) score += 20;
    if(c.name === 'Goal-Line Defense' && ballOn < 80) score -= 25;      // exposée loin de l'en-but
    if(c.name === 'Prevent Defense' && !(context.quarter >= 4 && context.timeRemaining < 180 && context.scoreDiff < 0)) score -= 15;
    // Lecture des habitudes : défense qui neutralise les plays récents de l'adversaire
    score -= expectedMatchupVsHistory(c, oppHistory, false) * BALANCE.aiMatchupWeight;
    c.score = score;
  });

  // Plafond d'adaptation : l'IA ne doit JAMAIS contrer parfaitement à chaque fois (75-80% max)
  const adaptationChance = clamp(
    BALANCE.aiDefenseAdaptationBase + (predictability.predictabilityScore/100) * BALANCE.aiDefenseAdaptationScale,
    BALANCE.aiDefenseAdaptationBase, BALANCE.aiDefenseAdaptationMax
  ) - (context.tempo === 'hurry' ? BALANCE.tempo.hurryAdaptationMalus : 0); // no-huddle : moins de temps pour s'ajuster

  let chosen, adapted;
  if(Math.random() < adaptationChance){
    const sorted = [...candidates].sort((a,b)=>b.score-a.score);
    chosen = weightedPick(sorted.slice(0,3), [0.55,0.30,0.15]);
    adapted = true;
  } else {
    chosen = candidates[randInt(0, candidates.length-1)];
    adapted = false;
  }
  chosen._adapted = adapted;
  chosen._adaptationChance = adaptationChance;
  return chosen;
}

/* =========================================================================
   5) chooseAIOffensivePlay(context, predictability)
   L'IA choisit son attaque quand le JOUEUR défend. `predictability` décrit ici
   la tendance défensive du joueur (calculée sur defensivePlayHistoryPlayer).
   ========================================================================= */
function chooseAIOffensivePlay(context, predictability, oppHistory){
  const candidates = ALL_OFFENSE_VARIANTS.map(v => ({...v, score:0}));
  candidates.forEach(c => {
    let score = 0;
    // Si le joueur défend beaucoup contre la course (runProbability haut côté défense),
    // la passe devient plus intéressante pour l'IA, et inversement.
    if(c.type === 'run') score += predictability.passProbability * 50;
    if(c.type === 'pass') score += predictability.runProbability * 50;
    if(predictability.preferredDirection !== 'mixed'){
      score += (c.direction !== predictability.preferredDirection) ? 14 : -8;
    }
    if(predictability.preferredDepth !== 'mixed' && c.type === 'pass'){
      score += (c.depth !== predictability.preferredDepth) ? 12 : -8;
    }
    if(context.down === 3 && context.distance >= 7 && c.type === 'pass') score += 12;
    if((context.down === 3 || context.down === 4) && context.distance <= 2 && c.type === 'run') score += 12;
    if(context.ballOn >= 95 && c.type === 'run') score += 8;
    if(c.name === 'QB Sneak' && context.distance > 2) score -= 20;      // inutile sur longue distance
    if(context.distance <= 2 && OFFENSE_PROFILES[c.name] && OFFENSE_PROFILES[c.name].shortYardage) score += 8;
    // Lecture des habitudes : play qui exploite les défenses récentes de l'adversaire
    score += expectedMatchupVsHistory(c, oppHistory, true) * BALANCE.aiMatchupWeight;
    c.score = score;
  });

  const adaptationChance = clamp(
    BALANCE.aiOffenseAdaptationBase + (predictability.predictabilityScore/100) * BALANCE.aiOffenseAdaptationScale,
    BALANCE.aiOffenseAdaptationBase, BALANCE.aiOffenseAdaptationMax
  );

  let chosen;
  if(Math.random() < adaptationChance){
    const sorted = [...candidates].sort((a,b)=>b.score-a.score);
    chosen = weightedPick(sorted.slice(0,3), [0.55,0.30,0.15]);
  } else {
    chosen = candidates[randInt(0, candidates.length-1)];
  }
  return chosen;
}

/* =========================================================================
   6) calculateSurpriseBonus(actualPlay, predictedTendency, predictabilityData)
   Récompense le joueur qui casse une tendance claire (seulement sur SES
   appels offensifs, conformément au brief).
   ========================================================================= */
function calculateSurpriseBonus(actualPlay, predictedTendency, predictabilityData){
  const score = predictabilityData.predictabilityScore;
  const brokeType = (predictedTendency.runProbability >= 0.55 && actualPlay.type === 'pass') ||
                     (predictedTendency.passProbability >= 0.55 && actualPlay.type === 'run');
  const brokeDirection = predictedTendency.preferredDirection !== 'mixed' && actualPlay.direction !== predictedTendency.preferredDirection;
  const brokeDepth = actualPlay.type === 'pass' && predictedTendency.preferredDepth !== 'mixed' && actualPlay.depth !== predictedTendency.preferredDepth;

  let breakFactor = (brokeType?0.6:0) + (brokeDirection?0.25:0) + (brokeDepth?0.15:0);
  breakFactor = Math.min(1, breakFactor);

  let range;
  if(score < 35) range = BALANCE.surpriseBonusRanges.low;
  else if(score <= 60) range = BALANCE.surpriseBonusRanges.mid;
  else if(score <= 80) range = BALANCE.surpriseBonusRanges.high;
  else range = BALANCE.surpriseBonusRanges.vhigh;

  const bonus = range[0] + (range[1]-range[0]) * breakFactor;
  return Math.round(bonus * 10) / 10;
}

/* =========================================================================
   7) calculateRepetitionPenalty(actualPlay, history)
   Pénalise la répétition exacte, de catégorie, et de direction/profondeur.
   ========================================================================= */
function calculateRepetitionPenalty(actualPlay, history){
  if(!history || history.length === 0) return 0;

  const recent5 = history.slice(-5);
  const exactCount = recent5.filter(h => h.playName === actualPlay.name).length;
  let exactPenalty = 0;
  if(exactCount >= 2) exactPenalty = Math.min(BALANCE.repetitionCaps.exactMax, 4 * exactCount);

  const last8 = history.slice(-8);
  const sameCategoryCount = last8.filter(h => h.type === actualPlay.type).length;
  let categoryPenalty = 0;
  if(sameCategoryCount >= 5) categoryPenalty = Math.min(BALANCE.repetitionCaps.categoryMax, 2 * (sameCategoryCount - 3));

  let dirDepthPenalty = 0;
  const sameDir = last8.filter(h => h.direction === actualPlay.direction && actualPlay.direction !== 'mixed').length;
  if(sameDir >= 5) dirDepthPenalty += 4;
  const sameDepth = last8.filter(h => h.depth === actualPlay.depth).length;
  if(sameDepth >= 5) dirDepthPenalty += 3;
  dirDepthPenalty = Math.min(BALANCE.repetitionCaps.directionDepthMax, dirDepthPenalty);

  return Math.min(BALANCE.repetitionCaps.totalMax, exactPenalty + categoryPenalty + dirDepthPenalty);
}

/* =========================================================================
   8) resolvePlay(offPlay, defPlay, context)
   finalAdvantage = baseMatchup + teamRatings + situation + surprise - repetition + randomness
   ========================================================================= */
function resolvePlay(offPlay, defPlay, context){
  const B = BALANCE.resolution;
  const op = offenseProfile(offPlay), dp = defenseProfile(defPlay);

  // 1) Couche « catégorie » (course/passe vs type de défense, cible, profondeur)
  let base = 0;
  if(offPlay.type === 'run'){
    if(defPlay.type === 'runDefense') base -= B.runVsRunDef;
    else if(defPlay.type === 'passDefense') base += B.runVsPassDef;
    if(defPlay.target === 'middle' && offPlay.direction === 'middle') base -= B.targetMatch;
    if(defPlay.target === 'outside' && offPlay.direction !== 'middle') base -= B.targetMatch;
  } else {
    if(defPlay.type === 'passDefense') base -= B.passVsPassDef;
    else if(defPlay.type === 'runDefense') base += B.passVsRunDef;
    if(defPlay.target === offPlay.depth) base -= B.targetMatch;
  }

  // 2) Couche « interaction spécifique » (table OFFENSE_PROFILES x DEFENSE_PROFILES)
  const matchup = matchupModifier(offPlay, defPlay);

  // 3) Notes d'équipe : attaque de l'équipe en possession vs défense adverse
  const offR = context.offenseRating !== undefined ? context.offenseRating : 78;
  const defR = context.defenseRating !== undefined ? context.defenseRating : 78;
  const teamRatingsModifier = (offR - defR) * BALANCE.ratings.advantagePerPoint;

  // 4) Situation
  let situationModifier = 0;
  if(context.distance <= 2 && op.shortYardage) situationModifier += op.shortYardage;
  if(context.ballOn >= 95) situationModifier -= 5;
  // Goal-Line Defense jouée loin de la zone d'en-but : très exposée
  if(defPlay.name === 'Goal-Line Defense' && context.ballOn < 80) situationModifier += 6;
  // No-huddle : exécution un peu moins précise
  if(context.tempo === 'hurry') situationModifier += BALANCE.tempo.hurryAdvantage;

  const controlledRandomness = Math.random()*B.randomness*2 - B.randomness;
  let breakProb = 0, breakYards = 0;
  let finalAdvantage = base + matchup.value + teamRatingsModifier + situationModifier +
                        (context.surpriseBonus||0) - (context.repetitionPenalty||0) + controlledRandomness;
  finalAdvantage = clamp(finalAdvantage, -45, 55);

  let yards = 0, outcome = 'gain', turnover = false, breakaway = false;
  const bigMod = (op.explosive || 1) * (dp.bigPlayMod || 1);

  if(offPlay.type === 'pass'){
    const baseCompletion = (B.completion[offPlay.depth] || 0.6) + (op.compBonus || 0);
    const compProb = clamp(baseCompletion + finalAdvantage/B.completionSlope, 0.15, 0.95);
    const sackProb = clamp((B.sackBase - finalAdvantage/B.sackSlope) * (dp.sackMod||1) * (op.sackMod||1), 0.008, 0.22);
    const intProb  = clamp((B.intBase - finalAdvantage/B.intSlope) * (dp.intMod||1) * (op.intMod||1), 0.004, 0.08);
    const roll = Math.random();
    if(roll < sackProb){
      outcome = 'sack'; yards = -(randInt(2,8));
    } else if(roll < sackProb + intProb){
      outcome = 'interception'; yards = 0; turnover = true;
    } else if(Math.random() > compProb){
      outcome = 'incomplete'; yards = 0;
    } else {
      outcome = 'completion';
      const baseYd = B.passYards[offPlay.depth] || 10;
      yards = Math.round(baseYd + finalAdvantage/B.passYardsSlope + (Math.random()*6-3));
      const breakP = clamp((B.passBreakBase + finalAdvantage/B.breakSlope) * bigMod, 0, 0.30);
      breakProb = breakP;
      if(Math.random() < breakP){ breakYards = randInt(B.breakMin, B.breakMax); yards += breakYards; breakaway = true; }
      yards = Math.max(op.minYards !== undefined ? op.minYards : 0, yards);
      if(Math.random() < B.catchFumble){ outcome = 'fumble'; turnover = true; }
    }
  } else if(op.sneak){
    // QB Sneak : gain court mais très fiable, plafonné.
    yards = clamp(Math.round(1.6 + finalAdvantage/14 + (Math.random()*2-1)), -1, 4);
    if(Math.random() < B.runFumble * 0.5){ outcome = 'fumble'; turnover = true; }
  } else {
    const baseYd = offPlay.depth === 'short' ? B.runYards.inside : B.runYards.outside;
    const variance = op.variance || 1;
    yards = Math.round(baseYd + finalAdvantage/B.runYardsSlope + (Math.random()*6-3)*variance);
    const breakP = clamp((B.runBreakBase + finalAdvantage/B.breakSlope) * bigMod, 0, 0.25);
    breakProb = breakP;
    if(Math.random() < breakP){ breakYards = randInt(B.breakMin, B.breakMax); yards += breakYards; breakaway = true; }
    const floor = op.minYards !== undefined ? op.minYards : -Math.round(3 + variance*1.5);
    if(yards < floor) yards = floor;
    outcome = 'gain';
    if(Math.random() < B.runFumble * (op.fumbleMod||1)){ outcome = 'fumble'; turnover = true; }
  }

  return {yards, outcome, turnover, breakaway,
    finalAdvantage: Math.round(finalAdvantage*10)/10,
    matchup: matchup.value, matchupReasons: matchup.reasons,
    ratingsModifier: Math.round(teamRatingsModifier*10)/10, situationModifier,
    base, randomness: Math.round(controlledRandomness*10)/10,
    breakProb: Math.round(breakProb*1000)/10, breakYards};
}

/* =========================================================================
   COIN TOSS — séquence d'ouverture de match et de seconde mi-temps
   Fonctions demandées : startCoinToss(), resolveCoinToss(callingTeam, call),
   handleTossWinnerDecision(team, decision), setOpeningPossession(decision,
   winningTeam, otherTeam), startKickoff(receivingTeam, kickoffType),
   startSecondHalfKickoff(). Toute la logique vit ici ; l'interface
   (renderTossModal) ne fait qu'afficher les étapes et transmettre les choix.
   ========================================================================= */
function teamNameOf(t){
  if(game && game.teams) return game.teams[t].name;
  return t === 'player' ? TEXTS.ui.static.playerTeamName : TEXTS.ui.static.aiTeamName;
}
function teamLabel(t){ return `les ${teamNameOf(t)}`; }
function teamLabelShort(t){ return teamNameOf(t); }
function callLabel(c){ return t(c === 'heads' ? 'game.coinToss.heads' : 'game.coinToss.tails'); }
function decisionLabel(d){ return t(d === 'receive' ? 'game.coinToss.decisionReceive' : d === 'kick' ? 'game.coinToss.decisionKick' : 'game.coinToss.decisionDefer'); }

function logMatch(msg){
  game.matchLog.push(msg);
  renderMatchLog();
}
function renderMatchLog(){
  const el = document.getElementById('matchLogEl');
  if(!el) return;
  el.textContent = game.matchLog.length ? game.matchLog.join('\n') : t('game.match.matchLogEmpty');
  el.scrollTop = el.scrollHeight;
}

function weightedChoiceFromWeights(weightsObj){
  const entries = Object.entries(weightsObj);
  const r = Math.random();
  let cum = 0;
  for(const [key, w] of entries){ cum += w; if(r <= cum) return key; }
  return entries[entries.length-1][0];
}

function showTossOverlay(){ document.getElementById('tossOverlay').classList.remove('hidden'); }
function hideTossOverlay(){ document.getElementById('tossOverlay').classList.add('hidden'); }

function renderTossModal(){
  showTossOverlay();
  const title = document.getElementById('tossTitle');
  const body = document.getElementById('tossBody');
  const actions = document.getElementById('tossActions');
  const coin = document.getElementById('coinEl');
  actions.innerHTML = '';
  coin.classList.remove('spin');

  if(game.phase === 'coinToss'){
    title.textContent = t('ui.static.coinTossTitle');
    coin.textContent = '?';
    if(game.tossCallingTeam === 'player'){
      body.textContent = t('game.coinToss.callPrompt');
      const h = document.createElement('button'); h.className = 'action-btn'; h.textContent = t('game.coinToss.headsEnglish');
      h.onclick = () => resolveCoinToss('player', 'heads');
      const tailsButton = document.createElement('button'); tailsButton.className = 'action-btn secondary'; tailsButton.textContent = t('game.coinToss.tailsEnglish');
      tailsButton.onclick = () => resolveCoinToss('player', 'tails');
      actions.appendChild(h); actions.appendChild(tailsButton);
    } else {
      body.textContent = t('game.coinToss.aiCalls', {team:teamLabel('ai'), call:callLabel(game.tossAICall)});
    }
    return;
  }
  if(game.phase === 'flipping'){
    title.textContent = t('game.coinToss.flipping');
    body.textContent = '';
    coin.textContent = '?';
    coin.classList.add('spin');
    return;
  }
  if(game.phase === 'tossResult'){
    title.textContent = t('game.coinToss.resultTitle');
    coin.textContent = game.tossActualResult === 'heads' ? 'P' : 'F';
    body.innerHTML = t('game.coinToss.result', {call:callLabel(game.tossActualResult), team:teamLabelShort(game.tossWinner)});
    if(game.tossWinner === 'player'){
      body.innerHTML += `<br><br>${t('game.coinToss.winnerDecisionPrompt')}`;
      const r = document.createElement('button'); r.className = 'action-btn'; r.textContent = t('game.coinToss.receiveAndStartOffense');
      r.onclick = () => handleTossWinnerDecision('player', 'receive');
      const k = document.createElement('button'); k.className = 'action-btn secondary'; k.textContent = t('game.coinToss.kickAndStartDefense');
      k.onclick = () => handleTossWinnerDecision('player', 'kick');
      actions.appendChild(r); actions.appendChild(k);
    } else {
      body.innerHTML += `<br><br>${t('game.coinToss.aiThinking', {team:teamLabel('ai')})}`;
    }
    return;
  }
  if(game.phase === 'deferChoice'){
    title.textContent = t('game.coinToss.deferTitle');
    coin.textContent = game.tossActualResult === 'heads' ? 'P' : 'F';
    body.textContent = t('game.coinToss.deferPrompt', {team:teamLabelShort(game.deferOtherTeam)});
    const r = document.createElement('button'); r.className = 'action-btn'; r.textContent = t('game.coinToss.receive');
    r.onclick = () => handleDeferSubChoice('receive');
    const k = document.createElement('button'); k.className = 'action-btn secondary'; k.textContent = t('game.coinToss.kick');
    k.onclick = () => handleDeferSubChoice('kick');
    actions.appendChild(r); actions.appendChild(k);
    return;
  }
  if(game.phase === 'kickoff'){
    title.textContent = t('game.coinToss.kickoffTitle');
    coin.textContent = '🏈';
    body.textContent = game.lastKickoffMessage || t('game.coinToss.kickoffDefault');
    return;
  }
}

function startCoinToss(){
  game.phase = 'coinToss';
  game.tossCallingTeam = Math.random() < 0.5 ? 'player' : 'ai';
  if(game.tossCallingTeam === 'ai'){
    game.tossAICall = Math.random() < 0.5 ? 'heads' : 'tails';
    logMatch(t('game.coinToss.aiCalls', {team:teamLabel('ai'), call:callLabel(game.tossAICall)}));
  }
  renderTossModal();
  if(game.tossCallingTeam === 'ai'){
    scheduleForGame(() => resolveCoinToss('ai', game.tossAICall), 900);
  }
}

function resolveCoinToss(callingTeam, call){
  game.phase = 'flipping';
  renderTossModal();
  const actual = Math.random() < 0.5 ? 'heads' : 'tails';
  const winner = (call === actual) ? callingTeam : (callingTeam === 'player' ? 'ai' : 'player');
  game.tossActualResult = actual;
  game.tossWinner = winner;
  scheduleForGame(() => {
    game.phase = 'tossResult';
    logMatch(t('game.coinToss.resultLog', {call:callLabel(actual), team:teamLabel(winner)}));
    renderTossModal();
    if(winner === 'ai'){
      scheduleForGame(() => {
        const decision = weightedChoiceFromWeights(BALANCE.coinTossAIWeights);
        handleTossWinnerDecision('ai', decision);
      }, 1000);
    }
  }, 1300);
}

function handleTossWinnerDecision(team, decision){
  const otherTeam = team === 'player' ? 'ai' : 'player';
  logMatch(t('game.coinToss.decisionLog', {team:teamLabel(team), decision:decisionLabel(decision)}));
  setOpeningPossession(decision, team, otherTeam);
}

function setOpeningPossession(decision, winningTeam, otherTeam){
  if(decision === 'receive'){
    game.secondHalfReceivingTeam = otherTeam;
    startKickoff(winningTeam, 'opening');
  } else if(decision === 'kick'){
    game.secondHalfReceivingTeam = winningTeam;
    startKickoff(otherTeam, 'opening');
  } else { // defer
    game.secondHalfReceivingTeam = winningTeam;
    if(otherTeam === 'ai'){
      const sub = Math.random() < BALANCE.coinTossAIDeferSubReceiveChance ? 'receive' : 'kick';
      logMatch(t('game.match.deferredChoice', {team:teamLabel(otherTeam), decision:decisionLabel(sub)}));
      startKickoff(sub === 'receive' ? otherTeam : winningTeam, 'opening');
    } else {
      game.phase = 'deferChoice';
      game.deferOtherTeam = otherTeam;
      game.deferWinningTeam = winningTeam;
      renderTossModal();
    }
  }
}

function handleDeferSubChoice(decision){
  const otherTeam = game.deferOtherTeam;
  const winningTeam = game.deferWinningTeam;
  logMatch(t('game.match.deferredChoice', {team:teamLabel(otherTeam), decision:decisionLabel(decision)}));
  startKickoff(decision === 'receive' ? otherTeam : winningTeam, 'opening');
}

function startKickoff(receivingTeam, kickoffType){
  game.phase = 'kickoff';
  game.lastKickoffMessage = t('game.match.kickoffMessage', {kicking:teamLabel(otherSide(receivingTeam)), receiving:teamLabel(receivingTeam)});
  logMatch(game.lastKickoffMessage);
  renderTossModal();
  scheduleForGame(() => {
    const k = kickoffReset(receivingTeam);
    logMatch(k.text);
    game.phase = 'playing';
    hideTossOverlay();
    setResult(t('game.match.kickoffTitle'), k.text, '');
    syncFieldVisualsNow();
    SaveManager.snapshot();
  }, 1100);
}

function startSecondHalfKickoff(){
  game.phase = 'kickoff';
  const receiver = game.secondHalfReceivingTeam;
  game.lastKickoffMessage = t('game.match.secondHalfKickoff', {team:teamLabel(receiver)});
  logMatch(game.lastKickoffMessage);
  renderTossModal();
  scheduleForGame(() => {
    beginSecondHalfState();
    const k = kickoffReset(receiver);
    logMatch(k.text);
    game.phase = 'playing';
    hideTossOverlay();
    setResult(t('game.match.secondHalfTitle'), k.text + ` ${t('game.match.secondHalfResume')}`, '');
    syncFieldVisualsNow();
    SaveManager.snapshot();
  }, 1200);
}

/* =========================================================================
   ÉTAT DU JEU
   ========================================================================= */
let game = null;
function newGame(){
  const teams = generateMatchTeams();
  game = {
    phase: 'pregame', // 'pregame' | 'coinToss' | 'flipping' | 'tossResult' | 'deferChoice' | 'kickoff' | 'playing'
    teams,
    quarter: 1,
    clock: BALANCE.quarterLength,
    down: 1,
    distance: 10,
    fieldPosition: 50, // 0 = but de l'équipe du joueur, 100 = but de l'IA — placé par le kickoff d'ouverture
    possession: 'player', // valeur temporaire tant que le coin toss n'a pas eu lieu
    scorePlayer: 0,
    scoreAI: 0,
    offensivePlayHistoryPlayer: [],
    defensivePlayHistoryPlayer: [],
    offensivePlayHistoryAI: [],
    defensivePlayHistoryAI: [],
    offensivePlayTotals: {
      player: {run:0, pass:0},
      ai: {run:0, pass:0}
    },
    gameOver: false,
    lastDebug: null,
    matchLog: [],
    secondHalfReceivingTeam: null,
    pendingHalftime: false,
    pendingGameEnd: false,
    pendingRegulationEnd: false,
    pendingOvertime: false,
    pendingConversion: null,
    pendingKickoff: null,
    ot: null,
    clockRunning: false,
    timeouts: {player: BALANCE.timeoutsPerHalf, ai: BALANCE.timeoutsPerHalf},
    twoMinuteWarned: {},
    playerTempo: 'normal',
    snapTempo: 'normal',
    pendingPlayerDefense: null,
    tossCallingTeam: null,
    tossAICall: null,
    tossActualResult: null,
    tossWinner: null,
    deferOtherTeam: null,
    deferWinningTeam: null,
    lastKickoffMessage: '',
    animSpeed: Storage.get('animSpeed', BALANCE.animation.defaultSpeed),
    skipAnimRequested: false,
    playLocked: false,
    currentDrive: null,
    lastFinishedDrive: null,
    animDebugEnabled: false,
    // Positions RÉELLEMENT affichées sur le terrain (ligne de scrimmage, ligne à
    // gagner, ballon posé). Distinctes de fieldPosition/down/distance : elles ne
    // bougent qu'au moment où le porteur tombe (voir PlayAnimationController),
    // jamais dès que le moteur a résolu le play.
    visualBallX: 50,
    visualFirstDownX: 60
  };
  PlayAnimationController.cancelCurrent(); // annule proprement toute animation d'une éventuelle partie précédente
  if(typeof ballState !== 'undefined') ballState.visible = false;
  clearTempPlayers();
  document.getElementById('finalOverlay').classList.add('hidden');
  document.getElementById('driveSummaryPanel').classList.add('hidden');
  document.getElementById('eventBannerLayer').innerHTML = '';
  document.getElementById('celebrationLayer').innerHTML = '';
  hideChoice();
  buildFieldMarkings();
  applyTeamColorsToCSS(teams);
  applyTeamNamesToUI(teams);
  document.getElementById('animSpeedSelect').value = String(game.animSpeed);
  document.getElementById('versionTag').textContent = 'v' + GAME_VERSION;
  AudioManager.enabled = Storage.get('audioEnabled', BALANCE.audio.defaultEnabled);
  AudioManager.volume = Storage.get('audioVolume', BALANCE.audio.defaultVolume);
  AudioManager.setMusicEnabled(false);
  document.getElementById('audioEnabledToggle').checked = AudioManager.enabled;
  document.getElementById('audioVolumeSlider').value = String(AudioManager.volume);
  render();
  showPregameScreen();
}

function applyTeamNamesToUI(teams){
  document.getElementById('headerTeamPlayer').textContent = teams.player.name;
  document.getElementById('headerTeamAI').textContent = teams.ai.name;
  document.getElementById('scoreNamePlayer').textContent = t('ui.static.playerTeam', {team:teams.player.name});
  document.getElementById('scoreNameAI').textContent = t('ui.static.aiTeam', {team:teams.ai.name});
  const ezL = document.getElementById('endzoneLeft'), ezR = document.getElementById('endzoneRight');
  ezL.textContent = teams.player.name.toUpperCase();
  ezR.textContent = teams.ai.name.toUpperCase();
  ezL.style.background = hexA(teams.player.color, 0.38);
  ezR.style.background = hexA(teams.ai.color, 0.38);
  ezL.style.color = ezR.style.color = 'rgba(255,255,255,0.85)';
  document.getElementById('historyLabel').textContent = t('ui.static.playHistory', {team:teams.player.name});
  document.getElementById('tossTeamPlayerName').textContent = teams.player.name;
  document.getElementById('tossTeamAIName').textContent = teams.ai.name;
}

function showPregameScreen(){
  renderPregameBody();
  document.getElementById('pregameOverlay').classList.remove('hidden');
  document.getElementById('teamPicker').classList.add('hidden');
  document.getElementById('teamPickerToggle').textContent = t('ui.static.chooseTeams');
  logMatch(t('game.match.teamMatchup', {player:game.teams.player.name, ai:game.teams.ai.name}));
}
function selectTeam(side, id){
  if(game.phase !== 'pregame') return;
  const otherSide = side === 'player' ? 'ai' : 'player';
  if(game.teams[otherSide].id === id) game.teams[otherSide] = makeTeam(game.teams[side].id); // échange
  game.teams[side] = makeTeam(id);
  applyTeamColorsToCSS(game.teams);
  applyTeamNamesToUI(game.teams);
  renderPregameBody();
  renderTeamPicker();
  render();
}
function randomizeTeams(){
  if(game.phase !== 'pregame') return;
  game.teams = generateMatchTeams();
  applyTeamColorsToCSS(game.teams); applyTeamNamesToUI(game.teams);
  renderPregameBody(); renderTeamPicker(); render();
}
function toggleTeamPicker(){
  const el = document.getElementById('teamPicker');
  const show = el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  document.getElementById('teamPickerToggle').textContent = t(show ? 'ui.static.hideTeams' : 'ui.static.chooseTeams');
  if(show) renderTeamPicker();
}
function renderTeamPicker(){
  const wrap = document.getElementById('teamPickerList');
  if(!wrap) return;
  const sortKey = document.getElementById('teamSortSelect').value;
  const list = TEAM_DB.slice().sort((a,b) => sortKey === 'name' ? a.name.localeCompare(b.name)
    : (b.ratings[sortKey] - a.ratings[sortKey]) || a.name.localeCompare(b.name));
  const pid = game.teams.player.id, aid = game.teams.ai.id;
  wrap.innerHTML = `<table class="team-table"><thead><tr><th>${t('ui.teamPicker.team')}</th><th title="${t('ui.teamPicker.offenseTitle')}">${t('ui.teamPicker.offense')}</th><th title="${t('ui.teamPicker.defenseTitle')}">${t('ui.teamPicker.defense')}</th><th title="${t('ui.teamPicker.overallTitle')}">${t('ui.teamPicker.overall')}</th><th>${t('ui.teamPicker.profile')}</th><th></th></tr></thead><tbody>${
    list.map(t => `<tr class="${t.id===pid?'is-player':''} ${t.id===aid?'is-ai':''}">
      <td><span class="tdot" style="background:${t.color}"></span>${t.name}</td>
      <td>${t.ratings.offense}</td><td>${t.ratings.defense}</td><td><b>${t.ratings.overall}</b></td>
      <td class="prof">${teamProfileLabel(t.ratings)}</td>
      <td class="pick"><button class="mini-btn ${t.id===pid?'on':''}" data-side="player" data-id="${t.id}">${TEXTS.ui.teamPicker.you}</button><button class="mini-btn ai ${t.id===aid?'on':''}" data-side="ai" data-id="${t.id}">${TEXTS.ui.teamPicker.ai}</button></td>
    </tr>`).join('')}</tbody></table>`;
  wrap.querySelectorAll('button.mini-btn').forEach(b => b.onclick = () => selectTeam(b.dataset.side, Number(b.dataset.id)));
}
function renderPregameBody(){
  const teams = game.teams;
  const body = document.getElementById('pregameBody');
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:14px;">
      <div style="text-align:center;flex:1;">
        <div style="width:16px;height:16px;border-radius:50%;background:${teams.player.color};margin:0 auto 8px;"></div>
        <div style="font-family:'Oswald',sans-serif;color:var(--chalk);font-size:1.05rem;">${teams.player.name}</div>
        <div style="font-size:0.75rem;color:var(--ink-dim);margin-top:2px;">(${TEXTS.ui.teamPicker.yourTeam})</div>
        <div style="margin-top:8px;font-size:0.82rem;">${t('ui.teamPicker.ratings', {offense:teams.player.ratings.offense, defense:teams.player.ratings.defense, overall:teams.player.ratings.overall})}</div>
      </div>
      <div style="text-align:center;flex:1;">
        <div style="width:16px;height:16px;border-radius:50%;background:${teams.ai.color};margin:0 auto 8px;"></div>
        <div style="font-family:'Oswald',sans-serif;color:var(--chalk);font-size:1.05rem;">${teams.ai.name}</div>
        <div style="font-size:0.75rem;color:var(--ink-dim);margin-top:2px;">(${TEXTS.ui.teamPicker.ai})</div>
        <div style="margin-top:8px;font-size:0.82rem;">${t('ui.teamPicker.ratings', {offense:teams.ai.ratings.offense, defense:teams.ai.ratings.defense, overall:teams.ai.ratings.overall})}</div>
      </div>
    </div>`;
}

function buildContext(offenseSide){
  const fieldPositionForOffense = offenseSide === 'player' ? game.fieldPosition : (100 - game.fieldPosition);
  const scoreDiff = offenseSide === 'player' ? (game.scorePlayer - game.scoreAI) : (game.scoreAI - game.scorePlayer);
  return {
    down: game.down, distance: game.distance, quarter: game.quarter,
    timeRemaining: game.clock, scoreDiff, ballOn: fieldPositionForOffense, offenseSide,
    tempo: game.snapTempo || 'normal',
    offenseRating: game.teams ? game.teams[offenseSide].ratings.offense : 78,
    defenseRating: game.teams ? game.teams[offenseSide === 'player' ? 'ai' : 'player'].ratings.defense : 78
  };
}

/* ---- Gestion du chrono (Phase 3) ----
   Temps d'un snap = temps ENTRE deux actions (si le chrono tourne, selon le
   tempo) + durée de l'action. Le chrono s'arrête sur passe incomplète, perte de
   balle, score, changement de possession, temps mort, sortie en touche (fin de
   mi-temps), avertissement des 2 minutes et fin de quart-temps. Si le chrono
   expire AVANT le snap en fin de mi-temps, l'action n'est pas jouée. */
function otherSide(side){ return side === 'player' ? 'ai' : 'player'; }
function scoreDiffFor(side){ return side === 'player' ? game.scorePlayer - game.scoreAI : game.scoreAI - game.scorePlayer; }
function isHalfEndQuarter(q){ return q === 2 || q >= 4; }
function hasTwoMinuteWarningPending(){ return isHalfEndQuarter(game.quarter) && !(game.twoMinuteWarned || {})[game.quarter]; }
function outOfBoundsStopsClock(){ return (game.quarter === 2 && game.clock <= 120) || (game.quarter >= 4 && game.clock <= 300); }
function betweenSnapsRange(tempo){
  const c = BALANCE.clock;
  return tempo === 'hurry' ? c.betweenHurry : tempo === 'slow' ? c.betweenSlow : tempo === 'spike' ? c.betweenSpike : c.betweenNormal;
}
function betweenSnapsSeconds(tempo){ const r = betweenSnapsRange(tempo); return randInt(r[0], r[1]); }
function playDurationSeconds(){ return randInt(BALANCE.clock.playMin, BALANCE.clock.playMax); }
function endOfPeriod(){
  if(game.quarter === 1 || game.quarter === 3){
    game.quarter += 1; game.clock = BALANCE.quarterLength; game.clockRunning = false;
    return 'quarter';
  }
  game.clock = 0;
  if(game.quarter === 2){ game.pendingHalftime = true; return 'half'; }
  if(game.quarter === 4){ game.pendingRegulationEnd = true; return 'regulation'; }
  game.pendingGameEnd = true; return 'overtime';
}
function startSnapClock(tempo){
  const events = [];
  if(game.pendingGameEnd || game.pendingRegulationEnd || game.pendingHalftime) return {proceed:false, events};
  if(!game.clockRunning) return {proceed:true, events};
  const runoff = betweenSnapsSeconds(tempo);
  const before = game.clock;
  const W = BALANCE.twoMinuteWarning;
  if(hasTwoMinuteWarningPending() && before > W && before - runoff <= W){
    game.clock = W; game.clockRunning = false;
    game.twoMinuteWarned[game.quarter] = true; events.push('twoMinute');
    return {proceed:true, events};
  }
  game.clock = before - runoff;
  if(game.clock <= 0){
    const kind = endOfPeriod(); events.push('expired:' + kind);
    return {proceed: kind === 'quarter', events};
  }
  return {proceed:true, events};
}
function endSnapClock(duration, stopClock){
  const events = [];
  const before = game.clock;
  const W = BALANCE.twoMinuteWarning;
  game.clock -= duration;
  if(game.clock > 0 && hasTwoMinuteWarningPending() && before > W && game.clock <= W){
    game.twoMinuteWarned[game.quarter] = true; events.push('twoMinute'); stopClock = true;
  }
  if(game.clock <= 0){ events.push('expired:' + endOfPeriod()); stopClock = true; }
  game.clockRunning = !stopClock;
  return events;
}
function useTimeout(side){
  if(!game.timeouts || game.timeouts[side] <= 0 || !game.clockRunning) return false;
  game.timeouts[side] -= 1; game.clockRunning = false;
  return true;
}
function rollOutOfBounds(offPlay){
  const o = BALANCE.outOfBounds;
  if(o[offPlay.name] !== undefined) return Math.random() < o[offPlay.name];
  if(offPlay.direction === 'left' || offPlay.direction === 'right') return Math.random() < (offPlay.type === 'run' ? o.outsideRun : o.sidelinePass);
  return false;
}
function missedFieldGoalSpot(kicker){
  // Ballon rendu à l'endroit du tir (7 yards derrière la ligne), au minimum sur les 20 du receveur.
  return kicker === 'player' ? Math.min(game.fieldPosition - 7, 80) : Math.max(game.fieldPosition + 7, 20);
}

/* ---- Politiques de l'IA (pures, partagées par le jeu et la simulation) ---- */
function aiTimeoutDecision(side){
  if(!game.clockRunning || !game.timeouts || game.timeouts[side] <= 0) return false;
  const q = game.quarter, t = game.clock, diff = scoreDiffFor(side);
  const ballOn = side === 'player' ? game.fieldPosition : 100 - game.fieldPosition;
  if(game.possession === side){
    if(q === 2 && t <= 120 && ballOn >= 35) return true;        // préparer un score avant la pause
    if(q >= 4 && t <= 150 && diff <= 0) return true;             // course contre la montre
    return false;
  }
  if(q >= 4 && t <= 240 && diff < 0 && diff >= -16) return true; // économiser du temps pour récupérer le ballon
  if(q >= 4 && t <= 150 && diff === 0) return true;
  return false;
}
function aiTempo(side){
  const q = game.quarter, t = game.clock, diff = scoreDiffFor(side);
  if((q >= 4 && t <= 300 && diff < 0) || (q === 2 && t <= 120) || (q >= 4 && t <= 120 && diff === 0)) return 'hurry';
  if(q >= 4 && t <= 420 && diff > 0) return 'slow';
  return 'normal';
}
function tempoLabel(t){ return {hurry:'no-huddle', slow:'lent', normal:'normal', spike:'spike'}[t] || t; }
function kneelRunsOutClock(side){
  const downsLeft = 4 - game.down + 1;
  const oppTO = game.timeouts ? game.timeouts[otherSide(side)] : 0;
  const per = BALANCE.clock.betweenSlow[0];
  const burn = (game.clockRunning ? per : 0) + (downsLeft - 1) * per + downsLeft - Math.min(oppTO, downsLeft - 1) * per;
  return game.clock <= burn;
}
function aiKneelDecision(side){
  if(game.possession !== side || game.quarter >= 5) return false;
  const ballOn = side === 'player' ? game.fieldPosition : 100 - game.fieldPosition;
  if(ballOn <= 3) return false;
  const diff = scoreDiffFor(side);
  if(game.quarter === 4 && diff > 0 && kneelRunsOutClock(side)) return true;
  if(game.quarter === 2 && game.clock <= 30 && ballOn < 50) return true;
  return false;
}
function aiOnsideDecision(side){
  const diff = scoreDiffFor(side);
  return game.quarter >= 4 && diff < 0 && diff >= -16 && game.clock <= 240 && (game.clock <= 150 || diff < -8);
}
function aiConversionChoice(team){
  const diff = scoreDiffFor(team);
  const lateEnough = game.quarter >= 4 || (game.quarter === 3 && game.clock <= 300);
  return lateEnough && BALANCE.conversion.aiTwoPointDiffs.includes(diff) ? 'two' : 'pat';
}
function conversionContext(team){
  return {...buildContext(team), down: 4, distance: 2, ballOn: BALANCE.conversion.twoPointBallOn};
}
function resolveConversion(team, choice, offPlay, defPlay){
  if(choice === 'pat'){
    const success = Math.random() < BALANCE.conversion.patChance;
    return {kind:'pat', success, points: success ? 1 : 0};
  }
  const result = resolvePlay(offPlay, defPlay, conversionContext(team));
  const success = !['interception','fumble','incomplete','sack'].includes(result.outcome) && result.yards >= 2;
  return {kind:'two', success, points: success ? 2 : 0, result};
}

/* ---- Kickoffs (Phase 3) : touchback, retour, free kick après safety, onside ---- */
function resolveKickoff(kicking, onside, free){
  const receiving = otherSide(kicking), K = BALANCE.kickoff;
  let possession = receiving, ownYard, text, recovered = false, touchback = false;
  if(onside){
    recovered = Math.random() < K.onsideRecovery;
    if(recovered){
      possession = kicking; ownYard = K.onsideSpot;
      text = t('game.match.onSideRecovered', {team:teamLabel(kicking), yard:ownYard});
    } else {
      ownYard = 100 - K.onsideSpot;
      text = t('game.match.onSideMissed', {team:teamLabel(receiving), yard:K.onsideSpot});
    }
  } else if(!free && Math.random() < K.touchbackChance){
    touchback = true; ownYard = K.touchbackSpot;
    text = t('game.match.touchback', {team:teamLabel(receiving), yard:ownYard});
  } else {
    ownYard = randInt(K.returnMin, K.returnMax) + (free ? K.freeKickBonus : 0);
    text = t('game.match.kickoffReturned', {kickType:free ? t('game.match.freeKick') : t('game.match.kickoff'), yard:ownYard, team:teamNameOf(receiving)});
  }
  game.possession = possession;
  game.fieldPosition = possession === 'player' ? ownYard : 100 - ownYard;
  game.down = 1; game.distance = 10;
  game.clockRunning = false;
  game.lastFinishedDrive = startNewDrive(possession);
  return {possession, ownYard, text, onside: !!onside, recovered, touchback};
}
function beginSecondHalfState(){
  game.quarter = 3; game.clock = BALANCE.quarterLength; game.clockRunning = false;
  game.timeouts = {player: BALANCE.timeoutsPerHalf, ai: BALANCE.timeoutsPerHalf};
}
function beginOvertimeState(){
  game.quarter = 5; game.clock = BALANCE.overtime.length; game.clockRunning = false;
  game.timeouts = {player: BALANCE.overtime.timeouts, ai: BALANCE.overtime.timeouts};
  game.ot = {drives: 0};
}

/* ---- Enchaînement après chaque action (Phase 3) ----
   Ordre : transformation -> fin du temps réglementaire (prolongation si
   égalité) -> fin de match -> mi-temps / prolongation -> kickoff ->
   décisions spéciales de l'IA. */
function afterPlayResolved(){
  if(game.gameOver) return;
  SaveManager.snapshot();
  if(game.pendingConversion){ runConversion(); return; }
  if(game.pendingRegulationEnd){
    game.pendingRegulationEnd = false;
    if(game.scorePlayer === game.scoreAI) game.pendingOvertime = true; else game.pendingGameEnd = true;
  }
  if(game.pendingGameEnd){ endGame(); return; }
  if(game.pendingHalftime){ game.pendingHalftime = false; game.pendingKickoff = null; startHalftime(); return; }
  if(game.pendingOvertime){ game.pendingOvertime = false; game.pendingKickoff = null; startOvertime(); return; }
  if(game.pendingKickoff){ runKickoff(); return; }
  if(game.phase === 'playing'){ render(); maybeHandleAISpecial(); }
}
function startHalftime(){
  game.phase = 'halftime';
  game.playLocked = false;
  setPlayPhase(t('game.match.halftime'));
  render();
  scheduleForGame(startSecondHalfKickoff, 500);
}
function startOvertime(){
  beginOvertimeState();
  const receiver = Math.random() < 0.5 ? 'player' : 'ai';
  game.phase = 'kickoff'; game.playLocked = false;
  game.lastKickoffMessage = t('game.match.overtimeTie', {
    playerScore:game.scorePlayer,
    aiScore:game.scoreAI,
    minutes:Math.round(BALANCE.overtime.length/60),
    team:teamLabel(receiver)
  });
  logMatch(game.lastKickoffMessage);
  renderTossModal();
  document.getElementById('tossTitle').textContent = t('game.match.overtime');
  render();
  scheduleForGame(() => {
    const k = kickoffReset(receiver);
    game.phase = 'playing';
    hideTossOverlay();
    setResult(t('game.match.overtime'), k.text, '');
    showEventBanner(t('game.banners.overtime'), 'clutch');
    syncFieldVisualsNow();
    SaveManager.snapshot();
  }, 4200);
}
function runKickoff(){
  const {kicking, free} = game.pendingKickoff;
  game.pendingKickoff = null;
  game.phase = 'kickoff'; game.playLocked = true;
  render();
  const go = (onside) => {
    hideChoice();
    const k = resolveKickoff(kicking, onside, free);
    logMatch(k.text);
    setResult(onside ? t('game.match.onSideKick') : (free ? t('game.match.freeKick') : t('game.match.kickoffTitle')), k.text, '');
    game.phase = 'playing'; game.playLocked = false;
    if(onside) showEventBanner(t(k.recovered ? 'game.banners.onSideRecovered' : 'game.banners.onSideMissed'), k.recovered ? 'bigPlay' : 'turnover');
    syncFieldVisualsNow();
    afterPlayResolved();
  };
  if(kicking === 'player' && !free && game.quarter >= 4 && scoreDiffFor('player') < 0){
    showChoice(t('game.match.kickoffTitle'), t('game.match.onSideChoice', {
      points:-scoreDiffFor('player'),
      plural:scoreDiffFor('player') < -1 ? 's' : '',
      clock:fmtClock(game.clock),
      chance:Math.round(BALANCE.kickoff.onsideRecovery*100),
      yard:BALANCE.kickoff.onsideSpot
    }), [
      {label:t('game.match.normalKickoff'), primary:true, onClick: () => go(false)},
      {label:t('game.match.onSideKick'), onClick: () => go(true)}
    ]);
  } else {
    const onside = kicking === 'ai' && !free && aiOnsideDecision('ai');
    scheduleForGame(() => go(onside), 650);
  }
}
function handleClockEvents(events){
  (events || []).forEach(e => {
    if(e === 'twoMinute'){ showEventBanner(t('game.match.twoMinuteWarning'), 'clutch', 1900); logMatch(t('game.match.twoMinuteLog', {period:periodLabel(game.quarter)})); }
    else if(e === 'expired:quarter'){
      const quarter = game.quarter - 1;
      const ordinal = quarter === 1 ? '1er' : '3e';
      showEventBanner(t('game.match.quarterEndedBanner', {ordinal}), 'tactical', 1600);
      logMatch(t('game.match.quarterEndedLog', {quarter}));
    }
    else if(e === 'expired:half') logMatch(t('game.match.firstHalfEndLog'));
    else if(e === 'expired:regulation') logMatch(t('game.match.regulationEndLog'));
    else if(e === 'expired:overtime') logMatch(t('game.match.overtimeEndLog'));
  });
}
function periodLabel(q){ return q >= 5 ? t('game.match.periodOvertime') : t('game.match.periodQuarter', {quarter:q}); }
function announceTimeout(side){
  const n = game.timeouts[side];
  showEventBanner(t('game.match.timeoutBanner', {team:teamNameOf(side).toUpperCase()}), 'tactical', 1500);
  logMatch(t('game.match.timeoutLog', {
    team:side === 'player' ? `des ${teamNameOf('player')}` : `de ${teamNameOf('ai')}`,
    count:n,
    plural:n > 1 ? t('game.match.timeoutsRemainingPlural') : t('game.match.timeoutsRemaining'),
    period:periodLabel(game.quarter),
    clock:fmtClock(game.clock)
  }));
}
// Juste avant chaque snap (joueur ou IA) : temps mort éventuel de l'IA, temps
// écoulé avant le snap, avertissement des 2 minutes, fin de période.
function preSnapGate(offenseSide, tempo){
  game.snapTempo = tempo === 'hurry' ? 'hurry' : 'normal';
  if(game.clockRunning && aiTimeoutDecision('ai') && useTimeout('ai')) announceTimeout('ai');
  const res = startSnapClock(tempo);
  handleClockEvents(res.events);
  if(!res.proceed){
    game.playLocked = false;
    clearTempPlayers(); formationDots = { offense: [], defense: [] };
    const what = game.pendingHalftime ? t('game.match.firstHalfEnded') : game.pendingRegulationEnd ? t('game.match.regulationEnded') : t('game.match.overtimeEnded');
    setResult(t('game.match.periodOverTitle'), t('game.match.periodOverExplain', {reason:what}), '');
    render();
    afterPlayResolved();
    return false;
  }
  render();
  return true;
}

function switchPossession(newFieldPosition){
  game.possession = game.possession === 'player' ? 'ai' : 'player';
  game.fieldPosition = clamp(newFieldPosition, 1, 99);
  game.down = 1; game.distance = 10;
  game.lastFinishedDrive = startNewDrive(game.possession);
}

// Kickoff d'ouverture / de seconde mi-temps / de prolongation (sans onside).
function kickoffReset(receivingSide){
  return resolveKickoff(otherSide(receivingSide), false, false);
}

/* =========================================================================
   GAME FEEL — classification des événements, feedback visuel/sonore,
   lecture tactique récompensée, récapitulatif de drive, audio optionnel.
   Ce module ne modifie JAMAIS un résultat : il ne fait qu'habiller un
   résultat déjà calculé par le moteur (result, adv.type, predictability...).
   ========================================================================= */

// ---- Suivi de drive ----
function startNewDrive(offenseSide){
  const finished = game.currentDrive || null;
  if(game.quarter >= 5 && game.ot) game.ot.drives += 1;
  game.currentDrive = {
    offenseSide, plays: 0, yardsGained: 0,
    startFieldPosition: game.fieldPosition, startClock: game.clock, startQuarter: game.quarter,
    keyPlayLabel: null, keyPlayYards: -Infinity
  };
  return finished;
}
function recordDrivePlay(offenseSide, yards, playLabel){
  if(!game.currentDrive || game.currentDrive.offenseSide !== offenseSide) return;
  game.currentDrive.plays += 1;
  game.currentDrive.yardsGained += yards;
  if(yards > game.currentDrive.keyPlayYards){
    game.currentDrive.keyPlayYards = yards;
    game.currentDrive.keyPlayLabel = playLabel;
  }
}
function showDriveSummaryPanel(drive, reason){
  if(!drive || drive.plays === 0) return;
  const panel = document.getElementById('driveSummaryPanel');
  const body = document.getElementById('driveSummaryBody');
  if(!panel || !body) return;
  const reasonLabel = TEXTS.game.match.driveReasons[reason] || t('game.match.driveReasons.default');
  const timeUsed = Math.max(0, Math.round(drive.startClock - game.clock));
  body.innerHTML = `<b>${teamNameOf(drive.offenseSide)}</b> — ${t('game.match.driveSummary', {
    reason:reasonLabel,
    plays:drive.plays,
    plural:drive.plays > 1 ? 's' : '',
    yards:drive.yardsGained,
    seconds:timeUsed,
    keyPlay:drive.keyPlayLabel ? t('game.match.keyPlay', {play:playLabel(drive.keyPlayLabel)}) : ''
  })}`;
  panel.classList.remove('hidden');
  clearTimeout(window.__driveSummaryTimer);
  window.__driveSummaryTimer = setTimeout(() => panel.classList.add('hidden'), BALANCE.driveSummary.autoHideMs);
}

// ---- 1. Classification des événements ----
// classifyPlayEvent(result, context, tactical) -> 'normal'|'positive'|'bigPlay'|'turnover'|'score'|'clutch'
// `context` = situation AVANT résolution (buildContext), `tactical.advType` = type renvoyé par advanceBall
// ('touchdown'|'safety'|'turnoverOnDowns'|'firstdown'|'continue') ou 'turnover' pour INT/fumble sans pick-six.
function classifyPlayEvent(result, context, tactical){
  const th = BALANCE.eventThresholds;
  const advType = tactical.advType;

  if(advType === 'touchdown' || advType === 'safety') return 'score';
  if(advType === 'turnover' || advType === 'turnoverOnDowns') return 'turnover';

  const isClutch = context.quarter >= th.clutch.minQuarter &&
    context.timeRemaining <= th.clutch.maxTimeRemaining &&
    Math.abs(context.scoreDiff) <= th.clutch.maxScoreDiff &&
    (context.down >= th.clutch.minDown || context.ballOn >= th.clutch.redZoneYard);

  const isBigPlay = result.yards >= th.bigPlay.minYards || result.outcome === 'sack' ||
    (result.outcome !== 'incomplete' && result.yards <= th.bigPlay.tflMax);

  if(isClutch && (isBigPlay || advType === 'firstdown')) return 'clutch';
  if(isBigPlay) return 'bigPlay';

  const isPositive = advType === 'firstdown' || result.yards >= th.positive.minYards ||
    (result.outcome !== 'incomplete' && result.outcome !== 'sack' && result.yards <= th.positive.stuffMax);
  if(isPositive) return 'positive';

  return 'normal';
}

// ---- 4. Lecture tactique récompensée (rare, seuils dans BALANCE.tacticalMessages) ----
function pickTacticalMessage(ctx){
  const {offPlay, defPlay, predictability, surpriseBonus, result, isClutch, isFirstDown} = ctx;
  const th = BALANCE.tacticalMessages;
  const score = predictability ? predictability.predictabilityScore : 0;
  const adapted = !!(defPlay && defPlay._adapted);
  const goodGain = result.outcome === 'completion' || result.outcome === 'gain';

  if(surpriseBonus >= th.tendencyBrokenMinBonus && score >= th.tendencyBrokenMinScore && goodGain && result.yards > 0){
    return t('animation.tacticalMessages.tendencyBroken');
  }
  if(offPlay.name === 'Play Action' && goodGain && result.yards >= th.playActionBitMinYards){
    return t('animation.tacticalMessages.defenseBites');
  }
  if(defPlay.name && defPlay.name.toLowerCase().includes('blitz') && goodGain && result.yards >= th.blitzPunishedMinYards){
    return t('animation.tacticalMessages.blitzPunished');
  }
  if(adapted && result.finalAdvantage <= th.perfectReadMaxAdvantage && score >= th.perfectReadMinScore){
    return t('animation.tacticalMessages.perfectRead');
  }
  if(offPlay.type === 'run' && defPlay.type === 'runDefense' &&
     ['Eight-Man Box','Bear Front','Inside Run Blitz','Goal-Line Defense'].includes(defPlay.name) &&
     result.outcome !== 'fumble' && result.yards <= th.boxStackedMaxYards){
    return t('animation.tacticalMessages.boxStacked');
  }
  if(offPlay.depth === th.deepShellDeniedDepth && result.outcome === 'incomplete' &&
     ['Cover 3','Cover 4','Dime Defense','Prevent Defense'].includes(defPlay.name)){
    return t('animation.tacticalMessages.deepShellDenied');
  }
  if(isClutch && isFirstDown){
    return t('animation.tacticalMessages.clutchConversion');
  }
  return null;
}

// ---- 2/3/5. Feedback visuel (bannières, pulsations, flash, marqueur) ----
function showEventBanner(text, variant, durationMs){
  const layer = document.getElementById('eventBannerLayer');
  if(!layer) return;
  const ms = durationMs || BALANCE.eventBanner.durationMs;
  const el = document.createElement('div');
  el.className = 'event-banner ' + variant;
  el.textContent = text;
  el.style.setProperty('--banner-ms', ms + 'ms');
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms + 150);
}
function triggerScoreCelebration(side){
  const el = document.getElementById(side === 'player' ? 'scorePlayer' : 'scoreAI');
  if(!el) return;
  el.classList.remove('score-pulse'); void el.offsetWidth; el.classList.add('score-pulse');
}
// ---- Célébrations (Phase 3) : confettis aux couleurs de l'équipe, gerbes de
// feux d'artifice dans la zone d'en-but, ballons qui tournoient. Purement
// décoratif (Web Animations API), allégé si l'utilisateur réduit les animations.
function celebrate(kind, side, xYards){
  const layer = document.getElementById('celebrationLayer');
  if(!layer || !game || !game.teams || !layer.animate) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = layer.clientWidth || 600, H = layer.clientHeight || 260;
  const team = game.teams[side] || game.teams.player;
  const palette = [team.color, team.color, team.color, '#f2d27a', '#f4f6f2', '#e2a640'];
  const pick = () => palette[Math.floor(Math.random()*palette.length)];
  const spawn = (cls, x, y, color) => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if(color) el.style.background = color;
    layer.appendChild(el);
    return el;
  };
  const burst = (cx, cy, count, spread, round) => {
    for(let i=0;i<count;i++){
      const el = spawn('confetti' + (round ? ' round' : ''), cx, cy, pick());
      const a = Math.random()*Math.PI*2, d = spread*(0.35 + Math.random()*0.65);
      const dx = Math.cos(a)*d, dy = Math.sin(a)*d;
      const anim = el.animate([
        {transform:'translate(0,0) rotate(0deg) scale(1)', opacity:1},
        {transform:`translate(${dx}px, ${dy}px) rotate(${Math.random()*360}deg) scale(1)`, opacity:1, offset:0.45},
        {transform:`translate(${dx*1.1}px, ${dy + 70}px) rotate(${Math.random()*720}deg) scale(0.8)`, opacity:0}
      ], {duration: 1100 + Math.random()*700, easing:'cubic-bezier(.15,.7,.35,1)', delay: Math.random()*120});
      anim.onfinish = () => el.remove();
    }
  };
  const footballs = (count, fromX, fromY) => {
    for(let i=0;i<count;i++){
      const el = spawn('mini-football', fromX, fromY);
      const dx = (Math.random()*2-1) * W*0.25, peak = -(H*0.35 + Math.random()*H*0.3);
      const anim = el.animate([
        {transform:'translate(0,0) rotate(0deg)', opacity:1},
        {transform:`translate(${dx*0.5}px, ${peak}px) rotate(${360 + Math.random()*360}deg)`, opacity:1, offset:0.5},
        {transform:`translate(${dx}px, ${-peak*0.2}px) rotate(${900 + Math.random()*360}deg)`, opacity:0}
      ], {duration: 1500 + Math.random()*500, easing:'cubic-bezier(.3,.6,.4,1)', delay: i*140});
      anim.onfinish = () => el.remove();
    }
  };
  if(kind === 'touchdown'){
    const n = reduce ? 30 : 120;
    const ezX = (fx(side === 'player' ? 105 : -5) / 100) * W;
    for(let i=0;i<n;i++){
      const x = clamp(ezX + (Math.random()-0.5)*W*0.18, 0, W);
      const el = spawn('confetti', x, -12, pick());
      const drift = (Math.random()*2-1)*80;
      const anim = el.animate([
        {transform:'translate(0,0) rotate(0deg)', opacity:1},
        {transform:`translate(${drift}px, ${H + 30}px) rotate(${360 + Math.random()*720}deg)`, opacity:0.85}
      ], {duration: 1800 + Math.random()*1600, easing:'linear', delay: Math.random()*900});
      anim.onfinish = () => el.remove();
    }
    if(!reduce){
      [0, 380, 760].forEach((delay, k) => setTimeout(() => burst(ezX + (k-1)*W*0.03, H*(0.3 + 0.2*k), 28, 90, true), delay));
      footballs(3, ezX, H*0.6);
    }
  } else if(kind === 'bigPlay'){
    const cx = (fx(xYards !== undefined ? xYards : 50) / 100) * W;
    burst(cx, H*0.5, reduce ? 12 : 40, 110, false);
    if(!reduce) footballs(1, cx, H*0.5);
  } else if(kind === 'fieldGoal'){
    const gx = (fx(side === 'player' ? 109 : -9) / 100) * W;
    burst(gx, H*0.5, reduce ? 10 : 30, 80, true);
  }
}
function restartFieldOuterAnimation(className){
  const el = document.getElementById('fieldOuter');
  if(!el) return null;
  el.classList.remove('big-play-pulse','sack-impact','turnover-flash','touchdown-impact');
  void el.offsetWidth;
  el.classList.add(className);
  return el;
}
function triggerBigPlayPulse(){
  restartFieldOuterAnimation('big-play-pulse');
}
function triggerSackImpact(){
  restartFieldOuterAnimation('sack-impact');
}
function triggerTouchdownImpact(side){
  const field = document.getElementById('field');
  const outer = restartFieldOuterAnimation('touchdown-impact');
  if(!field || !outer) return;
  field.style.setProperty('--touchdown-x', side === 'player' ? '100%' : '0%');
  field.classList.remove('touchdown-glow'); void field.offsetWidth; field.classList.add('touchdown-glow');
}
function triggerTurnoverFlash(){
  const el = restartFieldOuterAnimation('turnover-flash');
  if(!el) return;
}
function flashFirstDownMarker(){
  const marker = document.getElementById('firstDownMarker');
  if(!marker) return;
  marker.classList.remove('flash'); void marker.offsetWidth; marker.classList.add('flash');
}
function flashPositiveResult(){
  const rb = document.getElementById('resultBox');
  if(!rb) return;
  rb.classList.remove('flash-positive'); void rb.offsetWidth; rb.classList.add('flash-positive');
}
// Impact visuel au point de tacle ou de perte du ballon ; ne modifie pas le résultat.
function triggerTackleImpact(xPct, yPct, kind = 'standard'){
  const field = document.getElementById('field');
  if(!field) return;
  const impact = document.createElement('div');
  impact.className = 'tackle-impact temp-player ' + kind;
  impact.style.left = fx(xPct) + '%';
  impact.style.top = yPct + '%';
  field.appendChild(impact);
  setTimeout(() => impact.remove(), kind === 'sack' ? 650 : kind === 'turnover' ? 600 : 450);
}
function triggerBreakawayEffect(element, offenseDir){
  if(!element) return;
  element.dataset.direction = offenseDir >= 0 ? 'right' : 'left';
  element.classList.remove('breakaway'); void element.offsetWidth; element.classList.add('breakaway');
  setTimeout(() => {
    element.classList.remove('breakaway');
    delete element.dataset.direction;
  }, 800);
}

// Point d'entrée unique : classifie l'événement puis déclenche le feedback
// visuel/sonore/tactique adapté. N'affecte jamais l'état du match.
function applyEventFeedback(offenseSide, context, tactical){
  const {result, offPlay, defPlay, predictability, repetitionPenalty, surpriseBonus, advType} = tactical;
  const eventLevel = classifyPlayEvent(result, context, tactical);
  // Passe ratée : le ballon revient sur la ligne de scrimmage -> annonce « NO CATCH ».
  if(result && result.outcome === 'incomplete'){
    showEventBanner(t('game.banners.noCatch'), 'nocatch');
  }

  if(eventLevel === 'score'){
    const defensiveScore = advType === 'safety' || (result && (result.outcome === 'interception' || result.outcome === 'fumble'));
    const scoringSide = defensiveScore ? (offenseSide === 'player' ? 'ai' : 'player') : offenseSide;
    triggerScoreCelebration(scoringSide);
    if(advType === 'safety'){
      showEventBanner(t('game.banners.safety'), 'score');
    } else {
      triggerTouchdownImpact(scoringSide);
      showEventBanner(t('game.banners.touchdown'), 'touchdown', 2400);
      if(result && result.outcome === 'interception') setTimeout(() => showEventBanner(t('game.banners.pickSix'), 'bigPlay'), 500);
      celebrate('touchdown', scoringSide);
    }
    AudioManager.play(advType === 'safety' ? 'whistle' : 'cheering');
    AudioManager.play('crowd');
  } else if(eventLevel === 'clutch'){
    showEventBanner(t('game.banners.clutch'), 'clutch');
  } else if(eventLevel === 'bigPlay'){
    triggerBigPlayPulse();
    showEventBanner(t('game.banners.bigPlay'), 'bigPlay');
    celebrate('bigPlay', offenseSide, game.visualBallX);
    AudioManager.play('cheering');
  } else if(eventLevel === 'positive'){
    if(advType === 'firstdown'){
      flashFirstDownMarker();
      showEventBanner(t('game.banners.firstDown'), 'firstdown');
      AudioManager.play('firstDown');
    } else {
      flashPositiveResult();
    }
  }
  // 'normal' : résultat sobre, aucun effet ajouté — volontairement discret.

  const tacticalMsg = pickTacticalMessage({
    offPlay, defPlay, predictability, repetitionPenalty, surpriseBonus, result,
    isClutch: eventLevel === 'clutch', isFirstDown: advType === 'firstdown'
  });
  if(tacticalMsg) showEventBanner(tacticalMsg, 'tactical', BALANCE.eventBanner.tacticalDurationMs);
}

// ---- 7. Audio optionnel (désactivé par défaut, aucun asset requis) ----
// Chemins relatifs prévus sous assets/sounds/ ; si un fichier est absent, la
// lecture échoue silencieusement (catch), le jeu n'est jamais bloqué.
