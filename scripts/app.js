/* =========================================================================
   INITIALISATION
   ========================================================================= */
document.getElementById('resetBtn').onclick = () => { SaveManager.clear(); newGame(); };
document.getElementById('saveMenuBtn').onclick = openSaveMenu;
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
  AudioManager.enabled = e.target.checked;
  Storage.set('audioEnabled', AudioManager.enabled);
});
document.getElementById('audioVolumeSlider').addEventListener('input', (e)=>{
  const v = parseFloat(e.target.value);
  AudioManager.volume = v;
  Storage.set('audioVolume', v);
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
