const TEXTS = window.GAME_TEXTS;
function t(path, values = {}){
  const value = path.split('.').reduce((entry, key) =>
    entry && Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : undefined, TEXTS);
  if(typeof value !== 'string') throw new Error(`Texte JSON manquant ou invalide : "${path}".`);
  return value.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}
function playLabel(name){
  return TEXTS.playbook.offenseNames[name] || TEXTS.playbook.defenseNames[name] || name;
}

/* =========================================================================
   FOOTBALL TACTIQUE — moteur de jeu + système de mémoire tactique IA
   =========================================================================
   Sommaire des fonctions clés (voir aussi le message d'accompagnement) :
   - calculatePredictability(history, context)
   - chooseAIDefensivePlay(context, predictability)
   - chooseAIOffensivePlay(context, predictability)
   - calculateSurpriseBonus(actualPlay, predictedTendency, predictabilityData)
   - calculateRepetitionPenalty(actualPlay, history)
   - resolvePlay(offPlay, defPlay, context)
   - runBalanceTests() -> journal de vérification (voir bouton "tests d'équilibrage")

   ==================== ZONE D'ÉQUILIBRAGE (à ajuster ici) ====================
   Tous les poids, seuils, bonus et malus réglables sont regroupés dans
   l'objet BALANCE ci-dessous pour faciliter les futurs ajustements.
   ========================================================================= */

const BALANCE = {
  historyWeights: [1, 1, 2, 2, 3, 4, 5, 6],   // poids des 8 derniers appels (ancien -> récent)
  quarterLength: 600,                           // durée d'un quart-temps (secondes simulées) — 10 min
  // Phase 3 : temps d'un snap = temps ENTRE deux actions (si le chrono tourne,
  // selon le tempo) + durée de l'action elle-même.
  clock: { playMin: 4, playMax: 8, betweenNormal: [17, 29], betweenHurry: [7, 12], betweenSlow: [32, 38],
           betweenSpike: [4, 8], kick: [5, 8], kneel: [1, 2] },
  twoMinuteWarning: 120,                        // avertissement des 2 minutes (Q2, Q4, prolongation)
  timeoutsPerHalf: 3,
  overtime: { length: 400, timeouts: 2 },       // ~2/3 d'un quart-temps, comme en NFL (10 min sur 15)
  // Probabilité de sortie en touche (n'arrête le chrono qu'en fin de mi-temps)
  outOfBounds: { outsideRun: 0.30, sidelinePass: 0.25, 'Out Route': 0.65, 'Flood Concept': 0.40 },
  conversion: { patChance: 0.94, twoPointBallOn: 98, aiTwoPointDiffs: [-2, -5, -10, 1, 5] },
  kickoff: { touchbackChance: 0.62, touchbackSpot: 25, returnMin: 16, returnMax: 40, freeKickBonus: 5,
             onsideRecovery: 0.12, onsideSpot: 45 },
  tempo: { hurryAdvantage: -2, hurryAdaptationMalus: 0.12 },
  // NB (suite au journal de tests) : le plafond ne doit pas porter seulement sur la
  // "chance d'essayer de s'adapter" mais sur le TAUX RÉEL de bon contre. Comme le top3
  // trié par score tombe quasi toujours dans la bonne catégorie (run/pass), le taux réel
  // = adaptationChance*1.0 + (1-adaptationChance)*tauxAléatoire(~40%). On calibre donc
  // adaptationChance plus bas pour que ce taux réel reste sous 80% (voir Test 6).
  aiDefenseAdaptationBase: 0.40,                // chance de base que l'IA adapte sa défense
  aiDefenseAdaptationScale: 0.30,               // poids additionnel selon predictabilityScore
  aiDefenseAdaptationMax: 0.65,                 // plafonne le taux réel de bon contre à ~78-79%
  aiOffenseAdaptationBase: 0.35,
  aiOffenseAdaptationScale: 0.30,
  aiOffenseAdaptationMax: 0.65,
  aiMatchupWeight: 2.0,                         // Phase 2 : poids de la table d'interactions dans les choix IA
  turnoverReturn: {                             // retours après interception / fumble
    interceptionPickSixChance: 0.10,            // proba de base d'un pick-six sur INT
    fumblePickSixChance: 0.06,                  // proba de base d'un retour de fumble marqué
    longFieldPenaltyFactor: 0.5,                // réduit la proba de pick-six sur un terrain long (>60y)
    longFieldThreshold: 60,
    interceptionReturnMax: 22,                  // retour max (hors pick-six) sur INT
    fumbleReturnMax: 9                          // retour max (hors pick-six) sur fumble
  },
  // Équivalent de COIN_TOSS_AI_CHOICE_WEIGHTS du brief : décision de l'IA
  // quand elle remporte le toss (receive/kick/defer).
  coinTossAIWeights: { receive: 0.70, defer: 0.20, kick: 0.10 },
  // Quand l'IA doit choisir receive/kick après que l'adversaire ait reporté son choix.
  coinTossAIDeferSubReceiveChance: 0.80,
  surpriseBonusRanges: {                        // [min,max] par tranche de predictabilityScore
    low:   [0, 2],     // score < 35
    mid:   [2, 6],     // score 35-60
    high:  [6, 10],    // score 61-80
    vhigh: [10, 15]    // score > 80
  },
  repetitionCaps: {
    exactMax: 12,
    categoryMax: 8,
    directionDepthMax: 7,
    totalMax: 15
  },
  // Phase 2 : courbe réaliste (interpolation linéaire entre les points [distance, chance]).
  fieldGoal: {
    availableMaxDistance: 62,   // au-delà, le bouton Field Goal n'est plus proposé
    curve: [[18,0.99],[30,0.96],[40,0.88],[50,0.72],[55,0.60],[60,0.42],[65,0.20]],
    aiMinChance: 0.55           // l'IA ne tente le FG en 4e tentative que si la réussite >= 55%
  },
  // ---- Phase 2 : résolution des plays ----
  resolution: {
    runVsRunDef: 8, runVsPassDef: 6, passVsPassDef: 6, passVsRunDef: 8, targetMatch: 5,
    randomness: 10,
    completion: {short:0.72, medium:0.62, deep:0.45}, completionSlope: 120,
    sackBase: 0.055, sackSlope: 400,
    intBase: 0.027, intSlope: 700,
    passYards: {short:5, medium:10, deep:20}, passYardsSlope: 4,
    runYards: {inside:3.6, outside:4.2}, runYardsSlope: 5,
    passBreakBase: 0.058, runBreakBase: 0.045, breakSlope: 450, breakMin: 8, breakMax: 40,
    catchFumble: 0.007, runFumble: 0.011
  },
  matchup: { cap: 16, insideVsEdge: 6 },
  ratings: { min: 65, max: 92, advantagePerPoint: 0.2 },
  fakeFieldGoal: {
    baseSuccessMin: 0.15,       // risque élevé, 15-30% de réussite de base
    baseSuccessMax: 0.30,
    surpriseBonusIfExpected: 0.12 // bonus si l'IA table fortement sur un field goal classique
  },
  animation: {
    defaultSpeed: 1,            // multiplicateur x1 / x1.5 / x2 (persisté via Storage)
    speeds: [1, 1.5, 2],
    globalSlowdown: 2           // base 2x plus lente : "x1" applique déjà ce ralentissement,
                                 // "x2" retrouve le rythme d'origine, "x1.5" est entre les deux
  },
  // ---- Game feel : classification des événements (classifyPlayEvent) ----
  eventThresholds: {
    bigPlay: { minYards: 15, tflMax: -3 },     // gain >=15, ou perte <=-3 (tackle for loss)
    positive: { minYards: 5, stuffMax: 1 },    // gain moyen, ou arrêt défensif (gain <=1)
    clutch: {
      minQuarter: 4, maxTimeRemaining: 300,    // 4e QT, 5 min ou moins
      maxScoreDiff: 8, minDown: 3, redZoneYard: 80
    }
  },
  // ---- Messages de lecture tactique : rares, seuils explicites ----
  tacticalMessages: {
    tendencyBrokenMinScore: 60, tendencyBrokenMinBonus: 8,
    playActionBitMinYards: 15,
    blitzPunishedMinYards: 15,
    perfectReadMaxAdvantage: -8, perfectReadMinScore: 60,
    boxStackedMaxYards: 1,
    deepShellDeniedDepth: 'deep'
  },
  // ---- Bannières d'événement (durée d'affichage) ----
  eventBanner: { durationMs: 1600, tacticalDurationMs: 1900 },
  // ---- Récapitulatif de drive ----
  driveSummary: { autoHideMs: 4200 },
  // ---- Audio (désactivé par défaut, aucun asset fourni) ----
  audio: { defaultEnabled: false, defaultVolume: 0.6 }
};

const GAME_VERSION = '0.5.1';
/* Journal des versions
   0.5.1
   - Annonce rouge « NO CATCH » sur passe incomplète.
   - Panneau IA : couche catégorie, aléa et chance d'échappée affichés ;
     explication dédiée quand un plaquage manqué perce une défense bien placée.
   0.5.0
   - Le jeu s'appelle désormais « Coach Tony - Tactical Football ».
   - Transformations jouées sur le terrain : animation du coup de pied (PAT)
     ou de l'action de conversion à 2 points (attaque comme défense).
   - Sauvegarde automatique de la partie dans le navigateur (localStorage) à
     chaque action terminée, à la mise en arrière-plan et à la fermeture de
     l'onglet ; reprise proposée au lancement. Code de sauvegarde exportable /
     importable en secours (navigateurs ou aperçus qui bloquent le stockage).
   0.4.0 (Phase 3 — gestion de match)
   - Chrono réaliste : temps entre les actions + durée de l'action ; arrêts sur
     incomplète, perte de balle, score, changement de possession, temps mort,
     sortie en touche (fin de mi-temps), avertissement des 2 minutes. Si le
     chrono expire avant le snap en fin de mi-temps, l'action n'est pas jouée.
   - 3 temps morts par mi-temps (2 en prolongation), tempo lent / normal /
     no-huddle, spike, genou à terre. L'IA gère ses temps morts et son tempo.
   - Transformation (94 %) ou conversion à 2 points jouée depuis les 2 yards ;
     l'IA suit une table de décision selon l'écart en fin de match.
   - Kickoffs avec touchback ou retour, free kick après safety, onside kick.
   - Décisions de 4e tentative de l'IA selon le score et le temps ; conseil du
     coordinateur affiché au joueur.
   - Prolongation : un TD ou une safety met fin au match ; un FG sur la 1re
     possession laisse une possession à l'adversaire ; match nul possible.
   - Interactions sensibles à la direction (course au centre vs contain).
   - Terrain : 100 yards entre les zones d'en-but, numéros de yards, hash marks,
     poteaux ; sélection des équipes (notes fixes) ; célébrations ; animations
     dédiées (screen, bloqueurs de tête, play action, routes).
   0.3.0 (Phase 2 — profondeur tactique & équilibrage)
   - Table d'interactions : chaque défense porte des tags (blitz, boîte chargée,
     individuelle, zone profonde...) et chaque play offensif a ses forces et
     faiblesses face à ces tags (OFFENSE_PROFILES / DEFENSE_PROFILES).
   - Profils de risque : sacks, interceptions, échappées et dispersion des
     gains propres à chaque play et à chaque défense (QB Sneak fiable, Sweep
     explosif, Nickel Blitz = plus de sacks mais gros gains concédés...).
   - Les notes d'équipe (attaque vs défense adverse) pèsent sur chaque snap.
   - Pertes de balle ramenées vers les standards NFL, courbe de field goals
     réaliste, IA qui ne tente le FG qu'au-dessus de 55% de réussite.
   - Chrono arrêté sur passe incomplète, perte de balle et coup de pied.
   - IA : lit aussi vos plays/défenses récents via la table d'interactions ;
     Goal-Line et Prevent ne sont plus appelées hors contexte.
   - Fake FG : bonus de surprise quand le vrai FG est facile (logique corrigée).
   - Fiches tactiques (+ / −) sous chaque appel, explications du résultat et
     panneau debug enrichis (interaction, notes, échappée).
   - Tests 4, 7 (cibles statistiques) et 8 (duels tactiques) mis à jour.
   0.2.1 (Phase 1 — stabilisation des règles)
   - Fin de match : le dernier play est entièrement résolu (score compris) AVANT
     l'affichage de l'écran final (pendingGameEnd).
   - Safety : l'équipe qui MARQUE les 2 points reçoit le free kick suivant.
   - Sack dans sa propre zone d'en-but : safety correctement annoncée (message,
     bannière, fin de drive).
   - Mi-temps : phase 'halftime' bloquante + vérification d'état avant toute
     action IA différée (plus de punt/FG fantôme après le coup d'envoi du 3e QT).
   - Punt : touchback au 20 si le ballon atteint la zone d'en-but.
   - Lecture des tendances défensives : Base 4-3 / 3-4 comptent pour moitié
     course / moitié passe (et non plus comme des défenses anti-passe).
   - Toutes les actions différées sont liées à la partie en cours
     (scheduleForGame) : un "Nouveau match" annule proprement l'ancienne.
   - Test 7 : simulation de matchs complets IA contre IA avec contrôles
     d'intégrité des règles.
*/

/* ---------------------------- Équipes (franchises fictives) --------------- */
const TEAM_NAMES = TEXTS.teams.names;
// Palette de couleurs primaires contrastées, associée à l'INDEX du nom dans TEAM_NAMES
// (approche "stable par franchise" documentée : la même équipe garde toujours la même couleur
// d'un match à l'autre, plutôt qu'une couleur tirée au hasard à chaque fois).
const TEAM_COLORS = [
  '#c1553f','#4fb0c6','#e2a640','#5fae6b','#8a6fd1','#d24d4d','#3f8ecf','#c98c3c',
  '#6ab04c','#b85fc9','#4fb08a','#cf5a8e','#7d94d1','#d1a13f','#5a9fd4','#a85fd1',
  '#c9704f','#4fc6b0','#d1614f','#6f8fd1','#c65fa8','#5fb0c9','#a1c94f','#d18f4f',
  '#4f8fd1','#c94f6f','#6fd18f','#d1c14f','#8f4fd1','#4fd1a1','#d14f8f','#4fa1d1',
  '#a1d14f','#d1704f','#4fd1c1','#c14fd1','#8fd14f','#4f61d1','#d1a14f','#61d14f'
];
function generateTeamRatings(){
  // Ratings simples 60-95, documentés ici pour être ajustés facilement.
  const offense = randInt(BALANCE.ratings.min, BALANCE.ratings.max);
  const defense = randInt(BALANCE.ratings.min, BALANCE.ratings.max);
  const overall = Math.round((offense + defense) / 2);
  return {offense, defense, overall};
}
// Phase 3 : chaque franchise a des notes FIXES (dérivées de son nom par un
// générateur déterministe) pour pouvoir être choisie en connaissance de cause.
// generateTeamRatings() reste utilisé par la simulation de test.
function seededRandom(seed){
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function hashString(str){ let h = 2166136261; for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const TEAM_DB = TEAM_NAMES.map((name, i) => {
  const rnd = seededRandom(hashString(name));
  const span = BALANCE.ratings.max - BALANCE.ratings.min;
  const offense = BALANCE.ratings.min + Math.round(rnd() * span);
  const defense = BALANCE.ratings.min + Math.round(rnd() * span);
  return {id:i, name, color: TEAM_COLORS[i % TEAM_COLORS.length], ratings:{offense, defense, overall: Math.round((offense+defense)/2)}};
});
function teamProfileLabel(r){
  if(r.offense - r.defense >= 6) return t('ui.teamProfile.offensive');
  if(r.defense - r.offense >= 6) return t('ui.teamProfile.defensive');
  return t('ui.teamProfile.balanced');
}
function makeTeam(id){ const t = TEAM_DB[id]; return {id: t.id, name: t.name, color: t.color, ratings: {...t.ratings}}; }
function generateMatchTeams(){
  const i1 = randInt(0, TEAM_DB.length - 1);
  let i2 = randInt(0, TEAM_DB.length - 1);
  while(i2 === i1) i2 = randInt(0, TEAM_DB.length - 1);
  return { player: makeTeam(i1), ai: makeTeam(i2) };
}
function applyTeamColorsToCSS(teams){
  document.documentElement.style.setProperty('--player-accent', teams.player.color);
  document.documentElement.style.setProperty('--ai-accent', teams.ai.color);
}

/* ---------------------------- Stockage local (paramètres) ----------------- */
// Petite couche d'abstraction volontairement simple : le reste du jeu ne parle
// jamais directement à localStorage, ce qui permettra de la remplacer plus tard
// (stockage applicatif natif) sans toucher au moteur — utile pour une future
// enveloppe Tauri.
// 0.2.1 : stockage en mémoire (session en cours) — l'aperçu hébergé n'autorise
// pas le stockage navigateur. La persistance reviendra via un stockage
// applicatif (version installable) sans toucher au reste du moteur.
