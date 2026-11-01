/* =========================================================================
   INITIALISATION
   ========================================================================= */
document.getElementById('saveMenuBtn').onclick = openSaveMenu;
let activeHudTriggerId = null;
function closeHudPanels(restoreFocus = true){
  ['settingsPanel','trendsPanel'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('settingsToggle').setAttribute('aria-expanded', 'false');
  const trendsToggle = document.getElementById('trendsToggle');
  if(trendsToggle) trendsToggle.setAttribute('aria-expanded', 'false');
  const trigger = activeHudTriggerId && document.getElementById(activeHudTriggerId);
  activeHudTriggerId = null;
  if(restoreFocus){
    (trigger || document.getElementById('playPhaseBar')).focus();
  }
}
function toggleHudPanel(id, button){
  const panel = document.getElementById(id);
  const opening = panel.classList.contains('hidden');
  closeHudPanels(false);
  if(opening){
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    activeHudTriggerId = button.id;
    const closeButton = panel.querySelector('[data-close-panel]');
    if(closeButton) closeButton.focus();
  } else {
    button.focus();
  }
}
document.getElementById('settingsToggle').addEventListener('click', event => toggleHudPanel('settingsPanel', event.currentTarget));
document.getElementById('controlsBody').addEventListener('click', event => {
  const button = event.target.closest('#trendsToggle');
  if(button) toggleHudPanel('trendsPanel', button);
});
document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => closeHudPanels()));
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && activeHudTriggerId) closeHudPanels();
});
document.getElementById('restartToggle').addEventListener('click', () => {
  if(window.confirm(t('ui.static.restartConfirm'))){
    closeHudPanels(false);
    SaveManager.clear();
    newGame();
  }
});
// Sauvegarde quand l'onglet passe en arrière-plan ou se ferme (Chrome peut
// décharger un onglet inactif puis le recharger au retour).
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){
    if(game && !game.playLocked) SaveManager.snapshot();
    else SaveManager.flush();
  }
});
window.addEventListener('pagehide', () => {
  if(game && !game.playLocked) SaveManager.snapshot();
  else SaveManager.flush();
});
setInterval(() => { if(game && game.phase === 'playing' && !game.playLocked && !game.gameOver) SaveManager.snapshot(); }, 5000);
document.getElementById('finalReset').onclick = ()=>{ document.getElementById('finalOverlay').classList.add('hidden'); SaveManager.clear(); newGame(); };
document.getElementById('runTestsBtn').onclick = ()=>{ document.getElementById('testLog').textContent = runBalanceTests(); };
document.getElementById('debugToggle').addEventListener('change', (e)=>{
  document.getElementById('debugPanel').open = e.target.checked;
});
document.getElementById('animDebugToggle').addEventListener('change', (e)=>{
  if(game) game.animDebugEnabled = e.target.checked;
  document.getElementById('animDebugPanel').open = e.target.checked;
});
document.getElementById('pregameStartBtn').onclick = ()=>{
  document.getElementById('pregameOverlay').classList.add('hidden');
  startCoinToss();
};
document.getElementById('animSpeedSelect').addEventListener('change', (e)=>{
  const v = parseFloat(e.target.value);
  if(game) game.animSpeed = v;
  Storage.set('animSpeed', v);
});
document.getElementById('skipAnimBtn').onclick = ()=>{
  if(game) game.skipAnimRequested = true;
};
document.getElementById('audioEnabledToggle').addEventListener('change', (e)=>{
  AudioManager.setEffectsEnabled(e.target.checked);
  Storage.set('audioEnabled', AudioManager.enabled);
});
document.getElementById('audioVolumeSlider').addEventListener('input', (e)=>{
  const v = parseFloat(e.target.value);
  AudioManager.setVolume(v);
  Storage.set('audioVolume', v);
});
['musicToggle', 'musicToggleToss'].forEach(id => {
  document.getElementById(id).addEventListener('click', ()=>{
    AudioManager.setMusicEnabled(!AudioManager.musicEnabled);
  });
});
document.getElementById('cardsToggle').addEventListener('change', (e)=>{
  document.getElementById('controlsPanel').classList.toggle('cards-hidden', !e.target.checked);
});
document.getElementById('driveSummaryClose').onclick = ()=>{
  document.getElementById('driveSummaryPanel').classList.add('hidden');
  clearTimeout(window.__driveSummaryTimer);
};

(function boot(){
  const saved = SaveManager.load();
  newGame();
  if(saved){
    document.getElementById('pregameOverlay').classList.add('hidden');
    showResumePrompt(saved);
  }
  updateSaveStatus(saved ? true : null);
  if(saved) SaveManager._lastAt = saved.savedAt;
})();
