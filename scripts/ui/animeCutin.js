(function(){
  const overlay = document.getElementById('anime-cutin-overlay');
  const stadium = document.getElementById('fieldOuter');
  const logo = overlay.querySelector('.cutin-logo');
  const titleElement = overlay.querySelector('.cutin-title');
  const subtitleElement = overlay.querySelector('.cutin-subtitle');
  const themes = {
    touchdown:{duration:1800, shake:true},
    fieldgoal:{duration:1800, shake:true},
    turnover:{duration:1600, shake:true},
    impact:{duration:1400, shake:true},
    firstdown:{duration:950, shake:false}
  };
  const portraits = new Map();
  const queue = [];
  let exitTimer, hideTimer, shakeTimer;

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
    clearTimeout(exitTimer);
    clearTimeout(hideTimer);
    clearTimeout(shakeTimer);
    overlay.classList.remove('is-active', 'is-exiting', ...Object.keys(themes).map(theme => `cutin-${theme}`));
    stadium.classList.remove('screen-shake');
  };

  function displayCutin(cutin){
    const {type, title, subtitle, team, logoUrl, duration, shake, onStart} = cutin;
    overlay.classList.remove('is-active', 'is-exiting', ...Object.keys(themes).map(theme => `cutin-${theme}`));
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
    if(onStart) onStart();
    if(shake){
      stadium.classList.add('screen-shake');
      shakeTimer = setTimeout(() => stadium.classList.remove('screen-shake'), 350);
    }
    exitTimer = setTimeout(() => overlay.classList.add('is-exiting'), duration - 200);
    hideTimer = setTimeout(() => {
      overlay.classList.remove('is-active', 'is-exiting');
      if(queue.length) displayCutin(queue.shift());
      else window.resetCommentatorForChoice();
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
      shake:options.shake === undefined ? themes[type].shake : options.shake, onStart:options.onStart};
    if(options.queue && overlay.classList.contains('is-active')) queue.push(cutin);
    else {
      if(!options.queue) window.cancelAnimeCutins();
      displayCutin(cutin);
    }
  };
})();
