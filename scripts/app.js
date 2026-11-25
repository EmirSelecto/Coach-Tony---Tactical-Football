/* =========================================================================
   INITIALISATION
   ========================================================================= */
document.getElementById('saveMenuBtn').onclick = openSaveMenu;
let activeHudTriggerId = null;
function closeHudPanels(restoreFocus = true){
  ['settingsPanel','trendsPanel'].forEach(id => document.getElementById(id).classList.add('hidden'));
  ['settingsToggle','titleSettingsToggle','titleSettingsBtn'].forEach(id => {
    const trigger = document.getElementById(id);
    if(trigger) trigger.setAttribute('aria-expanded', 'false');
  });
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
document.querySelector('.playbook-toolbar').addEventListener('focusin', event => {
  if(event.target.matches('button')) event.target.scrollIntoView({block:'nearest', inline:'nearest'});
});
document.getElementById('controlsPanel').addEventListener('wheel', scrollPlaybookWithWheel, {passive:false});
document.getElementById('controlsPanel').addEventListener('click', event => {
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
['musicToggle', 'musicToggleToss', 'titleMusicToggle'].forEach(id => {
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

const titleScreen = document.getElementById('title-screen-overlay');
const titleAbout = document.getElementById('titleAboutOverlay');
const titleSettingsPanel = document.getElementById('settingsPanel');
const gameOverlay = document.querySelector('.game-overlay');
const titleLogo = document.querySelector('.title-game-logo');

function prepareLogoCutout(image){
  if(!image.naturalWidth){
    image.classList.add('is-ready');
    return;
  }
  try{
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for(let index = 0; index < pixels.data.length; index += 4){
      const distance = Math.max(
        Math.abs(pixels.data[index] - 9),
        Math.abs(pixels.data[index + 1] - 13),
        Math.abs(pixels.data[index + 2] - 22)
      );
      const alpha = Math.max(0, Math.min(1, (distance - 10) / 20));
      pixels.data[index + 3] = Math.round(pixels.data[index + 3] * alpha);
    }
    context.putImageData(pixels, 0, 0);
    image.src = canvas.toDataURL('image/png');
  } catch(error){
    console.warn('Impossible de détourer automatiquement le logo du menu principal.', error);
  }
  image.classList.add('is-ready');
}

window.prepareLogoCutout = prepareLogoCutout;
if(titleLogo.complete) prepareLogoCutout(titleLogo);
else titleLogo.addEventListener('load', () => prepareLogoCutout(titleLogo), {once:true});

function openTitleSettings(trigger){
  titleScreen.appendChild(titleSettingsPanel);
  titleSettingsPanel.classList.add('title-settings-panel');
  toggleHudPanel('settingsPanel', trigger);
}

function closeTitleAbout(restoreFocus = true){
  titleAbout.classList.add('hidden');
  document.getElementById('titleAboutBtn').setAttribute('aria-expanded', 'false');
  if(restoreFocus) document.getElementById('titleAboutBtn').focus();
}

function openTitleAbout(){
  closeHudPanels(false);
  titleAbout.classList.remove('hidden');
  document.getElementById('titleAboutBtn').setAttribute('aria-expanded', 'true');
  titleAbout.querySelector('[data-close-title-about].title-about-close').focus();
}

function startFromTitle(){
  if(titleScreen.classList.contains('is-leaving')) return;
  closeTitleAbout(false);
  closeHudPanels(false);
  gameOverlay.appendChild(titleSettingsPanel);
  titleSettingsPanel.classList.remove('title-settings-panel');
  titleScreen.classList.add('is-leaving');
  window.setTimeout(() => {
    titleScreen.classList.add('hidden');
    const visibleOverlay = document.querySelector('#choiceOverlay:not(.hidden), #pregameOverlay:not(.hidden)');
    if(visibleOverlay){
      const action = visibleOverlay.querySelector('button');
      if(action) action.focus();
    }
  }, 220);
}

document.getElementById('titlePlayBtn').addEventListener('click', startFromTitle);
document.getElementById('titleSettingsBtn').addEventListener('click', event => openTitleSettings(event.currentTarget));
document.getElementById('titleSettingsToggle').addEventListener('click', event => openTitleSettings(event.currentTarget));
document.getElementById('titleAboutBtn').addEventListener('click', openTitleAbout);
document.querySelectorAll('[data-close-title-about]').forEach(button => {
  button.addEventListener('click', () => closeTitleAbout());
});
document.addEventListener('keydown', event => {
  if(titleScreen.classList.contains('hidden')) return;
  if(event.key === 'Escape' && !titleAbout.classList.contains('hidden')){
    event.preventDefault();
    closeTitleAbout();
    return;
  }
  if(event.key === 'Enter' &&
     titleAbout.classList.contains('hidden') &&
     titleSettingsPanel.classList.contains('hidden') &&
     !event.target.closest('button, input, select, textarea, a')){
    event.preventDefault();
    startFromTitle();
  }
});

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
