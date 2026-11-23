(function(){
  const overlay = document.getElementById('anime-cutin-overlay');
  const stadium = document.getElementById('fieldOuter');
  const logo = overlay.querySelector('.cutin-logo');
  const titleElement = overlay.querySelector('.cutin-title');
  const subtitleElement = overlay.querySelector('.cutin-subtitle');
  const controlsPanel = document.getElementById('controlsPanel');
  const themes = {
    touchdown:{duration:3000, shake:true},
    fieldgoal:{duration:1800, shake:true},
    turnover:{duration:1600, shake:true},
    impact:{duration:1400, shake:true},
    firstdown:{duration:950, shake:false}
  };
  const portraits = new Map();
  const queue = [];
  const completionCallbacks = [];
  let exitTimer, hideTimer, shakeTimer;

  function suppressPlayChoices(suppressed){
    if(!controlsPanel) return;
    if(suppressed) controlsPanel.classList.add('announcement-suppressed');
    else controlsPanel.classList.remove('announcement-suppressed');
  }

  window.setCommentatorExpression = function(expression){
    const portrait = document.querySelector('.commentator-portrait');
    if(!portraits.has(expression)){
      portraits.set(expression, window.TeamArt.getCommentatorCanvas(expression).toDataURL('image/png'));
    }
    if(portrait.src !== portraits.get(expression)) portrait.src = portraits.get(expression);
  };

  window.resetCommentatorForChoice = function(){
    if(!overlay.classList.contains('is-active') &&
       typeof game !== 'undefined' && game && game.phase === 'playing' &&
       !game.gameOver && !game.playLocked && !document.getElementById('controlsPanel').classList.contains('hidden')){
      window.setCommentatorExpression('neutral');
    }
  };

  window.cancelAnimeCutins = function(){
    queue.length = 0;
    completionCallbacks.length = 0;
    clearTimeout(exitTimer);
    clearTimeout(hideTimer);
    clearTimeout(shakeTimer);
    overlay.classList.remove('is-active', 'is-exiting', 'cutin-bigplay', ...Object.keys(themes).map(theme => `cutin-${theme}`));
    stadium.classList.remove('screen-shake');
    suppressPlayChoices(false);
  };

  window.afterAnimeCutins = function(callback){
    if(overlay.classList.contains('is-active')) completionCallbacks.push(callback);
    else callback();
  };

  function displayCutin(cutin){
    const {type, title, subtitle, team, logoUrl, duration, shake, bigPlay, onStart} = cutin;
    suppressPlayChoices(true);
    overlay.classList.remove('is-active', 'is-exiting', 'cutin-bigplay', ...Object.keys(themes).map(theme => `cutin-${theme}`));
    stadium.classList.remove('screen-shake');
    clearTimeout(shakeTimer);
    void overlay.offsetWidth;
    titleElement.textContent = title;
    subtitleElement.textContent = subtitle;
    subtitleElement.hidden = !subtitle;
    logo.src = logoUrl;
    overlay.style.setProperty('--team-primary', team.primary);
    overlay.style.setProperty('--team-secondary', team.secondary);
    overlay.classList.add(`cutin-${type}`, 'is-active');
    if(type === 'fieldgoal') overlay.classList.add('cutin-touchdown');
    if(bigPlay) overlay.classList.add('cutin-bigplay');
    if(onStart) onStart();
    if(shake){
      stadium.classList.add('screen-shake');
      shakeTimer = setTimeout(() => stadium.classList.remove('screen-shake'), 350);
    }
    exitTimer = setTimeout(() => overlay.classList.add('is-exiting'), duration - 200);
    hideTimer = setTimeout(() => {
      overlay.classList.remove('is-active', 'is-exiting');
      if(queue.length) displayCutin(queue.shift());
      else {
        suppressPlayChoices(false);
        window.resetCommentatorForChoice();
        completionCallbacks.splice(0).forEach(callback => callback());
      }
    }, duration);
  }

  window.showAnimeCutin = function(type, title, subtitle, teamName, options = {}){
    if(!Object.prototype.hasOwnProperty.call(themes, type)) throw new Error(`Type de cut-in inconnu : "${type}".`);
    if(typeof title !== 'string' || typeof subtitle !== 'string'){
      throw new TypeError('Le titre et le sous-titre du cut-in doivent être des chaînes.');
    }
    const team = window.TeamArt.getTeamConfig(teamName);
    const logoUrl = window.TeamArt.getTeamLogoCanvas(teamName).toDataURL();
    const duration = options.durationMs === undefined ? themes[type].duration : options.durationMs;
    if(!Number.isFinite(duration) || duration < 200) throw new RangeError('La durée du cut-in doit être au moins de 200 ms.');
    const cutin = {type, title, subtitle, team, logoUrl, duration,
      shake:options.shake === undefined ? themes[type].shake : options.shake,
      bigPlay:options.bigPlay, onStart:options.onStart};
    if(options.queue && overlay.classList.contains('is-active')) queue.push(cutin);
    else {
      if(!options.queue) window.cancelAnimeCutins();
      displayCutin(cutin);
    }
  };
})();
