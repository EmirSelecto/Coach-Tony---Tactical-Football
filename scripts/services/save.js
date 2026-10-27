const Storage = {
  _mem: {},
  _ls: null,
  _checked: false,
  // Détecte une seule fois si le stockage navigateur est utilisable
  // (indisponible en navigation privée stricte ou dans certains aperçus intégrés).
  backend(){
    if(!this._checked){
      this._checked = true;
      try{
        const ls = window.localStorage;
        const k = '__ct_probe__';
        ls.setItem(k, '1'); ls.removeItem(k);
        this._ls = ls;
      } catch(e){ this._ls = null; }
    }
    return this._ls;
  },
  persistent(){ return !!this.backend(); },
  get(key, fallback){
    const ls = this.backend();
    if(ls){
      try{ const raw = ls.getItem('coachTony.' + key); return raw === null ? fallback : JSON.parse(raw); } catch(e){ return fallback; }
    }
    return Object.prototype.hasOwnProperty.call(this._mem, key) ? this._mem[key] : fallback;
  },
  set(key, value){
    const ls = this.backend();
    if(ls){ try{ ls.setItem('coachTony.' + key, JSON.stringify(value)); return true; } catch(e){ /* quota : on retombe en mémoire */ } }
    this._mem[key] = value; return false;
  },
  remove(key){
    const ls = this.backend();
    if(ls){ try{ ls.removeItem('coachTony.' + key); } catch(e){} }
    delete this._mem[key];
  }
};

/* ---- Sauvegarde de la partie (0.5.0) ----
   Instantané complet de l'objet `game` (score, chrono, possession, downs,
   temps morts, drives, historiques utilisés par l'IA, journal...) pris à
   chaque « point stable » : action terminée et animations finies. Une partie
   reprise repart donc de la dernière action terminée. */
const SAVE_KEY = 'savedGame';
const SAVE_FORMAT = 1;
const SaveManager = {
  _last: null,
  _lastAt: null,
  _suspended: false,
  snapshot(){
    if(!game || this._suspended) return;
    if(game.gameOver){ this.clear(); return; }
    if(['pregame','coinToss','flipping','tossResult','deferChoice'].includes(game.phase)) return;
    const g = {...game, playLocked:false, skipAnimRequested:false, lastDebug:null};
    this._last = {format: SAVE_FORMAT, version: GAME_VERSION, savedAt: Date.now(), game: g};
    this.flush();
  },
  flush(){
    if(!this._last) return;
    const ok = Storage.set(SAVE_KEY, this._last);
    this._lastAt = this._last.savedAt;
    updateSaveStatus(ok);
  },
  load(){
    const data = Storage.get(SAVE_KEY, null);
    return this.isValid(data) ? data : null;
  },
  isValid(data){
    return !!(data && data.format === SAVE_FORMAT && data.game && data.game.teams && typeof data.game.scorePlayer === 'number' && !data.game.gameOver);
  },
  clear(){ this._last = null; Storage.remove(SAVE_KEY); updateSaveStatus(null); },
  exportCode(){
    const data = this._last || this.load();
    if(!data) return '';
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  },
  importCode(code){
    try{
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      return this.isValid(data) ? data : null;
    } catch(e){ return null; }
  }
};
function updateSaveStatus(ok){
  const el = document.getElementById('saveStatus');
  if(!el) return;
  if(!Storage.persistent()){
    el.textContent = t('save.status.unavailable');
    el.className = 'save-status warn';
  } else if(ok === null){
    el.textContent = t('save.status.none'); el.className = 'save-status';
  } else if(ok){
    const d = new Date(SaveManager._lastAt || Date.now());
    el.textContent = t('save.status.savedAt', {time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`});
    el.className = 'save-status ok';
  } else {
    el.textContent = t('save.status.full'); el.className = 'save-status warn';
  }
}
function saveSummary(data){
  const g = data.game;
  const per = g.quarter >= 5 ? t('ui.status.overtime') : t('ui.status.quarterShort', {quarter:g.quarter});
  const m = Math.floor(g.clock/60), sec = String(g.clock%60).padStart(2,'0');
  const d = new Date(data.savedAt);
  return `<b>${g.teams.player.name}</b> ${g.scorePlayer} – ${g.scoreAI} <b>${g.teams.ai.name}</b><br>${t('save.summary', {
    period:per,
    minutes:m,
    seconds:sec,
    date:d.toLocaleDateString('fr-FR'),
    time:d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})
  })}`;
}
// Reconstruit l'affichage complet à partir d'un instantané.
function restoreGame(data){
  PlayAnimationController.cancelCurrent();
  clearTempPlayers();
  formationDots = { offense: [], defense: [] };
  game = data.game;
  ensureOffensivePlayTotals(game);
  game.playLocked = false;
  game.skipAnimRequested = false;
  game.animSpeed = Storage.get('animSpeed', game.animSpeed || BALANCE.animation.defaultSpeed);
  ['pregameOverlay','tossOverlay','finalOverlay','driveSummaryPanel'].forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
  hideChoice();
  document.getElementById('eventBannerLayer').innerHTML = '';
  document.getElementById('celebrationLayer').innerHTML = '';
  buildFieldMarkings();
  applyTeamColorsToCSS(game.teams);
  applyTeamNamesToUI(game.teams);
  document.getElementById('animSpeedSelect').value = String(game.animSpeed);
  document.getElementById('versionTag').textContent = 'v' + GAME_VERSION;
  renderMatchLog();
  // Les enchaînements en attente (transformation, kickoff, mi-temps...) sont rejoués.
  const pendingFlow = game.pendingConversion || game.pendingKickoff || game.pendingHalftime || game.pendingRegulationEnd || game.pendingGameEnd || game.pendingOvertime;
  game.phase = 'playing';
  if(!pendingFlow){ game.visualBallX = game.fieldPosition; game.visualFirstDownX = computeFirstDownTargetX(game.fieldPosition, game.possession, game.distance); }
  setResult(t('game.results.partieReprise'), t('game.match.resumeAt', {
    period:game.quarter >= 5 ? `la ${t('ui.status.overtime')}` : t('ui.status.quarterShort', {quarter:game.quarter}),
    clock:fmtClock(game.clock),
    player:game.teams.player.name,
    playerScore:game.scorePlayer,
    aiScore:game.scoreAI,
    ai:game.teams.ai.name
  }), '');
  render();
  SaveManager._last = data;
  if(pendingFlow) afterPlayResolved();
  else { maybeHandleAISpecial(); }
}
function showResumePrompt(data){
  showChoice(t('game.match.resumeGameTitle'), `${t('game.match.resumeFound')}<br><br>${saveSummary(data)}`, [
    {label:t('game.match.resume'), primary:true, onClick: () => { hideChoice(); restoreGame(data); }},
    {label:t('ui.static.newGame'), onClick: () => { hideChoice(); SaveManager.clear(); newGame(); }}
  ]);
}
function openSaveMenu(){
  const code = SaveManager.exportCode();
  const persist = Storage.persistent();
  const body = `${t(persist ? 'save.storageAvailable' : 'save.storageUnavailable')}
    <br><br><b>${t('save.exportTitle')}</b> ${t('save.exportHint')}<textarea class="save-code" id="saveExportCode" readonly>${code || t('save.empty')}</textarea>
    <br><b>${t('save.importTitle')}</b> :<textarea class="save-code" id="saveImportCode" placeholder="${t('save.importPlaceholder')}"></textarea>
    <div id="saveImportMsg" style="color:#f2d27a;font-size:0.8rem;margin-top:4px;"></div>`;
  showChoice(t('save.menuTitle'), body, [
    {label:t('save.copy'), primary:true, onClick: () => {
      const ta = document.getElementById('saveExportCode'); ta.select();
      try{ navigator.clipboard.writeText(ta.value); } catch(e){ try{ document.execCommand('copy'); } catch(_){} }
      document.getElementById('saveImportMsg').textContent = t('save.copied');
    }},
    {label:t('save.load'), onClick: () => {
      const data = SaveManager.importCode(document.getElementById('saveImportCode').value || '');
      if(!data){ document.getElementById('saveImportMsg').textContent = t('save.invalidCode'); return; }
      hideChoice(); restoreGame(data); SaveManager.flush();
    }},
    {label:t('save.close'), onClick: hideChoice}
  ]);
}

/* ---------------------------- Playbook offensif -------------------------- */
const OFFENSE_PLAYS = [
  {name:'Inside Zone',      type:'run',  depth:'short',  directions:['middle']},
  {name:'Power Run',        type:'run',  depth:'short',  directions:['middle']},
  {name:'Dive',             type:'run',  depth:'short',  directions:['middle']},
  {name:'QB Sneak',         type:'run',  depth:'short',  directions:['middle']},
  {name:'Outside Zone',     type:'run',  depth:'medium', directions:['left','right']},
  {name:'Sweep',            type:'run',  depth:'medium', directions:['left','right']},
  {name:'Toss',             type:'run',  depth:'medium', directions:['left','right']},
  {name:'Counter Run',      type:'run',  depth:'medium', directions:['left','right']},
  {name:'QB Keeper',        type:'run',  depth:'medium', directions:['left','middle','right']},
  {name:'Read Option',      type:'run',  depth:'medium', directions:['left','middle','right']},
  {name:'Quick Slant',      type:'pass', depth:'short',  directions:['middle']},
  {name:'Screen Pass',      type:'pass', depth:'short',  directions:['left','middle','right']},
  {name:'Hitch / Curl',     type:'pass', depth:'short',  directions:['left','middle','right']},
  {name:'Out Route',        type:'pass', depth:'short',  directions:['left','right']},
  {name:'Crossing Route',   type:'pass', depth:'medium', directions:['middle']},
  {name:'Mesh Concept',     type:'pass', depth:'medium', directions:['middle']},
  {name:'Flood Concept',    type:'pass', depth:'medium', directions:['left','right']},
  {name:'Play Action',      type:'pass', depth:'medium', directions:['middle']},
  {name:'Deep Post',        type:'pass', depth:'deep',   directions:['middle']},
  {name:'Four Verticals',   type:'pass', depth:'deep',   directions:['left','middle','right']},
];

const ALL_OFFENSE_VARIANTS = [];
OFFENSE_PLAYS.forEach(p=>{
  p.directions.forEach(d=>{
    ALL_OFFENSE_VARIANTS.push({ name:p.name, type:p.type, depth:p.depth, direction:d });
  });
});

/* ---------------------------- Playbook défensif --------------------------- */
const DEFENSE_PLAYS = [
  {name:'Eight-Man Box',      type:'runDefense',  vsRun:0.90, vsPass:-0.30, target:'middle'},
  {name:'Bear Front',         type:'runDefense',  vsRun:0.85, vsPass:-0.25, target:'middle'},
  {name:'Inside Run Blitz',   type:'runDefense',  vsRun:0.80, vsPass:-0.35, target:'middle'},
  {name:'Edge Contain',       type:'runDefense',  vsRun:0.70, vsPass:-0.10, target:'outside'},
  {name:'Outside Run Stop',   type:'runDefense',  vsRun:0.75, vsPass:-0.15, target:'outside'},
  {name:'Press Coverage',     type:'passDefense', vsPass:0.70, vsRun:-0.20, target:'short'},
  {name:'Cover 1',            type:'passDefense', vsPass:0.65, vsRun:-0.10, target:'short'},
  {name:'Nickel Blitz',       type:'passDefense', vsPass:0.60, vsRun:0.10,  target:'short'},
  {name:'Cover 3',            type:'passDefense', vsPass:0.75, vsRun:-0.30, target:'deep'},
  {name:'Cover 4',            type:'passDefense', vsPass:0.80, vsRun:-0.35, target:'deep'},
  {name:'Dime Defense',       type:'passDefense', vsPass:0.85, vsRun:-0.40, target:'deep'},
  {name:'Prevent Defense',    type:'passDefense', vsPass:0.60, vsRun:-0.20, target:'deep'},
  {name:'Goal-Line Defense',  type:'runDefense',  vsRun:0.90, vsPass:-0.40, target:'middle'},
  {name:'Base 4-3',           type:'balanced',    vsRun:0.40, vsPass:0.40,  target:'mixed'},
  {name:'Base 3-4',           type:'balanced',    vsRun:0.40, vsPass:0.40,  target:'mixed'},
];
